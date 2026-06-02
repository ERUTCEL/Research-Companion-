import time
from pathlib import Path

import structlog

from ingestion.models import ParseResult

log = structlog.get_logger()


class EasyOCRRunner:
    """OCR runner for scanned PDFs, optimised for Korean + English."""

    def __init__(self, languages: list[str] | None = None) -> None:
        self.languages = languages or ["ko", "en"]
        self._reader = None

    def _get_reader(self):
        if self._reader is None:
            import easyocr

            self._reader = easyocr.Reader(self.languages, gpu=self._has_gpu())
        return self._reader

    @staticmethod
    def _has_gpu() -> bool:
        try:
            import torch

            return torch.cuda.is_available()
        except ImportError:
            return False

    def parse(self, pdf_path: str) -> ParseResult:
        start = time.perf_counter()
        path = Path(pdf_path)

        try:
            import pymupdf
            from PIL import Image
            import io

            reader = self._get_reader()
            doc = pymupdf.open(str(path))
            pages_text: list[str] = []

            for page in doc:
                pix = page.get_pixmap(dpi=200)
                img_bytes = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_bytes))

                results = reader.readtext(img_bytes)
                page_text = " ".join(item[1] for item in results)
                pages_text.append(page_text)

            doc.close()
            full_text = "\n\n".join(pages_text)
            elapsed = time.perf_counter() - start
            log.info(
                "easyocr_done",
                path=str(path),
                pages=len(pages_text),
                elapsed_s=round(elapsed, 3),
            )
            return ParseResult(
                success=True,
                text=full_text,
                page_count=len(pages_text),
                parser_used="easyocr",
                parse_quality="medium",
            )
        except ImportError:
            return ParseResult(
                success=False,
                parser_used="easyocr",
                error="easyocr not installed; run: pip install easyocr",
            )
        except Exception as exc:
            elapsed = time.perf_counter() - start
            log.warning("easyocr_failed", path=str(path), error=str(exc), elapsed_s=round(elapsed, 3))
            return ParseResult(success=False, parser_used="easyocr", error=str(exc))
