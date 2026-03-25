"""
Hybrid search using MongoDB's native $rankFusion and $scoreFusion stages.

This module provides two approaches to hybrid (vector + full-text) search:

**$rankFusion (MongoDB 8.2+)**
    Combines results from multiple sub-pipelines using Reciprocal Rank Fusion
    (RRF). Each sub-pipeline produces a ranked list of documents and the final
    score is computed from the *ranks* (positions) of each document across
    pipelines, not from the raw scores.  This makes it robust to score-scale
    differences between vector and text search.

**$scoreFusion (MongoDB 8.2+)**
    Combines results from multiple sub-pipelines by first *normalizing* the
    raw scores from each pipeline and then computing a weighted sum.  The
    normalization strategy is configurable:
      - ``"sigmoid"``      -- applies a sigmoid function (good default).
      - ``"minMaxScaler"`` -- scales scores to [0, 1] within each pipeline.
      - ``"none"``         -- no normalization; raw scores are used as-is.

    Because $scoreFusion operates on actual score values rather than ranks, it
    can be more precise when the score distributions are well-understood, but
    it is also more sensitive to score-scale mismatches when normalization is
    disabled.

Both stages accept per-pipeline weights so you can control the relative
importance of vector vs. text search.
"""

import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Low-level generic helpers
# ---------------------------------------------------------------------------


async def hybrid_search_rankfusion(
    collection,
    query_text: str,
    query_embedding: list[float],
    index_name_vector: str,
    index_name_search: str,
    search_fields: list[str],
    domain_field: str | None = None,
    domain_value: str | None = None,
    limit: int = 5,
    vector_weight: float = 0.6,
    text_weight: float = 0.4,
) -> list[dict[str, Any]]:
    """Hybrid search combining vector and full-text results via $rankFusion.

    Requires MongoDB 8.0 or later.  Reciprocal Rank Fusion merges the ranked
    result lists from a ``$vectorSearch`` sub-pipeline and a ``$search``
    sub-pipeline, weighted by *vector_weight* and *text_weight*.

    Args:
        collection: Motor async collection.
        query_text: The natural-language query for full-text search.
        query_embedding: The embedding vector for vector search.
        index_name_vector: Name of the Vector Search index.
        index_name_search: Name of the Full Text Search index.
        search_fields: Fields to search in the full-text sub-pipeline.
        domain_field: Optional field name used for domain pre-filtering.
        domain_value: Value to match on *domain_field* (ignored when
            *domain_field* is ``None``).
        limit: Maximum number of final results.
        vector_weight: Weight assigned to the vector search pipeline.
        text_weight: Weight assigned to the text search pipeline.

    Returns:
        List of documents with "score" and "scoreDetails" fields.
    """
    num_candidates = limit * 20

    # -- Vector sub-pipeline -------------------------------------------------
    vector_search_spec: dict[str, Any] = {
        "index": index_name_vector,
        "path": "embedding",
        "queryVector": query_embedding,
        "numCandidates": num_candidates,
        "limit": limit * 2,
    }

    if domain_field and domain_value is not None:
        vector_search_spec["filter"] = {domain_field: {"$eq": domain_value}}

    vector_pipeline: list[dict[str, Any]] = [
        {"$vectorSearch": vector_search_spec},
    ]

    # -- Text sub-pipeline ---------------------------------------------------
    compound_query: dict[str, Any] = {
        "must": [
            {
                "text": {
                    "query": query_text,
                    "path": search_fields,
                    "fuzzy": {"maxEdits": 1},
                }
            }
        ],
    }

    if domain_field and domain_value is not None:
        compound_query["filter"] = [
            {"text": {"query": domain_value, "path": domain_field}}
        ]

    text_pipeline: list[dict[str, Any]] = [
        {
            "$search": {
                "index": index_name_search,
                "compound": compound_query,
            }
        },
        {"$limit": limit * 2},
    ]

    # -- Assemble $rankFusion stage ------------------------------------------
    pipeline = [
        {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vector_search": vector_pipeline,
                        "text_search": text_pipeline,
                    }
                },
                "combination": {
                    "weights": {
                        "vector_search": vector_weight,
                        "text_search": text_weight,
                    }
                },
                "scoreDetails": True,
            }
        },
        {
            "$addFields": {
                "score": {"$meta": "score"},
                "scoreDetails": {"$meta": "scoreDetails"},
            }
        },
        {"$project": {"embedding": 0}},
        {"$limit": limit},
    ]

    logger.debug(
        "Running $rankFusion hybrid search: vector_index=%s, search_index=%s, "
        "query=%r, domain_field=%s, domain_value=%s, limit=%d, "
        "vector_weight=%.2f, text_weight=%.2f",
        index_name_vector,
        index_name_search,
        query_text,
        domain_field,
        domain_value,
        limit,
        vector_weight,
        text_weight,
    )

    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    logger.info("$rankFusion returned %d results", len(results))
    return results


