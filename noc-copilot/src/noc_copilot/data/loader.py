"""Load seed data into MongoDB Atlas with embeddings."""

import logging

from pymongo.database import Database
from rich.console import Console

from noc_copilot.config import get_settings
from noc_copilot.db.collections import (
    ALARMS,
    DIAGNOSES,
    INCIDENTS,
    NETWORK_INVENTORY,
    RUNBOOKS,
    ALL_COLLECTIONS,
)
from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.data.generator import generate_embeddings

logger = logging.getLogger(__name__)
console = Console()


def load_all_data(db: Database) -> None:
    """Drop existing collections, generate embeddings, and load all seed data."""
    settings = get_settings()
    embedder = VoyageEmbedder(
        api_key=settings.voyage_api_key,
        model=settings.voyage_model,
        context_model=settings.voyage_context_model,
    )

    # Clear existing documents for idempotent re-runs (preserves indexes)
    console.print("[yellow]Clearing existing documents...[/yellow]")
    for name in ALL_COLLECTIONS:
        db[name].delete_many({})
    console.print("[green]Documents cleared.[/green]")

    # Generate embeddings
    console.print("[cyan]Generating Voyage AI embeddings (this may take a minute)...[/cyan]")
    network_elements, incidents, runbooks, alarms = generate_embeddings(embedder)

    # Insert documents
    console.print("[cyan]Inserting documents into MongoDB Atlas...[/cyan]")

    if network_elements:
        db[NETWORK_INVENTORY].insert_many(network_elements)
        console.print(f"  [green]✓[/green] {len(network_elements)} network elements → {NETWORK_INVENTORY}")

    if incidents:
        db[INCIDENTS].insert_many(incidents)
        console.print(f"  [green]✓[/green] {len(incidents)} incidents → {INCIDENTS}")

    if runbooks:
        db[RUNBOOKS].insert_many(runbooks)
        console.print(f"  [green]✓[/green] {len(runbooks)} runbooks → {RUNBOOKS}")

    if alarms:
        db[ALARMS].insert_many(alarms)
        console.print(f"  [green]✓[/green] {len(alarms)} alarms → {ALARMS}")

    # Ensure diagnoses collection exists
    if DIAGNOSES not in db.list_collection_names():
        db.create_collection(DIAGNOSES)
    console.print(f"  [green]✓[/green] {DIAGNOSES} collection ready")

    console.print("\n[bold green]Data loading complete![/bold green]")
    console.print(
        f"  Total documents: {len(network_elements) + len(incidents) + len(runbooks) + len(alarms)}"
    )
