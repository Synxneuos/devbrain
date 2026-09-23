# Jev Brain CLI - Windows PowerShell One-Line Installer
# Usage: irm https://jevbrain.world/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "== JEV BRAIN LOCAL CLI INSTALLER ==" -ForegroundColor Cyan
Write-Host "Don't think. Route." -ForegroundColor Magenta
Write-Host ""

# Check for Node.js
$nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeInstalled) {
    Write-Host "[ERROR] Node.js is required but not installed." -ForegroundColor Red
    Write-Host "Please install Node.js (v18+) from: https://nodejs.org or run: winget install OpenJS.NodeJS" -ForegroundColor Yellow
    exit 1
}

$nodeVersion = node -v
Write-Host "[OK] Found Node.js: $nodeVersion" -ForegroundColor Green

# Install jevbrain globally
Write-Host "[*] Installing Jev Brain CLI globally from official repository..." -ForegroundColor Cyan
try {
    npm install -g Synxneuos/jevbrain
    Write-Host "[OK] Successfully installed jevbrain CLI globally!" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Global npm install had an issue. Please run: npm install -g Synxneuos/jevbrain" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "== JEV BRAIN CLI READY TO USE ON WINDOWS! ==" -ForegroundColor Green
Write-Host ""
Write-Host "Quick Setup:" -ForegroundColor White
Write-Host "  1. Get your Token Holder API key from: https://jevbrain.world/api-keys" -ForegroundColor Cyan
Write-Host "  2. Open the Jev Brain terminal session - it will ask you to paste your key:" -ForegroundColor White
Write-Host "     jevbrain" -ForegroundColor Cyan
Write-Host "  3. Or configure the key directly, then run your first AI query:" -ForegroundColor White
Write-Host "     jevbrain config set-key your-api-key" -ForegroundColor Cyan
Write-Host "     jevbrain status" -ForegroundColor Cyan
Write-Host "  4. Inside chat: /models, /credits, /status, /clear, /exit" -ForegroundColor White
Write-Host ""
