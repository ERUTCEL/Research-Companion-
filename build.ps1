$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot

Write-Host "Building CLIO Windows backend..."
& "$Root\research_companion\build_backend.ps1"

Write-Host "Copying backend binary..."
New-Item -ItemType Directory -Force -Path "$Root\app\backend" | Out-Null
Copy-Item "$Root\research_companion\dist-bin\clio-backend.exe" "$Root\app\backend\clio-backend.exe" -Force

Write-Host "Building CLIO Windows installer..."
Set-Location "$Root\app"
npm run build:win

Write-Host "Build complete: app\dist-electron\"
