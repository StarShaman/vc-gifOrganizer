# Updates the GifOrganizer plugin + Vencord, then rebuilds.
# Run from anywhere: powershell -ExecutionPolicy Bypass -File update.ps1
$ErrorActionPreference = "Stop"

$plugin = $PSScriptRoot
$vencord = Resolve-Path (Join-Path $plugin "..\..\..")

Write-Host "Updating GifOrganizer..." -ForegroundColor Cyan
git -C $plugin pull --ff-only

Write-Host "Updating Vencord..." -ForegroundColor Cyan
git -C $vencord pull --ff-only

Write-Host "Installing dependencies & building..." -ForegroundColor Cyan
Set-Location $vencord
pnpm install --frozen-lockfile
pnpm build

Write-Host "Done. Fully restart Discord to load the update." -ForegroundColor Green
