"""
Vector Search queries for the NOC Copilot project.

Provides async functions to perform vector similarity searches against
MongoDB Vector Search indexes for incidents, runbooks, and alarms.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def find_similar_incidents(
    collection,
    query_embedding: list[float],
    category_filter: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Find incidents similar to the given embedding using Vector Search.

    Args:
        collection: Motor async collection for incidents.
        query_embedding: The embedding vector to search against.
        category_filter: Optional category to pre-filter results.
        limit: Maximum number of results to return.

    Returns:
        List of incident documents with a "score" field, sorted by relevance.
    """
    num_candidates = limit * 20

    vector_search_stage: dict[str, Any] = {
        "$vectorSearch": {
            "index": "incidents_vector_index",
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": num_candidates,
            "limit": limit,
        }
    }

    if category_filter is not None:
        vector_search_stage["$vectorSearch"]["filter"] = {
            "category": {"$eq": category_filter}
        }

    pipeline = [
        vector_search_stage,
        {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
        {"$project": {"embedding": 0}},
    ]

    logger.debug(
        "Running vector search on incidents: category_filter=%s, limit=%d",
        category_filter,
        limit,
    )

    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    logger.info("Found %d similar incidents", len(results))
    return results


async def find_similar_runbooks(
    collection,
    query_embedding: list[float],
    domain_filter: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Find runbooks similar to the given embedding using Vector Search.

    Args:
        collection: Motor async collection for runbooks.
        query_embedding: The embedding vector to search against.
        domain_filter: Optional domain to pre-filter results (e.g. "network", "compute").
        limit: Maximum number of results to return.

    Returns:
        List of runbook documents with a "score" field, sorted by relevance.
    """
    num_candidates = limit * 20

    vector_search_stage: dict[str, Any] = {
        "$vectorSearch": {
            "index": "runbooks_vector_index",
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": num_candidates,
            "limit": limit,
        }
    }

    if domain_filter is not None:
        vector_search_stage["$vectorSearch"]["filter"] = {
            "domain": {"$eq": domain_filter}
        }

    pipeline = [
        vector_search_stage,
        {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
        {"$project": {"embedding": 0}},
    ]

    logger.debug(
        "Running vector search on runbooks: domain_filter=%s, limit=%d",
        domain_filter,
        limit,
    )

    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    logger.info("Found %d similar runbooks", len(results))
    return results


async def find_similar_alarms(
    collection,
    query_embedding: list[float],
    category_filter: str | None = None,
    severity_filter: str | None = None,
    status_filter: str = "active",
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Find alarms similar to the given embedding using Vector Search.

    Useful for alarm correlation — finding alarms that are semantically similar
    to a given alarm description or summary.

    Args:
        collection: Motor async collection for alarms.
        query_embedding: The embedding vector to search against.
        category_filter: Optional category to pre-filter results.
        severity_filter: Optional severity level to pre-filter (e.g. "critical", "major").
        status_filter: Status to pre-filter on. Defaults to "active".
        limit: Maximum number of results to return.

    Returns:
        List of alarm documents with a "score" field, sorted by relevance.
    """
    num_candidates = limit * 20

    vector_search_stage: dict[str, Any] = {
        "$vectorSearch": {
            "index": "alarms_vector_index",
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": num_candidates,
            "limit": limit,
        }
    }

    # Build the pre-filter combining all optional filters
    pre_filter: dict[str, Any] = {}

    if status_filter is not None:
        pre_filter["status"] = {"$eq": status_filter}

    if category_filter is not None:
        pre_filter["category"] = {"$eq": category_filter}

    if severity_filter is not None:
        pre_filter["severity"] = {"$eq": severity_filter}

    if pre_filter:
        vector_search_stage["$vectorSearch"]["filter"] = pre_filter

    pipeline = [
        vector_search_stage,
        {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
        {"$project": {"embedding": 0}},
    ]

    logger.debug(
        "Running vector search on alarms: category_filter=%s, severity_filter=%s, "
        "status_filter=%s, limit=%d",
        category_filter,
        severity_filter,
        status_filter,
        limit,
    )

    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    logger.info("Found %d similar alarms", len(results))
    return results
