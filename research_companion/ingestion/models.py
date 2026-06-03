from dataclasses import dataclass, field


@dataclass
class ParseResult:
    success: bool
    text: str = ""
    tables: list[dict] = field(default_factory=list)
    figures: list[dict] = field(default_factory=list)
    page_count: int = 0
    parser_used: str = ""
    parse_quality: str = "high"   # "high" | "medium" | "low"
    error: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class ChunkMetadata:
    # Required
    doc_id: str
    source: str           # file path or Notion page_id
    source_type: str      # "pdf" | "notion_summary" | "notion_memo" | "notion_meta"
    is_user_memo: bool
    page_number: int
    bbox: list[float]     # [x0, y0, x1, y1]
    parser_used: str
    parse_quality: str    # "high" | "medium" | "low"

    # Bibliographic
    title: str = ""
    author: str = ""
    year: int = 0
    journal: str = ""
    doi: str = ""

    # Notion-specific
    importance_weight: float = 1.0  # ★ count → 0.7 / 1.0 / 1.5
    collection: str = ""            # Notion DB name or folder name

    # Content subtype for richer retrieval over non-body evidence
    content_type: str = "text"       # "text" | "figure" | "table" | "diagram"
    figure_type: str = ""            # "er_diagram" | "flowchart" | "architecture" | ...
    caption: str = ""
