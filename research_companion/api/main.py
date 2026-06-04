import asyncio
import os

import anthropic
import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer() if os.getenv("LOG_LEVEL", "INFO") == "DEBUG"
        else structlog.processors.JSONRenderer(),
    ]
)

from api.routes.chat import router as chat_router
from api.routes.ingest import router as ingest_router
from api.routes.library import router as library_router
from api.routes.local_ai import router as local_ai_router
from api.routes.search import router as search_router
from api.routes.sources import router as sources_router
from generation.local_reasoner import LocalReasoner

log = structlog.get_logger()

app = FastAPI(
    title="CLIO API",
    description="Local-first AI assistant for academic paper libraries",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)
app.include_router(search_router)
app.include_router(chat_router)
app.include_router(library_router)
app.include_router(local_ai_router)
app.include_router(sources_router)

@app.get("/health")
async def health() -> dict:
    local_status = LocalReasoner().status()
    return {
        "status": "ok",
        "ready": True,
        "detail": "ready",
        "local_reasoner": {
            "available": local_status["available"],
            "model": local_status["model"],
        },
    }


@app.exception_handler(anthropic.APIStatusError)
async def anthropic_api_error_handler(request: Request, exc: anthropic.APIStatusError) -> JSONResponse:
    log.error("anthropic_api_error", status_code=exc.status_code, message=str(exc.message))
    if exc.status_code == 401:
        return JSONResponse(status_code=401, content={"detail": "Invalid ANTHROPIC_API_KEY — check your .env file."})
    status = 502 if exc.status_code >= 500 else 400
    return JSONResponse(status_code=status, content={"detail": f"Anthropic API error {exc.status_code}: {exc.message}"})
