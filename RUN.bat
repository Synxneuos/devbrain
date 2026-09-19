@echo off
:: ═══════════════════════════════════════════════════════════════
:: ⚡ JEV BRAIN - Production Setup ^& Run
:: ═══════════════════════════════════════════════════════════════

:: [1] CHECK PREREQUISITES
where node >nul 2>&1 && (
    echo ✅ Node.js detected
) || (
    echo ❌ Node.js required -^> https://nodejs.org/
    pause
    exit /b 1
)

where git >nul 2>&1 && (
    echo ✅ Git detected
) || (
    echo ❌ Git required -^> https://git-scm.com/
    pause
    exit /b 1
)

:: [2] CLONE ^& SETUP
if not exist "jevbrain" (
    echo 📥 Cloning jevbrain...
    git clone https://github.com/Synxneuos/jevbrain.git jevbrain >nul 2>&1
) else (
    echo 🔄 Updating jevbrain...
    cd jevbrain
    git pull origin main >nul 2>&1
    cd ..
)

cd jevbrain

:: [3] INSTALL
echo 📦 Installing...
call npm install --silent

:: [4] CONFIG
if not exist .env (
    copy .env.example .env >nul
)

:: [5] VERIFY SYNC
echo 🔍 Verifying frontend-backend sync...
node -e "const http=require('http');const options={hostname:'localhost',port:3333,path:'/api/stats',method:'GET'};const req=http.request(options,(res)=>{console.log('✅ API Sync Verified (Status:',res.statusCode,')');process.exit(0)});req.on('error',()=>console.log('⚠️  Server not running - will start now'));req.end();" 2>nul || echo ✅ Ready to start

:: [6] LAUNCH
echo.
echo ═══════════════════════════════════════════════════════════════
echo   🚀 Jev Brain Starting...
echo   🌐 http://localhost:3333
echo   📡 API http://localhost:3333/api
echo ═══════════════════════════════════════════════════════════════
echo.

timeout /t 1 /nobreak >nul
start http://localhost:3333

node bin/brain.js serve --port 3333

pause
