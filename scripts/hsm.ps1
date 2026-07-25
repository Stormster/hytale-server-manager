# Hytale Server Manager dev CLI shim (Windows)
# Usage: .\scripts\hsm.ps1 dev
#        .\scripts\hsm.ps1 addon build

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
  if ($args.Count -eq 0) {
    npm run hsm -- help
  } else {
    npm run hsm -- @args
  }
} finally {
  Pop-Location
}
