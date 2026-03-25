"""Tests for the NOC Copilot agent pipeline (requires Atlas + all API keys)."""

import asyncio
import os
import pytest

from noc_copilot.config import get_settings
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.db.collections import ALARMS
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.agent.graph import build_noc_agent
from noc_copilot.agent.state import NOCAgentState


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def resources():
    for key in ("MONGODB_URI", "VOYAGE_API_KEY", "ANTHROPIC_API_KEY"):
        if not os.environ.get(key):
            pytest.skip(f"{key} not set")
    settings = get_settings()
    db = MongoDBConnection.get_async_db()
    embedder = VoyageEmbedder(api_key=settings.voyage_api_key)
    yield db, embedder
    MongoDBConnection.close()


@pytest.mark.asyncio
async def test_agent_processes_alarm(resources):
    db, embedder = resources

    # Fetch first active alarm
    alarm = await db[ALARMS].find_one({"status": "active"}, {"embedding": 0})
    if not alarm:
        pytest.skip("No active alarms in database")

    agent = build_noc_agent(db, embedder)
    initial_state: NOCAgentState = {
        "alarm": alarm,
        "network_element": None,
        "recent_maintenance": [],
        "correlated_alarms": [],
        "similar_incidents": [],
        "relevant_runbooks": [],
        "diagnosis": None,
        "confidence": 0.0,
        "recommended_action": None,
        "auto_remediable": False,
        "evidence_chain": [],
        "messages": [],
    }

    result = await agent.ainvoke(initial_state)

    assert result.get("diagnosis") is not None
    assert result.get("confidence") >= 0.0
    assert result.get("recommended_action") is not None