async def hybrid_search_scorefusion(
    collection,
    query_text: str,
    query_embedding: list[float],
    index_name_vector: str,
    index_name_search: str,
    search_fields: list[str],
    domain_field: str | None = None,
    domain_value: str | None = None,
    limit: int = 5,
    normalization: str = "sigmoid",
    vector_weight: float = 0.6,
    text_weight: float = 0.4,
) -> list[dict[str, Any]]:
    """Hybrid search combining vector and full-text results via $scoreFusion.

    Requires MongoDB 8.2 or later.  Unlike $rankFusion which operates on
    rank positions, $scoreFusion normalizes raw scores from each sub-pipeline
    and computes a weighted sum.

    Args:
        collection: Motor async collection.
        query_text: The natural-language query for full-text search.
        query_embedding: The embedding vector for vector search.
        index_name_vector: Name of the Vector Search index.
        index_name_search: Name of the Full Text Search index.
        search_fields: Fields to search in the full-text sub-pipeline.
        domain_field: Optional field name used for domain pre-filtering.
        domain_value: Value to match on *domain_field* (ignored when
            *domain_field* is ``None``).
        limit: Maximum number of final results.
        normalization: Score normalization strategy. One of ``"sigmoid"``,
            ``"minMaxScaler"``, or ``"none"``.
        vector_weight: Weight assigned to the vector search pipeline.
        text_weight: Weight assigned to the text search pipeline.

    Returns:
        List of documents with "score" and "scoreDetails" fields.
    """
    num_candidates = limit * 20

    # -- Vector sub-pipeline -------------------------------------------------
    vector_search_spec: dict[str, Any] = {
        "index": index_name_vector,
        "path": "embedding",
        "queryVector": query_embedding,
        "numCandidates": num_candidates,
        "limit": limit * 2,
    }

    if domain_field and domain_value is not None:
        vector_search_spec["filter"] = {domain_field: {"$eq": domain_value}}

    vector_pipeline: list[dict[str, Any]] = [
        {"$vectorSearch": vector_search_spec},
    ]

    # -- Text sub-pipeline ---------------------------------------------------
    compound_query: dict[str, Any] = {
        "must": [
            {
                "text": {
                    "query": query_text,
                    "path": search_fields,
                    "fuzzy": {"maxEdits": 1},
                }
            }
        ],
    }

    if domain_field and domain_value is not None:
        compound_query["filter"] = [
            {"text": {"query": domain_value, "path": domain_field}}
        ]

    text_pipeline: list[dict[str, Any]] = [
        {
            "$search": {
                "index": index_name_search,
                "compound": compound_query,
            }
        },
        {"$limit": limit * 2},
    ]

    # -- Assemble $scoreFusion stage -----------------------------------------
    pipeline = [
        {
            "$scoreFusion": {
                "input": {
                    "pipelines": {
                        "vector_search": vector_pipeline,
                        "text_search": text_pipeline,
                    },
                    "normalization": normalization,
                },
                "combination": {
                    "weights": {
                        "vector_search": vector_weight,
                        "text_search": text_weight,
                    }
                },
                "scoreDetails": True,
            }
        },
        {
            "$addFields": {
                "score": {"$meta": "score"},
                "scoreDetails": {"$meta": "scoreDetails"},
            }
        },
        {"$project": {"embedding": 0}},
        {"$limit": limit},
    ]

    logger.debug(
        "Running $scoreFusion hybrid search: vector_index=%s, search_index=%s, "
        "query=%r, normalization=%s, domain_field=%s, domain_value=%s, limit=%d, "
        "vector_weight=%.2f, text_weight=%.2f",
        index_name_vector,
        index_name_search,
        query_text,
        normalization,
        domain_field,
        domain_value,
        limit,
        vector_weight,
        text_weight,
    )

    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    logger.info("$scoreFusion returned %d results", len(results))
    return results


