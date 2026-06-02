"""Retrieval unit tests using an in-memory ChromaDB instance."""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingestion.models import ChunkMetadata
from retrieval.hybrid_search import HybridSearch, SearchFilters, parse_filters_from_query
from retrieval.vector_store import VectorStore


# ── Filter parsing tests ─────────────────────────────────────────────────────

def test_parse_year_from_korean():
    query, filters = parse_filters_from_query("2022년 이후 attention mechanism 논문")
    assert filters.year_from == 2022
    assert "2022" not in query


def test_parse_year_from_english():
    query, filters = parse_filters_from_query("papers about transformers after 2020")
    assert filters.year_from == 2020


def test_parse_importance():
    query, filters = parse_filters_from_query("중요도 높은 논문만 보여줘")
    assert filters.importance_min == 3


def test_no_filters():
    query, filters = parse_filters_from_query("what is attention mechanism")
    assert filters.year_from == 0
    assert filters.importance_min == 0
    assert query == "what is attention mechanism"


# ── Vector store integration test ────────────────────────────────────────────

class _FakeEmbedder:
    """Deterministic fake embedder for tests."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(ord(c)) / 1000 for c in text[:8].ljust(8)] for text in texts]

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]


@pytest.fixture()
def tmp_store():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield VectorStore(persist_dir=tmpdir)


def _make_chunk(title: str, year: int = 2020, importance: float = 1.0) -> tuple[str, ChunkMetadata]:
    text = f"This paper discusses {title} in detail."
    meta = ChunkMetadata(
        doc_id=f"doc_{title}",
        source=f"/papers/{title}.pdf",
        source_type="pdf",
        is_user_memo=False,
        page_number=1,
        bbox=[0.0, 0.0, 100.0, 20.0],
        parser_used="pymupdf4llm",
        parse_quality="high",
        title=title,
        author="Test Author",
        year=year,
        journal="Test Journal",
        doi="",
        importance_weight=importance,
        collection="/papers",
    )
    return text, meta


def test_add_and_query(tmp_store: VectorStore):
    embedder = _FakeEmbedder()
    chunks = [_make_chunk("attention"), _make_chunk("transformers"), _make_chunk("BERT")]
    embeddings = embedder.embed([c[0] for c in chunks])
    tmp_store.add(chunks, embeddings)

    assert tmp_store.count() == 3

    query_emb = embedder.embed_one("attention mechanism paper")
    results = tmp_store.query(query_emb, n_results=3)
    assert len(results) == 3
    assert all("text" in r for r in results)
    assert all("metadata" in r for r in results)


def test_hybrid_search_returns_results(tmp_store: VectorStore):
    embedder = _FakeEmbedder()
    chunks = [_make_chunk("attention", year=2023), _make_chunk("GAN", year=2019)]
    embeddings = embedder.embed([c[0] for c in chunks])
    tmp_store.add(chunks, embeddings)

    hs = HybridSearch(embedder=embedder, store=tmp_store)
    results = hs.search("neural network", n_results=5)
    assert len(results) >= 1


def test_importance_weighting_boosts_score(tmp_store: VectorStore):
    embedder = _FakeEmbedder()
    low = _make_chunk("paper_low", importance=0.7)
    high = _make_chunk("paper_high", importance=1.5)
    embeddings = embedder.embed([low[0], high[0]])
    tmp_store.add([low, high], embeddings)

    hs = HybridSearch(embedder=embedder, store=tmp_store)
    results = hs.search("paper", n_results=5)
    scores = {r["metadata"]["title"]: r["score"] for r in results}
    if "paper_high" in scores and "paper_low" in scores:
        assert scores["paper_high"] >= scores["paper_low"]
