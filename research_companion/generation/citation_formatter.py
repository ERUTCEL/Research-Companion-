from typing import Any


def format_citations(results: list[dict]) -> list[dict]:
    """Convert raw search result metadata into clean citation dicts for the API response."""
    citations: list[dict] = []
    seen: set[str] = set()

    for r in results:
        meta = r.get("metadata", {})
        source_type = meta.get("source_type", "pdf")
        is_memo = bool(meta.get("is_user_memo", False))
        title = meta.get("title", "")
        key = f"{title}_{meta.get('page_number', '')}"

        if key in seen:
            continue
        seen.add(key)

        citation: dict[str, Any] = {
            "title": title,
            "source_type": source_type,
            "is_user_memo": is_memo,
            "parse_quality": meta.get("parse_quality", "high"),
            "content_type": meta.get("content_type", "text"),
            "figure_type": meta.get("figure_type", ""),
            "caption": meta.get("caption", ""),
        }

        if source_type == "pdf":
            citation.update(
                {
                    "author": meta.get("author", ""),
                    "year": meta.get("year", 0),
                    "page": meta.get("page_number", 0),
                    "bbox": meta.get("bbox", ""),
                    "doi": meta.get("doi", ""),
                }
            )
        else:
            citation["source"] = meta.get("source", "")
            citation["collection"] = meta.get("collection", "")

        citations.append(citation)

    return citations


_NO_SOURCE_THRESHOLD = 0.42  # below this → treat as no match, skip LLM


def compute_confidence(results: list[dict]) -> str:
    if not results:
        return "no_source"
    top_score = max(r.get("score", 0) for r in results)
    if top_score < _NO_SOURCE_THRESHOLD:
        return "no_source"
    if top_score >= 0.75:
        return "high"
    if top_score >= 0.5:
        return "medium"
    return "low"
