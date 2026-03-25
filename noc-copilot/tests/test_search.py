"""Tests for search functionality (requires Atlas with loaded data + indexes)."""

import asyncio
import os
import pytest

from noc_copilot.config import get_settings
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.db.collections import INCIDENTS, RUNBOOKS
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.search.vector_search import find_similar_incidents, find_similar_runbooks
from noc_copilot.search.full_text_search import search_runbooks_fulltext, search_incidents_fulltext
from noc_copilot.search.hybrid_search import hybrid_search_runbooks


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def resources():
    for key in ("MONGODB_URI", "VOYAGE_API_KEY"):
        if not os.environ.get(key):
            pytest.skip(f"{key} not set")
    settings = get_settings()
    db = MongoDBConnection.get_async_db()
    embedder = VoyageEmbedder(api_key=settings.voyage_api_key)
    yield db, embedder
    MongoDBConnection.close()


@pytest.mark.asyncio
async def test_vector_search_incidents(resources):
    db, embedder = resources
    embedding = embedder.embed_query("UL BLER exceeding threshold antenna tilt")
    results = await find_similar_incidents(db[INCIDENTS], embedding, limit=3)
    assert len(results) > 0
    assert "score" in results[0]
    assert results[0]["score"] > 0


@pytest.mark.asyncio
async def test_vector_search_runbooks(resources):
    db, embedder = resources
    embedding = embedder.embed_query("troubleshoot high block error rate")
    results = await find_similar_runbooks(db[RUNBOOKS], embedding, limit=3)
    assert len(results) > 0


@pytest.mark.asyncio
async def test_fulltext_search_runbooks(resources):
    db, _ = resources
    results = await search_runbooks_fulltext(db[RUNBOOKS], "RET angle antenna tilt", limit=3)
    assert len(results) > 0


@pytest.mark.asyncio
async def test_hybrid_search_runbooks(resources):
    db, embedder = resources
    embedding = embedder.embed_query("UL BLER troubleshooting 5G NR")
    results = await hybrid_search_runbooks(
        db[RUNBOOKS], "UL BLER troubleshooting", embedding, domain="radio", limit=3
    )
    assert len(results) > 0
