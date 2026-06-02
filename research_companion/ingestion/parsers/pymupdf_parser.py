import time
from pathlib import Path

import structlog

from ingestion.models import ParseResult

log = structlog.get_logger()


class PyMuPDFParser:
    """Fast CPU-based parser for native-text PDFs."""

    def parse(self, pdf_path: str) -> ParseResult:
        start = time.perf_counter()
        path = Path(pdf_path)

        try:
            import pymupdf4llm

            md_text = pymupdf4llm.to_markdown(str(path))
            page_count = self._get_page_count(str(path))

            elapsed = time.perf_counter() - start
            log.info(
                "pymupdf_parse_done",
                path=str(path),
                parser="pymupdf4llm",
                pages=page_count,
                elapsed_s=round(elapsed, 3),
            )
            return ParseResult(
                success=True,
                text=md_text,
                page_count=page_count,
                parser_used="pymupdf4llm",
                parse_quality="high",
            )
        except Exception as exc:
            elapsed = time.perf_counter() - start
            log.warning("pymupdf_parse_failed", path=str(path), error=str(exc), elapsed_s=round(elapsed, 3))
            return ParseResult(success=False, parser_used="pymupdf4llm", error=str(exc))

    def _get_page_count(self, pdf_path: str) -> int:
        try:
            import pymupdf

            doc = pymupdf.open(pdf_path)
            count = doc.page_count
            doc.close()
            return count
        except Exception:
            return 0

    def extract_blocks(self, pdf_path: str) -> list[dict]:
        """Return raw block dicts with bbox and text for layout analysis."""
        try:
            import pymupdf

            doc = pymupdf.open(pdf_path)
            blocks: list[dict] = []
            for page in doc:
                for block in page.get_text("blocks"):
                    x0, y0, x1, y1, text, block_no, block_type = block
                    blocks.append(
                        {
                            "page": page.number,
                            "bbox": [x0, y0, x1, y1],
                            "text": text,
                            "block_type": block_type,
                        }
                    )
            doc.close()
            return blocks
        except Exception:
            return []
