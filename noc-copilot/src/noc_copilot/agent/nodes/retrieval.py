"""Retrieval phase: search → evaluate → maybe refine → search again.

The agent runs hybrid search via MongoDB `$rankFusion`, judges the
quality of its own results with `evaluate_retrieval_quality`, and
decides whether to reformulate and try again. The phase exits when the
agent stops calling tools.

`retrieval_attempts` increments on each call to evaluate, so the outer
graph can also short-circuit re-entry from a diagnosis loop-back after
N attempts.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.llm import get_chat_model
from noc_copilot.agent.nodes._phase import (
    phase_event,
    render_alarm,
    render_correlated,
    render_element,
    render_maintenance,
)
from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.tools import make_retrieval_tools
from noc_copilot.embeddings.voyage import VoyageEmbedder

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are the RETRIEVAL agent. Your job: find the most relevant past incidents and runbook sections for the current alarm.

You have access to MongoDB hybrid search via `$rankFusion`, which combines vector similarity (Voyage AI `voyage-4-large`, 1024 dims) and full-text search server-side. Use:

- `search_similar_incidents(query, category)` for past incidents
- `search_runbooks(query, domain)` for procedures
- `evaluate_retrieval_quality()` to judge whether your results are good enough

PROTOCOL:
1. First search: write a focused query using the alarm symptoms and any operational context already gathered (recent maintenance, KPI patterns). Use the alarm category as the filter.
2. Search runbooks too (same domain filter).
3. Call `evaluate_retrieval_quality()`. If verdict is "good", stop and summarise.
4. If verdict is "poor" AND attempts < 2, reformulate: try different keywords, drop the category filter to surface cross-domain matches, or add hypothesised mechanisms. Search again.
5. After 2 attempts, stop regardless and summarise — diagnosis can still proceed with imperfect retrieval.

Stop calling tools when you have enough. End with a one-paragraph summary."""


def make_retrieval_node(db: AsyncIOMotorDatabase, embedder: VoyageEmbedder):
    """Build the retrieval node, bound to a database and embedder."""
    tools = make_retrieval_tools(db, embedder)
    model = get_chat_model()
    sub_agent = create_react_agent(
        model,
        tools=tools,
        state_schema=NOCAgentState,
    )

    async def retrieval_node(state: NOCAgentState) -> dict:
        alarm = state["alarm"]
        attempts_so_far = state.get("retrieval_attempts", 0) or 0
        prior_query = state.get("retrieval_query")

        # Build context-rich prompt — diagnosis loop-back includes refined query and prior diagnosis hypotheses
        ctx_lines = [
            f"<alarm>\n{render_alarm(alarm)}\n</alarm>",
            f"<network_element>\n{render_element(state.get('network_element'))}\n</network_element>",
            f"<recent_maintenance>\n{render_maintenance(state.get('recent_maintenance', []))}\n</recent_maintenance>",
            f"<correlated_alarms>\n{render_correlated(state.get('correlated_alarms', []))}\n</correlated_alarms>",
        ]

        diagnosis_hint = state.get("diagnosis")
        if diagnosis_hint and diagnosis_hint.get("differential_diagnoses"):
            differentials = "; ".join(
                d.get("cause", "") for d in (diagnosis_hint.get("differential_diagnoses") or [])
            )
            ctx_lines.append(
                f"<previous_diagnosis_hints>\n"
                f"  Last diagnosis was low-confidence: {diagnosis_hint.get('probable_root_cause')!r} "
                f"(confidence={state.get('confidence', 0):.2f})\n"
                f"  Differentials to investigate: {differentials}\n"
                f"  Use these as hypotheses to refine your search query.\n"
                f"</previous_diagnosis_hints>"
            )

        if prior_query and attempts_so_far > 0:
            ctx_lines.append(
                f"<previous_attempts>\n"
                f"  Attempts already made: {attempts_so_far}.\n"
                f"  Last query: {prior_query!r}.\n"
                f"  Pick a meaningfully different angle this time.\n"
                f"</previous_attempts>"
            )

        user_msg = "\n\n".join(ctx_lines) + "\n\nFind relevant incidents and runbooks. Evaluate quality. Refine if needed."

        inner_input: NOCAgentState = {
            "messages": [SystemMessage(SYSTEM_PROMPT), HumanMessage(user_msg)],
            "alarm": alarm,
            "similar_incidents": [],
            "relevant_runbooks": [],
            "retrieval_query": "",
            "retrieval_attempts": 0,
            "tool_calls": [],
        }

        result = await sub_agent.ainvoke(inner_input)
        new_tool_calls = result.get("tool_calls", []) or []
        attempts_this_phase = result.get("retrieval_attempts", 0) or 0

        logger.info(
            "Retrieval agent finished: %d tool call(s), %d evaluation(s), top_inc_score=%.3f",
            len(new_tool_calls),
            attempts_this_phase,
            (result.get("similar_incidents") or [{}])[0].get("score", 0.0)
            if result.get("similar_incidents") else 0.0,
        )

        return {
            "similar_incidents": result.get("similar_incidents") or [],
            "relevant_runbooks": result.get("relevant_runbooks") or [],
            "retrieval_query": result.get("retrieval_query", ""),
            # Outer counter accumulates across re-entries
            "retrieval_attempts": attempts_so_far + attempts_this_phase,
            "tool_calls": new_tool_calls,
            "phase_log": [phase_event(
                "retrieval",
                "completed",
                detail=f"{len(new_tool_calls)} tool calls, {attempts_this_phase} evaluation(s)",
                iteration=attempts_so_far + 1,
            )],
        }

    return retrieval_node
