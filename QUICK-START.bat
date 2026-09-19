@echo off
chcp 65001 >nul
echo.
echo ⚡ JEV BRAIN - Quick Setup & Run
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo 📥 Please install from: https://nodejs.org/
    pause
    exit /b 1
)

:: Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Git is not installed!
    echo 📥 Please install from: https://git-scm.com/
    pause
    exit /b 1
)

echo ✅ Node.js version: 
node --version

echo ✅ Git version: 
git --version

echo.
echo 📥 Cloning repository...
git clone https://github.com/Synxneuos/jevbrain.git temp-brain

if errorlevel 1 (
    echo ❌ Failed to clone repository
    pause
    exit /b 1
)

cd temp-brain

echo.
echo 📦 Installing dependencies...
npm install

if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ⚙️  Setting up environment...
if not exist .env (
    copy .env.example .env
    echo ⚠️  Created .env file - Please add your API keys!
)

echo.
echo 🚀 Starting Jev Brain server...
echo 🌐 Open browser at: http://localhost:3333
echo.
node bin/brain.js serve --port 3333
