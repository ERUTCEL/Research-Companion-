# Research Companion — CLAUDE.md

## Project Overview

Local-first AI research decision companion for graduate students. Processes PDFs and Notion memos into a searchable library, then helps users identify contribution gaps, project risks, and next validation steps using RAG with Claude API (generation only).

**Target users**: KAIST-type STEM grad students who keep papers in a downloads folder or a Notion DB.

## Product Invariants

- The app is not only a search engine or paper summarizer.
- Answers should start with the useful judgment when the user asks for strategy, evaluation, or next steps.
- Retrieved sources should be separated into evidence, gap, contribution, risk, and decision when possible.
- If the library only supports a generic summary, the assistant should say the research contribution is not clear yet.
- Serious project advice should end with a concrete 1-2 week validation step.

## Architecture

```
PDF/Notion → ingestion/ → retrieval/ → generation/ → api/
               (parse,        (embed,       (RAG +        (FastAPI)
                chunk,         search,       Claude API)
                metadata)      rerank)
```

Key invariants:
- Parsers **never raise** — return `ParseResult(success=False)` on failure
- `source` and `page_number` are required in `ChunkMetadata`; chunks missing these are rejected at ingest
- LLM is **not called** when `confidence == "no_source"` (saves API cost)
- `is_user_memo=True` chunks come from Notion "내 생각" column; rendered distinctly in citations

## Module Map

| Path | Responsibility |
|------|---------------|
| `ingestion/models.py` | `ParseResult`, `ChunkMetadata` dataclasses |
| `ingestion/router.py` | PDF → parser routing (text/scanned/formula/multi-column) |
| `ingestion/parsers/` | PyMuPDF4LLM (default), Marker (multi-col), Nougat (math), TATR (tables) |
| `ingestion/ocr/` | EasyOCR (Korean+EN scans), VisionCorrector (post-processing) |
| `ingestion/chunker.py` | Sentence-aware word-count chunker; mode auto-detected from content |
| `ingestion/metadata_extractor.py` | DOI → CrossRef lookup; heuristic fallback |
| `ingestion/sources/local_folder.py` | Recursive PDF folder ingest |
| `ingestion/sources/notion_reader.py` | Notion DB → chunks (요약/내 생각 column mapping) |
| `retrieval/embedder.py` | BGE-M3 (FlagEmbedding primary, sentence-transformers fallback) |
| `retrieval/vector_store.py` | ChromaDB persistent store |
| `retrieval/hybrid_search.py` | NL filter parsing + vector search + importance weighting |
| `retrieval/reranker.py` | Cross-encoder reranker (ms-marco-MiniLM-L-6-v2) |
| `retrieval/metadata_db.py` | SQLite document registry |
| `generation/rag_pipeline.py` | search → rerank → Claude API |
| `generation/prompt_builder.py` | Loads `RAG_SYSTEM_PROMPT.md`, builds context block |
| `generation/citation_formatter.py` | Formats citations; computes confidence level |
| `api/` | FastAPI app — `/ingest`, `/search`, `/chat`, `/health` |

## Coding Conventions

- All functions require type hints
- Parsers return `ParseResult(success=False, error=...)` on failure — never raise
- Env vars: `ANTHROPIC_API_KEY`, `NOTION_TOKEN` (see `.env.example`)
- Logging: `structlog` — always include `elapsed_s` and `parser` fields
- Tests: `pytest`; hit@5 threshold ≥ 0.7

## Environment Variables

| Variable | Default | Notes |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | — | Required |
| `NOTION_TOKEN` | — | Required for Notion ingest |
| `CHROMA_PERSIST_DIR` | `./chroma_db` | ChromaDB storage path |
| `SQLITE_DB_PATH` | `./metadata.db` | SQLite registry path |
| `EMBEDDER_MODEL` | `BAAI/bge-m3` | HuggingFace model ID |
| `LITE_MODE` | `false` | Set `true` on CPU-only machines |
| `LOG_LEVEL` | `INFO` | `DEBUG` for dev console output |

## Install

```bash
# Core only (CPU, no GPU parsers)
pip install -e ".[dev]"
LITE_MODE=true

# Full install with all parsers + embeddings
pip install -e ".[all]"

# Run API
uvicorn api.main:app --reload --port 8000
```

## Testing

```bash
pytest tests/

# With PDF fixtures for integration tests
mkdir tests/fixtures && cp /path/to/*.pdf tests/fixtures/
pytest tests/test_parsers.py -v
```

## Known Limitations (MVP)

- Korean detection for scanned PDFs (`_is_korean`) uses `_quick_text_sample` which returns empty for OCR-only PDFs; in practice, EasyOCR is used for all scanned PDFs in non-lite mode regardless.
- Nougat parser calls the `nougat` CLI via subprocess — must be installed separately.
- TATR table extraction loads `microsoft/table-transformer-detection` on first call; slow on CPU.
- In-memory job registry in `api/routes/ingest.py` resets on restart; upgrade to SQLite for production.
- Zotero reader (`ingestion/sources/zotero_reader.py`) is a Phase 2 stub — not implemented.
