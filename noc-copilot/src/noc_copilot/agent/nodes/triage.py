"""Triage phase: a ReAct sub-agent that decides what context to gather.

Hardcoded triage queries are easy to read but blind to alarm shape — a
link-down alarm wants topology context, a power alarm wants neighbour
status, a performance alarm wants KPI history. Here the LLM picks tools
per alarm. It stops when it believes it has enough context to hand off
to retrieval.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.llm import get_chat_model
from noc_copilot.agent.nodes._phase import phase_event, render_alarm
from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.tools import make_triage_tools

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are the TRIAGE agent in a 5-step Network Operations Center pipeline.

Your job: enrich the alarm with just enough operational context for the next agent (retrieval) to find similar past incidents and runbooks. You have a toolbelt of read-only MongoDB queries against the operational data — pick the ones that fit THIS alarm.

PROTOCOL:
1. ALWAYS call `lookup_network_element` first.
2. Then choose the next investigations based on the alarm category and symptoms:
   - radio + recent symptoms → check_recent_maintenance, check_recent_config_changes, query_kpi_history
   - transport / link-down → check_topology_neighbors, find_correlated_alarms
   - power / hardware → find_correlated_alarms (site-wide impact)
   - core / signalling → find_correlated_alarms, query_kpi_history
   - performance degradation (gradual) → query_kpi_history, check_recent_config_changes
3. Stop calling tools once you have a coherent operational picture. Aim for 2–4 tool calls — not exhaustive, just sufficient.
4. End your turn with a one-paragraph summary of what you found.

Be efficient. Do not call every tool — call the ones whose answer changes how retrieval should search."""


def make_triage_node(db: AsyncIOMotorDatabase):
    """Build the triage node, bound to a database connection."""
    tools = make_triage_tools(db)
    model = get_chat_model()
    sub_agent = create_react_agent(
        model,
        tools=tools,
        state_schema=NOCAgentState,
    )

    async def triage_node(state: NOCAgentState) -> dict:
        alarm = state["alarm"]

        user_msg = (
            f"<alarm>\n{render_alarm(alarm)}\n</alarm>\n\n"
            f"Investigate this alarm. Pick tools, gather context, summarise."
        )

        inner_input: NOCAgentState = {
            "messages": [SystemMessage(SYSTEM_PROMPT), HumanMessage(user_msg)],
            "alarm": alarm,
            "network_element": None,
            "recent_maintenance": [],
            "correlated_alarms": [],
            "topology_neighbors": [],
            "kpi_history": {},
            "config_changes": [],
            "tool_calls": [],
        }

        result = await sub_agent.ainvoke(inner_input)

        new_tool_calls = result.get("tool_calls", []) or []
        logger.info(
            "Triage agent finished: %d tool call(s), element=%s",
            len(new_tool_calls),
            (result.get("network_element") or {}).get("element_id"),
        )

        return {
            "network_element": result.get("network_element"),
            "recent_maintenance": result.get("recent_maintenance") or [],
            "correlated_alarms": result.get("correlated_alarms") or [],
            "topology_neighbors": result.get("topology_neighbors") or [],
            "kpi_history": result.get("kpi_history") or {},
            "config_changes": result.get("config_changes") or [],
            "tool_calls": new_tool_calls,
            "phase_log": [phase_event("triage", "completed",
                                      detail=f"{len(new_tool_calls)} tool calls")],
        }

    return triage_node
