"""Retrieval tools: search → evaluate → refine.

The agent runs hybrid search via MongoDB `$rankFusion`, evaluates the
quality of the results, and either declares the retrieval done or
reformulates the query and tries again. The evaluation step is what
turns a one-shot search into a closed loop.
"""

from __future__ import annotations

import time
from typing import Annotated, Any

from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from motor.motor_asyncio import AsyncIOMotorDatabase

from noc_copilot.agent.state import NOCAgentState
from noc_copilot.agent.tools._common import make_tool_command, truncate
from noc_copilot.db.collections import INCIDENTS, RUNBOOKS
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.search.hybrid_search import (
    hybrid_search_incidents,
    hybrid_search_runbooks,
)


PHASE = "retrieval"

# MongoDB $rankFusion uses Reciprocal Rank Fusion: each document's score
# is sum(weight_p / (RRF_K + rank_p)) across pipelines. With k=60 and the
# configured weights (vector 0.6 + text 0.4 = 1.0), the theoretical max is
# 1.0 / 61 ≈ 0.0164 — a result that's rank 1 in BOTH pipelines.
RRF_K = 60
RRF_MAX_SCORE = 1.0 / (RRF_K + 1)  # ≈ 0.0164 for current weights

# Threshold above which retrieval is considered "good enough". 0.012 means
# the top result is rank 1 in one pipeline and a strong rank in the other,
# which is what we want for "proceed to diagnosis". If you change the
# vector/text weights or switch to $scoreFusion (which normalises into
# [0, 1]), retune this against RRF_MAX_SCORE.
GOOD_SCORE_THRESHOLD = 0.012


def _strip_embeddings(docs: list[dict]) -> list[dict]:
    out: list[dict] = []
    for d in docs:
        cleaned = {k: v for k, v in d.items() if k != "embedding"}
        if "_id" in cleaned:
            cleaned["_id"] = str(cleaned["_id"])
        out.append(cleaned)
    return out


