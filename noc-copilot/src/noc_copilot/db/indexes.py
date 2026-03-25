"""Full Text Search and Vector Search index creation helpers."""

import time

from pymongo.operations import SearchIndexModel
from rich.console import Console

from noc_copilot.db.collections import ALARMS, INCIDENTS, RUNBOOKS
from noc_copilot.db.connection import MongoDBConnection

console = Console()

# ---------------------------------------------------------------------------
# Vector Search index definitions (type: "vectorSearch")
# ---------------------------------------------------------------------------

ALARMS_VECTOR_INDEX = SearchIndexModel(
    definition={
        "fields": [
            {
                "type": "vector",
                "path": "embedding",
                "numDimensions": 1024,
                "similarity": "cosine",
            },
            {"type": "filter", "path": "category"},
            {"type": "filter", "path": "severity"},
            {"type": "filter", "path": "status"},
        ],
    },
    name="alarms_vector_index",
    type="vectorSearch",
)

INCIDENTS_VECTOR_INDEX = SearchIndexModel(
    definition={
        "fields": [
            {
                "type": "vector",
                "path": "embedding",
                "numDimensions": 1024,
                "similarity": "cosine",
            },
            {"type": "filter", "path": "category"},
            {"type": "filter", "path": "severity"},
        ],
    },
    name="incidents_vector_index",
    type="vectorSearch",
)

RUNBOOKS_VECTOR_INDEX = SearchIndexModel(
    definition={
        "fields": [
            {
                "type": "vector",
                "path": "embedding",
                "numDimensions": 1024,
                "similarity": "cosine",
            },
            {"type": "filter", "path": "domain"},
            {"type": "filter", "path": "applicable_to"},
        ],
    },
    name="runbooks_vector_index",
    type="vectorSearch",
)

# ---------------------------------------------------------------------------
# Full-text Search index definitions (type: "search" — the default)
# ---------------------------------------------------------------------------

RUNBOOKS_SEARCH_INDEX = SearchIndexModel(
    definition={
        "mappings": {
            "dynamic": False,
            "fields": {
                "title": {"type": "string", "analyzer": "lucene.standard"},
                "section_title": {"type": "string", "analyzer": "lucene.standard"},
                "content": {"type": "string", "analyzer": "lucene.standard"},
                "domain": {"type": "stringFacet"},
                "applicable_to": {"type": "stringFacet"},
                "runbook_id": {"type": "string", "analyzer": "lucene.keyword"},
            },
        },
    },
    name="runbooks_search_index",
    type="search",
)

INCIDENTS_SEARCH_INDEX = SearchIndexModel(
    definition={
        "mappings": {
            "dynamic": False,
            "fields": {
                "title": {"type": "string", "analyzer": "lucene.standard"},
                "description": {"type": "string", "analyzer": "lucene.standard"},
                "root_cause": {"type": "string", "analyzer": "lucene.standard"},
                "resolution": {"type": "string", "analyzer": "lucene.standard"},
                "tags": {"type": "string", "analyzer": "lucene.keyword"},
                "category": {"type": "stringFacet"},
                "severity": {"type": "stringFacet"},
            },
        },
    },
    name="incidents_search_index",
    type="search",
)

# ---------------------------------------------------------------------------
# Mapping: collection name -> list of indexes to create on that collection
# ---------------------------------------------------------------------------

COLLECTION_INDEXES: dict[str, list[SearchIndexModel]] = {
    ALARMS: [ALARMS_VECTOR_INDEX],
    INCIDENTS: [INCIDENTS_VECTOR_INDEX, INCIDENTS_SEARCH_INDEX],
    RUNBOOKS: [RUNBOOKS_VECTOR_INDEX, RUNBOOKS_SEARCH_INDEX],
}


def wait_for_indexes(
    poll_interval: float = 5.0,
    timeout: float = 300.0,
) -> None:
    """Poll all search indexes until every one reports READY status.

    Parameters
    ----------
    poll_interval:
        Seconds between status checks.
    timeout:
        Maximum seconds to wait before raising ``TimeoutError``.
    """
    db = MongoDBConnection.get_sync_db()
    start = time.monotonic()

    # Build a set of (collection, index_name) pairs we need to track.
    pending: set[tuple[str, str]] = set()
    for collection_name, index_models in COLLECTION_INDEXES.items():
        for model in index_models:
            pending.add((collection_name, model.document["name"]))

    console.print(
        f"[bold blue]Waiting for {len(pending)} search index(es) to become READY ...[/]"
    )

    while pending:
        elapsed = time.monotonic() - start
        if elapsed > timeout:
            raise TimeoutError(
                f"Timed out after {timeout}s waiting for indexes: "
                f"{', '.join(f'{c}.{n}' for c, n in sorted(pending))}"
            )

        still_pending: set[tuple[str, str]] = set()
        for collection_name, index_name in pending:
            collection = db[collection_name]
            ready = False
            try:
                for idx in collection.list_search_indexes(name=index_name):
                    if idx.get("status") == "READY":
                        console.print(
                            f"  [green]\u2713[/] {collection_name}.{index_name} is READY"
                        )
                        ready = True
                        break
            except Exception as exc:
                console.print(
                    f"  [yellow]Warning:[/] could not query index "
                    f"{collection_name}.{index_name}: {exc}"
                )
            if not ready:
                still_pending.add((collection_name, index_name))

        pending = still_pending
        if pending:
            console.print(
                f"  [dim]{len(pending)} index(es) still pending, "
                f"rechecking in {poll_interval}s ...[/]"
            )
            time.sleep(poll_interval)

    console.print("[bold green]All search indexes are READY.[/]")


def create_all_indexes(*, wait: bool = True) -> list[str]:
    """Create every Full Text Search / Vector Search index defined above.

    Parameters
    ----------
    wait:
        If ``True`` (default), block until all indexes report READY.

    Returns
    -------
    list[str]
        Names of the indexes that were created.
    """
    db = MongoDBConnection.get_sync_db()
    created: list[str] = []

    # Ensure collections exist before creating search indexes.
    existing = set(db.list_collection_names())
    for collection_name in COLLECTION_INDEXES:
        if collection_name not in existing:
            db.create_collection(collection_name)
            console.print(f"[dim]Created collection [cyan]{collection_name}[/cyan][/dim]")

    for collection_name, index_models in COLLECTION_INDEXES.items():
        collection = db[collection_name]
        for model in index_models:
            index_name = model.document["name"]
            try:
                console.print(
                    f"[bold]Creating index [cyan]{index_name}[/cyan] "
                    f"on [cyan]{collection_name}[/cyan] ...[/]"
                )
                result = collection.create_search_index(model)
                console.print(f"  [green]Created:[/] {result}")
                created.append(index_name)
            except Exception as exc:
                # If the index already exists Atlas returns an error; log and
                # continue so the function is idempotent.
                console.print(
                    f"  [yellow]Skipped {index_name}:[/] {exc}"
                )

    if wait and created:
        wait_for_indexes()

    return created
