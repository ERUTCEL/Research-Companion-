import os

import anthropic
import structlog

from generation.citation_formatter import compute_confidence, format_citations
from generation.prompt_builder import build_messages
from retrieval.hybrid_search import HybridSearch, SearchFilters
from retrieval.reranker import Reranker

log = structlog.get_logger()

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 2048


class RAGPipeline:
    """End-to-end RAG: search → rerank → generate."""

    def __init__(
        self,
        search: HybridSearch,
        reranker: Reranker | None = None,
        anthropic_api_key: str | None = None,
    ) -> None:
        self.search = search
        self.reranker = reranker
        self._client = anthropic.Anthropic(api_key=anthropic_api_key or os.getenv("ANTHROPIC_API_KEY"))

    def answer(
        self,
        query: str,
        filters: SearchFilters | None = None,
        conversation_history: list[dict] | None = None,
        top_k: int = 5,
    ) -> dict:
        # 1. Retrieve
        candidates = self.search.search(query, n_results=20, filters=filters)

        # 2. Rerank
        if self.reranker and candidates:
            results = self.reranker.rerank(query, candidates, top_k=top_k)
        else:
            results = candidates[:top_k]

        confidence = compute_confidence(results)

        # 3. Skip LLM if no sources — saves API cost
        if confidence == "no_source":
            log.info("rag_no_source", query=query[:80])
            return {
                "answer": "내 라이브러리에서 관련 논문을 찾지 못했습니다. / No relevant papers found in your library.",
                "citations": [],
                "confidence": "no_source",
            }

        # 4. Generate
        system, messages = build_messages(query, results, conversation_history)
        log.info("rag_calling_llm", query=query[:80], sources=len(results), model=_MODEL)

        response = self._client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=messages,
        )
        answer_text = response.content[0].text

        return {
            "answer": answer_text,
            "citations": format_citations(results),
            "confidence": confidence,
        }
