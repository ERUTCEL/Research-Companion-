#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════╗"
echo "║     CLIO — Production Build  ║"
echo "╚══════════════════════════════╝"

# ── 1. Python backend → binary ──────────────────────────────────────────────
echo ""
echo "▸ Step 1: Build Python backend (PyInstaller)"
bash "$ROOT/research_companion/build_backend.sh"

# ── 2. Copy binary to app/backend/ ──────────────────────────────────────────
echo ""
echo "▸ Step 2: Copy backend directory to app/backend/"
rm -rf "$ROOT/app/backend"
mkdir -p "$ROOT/app/backend"
cp -R "$ROOT/research_companion/dist-bin/clio-backend" "$ROOT/app/backend/"

if [[ "$(uname -s)" == "Darwin" ]] && ! file "$ROOT/app/backend/clio-backend/clio-backend" | grep -q "Mach-O"; then
  echo "✗ Backend is not a macOS executable. Build macOS packages on macOS."
  exit 1
fi

echo "  ✓ $(ls -lh "$ROOT/app/backend/")"

# ── 3. Vite build + electron-builder ────────────────────────────────────────
echo ""
echo "▸ Step 3: Build Electron app"
cd "$ROOT/app"
npm run build

echo ""
echo "✅ Build complete → app/dist-electron/"
ls "$ROOT/app/dist-electron/"
