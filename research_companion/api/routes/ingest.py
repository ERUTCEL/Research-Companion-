import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from api.schemas import IngestRequest, IngestResponse, JobStatusResponse
from ingestion.sources.local_folder import LocalFolderSource
from ingestion.sources.notion_reader import NotionReader
from retrieval.embedder import Embedder
from retrieval.vector_store import VectorStore

router = APIRouter(prefix="/ingest", tags=["ingest"])

# In-memory job registry — replace with Redis or SQLite for production
_JOBS: dict[str, dict[str, Any]] = {}


def _run_local_ingest(job_id: str, path: str) -> None:
    _JOBS[job_id]["status"] = "processing"
    try:
        source = LocalFolderSource()
        embedder = Embedder()
        store = VectorStore()

        def progress(done: int, total: int) -> None:
            _JOBS[job_id]["processed"] = done
            _JOBS[job_id]["total"] = total

        chunks = source.ingest(path, on_progress=progress)
        _JOBS[job_id]["total"] = len(chunks)

        if chunks:
            texts = [c[0] for c in chunks]
            embeddings = embedder.embed(texts)
            store.add(chunks, embeddings)

        _JOBS[job_id]["status"] = "done"
        _JOBS[job_id]["processed"] = _JOBS[job_id]["total"]
    except Exception as exc:
        _JOBS[job_id]["status"] = "failed"
        _JOBS[job_id]["error"] = str(exc)


def _run_notion_ingest(job_id: str, token: str, database_id: str) -> None:
    _JOBS[job_id]["status"] = "processing"
    try:
        reader = NotionReader(token=token)
        embedder = Embedder()
        store = VectorStore()

        chunks = reader.ingest_database(database_id)
        _JOBS[job_id]["total"] = len(chunks)

        if chunks:
            texts = [c[0] for c in chunks]
            embeddings = embedder.embed(texts)
            store.add(chunks, embeddings)

        _JOBS[job_id]["status"] = "done"
        _JOBS[job_id]["processed"] = _JOBS[job_id]["total"]
    except Exception as exc:
        _JOBS[job_id]["status"] = "failed"
        _JOBS[job_id]["error"] = str(exc)


@router.post("", response_model=IngestResponse)
async def start_ingest(req: IngestRequest, background_tasks: BackgroundTasks) -> IngestResponse:
    job_id = str(uuid.uuid4())
    _JOBS[job_id] = {"status": "queued", "processed": 0, "total": 0, "error": None}

    if req.source == "local_folder":
        if not req.path:
            raise HTTPException(status_code=422, detail="path is required for local_folder source")
        background_tasks.add_task(_run_local_ingest, job_id, req.path)

    elif req.source == "notion":
        token = req.notion_token
        if not token:
            import os
            token = os.getenv("NOTION_TOKEN", "")
        if not token:
            raise HTTPException(status_code=422, detail="notion_token required (or set NOTION_TOKEN env var)")
        if not req.database_id:
            raise HTTPException(status_code=422, detail="database_id required for notion source")
        background_tasks.add_task(_run_notion_ingest, job_id, token, req.database_id)

    return IngestResponse(job_id=job_id, status="queued", total_docs=0)


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        processed=job["processed"],
        total=job["total"],
        error=job.get("error"),
    )
