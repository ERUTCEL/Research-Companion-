import concurrent.futures
import os
import re
import time
from pathlib import Path

import structlog

from ingestion.models import ParseResult
from ingestion.ocr.easyocr_runner import EasyOCRRunner
from ingestion.ocr.vision_corrector import VisionCorrector
from ingestion.parsers.marker_parser import MarkerParser
from ingestion.parsers.nougat_parser import NougatParser
from ingestion.parsers.pymupdf_parser import PyMuPDFParser
from ingestion.parsers.tatr_parser import TATRParser

log = structlog.get_logger()

_FORMULA_PATTERN = re.compile(
    r"(\$[^$]+\$|\\\(|\\\[|\\begin\{equation\}|\\frac|\\sum|\\int|\\alpha|\\beta|\\gamma)"
)
_KOREAN_PATTERN = re.compile(r"[가-힣]")


def _has_gpu() -> bool:
    try:
        import torch

        return torch.cuda.is_available()
    except ImportError:
        return False


def _is_lite_mode() -> bool:
    return os.getenv("LITE_MODE", "false").lower() in ("1", "true", "yes")


def _formula_density(text: str) -> float:
    if not text:
        return 0.0
    matches = _FORMULA_PATTERN.findall(text)
    return len(matches) / max(len(text.split()), 1)


def _is_multi_column(pdf_path: str) -> bool:
    """Heuristic: check if page blocks span multiple narrow columns."""
    try:
        from ingestion.parsers.pymupdf_parser import PyMuPDFParser

        parser = PyMuPDFParser()
        blocks = parser.extract_blocks(pdf_path)
        if not blocks:
            return False

        page_blocks = [b for b in blocks if b["page"] == 0 and b["block_type"] == 0]
        if len(page_blocks) < 4:
            return False

        x_centers = [(b["bbox"][0] + b["bbox"][2]) / 2 for b in page_blocks]
        page_width = max(b["bbox"][2] for b in page_blocks)
        left = sum(1 for x in x_centers if x < page_width * 0.5)
        right = sum(1 for x in x_centers if x >= page_width * 0.5)
        return left >= 2 and right >= 2
    except Exception:
        return False


def _has_text_layer(pdf_path: str) -> bool:
    try:
        import pymupdf

        doc = pymupdf.open(pdf_path)
        for page in doc:
            text = page.get_text().strip()
            if len(text) > 50:
                doc.close()
                return True
        doc.close()
        return False
    except Exception:
        return False


def _is_korean(text: str) -> bool:
    return bool(_KOREAN_PATTERN.search(text[:2000]))


def _quick_text_sample(pdf_path: str) -> str:
    try:
        import pymupdf

        doc = pymupdf.open(pdf_path)
        pages = min(3, doc.page_count)
        sample = " ".join(doc[i].get_text() for i in range(pages))
        doc.close()
        return sample
    except Exception:
        return ""


class PDFRouter:
    """Routes each PDF to the most appropriate parser."""

    def __init__(self) -> None:
        self._pymupdf = PyMuPDFParser()
        self._marker = MarkerParser()
        self._nougat = NougatParser()
        self._tatr = TATRParser()
        self._easyocr = EasyOCRRunner()
        self._tesseract = _TesseractParser()
        self._corrector = VisionCorrector()

    def parse(self, pdf_path: str) -> ParseResult:
        start = time.perf_counter()
        path = str(pdf_path)
        lite = _is_lite_mode()
        gpu = _has_gpu()

        log.info("router_start", path=path, lite_mode=lite, gpu=gpu)

        has_text = _has_text_layer(path)

        if not has_text:
            result = self._handle_scanned(path, lite)
        else:
            result = self._handle_native(path, lite, gpu)

        if result.success:
            tables = self._extract_tables_async(path, lite)
            if tables:
                result.tables = tables
                log.info("tables_merged", count=len(tables), path=path)

        elapsed = time.perf_counter() - start
        log.info(
            "router_done",
            path=path,
            parser=result.parser_used,
            quality=result.parse_quality,
            success=result.success,
            elapsed_s=round(elapsed, 3),
        )
        return result

    def _handle_native(self, path: str, lite: bool, gpu: bool) -> ParseResult:
        sample = _quick_text_sample(path)
        density = _formula_density(sample)

        if lite or not gpu:
            return self._pymupdf.parse(path)

        if density > 0.05:
            result = self._nougat.parse(path)
            if not result.success:
                result = self._pymupdf.parse(path)
                result.parse_quality = "medium"
            return result

        if _is_multi_column(path):
            result = self._marker.parse(path)
            if not result.success:
                result = self._pymupdf.parse(path)
                result.parse_quality = "medium"
            return result

        return self._pymupdf.parse(path)

    def _handle_scanned(self, path: str, lite: bool) -> ParseResult:
        sample = _quick_text_sample(path)

        if _is_korean(sample) or not lite:
            result = self._easyocr.parse(path)
            if result.success:
                result.text = self._corrector.correct(result.text, lang="ko")
            else:
                result = self._tesseract.parse(path)
                if result.success:
                    result.text = self._corrector.correct(result.text)
            return result

        result = self._tesseract.parse(path)
        if result.success:
            result.text = self._corrector.correct(result.text)
        return result

    def _extract_tables_async(self, path: str, lite: bool) -> list[dict]:
        if lite:
            return []
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(self._tatr.extract_tables, path)
                return future.result(timeout=120)
        except Exception:
            return []


class _TesseractParser:
    """Thin wrapper around pytesseract for fallback OCR."""

    def parse(self, pdf_path: str) -> ParseResult:
        start = time.perf_counter()
        path = Path(pdf_path)
        try:
            import pymupdf
            import pytesseract
            from PIL import Image
            import io

            doc = pymupdf.open(str(path))
            pages_text: list[str] = []
            for page in doc:
                pix = page.get_pixmap(dpi=200)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text = pytesseract.image_to_string(img, lang="kor+eng")
                pages_text.append(text)
            doc.close()
            elapsed = time.perf_counter() - start
            log.info("tesseract_done", path=str(path), pages=len(pages_text), elapsed_s=round(elapsed, 3))
            return ParseResult(
                success=True,
                text="\n\n".join(pages_text),
                page_count=len(pages_text),
                parser_used="tesseract",
                parse_quality="medium",
            )
        except ImportError:
            return ParseResult(success=False, parser_used="tesseract", error="pytesseract not installed")
        except Exception as exc:
            return ParseResult(success=False, parser_used="tesseract", error=str(exc))
