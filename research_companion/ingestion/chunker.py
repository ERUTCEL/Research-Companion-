import re
import uuid
from typing import Generator

import structlog

from ingestion.models import ChunkMetadata

log = structlog.get_logger()

CHUNK_CONFIG: dict[str, dict[str, int]] = {
    "default":    {"chunk_size": 512,  "chunk_overlap": 64},
    "long_paper": {"chunk_size": 1024, "chunk_overlap": 128},
    "korean":     {"chunk_size": 400,  "chunk_overlap": 50},
    "notion_memo": {"chunk_size": 256, "chunk_overlap": 32},
}

_KOREAN_RE = re.compile(r"[가-힣]")


def _detect_mode(text: str, page_count: int, source_type: str) -> str:
    if source_type in ("notion_memo",):
        return "notion_memo"
    if _KOREAN_RE.search(text[:1000]):
        return "korean"
    if page_count >= 30:
        return "long_paper"
    return "default"


def _split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Simple sentence-aware splitter that respects chunk_size (in words)."""
    sentences = re.split(r"(?<=[.!?])\s+|\n\n+", text)
    chunks: list[str] = []
    current_words: list[str] = []
    current_len = 0

    for sentence in sentences:
        words = sentence.split()
        if not words:
            continue

        if current_len + len(words) > chunk_size and current_words:
            chunks.append(" ".join(current_words))
            # keep overlap
            overlap_words = current_words[-chunk_overlap:] if chunk_overlap else []
            current_words = overlap_words + words
            current_len = len(current_words)
        else:
            current_words.extend(words)
            current_len += len(words)

    if current_words:
        chunks.append(" ".join(current_words))

    return [c for c in chunks if c.strip()]


def chunk_document(
    text: str,
    base_metadata: ChunkMetadata,
    page_count: int = 0,
) -> Generator[tuple[str, ChunkMetadata], None, None]:
    """Yield (chunk_text, ChunkMetadata) pairs for a single document."""
    mode = _detect_mode(text, page_count, base_metadata.source_type)
    cfg = CHUNK_CONFIG[mode]

    chunks = _split_text(text, cfg["chunk_size"], cfg["chunk_overlap"])
    log.info(
        "chunking_done",
        doc_id=base_metadata.doc_id,
        mode=mode,
        chunk_count=len(chunks),
        chunk_size=cfg["chunk_size"],
    )

    for i, chunk_text in enumerate(chunks):
        import dataclasses

        meta = dataclasses.replace(
            base_metadata,
            doc_id=f"{base_metadata.doc_id}__chunk_{i:04d}",
        )
        yield chunk_text, meta
