"""Phase 2 — Zotero SQLite reader. Not part of MVP."""
import structlog

log = structlog.get_logger()


class ZoteroReader:
    """Reads the local Zotero SQLite database directly (no API key needed)."""

    def __init__(self, zotero_db_path: str) -> None:
        self.db_path = zotero_db_path

    def ingest(self) -> list[tuple[str, dict]]:
        raise NotImplementedError("Zotero reader is planned for Phase 2")