def make_retrieval_tools(db: AsyncIOMotorDatabase, embedder: VoyageEmbedder):
    """Build the retrieval toolset bound to a database and embedder."""

    @tool
    async def search_similar_incidents(
        query: str,
        category: str | None,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Hybrid search over historical incidents using MongoDB `$rankFusion`.

        Combines vector similarity (Voyage AI `voyage-4-large`, 1024 dims)
        with full-text search (compound query, fuzzy matching) in a single
        server-side aggregation pipeline. Use this to find past incidents
        that resemble the current alarm — same root cause, similar
        symptoms, even if phrased differently.

        Args:
            query: Natural-language search query. Be specific: include the
                symptom, the metric, the suspected cause if you have one.
            category: Optional category filter — one of "radio",
                "transport", "core", "power". Leave None to search across
                all categories (useful when investigating cross-domain
                root causes).
        """
        started = time.perf_counter()
        query_embedding = embedder.embed_query(query)
        results = await hybrid_search_incidents(
            db[INCIDENTS],
            query_text=query,
            query_embedding=query_embedding,
            category=category,
            limit=5,
        )
        results = _strip_embeddings(results)

        top_score = results[0].get("score", 0.0) if results else 0.0
        if not results:
            summary = f"No incidents matched query={query!r} (category={category})."
        else:
            lines = [
                f"  • [{r.get('score', 0):.3f}] {r.get('incident_id')}: "
                f"{truncate(r.get('title', ''), 70)} → {truncate(r.get('root_cause', ''), 80)}"
                for r in results[:5]
            ]
            summary = (
                f"Found {len(results)} incidents "
                f"(top RRF score: {top_score:.3f} / max ≈ {RRF_MAX_SCORE:.3f}):\n"
                + "\n".join(lines)
            )

        return make_tool_command(
            phase=PHASE,
            tool_name="search_similar_incidents",
            args={"query": query, "category": category},
            state_update={
                "similar_incidents": results,
                "retrieval_query": query,
            },
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def search_runbooks(
        query: str,
        domain: str | None,
        tool_call_id: Annotated[str, InjectedToolCallId],
    ) -> str:
        """Hybrid search over runbooks using MongoDB `$rankFusion`.

        Same hybrid search pattern as `search_similar_incidents` but over
        the runbook collection. Runbook sections are embedded with Voyage
        AI's `voyage-context-3` so each section's embedding encodes the
        global runbook context, not just the local section text.

        Args:
            query: Natural-language search query — describe what procedure
                or troubleshooting steps you need.
            domain: Optional domain filter — one of "radio", "transport",
                "core". Leave None to search all domains.
        """
        started = time.perf_counter()
        query_embedding = embedder.embed_query(query)
        results = await hybrid_search_runbooks(
            db[RUNBOOKS],
            query_text=query,
            query_embedding=query_embedding,
            domain=domain,
            limit=5,
        )
        results = _strip_embeddings(results)

        top_score = results[0].get("score", 0.0) if results else 0.0
        if not results:
            summary = f"No runbooks matched query={query!r} (domain={domain})."
        else:
            lines = [
                f"  • [{r.get('score', 0):.3f}] {r.get('title', '')} / "
                f"{truncate(r.get('section_title', ''), 50)}"
                for r in results[:5]
            ]
            summary = (
                f"Found {len(results)} runbooks "
                f"(top RRF score: {top_score:.3f} / max ≈ {RRF_MAX_SCORE:.3f}):\n"
                + "\n".join(lines)
            )

        return make_tool_command(
            phase=PHASE,
            tool_name="search_runbooks",
            args={"query": query, "domain": domain},
            state_update={"relevant_runbooks": results},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    @tool
    async def evaluate_retrieval_quality(
        tool_call_id: Annotated[str, InjectedToolCallId],
        state: Annotated[NOCAgentState, InjectedState],
    ) -> str:
        """Score the current retrieval results against a quality threshold.

        Looks at the most recent `search_similar_incidents` and
        `search_runbooks` results, returns a verdict ("good" or "poor")
        and the top scores. Call this AFTER searching, BEFORE deciding to
        finish the retrieval phase. If the verdict is "poor" you should
        reformulate the query and search again.
        """
        started = time.perf_counter()
        incidents = state.get("similar_incidents") or []
        runbooks = state.get("relevant_runbooks") or []
        attempts = state.get("retrieval_attempts", 0)

        top_inc = incidents[0].get("score", 0.0) if incidents else 0.0
        top_rb = runbooks[0].get("score", 0.0) if runbooks else 0.0

        verdict = "good" if (top_inc >= GOOD_SCORE_THRESHOLD or top_rb >= GOOD_SCORE_THRESHOLD) else "poor"
        recommendation = (
            "Stop searching and proceed to diagnosis."
            if verdict == "good"
            else (
                "Reformulate the query (try different keywords, add hypothesised root causes, "
                "or remove the category filter) and call search_similar_incidents again."
                if attempts < 2
                else "Retrieval attempts exhausted; proceed with what you have."
            )
        )

        summary = (
            f"Retrieval quality (RRF; threshold={GOOD_SCORE_THRESHOLD:.3f}, "
            f"max≈{RRF_MAX_SCORE:.3f}): "
            f"top_incident={top_inc:.3f}, top_runbook={top_rb:.3f}. "
            f"Verdict: {verdict}. Attempts so far: {attempts}. {recommendation}"
        )

        # Increment attempts counter so routing can short-circuit later
        return make_tool_command(
            phase=PHASE,
            tool_name="evaluate_retrieval_quality",
            args={},
            state_update={"retrieval_attempts": attempts + 1},
            summary=summary,
            tool_call_id=tool_call_id,
            started_at=started,
        )

    return [
        search_similar_incidents,
        search_runbooks,
        evaluate_retrieval_quality,
    ]
