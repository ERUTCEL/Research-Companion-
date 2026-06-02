import re
import time
from functools import lru_cache

import requests
import structlog

log = structlog.get_logger()

_DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"'<>]+)", re.IGNORECASE)
_CROSSREF_URL = "https://api.crossref.org/works/{doi}"
_TIMEOUT = 8


def _extract_doi_from_text(text: str) -> str | None:
    m = _DOI_RE.search(text[:5000])
    return m.group(1).rstrip(".,;)") if m else None


@lru_cache(maxsize=512)
def _fetch_crossref(doi: str) -> dict:
    url = _CROSSREF_URL.format(doi=doi)
    try:
        resp = requests.get(url, timeout=_TIMEOUT, headers={"User-Agent": "ResearchCompanion/0.1"})
        if resp.status_code == 200:
            return resp.json().get("message", {})
    except Exception as exc:
        log.warning("crossref_fetch_failed", doi=doi, error=str(exc))
    return {}


def extract_metadata(pdf_path: str, raw_text: str) -> dict:
    """Return bibliographic metadata dict. Falls back gracefully."""
    start = time.perf_counter()
    meta: dict = {
        "title": "",
        "author": "",
        "year": 0,
        "journal": "",
        "doi": "",
    }

    doi = _extract_doi_from_text(raw_text)
    if not doi:
        doi = _extract_doi_from_filename(pdf_path)

    if doi:
        meta["doi"] = doi
        cr = _fetch_crossref(doi)
        if cr:
            meta["title"] = _first(cr.get("title", []))
            meta["author"] = _format_authors(cr.get("author", []))
            meta["year"] = _extract_year(cr)
            meta["journal"] = _first(cr.get("container-title", []))
            log.info(
                "crossref_resolved",
                doi=doi,
                title=meta["title"][:60],
                elapsed_s=round(time.perf_counter() - start, 3),
            )
            return meta

    # Fallback: heuristic extraction from first 3000 chars of text
    meta.update(_heuristic_extract(raw_text[:3000]))
    log.debug("metadata_heuristic", path=pdf_path, elapsed_s=round(time.perf_counter() - start, 3))
    return meta


def _extract_doi_from_filename(pdf_path: str) -> str | None:
    name = pdf_path.split("/")[-1]
    m = _DOI_RE.search(name)
    return m.group(1) if m else None


def _first(lst: list) -> str:
    return lst[0] if lst else ""


def _format_authors(authors: list[dict]) -> str:
    parts = []
    for a in authors[:3]:
        given = a.get("given", "")
        family = a.get("family", "")
        parts.append(f"{family}, {given}".strip(", "))
    suffix = " et al." if len(authors) > 3 else ""
    return "; ".join(parts) + suffix


def _extract_year(cr: dict) -> int:
    for key in ("published-print", "published-online", "created"):
        date_parts = cr.get(key, {}).get("date-parts", [[]])
        if date_parts and date_parts[0]:
            return int(date_parts[0][0])
    return 0


def _heuristic_extract(text: str) -> dict:
    meta: dict = {"title": "", "author": "", "year": 0}
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    if lines:
        meta["title"] = lines[0][:200]

    year_m = re.search(r"\b(19|20)\d{2}\b", text)
    if year_m:
        meta["year"] = int(year_m.group())

    return meta
