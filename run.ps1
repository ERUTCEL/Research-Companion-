$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "research_companion"
$AppDir = Join-Path $RootDir "app"
$EnvFile = Join-Path $BackendDir ".env"
$VenvDir = Join-Path $BackendDir ".venv"
$StampFile = Join-Path $VenvDir ".deps-installed"

Write-Host "== Research Companion =="

if (-not (Test-Path $EnvFile)) {
  @"
ANTHROPIC_API_KEY=replace_with_your_anthropic_api_key
LITE_MODE=true
LOG_LEVEL=INFO
"@ | Set-Content -Path $EnvFile -Encoding UTF8

  Write-Host ""
  Write-Host "Created $EnvFile"
  Write-Host "Open it, replace ANTHROPIC_API_KEY, then run .\run.ps1 again."
  exit 1
}

if ((Get-Content $EnvFile -Raw).Contains("replace_with_your_anthropic_api_key")) {
  Write-Host "Please edit $EnvFile and set ANTHROPIC_API_KEY before running."
  exit 1
}

if (-not (Test-Path $VenvDir)) {
  Write-Host "Creating Python virtual environment..."
  if (Get-Command py -ErrorAction SilentlyContinue) {
    py -3 -m venv $VenvDir
  } else {
    python -m venv $VenvDir
  }
}

$Python = Join-Path $VenvDir "Scripts\python.exe"

if (-not (Test-Path $StampFile)) {
  Write-Host "Installing backend dependencies. This can take a while on first run..."
  & $Python -m pip install --upgrade pip
  & $Python -m pip install -e "${BackendDir}[dev,embeddings,reranker]"
  Get-Date | Set-Content -Path $StampFile
}

$NodeModules = Join-Path $AppDir "node_modules"
if (-not (Test-Path $NodeModules)) {
  Write-Host "Installing frontend dependencies..."
  Push-Location $AppDir
  npm install
  Pop-Location
}

Write-Host "Starting Research Companion..."
Push-Location $AppDir
npm run dev
Pop-Location
