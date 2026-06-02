import dataclasses
import os
import uuid
from typing import Any

import structlog

from ingestion.models import ChunkMetadata

log = structlog.get_logger()

_CHROMA_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
_COLLECTION_NAME = "research_papers"


class VectorStore:
    """ChromaDB-backed vector store with metadata filtering."""

    def __init__(self, persist_dir: str = _CHROMA_DIR) -> None:
        self.persist_dir = persist_dir
        self._client = None
        self._collection = None

    def _get_collection(self):
        if self._collection is None:
            import chromadb

            self._client = chromadb.PersistentClient(path=self.persist_dir)
            self._collection = self._client.get_or_create_collection(
                name=_COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )
            log.info("chroma_collection_ready", name=_COLLECTION_NAME, dir=self.persist_dir)
        return self._collection

    def add(
        self,
        chunks: list[tuple[str, ChunkMetadata]],
        embeddings: list[list[float]],
    ) -> None:
        col = self._get_collection()
        ids = []
        docs = []
        metas = []

        for (text, meta), emb in zip(chunks, embeddings):
            cid = meta.doc_id or str(uuid.uuid4())
            ids.append(cid)
            docs.append(text)
            metas.append(_meta_to_dict(meta))

        col.add(ids=ids, documents=docs, embeddings=embeddings, metadatas=metas)
        log.info("vector_store_added", count=len(ids))

    def query(
        self,
        query_embedding: list[float],
        n_results: int = 20,
        where: dict | None = None,
    ) -> list[dict]:
        col = self._get_collection()
        kwargs: dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where

        results = col.query(**kwargs)
        out: list[dict] = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            out.append({"text": doc, "metadata": meta, "score": 1.0 - dist})
        return out

    def delete_by_source(self, source: str) -> None:
        col = self._get_collection()
        col.delete(where={"source": source})
        log.info("vector_store_deleted", source=source)

    def count(self) -> int:
        return self._get_collection().count()


def _meta_to_dict(meta: ChunkMetadata) -> dict:
    d = dataclasses.asdict(meta)
    # ChromaDB requires scalar values; convert lists to strings
    d["bbox"] = str(d.get("bbox", []))
    # Drop None values — ChromaDB dislikes them
    return {k: (v if v is not None else "") for k, v in d.items()}
