"""Conditional edge functions for the outer agent graph.

The graph has loops in two places:

- diagnosis → retrieval (when confidence is too low and the diagnosis
  agent asked for more evidence)
- remediation → retrieval (when an executed action failed verification)

Both loops are bounded by retry counters in state so the agent cannot
spin forever. After exhaustion, the agent escalates with whatever
evidence it has.
"""

from __future__ import annotations

import logging

from noc_copilot.agent.state import NOCAgentState

logger = logging.getLogger(__name__)


# Maximum number of times each loop is allowed to fire before escalating.
MAX_DIAGNOSIS_RETRIES = 2
MAX_REMEDIATION_RETRIES = 1


def route_after_diagnosis(state: NOCAgentState) -> str:
    """Decide what happens after the diagnosis agent finishes.

    Returns one of: "retrieval" (loop back), "remediation" (proceed),
    "escalate" (give up — confidence too low and retries exhausted).
    """
    diagnosis = state.get("diagnosis")
    confidence = state.get("confidence", 0.0) or 0.0
    next_phase = state.get("next_phase")
    retries = state.get("diagnosis_retries", 0) or 0

    # Agent explicitly asked for more evidence
    if next_phase == "retrieval" and retries < MAX_DIAGNOSIS_RETRIES:
        logger.info(
            "Routing after diagnosis: looping back to retrieval "
            "(retries=%d, max=%d)", retries, MAX_DIAGNOSIS_RETRIES,
        )
        return "retrieval"

    if next_phase == "retrieval" and retries >= MAX_DIAGNOSIS_RETRIES:
        # Exhausted retries while still asking for more evidence
        logger.info("Routing after diagnosis: retries exhausted, escalating")
        return "escalate"

    # Diagnosis was committed — proceed to remediation. The remediation
    # agent itself decides whether to escalate based on confidence.
    if diagnosis is not None:
        logger.info(
            "Routing after diagnosis: proceeding to remediation (confidence=%.2f)",
            confidence,
        )
        return "remediation"

    # Defensive — should not happen but escalate if we somehow have nothing
    logger.warning("Routing after diagnosis: no diagnosis and no retry, escalating")
    return "escalate"


def route_after_remediation(state: NOCAgentState) -> str:
    """Decide what happens after remediation finishes.

    Returns one of: "retrieval" (verification failed, re-investigate),
    "end" (committed terminal action).
    """
    final_status = state.get("final_status")
    retries = state.get("remediation_retries", 0) or 0

    if final_status == "verification_failed" and retries < MAX_REMEDIATION_RETRIES:
        logger.info(
            "Routing after remediation: verification failed, re-investigating "
            "(retries=%d)", retries,
        )
        return "retrieval"

    # Anything else — auto_remediated, human_approval_required, escalated,
    # or verification_failed with retries exhausted — terminates the graph.
    logger.info("Routing after remediation: terminal (status=%s)", final_status)
    return "end"


def increment_diagnosis_retry(state: NOCAgentState) -> dict:
    """Counter increment node — runs when diagnosis loops back to retrieval."""
    return {
        "diagnosis_retries": (state.get("diagnosis_retries", 0) or 0) + 1,
        "next_phase": None,  # consumed
        "phase_log": [{
            "phase": "diagnosis",
            "event": "looped_back",
            "detail": "Asked retrieval for refined evidence",
            "iteration": (state.get("diagnosis_retries", 0) or 0) + 1,
        }],
    }


def increment_remediation_retry(state: NOCAgentState) -> dict:
    """Counter increment node — runs when remediation loops back."""
    return {
        "remediation_retries": (state.get("remediation_retries", 0) or 0) + 1,
        "phase_log": [{
            "phase": "remediation",
            "event": "looped_back",
            "detail": "Verification failed, re-investigating",
            "iteration": (state.get("remediation_retries", 0) or 0) + 1,
        }],
    }


def escalation_node(state: NOCAgentState) -> dict:
    """Terminal escalation node — used when the agent can't progress."""
    confidence = state.get("confidence", 0.0) or 0.0
    diagnosis = state.get("diagnosis") or {}
    reason = (
        f"Could not converge on a high-confidence diagnosis after "
        f"{state.get('diagnosis_retries', 0)} retries. "
        f"Last confidence: {confidence:.2f}."
    )
    return {
        "final_status": "escalated",
        "recommended_action": (
            f"ESCALATION: {reason} "
            f"Best hypothesis so far: {diagnosis.get('probable_root_cause', 'unknown')}. "
            f"Manual investigation required."
        ),
        "phase_log": [{
            "phase": "router",
            "event": "escalated",
            "detail": reason,
            "iteration": (state.get("diagnosis_retries", 0) or 0) + 1,
        }],
    }
