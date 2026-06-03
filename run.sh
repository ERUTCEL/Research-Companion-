#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/research_companion"
APP_DIR="$ROOT_DIR/app"
ENV_FILE="$BACKEND_DIR/.env"
STAMP_FILE="$BACKEND_DIR/.venv/.deps-installed"

echo "== Research Companion =="

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
ANTHROPIC_API_KEY=replace_with_your_anthropic_api_key
LITE_MODE=true
LOG_LEVEL=INFO
EOF
  echo
  echo "Created $ENV_FILE"
  echo "Open it, replace ANTHROPIC_API_KEY, then run ./run.sh again."
  exit 1
fi

if grep -q "replace_with_your_anthropic_api_key" "$ENV_FILE"; then
  echo "Please edit $ENV_FILE and set ANTHROPIC_API_KEY before running."
  exit 1
fi

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$BACKEND_DIR/.venv"
fi

PYTHON="$BACKEND_DIR/.venv/bin/python"

if [ ! -f "$STAMP_FILE" ]; then
  echo "Installing backend dependencies. This can take a while on first run..."
  "$PYTHON" -m pip install --upgrade pip
  "$PYTHON" -m pip install -e "$BACKEND_DIR[dev,embeddings,reranker]"
  date > "$STAMP_FILE"
fi

if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd "$APP_DIR" && npm install)
fi

echo "Starting Research Companion..."
cd "$APP_DIR"
npm run dev
