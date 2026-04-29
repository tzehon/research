"""Shared helpers for tool implementations.

The tools all follow the same shape: do work, return a `Command` that
updates outer state and emits a `ToolMessage` for the inner ReAct loop.
This module centralises the boilerplate.
"""

from __future__ import annotations

import time
from typing import Any

from langchain_core.messages import ToolMessage
from langgraph.types import Command


def make_tool_command(
    *,
    phase: str,
    tool_name: str,
    args: dict,
    state_update: dict[str, Any],
    summary: str,
    tool_call_id: str,
    started_at: float,
    iteration: int = 1,
) -> Command:
    """Build a Command that:

    - Applies `state_update` to outer agent state.
    - Appends one ToolCall record to `tool_calls` for UI rendering.
    - Emits a ToolMessage with `summary` so the LLM sees a digest.

    Pass the result `time.perf_counter()` from before the tool ran via
    `started_at` to record the latency.
    """
    latency_ms = int((time.perf_counter() - started_at) * 1000)

    tool_call_record = {
        "phase": phase,
        "tool": tool_name,
        "args": args,
        "result_summary": summary,
        "latency_ms": latency_ms,
        "iteration": iteration,
    }

    update = dict(state_update)
    update["tool_calls"] = [tool_call_record]
    update["messages"] = [ToolMessage(content=summary, tool_call_id=tool_call_id)]

    return Command(update=update)


def truncate(text: str, n: int = 200) -> str:
    """Truncate a string for human-readable summaries."""
    if not text:
        return ""
    text = str(text)
    return text if len(text) <= n else text[: n - 1] + "…"
