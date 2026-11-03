"""Temporarily install Codex gateway config with recoverable, three-way restoration."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import tomllib
from urllib.parse import urlencode, urlparse
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"
PROVIDER = "railway-auth0-lab"
MANAGED = ("model", "model_provider", "model_catalog_json", "web_search")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def split_managed(text):
    owned, remaining = [], []
    top = True
    for line in text.splitlines(keepends=True):
        if line.lstrip().startswith("["):
            top = False
        destination = owned if top and re.match(r"\s*(model|model_provider|model_catalog_json|web_search)\s*=", line) else remaining
        destination.append(line)
    return owned, remaining


def codex_home():
    return Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))


def prepare_catalog(config):
    """Keep full cached metadata, exposing only the configured gateway allowlist."""
    allowed = config.get("models")
    if (not isinstance(allowed, list) or not allowed
            or any(not isinstance(slug, str) or not slug for slug in allowed)
            or len(set(allowed)) != len(allowed) or config.get("defaultModel") not in allowed):
        raise ValueError("models must be unique model IDs and include defaultModel")
    source = codex_home() / "models_cache.json"
    try:
        cache = json.loads(source.read_text())
        models = cache["models"]
        if not isinstance(models, list) or not isinstance(cache.get("client_version"), str):
            raise ValueError()
        entries = {}
        for model in models:
            slug = model["slug"]
            if not isinstance(slug, str) or slug in entries:
                raise ValueError()
            entries[slug] = model
    except (OSError, ValueError, KeyError, TypeError):
        raise ValueError(f"Cannot read a valid Codex model cache at {source}. "
                         "Open Codex with your normal login to refresh its models, quit, and retry.") from None
    selected = []
    for slug in [config["defaultModel"], *(s for s in allowed if s != config["defaultModel"])]:
        if slug not in entries or entries[slug].get("supported_in_api") is not True:
            raise ValueError(f"No API-supported catalog entry for {slug}. Refresh models with your normal "
                             "Codex login before switching; active config is unchanged.")
        model = deepcopy(entries[slug])
        model.update(visibility="list", priority=len(selected), upgrade=None)
        selected.append(model)
    # Strip cache identity/ETag fields, but preserve every model capability/instruction.
    content = (json.dumps({"models": selected}, indent=2) + "\n").encode()
    # A preview or later install must not overwrite a catalog used by a running client.
    path = LOCAL.resolve() / f"gateway-models-{digest(content)}.json"
    return path, content


def render(config, original="", *, legacy=False, fresh_login=False, catalog_path=None):
    parsed = tomllib.loads(original)
    if parsed.get("profile"):
        raise ValueError("An active Codex profile may override the lab settings; merge the generated config into that profile manually")
    if PROVIDER in parsed.get("model_providers", {}):
        raise ValueError("Lab provider already exists; restore the earlier installation first")
    gateway = urlparse(config["gatewayUrl"])
    if gateway.scheme != "https" or not gateway.netloc or gateway.username or gateway.password or gateway.query or gateway.fragment or gateway.path not in ("", "/"):
        raise ValueError("gatewayUrl must be an HTTPS origin")
    # Only rewrite simple top-level assignments; semantic checks below catch
    # unsupported TOML layouts before anything is installed.
    _, remaining = split_managed(original)
    quote = json.dumps  # JSON basic strings are valid for these TOML string values.
    auth_params = {"audience": config["audience"], "connection": config["projectName"] + "-users"}
    if fresh_login:
        # Codex keys saved grants by the full authorization URL. A public per-install
        # marker selects an unused grant without deleting any existing credentials.
        # prompt=login separately prevents Auth0 from silently reusing its session.
        auth_params.update(prompt="login", codex_demo_run=uuid4().hex)
    auth_url = f'https://{config["auth0Domain"]}/authorize?' + urlencode(auth_params)
    text = f'''model = {quote(config["defaultModel"])}
model_provider = "{PROVIDER}"
web_search = "disabled"
''' + (f"model_catalog_json = {quote(str(catalog_path))}\n" if catalog_path else "") + "".join(remaining) + f'''

[model_providers.{PROVIDER}]
name = "Railway Auth0 Lab"
base_url = {quote(config["gatewayUrl"].rstrip("/") + "/v1")}
wire_api = "responses"
{"requires_openai_auth = false" + chr(10) if legacy else ""}supports_websockets = false

[model_providers.{PROVIDER}.gateway_oauth]
authorization_url = {quote(auth_url)}
token_url = {quote(f'https://{config["auth0Domain"]}/oauth/token')}
client_id = {quote(config["oauthClientId"])}
scopes = ["openid", "profile", "offline_access", {quote(config["scope"])}]
redirect_port = {int(config["redirectPort"])}
# Omit delivery to send the OAuth access token as Authorization: Bearer <token>.
'''
    result = tomllib.loads(text)
    if result.get("model_provider") != PROVIDER:
        raise ValueError("Unable to safely merge top-level settings")
    expected = deepcopy(parsed)
    for key in MANAGED:
        expected.pop(key, None)
    actual = deepcopy(result)
    for key in MANAGED:
        actual.pop(key, None)
    providers = actual.get("model_providers", {})
    providers.pop(PROVIDER, None)
    if not providers and "model_providers" not in expected:
        actual.pop("model_providers", None)
    if actual != expected:
        raise ValueError("Unable to preserve unrelated settings; active config is unchanged")
    return text.encode()


def private_write(path, data):
    fd, name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    temp = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def read_target(target):
    if target.is_symlink():
        raise ValueError("Codex config is a symlink; refusing to replace it")
    return target.read_bytes() if target.exists() else b""


def parsed(data):
    return tomllib.loads(data.decode())


def restore_merge(current, installed, original):
    """Reverse our patch, then verify that only the settings we own changed."""
    now, base, before = map(parsed, (current, installed, original))
    expected = deepcopy(now)
    for key in MANAGED:
        if now.get(key) != base.get(key) and now.get(key) != before.get(key):
            raise ValueError(f"The lab-managed {key} setting was edited")
        if key in before:
            expected[key] = before[key]
        else:
            expected.pop(key, None)
    providers = expected.get("model_providers", {})
    if providers.get(PROVIDER) != base.get("model_providers", {}).get(PROVIDER):
        raise ValueError("The lab provider block was edited")
    providers.pop(PROVIDER, None)
    if not providers and "model_providers" not in before:
        expected.pop("model_providers", None)
    # Handle our exact generated block separately so later appended projects or
    # comments do not become Git deletion conflicts. Verify the entire result.
    marker = f"[model_providers.{PROVIDER}]".encode()
    start = installed.find(marker)
    block = installed[start:] if start >= 0 else b""
    if block and current.count(block) == 1:
        without_provider = current.replace(block, b"", 1).decode()
        original_owned, _ = split_managed(original.decode())
        _, current_rest = split_managed(without_provider)
        candidate = ("".join(original_owned) + "".join(current_rest)).encode()
        try:
            if parsed(candidate) == expected:
                return candidate
        except ValueError:
            pass
    # For reformatted blocks, attempt a conventional three-way reverse merge.
    with tempfile.TemporaryDirectory(prefix="codex-restore-") as directory:
        paths = [Path(directory) / name for name in ("current", "installed", "original")]
        for path, content in zip(paths, (current, installed, original)):
            private_write(path, content)
        result = subprocess.run(["git", "merge-file", "-p", *map(str, paths)], capture_output=True)
    if result.returncode != 0:
        raise ValueError("Later edits overlap the lab settings")
    if parsed(result.stdout) != expected:
        raise ValueError("Cannot verify that all unrelated settings are preserved")
    return result.stdout


def archive_recovery(data, original, installed, current, target_exists):
    directory = LOCAL / "recovery"
    directory.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-")
    archive = Path(tempfile.mkdtemp(prefix=stamp, dir=directory))
    for name, content in (("before.toml", original), ("current.toml", current),
                          ("journal.json", json.dumps(data, indent=2).encode())):
        private_write(archive / name, content)
    if installed is not None:
        private_write(archive / "installed.toml", installed)
    private_write(archive / "current-state.json", json.dumps({"existed": target_exists}).encode())
    return archive


def installed_snapshot(data, original):
    snapshot = LOCAL / "codex-config.installed.toml"
    if snapshot.exists():
        content = snapshot.read_bytes()
    else:
        # Upgrade old journals only if a reconstruction matches their recorded hash.
        config = json.loads((LOCAL / "config.json").read_text())
        content = render(config, original.decode(), legacy=True)
    if digest(content) != data["installed_sha256"]:
        raise ValueError("Installed snapshot does not match the recorded installation")
    return content


def restore(use_original=False):
    journal = LOCAL / "codex-backup.json"
    if not journal.exists():
        print("No active lab installation backup; Codex config was left unchanged.")
        return
    data = json.loads(journal.read_text())
    backup = LOCAL / "codex-config.before.toml"
    original = backup.read_bytes()
    if digest(original) != data["original_sha256"]:
        raise ValueError("Backup changed; refusing to restore it. Recovery copies remain in .local/recovery.")
    parsed(original)  # Never install an invalid backup, including with --original.
    target = Path(data["target"])
    existed = target.exists()
    current = read_target(target)
    installed = None
    conflict = None
    if current == original or digest(current) == data["installed_sha256"] or use_original:
        restored = original
    else:
        try:
            installed = installed_snapshot(data, original)
            restored = restore_merge(current, installed, original)
        except (ValueError, OSError, UnicodeError) as error:
            # Do not print TOML parser errors: they may contain private config values.
            conflict = type(error).__name__
    # Preserve every version before changing the active config or closing the journal.
    snapshot = LOCAL / "codex-config.installed.toml"
    if installed is None and snapshot.exists():
        installed = snapshot.read_bytes()
    archive = archive_recovery(data, original, installed, current, existed)
    if conflict:
        raise ValueError(f"Automatic restore could not safely merge later edits. Current config is unchanged. "
                         f"Recovery copies: {archive}. To return to the original setup, run "
                         "python3 scripts/codex-config.py restore --original. This saves the current file "
                         "before restoring the original; later edits remain in that recovery copy.")
    if read_target(target) != current or target.exists() != existed:
        raise ValueError("Codex config changed during restore; quit Codex and retry. Recovery copies are preserved.")
    # If a new config gained unrelated settings during the lab, retain those settings.
    remove = not data["existed"] and not restored
    if remove and existed:
        target.unlink()
    elif not remove and (not existed or current != restored):
        target.parent.mkdir(parents=True, exist_ok=True)
        private_write(target, restored)
    journal.unlink()
    backup.unlink()
    (LOCAL / "codex-config.installed.toml").unlink(missing_ok=True)
    print(f"Restored normal Codex settings. Recovery copies: {archive}")
    if use_original and current != original:
        print("Restored the original file; later edits are preserved in current.toml in that recovery directory.")
    print("Fully quit and reopen Codex if it was running with the lab provider.")


def install(config, *, fresh_login=True):
    journal = LOCAL / "codex-backup.json"
    if journal.exists():
        raise ValueError("A lab config backup already exists; run codex-restore first")
    target = codex_home() / "config.toml"
    existed = target.exists()
    original = read_target(target)
    catalog_path, catalog = prepare_catalog(config)
    merged = render(config, original.decode(), fresh_login=fresh_login, catalog_path=catalog_path)
    private_write(catalog_path, catalog)
    target.parent.mkdir(parents=True, exist_ok=True)
    private_write(LOCAL / "codex-config.before.toml", original)
    private_write(LOCAL / "codex-config.installed.toml", merged)
    private_write(journal, json.dumps({"version": 2, "target": str(target), "existed": existed,
        "original_sha256": digest(original), "installed_sha256": digest(merged)}).encode())
    if read_target(target) != original or target.exists() != existed:
        raise ValueError("Codex config changed during install; quit Codex and run codex-restore before retrying")
    private_write(target, merged)
    print(f"Installed lab provider in {target}. Fully quit and reopen Codex, then follow gateway sign-in.")
    print("Gateway picker models: " + ", ".join(config["models"]))
    if fresh_login:
        print("Fresh demo sign-in: an unused gateway grant and Auth0 prompt=login; existing credentials are retained.")
    else:
        print("Session reuse enabled: Codex/Auth0 may skip browser login when an existing grant/session is usable.")
    print("Recovery from Terminal: python3 scripts/codex-config.py restore")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("render", "install", "restore"))
    parser.add_argument("--original", action="store_true", help="Save the current file and restore the exact original backup")
    parser.add_argument("--reuse-login", action="store_true",
                        help="Reuse the stable OAuth configuration instead of requesting fresh demo sign-in")
    args = parser.parse_args()
    if args.original and args.action != "restore":
        parser.error("--original is only supported with restore")
    if args.reuse_login and args.action == "restore":
        parser.error("--reuse-login is only supported with render or install")
    LOCAL.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (LOCAL / "codex-config.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.action == "restore":
            restore(args.original)  # Independent of config.json, npm, .env, Auth0, and Railway.
        else:
            config = json.loads((LOCAL / "config.json").read_text())
            if args.action == "render":
                catalog_path, catalog = prepare_catalog(config)
                preview = render(config, fresh_login=not args.reuse_login, catalog_path=catalog_path)
                private_write(catalog_path, catalog)
                private_write(LOCAL / "codex.config.toml", preview)
                print("Generated .local/codex.config.toml; your active Codex config is unchanged.")
            else:
                install(config, fresh_login=not args.reuse_login)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(str(error))
