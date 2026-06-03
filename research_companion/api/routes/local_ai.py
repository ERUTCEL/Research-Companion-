import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel, Field

from generation.local_reasoner import LocalReasoner

router = APIRouter(prefix="/local-ai", tags=["local-ai"])

_PULL_JOBS: dict[str, dict[str, Any]] = {}


class PullRequest(BaseModel):
    model: str = Field(..., min_length=1)


class PullResponse(BaseModel):
    job_id: str
    status: str
    model: str


def _pull(job_id: str, model: str) -> None:
    _PULL_JOBS[job_id]["status"] = "downloading"
    result = LocalReasoner().pull_model(model)
    _PULL_JOBS[job_id]["result"] = result
    _PULL_JOBS[job_id]["status"] = "done" if result.get("ok") else "failed"
    _PULL_JOBS[job_id]["error"] = "" if result.get("ok") else result.get("status", "unknown error")


@router.get("/status")
async def status() -> dict[str, Any]:
    return LocalReasoner().status()


@router.post("/pull", response_model=PullResponse)
async def pull(req: PullRequest, background_tasks: BackgroundTasks) -> PullResponse:
    job_id = str(uuid.uuid4())
    _PULL_JOBS[job_id] = {"status": "queued", "model": req.model, "error": "", "result": None}
    background_tasks.add_task(_pull, job_id, req.model)
    return PullResponse(job_id=job_id, status="queued", model=req.model)


@router.get("/pull/{job_id}")
async def pull_status(job_id: str) -> dict[str, Any]:
    return _PULL_JOBS.get(job_id, {"status": "missing", "error": "Job not found"})
