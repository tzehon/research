"""
Full Text Search queries for the NOC Copilot project.

Provides async functions to perform full-text searches against MongoDB
Full Text Search indexes for runbooks and incidents, as well as direct queries
for element-based lookups.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def search_runbooks_fulltext(
    collection,
    query: str,
    domain: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Full-text search on runbooks using Full Text Search with fuzzy matching.

    Uses a compound query to combine a text search with an optional domain
    filter. Highlights are returned on the ``content`` and ``title`` fields.

    Args:
        collection: Motor async collection for runbooks.
        query: The search query string.
        domain: Optional domain to filter results (e.g. "network", "compute").
        limit: Maximum number of results to return.

    Returns:
        List of runbook documents with "score" and "highlights" fields.
    """
    must_clauses: list[dict[str, Any]] = [
        {
            "text": {
                "query": query,
                "path": ["title", "section_title", "content"],
                "fuzzy": {"maxEdits": 1},
            }
        }
    ]

    filter_clauses: list[dict[str, Any]] = []
    if domain is not None:
        filter_clauses.append(
            {
                "text": {
                    "query": domain,
                    "path": "domain",
                }
            }
        )

    search_stage: dict[str, Any] = {
        "$search": {
            "index": "runbooks_search_index",
            "compound": {
                "must": must_clauses,
            },
            "highlight": {
                "path": ["content", "title"],
            },
        }
    }

    if filter_clauses:
        search_stage["$search"]["compound"]["filter"] = filter_clauses

    pipeline = [
        search_stage,
        {
            "$addFields": {
                "score": {"$meta": "searchScore"},
                "highlights": {"$meta": "searchHighlights"},
            }
        },
        {"$project": {"embedding": 0}},
        {"$limit": limit},
    ]

    logger.debug(
        "Running full-text search on runbooks: query=%r, domain=%s, limit=%d",
        query,
        domain,
        limit,
    )

    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    logger.info("Found %d runbooks via full-text search", len(results))
    return results


async def search_incidents_fulltext(
    collection,
    query: str,
    category: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Full-text search on incidents using Full Text Search.

    Uses a compound query to combine a text search with an optional category
    filter.

    Args:
        collection: Motor async collection for incidents.
        query: The search query string.
        category: Optional category to filter results.
        limit: Maximum number of results to return.

    Returns:
        List of incident documents with a "score" field, sorted by relevance.
    """
    must_clauses: list[dict[str, Any]] = [
        {
            "text": {
                "query": query,
                "path": ["title", "description", "root_cause", "resolution"],
                "fuzzy": {"maxEdits": 1},
            }
        }
    ]

    filter_clauses: list[dict[str, Any]] = []
    if category is not None:
        filter_clauses.append(
            {
                "text": {
                    "query": category,
                    "path": "category",
                }
            }
        )

    search_stage: dict[str, Any] = {
        "$search": {
            "index": "incidents_search_index",
            "compound": {
                "must": must_clauses,
            },
        }
    }

    if filter_clauses:
        search_stage["$search"]["compound"]["filter"] = filter_clauses

    pipeline = [
        search_stage,
        {"$addFields": {"score": {"$meta": "searchScore"}}},
        {"$project": {"embedding": 0}},
        {"$limit": limit},
    ]

    logger.debug(
        "Running full-text search on incidents: query=%r, category=%s, limit=%d",
        query,
        category,
        limit,
    )

    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    logger.info("Found %d incidents via full-text search", len(results))
    return results


async def search_by_element_id(
    collection,
    element_id: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Search incidents affecting a specific network element.

    Uses a standard MongoDB find query on the ``affected_elements`` array
    field rather than Full Text Search, since it is a simple array membership
    check.

    Args:
        collection: Motor async collection for incidents.
        element_id: The network element identifier to search for.
        limit: Maximum number of results to return.

    Returns:
        List of incident documents sorted by creation date (most recent first).
    """
    logger.debug(
        "Searching incidents by element_id=%r, limit=%d",
        element_id,
        limit,
    )

    cursor = (
        collection.find(
            {"affected_elements": element_id},
            {"embedding": 0},
        )
        .sort("created_at", -1)
        .limit(limit)
    )
    results = await cursor.to_list(length=limit)

    logger.info(
        "Found %d incidents affecting element %r", len(results), element_id
    )
    return results
