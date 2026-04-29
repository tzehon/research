"""Diagnosis tools.

Diagnosis is the agent's reasoning step. The LLM has all the evidence
that triage and retrieval gathered; it now has to commit to one of two
terminal actions:

- `propose_diagnosis` — commit to a root cause with calibrated confidence.
- `request_more_evidence` — bail out, refine the search query, and signal
  to routing that retrieval should run again.

Both are tools so the agent's decision is *legible* (a tool call) and
deterministically structured (typed args). The routing logic in
`routing.py` reads the resulting state to decide what happens next.
"""

from __future__ import annotations

import time
from typing import Annotated

from langchain_core.tools import InjectedToolCallId, tool

from noc_copilot.agent.tools._common import make_tool_command


PHASE = "diagnosis"


def make_diagnosis_tools():
    """Build the diagnosis toolset. No external dependencies."""

    @tool
    async def propose_diagnosis(
        probable_root_cause: str,
        confidence: float,
        reasoning: str,
        supporting_evidence: list[str],
        differential_diagnoses: list[dict],
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Commit to a structured diagnosis with calibrated confidence.

        Confidence calibration:
        - 0.9–1.0: a similar past incident is a near-exact match AND
          recent maintenance or correlated alarms corroborate the cause.
        - 0.7–0.9: strong similarity but some contextual uncertainty.
        - 0.5–0.7: moderate evidence, multiple plausible causes.
        - <0.5:    insufficient evidence — call `request_more_evidence`
          instead, do NOT call this tool.

        Args:
            probable_root_cause: One sentence, specific. e.g. "RET tilt
                over-adjustment on Sector 3 during recent maintenance."
            confidence: Float between 0.0 and 1.0.
            reasoning: 2–4 sentence chain of reasoning.
            supporting_evidence: List of concrete evidence strings; cite
                specific incidents, maintenance entries, KPI deltas.
            differential_diagnoses: List of dicts with keys
                {cause, confidence, why_less_likely}. Include the top 1–3
                alternatives you considered and why each is less likely.
        """
        started = time.perf_counter()
        diagnosis = {
            "probable_root_cause": probable_root_cause,
            "confidence": float(confidence),
            "reasoning": reasoning,
            "supporting_evidence": list(supporting_evidence or []),
            "differential_diagnoses": list(differential_diagnoses or []),
        }
        summary = (
            f"Diagnosis committed: {probable_root_cause} (confidence={confidence:.2f}). "
            f"{len(supporting_evidence or [])} evidence point(s); "
            f"{len(differential_diagnoses or [])} differential(s)."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="propose_diagnosis",
            args={"confidence": float(confidence), "root_cause_preview": probable_root_cause[:100]},
            state_update={
                "diagnosis": diagnosis,
                "confidence": float(confidence),
            },
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def request_more_evidence(
        refined_query: str,
        hypotheses: list[str],
        reason: str,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Signal that the current evidence is insufficient and retrieval
        should run again with a refined query.

        Use this when the top retrieved incident scored poorly, when none
        of the runbooks matched the symptoms, or when you have multiple
        plausible causes that the current evidence cannot disambiguate.

        Args:
            refined_query: The new search query. Be more specific than
                last time — add hypothesised mechanisms, technical terms,
                or remove restrictive filters.
            hypotheses: 1–3 candidate root causes you want to investigate.
            reason: One sentence explaining why current evidence is
                insufficient.
        """
        started = time.perf_counter()
        summary = (
            f"Requesting more evidence. Reason: {reason} "
            f"Refined query: {refined_query!r}. Hypotheses: {hypotheses}."
        )
        return make_tool_command(
            phase=PHASE,
            tool_name="request_more_evidence",
            args={"refined_query": refined_query, "hypotheses": hypotheses},
            state_update={
                "next_phase": "retrieval",
                "retrieval_query": refined_query,
            },
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    return [propose_diagnosis, request_more_evidence]
