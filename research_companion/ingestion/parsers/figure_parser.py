import io
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog

log = structlog.get_logger()

_CAPTION_RE = re.compile(
    r"^\s*((?:fig(?:ure)?\.?|그림|도표|diagram|table)\s*[\dIVXivx\-\.]*[:.)]?\s+.+)$",
    re.IGNORECASE,
)
_ER_RE = re.compile(
    r"\b(entity|entities|relationship|attribute|cardinality|weak entity|primary key|foreign key|1\s*:\s*n|m\s*:\s*n|er diagram)\b",
    re.IGNORECASE,
)
_FLOW_RE = re.compile(r"\b(start|end|process|decision|input|output|flow|step|pipeline)\b", re.IGNORECASE)
_ARCH_RE = re.compile(r"\b(client|server|api|database|service|module|layer|architecture|frontend|backend)\b", re.IGNORECASE)
_CHART_RE = re.compile(r"\b(axis|accuracy|loss|score|precision|recall|baseline|performance)\b", re.IGNORECASE)


@dataclass
class _Caption:
    text: str
    page: int
    bbox: list[float]


class FigureParser:
    """Extract figure/diagram evidence chunks from PDF pages.

    This is intentionally local and conservative. It does not pretend to fully
    understand visual semantics; it turns figure regions into searchable
    evidence using captions, OCR labels, and diagram-type heuristics.
    """

    def parse(self, pdf_path: str, max_figures_per_page: int = 4) -> list[dict[str, Any]]:
        start = time.perf_counter()
        path = Path(pdf_path)
        figures: list[dict[str, Any]] = []

        try:
            import pymupdf

            doc = pymupdf.open(str(path))
            for page in doc:
                captions = self._extract_captions(page)
                candidates = self._image_candidates(page) + self._drawing_candidates(page)
                seen: set[tuple[int, int, int, int]] = set()

                for idx, bbox in enumerate(candidates[:max_figures_per_page], 1):
                    key = tuple(round(v) for v in bbox)
                    if key in seen or self._too_small(bbox, page.rect):
                        continue
                    seen.add(key)

                    caption = self._nearest_caption(bbox, captions)
                    labels = self._ocr_region(page, bbox)
                    figure_type = self._classify(caption.text if caption else "", labels, bbox, page.rect)
                    summary = self._summarize(page.number + 1, figure_type, caption.text if caption else "", labels)
                    if not summary:
                        continue

                    figures.append(
                        {
                            "page_number": page.number + 1,
                            "bbox": [round(v, 2) for v in bbox],
                            "figure_type": figure_type,
                            "caption": caption.text if caption else "",
                            "ocr_text": labels,
                            "summary": summary,
                            "parser_used": "figure_parser",
                        }
                    )

            doc.close()
            log.info("figure_parser_done", path=str(path), figures=len(figures), elapsed_s=round(time.perf_counter() - start, 3))
            return figures
        except Exception as exc:
            log.warning("figure_parser_failed", path=str(path), error=str(exc), elapsed_s=round(time.perf_counter() - start, 3))
            return []

    def _extract_captions(self, page) -> list[_Caption]:
        captions: list[_Caption] = []
        for block in page.get_text("blocks"):
            x0, y0, x1, y1, text, _block_no, block_type = block
            if block_type != 0:
                continue
            for line in text.splitlines():
                match = _CAPTION_RE.match(line)
                if match:
                    captions.append(_Caption(text=match.group(1).strip(), page=page.number + 1, bbox=[x0, y0, x1, y1]))
        return captions

    def _image_candidates(self, page) -> list[list[float]]:
        candidates: list[list[float]] = []
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type") == 1 and "bbox" in block:
                candidates.append([float(v) for v in block["bbox"]])
        return candidates

    def _drawing_candidates(self, page) -> list[list[float]]:
        drawings = page.get_drawings()
        rects = [d.get("rect") for d in drawings if d.get("rect")]
        if len(rects) < 2:
            return []

        x0 = min(r.x0 for r in rects)
        y0 = min(r.y0 for r in rects)
        x1 = max(r.x1 for r in rects)
        y1 = max(r.y1 for r in rects)
        return [[float(x0), float(y0), float(x1), float(y1)]]

    def _too_small(self, bbox: list[float], page_rect) -> bool:
        width = max(bbox[2] - bbox[0], 0)
        height = max(bbox[3] - bbox[1], 0)
        page_area = float(page_rect.width * page_rect.height)
        return width * height < page_area * 0.015

    def _nearest_caption(self, bbox: list[float], captions: list[_Caption]) -> _Caption | None:
        if not captions:
            return None
        bx0, by0, bx1, by1 = bbox
        center_x = (bx0 + bx1) / 2

        def distance(caption: _Caption) -> float:
            cx0, cy0, cx1, cy1 = caption.bbox
            cap_x = (cx0 + cx1) / 2
            vertical = min(abs(cy0 - by1), abs(by0 - cy1))
            horizontal = abs(center_x - cap_x) * 0.25
            return vertical + horizontal

        return min(captions, key=distance)

    def _ocr_region(self, page, bbox: list[float]) -> str:
        text_labels = self._text_in_region(page, bbox)
        try:
            import pymupdf
            import pytesseract
            from PIL import Image

            clip = pymupdf.Rect(bbox)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=clip)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            text = pytesseract.image_to_string(img, lang="kor+eng")
            merged = f"{text_labels} {text}".strip()
            return " ".join(merged.split())
        except Exception:
            return text_labels

    def _text_in_region(self, page, bbox: list[float]) -> str:
        x0, y0, x1, y1 = bbox
        pad = 8
        region = [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
        texts: list[str] = []
        for block in page.get_text("blocks"):
            bx0, by0, bx1, by1, text, _block_no, block_type = block
            if block_type != 0:
                continue
            if bx1 < region[0] or bx0 > region[2] or by1 < region[1] or by0 > region[3]:
                continue
            if _CAPTION_RE.match(text.strip()):
                continue
            texts.append(text.strip())
        return " ".join(" ".join(t.split()) for t in texts if t.strip())

    def _classify(self, caption: str, labels: str, bbox: list[float], page_rect) -> str:
        text = f"{caption} {labels}"
        if _ER_RE.search(text):
            return "er_diagram"
        if _FLOW_RE.search(text):
            return "flowchart"
        if _ARCH_RE.search(text):
            return "architecture_diagram"
        if _CHART_RE.search(text):
            return "chart"
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        if width > page_rect.width * 0.55 and height > page_rect.height * 0.18:
            return "diagram_or_figure"
        return "figure"

    def _summarize(self, page_number: int, figure_type: str, caption: str, labels: str) -> str:
        parts = [f"Visual evidence on page {page_number}.", f"Type: {figure_type}."]
        if caption:
            parts.append(f"Caption: {caption}")
        if labels:
            parts.append(f"OCR labels/text inside visual: {labels}")
        if not caption and not labels:
            return ""
        if figure_type == "er_diagram":
            parts.append("Use this as diagram evidence for entity, relationship, attribute, and cardinality claims; verify exact edges manually if the OCR labels are incomplete.")
        elif figure_type.endswith("diagram") or figure_type == "flowchart":
            parts.append("Use this as diagram evidence for structural or process claims; OCR may miss arrows and spatial links.")
        return "\n".join(parts)
