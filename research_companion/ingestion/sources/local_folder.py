import uuid
from pathlib import Path
from typing import Callable

import structlog

from ingestion.chunker import chunk_document
from ingestion.metadata_extractor import extract_metadata
from ingestion.models import ChunkMetadata, ParseResult
from ingestion.router import PDFRouter

log = structlog.get_logger()


class LocalFolderSource:
    """Ingests all PDFs found recursively under a folder path."""

    def __init__(self) -> None:
        self._router = PDFRouter()

    def ingest(
        self,
        folder_path: str,
        on_progress: Callable[[int, int], None] | None = None,
    ) -> list[tuple[str, ChunkMetadata]]:
        """Return all (chunk_text, metadata) pairs for every PDF in folder_path."""
        pdfs = sorted(Path(folder_path).rglob("*.pdf"))
        total = len(pdfs)
        log.info("local_folder_ingest_start", folder=folder_path, total_pdfs=total)

        all_chunks: list[tuple[str, ChunkMetadata]] = []

        for idx, pdf_path in enumerate(pdfs):
            result = self._router.parse(str(pdf_path))
            if not result.success:
                log.warning("pdf_skipped", path=str(pdf_path), error=result.error)
                if on_progress:
                    on_progress(idx + 1, total)
                continue

            meta_dict = extract_metadata(str(pdf_path), result.text)
            doc_id = str(uuid.uuid4())

            base_meta = ChunkMetadata(
                doc_id=doc_id,
                source=str(pdf_path),
                source_type="pdf",
                is_user_memo=False,
                page_number=1,
                bbox=[],
                parser_used=result.parser_used,
                parse_quality=result.parse_quality,
                title=meta_dict.get("title", pdf_path.stem),
                author=meta_dict.get("author", ""),
                year=meta_dict.get("year", 0),
                journal=meta_dict.get("journal", ""),
                doi=meta_dict.get("doi", ""),
                collection=str(pdf_path.parent),
            )

            if not base_meta.source or base_meta.page_number is None:
                log.warning("chunk_rejected_missing_fields", path=str(pdf_path))
                continue

            for chunk_text, chunk_meta in chunk_document(result.text, base_meta, result.page_count):
                all_chunks.append((chunk_text, chunk_meta))

            if on_progress:
                on_progress(idx + 1, total)

        log.info("local_folder_ingest_done", total_chunks=len(all_chunks))
        return all_chunks
