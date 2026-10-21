import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("review_runner", HERE / "run.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
from report import render, validate

CLEAN = {"complete": True, "summary": "Static review finished", "findings": [], "limitations": []}
FINDING = {"priority": "P1", "title": "Handle zero", "explanation": "Zero causes a division error.",
           "path": "app.py", "side": "new", "start_line": 2, "end_line": 2}


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        (self.repo / "app.py").write_text("def divide(n):\n    return 10 / n if n else 0\n")
        self.base = self.commit("base")
        (self.repo / "app.py").write_text("def divide(n):\n    return 10 / n\n")
        self.head = self.commit("bug")
        self.args = argparse.Namespace(repo=self.repo, base_sha=self.base, head_sha=self.head,
            output_dir=self.root / "out", model="", timeout=5, codex=str(self.root / "codex"))

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], stderr=subprocess.DEVNULL).decode().strip()

    def commit(self, message):
        self.git("add", ".")
        self.git("commit", "-qm", message)
        return self.git("rev-parse", "HEAD")

    def fake(self, result=None, mode="ok"):
        result = copy.deepcopy(CLEAN if result is None else result)
        script = f'''#!{sys.executable}
import json, os, pathlib, subprocess, sys, time
if '--version' in sys.argv:
    assert 'CODEX_API_KEY' not in os.environ
    print('codex-cli 0.163.0')
    sys.exit(0)
args = sys.argv[1:]
prompt = sys.stdin.read()
pathlib.Path({str(self.root / 'capture.json')!r}).write_text(json.dumps({{
    'args': args, 'env_names': list(os.environ), 'home': os.environ['HOME'], 'prompt': prompt}}))
mode = {mode!r}
if mode == 'timeout':
    time.sleep(30)
if mode == 'failure':
    print(os.environ['CODEX_API_KEY'], file=sys.stderr)
    sys.exit(7)
if mode == 'mutation':
    pathlib.Path({str(self.repo / 'app.py')!r}).write_text('changed')
print(json.dumps({{'type': 'turn.completed', 'usage': {{'input_tokens': 12, 'output_tokens': 7}}}}))
if mode == 'failed_event':
    print(json.dumps({{'type': 'turn.failed'}}))
if mode != 'missing':
    output = pathlib.Path(args[args.index('--output-last-message') + 1])
    output.write_text('{{bad json' if mode == 'invalid_json' else {json.dumps(result)!r})
'''
        Path(self.args.codex).write_text(script)
        Path(self.args.codex).chmod(0o700)

    def run_review(self, key="test-secret-never-publish"):
        with patch.dict(os.environ, {"CODEX_API_KEY": key, "GH_TOKEN": "should-not-inherit",
                                     "OPENAI_BASE_URL": "https://invalid.example"}):
            rc = runner.run(self.args)
        data = json.loads((self.args.output_dir / "review.json").read_text())
        md = (self.args.output_dir / "review.md").read_text()
        self.assertNotIn("test-secret-never-publish", json.dumps(data) + md)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.head)
        return rc, data, md

    def test_clean_and_invocation_isolation(self):
        self.fake()
        rc, data, md = self.run_review()
        self.assertEqual(rc, 0)
        self.assertIn("No actionable findings", md)
        self.assertEqual(data["metadata"]["usage"], {"input_tokens": 12, "output_tokens": 7})
        capture = json.loads((self.root / "capture.json").read_text())
        self.assertEqual(capture["args"][:3], ["--ask-for-approval", "never", "exec"])
        self.assertIn("read-only", capture["args"])
        self.assertIn("--output-schema", capture["args"])
        self.assertIn("--ephemeral", capture["args"])
        self.assertIn('shell_environment_policy.ignore_default_excludes=false', capture["args"])
        self.assertIn('"*KEY*"="exclude"', " ".join(capture["args"]))
        self.assertNotIn("GH_TOKEN", capture["env_names"])
        self.assertNotIn("OPENAI_BASE_URL", capture["env_names"])
        self.assertFalse(Path(capture["home"]).exists())
        self.assertEqual(sorted(p.name for p in self.args.output_dir.iterdir()), ["review.json", "review.md"])
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_findings_are_advisory_and_model_forwarded(self):
        self.args.model = "example-model"
        self.fake({**CLEAN, "findings": [FINDING]})
        rc, data, md = self.run_review()
        self.assertEqual(rc, 0)
        self.assertEqual(data["findings"], [FINDING])
        self.assertIn("P1", md)
        self.assertIn("example-model", json.loads((self.root / "capture.json").read_text())["args"])

    def test_merge_base_excludes_base_only_changes(self):
        self.git("checkout", "--detach", self.base)
        (self.repo / "base-only").write_text("base advanced")
        self.args.base_sha = self.commit("base advanced")
        self.git("checkout", "--detach", self.head)
        self.fake()
        _, data, _ = self.run_review()
        self.assertEqual(data["metadata"]["merge_base_sha"], self.base)
        self.assertNotIn("base-only", json.loads((self.root / "capture.json").read_text())["prompt"])

    def test_renamed_deleted_and_unusual_paths(self):
        self.git("mv", "app.py", "renamed space.py")
        (self.repo / "delete-me.py").write_text("gone soon\n")
        renamed = self.commit("rename")
        changed = runner.changes(self.repo, self.head, renamed)
        self.assertIn({"status": "R100", "old": "app.py", "new": "renamed space.py"}, changed)
        self.args.base_sha = renamed
        (self.repo / "delete-me.py").unlink()
        self.head = self.args.head_sha = self.commit("delete")
        finding = {**FINDING, "path": "delete-me.py", "side": "old", "start_line": 1, "end_line": 1}
        self.fake({**CLEAN, "findings": [finding]})
        self.assertEqual(self.run_review()[0], 0)

    def test_failures_never_look_clean_or_leak_stderr(self):
        for mode in ["failure", "missing", "invalid_json", "failed_event"]:
            with self.subTest(mode=mode):
                self.fake(mode=mode)
                rc, data, md = self.run_review()
                self.assertEqual(rc, 1)
                self.assertEqual(data["status"], "incomplete")
                self.assertNotIn("No actionable findings", md)

    def test_timeout(self):
        self.fake(mode="timeout")
        self.args.timeout = 0.1
        started = time.monotonic()
        rc, data, _ = self.run_review()
        self.assertEqual(rc, 1)
        self.assertIn("timed out", data["error"])
        self.assertLess(time.monotonic() - started, 3)

    def test_model_incomplete(self):
        self.fake({**CLEAN, "complete": False, "limitations": ["Could not inspect binaries"]})
        rc, data, md = self.run_review()
        self.assertEqual(rc, 1)
        self.assertIn("incomplete", md)
        self.assertEqual(len(data["limitations"]), 1)

    def test_missing_key(self):
        self.fake()
        rc, data, _ = self.run_review(key="")
        self.assertEqual(rc, 1)
        self.assertIn("CODEX_API_KEY", data["error"])
        self.assertFalse((self.root / "capture.json").exists())

    def test_credential_echo_suppressed(self):
        self.fake({**CLEAN, "summary": "test-secret-never-publish"})
        rc, data, _ = self.run_review()
        self.assertEqual(rc, 1)
        self.assertIn("suppressed", data["error"])

    def test_checkout_mutation_detected(self):
        self.fake(mode="mutation")
        rc, data, _ = self.run_review()
        self.assertEqual(rc, 1)
        self.assertEqual(data["error"], "Checkout changed during review")

    def test_wrong_head_dirty_checkout_and_output_inside_repo(self):
        self.fake()
        self.args.head_sha = self.base
        with patch.dict(os.environ, {"CODEX_API_KEY": "test"}):
            self.assertEqual(runner.run(self.args), 1)
        self.args.head_sha = self.head
        (self.repo / "untracked").write_text("local change")
        self.assertEqual(self.run_review()[0], 1)
        self.args.output_dir = self.repo / "reports"
        with self.assertRaises(ValueError):
            runner.run(self.args)

    def test_invalid_schema_and_locations(self):
        bad_results = [
            {**CLEAN, "unexpected": True},
            {**CLEAN, "complete": "true"},
            {**CLEAN, "findings": [{**FINDING, "path": "../outside"}]},
            {**CLEAN, "findings": [{**FINDING, "path": "unchanged.py"}]},
            {**CLEAN, "findings": [{**FINDING, "end_line": 999}]},
            {**CLEAN, "findings": [{**FINDING, "start_line": True}]},
            {**CLEAN, "findings": [{**FINDING, "end_line": 1}]},
        ]
        for result in bad_results:
            with self.subTest(result=result):
                self.fake(result)
                self.assertEqual(self.run_review()[0], 1)

    def test_render_disables_mentions_and_html(self):
        self.fake({**CLEAN, "summary": "@everyone <script> ![image](https://evil.invalid)"})
        _, _, md = self.run_review()
        self.assertNotIn("@everyone", md)
        self.assertNotIn("<script>", md)
        self.assertNotIn("![image]", md)

    def test_schema_required_fields(self):
        schema = json.loads((HERE / "schema.json").read_text())
        validate(CLEAN, schema)
        for field in CLEAN:
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate({k: v for k, v in CLEAN.items() if k != field}, schema)


if __name__ == "__main__":
    unittest.main()
