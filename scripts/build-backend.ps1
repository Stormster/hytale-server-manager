# Build the Python backend sidecar and copy to Tauri binaries.
# Run from the project root: powershell -File scripts/build-backend.ps1

$ErrorActionPreference = "Stop"

Write-Host "==> Building backend with PyInstaller..." -ForegroundColor Cyan
Push-Location backend
python -m PyInstaller build.spec --noconfirm
Pop-Location

$exe = "backend\dist\server-manager-backend.exe"
if (-not (Test-Path $exe)) {
    Write-Host "ERROR: Build failed – $exe not found." -ForegroundColor Red
    exit 1
}

# Tauri expects the sidecar with a target-triple suffix
$targetTriple = "x86_64-pc-windows-msvc"
$dest = "src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$destFile = "$dest\server-manager-backend-$targetTriple.exe"
Copy-Item $exe $destFile -Force

Write-Host "==> Backend sidecar copied to $destFile" -ForegroundColor Green
Write-Host "==> Done! Run 'npm run tauri build' to create the installer." -ForegroundColor Cyan
