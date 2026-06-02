import time
from pathlib import Path

import structlog

from ingestion.models import ParseResult

log = structlog.get_logger()


class TATRParser:
    """Table detection via Table Transformer (TATR). Runs in parallel with the main parser."""

    def extract_tables(self, pdf_path: str) -> list[dict]:
        """Return a list of extracted table dicts, one per detected table."""
        start = time.perf_counter()
        path = Path(pdf_path)
        tables: list[dict] = []

        try:
            import pymupdf
            from PIL import Image
            from transformers import AutoImageProcessor, TableTransformerForObjectDetection
            import torch

            processor = AutoImageProcessor.from_pretrained("microsoft/table-transformer-detection")
            model = TableTransformerForObjectDetection.from_pretrained("microsoft/table-transformer-detection")
            model.eval()

            doc = pymupdf.open(str(path))
            for page_idx, page in enumerate(doc):
                pix = page.get_pixmap(dpi=150)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

                inputs = processor(images=img, return_tensors="pt")
                with torch.no_grad():
                    outputs = model(**inputs)

                target_sizes = torch.tensor([img.size[::-1]])
                results = processor.post_process_object_detection(
                    outputs, threshold=0.7, target_sizes=target_sizes
                )[0]

                for score, label, box in zip(
                    results["scores"], results["labels"], results["boxes"]
                ):
                    tables.append(
                        {
                            "page": page_idx,
                            "bbox": box.tolist(),
                            "label": model.config.id2label[label.item()],
                            "score": round(score.item(), 3),
                        }
                    )
            doc.close()
        except ImportError:
            log.debug("tatr_unavailable", reason="transformers or torch not installed")
        except Exception as exc:
            log.warning("tatr_extraction_failed", path=str(path), error=str(exc))

        elapsed = time.perf_counter() - start
        log.info("tatr_done", path=str(path), tables_found=len(tables), elapsed_s=round(elapsed, 3))
        return tables

    def parse(self, pdf_path: str) -> ParseResult:
        """Thin wrapper so TATR can be used as a standalone parser if needed."""
        tables = self.extract_tables(pdf_path)
        return ParseResult(
            success=True,
            text="",
            tables=tables,
            parser_used="tatr",
            parse_quality="high" if tables else "medium",
        )
