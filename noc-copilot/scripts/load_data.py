#!/usr/bin/env python3
"""Seed the database with telco data and Voyage AI embeddings."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from rich.console import Console

from noc_copilot.config import get_settings
from noc_copilot.db.connection import MongoDBConnection
from noc_copilot.data.loader import load_all_data

console = Console()


def main() -> None:
    console.print("[bold cyan]NOC Copilot — Data Loader[/bold cyan]\n")

    settings = get_settings()
    console.print(f"Database: [yellow]{settings.mongodb_database}[/yellow]")
    console.print(f"Voyage model: [yellow]{settings.voyage_model}[/yellow]\n")

    db = MongoDBConnection.get_sync_db()

    # Verify connection
    try:
        db.command("ping")
        console.print("[green]✓ MongoDB connection successful[/green]\n")
    except Exception as e:
        console.print(f"[red]✗ MongoDB connection failed: {e}[/red]")
        sys.exit(1)

    load_all_data(db)
    MongoDBConnection.close()


if __name__ == "__main__":
    main()
