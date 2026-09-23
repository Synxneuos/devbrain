# Jev Brain CLI - Windows PowerShell One-Line Installer
# Usage: irm https://jevbrain.world/install.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "⚡ JEV BRAIN LOCAL CLI INSTALLER" -ForegroundColor Cyan
Write-Host "“Don't think. Route.”" -ForegroundColor Magenta
Write-Host ""

# Check for Node.js
$nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeInstalled) {
    Write-Host "✖ Node.js is required but not installed." -ForegroundColor Red
    Write-Host "Please install Node.js (v18+) from: https://nodejs.org or run: winget install OpenJS.NodeJS" -ForegroundColor Yellow
    exit 1
}

$nodeVersion = node -v
Write-Host "✔ Found Node.js: $nodeVersion" -ForegroundColor Green

# Install jevbrain
Write-Host "📦 Installing Jev Brain CLI globally on your system..." -ForegroundColor Gray
try {
    npm install -g jevbrain
    Write-Host "✔ Successfully installed jevbrain CLI globally!" -ForegroundColor Green
} catch {
    Write-Host "⚠ Global npm install had a permission issue. Falling back to local runner..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 JEV BRAIN CLI READY TO USE ON WINDOWS!" -ForegroundColor Green
Write-Host ""
Write-Host "Quick Setup:" -ForegroundColor White
Write-Host "  1. Get your Token Holder API key from: https://jevbrain.world" -ForegroundColor Cyan
Write-Host "  2. Configure your key in this PowerShell terminal:" -ForegroundColor White
Write-Host "     jevbrain config set-key <your-api-key>" -ForegroundColor Cyan
Write-Host "  3. Run your first AI query:" -ForegroundColor White
Write-Host "     jevbrain `"Write a python script to check Solana token balances`"" -ForegroundColor Cyan
Write-Host "  4. Interactive terminal chat:" -ForegroundColor White
Write-Host "     jevbrain chat" -ForegroundColor Cyan
Write-Host ""
