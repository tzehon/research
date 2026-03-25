"""Diagnosis node: LLM reasoning over enriched context."""

import json
import logging
import anthropic

from noc_copilot.config import get_settings

logger = logging.getLogger(__name__)


async def diagnosis_node(state: dict) -> dict:
    alarm = state["alarm"]
    element = state.get("network_element")
    maintenance = state.get("recent_maintenance", [])
    correlated = state.get("correlated_alarms", [])
    incidents = state.get("similar_incidents", [])[:3]
    runbooks = state.get("relevant_runbooks", [])[:3]

    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Build prompt with XML-tagged context sections
    prompt = _build_diagnosis_prompt(alarm, element, maintenance, correlated, incidents, runbooks)

    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )

    # Parse JSON from response
    text = response.content[0].text
    # Handle potential markdown code fences
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1].split("```")[0]

    try:
        diagnosis = json.loads(text.strip())
    except json.JSONDecodeError:
        logger.error("Failed to parse diagnosis JSON: %s", text[:200])
        diagnosis = {
            "probable_root_cause": "Unable to determine - LLM response parsing failed",
            "confidence": 0.0,
            "reasoning": text[:500],
            "supporting_evidence": [],
            "differential_diagnoses": [],
        }

    return {
        "diagnosis": diagnosis,
        "confidence": diagnosis.get("confidence", 0.0),
    }


def _build_diagnosis_prompt(alarm, element, maintenance, correlated, incidents, runbooks) -> str:
    # Build element info
    element_info = "No element information available."
    if element:
        element_info = (
            f"Type: {element.get('type')}, Vendor: {element.get('vendor')}, "
            f"Model: {element.get('model')}, Site: {element.get('site_name')}, "
            f"Region: {element.get('region')}, Status: {element.get('status')}"
        )

    # Build maintenance info
    maint_info = "No recent maintenance."
    if maintenance:
        maint_lines = []
        for m in maintenance:
            maint_lines.append(f"- {m.get('date')}: {m.get('action')} (by {m.get('engineer', 'unknown')})")
        maint_info = "\n".join(maint_lines)

    # Build correlated alarms
    corr_info = "No correlated alarms."
    if correlated:
        corr_lines = []
        for a in correlated[:5]:
            corr_lines.append(f"- [{a.get('severity')}] {a.get('description', '')[:100]}")
        corr_info = "\n".join(corr_lines)

    # Build similar incidents
    inc_info = "No similar incidents found."
    if incidents:
        inc_lines = []
        for i, inc in enumerate(incidents, 1):
            inc_lines.append(
                f"--- Incident {i} (score: {inc.get('score', 0):.3f}) ---\n"
                f"Title: {inc.get('title')}\n"
                f"Root Cause: {inc.get('root_cause')}\n"
                f"Resolution: {inc.get('resolution')}\n"
                f"Category: {inc.get('category')}, Severity: {inc.get('severity')}"
            )
        inc_info = "\n\n".join(inc_lines)

    # Build runbook sections
    rb_info = "No relevant runbooks found."
    if runbooks:
        rb_lines = []
        for i, rb in enumerate(runbooks, 1):
            rb_lines.append(
                f"--- Runbook {i} (score: {rb.get('score', 0):.3f}) ---\n"
                f"Title: {rb.get('title')} - {rb.get('section_title')}\n"
                f"Content: {rb.get('content', '')[:500]}"
            )
        rb_info = "\n\n".join(rb_lines)

    return f"""You are an expert telco network operations engineer. Analyze the following alarm and all available context to determine the most probable root cause.

<alarm>
Alarm ID: {alarm.get('alarm_id')}
Severity: {alarm.get('severity')}
Category: {alarm.get('category')}
Source: {alarm.get('source')}
Description: {alarm.get('description')}
Metrics: {json.dumps(alarm.get('metrics', {}))}
Region: {alarm.get('region')}
</alarm>

<network_element>
{element_info}
</network_element>

<recent_maintenance>
{maint_info}
</recent_maintenance>

<correlated_alarms>
{corr_info}
</correlated_alarms>

<similar_past_incidents>
{inc_info}
</similar_past_incidents>

<relevant_runbook_sections>
{rb_info}
</relevant_runbook_sections>

Based on all available evidence, provide your diagnosis as a JSON object with this exact structure:
{{
    "probable_root_cause": "A clear, specific description of the most likely root cause",
    "confidence": 0.85,
    "reasoning": "Step-by-step reasoning chain explaining how you arrived at this diagnosis",
    "supporting_evidence": ["evidence point 1", "evidence point 2", "..."],
    "differential_diagnoses": [
        {{"cause": "alternative cause", "confidence": 0.15, "why_less_likely": "reason"}}
    ]
}}

Confidence calibration guidelines:
- 0.9+: The top similar incident is a near-exact match AND recent maintenance or correlated alarms corroborate the hypothesis
- 0.7-0.9: Strong similarity to a past incident but some uncertainty in the current context
- 0.5-0.7: Moderate evidence but multiple plausible causes
- Below 0.5: Insufficient evidence, manual investigation recommended

Respond ONLY with the JSON object, no other text."""
