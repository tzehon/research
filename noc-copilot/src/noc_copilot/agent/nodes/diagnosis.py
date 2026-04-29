"""Diagnosis phase: reason over evidence and either commit or loop back.

Two terminal tools: `propose_diagnosis` (commit a structured diagnosis
with calibrated confidence) or `request_more_evidence` (signal retrieval
to run again with a refined query). The agent picks one based on how
strong the gathered evidence is.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from noc_copilot.agent.llm import get_chat_model
from noc_copilot.agent.nodes._phase import (
    phase_event,
    render_alarm,
    render_correlated,
    render_element,
    render_incidents,
    render_maintenance,
    render_runbooks,
)
from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.tools import make_diagnosis_tools

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are the DIAGNOSIS agent. You have access to all the operational context that triage gathered, plus the top similar incidents and runbook sections that retrieval found. Reason over them and pick one of two actions:

1. `propose_diagnosis(...)` — commit to a probable root cause with a calibrated confidence score. Required when the evidence supports a clear hypothesis.
2. `request_more_evidence(refined_query, hypotheses, reason)` — bail out if the evidence is insufficient. The retrieval agent will run again with your refined query.

CONFIDENCE CALIBRATION (be honest, this drives auto-remediation):
- 0.9–1.0: a similar past incident is a near-exact match AND recent maintenance or correlated alarms corroborate the hypothesis.
- 0.7–0.9: strong similarity but some contextual uncertainty.
- 0.5–0.7: moderate evidence, multiple plausible causes — call `request_more_evidence` if you can think of a sharper query.
- <0.5: insufficient — call `request_more_evidence`.

REASONING:
- Cite specific incidents (by id), specific maintenance entries, specific KPI deltas as supporting evidence. Vague evidence calibrates confidence down.
- Always include 1–3 differential diagnoses with why each is less likely.

Call exactly ONE tool, then stop."""


def make_diagnosis_node():
    """Build the diagnosis node. Has no external resource dependencies."""
    tools = make_diagnosis_tools()
    model = get_chat_model()
    sub_agent = create_react_agent(
        model,
        tools=tools,
        state_schema=NOCAgentState,
    )

    async def diagnosis_node(state: NOCAgentState) -> dict:
        alarm = state["alarm"]
        retries_so_far = state.get("diagnosis_retries", 0) or 0

        ctx = "\n\n".join([
            f"<alarm>\n{render_alarm(alarm)}\n</alarm>",
            f"<network_element>\n{render_element(state.get('network_element'))}\n</network_element>",
            f"<recent_maintenance>\n{render_maintenance(state.get('recent_maintenance', []))}\n</recent_maintenance>",
            f"<correlated_alarms>\n{render_correlated(state.get('correlated_alarms', []))}\n</correlated_alarms>",
            f"<similar_past_incidents>\n{render_incidents(state.get('similar_incidents', []))}\n</similar_past_incidents>",
            f"<relevant_runbooks>\n{render_runbooks(state.get('relevant_runbooks', []))}\n</relevant_runbooks>",
        ])

        if retries_so_far > 0:
            ctx += (
                f"\n\n<retry_context>\n"
                f"  This is diagnosis retry #{retries_so_far}. The previous attempt was low-confidence "
                f"and retrieval has just produced fresh results. If evidence still isn't strong enough, "
                f"commit to your best guess at the appropriate confidence level rather than looping again.\n"
                f"</retry_context>"
            )

        user_msg = ctx + "\n\nReason over the evidence and call exactly one tool."

        inner_input: NOCAgentState = {
            "messages": [SystemMessage(SYSTEM_PROMPT), HumanMessage(user_msg)],
            "alarm": alarm,
            "diagnosis": None,
            "confidence": 0.0,
            "next_phase": None,
            "retrieval_query": state.get("retrieval_query", ""),
            "tool_calls": [],
        }

        result = await sub_agent.ainvoke(inner_input)
        new_tool_calls = result.get("tool_calls", []) or []
        diagnosis = result.get("diagnosis")
        confidence = result.get("confidence", 0.0) or 0.0
        next_phase = result.get("next_phase")

        logger.info(
            "Diagnosis agent finished: confidence=%.2f, next_phase=%s",
            confidence, next_phase,
        )

        return {
            "diagnosis": diagnosis,
            "confidence": confidence,
            "next_phase": next_phase,
            # If the agent asked for more evidence, surface its refined query
            "retrieval_query": result.get("retrieval_query", state.get("retrieval_query", "")),
            "tool_calls": new_tool_calls,
            "phase_log": [phase_event(
                "diagnosis",
                "completed",
                detail=(f"confidence={confidence:.2f}" if diagnosis
                        else f"requested more evidence (next={next_phase})"),
                iteration=retries_so_far + 1,
            )],
        }

    return diagnosis_node
