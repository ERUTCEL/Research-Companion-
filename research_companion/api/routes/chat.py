from fastapi import APIRouter

from api.schemas import ChatRequest, ChatResponse, Citation
from generation.rag_pipeline import RAGPipeline
from retrieval.embedder import Embedder
from retrieval.hybrid_search import HybridSearch, SearchFilters
from retrieval.reranker import Reranker
from retrieval.vector_store import VectorStore

router = APIRouter(prefix="/chat", tags=["chat"])


def _build_pipeline() -> RAGPipeline:
    embedder = Embedder()
    store = VectorStore()
    search = HybridSearch(embedder=embedder, store=store)
    reranker = Reranker()
    return RAGPipeline(search=search, reranker=reranker)


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    pipeline = _build_pipeline()

    f = req.filters
    filters = SearchFilters(
        year_from=f.year_from or 0,
        year_to=f.year_to or 0,
        importance_min=f.importance_min or 0,
        author=f.author or "",
    )

    history = [{"role": m.role, "content": m.content} for m in req.conversation_history]
    result = pipeline.answer(req.query, filters=filters, conversation_history=history)

    citations = [Citation(**c) for c in result["citations"]]
    return ChatResponse(
        answer=result["answer"],
        citations=citations,
        confidence=result["confidence"],
    )