# ---------------------------------------------------------------------------
# High-level convenience wrappers
# ---------------------------------------------------------------------------


async def hybrid_search_runbooks(
    collection,
    query_text: str,
    query_embedding: list[float],
    domain: str | None = None,
    limit: int = 5,
    vector_weight: float = 0.6,
    text_weight: float = 0.4,
    method: Literal["rankFusion", "scoreFusion"] = "rankFusion",
) -> list[dict[str, Any]]:
    """Unified hybrid search interface for runbooks.

    Delegates to either :func:`hybrid_search_rankfusion` or
    :func:`hybrid_search_scorefusion` based on *method*.

    Args:
        collection: Motor async collection for runbooks.
        query_text: Natural-language query string.
        query_embedding: Embedding vector for the query.
        domain: Optional domain filter (e.g. "network", "compute").
        limit: Maximum number of results.
        vector_weight: Weight for the vector search pipeline.
        text_weight: Weight for the text search pipeline.
        method: Fusion method -- ``"rankFusion"`` (default, MongoDB 8.2+) or
            ``"scoreFusion"`` (MongoDB 8.2+).

    Returns:
        List of runbook documents with "score" and "scoreDetails" fields.
    """
    logger.info(
        "Hybrid runbook search: method=%s, query=%r, domain=%s",
        method,
        query_text,
        domain,
    )

    search_fn = (
        hybrid_search_scorefusion
        if method == "scoreFusion"
        else hybrid_search_rankfusion
    )

    return await search_fn(
        collection=collection,
        query_text=query_text,
        query_embedding=query_embedding,
        index_name_vector="runbooks_vector_index",
        index_name_search="runbooks_search_index",
        search_fields=["title", "section_title", "content"],
        domain_field="domain" if domain is not None else None,
        domain_value=domain,
        limit=limit,
        vector_weight=vector_weight,
        text_weight=text_weight,
    )


async def hybrid_search_incidents(
    collection,
    query_text: str,
    query_embedding: list[float],
    category: str | None = None,
    limit: int = 5,
    vector_weight: float = 0.6,
    text_weight: float = 0.4,
    method: Literal["rankFusion", "scoreFusion"] = "rankFusion",
) -> list[dict[str, Any]]:
    """Unified hybrid search interface for incidents.

    Delegates to either :func:`hybrid_search_rankfusion` or
    :func:`hybrid_search_scorefusion` based on *method*.

    Args:
        collection: Motor async collection for incidents.
        query_text: Natural-language query string.
        query_embedding: Embedding vector for the query.
        category: Optional category filter.
        limit: Maximum number of results.
        vector_weight: Weight for the vector search pipeline.
        text_weight: Weight for the text search pipeline.
        method: Fusion method -- ``"rankFusion"`` (default, MongoDB 8.2+) or
            ``"scoreFusion"`` (MongoDB 8.2+).

    Returns:
        List of incident documents with "score" and "scoreDetails" fields.
    """
    logger.info(
        "Hybrid incident search: method=%s, query=%r, category=%s",
        method,
        query_text,
        category,
    )

    search_fn = (
        hybrid_search_scorefusion
        if method == "scoreFusion"
        else hybrid_search_rankfusion
    )

    return await search_fn(
        collection=collection,
        query_text=query_text,
        query_embedding=query_embedding,
        index_name_vector="incidents_vector_index",
        index_name_search="incidents_search_index",
        search_fields=["title", "description", "root_cause", "resolution"],
        domain_field="category" if category is not None else None,
        domain_value=category,
        limit=limit,
        vector_weight=vector_weight,
        text_weight=text_weight,
    )
