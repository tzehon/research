"""Data generator with embedding generation via Voyage AI."""

import logging
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

from noc_copilot.embeddings.voyage import VoyageEmbedder
from noc_copilot.data.seed_data import NETWORK_ELEMENTS, INCIDENTS, RUNBOOKS, DEMO_ALARMS

logger = logging.getLogger(__name__)
console = Console()


def compose_alarm_text(alarm: dict) -> str:
    """Compose embedding text from alarm fields."""
    return f"{alarm['severity']} {alarm['category']} {alarm['description']}"


def compose_incident_text(incident: dict) -> str:
    """Compose embedding text from incident fields."""
    return f"{incident['title']} {incident['root_cause']} {incident['resolution']}"


def compose_runbook_text(runbook: dict) -> str:
    """Compose embedding text from runbook fields."""
    return f"{runbook['title']} {runbook['section_title']} {runbook['content']}"


def generate_embeddings(embedder: VoyageEmbedder) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """Generate embeddings for all seed data and return enriched documents.

    Returns (network_elements, incidents, runbooks, alarms) with embeddings attached.
    """
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        console=console,
    ) as progress:
        # Incidents
        task = progress.add_task("Embedding incidents...", total=len(INCIDENTS))
        incident_texts = [compose_incident_text(inc) for inc in INCIDENTS]
        incident_embeddings = embedder.embed_documents(incident_texts)
        incidents = []
        for inc, emb in zip(INCIDENTS, incident_embeddings):
            doc = dict(inc)
            doc["embedding"] = emb
            incidents.append(doc)
            progress.advance(task)

        # Runbooks — use contextualized chunk embeddings (voyage-context-3)
        # Sections from the same runbook are embedded together so each
        # section's vector encodes both its own content and the surrounding
        # runbook context.
        task = progress.add_task("Embedding runbooks (contextualized)...", total=len(RUNBOOKS))
        runbook_embeddings = embedder.embed_runbook_chunks(RUNBOOKS)
        runbooks = []
        for rb, emb in zip(RUNBOOKS, runbook_embeddings):
            doc = dict(rb)
            doc["embedding"] = emb
            runbooks.append(doc)
            progress.advance(task)

        # Alarms
        task = progress.add_task("Embedding alarms...", total=len(DEMO_ALARMS))
        alarm_texts = [compose_alarm_text(a) for a in DEMO_ALARMS]
        alarm_embeddings = embedder.embed_documents(alarm_texts)
        alarms = []
        for alm, emb in zip(DEMO_ALARMS, alarm_embeddings):
            doc = dict(alm)
            doc["embedding"] = emb
            alarms.append(doc)
            progress.advance(task)

    # Network elements don't need embeddings
    network_elements = [dict(ne) for ne in NETWORK_ELEMENTS]

    console.print(
        f"[green]Embedding generation complete:[/green] "
        f"{len(incidents)} incidents, {len(runbooks)} runbooks, {len(alarms)} alarms"
    )
    return network_elements, incidents, runbooks, alarms
