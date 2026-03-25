"""Retrieval node: hybrid search for similar incidents and relevant runbooks."""

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.db.collections import INCIDENTS, RUNBOOKS
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.search.hybrid_search import hybrid_search_incidents, hybrid_search_runbooks

logger = logging.getLogger(__name__)


async def retrieval_node(
    state: dict,
    *,
    db: AsyncIOMotorDatabase,
    embedder: VoyageEmbedder,
) -> dict:
    alarm = state["alarm"]
    element = state.get("network_element")
    maintenance = state.get("recent_maintenance", [])

    # Build rich query text from alarm + context
    query_parts = [
        f"{alarm['severity']} {alarm['category']} {alarm['description']}"
    ]
    if element:
        query_parts.append(f"Network element: {element.get('type', '')} {element.get('vendor', '')} {element.get('model', '')}")
    if maintenance:
        for m in maintenance[:2]:
            query_parts.append(f"Recent maintenance: {m.get('action', '')}")

    query_text = " | ".join(query_parts)

    # Generate query embedding
    query_embedding = embedder.embed_query(query_text)

    # Hybrid search for similar incidents
    incidents = await hybrid_search_incidents(
        db[INCIDENTS],
        query_text=alarm["description"],
        query_embedding=query_embedding,
        category=alarm.get("category"),
        limit=5,
        method="rankFusion",
    )
    logger.info("Found %d similar incidents (top score: %.3f)", len(incidents), incidents[0].get("score", 0) if incidents else 0)

    # Hybrid search for relevant runbooks
    runbooks = await hybrid_search_runbooks(
        db[RUNBOOKS],
        query_text=alarm["description"],
        query_embedding=query_embedding,
        domain=alarm.get("category"),
        limit=5,
        method="rankFusion",
    )
    logger.info("Found %d relevant runbooks (top score: %.3f)", len(runbooks), runbooks[0].get("score", 0) if runbooks else 0)

    return {
        "similar_incidents": incidents,
        "relevant_runbooks": runbooks,
    }
