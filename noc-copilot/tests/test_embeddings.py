"""Tests for Voyage AI embedding client."""

import os
import pytest

from noc_copilot.embeddings.voyage import VoyageEmbedder


@pytest.fixture
def embedder():
    api_key = os.environ.get("VOYAGE_API_KEY")
    if not api_key:
        pytest.skip("VOYAGE_API_KEY not set")
    return VoyageEmbedder(api_key=api_key)


def test_embed_query_returns_vector(embedder):
    result = embedder.embed_query("high BLER on 5G NR cell")
    assert isinstance(result, list)
    assert len(result) == 1024
    assert all(isinstance(x, float) for x in result)


def test_embed_documents_returns_vectors(embedder):
    texts = ["alarm: high BLER", "incident: antenna tilt misconfiguration"]
    results = embedder.embed_documents(texts)
    assert len(results) == 2
    assert all(len(v) == 1024 for v in results)


def test_asymmetric_embeddings_differ(embedder):
    text = "UL BLER exceeding threshold on sector 2"
    doc_emb = embedder.embed_documents([text])[0]
    query_emb = embedder.embed_query(text)
    # Document and query embeddings for the same text should differ
    # (asymmetric embedding model)
    assert doc_emb != query_emb
