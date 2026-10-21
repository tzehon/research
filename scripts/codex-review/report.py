"""Validation and portable Markdown rendering (standard library only)."""

import html
import re


def validate(value, schema):
    """Validate the deliberately small JSON Schema subset used by schema.json."""
    kinds = {"object": dict, "array": list, "string": str, "integer": int, "boolean": bool}
    if type(value) is not kinds[schema["type"]]:
        raise ValueError("Invalid result type")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError("Invalid enum value")
    if isinstance(value, dict):
        props = schema["properties"]
        if set(value) - set(props) or set(schema["required"]) - set(value):
            raise ValueError("Invalid result fields")
        for key, child in value.items():
            validate(child, props[key])
    elif isinstance(value, list):
        if len(value) > schema.get("maxItems", len(value)):
            raise ValueError("Too many result items")
        for child in value:
            validate(child, schema["items"])
    elif isinstance(value, str):
        if not schema.get("minLength", 0) <= len(value) <= schema.get("maxLength", len(value)):
            raise ValueError("Invalid text length")
        if any(ord(c) < 32 and c not in "\n\t" for c in value):
            raise ValueError("Control characters in result")
    elif type(value) is int and value < schema.get("minimum", value):
        raise ValueError("Invalid line number")


def text(value):
    """Render model text literally; disable mentions, HTML, links, and images."""
    value = html.escape(str(value), quote=False).replace("@", "@\u200b")
    return re.sub(r"([\\`*_{}\[\]()#+.!|>~-])", r"\\\1", value).replace("\n", " ")


def render(report):
    meta = report["metadata"]
    heading = "Codex review" if report["status"] == "complete" else "Codex review incomplete"
    lines = [f"## {heading}", "", f"Reviewed commit: `{meta['head_sha']}`",
             f"Merge base: `{meta['merge_base_sha'] or 'unavailable'}`", "",
             "Advisory static review; tests were not run.", ""]
    if report["error"]:
        lines.extend([text(report["error"]), ""])
    if report["summary"]:
        lines.extend([text(report["summary"]), ""])
    if report["status"] == "complete" and not report["findings"]:
        lines.extend(["No actionable findings were reported.", ""])
    for finding in sorted(report["findings"], key=lambda f: f["priority"]):
        location = f"{finding['path']}:{finding['start_line']}-{finding['end_line']} ({finding['side']})"
        lines.extend([f"### {finding['priority']}: {text(finding['title'])}", "",
                      text(location), "", text(finding["explanation"]), ""])
    if report["limitations"]:
        lines.extend(["### Coverage limitations", ""])
        lines.extend(f"- {text(item)}" for item in report["limitations"])
        lines.append("")
    lines.append(f"CLI: {text(meta['cli_version'] or 'unavailable')} · Duration: {meta['duration_seconds']}s")
    if meta["usage"]:
        lines.append("Token usage: " + ", ".join(f"{key}={value}" for key, value in sorted(meta["usage"].items())))
    return "\n".join(lines) + "\n"
