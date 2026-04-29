"""Remediation phase: closed loop — check preconditions → act → verify.

The agent decides between three terminal outcomes:

- **auto_remediate**: high confidence + safe action + preconditions met →
  call `execute_remediation_step` then `verify_alarm_cleared`.
- **recommend_for_approval**: medium confidence or unsafe action →
  recommend the action but require a human to approve.
- **escalate**: low confidence, novel symptom, or risky preconditions →
  hand off to a human with a suggested investigation direction.
"""

from __future__ import annotations

import logging
from datetime import datetime

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.llm import get_chat_model
from noc_copilot.agent.nodes._phase import (
    phase_event,
    render_alarm,
    render_element,
    render_incidents,
    render_runbooks,
)
from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.tools import make_remediation_tools
from noc_copilot.db.collections import DIAGNOSES

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are the REMEDIATION agent. You have a diagnosis with a confidence score and a set of similar past resolutions. Your job: pick exactly one of three terminal actions.

PRECONDITIONS (always run before deciding):
- `estimate_blast_radius(element_id)` — what services share this site?
- `check_maintenance_window(element_id)` — is the element already in maintenance?
- `verify_backup_exists(element_id)` — can we revert if needed?

DECISION RULES:
- AUTO-REMEDIATE only if ALL of:
  - confidence ≥ 0.9
  - action matches one of: revert RET angle, revert config parameter, revert firmware, restart service, clear alarm
  - blast_radius risk ∈ {low, medium}
  - maintenance_window_ok = True
  - backup_verified = True
  Then: call `execute_remediation_step` followed by `verify_alarm_cleared`. Stop.

- RECOMMEND FOR APPROVAL when confidence is 0.7–0.9, OR when the action is correct but outside the safe auto-list (e.g. hardware swap, vendor escalation). Use `recommend_for_approval(action, rationale)`. Stop.

- ESCALATE when confidence < 0.7, or when blast radius is high, or when no clear safe action applies. Use `escalate(reason, suggested_direction)`. Stop.

ACTION ADAPTATION:
- Read the past resolutions of the top similar incidents. Adapt them to the current element (correct element_id, sector number, parameter values).
- Be specific. "Revert RET angle on gNB-SG-C01 Sector 2 from 8 to 4 degrees" not "fix the antenna".

