# ⚡ Jev Brain - One-Click Setup & Run
# This script clones, installs, and starts the project

param(
    [string]$RepoUrl = "https://github.com/Synxneuos/devbrain.git",
    [string]$ProjectDir = "devbrain",
    [int]$Port = 3333
)

Write-Host "`n⚡ JEV BRAIN - One-Click Setup`n" -ForegroundColor Cyan

# Step 1: Clone repository
if (Test-Path $ProjectDir) {
    Write-Host "⚠️  Directory '$ProjectDir' already exists. Removing..." -ForegroundColor Yellow
    Remove-Item -Path $ProjectDir -Recurse -Force
}

Write-Host "📥 Cloning repository..." -ForegroundColor Green
git clone $RepoUrl $ProjectDir

if (-not $?) {
    Write-Host "❌ Failed to clone repository. Check your internet connection." -ForegroundColor Red
    exit 1
}

# Step 2: Navigate to project
Set-Location $ProjectDir
Write-Host "📂 Entered project directory: $(Get-Location)" -ForegroundColor Green

# Step 3: Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Green
npm install

if (-not $?) {
    Write-Host "❌ Failed to install dependencies." -ForegroundColor Red
    exit 1
}

# Step 4: Create .env if not exists
if (-not (Test-Path ".env")) {
    Write-Host "⚙️  Creating .env file from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "⚠️  Please edit .env and add your API keys if needed." -ForegroundColor Yellow
}

# Step 5: Start server
Write-Host "`n🚀 Starting Jev Brain server on port $Port..." -ForegroundColor Cyan
Write-Host "💡 Open your browser and go to: http://localhost:$Port`n" -ForegroundColor Green

# Run the server
node bin/brain.js serve --port $Port
