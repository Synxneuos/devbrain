# ⚡ Jev Brain - Quick Setup Guide

## 🚀 One-Command Setup (Fresh Download)

### Option 1: Using Batch File (Easiest)
```bash
QUICK-START.bat
```

Just double-click `QUICK-START.bat` and everything will be done automatically!

### Option 2: Using PowerShell Script
```powershell
.\setup-and-run.ps1
```

### Option 3: Manual One-Liner (PowerShell)
```powershell
git clone https://github.com/Synxneuos/devbrain.git && cd devbrain && npm install && node bin/brain.js serve
```

### Option 4: Manual One-Liner (CMD)
```cmd
git clone https://github.com/Synxneuos/devbrain.git && cd devbrain && npm install && node bin/brain.js serve
```

---

## 🎯 If You Already Have the Project

If you're already in the project directory (like you are now), just run:

```bash
npm install
npm start
```

Or for development mode on port 3333:
```bash
npm run dev
```

---

## 📋 Prerequisites

Before running, make sure you have:
- ✅ **Node.js** (v18+) - Download from https://nodejs.org/
- ✅ **Git** - Download from https://git-scm.com/

---

## 🔧 Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```

2. Edit `.env` and add your API keys (optional):
   - `OPENROUTER_API_KEY` - Get from https://openrouter.ai/keys
   - `OPENAI_API_KEY` - Your OpenAI key
   - `ANTHROPIC_API_KEY` - Your Anthropic key

---

## 🎮 Available Commands

```bash
npm start          # Start server on default port
npm run dev        # Start server on port 3333 (development)
npm test           # Run tests
npm run classify   # Classify items from stdin/file
npm run warden     # Run agent safety gate
```

---

## 🌐 Access the Web Dashboard

After starting the server, open your browser:
```
http://localhost:3333
```

---

## 📁 Project Structure

```
magical-hubble/
├── bin/brain.js          # CLI entry point
├── src/
│   ├── core/
│   │   ├── router.js     # Decision routing engine
│   │   ├── warden.js     # Agent safety gate
│   │   └── openrouter.js # Model integration
│   └── server.js         # Web server
├── public/               # Frontend files
├── test/                 # Test files
├── .env                  # Environment config (create this)
├── package.json          # Dependencies
└── README.md            # Documentation
```

---

## 🆘 Troubleshooting

**Problem: `npm` is not recognized**
- Solution: Install Node.js from https://nodejs.org/ and restart your terminal

**Problem: `git` is not recognized**
- Solution: Install Git from https://git-scm.com/ and restart your terminal

**Problem: Port 3333 is already in use**
- Solution: Run `npm run dev -- --port 3334` to use a different port

**Problem: Module not found errors**
- Solution: Run `npm install` again

---

## 🔐 Security Note

⚠️ **Never commit your `.env` file to Git!** It contains sensitive API keys.

The `.gitignore` file should already include `.env`, but always double-check.

---

## 📞 Support

- GitHub: https://github.com/Synxneuos/devbrain
- Issues: https://github.com/Synxneuos/devbrain/issues

---

**⚡ "Don't think. Route."**