Always run the three precondition tools first. Then commit to one terminal action."""


def make_remediation_node(db: AsyncIOMotorDatabase):
    """Build the remediation node, bound to a database connection."""
    tools = make_remediation_tools(db)
    model = get_chat_model()
    sub_agent = create_react_agent(
        model,
        tools=tools,
        state_schema=NOCAgentState,
    )

    async def remediation_node(state: NOCAgentState) -> dict:
        alarm = state["alarm"]
        diagnosis = state.get("diagnosis") or {}
        confidence = state.get("confidence", 0.0) or 0.0
        retries_so_far = state.get("remediation_retries", 0) or 0

        ctx = "\n\n".join([
            f"<alarm>\n{render_alarm(alarm)}\n</alarm>",
            f"<network_element>\n{render_element(state.get('network_element'))}\n</network_element>",
            f"<diagnosis>\n"
            f"  probable_root_cause: {diagnosis.get('probable_root_cause', 'N/A')}\n"
            f"  confidence: {confidence:.2f}\n"
            f"  reasoning: {diagnosis.get('reasoning', 'N/A')}\n"
            f"</diagnosis>",
            f"<top_similar_incidents>\n{render_incidents(state.get('similar_incidents', []))}\n</top_similar_incidents>",
            f"<top_runbooks>\n{render_runbooks(state.get('relevant_runbooks', []))}\n</top_runbooks>",
        ])

        if retries_so_far > 0:
            ctx += (
                f"\n\n<retry_context>\n"
                f"  Remediation retry #{retries_so_far} after a verification failure. "
                f"Re-evaluate whether to escalate.\n"
                f"</retry_context>"
            )

        user_msg = ctx + "\n\nRun preconditions, then commit to exactly one terminal action."

        inner_input: NOCAgentState = {
            "messages": [SystemMessage(SYSTEM_PROMPT), HumanMessage(user_msg)],
            "alarm": alarm,
            "network_element": state.get("network_element"),
            "diagnosis": diagnosis,
            "confidence": confidence,
            "blast_radius": None,
            "maintenance_window_ok": None,
            "backup_verified": None,
            "execution_result": None,
            "verification_result": None,
            "recommended_action": None,
            "final_status": None,
            "tool_calls": [],
        }

        result = await sub_agent.ainvoke(inner_input)
        new_tool_calls = result.get("tool_calls", []) or []
        final_status = result.get("final_status")

        # Build a human-readable evidence chain and persist diagnosis to MongoDB.
        evidence_chain = _build_evidence_chain(state, diagnosis, confidence, result)

        try:
            await db[DIAGNOSES].insert_one({
                "alarm_id": alarm.get("alarm_id"),
                "alarm": alarm,
                "network_element_id": (state.get("network_element") or {}).get("element_id"),
                "diagnosis": diagnosis,
                "confidence": confidence,
                "recommended_action": result.get("recommended_action"),
                "final_status": final_status,
                "blast_radius": result.get("blast_radius"),
                "execution_result": result.get("execution_result"),
                "verification_result": result.get("verification_result"),
                "evidence_chain": evidence_chain,
                "tool_call_count": len(state.get("tool_calls", []) or []) + len(new_tool_calls),
                "created_at": datetime.utcnow(),
            })
        except Exception as e:
            logger.warning("Failed to persist diagnosis: %s", e)

        # auto_remediable for backward-compat with old UI checks
        auto_remediable = final_status == "auto_remediated"

        logger.info(
            "Remediation agent finished: status=%s, %d tool call(s)",
            final_status, len(new_tool_calls),
        )

        return {
            "blast_radius": result.get("blast_radius"),
            "maintenance_window_ok": result.get("maintenance_window_ok"),
            "backup_verified": result.get("backup_verified"),
            "execution_result": result.get("execution_result"),
            "verification_result": result.get("verification_result"),
            "recommended_action": result.get("recommended_action"),
            "final_status": final_status,
            "auto_remediable": auto_remediable,
            "tool_calls": new_tool_calls,
            "evidence_chain": evidence_chain,
            "phase_log": [phase_event(
                "remediation",
                "completed",
                detail=f"final_status={final_status}",
                iteration=retries_so_far + 1,
            )],
        }

    return remediation_node


def _build_evidence_chain(
    state: NOCAgentState,
    diagnosis: dict,
    confidence: float,
    result: dict,
) -> list[str]:
    """Render a human-readable evidence chain for audit."""
    alarm = state["alarm"]
    chain: list[str] = []
    chain.append(f"Alarm: [{alarm.get('severity')}] {(alarm.get('description') or '')[:120]}")

    element = state.get("network_element")
    if element:
        chain.append(
            f"Element: {element.get('type')} {element.get('vendor')} {element.get('model')} "
            f"@ {element.get('site_name')}"
        )

    maintenance = state.get("recent_maintenance") or []
    if maintenance:
        actions = [m.get("action", "?")[:80] for m in maintenance[:2]]
        chain.append("Recent maintenance: " + " | ".join(actions))

    incidents = state.get("similar_incidents") or []
    if incidents:
        top = incidents[0]
        chain.append(
            f"Top similar incident (score {top.get('score', 0):.3f}): "
            f"{top.get('title', '?')} → {top.get('root_cause', '?')[:80]}"
        )

    if diagnosis:
        chain.append(f"Diagnosis: {diagnosis.get('probable_root_cause', '?')}")
        chain.append(f"Confidence: {confidence:.2f}")
        for ev in (diagnosis.get("supporting_evidence") or [])[:3]:
            chain.append(f"  Evidence: {ev}")

    radius = result.get("blast_radius")
    if radius:
        chain.append(
            f"Blast radius: {radius.get('risk')} "
            f"({radius.get('co_located_active_elements', 0)} co-located, "
            f"high_traffic={radius.get('is_high_traffic')})"
        )

    final_status = result.get("final_status")
    if final_status == "auto_remediated":
        chain.append(f"Action executed: {result.get('recommended_action')}")
        verification = result.get("verification_result") or {}
        chain.append(f"Verification: alarm cleared = {verification.get('cleared')}")
    elif final_status == "human_approval_required":
        chain.append(f"Recommended (pending approval): {result.get('recommended_action')}")
    elif final_status == "escalated":
        chain.append(f"Escalated: {result.get('recommended_action')}")
    elif final_status == "verification_failed":
        chain.append(f"Action attempted but verification failed; loop-back required.")

    return chain
