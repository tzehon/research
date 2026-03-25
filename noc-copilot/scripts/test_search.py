#!/usr/bin/env python3
"""Test individual search capabilities against MongoDB."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from noc_copilot.config import get_settings
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.db.collections import INCIDENTS, RUNBOOKS
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.search.vector_search import find_similar_incidents, find_similar_runbooks
from noc_copilot.search.full_text_search import search_runbooks_fulltext, search_incidents_fulltext
from noc_copilot.search.hybrid_search import hybrid_search_runbooks, hybrid_search_incidents

console = Console()


async def test_vector_search(db, embedder: VoyageEmbedder) -> None:
    console.print(Panel("[bold]Test 1: Vector Search — Similar Incidents[/bold]"))
    query = "excessive packet loss on 5G NR cell sector, UL BLER exceeding threshold"
    console.print(f"Query: [italic]{query}[/italic]\n")

    embedding = embedder.embed_query(query)
    results = await find_similar_incidents(db[INCIDENTS], embedding, limit=5)

    table = Table(title="Vector Search Results — Incidents")
    table.add_column("Score", style="cyan", width=8)
    table.add_column("ID", width=10)
    table.add_column("Title", width=50)
    table.add_column("Category", width=10)
    for r in results:
        table.add_row(f"{r.get('score', 0):.4f}", r.get("incident_id", ""), r.get("title", ""), r.get("category", ""))
    console.print(table)


async def test_fulltext_search(db) -> None:
    console.print(Panel("[bold]Test 2: Full-Text Search — Runbooks[/bold]"))
    query = "RET angle antenna tilt troubleshooting"
    console.print(f"Query: [italic]{query}[/italic]\n")

    results = await search_runbooks_fulltext(db[RUNBOOKS], query, domain="radio", limit=5)

    table = Table(title="Full-Text Search Results — Runbooks")
    table.add_column("Score", style="cyan", width=8)
    table.add_column("ID", width=10)
    table.add_column("Title", width=35)
    table.add_column("Section", width=35)
    for r in results:
        table.add_row(
            f"{r.get('score', 0):.4f}",
            r.get("runbook_id", ""),
            r.get("title", ""),
            r.get("section_title", ""),
        )
    console.print(table)


async def test_hybrid_search(db, embedder: VoyageEmbedder) -> None:
    console.print(Panel("[bold]Test 3: Hybrid Search ($rankFusion) — Runbooks[/bold]"))
    query = "UL BLER high block error rate troubleshooting 5G NR"
    console.print(f"Query: [italic]{query}[/italic]\n")

    embedding = embedder.embed_query(query)
    results = await hybrid_search_runbooks(
        db[RUNBOOKS], query, embedding, domain="radio", limit=5, method="rankFusion"
    )

    table = Table(title="Hybrid Search ($rankFusion) Results — Runbooks")
    table.add_column("Score", style="cyan", width=8)
    table.add_column("ID", width=10)
    table.add_column("Title", width=35)
    table.add_column("Section", width=35)
    for r in results:
        table.add_row(
            f"{r.get('score', 0):.4f}",
            r.get("runbook_id", ""),
            r.get("title", ""),
            r.get("section_title", ""),
        )
    console.print(table)

    # Also test $scoreFusion
    console.print(Panel("[bold]Test 4: Hybrid Search ($scoreFusion) — Runbooks[/bold]"))
    results_sf = await hybrid_search_runbooks(
        db[RUNBOOKS], query, embedding, domain="radio", limit=5, method="scoreFusion"
    )

    table = Table(title="Hybrid Search ($scoreFusion) Results — Runbooks")
    table.add_column("Score", style="cyan", width=8)
    table.add_column("ID", width=10)
    table.add_column("Title", width=35)
    table.add_column("Section", width=35)
    for r in results_sf:
        table.add_row(
            f"{r.get('score', 0):.4f}",
            r.get("runbook_id", ""),
            r.get("title", ""),
            r.get("section_title", ""),
        )
    console.print(table)


async def test_hybrid_incidents(db, embedder: VoyageEmbedder) -> None:
    console.print(Panel("[bold]Test 5: Hybrid Search ($rankFusion) — Incidents[/bold]"))
    query = "microwave link degradation rain fade throughput drop"
    console.print(f"Query: [italic]{query}[/italic]\n")

    embedding = embedder.embed_query(query)
    results = await hybrid_search_incidents(
        db[INCIDENTS], query, embedding, category="transport", limit=5, method="rankFusion"
    )

    table = Table(title="Hybrid Search ($rankFusion) Results — Incidents")
    table.add_column("Score", style="cyan", width=8)
    table.add_column("ID", width=10)
    table.add_column("Title", width=50)
    table.add_column("Category", width=10)
    for r in results:
        table.add_row(
            f"{r.get('score', 0):.4f}",
            r.get("incident_id", ""),
            r.get("title", ""),
            r.get("category", ""),
        )
    console.print(table)


async def main_async() -> None:
    settings = get_settings()
    db = MongoDBConnection.get_async_db()
    embedder = VoyageEmbedder(api_key=settings.voyage_api_key, model=settings.voyage_model)

    console.print("[bold cyan]NOC Copilot — Search Test Suite[/bold cyan]\n")

    await test_vector_search(db, embedder)
    console.print()
    await test_fulltext_search(db)
    console.print()
    await test_hybrid_search(db, embedder)
    console.print()
    await test_hybrid_incidents(db, embedder)

    console.print("\n[bold green]All search tests complete![/bold green]")
    MongoDBConnection.close()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
