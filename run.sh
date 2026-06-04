#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/research_companion"
APP_DIR="$ROOT_DIR/app"
ENV_FILE="$BACKEND_DIR/.env"
STAMP_FILE="$BACKEND_DIR/.venv/.deps-installed"

echo "== CLIO =="

# ── --test: run integration tests against a live backend ─────────────────────
if [ "${1:-}" = "--test" ]; then
  PYTHON="$BACKEND_DIR/.venv/bin/python"
  if [ ! -f "$PYTHON" ]; then
    echo "ERROR: .venv not found. Run ./run.sh once first to set up the environment."
    exit 1
  fi
  echo "Starting backend for tests..."
  cd "$BACKEND_DIR"
  "$PYTHON" -m uvicorn api.main:app --host 127.0.0.1 --port 8001 --log-level warning &
  BACKEND_PID=$!
  trap "kill $BACKEND_PID 2>/dev/null || true" EXIT
  for i in $(seq 1 30); do
    "$PYTHON" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2)" 2>/dev/null && break
    sleep 2
  done
  echo "Running integration tests..."
  cd "$ROOT_DIR"
  "$PYTHON" -m pytest research_companion/tests/integration_test.py -v --tb=short
  exit $?
fi

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# API key는 앱 실행 후 설정 화면에서 입력할 수 있습니다.
# Ollama가 설치되어 있으면 API 키 없이도 작동합니다.
LITE_MODE=true
LOG_LEVEL=INFO
EOF
  echo "Created $ENV_FILE"
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

echo "Starting CLIO..."
cd "$APP_DIR"
npm run dev
