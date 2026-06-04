"""
CLIO integration test suite.

Run via:
    ./run.sh --test              # start backend automatically
    .\run.ps1 --test             # Windows

Or manually (backend must already be running on port 8001):
    pytest research_companion/tests/integration_test.py -v
"""

import json
import os
import sys

import pytest
import requests

BACKEND = os.getenv("CLIO_TEST_BACKEND", "http://127.0.0.1:8001")
OLLAMA  = os.getenv("CLIO_TEST_OLLAMA",  "http://127.0.0.1:11434")


# ── Availability checks (evaluated at collection time) ───────────────────────

def _backend_up() -> bool:
    try: return requests.get(f"{BACKEND}/health", timeout=3).status_code == 200
    except: return False

def _backend_ready() -> bool:
    try: return requests.get(f"{BACKEND}/health", timeout=3).json().get("ready", False)
    except: return False

def _ollama_up() -> bool:
    try: return requests.get(f"{OLLAMA}/api/tags", timeout=3).status_code == 200
    except: return False

def _ollama_has_model() -> bool:
    try: return bool(requests.get(f"{OLLAMA}/api/tags", timeout=3).json().get("models"))
    except: return False

needs_backend = pytest.mark.skipif(not _backend_up(),    reason="CLIO backend not running on :8001")
needs_ready   = pytest.mark.skipif(not _backend_ready(), reason="Backend warmup not complete")
needs_ollama  = pytest.mark.skipif(not _ollama_up(),     reason="Ollama not running on :11434")
needs_model   = pytest.mark.skipif(not _ollama_has_model(), reason="No Ollama model installed")
needs_notion  = pytest.mark.skipif(not os.getenv("NOTION_TOKEN"), reason="NOTION_TOKEN not set")


# ── 4-1. Backend connection ──────────────────────────────────────────────────

@needs_backend
def test_backend_health():
    data = requests.get(f"{BACKEND}/health", timeout=5).json()
    assert data["status"] == "ok"
    assert "ready" in data


# ── 4-0. Local LLM (Ollama) ─────────────────────────────────────────────────

@needs_ollama
def test_ollama_running():
    data = requests.get(f"{OLLAMA}/api/tags", timeout=5).json()
    assert "models" in data


@needs_model
def test_ollama_model_installed():
    models = [m["name"] for m in requests.get(f"{OLLAMA}/api/tags", timeout=5).json()["models"]]
    assert len(models) >= 1
    preferred = {"qwen3:8b", "qwen3:14b", "gemma3:12b"}
    if not any(m.split(":")[0] in {p.split(":")[0] for p in preferred} for m in models):
        pytest.xfail(f"No recommended model found. Installed: {models}")


@needs_backend
@needs_model
def test_local_llm_visible_from_backend():
    data = requests.get(f"{BACKEND}/health", timeout=5).json()
    lr = data.get("local_reasoner", {})
    assert lr.get("available"), f"Backend sees Ollama as unavailable. Health: {data}"


# ── 4-2. Document ingestion ──────────────────────────────────────────────────

@needs_backend
def test_library_endpoint():
    res = requests.get(f"{BACKEND}/library", timeout=10)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@needs_backend
def test_pdf_ingest_via_folder(tmp_path):
    """Ingest a minimal text PDF from a temp folder."""
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R"
        b"/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        b"4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (CLIO test) Tj ET\n"
        b"endstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n"
        b"0000000115 00000 n \n0000000266 00000 n \n0000000360 00000 n \n"
        b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n441\n%%EOF\n"
    )
    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(pdf_bytes)

    res = requests.post(
        f"{BACKEND}/ingest",
        json={"source": "local_folder", "path": str(tmp_path)},
        timeout=30,
    )
    assert res.status_code == 200, f"Ingest failed: {res.status_code} {res.text}"
    job_id = res.json()["job_id"]

    # Poll until done
    for _ in range(20):
        import time; time.sleep(2)
        status = requests.get(f"{BACKEND}/ingest/{job_id}", timeout=5).json()
        if status["status"] in ("done", "failed"):
            break
    assert status["status"] == "done", f"Ingest failed: {status}"


@needs_notion
@needs_backend
def test_notion_ingest_auth():
    """Notion token is accepted (422 = no DB found is OK, 401 = bad token is not)."""
    res = requests.post(
        f"{BACKEND}/ingest",
        json={"source": "notion", "notion_token": os.getenv("NOTION_TOKEN"), "database_id": "test"},
        timeout=30,
    )
    assert res.status_code != 401, "Notion token rejected (401 Unauthorized)"


