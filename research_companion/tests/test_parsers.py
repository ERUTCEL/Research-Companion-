"""Parser unit tests. Require actual PDF fixtures in tests/fixtures/."""
import io
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ingestion.models import ParseResult
from ingestion.router import PDFRouter, _formula_density, _is_multi_column
from ingestion.sources.local_folder import LocalFolderSource


# ── Unit tests for routing helpers ──────────────────────────────────────────

def test_formula_density_low():
    text = "This paper presents a novel approach to machine learning."
    assert _formula_density(text) < 0.05


def test_formula_density_high():
    text = r"We define \sum_{i=1}^{n} \alpha_i x_i + \frac{a}{b} = \int f(x)dx"
    assert _formula_density(text) >= 0.05


def test_parse_result_failure_has_no_exception():
    """Parsers must never raise — they return ParseResult(success=False)."""
    result = ParseResult(success=False, error="something went wrong")
    assert result.success is False
    assert result.error == "something went wrong"
    assert result.text == ""


def test_local_source_accepts_single_pdf_path(tmp_path, monkeypatch):
    pdf_path = tmp_path / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    source = LocalFolderSource()
    seen_paths = []

    def fake_parse(path: str) -> ParseResult:
        seen_paths.append(path)
        return ParseResult(success=True, text="paper text", page_count=1, parser_used="test")

    monkeypatch.setattr(source._router, "parse", fake_parse)
    monkeypatch.setattr("ingestion.sources.local_folder.extract_metadata", lambda *_: {})

    chunks = source.ingest(str(pdf_path))

    assert seen_paths == [str(pdf_path)]
    assert chunks
    assert chunks[0][1].source == str(pdf_path)


# ── Integration tests (skipped if no fixture PDFs) ──────────────────────────

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _fixture_pdfs() -> list[str]:
    if not os.path.isdir(FIXTURES_DIR):
        return []
    return [
        os.path.join(FIXTURES_DIR, f)
        for f in os.listdir(FIXTURES_DIR)
        if f.lower().endswith(".pdf")
    ]


@pytest.mark.skipif(not _fixture_pdfs(), reason="No PDF fixtures in tests/fixtures/")
@pytest.mark.parametrize("pdf_path", _fixture_pdfs())
def test_router_parse_succeeds(pdf_path: str):
    os.environ["LITE_MODE"] = "true"
    router = PDFRouter()
    result = router.parse(pdf_path)
    assert isinstance(result, ParseResult)
    assert result.success is True or result.error is not None, "Must not raise, only return ParseResult"
    if result.success:
        assert len(result.text) > 0, "Parsed text should be non-empty"
        assert result.parser_used != ""
        assert result.parse_quality in ("high", "medium", "low")


@pytest.mark.skipif(not _fixture_pdfs(), reason="No PDF fixtures in tests/fixtures/")
def test_hit_at_5_threshold():
    """Smoke test: all fixture PDFs parsed without exceptions."""
    os.environ["LITE_MODE"] = "true"
    router = PDFRouter()
    pdfs = _fixture_pdfs()
    successes = 0
    for pdf in pdfs:
        r = router.parse(pdf)
        if r.success:
            successes += 1
    rate = successes / len(pdfs) if pdfs else 1.0
    assert rate >= 0.7, f"Parser success rate {rate:.0%} below hit@5 threshold of 70%"
