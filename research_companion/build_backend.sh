#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "→ Installing pyinstaller..."
.venv/bin/pip install pyinstaller --quiet

echo "→ Building backend binary..."
.venv/bin/pyinstaller run_server.py \
  --onedir \
  --name clio-backend \
  --distpath dist-bin \
  --workpath /tmp/clio-pyinstaller-build \
  --specpath /tmp/clio-pyinstaller-build \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import anthropic \
  --hidden-import chromadb \
  --hidden-import fastapi \
  --hidden-import structlog \
  --collect-submodules api \
  --collect-submodules ingestion \
  --collect-submodules retrieval \
  --collect-submodules generation \
  --collect-data pymupdf \
  --add-data "$SCRIPT_DIR/RAG_SYSTEM_PROMPT.md:." \
  --noconfirm \
  --clean

echo "✓ Backend directory: dist-bin/clio-backend/"
