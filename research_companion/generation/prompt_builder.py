from pathlib import Path

_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "RAG_SYSTEM_PROMPT.md"
_SYSTEM_PROMPT: str | None = None


def _load_system_prompt() -> str:
    global _SYSTEM_PROMPT
    if _SYSTEM_PROMPT is None:
        _SYSTEM_PROMPT = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    return _SYSTEM_PROMPT


def build_context_block(results: list[dict]) -> str:
    parts: list[str] = []
    for i, r in enumerate(results, 1):
        meta = r.get("metadata", {})
        source_type = meta.get("source_type", "pdf")
        is_memo = meta.get("is_user_memo", False)
        title = meta.get("title", "Unknown")
        author = meta.get("author", "")
        year = meta.get("year", "")
        page = meta.get("page_number", "")
        quality = meta.get("parse_quality", "high")

        label = "USER MEMO" if is_memo else "PAPER"
        citation_hint = f"{title}"
        if author:
            citation_hint += f" — {author}"
        if year:
            citation_hint += f" ({year})"
        if page:
            citation_hint += f", p.{page}"
        if quality == "low":
            citation_hint += " ⚠️ low parse quality"

        parts.append(
            f"[SOURCE {i} | {label} | {citation_hint}]\n{r['text']}\n"
        )
    return "\n---\n".join(parts)


def build_messages(
    query: str,
    results: list[dict],
    conversation_history: list[dict] | None = None,
) -> tuple[str, list[dict]]:
    """Return (system_prompt, messages) ready for the Claude API."""
    system = _load_system_prompt()
    context = build_context_block(results)

    messages: list[dict] = list(conversation_history or [])
    user_content = f"## Retrieved Sources\n\n{context}\n\n## Question\n\n{query}"
    messages.append({"role": "user", "content": user_content})
    return system, messages
