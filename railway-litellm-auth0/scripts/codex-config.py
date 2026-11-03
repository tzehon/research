"""Generate, temporarily install, and exactly restore Codex config. No auth.json edits."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tomllib
from urllib.parse import urlencode, urlparse

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".local"
PROVIDER = "railway-auth0-lab"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def render(config, original=""):
    parsed = tomllib.loads(original)
    if parsed.get("profile"):
        raise ValueError("An active Codex profile may override the lab settings; merge the generated config into that profile manually")
    if PROVIDER in parsed.get("model_providers", {}):
        raise ValueError("Lab provider already exists; restore the earlier installation first")
    gateway = urlparse(config["gatewayUrl"])
    if gateway.scheme != "https" or not gateway.netloc or gateway.username or gateway.password or gateway.query or gateway.fragment or gateway.path not in ("", "/"):
        raise ValueError("gatewayUrl must be an HTTPS origin")
    # Preserve the original content/comments except the four effective top-level settings.
    lines = original.splitlines(keepends=True)
    top = True
    remaining = []
    for line in lines:
        if line.lstrip().startswith("["):
            top = False
        if top and re.match(r"\s*(model|model_provider|model_catalog_json|web_search)\s*=", line):
            continue
        remaining.append(line)
    quote = json.dumps  # JSON basic strings are valid for these TOML string values.
    auth_url = f'https://{config["auth0Domain"]}/authorize?' + urlencode({
        "audience": config["audience"], "connection": config["projectName"] + "-users"})
    text = f'''model = {quote(config["defaultModel"])}
model_provider = "{PROVIDER}"
web_search = "disabled"
''' + "".join(remaining) + f'''

[model_providers.{PROVIDER}]
name = "Railway Auth0 Lab"
base_url = {quote(config["gatewayUrl"].rstrip("/") + "/v1")}
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false

[model_providers.{PROVIDER}.gateway_oauth]
authorization_url = {quote(auth_url)}
token_url = {quote(f'https://{config["auth0Domain"]}/oauth/token')}
client_id = {quote(config["oauthClientId"])}
scopes = ["openid", "profile", "offline_access", {quote(config["scope"])}]
redirect_port = {int(config["redirectPort"])}
delivery = {{ kind = "header", name = "X-Gateway-Token", scheme = "Bearer" }}
'''
    result = tomllib.loads(text)
    if result.get("model_provider") != PROVIDER:
        raise ValueError("Unable to safely merge top-level settings")
    return text.encode()


def private_write(path, data):
    temp = path.with_name(path.name + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
    os.replace(temp, path)


def main():
    action = sys.argv[1]
    config = json.loads((LOCAL / "config.json").read_text())
    target = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))) / "config.toml"
    journal = LOCAL / "codex-backup.json"
    backup = LOCAL / "codex-config.before.toml"
    if action == "render":
        private_write(LOCAL / "codex.config.toml", render(config))
        print("Generated .local/codex.config.toml; your active Codex config is unchanged.")
    elif action == "install":
        if journal.exists():
            raise ValueError("A lab config backup already exists; restore it first")
        if target.is_symlink():
            raise ValueError("Config is a symlink; merge the generated provider manually")
        existed = target.exists()
        original = target.read_bytes() if existed else b""
        merged = render(config, original.decode())
        target.parent.mkdir(parents=True, exist_ok=True)
        private_write(backup, original)
        private_write(journal, json.dumps({"target": str(target), "existed": existed,
            "original_sha256": digest(original), "installed_sha256": digest(merged)}).encode())
        private_write(target, merged)
        print(f"Installed lab provider in {target}. Fully quit and reopen Codex, then follow gateway sign-in.")
    elif action == "restore":
        data = json.loads(journal.read_text())
        target = Path(data["target"])
        current = target.read_bytes() if target.exists() else b""
        original = backup.read_bytes()
        if digest(original) != data["original_sha256"]:
            raise ValueError("Backup changed; refusing to restore it")
        if digest(current) not in (data["installed_sha256"], data["original_sha256"]):
            raise ValueError("Codex config changed after installation; merge the backup manually to preserve your edits")
        if data["existed"]:
            private_write(target, original)
        elif target.exists():
            target.unlink()
        journal.unlink()
        backup.unlink()
        print("Restored the exact original Codex config. Fully quit and reopen Codex.")
    else:
        raise ValueError("Expected render, install, or restore")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(str(error))
