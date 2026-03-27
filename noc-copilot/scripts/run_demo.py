#!/usr/bin/env python3
"""Run the full NOC Copilot demo flow."""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from rich.console import Console

from noc_copilot.config import get_settings
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.db.collections import ALARMS, INCIDENTS, RUNBOOKS, NETWORK_INVENTORY
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.ui.terminal import run_demo

console = Console()


async def main_async(explain_levels: bool = False) -> None:
    console.print("[bold cyan]NOC Copilot — Demo Runner[/bold cyan]\n")

    settings = get_settings()
    db = MongoDBConnection.get_async_db()
    sync_db = MongoDBConnection.get_sync_db()

    # Verify connection
    try:
        sync_db.command("ping")
        console.print("[green]✓ MongoDB connection successful[/green]")
    except Exception as e:
        console.print(f"[red]✗ MongoDB connection failed: {e}[/red]")
        sys.exit(1)

    # Check data is loaded
    counts = {
        "alarms": await db[ALARMS].count_documents({}),
        "incidents": await db[INCIDENTS].count_documents({}),
        "runbooks": await db[RUNBOOKS].count_documents({}),
        "network_inventory": await db[NETWORK_INVENTORY].count_documents({}),
    }
    console.print(f"[green]✓ Data loaded:[/green] {counts}")

    if any(v == 0 for v in counts.values()):
        console.print("[red]✗ Some collections are empty. Run 'python scripts/load_data.py' first.[/red]")
        sys.exit(1)

    # Check indexes (basic check — look for search indexes)
    try:
        indexes = list(sync_db[INCIDENTS].list_search_indexes())
        if not indexes:
            console.print("[yellow]⚠ No search indexes found. Run 'python scripts/setup_atlas.py' first.[/yellow]")
            console.print("[yellow]  Continuing anyway — search operations may fail.[/yellow]")
        else:
            ready = sum(1 for idx in indexes if idx.get("status") == "READY")
            console.print(f"[green]✓ Search indexes: {ready}/{len(indexes)} ready[/green]")
    except Exception:
        console.print("[yellow]⚠ Could not check search indexes (requires Atlas).[/yellow]")

    embedder = VoyageEmbedder(api_key=settings.voyage_api_key, model=settings.voyage_model)

    console.print()
    await run_demo(db, embedder, explain_levels=explain_levels)
    MongoDBConnection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="NOC Copilot Demo Runner")
    parser.add_argument(
        "--explain-levels",
        action="store_true",
        help="Show TM Forum Autonomous Network L3→L4 mapping after each alarm",
    )
    args = parser.parse_args()
    asyncio.run(main_async(explain_levels=args.explain_levels))


if __name__ == "__main__":
    main()
