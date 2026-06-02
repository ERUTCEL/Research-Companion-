import structlog

log = structlog.get_logger()

_MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"


class Reranker:
    """Cross-encoder reranker. Reduces top-N to top-K with better relevance."""

    def __init__(self, model_name: str = _MODEL_NAME) -> None:
        self.model_name = model_name
        self._model = None

    def _load(self) -> None:
        if self._model is not None:
            return
        try:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(self.model_name)
            log.info("reranker_loaded", model=self.model_name)
        except ImportError as exc:
            raise RuntimeError(
                "sentence-transformers not installed; run: pip install sentence-transformers"
            ) from exc

    def rerank(self, query: str, results: list[dict], top_k: int = 5) -> list[dict]:
        if not results:
            return []

        try:
            self._load()
        except RuntimeError:
            log.warning("reranker_unavailable_falling_back")
            return results[:top_k]

        pairs = [(query, r["text"]) for r in results]
        scores = self._model.predict(pairs)

        for result, score in zip(results, scores):
            result["rerank_score"] = float(score)

        reranked = sorted(results, key=lambda r: r["rerank_score"], reverse=True)
        log.info("reranker_done", input=len(results), output=top_k)
        return reranked[:top_k]
