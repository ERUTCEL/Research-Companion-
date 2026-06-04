$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "research_companion"
$AppDir = Join-Path $RootDir "app"
$EnvFile = Join-Path $BackendDir ".env"
$VenvDir = Join-Path $BackendDir ".venv"
$StampFile = Join-Path $VenvDir ".deps-installed"
$Python = Join-Path $VenvDir "Scripts\python.exe"

Write-Host "== CLIO =="

# ── --test: run integration tests against a live backend ─────────────────────
if ($args[0] -eq "--test") {
  if (-not (Test-Path $Python)) {
    Write-Host "ERROR: .venv not found. Run .\run.ps1 once first to set up the environment."
    exit 1
  }
  Write-Host "Starting backend for tests..."
  $BackendProc = Start-Process -FilePath $Python `
    -ArgumentList "-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8001", "--log-level", "warning" `
    -WorkingDirectory $BackendDir -PassThru -WindowStyle Hidden
  $ready = $false
  for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      $null = Invoke-WebRequest -Uri "http://127.0.0.1:8001/health" -TimeoutSec 2 -ErrorAction Stop
      $ready = $true; break
    } catch { }
  }
  if (-not $ready) {
    Write-Host "ERROR: Backend did not start."; Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue; exit 1
  }
  Write-Host "Running integration tests..."
  Push-Location $RootDir
  & $Python -m pytest research_companion/tests/integration_test.py -v --tb=short
  $TestExit = $LASTEXITCODE
  Pop-Location
  Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
  exit $TestExit
}

# ── Python 설치 확인 ──────────────────────────────────────────────────────────
$PythonCmd = $null
foreach ($cmd in @("py", "python", "python3")) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { $PythonCmd = $cmd; break }
}
if (-not $PythonCmd) {
  Write-Host ""
  Write-Host "ERROR: Python이 설치되지 않았습니다."
  Write-Host "  https://www.python.org/downloads/ 에서 Python 3.11+ 설치 후 다시 실행하세요."
  Write-Host "  (설치 시 'Add Python to PATH' 체크 필수)"
  exit 1
}

# ── .env 생성 (없으면) ────────────────────────────────────────────────────────
if (-not (Test-Path $EnvFile)) {
  @"
# API key는 앱 실행 후 설정 화면에서 입력할 수 있습니다.
# Ollama가 설치되어 있으면 API 키 없이도 작동합니다.
LITE_MODE=true
LOG_LEVEL=INFO
"@ | Set-Content -Path $EnvFile -Encoding UTF8
  Write-Host "Created $EnvFile"
}

# ── venv 생성 ─────────────────────────────────────────────────────────────────
if (-not (Test-Path $VenvDir)) {
  Write-Host "Creating Python virtual environment..."
  if ($PythonCmd -eq "py") { py -3 -m venv $VenvDir } else { & $PythonCmd -m venv $VenvDir }
}

# ── 의존성 설치 ───────────────────────────────────────────────────────────────
if (-not (Test-Path $StampFile)) {
  Write-Host "Installing backend dependencies. This can take a while on first run..."
  & $Python -m pip install --upgrade pip
  & $Python -m pip install -e "${BackendDir}[dev,embeddings,reranker]"
  Get-Date | Set-Content -Path $StampFile
}

# ── npm 의존성 ────────────────────────────────────────────────────────────────
$NodeModules = Join-Path $AppDir "node_modules"
if (-not (Test-Path $NodeModules)) {
  Write-Host "Installing frontend dependencies..."
  Push-Location $AppDir; npm install; Pop-Location
}

Write-Host "Starting CLIO..."
Push-Location $AppDir
npm run dev
Pop-Location
