import uuid
import dataclasses
from pathlib import Path
from typing import Callable

import structlog

from generation.local_reasoner import LocalReasoner
from ingestion.chunker import chunk_document
from ingestion.metadata_extractor import extract_metadata
from ingestion.models import ChunkMetadata, ParseResult
from ingestion.router import PDFRouter

log = structlog.get_logger()


class LocalFolderSource:
    """Ingests all PDFs found recursively under a folder path."""

    def __init__(self) -> None:
        self._router = PDFRouter()
        self._reasoner = LocalReasoner()

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

            for fig_idx, figure in enumerate(result.figures):
                figure_text = self._build_figure_chunk(figure)
                if not figure_text:
                    continue
                figure_meta = dataclasses.replace(
                    base_meta,
                    doc_id=f"{doc_id}__chunk_figure_{fig_idx:04d}",
                    page_number=int(figure.get("page_number", 1) or 1),
                    bbox=figure.get("bbox", []),
                    parser_used=figure.get("parser_used", "figure_parser"),
                    parse_quality="medium",
                    content_type="diagram" if "diagram" in figure.get("figure_type", "") else "figure",
                    figure_type=figure.get("figure_type", ""),
                    caption=figure.get("caption", ""),
                )
                all_chunks.append((figure_text, figure_meta))

            if on_progress:
                on_progress(idx + 1, total)

        log.info("local_folder_ingest_done", total_chunks=len(all_chunks))
        return all_chunks

    def _build_figure_chunk(self, figure: dict) -> str:
        base = figure.get("summary", "").strip()
        structured = self._reasoner.structure_visual_evidence(figure)
        if not structured:
            return base

        parts = [base, "\nLocal visual reasoning:"]
        summary = structured.get("visual_summary", "")
        if summary:
            parts.append(f"- Summary: {summary}")

        entities = structured.get("entities_or_components") or []
        if entities:
            parts.append(f"- Entities/components: {', '.join(str(e) for e in entities)}")

        relations = structured.get("relations_or_flows") or []
        for rel in relations[:8]:
            if not isinstance(rel, dict):
                continue
            name = rel.get("name", "relation")
            participants = ", ".join(str(p) for p in rel.get("participants", []))
            evidence = rel.get("evidence", "")
            certainty = rel.get("certainty", "unknown")
            parts.append(f"- Relation/flow: {name}; participants: {participants}; certainty: {certainty}; evidence: {evidence}")

        uncertainty = structured.get("uncertainty", "")
        if uncertainty:
            parts.append(f"- Uncertainty: {uncertainty}")
        if structured.get("needs_human_check"):
            parts.append("- Human check recommended for exact arrows, directions, and cardinalities.")

        local_model = structured.get("local_model", "")
        if local_model:
            parts.append(f"- Local model: {local_model}")
        return "\n".join(p for p in parts if p)
