from typing import Any
from pydantic import BaseModel, Field


# ── Ingest ──────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    source: str = Field(..., pattern="^(local_folder|notion)$")
    path: str | None = None
    notion_token: str | None = None
    database_id: str | None = None


class IngestResponse(BaseModel):
    job_id: str
    status: str
    total_docs: int


class JobStatusResponse(BaseModel):
    job_id: str
    status: str           # "queued" | "processing" | "done" | "failed"
    processed: int
    total: int
    error: str | None = None


# ── Search ───────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    text: str
    score: float
    title: str
    author: str
    year: int
    page_number: int
    source_type: str
    is_user_memo: bool
    parse_quality: str


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int


# ── Chat ─────────────────────────────────────────────────────────────────────

class ChatFilters(BaseModel):
    year_from: int | None = None
    year_to: int | None = None
    importance_min: int | None = None
    author: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    query: str
    filters: ChatFilters = Field(default_factory=ChatFilters)
    conversation_history: list[ChatMessage] = Field(default_factory=list)


class Citation(BaseModel):
    title: str
    source_type: str
    is_user_memo: bool
    parse_quality: str
    author: str | None = None
    year: int | None = None
    page: int | None = None
    bbox: Any = None
    doi: str | None = None
    source: str | None = None
    collection: str | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    confidence: str
