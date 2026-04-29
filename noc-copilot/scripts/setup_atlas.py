#!/usr/bin/env python3
"""Create Full Text Search and Vector Search indexes."""

import sys
from pathlib import Path

# Allow running from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from rich.console import Console

from noc_copilot.config import get_settings
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.db.indexes import create_all_indexes

console = Console()


def main() -> None:
    console.print("[bold cyan]NOC Copilot — Search Index Setup[/bold cyan]\n")

    settings = get_settings()
    console.print(f"Database: [yellow]{settings.mongodb_database}[/yellow]")

    db = MongoDBConnection.get_sync_db()

    # Verify connection
    try:
        db.command("ping")
        console.print("[green]✓ MongoDB connection successful[/green]\n")
    except Exception as e:
        console.print(f"[red]✗ MongoDB connection failed: {e}[/red]")
        sys.exit(1)

    # Create indexes (and wait for them to become READY)
    create_all_indexes()

    console.print("\n[bold green]All indexes are ready![/bold green]")
    MongoDBConnection.close()


if __name__ == "__main__":
    main()
