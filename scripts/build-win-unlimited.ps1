# Builds a Windows distributable with no trial day limit (internal / demo use).
# Requires: Windows, Node 22, Python 3.11+, Git Bash (for prepare-release-resources.sh)
#
# Output:
#   dist-app-unlimited/Exo/Exo.exe          — portable folder
#   dist-installer-unlimited/Exo Unlimited Setup.exe — installer
#
# Usage (PowerShell):
#   .\scripts\build-win-unlimited.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$env:EXO_UNLIMITED_BUILD = "1"

Write-Host "==> Installing dependencies"
npm install
Push-Location frontend
npm install
Pop-Location
pip install -r backend/requirements.txt pyinstaller

Write-Host "==> Frontend"
npm run build:frontend

Write-Host "==> Backend (PyInstaller)"
Push-Location backend
python -m PyInstaller backend.spec
Pop-Location
New-Item -ItemType Directory -Force -Path electron/resources | Out-Null
if (Test-Path electron/resources/backend) { Remove-Item electron/resources/backend -Recurse -Force }
Copy-Item backend/dist/backend electron/resources/backend -Recurse -Force

Write-Host "==> Release resources"
bash scripts/prepare-release-resources.sh

Write-Host "==> Package app (unlimited)"
npm run package:win:unlimited

Write-Host "==> Inno Setup installer"
$Iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $Iscc)) {
  choco install innosetup -y
}
& $Iscc installer-unlimited.iss

Write-Host ""
Write-Host "Done."
Write-Host "  Portable:  $Root\dist-app-unlimited\Exo\Exo.exe"
Write-Host "  Installer: $Root\dist-installer-unlimited\Exo Unlimited Setup.exe"