# ── 4-3. RAG pipeline ───────────────────────────────────────────────────────

@needs_ready
def test_rag_no_source_response():
    """Empty library → no_source event without crashing."""
    res = requests.post(
        f"{BACKEND}/chat/stream",
        json={"query": "zzz_no_match_xyzzy", "filters": {}, "conversation_history": []},
        stream=True, timeout=30,
    )
    assert res.status_code == 200
    events = []
    for line in res.iter_lines(decode_unicode=True):
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
        if len(events) >= 5: break
    res.close()
    types = {e["type"] for e in events}
    assert types & {"no_source", "sources", "token", "done", "error"}, f"Unexpected: {types}"


@needs_ready
def test_rag_stream_structure():
    """If sources exist, stream delivers token + done events with citations."""
    res = requests.post(
        f"{BACKEND}/chat/stream",
        json={"query": "What is attention mechanism?", "filters": {}, "conversation_history": []},
        stream=True, timeout=60,
    )
    assert res.status_code == 200
    events = []
    for line in res.iter_lines(decode_unicode=True):
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
        if any(e["type"] in ("done", "no_source") for e in events):
            break
    res.close()

    final = next((e for e in events if e["type"] in ("done", "no_source")), None)
    assert final is not None, "No terminal event received"
    if final["type"] == "done":
        assert "citations" in final
        assert "confidence" in final


# ── 4-4. Fallback / error states ────────────────────────────────────────────

def test_no_llm_graceful_error():
    """RAGPipeline with no provider returns human-readable message, not exception."""
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import tempfile
    from retrieval.embedder import Embedder
    from retrieval.hybrid_search import HybridSearch
    from retrieval.vector_store import VectorStore
    from generation.rag_pipeline import RAGPipeline
    from ingestion.models import ChunkMetadata

    with tempfile.TemporaryDirectory() as d:
        store = VectorStore(persist_dir=d)
        embedder = Embedder()

        text = "Attention mechanism allows models to focus on relevant parts."
        meta = ChunkMetadata(
            doc_id="t", source="/t.pdf", source_type="pdf", is_user_memo=False,
            page_number=1, bbox=[0,0,100,20], parser_used="pymupdf4llm",
            parse_quality="high", title="Test", author="A", year=2020,
            journal="", doi="", importance_weight=1.0, collection="/",
        )
        store.add([(text, meta)], embedder.embed([text]))

        # Build pipeline with no provider (no env keys, Ollama might or might not run)
        from generation.providers import build_provider
        import os as _os
        orig = {k: _os.environ.pop(k, None) for k in ["ANTHROPIC_API_KEY","OPENAI_API_KEY","CLIO_PROVIDER"]}
        _os.environ["CLIO_PROVIDER"] = "ollama"  # force ollama; if unavailable → error msg

        pipeline = RAGPipeline(HybridSearch(embedder=embedder, store=store))
        result = pipeline.answer("attention mechanism")
        for k, v in orig.items():
            if v: _os.environ[k] = v

    assert isinstance(result.get("answer"), str)
    assert len(result["answer"]) > 5


# ── Standalone runner ────────────────────────────────────────────────────────

def test_suite() -> bool:
    tests = [
        ("Backend Health",          test_backend_health),
        ("Ollama Running",          test_ollama_running),
        ("Ollama Model Installed",  test_ollama_model_installed),
        ("Local LLM Visible",       test_local_llm_visible_from_backend),
        ("Library Endpoint",        test_library_endpoint),
        ("PDF Ingest",              lambda: test_pdf_ingest_via_folder(__import__('pathlib').Path(__import__('tempfile').mkdtemp()))),
        ("Notion Auth",             test_notion_ingest_auth),
        ("RAG No-Source",           test_rag_no_source_response),
        ("RAG Stream Structure",    test_rag_stream_structure),
        ("No-LLM Error",            test_no_llm_graceful_error),
    ]
    passed = failed = skipped = 0
    print("\n── CLIO Integration Tests ──────────────────────────────")
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}"); passed += 1
        except pytest.skip.Exception as e:
            print(f"  SKIP  {name}  ({e})"); skipped += 1
        except Exception as e:
            print(f"  FAIL  {name}\n        {e}"); failed += 1
    print(f"────────────────────────────────────────────────────────")
    print(f"  {passed} passed  {failed} failed  {skipped} skipped\n")
    return failed == 0


if __name__ == "__main__":
    sys.exit(0 if test_suite() else 1)
