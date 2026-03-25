"""Remediation node: determine action, check auto-remediation eligibility, persist diagnosis."""

import json
import logging
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

import anthropic

from noc_copilot.config import get_settings
from noc_copilot.db.collections import DIAGNOSES

logger = logging.getLogger(__name__)

AUTO_REMEDIABLE_ACTIONS = [
    "revert config parameter",
    "revert RET angle",
    "revert firmware",
    "restart service",
    "clear alarm",
]


async def remediation_node(state: dict, *, db: AsyncIOMotorDatabase) -> dict:
    alarm = state["alarm"]
    diagnosis = state.get("diagnosis", {})
    confidence = state.get("confidence", 0.0)
    incidents = state.get("similar_incidents", [])
    runbooks = state.get("relevant_runbooks", [])
    element = state.get("network_element")
    maintenance = state.get("recent_maintenance", [])

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Build evidence chain
    evidence_chain = _build_evidence_chain(alarm, element, maintenance, incidents, diagnosis)

    # Determine recommended action using LLM adaptation
    recommended_action = await _adapt_resolution(
        client, settings.anthropic_model, alarm, diagnosis, incidents, runbooks
    )

    # Check if action is auto-remediable
    auto_remediable = False
    if confidence > 0.9 and recommended_action:
        action_lower = recommended_action.lower()
        auto_remediable = any(
            approved.lower() in action_lower for approved in AUTO_REMEDIABLE_ACTIONS
        )

    # Format action string based on confidence thresholds
    if confidence > 0.9 and auto_remediable:
        action_label = f"AUTO-REMEDIATION: {recommended_action}"
    elif confidence >= 0.7:
        action_label = f"RECOMMENDED ACTION (human approval required): {recommended_action}"
    else:
        action_label = (
            f"ESCALATION REQUIRED: Insufficient confidence ({confidence:.2f}). "
            f"Manual investigation needed. Suggested direction: {recommended_action}"
        )

    # Persist diagnosis to MongoDB
    diagnosis_record = {
        "alarm_id": alarm.get("alarm_id"),
        "alarm": alarm,
        "network_element_id": element.get("element_id") if element else None,
        "diagnosis": diagnosis,
        "confidence": confidence,
        "recommended_action": action_label,
        "auto_remediable": auto_remediable,
        "evidence_chain": evidence_chain,
        "similar_incident_ids": [inc.get("incident_id") for inc in incidents[:3]],
        "created_at": datetime.utcnow(),
    }
    await db[DIAGNOSES].insert_one(diagnosis_record)
    logger.info(
        "Diagnosis persisted for alarm %s (confidence=%.2f, auto_remediable=%s)",
        alarm.get("alarm_id"), confidence, auto_remediable,
    )

    return {
        "recommended_action": action_label,
        "auto_remediable": auto_remediable,
        "evidence_chain": evidence_chain,
    }


def _build_evidence_chain(alarm, element, maintenance, incidents, diagnosis) -> list[str]:
    """Build a human-readable evidence chain summarizing the reasoning path."""
    chain = []

    chain.append(f"Alarm received: [{alarm.get('severity')}] {alarm.get('description', '')[:120]}")

    if element:
        chain.append(
            f"Source element identified: {element.get('type')} {element.get('vendor')} "
            f"{element.get('model')} at {element.get('site_name', 'unknown site')}"
        )

    if maintenance:
        actions = [m.get("action", "unknown") for m in maintenance[:3]]
        chain.append(f"Recent maintenance found: {', '.join(actions)}")

    if incidents:
        top = incidents[0]
        chain.append(
            f"Most similar past incident (score {top.get('score', 0):.3f}): "
            f"{top.get('title', 'N/A')} -> root cause: {top.get('root_cause', 'N/A')}"
        )

    if diagnosis:
        chain.append(f"Diagnosis: {diagnosis.get('probable_root_cause', 'N/A')}")
        chain.append(f"Confidence: {diagnosis.get('confidence', 0):.2f}")

        for ev in diagnosis.get("supporting_evidence", [])[:3]:
            chain.append(f"  Evidence: {ev}")

    return chain


async def _adapt_resolution(
    client: anthropic.Anthropic,
    model: str,
    alarm: dict,
    diagnosis: dict,
    incidents: list[dict],
    runbooks: list[dict],
) -> str:
    """Use Claude to adapt the most similar incident's resolution to the current context."""
    # Gather resolution context
    past_resolutions = []
    for inc in incidents[:2]:
        if inc.get("resolution"):
            past_resolutions.append(
                f"- Incident '{inc.get('title')}': {inc.get('resolution')}"
            )

    runbook_steps = []
    for rb in runbooks[:2]:
        if rb.get("content"):
            runbook_steps.append(
                f"- {rb.get('title', '')} / {rb.get('section_title', '')}: {rb.get('content', '')[:300]}"
            )

    prompt = f"""You are a telco NOC engineer. Based on the diagnosis and available resolution context, recommend a specific remediation action for this alarm.

<alarm>
{alarm.get('description')}
Severity: {alarm.get('severity')}, Category: {alarm.get('category')}
</alarm>

<diagnosis>
Root cause: {diagnosis.get('probable_root_cause', 'Unknown')}
Confidence: {diagnosis.get('confidence', 0)}
Reasoning: {diagnosis.get('reasoning', 'N/A')}
</diagnosis>

<past_resolutions>
{chr(10).join(past_resolutions) if past_resolutions else 'No past resolutions available.'}
</past_resolutions>

<relevant_runbook_steps>
{chr(10).join(runbook_steps) if runbook_steps else 'No relevant runbook steps available.'}
</relevant_runbook_steps>

Provide a single, specific, actionable remediation step. Be concise (1-2 sentences).
If the action matches one of these pre-approved auto-remediation types, use the exact phrasing:
{json.dumps(AUTO_REMEDIABLE_ACTIONS)}

Respond with ONLY the remediation action, no other text."""

    response = client.messages.create(
        model=model,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text.strip()
