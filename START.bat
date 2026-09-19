@echo off
chcp 65001 >nul
cls
echo.
echo ╔══════════════════════════════════════════╗
echo ║     ⚡ JEV BRAIN - One Click Start       ║
echo ╚══════════════════════════════════════════╝
echo.

:: Check prerequisites
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found!
    echo 📥 Install: https://nodejs.org/
    pause
    exit /b 1
)

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git not found!
    echo 📥 Install: https://git-scm.com/
    pause
    exit /b 1
)

echo ✅ Node.js: 
node --version
echo ✅ Git: 
git --version
echo.

:: Clone or update
if exist "devbrain\.git" (
    echo 🔄 Updating existing repository...
    cd devbrain
    git pull origin main
) else (
    echo 📥 Cloning repository...
    git clone https://github.com/Synxneuos/devbrain.git devbrain
    cd devbrain
)

echo.
echo 📦 Installing dependencies...
call npm install

echo.
echo ⚙️  Setting up environment...
if not exist .env (
    copy .env.example .env >nul
    echo ⚠️  Created .env - Add API keys if needed
)

echo.
echo 🚀 Starting server...
echo.
echo ╔══════════════════════════════════════════╗
echo ║  🌐 Dashboard: http://localhost:3333      ║
echo ║  📡 API: http://localhost:3333/api        ║
echo ╚══════════════════════════════════════════╝
echo.
echo Press Ctrl+C to stop the server
echo.

:: Start server and open browser
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3333"
node bin/brain.js serve --port 3333

pause
