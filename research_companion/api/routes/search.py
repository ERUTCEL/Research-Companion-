from fastapi import APIRouter, Depends, Query

from api.schemas import SearchResponse, SearchResult
from retrieval.embedder import Embedder
from retrieval.hybrid_search import HybridSearch, SearchFilters
from retrieval.vector_store import VectorStore

router = APIRouter(prefix="/search", tags=["search"])


def _get_search() -> HybridSearch:
    return HybridSearch(embedder=Embedder(), store=VectorStore())


@router.get("", response_model=SearchResponse)
async def search_papers(
    q: str = Query(..., description="Search query"),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    author: str | None = Query(None),
    importance_min: int | None = Query(None, ge=1, le=3),
    limit: int = Query(10, ge=1, le=50),
    search: HybridSearch = Depends(_get_search),
) -> SearchResponse:
    filters = SearchFilters(
        year_from=year_from or 0,
        year_to=year_to or 0,
        importance_min=importance_min or 0,
        author=author or "",
    )
    raw = search.search(q, n_results=limit, filters=filters)

    results = [
        SearchResult(
            text=r["text"],
            score=round(r["score"], 4),
            title=r["metadata"].get("title", ""),
            author=r["metadata"].get("author", ""),
            year=r["metadata"].get("year", 0),
            page_number=r["metadata"].get("page_number", 0),
            source_type=r["metadata"].get("source_type", "pdf"),
            is_user_memo=bool(r["metadata"].get("is_user_memo", False)),
            parse_quality=r["metadata"].get("parse_quality", "high"),
        )
        for r in raw
    ]
    return SearchResponse(results=results, total=len(results))
