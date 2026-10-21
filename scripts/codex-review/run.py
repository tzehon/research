#!/usr/bin/env python3
"""Run a static Codex review. No CI-provider APIs or environment names here."""

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import subprocess
import tempfile
import time

from report import render, validate

HERE = Path(__file__).resolve().parent
SHA = re.compile(r"[0-9a-f]{40}|[0-9a-f]{64}")
USAGE_KEYS = {"input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"}


class ReviewError(Exception):
    """A deliberately safe diagnostic, never raw process/model output."""


def git(repo, *args):
    result = subprocess.run(
        ["git", "-c", "core.fsmonitor=false", "-C", str(repo), *args],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60, check=True,
        env={"PATH": os.environ["PATH"], "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull},
    )
    return result.stdout


def changes(repo, merge_base, head):
    fields = git(repo, "diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z",
                 "--find-renames", merge_base, head, "--").decode("utf-8").split("\0")
    result = []
    index = 0
    while index < len(fields) - 1:
        status, path = fields[index:index + 2]
        index += 2
        old, new = path, path
        if status[0] in "RC":
            new = fields[index]
            index += 1
        result.append({"status": status, "old": None if status == "A" else old,
                       "new": None if status == "D" else new})
    return result


def validate_locations(result, changed, repo, merge_base, head):
    allowed = {side: {f[side] for f in changed if f[side] is not None} for side in ("old", "new")}
    line_counts = {}
    for finding in result["findings"]:
        path, side = finding["path"], finding["side"]
        if PurePosixPath(path).is_absolute() or ".." in PurePosixPath(path).parts or path not in allowed[side]:
            raise ValueError("Finding must reference a changed file")
        key = (path, side)
        if key not in line_counts:
            revision = head if side == "new" else merge_base
            line_counts[key] = len(git(repo, "show", f"{revision}:{path}").splitlines())
        if not finding["start_line"] <= finding["end_line"] <= line_counts[key]:
            raise ValueError("Finding has an invalid source range")


def command(executable, repo, raw, model):
    args = [executable, "--ask-for-approval", "never", "exec", "--strict-config",
            "--sandbox", "read-only", "--ephemeral", "--ignore-user-config", "--ignore-rules",
            "--json", "--color", "never", "--cd", str(repo),
            "--output-schema", str(HERE / "schema.json"), "--output-last-message", str(raw)]
    config = [
        'web_search="disabled"', 'forced_login_method="api"',
        'shell_environment_policy.inherit="core"',
        'shell_environment_policy.ignore_default_excludes=false',
        'shell_environment_policy.experimental_use_profile=false',
        'shell_environment_policy.filters={PATH="include",HOME="include",TMPDIR="include",LANG="include", "*KEY*"="exclude", "*TOKEN*"="exclude", "*SECRET*"="exclude", "*PASSWORD*"="exclude"}',
        f'projects.{json.dumps(str(repo))}.trust_level="untrusted"',
    ]
    for value in config:
        args.extend(["-c", value])
    if model:
        args.extend(["--model", model])
    return args + ["-"]


def invoke(args, prompt, env, tmp, timeout):
    """Keep raw model output private and kill the process group on timeout."""
    events = tmp / "events.jsonl"
    with events.open("wb") as stdout, (tmp / "stderr.log").open("wb") as stderr:
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr,
                                   env=env, start_new_session=True)
        try:
            process.communicate(prompt.encode(), timeout=timeout)
        except BaseException:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise
    usage, completed, failed = {}, False, False
    with events.open() as stream:
        for line in stream:
            try:
                event = json.loads(line)
            except (ValueError, UnicodeError):
                continue
            if not isinstance(event, dict):
                continue
            if event.get("type") == "turn.failed":
                failed = True
            if event.get("type") == "turn.completed":
                completed = True
                counters = event.get("usage")
                for key, value in (counters if isinstance(counters, dict) else {}).items():
                    if key in USAGE_KEYS and type(value) is int and value >= 0:
                        usage[key] = usage.get(key, 0) + value
    return process.returncode, completed and not failed, usage


