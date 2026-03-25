"""Voyage AI embedding client wrapper.

Uses two models:
- **voyage-4-large**: Standard embeddings for incidents, alarms, and queries.
  Uses asymmetric encoding (input_type="document" for storage, "query" for search).
- **voyage-context-3**: Contextualized chunk embeddings for runbooks.
  Chunks from the same runbook are embedded together in a single pass so each
  chunk's embedding encodes both its own content and the global document context.
"""

import time
import logging
from itertools import groupby
from operator import itemgetter

import voyageai

logger = logging.getLogger(__name__)


class VoyageEmbedder:
    """Wrapper for Voyage AI embedding APIs with batching and retry."""

    def __init__(
        self,
        api_key: str,
        model: str = "voyage-4-large",
        context_model: str = "voyage-context-3",
    ):
        self.client = voyageai.Client(api_key=api_key)
        self.model = model
        self.context_model = context_model

    # ------------------------------------------------------------------
    # Standard embeddings (voyage-4-large)
    # ------------------------------------------------------------------

    def embed_documents(self, texts: list[str], batch_size: int = 50) -> list[list[float]]:
        """Embed documents in batches using voyage-4-large.

        Uses input_type='document' for asymmetric retrieval.
        """
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            for attempt in range(3):
                try:
                    result = self.client.embed(batch, model=self.model, input_type="document")
                    all_embeddings.extend(result.embeddings)
                    break
                except Exception as e:
                    if attempt < 2:
                        wait = 2 ** (attempt + 1)
                        logger.warning("Voyage API error (attempt %d): %s. Retrying in %ds", attempt + 1, e, wait)
                        time.sleep(wait)
                    else:
                        raise
            if i + batch_size < len(texts):
                time.sleep(0.5)  # rate limit buffer between batches
        return all_embeddings

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query using voyage-4-large.

        Uses input_type='query' for asymmetric search.
        """
        result = self.client.embed([text], model=self.model, input_type="query")
        return result.embeddings[0]

    # ------------------------------------------------------------------
    # Contextualized chunk embeddings (voyage-context-3)
    # ------------------------------------------------------------------

    def embed_runbook_chunks(
        self,
        runbooks: list[dict],
    ) -> list[list[float]]:
        """Embed runbook sections using voyage-context-3 contextualized chunk embeddings.

        Sections belonging to the same runbook_id are grouped and embedded
        together so that each section's embedding encodes both its own content
        and the context of the other sections in the same runbook.

        Args:
            runbooks: List of runbook dicts, each with at least 'runbook_id',
                'title', 'section_title', 'section_number', and 'content'.

        Returns:
            List of embeddings in the same order as the input runbooks list.
        """
        # Group sections by runbook_id, preserving original order indices
        indexed = [(i, rb) for i, rb in enumerate(runbooks)]
        indexed.sort(key=lambda x: (x[1]["runbook_id"], x[1].get("section_number", 0)))

        # Build inputs: one inner list per runbook (ordered sections)
        groups: list[list[tuple[int, dict]]] = []
        for _key, group_iter in groupby(indexed, key=lambda x: x[1]["runbook_id"]):
            groups.append(list(group_iter))

        # Compose text for each chunk
        all_embeddings: list[tuple[int, list[float]]] = []

        for group in groups:
            # Each inner list = one runbook's sections in order
            chunk_texts = [
                f"{rb['title']} - {rb['section_title']}: {rb['content']}"
                for _, rb in group
            ]
            original_indices = [idx for idx, _ in group]

            for attempt in range(3):
                try:
                    result = self.client.contextualized_embed(
                        inputs=[chunk_texts],
                        model=self.context_model,
                        input_type="document",
                    )
                    # result.results is a list (one per inner list).
                    # Each result has .embeddings — one embedding per chunk.
                    embeddings = result.results[0].embeddings
                    for idx, emb in zip(original_indices, embeddings):
                        all_embeddings.append((idx, emb))
                    break
                except Exception as e:
                    if attempt < 2:
                        wait = 2 ** (attempt + 1)
                        logger.warning(
                            "Voyage contextualized_embed error (attempt %d): %s. Retrying in %ds",
                            attempt + 1, e, wait,
                        )
                        time.sleep(wait)
                    else:
                        raise

            time.sleep(0.5)  # rate limit buffer between runbook groups

        # Re-sort by original index to match input order
        all_embeddings.sort(key=itemgetter(0))
        return [emb for _, emb in all_embeddings]
