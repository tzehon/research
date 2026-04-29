"""Smoke tests for the agentic NOC Copilot workflow.

The graph compiles without contacting MongoDB or Anthropic in the most
basic tests (mocks). The integration test is opt-in: it requires real
credentials and seeded data.
"""

import asyncio
import os
from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# Compile-time tests — no external dependencies
# ---------------------------------------------------------------------------


def test_state_initial_has_all_keys():
    from noc_copilot.agent.state import initial_state

    state = initial_state({"alarm_id": "TEST", "source": "X", "severity": "minor"})
    # Must have all the fields nodes/routing read from
    for key in (
        "alarm", "network_element", "recent_maintenance", "correlated_alarms",
        "topology_neighbors", "kpi_history", "config_changes",
        "similar_incidents", "relevant_runbooks", "retrieval_query",
        "diagnosis", "confidence", "recommended_action", "auto_remediable",
        "blast_radius", "maintenance_window_ok", "backup_verified",
        "execution_result", "verification_result", "final_status",
        "retrieval_attempts", "diagnosis_retries", "remediation_retries",
        "next_phase", "tool_calls", "phase_log", "evidence_chain", "messages",
    ):
        assert key in state


def test_graph_compiles_with_mocks():
    """Compile the graph against a mock DB and embedder."""
    os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")
    os.environ.setdefault("VOYAGE_API_KEY", "stub")
    os.environ.setdefault("ANTHROPIC_API_KEY", "stub")

    from noc_copilot.agent.graph import build_noc_agent
    agent = build_noc_agent(MagicMock(), MagicMock())
    nodes = set(agent.get_graph().nodes.keys())
    # All expected nodes must be present
    for n in (
        "triage", "retrieval", "diagnosis", "remediation",
        "inc_diagnosis_retry", "inc_remediation_retry", "escalation",
    ):
        assert n in nodes


def test_routing_after_diagnosis_with_low_confidence_loops_back():
    from noc_copilot.agent.nodes.routing import route_after_diagnosis

    state = {
        "diagnosis": {"probable_root_cause": "X", "confidence": 0.5},
        "confidence": 0.5,
        "next_phase": "retrieval",
        "diagnosis_retries": 0,
    }
    assert route_after_diagnosis(state) == "retrieval"


def test_routing_after_diagnosis_with_exhausted_retries_escalates():
    from noc_copilot.agent.nodes.routing import (
        route_after_diagnosis,
        MAX_DIAGNOSIS_RETRIES,
    )

    state = {
        "diagnosis": {"probable_root_cause": "X", "confidence": 0.5},
        "confidence": 0.5,
        "next_phase": "retrieval",
        "diagnosis_retries": MAX_DIAGNOSIS_RETRIES,
    }
    assert route_after_diagnosis(state) == "escalate"


def test_routing_after_diagnosis_with_committed_diagnosis_proceeds():
    from noc_copilot.agent.nodes.routing import route_after_diagnosis

    state = {
        "diagnosis": {"probable_root_cause": "RET tilt", "confidence": 0.95},
        "confidence": 0.95,
        "next_phase": None,
        "diagnosis_retries": 0,
    }
    assert route_after_diagnosis(state) == "remediation"


def test_routing_after_remediation_terminal_status_ends():
    from noc_copilot.agent.nodes.routing import route_after_remediation

    for status in ("auto_remediated", "human_approval_required", "escalated"):
        assert route_after_remediation({"final_status": status}) == "end"


def test_routing_after_remediation_verify_failed_loops_back():
    from noc_copilot.agent.nodes.routing import route_after_remediation

    assert route_after_remediation(
        {"final_status": "verification_failed", "remediation_retries": 0}
    ) == "retrieval"


# ---------------------------------------------------------------------------
# Integration test — opt-in
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    not all(os.environ.get(k) for k in ("MONGODB_URI", "VOYAGE_API_KEY", "ANTHROPIC_API_KEY")),
    reason="Integration test requires real credentials and seeded data",
)
def test_agent_processes_alarm_end_to_end():
    """End-to-end run with a real DB and live LLM calls."""
    from noc_copilot.agent.graph import build_noc_agent
    from noc_copilot.agent.state import initial_state
    from noc_copilot.config import get_settings
    from noc_copilot.db.collections import ALARMS
    from noc_copilot.db.connection import MongoDBConnection
    from noc_copilot.embeddings.voyage import VoyageEmbedder

    settings = get_settings()
    db = MongoDBConnection.get_async_db()
    embedder = VoyageEmbedder(api_key=settings.voyage_api_key)

    async def _run():
        alarm = await db[ALARMS].find_one({"status": "active"}, {"embedding": 0})
        if not alarm:
            pytest.skip("No active alarms in database")
        agent = build_noc_agent(db, embedder)
        result = await agent.ainvoke(initial_state(alarm), {"recursion_limit": 80})
        return result

    from noc_copilot.agent.nodes.routing import (
        MAX_DIAGNOSIS_RETRIES,
        MAX_REMEDIATION_RETRIES,
    )

    try:
        result = asyncio.run(_run())
        # Some terminal status must be set
        assert result.get("final_status") in {
            "auto_remediated", "human_approval_required",
            "escalated", "verification_failed",
        }
        # And we must have recorded at least some tool calls
        tool_calls = result.get("tool_calls") or []
        assert len(tool_calls) > 0
        # Retry counters must stay within bounds (loop-back guards work)
        assert (result.get("diagnosis_retries") or 0) <= MAX_DIAGNOSIS_RETRIES
        assert (result.get("remediation_retries") or 0) <= MAX_REMEDIATION_RETRIES
        # The trace should span more than one phase (otherwise the workflow
        # short-circuited or never started).
        phases_touched = {tc.get("phase") for tc in tool_calls if tc.get("phase")}
        assert len(phases_touched) >= 2, f"Only touched phases: {phases_touched}"
    finally:
        MongoDBConnection.close()
