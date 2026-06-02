import os
import uuid
from typing import Any

import structlog

from ingestion.chunker import chunk_document
from ingestion.models import ChunkMetadata

log = structlog.get_logger()

NOTION_TYPE_MAP: dict[str, dict[str, Any]] = {
    "db_row_summary":  {"source_type": "notion_summary", "is_user_memo": False},
    "db_row_thoughts": {"source_type": "notion_memo",    "is_user_memo": True},
    "db_row_meta":     {"source_type": "notion_meta",    "is_user_memo": False},
    "page_content":    {"source_type": "notion_memo",    "is_user_memo": True},
}

IMPORTANCE_WEIGHT: dict[str | None, float] = {
    "★★★": 1.5,
    "★★":  1.0,
    "★":   0.7,
    None:  1.0,
}


def _weight(stars: str | None) -> float:
    return IMPORTANCE_WEIGHT.get(stars, 1.0)


class NotionReader:
    """Reads a Notion database and converts rows to chunk (text, metadata) pairs."""

    def __init__(self, token: str | None = None) -> None:
        self.token = token or os.getenv("NOTION_TOKEN", "")
        self._client = None

    def _get_client(self):
        if self._client is None:
            from notion_client import Client

            self._client = Client(auth=self.token)
        return self._client

    def ingest_database(self, database_id: str) -> list[tuple[str, ChunkMetadata]]:
        """Return all (chunk_text, metadata) pairs from a Notion database."""
        client = self._get_client()
        db_meta = client.databases.retrieve(database_id=database_id)
        db_name = _plain_text(db_meta.get("title", []))
        log.info("notion_db_start", db_id=database_id, name=db_name)

        rows = self._paginate_db(client, database_id)
        all_chunks: list[tuple[str, ChunkMetadata]] = []

        for row in rows:
            chunks = self._process_row(row, db_name, client)
            all_chunks.extend(chunks)

        log.info("notion_db_done", db_id=database_id, total_chunks=len(all_chunks))
        return all_chunks

    def _paginate_db(self, client, database_id: str) -> list[dict]:
        rows: list[dict] = []
        cursor = None
        while True:
            kwargs: dict[str, Any] = {"database_id": database_id, "page_size": 100}
            if cursor:
                kwargs["start_cursor"] = cursor
            resp = client.databases.query(**kwargs)
            rows.extend(resp.get("results", []))
            if not resp.get("has_more"):
                break
            cursor = resp.get("next_cursor")
        return rows

    def _process_row(
        self, row: dict, db_name: str, client
    ) -> list[tuple[str, ChunkMetadata]]:
        props = row.get("properties", {})
        page_id = row["id"]
        chunks: list[tuple[str, ChunkMetadata]] = []

        title = _prop_text(props, ["제목", "Title", "title", "Name", "name"])
        author = _prop_text(props, ["저자", "Author", "author", "Authors"])
        year_str = _prop_text(props, ["연도", "Year", "year"])
        journal = _prop_text(props, ["저널", "Journal", "journal"])
        doi = _prop_text(props, ["DOI", "doi"])
        importance_raw = _prop_select(props, ["중요도", "Importance", "Stars"])
        importance_weight = _weight(importance_raw)
        summary = _prop_text(props, ["요약", "Summary", "summary", "Abstract"])
        thoughts = _prop_text(props, ["내 생각", "Thoughts", "thoughts", "Notes"])

        try:
            year = int(year_str) if year_str.isdigit() else 0
        except (ValueError, AttributeError):
            year = 0

        common = dict(
            source=page_id,
            page_number=1,
            bbox=[],
            parser_used="notion",
            parse_quality="high",
            title=title,
            author=author,
            year=year,
            journal=journal,
            doi=doi,
            importance_weight=importance_weight,
            collection=db_name,
        )

        if summary:
            meta = ChunkMetadata(
                doc_id=str(uuid.uuid4()),
                source_type="notion_summary",
                is_user_memo=False,
                **common,  # type: ignore[arg-type]
            )
            for text, m in chunk_document(summary, meta):
                chunks.append((text, m))

        if thoughts:
            meta = ChunkMetadata(
                doc_id=str(uuid.uuid4()),
                source_type="notion_memo",
                is_user_memo=True,
                **common,  # type: ignore[arg-type]
            )
            for text, m in chunk_document(thoughts, meta):
                chunks.append((text, m))

        page_body = self._fetch_page_content(client, page_id)
        if page_body:
            meta = ChunkMetadata(
                doc_id=str(uuid.uuid4()),
                source_type="notion_memo",
                is_user_memo=True,
                **common,  # type: ignore[arg-type]
            )
            for text, m in chunk_document(page_body, meta):
                chunks.append((text, m))

        return chunks

    def _fetch_page_content(self, client, page_id: str) -> str:
        try:
            blocks = self._paginate_blocks(client, page_id)
            return _blocks_to_text(blocks)
        except Exception as exc:
            log.warning("notion_page_fetch_failed", page_id=page_id, error=str(exc))
            return ""

    def _paginate_blocks(self, client, block_id: str) -> list[dict]:
        blocks: list[dict] = []
        cursor = None
        while True:
            kwargs: dict[str, Any] = {"block_id": block_id, "page_size": 100}
            if cursor:
                kwargs["start_cursor"] = cursor
            resp = client.blocks.children.list(**kwargs)
            blocks.extend(resp.get("results", []))
            if not resp.get("has_more"):
                break
            cursor = resp.get("next_cursor")
        return blocks


def _plain_text(rich_texts: list[dict]) -> str:
    return "".join(t.get("plain_text", "") for t in rich_texts)


def _prop_text(props: dict, keys: list[str]) -> str:
    for key in keys:
        if key not in props:
            continue
        p = props[key]
        ptype = p.get("type", "")
        if ptype == "title":
            return _plain_text(p.get("title", []))
        if ptype == "rich_text":
            return _plain_text(p.get("rich_text", []))
        if ptype == "number":
            v = p.get("number")
            return str(v) if v is not None else ""
        if ptype == "url":
            return p.get("url") or ""
    return ""


def _prop_select(props: dict, keys: list[str]) -> str | None:
    for key in keys:
        if key not in props:
            continue
        p = props[key]
        sel = p.get("select")
        if sel:
            return sel.get("name")
    return None


def _blocks_to_text(blocks: list[dict]) -> str:
    lines: list[str] = []
    for block in blocks:
        btype = block.get("type", "")
        content = block.get(btype, {})
        rich = content.get("rich_text", [])
        if rich:
            lines.append(_plain_text(rich))
    return "\n\n".join(lines)
