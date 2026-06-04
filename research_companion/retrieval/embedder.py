import os
import sys
from functools import lru_cache
from typing import Any

import structlog

log = structlog.get_logger()

_MODEL_NAME = os.getenv("EMBEDDER_MODEL", "BAAI/bge-m3")
_IS_PACKAGED = getattr(sys, "frozen", False)


class Embedder:
    """Wraps BGE-M3 (primary) with sentence-transformers fallback."""

    def __init__(self, model_name: str = _MODEL_NAME) -> None:
        self.model_name = model_name
        self._model: Any = None
        self._backend: str = ""

    def _load(self) -> None:
        if self._model is not None:
            return

        try:
            if _IS_PACKAGED:
                raise ImportError("skipped in packaged app")
            from FlagEmbedding import BGEM3FlagModel

            self._model = BGEM3FlagModel(self.model_name, use_fp16=True)
            self._backend = "FlagEmbedding"
            log.info("embedder_loaded", backend="FlagEmbedding", model=self.model_name)
        except ImportError:
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(self.model_name)
                self._backend = "sentence-transformers"
                log.info("embedder_loaded", backend="sentence-transformers", model=self.model_name)
            except ImportError as exc:
                raise RuntimeError(
                    "No embedding backend found. Install FlagEmbedding or sentence-transformers."
                ) from exc

    def embed(self, texts: list[str]) -> list[list[float]]:
        self._load()
        if self._backend == "FlagEmbedding":
            result = self._model.encode(
                texts,
                batch_size=16,
                max_length=512,
                return_dense=True,
                return_sparse=False,
                return_colbert_vecs=False,
            )
            return result["dense_vecs"].tolist()
        else:
            return self._model.encode(texts, normalize_embeddings=True).tolist()

    def embed_one(self, text: str) -> list[float]:
        return self.embed([text])[0]
