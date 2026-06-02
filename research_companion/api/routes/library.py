from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from retrieval.metadata_db import MetadataDB
from retrieval.vector_store import VectorStore

router = APIRouter(prefix="/library", tags=["library"])


class DocumentOut(BaseModel):
    doc_id: str
    source: str
    source_type: str
    title: str
    author: str
    year: int
    journal: str
    doi: str
    collection: str
    parse_quality: str
    parser_used: str
    importance_weight: float
    chunk_count: int
    ingested_at: str


@router.get("", response_model=list[DocumentOut])
async def list_documents(source_type: str | None = None) -> list[DocumentOut]:
    docs = MetadataDB().list_docs(source_type=source_type)
    return [DocumentOut(**d) for d in docs]


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: str) -> None:
    db = MetadataDB()
    docs = db.list_docs()
    target = next((d for d in docs if d["doc_id"] == doc_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Document not found")

    db.delete_by_source(target["source"])
    VectorStore().delete_by_source(target["source"])
