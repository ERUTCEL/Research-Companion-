import subprocess
import time
from pathlib import Path

import structlog

from ingestion.models import ParseResult

log = structlog.get_logger()


class NougatParser:
    """GPU parser that preserves LaTeX math (nougat CLI)."""

    def parse(self, pdf_path: str) -> ParseResult:
        start = time.perf_counter()
        path = Path(pdf_path)
        out_dir = path.parent / "_nougat_out"
        out_dir.mkdir(exist_ok=True)

        try:
            result = subprocess.run(
                ["nougat", str(path), "-o", str(out_dir), "--no-skipping"],
                capture_output=True,
                text=True,
                timeout=300,
            )
            mmd_file = out_dir / (path.stem + ".mmd")
            if result.returncode != 0 or not mmd_file.exists():
                raise RuntimeError(result.stderr or "nougat produced no output")

            text = mmd_file.read_text(encoding="utf-8")
            page_count = text.count("\n\n---\n\n") + 1

            elapsed = time.perf_counter() - start
            log.info(
                "nougat_parse_done",
                path=str(path),
                parser="nougat",
                pages=page_count,
                elapsed_s=round(elapsed, 3),
            )
            return ParseResult(
                success=True,
                text=text,
                page_count=page_count,
                parser_used="nougat",
                parse_quality="high",
            )
        except FileNotFoundError:
            return ParseResult(
                success=False,
                parser_used="nougat",
                error="nougat CLI not found; run: pip install nougat-ocr",
            )
        except Exception as exc:
            elapsed = time.perf_counter() - start
            log.warning("nougat_parse_failed", path=str(path), error=str(exc), elapsed_s=round(elapsed, 3))
            return ParseResult(success=False, parser_used="nougat", error=str(exc))