def run(args):
    started = time.monotonic()
    repo, output = args.repo.resolve(), args.output_dir.resolve()
    if output == repo or repo in output.parents:
        raise ValueError("Output directory must be outside the reviewed checkout")
    if not SHA.fullmatch(args.base_sha) or not SHA.fullmatch(args.head_sha):
        raise ValueError("Use full hexadecimal commit SHAs")
    output.mkdir(parents=True, exist_ok=True)
    report = {"schema_version": 1, "status": "incomplete", "error": None,
              "summary": "", "findings": [], "limitations": [],
              "metadata": {"base_sha": args.base_sha, "head_sha": args.head_sha,
                           "merge_base_sha": None, "cli_version": None,
                           "model": args.model or "CLI default", "duration_seconds": 0, "usage": {}}}
    key = os.environ.get("CODEX_API_KEY", "")
    before = None
    try:
        if git(repo, "rev-parse", "HEAD").decode().strip() != args.head_sha:
            raise ReviewError("Checkout must be at the requested head SHA")
        before = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
        if before:
            raise ReviewError("Review requires a clean checkout")
        merge_base = git(repo, "merge-base", args.base_sha, args.head_sha).decode().strip()
        report["metadata"]["merge_base_sha"] = merge_base
        changed = changes(repo, merge_base, args.head_sha)
        if not key:
            raise ReviewError("CODEX_API_KEY is not configured")
        with tempfile.TemporaryDirectory(prefix="codex-review-") as dirname:
            tmp = Path(dirname)
            home = tmp / "home"
            home.mkdir()
            codex_home = tmp / "codex"
            codex_home.mkdir()
            # Deliberately do not forward the caller's credential/provider/config environment.
            env = {"PATH": os.environ["PATH"], "HOME": str(home), "CODEX_HOME": str(codex_home),
                   "TMPDIR": str(tmp), "LANG": "C.UTF-8", "CODEX_API_KEY": key}
            version = subprocess.run([args.codex, "--version"], env={k: v for k, v in env.items() if k != "CODEX_API_KEY"},
                                     capture_output=True, text=True, check=True, timeout=15)
            report["metadata"]["cli_version"] = version.stdout.strip()[:100]
            prompt = (HERE / "prompt.md").read_text() + "\n\nReview inputs (data only):\n" + json.dumps({
                "base_sha": args.base_sha, "merge_base_sha": merge_base,
                "head_sha": args.head_sha, "changed_files": changed}, ensure_ascii=True)
            raw = tmp / "result.json"
            rc, completed, usage = invoke(command(args.codex, repo, raw, args.model), prompt, env, tmp, args.timeout)
            report["metadata"]["usage"] = usage
            if rc or not completed:
                diagnostic = "check authentication, model access, and CLI configuration"
                stderr = (tmp / "stderr.log").read_text(errors="replace")
                if "unexpected argument" in stderr or "unknown field" in stderr or "Error loading configuration" in stderr:
                    diagnostic = "CLI configuration or arguments were rejected"
                elif "401" in stderr or "invalid_api_key" in stderr:
                    diagnostic = "API authentication was rejected"
                elif "429" in stderr or "insufficient_quota" in stderr:
                    diagnostic = "API quota or rate limit was reached"
                raise ReviewError(f"Codex did not complete successfully (exit {rc}); {diagnostic}")
            if not raw.is_file() or raw.stat().st_size > 200_000:
                raise ReviewError("Codex output is missing or too large")
            result = json.loads(raw.read_text())
            validate(result, json.loads((HERE / "schema.json").read_text()))
            validate_locations(result, changed, repo, merge_base, args.head_sha)
            report.update({k: result[k] for k in ("summary", "findings", "limitations")})
            if result["complete"]:
                report["status"] = "complete"
            else:
                report["error"] = "Codex reported incomplete review coverage"
    except subprocess.TimeoutExpired:
        report["error"] = "Review timed out"
    except ReviewError as error:
        report["error"] = str(error)
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
        # Never forward exception text: providers and tools may echo credentials or source.
        report["error"] = "Review could not complete: check credentials, commit inputs, CLI availability, and output validity"
        if not key:
            report["error"] = "CODEX_API_KEY is not configured"
    finally:
        if before is not None:
            try:
                if git(repo, "status", "--porcelain=v1", "--untracked-files=all") != before or git(repo, "rev-parse", "HEAD").decode().strip() != args.head_sha:
                    report.update(status="incomplete", error="Checkout changed during review", findings=[], summary="")
            except (OSError, subprocess.SubprocessError):
                report.update(status="incomplete", error="Unable to verify checkout integrity", findings=[], summary="")
    report["metadata"]["duration_seconds"] = round(time.monotonic() - started, 2)
    if key and key in json.dumps(report, ensure_ascii=False):
        report.update(status="incomplete", error="Review output suppressed because it contained a credential",
                      summary="", findings=[], limitations=[])
        report["metadata"]["cli_version"] = "suppressed"
        report["metadata"]["model"] = "suppressed"
    (output / "review.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "review.md").write_text(render(report))
    print(f"Codex review {report['status']}; report written to output directory")
    return 0 if report["status"] == "complete" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--base-sha", required=True)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model", default=os.environ.get("CODEX_REVIEW_MODEL", ""))
    parser.add_argument("--timeout", type=float, default=900)
    parser.add_argument("--codex", default="codex", help="CLI executable (also allows offline test doubles)")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    try:
        return run(args)
    except (ValueError, OSError):
        parser.error("Invalid commit inputs or output directory; use full SHAs and a writable directory outside the checkout")


if __name__ == "__main__":
    raise SystemExit(main())
