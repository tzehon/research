"""Shared helpers for phase nodes.

Each phase node:
1. Builds a phase-scoped prompt that summarises what the agent has
   learned so far.
2. Invokes its own ReAct sub-agent with isolated `messages` and
   `tool_calls` (so phases don't contaminate each other's reasoning
   history).
3. Returns only the new state deltas to the outer graph.
"""

from __future__ import annotations

import json
from typing import Any


def render_alarm(alarm: dict) -> str:
    return (
        f"alarm_id={alarm.get('alarm_id')}, severity={alarm.get('severity')}, "
        f"category={alarm.get('category')}, source={alarm.get('source')}, "
        f"region={alarm.get('region')}\n"
        f"description: {alarm.get('description', '')}\n"
        f"metrics: {json.dumps(alarm.get('metrics', {}))}"
    )


def render_element(element: dict | None) -> str:
    if not element:
        return "  (not yet looked up)"
    return (
        f"  element_id: {element.get('element_id')}\n"
        f"  type/vendor/model: {element.get('type')} / {element.get('vendor')} / {element.get('model')}\n"
        f"  site: {element.get('site_name')} ({element.get('site_id')}, {element.get('region')})\n"
        f"  status: {element.get('status')}, sectors: {element.get('sectors')}"
    )


def render_maintenance(entries: list[dict]) -> str:
    if not entries:
        return "  (none)"
    return "\n".join(
        f"  • {e.get('date')}: {e.get('action')} (by {e.get('engineer', 'unknown')})"
        for e in entries
    )


def render_correlated(alarms: list[dict]) -> str:
    if not alarms:
        return "  (none)"
    return "\n".join(
        f"  • [{a.get('severity')}] {a.get('source')}: {a.get('description', '')[:120]}"
        for a in alarms[:5]
    )


def render_incidents(incidents: list[dict]) -> str:
    if not incidents:
        return "  (none retrieved)"
    return "\n\n".join(
        f"  --- score={i.get('score', 0):.3f}, id={i.get('incident_id')}\n"
        f"  title: {i.get('title')}\n"
        f"  root_cause: {i.get('root_cause')}\n"
        f"  resolution: {i.get('resolution')}"
        for i in incidents[:3]
    )


def render_runbooks(runbooks: list[dict]) -> str:
    if not runbooks:
        return "  (none retrieved)"
    return "\n\n".join(
        f"  --- score={r.get('score', 0):.3f}\n"
        f"  {r.get('title')} / {r.get('section_title')}\n"
        f"  content: {(r.get('content') or '')[:400]}"
        for r in runbooks[:3]
    )


def phase_event(phase: str, event: str, detail: str = "", iteration: int = 1) -> dict[str, Any]:
    return {
        "phase": phase,
        "event": event,
        "detail": detail,
        "iteration": iteration,
    }
