import asyncio
import json
import os
import re
from typing import AsyncGenerator

import anthropic
import structlog

from generation.citation_formatter import compute_confidence
from generation.prompt_builder import build_messages
from retrieval.hybrid_search import HybridSearch, SearchFilters
from retrieval.reranker import Reranker

log = structlog.get_logger()

_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 2048


def _source_preview(results: list[dict]) -> list[dict]:
    previews: list[dict] = []
    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        previews.append({
            "index": i,
            "title": meta.get("title") or "Untitled source",
            "author": meta.get("author") or None,
            "year": meta.get("year") or None,
            "source_type": meta.get("source_type", "pdf"),
            "content_type": meta.get("content_type", "text"),
            "figure_type": meta.get("figure_type") or None,
            "caption": meta.get("caption") or None,
            "is_user_memo": bool(meta.get("is_user_memo", False)),
        })
    return previews


def parse_llm_response(raw: str) -> dict:
    match = re.search(r"```json\s*(.*?)\s*```", raw, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return json.loads(raw)


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
        _key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY")
        self._client = anthropic.Anthropic(api_key=_key)
        self._async_client = anthropic.AsyncAnthropic(api_key=_key)

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

        try:
            parsed = parse_llm_response(response.content[0].text)
            return {
                "answer": parsed["answer"],
                "citations": parsed.get("citations", []),
                "confidence": confidence,
            }
        except (json.JSONDecodeError, KeyError) as exc:
            log.warning("llm_response_parse_failed", error=str(exc))
            return {
                "answer": response.content[0].text,
                "citations": [],
                "confidence": confidence,
            }

    async def answer_stream(
        self,
        query: str,
        filters: SearchFilters | None = None,
        conversation_history: list[dict] | None = None,
        top_k: int = 5,
    ) -> AsyncGenerator[dict, None]:
        """Yield SSE-ready dicts: {type: 'token'|'done'|'no_source', ...}"""
        candidates = self.search.search(query, n_results=20, filters=filters)
        results = self.reranker.rerank(query, candidates, top_k=top_k) if self.reranker and candidates else candidates[:top_k]
        confidence = compute_confidence(results)

        if confidence == "no_source":
            yield {"type": "no_source", "answer": "내 라이브러리에서 관련 논문을 찾지 못했습니다. / No relevant papers found in your library.", "citations": [], "confidence": "no_source"}
            return

        yield {"type": "sources", "sources": _source_preview(results)}

        system, messages = build_messages(query, results, conversation_history)
        log.info("rag_streaming_llm", query=query[:80], sources=len(results), model=_MODEL)

        full_text = ""
        # State machine: extract only the "answer" field text as it streams
        _PREFIX = '"answer": "'
        _buf = ""
        _in_answer = False
        _escaped = False
        _answer_done = False

        async with self._async_client.messages.stream(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=messages,
        ) as stream:
            async for chunk in stream.text_stream:
                full_text += chunk

                if _answer_done:
                    continue

                if not _in_answer:
                    _buf += chunk
                    idx = _buf.find(_PREFIX)
                    if idx != -1:
                        _in_answer = True
                        _buf = _buf[idx + len(_PREFIX):]
                        chunk = _buf
                        _buf = ""
                    else:
                        continue

                # extract printable chars from the "answer" JSON string
                out = []
                for ch in chunk:
                    if _escaped:
                        if ch == 'n':   out.append('\n')
                        elif ch == 't': out.append('\t')
                        elif ch == '"': out.append('"')
                        elif ch == '\\': out.append('\\')
                        else:           out.append(ch)
                        _escaped = False
                    elif ch == '\\':
                        _escaped = True
                    elif ch == '"':
                        _answer_done = True
                        break
                    else:
                        out.append(ch)

                if out:
                    yield {"type": "token", "text": "".join(out)}

        try:
            parsed = parse_llm_response(full_text)
            yield {"type": "done", "citations": parsed.get("citations", []), "confidence": confidence}
        except (json.JSONDecodeError, KeyError):
            yield {"type": "done", "citations": [], "confidence": confidence}
