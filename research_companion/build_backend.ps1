$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "Installing PyInstaller..."
& .\.venv\Scripts\pip.exe install pyinstaller --quiet

Write-Host "Building Windows backend binary..."
& .\.venv\Scripts\pyinstaller.exe run_server.py `
  --onefile `
  --name clio-backend `
  --distpath dist-bin `
  --workpath "$env:TEMP\clio-pyinstaller-build" `
  --specpath "$env:TEMP\clio-pyinstaller-build" `
  --hidden-import uvicorn.logging `
  --hidden-import uvicorn.loops.auto `
  --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto `
  --hidden-import uvicorn.lifespan.on `
  --hidden-import anthropic `
  --hidden-import chromadb `
  --hidden-import fastapi `
  --hidden-import structlog `
  --collect-submodules api `
  --collect-submodules ingestion `
  --collect-submodules retrieval `
  --collect-submodules generation `
  --add-data "$PSScriptRoot\RAG_SYSTEM_PROMPT.md;." `
  --noconfirm `
  --clean

Write-Host "Backend binary: dist-bin\clio-backend.exe"
