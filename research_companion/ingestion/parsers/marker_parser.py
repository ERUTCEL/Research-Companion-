import time
from pathlib import Path

import structlog

from ingestion.models import ParseResult

log = structlog.get_logger()


class MarkerParser:
    """GPU-accelerated parser for complex multi-column layouts."""

    def parse(self, pdf_path: str) -> ParseResult:
        start = time.perf_counter()
        path = Path(pdf_path)

        try:
            from marker.convert import convert_single_pdf
            from marker.models import load_all_models

            models = load_all_models()
            full_text, images, out_meta = convert_single_pdf(str(path), models)

            page_count = out_meta.get("pages", 0)
            elapsed = time.perf_counter() - start
            log.info(
                "marker_parse_done",
                path=str(path),
                parser="marker",
                pages=page_count,
                elapsed_s=round(elapsed, 3),
            )
            return ParseResult(
                success=True,
                text=full_text,
                page_count=page_count,
                parser_used="marker",
                parse_quality="high",
                metadata=out_meta,
            )
        except ImportError:
            return ParseResult(
                success=False,
                parser_used="marker",
                error="marker-pdf not installed; run: pip install marker-pdf",
            )
        except Exception as exc:
            elapsed = time.perf_counter() - start
            log.warning("marker_parse_failed", path=str(path), error=str(exc), elapsed_s=round(elapsed, 3))
            return ParseResult(success=False, parser_used="marker", error=str(exc))
