import re
from dataclasses import dataclass

import structlog

from retrieval.embedder import Embedder
from retrieval.vector_store import VectorStore

log = structlog.get_logger()

_YEAR_RE = re.compile(r"(20\d{2}|19\d{2})\s*년?\s*이후|after\s*(20\d{2}|19\d{2})", re.IGNORECASE)
_YEAR_TO_RE = re.compile(r"(20\d{2}|19\d{2})\s*년?\s*이전|before\s*(20\d{2}|19\d{2})", re.IGNORECASE)
_IMPORTANCE_RE = re.compile(r"중요도\s*(높|★★★|3)|importance\s*high|star\s*3", re.IGNORECASE)
_AUTHOR_RE = re.compile(r"저자\s+([가-힣a-zA-Z\s]+)|author[:\s]+([a-zA-Z\s]+)", re.IGNORECASE)


@dataclass
class SearchFilters:
    year_from: int = 0
    year_to: int = 0
    importance_min: int = 0
    author: str = ""


def parse_filters_from_query(query: str) -> tuple[str, SearchFilters]:
    """Extract metadata filters from natural language query. Returns (cleaned_query, filters)."""
    filters = SearchFilters()
    cleaned = query

    m = _YEAR_RE.search(query)
    if m:
        year_str = m.group(1) or m.group(2)
        filters.year_from = int(year_str)
        cleaned = cleaned.replace(m.group(), "").strip()

    m = _YEAR_TO_RE.search(query)
    if m:
        year_str = m.group(1) or m.group(2)
        filters.year_to = int(year_str)
        cleaned = cleaned.replace(m.group(), "").strip()

    if _IMPORTANCE_RE.search(query):
        filters.importance_min = 3
        cleaned = _IMPORTANCE_RE.sub("", cleaned).strip()

    m = _AUTHOR_RE.search(query)
    if m:
        filters.author = (m.group(1) or m.group(2) or "").strip()
        cleaned = cleaned.replace(m.group(), "").strip()

    return cleaned.strip(), filters


def _build_where(filters: SearchFilters, extra: dict | None = None) -> dict | None:
    conditions: list[dict] = []

    if filters.year_from:
        conditions.append({"year": {"$gte": filters.year_from}})
    if filters.year_to:
        conditions.append({"year": {"$lte": filters.year_to}})
    if filters.importance_min == 3:
        conditions.append({"importance_weight": {"$gte": 1.4}})
    if filters.author:
        conditions.append({"author": {"$contains": filters.author}})

    if extra:
        for k, v in extra.items():
            conditions.append({k: {"$eq": v}})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


class HybridSearch:
    """Vector search + metadata filtering + importance weighting."""

    def __init__(self, embedder: Embedder, store: VectorStore) -> None:
        self.embedder = embedder
        self.store = store

    def search(
        self,
        query: str,
        n_results: int = 20,
        filters: SearchFilters | None = None,
        extra_where: dict | None = None,
    ) -> list[dict]:
        cleaned_query, auto_filters = parse_filters_from_query(query)
        active_filters = filters or auto_filters

        embedding = self.embedder.embed_one(cleaned_query)
        where = _build_where(active_filters, extra_where)

        results = self.store.query(embedding, n_results=n_results, where=where)

        # Apply importance weighting to scores
        for r in results:
            weight = float(r["metadata"].get("importance_weight", 1.0))
            r["score"] = r["score"] * weight

        results.sort(key=lambda r: r["score"], reverse=True)
        log.info(
            "hybrid_search_done",
            query=cleaned_query[:80],
            filters=str(active_filters),
            results=len(results),
        )
        return results
