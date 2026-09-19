# ⚡ HOW TO RUN - Jev Brain Project

## 🚨 **CRITICAL SECURITY WARNING** 🚨

**Your GitHub Personal Access Token was previously mentioned in chat!**

Token: `ghp_************************************` (Redacted for security)

**Best Practice:**
1. Keep Personal Access Tokens stored in environment variables or credential manager.
2. Never commit raw tokens into repository files.

---

## ✅ **CURRENT STATUS: ALREADY RUNNING!**

Your Jev Brain server is **already running** at:
```
🌐 http://localhost:3333
```
Status: **200 OK** ✅

You can open this URL in your browser right now!

---

## 🎯 **ONE-COMMAND OPTIONS**

### **Option 1: For Fresh Download (New Folder)**
```bash
git clone https://github.com/Synxneuos/jevbrain.git && cd jevbrain && npm install && node bin/brain.js serve
```

### **Option 2: For Current Project (You're Already Here!)**
```bash
npm start
```

### **Option 3: Development Mode (Port 3333)**
```bash
npm run dev
```

### **Option 4: Using Batch File (Easiest for Beginners)**
Just double-click: **`QUICK-START.bat`**

### **Option 5: Using PowerShell Script**
```powershell
.\setup-and-run.ps1
```

---

## 📋 **WHAT I'VE CREATED FOR YOU**

1. **QUICK-START.bat** - Double-click to download, install, and run
2. **setup-and-run.ps1** - PowerShell version of the above
3. **README-SETUP.md** - Complete setup guide with troubleshooting

---

## 🔧 **PROJECT INFORMATION**

- **Repository:** https://github.com/Synxneuos/jevbrain
- **Default Port:** 3333
- **Tech Stack:** Node.js (ESM)
- **No External Dependencies:** Uses only built-in Node.js modules
- **Node Version:** v24.18.0 ✅ (You have the latest!)

---

## 🎮 **AVAILABLE COMMANDS**

Once in the project directory:

```bash
# Start web server (default)
npm start

# Start web server on custom port
npm start -- --port 8080

# Development mode (port 3333)
npm run dev

# Run tests
npm test

# Classify items
npm run classify

# Agent safety gate
npm run warden
```

---

## 🌐 **WEB DASHBOARD FEATURES**

Your server includes:
- ✅ Web UI at http://localhost:3333
- ✅ REST API at `/api/route`
- ✅ Decision routing engine (<20ms)
- ✅ Agent safety gate (Warden)
- ✅ Live statistics dashboard
- ✅ Multi-model support (OpenRouter)

---

## 🔐 **CONFIGURATION (Optional)**

If you want to use AI features, create a `.env` file:

```bash
# Copy example
copy .env.example .env

# Edit with your API keys
notepad .env
```

**Optional API Keys:**
- `OPENROUTER_API_KEY` - https://openrouter.ai/keys (500+ models)
- `OPENAI_API_KEY` - Your OpenAI key
- `ANTHROPIC_API_KEY` - Your Claude key

**Note:** The basic routing features work WITHOUT any API keys!

---

## 🆘 **TROUBLESHOOTING**

### **Problem: Port 3333 already in use**
```bash
# Use different port
npm run dev -- --port 8080
```

### **Problem: Server not running**
```bash
# Start it again
npm start
```

### **Problem: Changes not reflecting**
```bash
# Restart the server
# Press Ctrl+C to stop, then:
npm start
```

---

## 📊 **PROJECT STRUCTURE**

```
magical-hubble/
├── 📁 bin/              # CLI tools
│   └── brain.js        # Main CLI entry
├── 📁 src/              # Source code
│   ├── 📁 core/         # Core engines
│   │   ├── router.js   # Decision routing
│   │   ├── warden.js   # Safety gate
│   │   └── openrouter.js # AI integration
│   └── server.js       # Web server
├── 📁 public/           # Frontend files
├── 📁 test/             # Test files
├── ⚙️  .env             # Your config (create this)
├── 📦 package.json      # Project config
└── 📄 README.md        # Documentation
```

---

## 🎯 **QUICK START SUMMARY**

**Right Now:**
1. ✅ Server is running at http://localhost:3333
2. ✅ Open in browser and start using!

**For Future:**
```bash
# If server stops, restart with:
npm start

# Or download fresh anywhere:
git clone https://github.com/Synxneuos/jevbrain.git && cd jevbrain && npm install && npm start
```

---

## 🎉 **YOU'RE ALL SET!**

Your project is:
- ✅ Already downloaded
- ✅ Already installed (no dependencies needed!)
- ✅ Already running on port 3333
- ✅ Accessible at http://localhost:3333

**Just open your browser and start using it!** 🚀

---

**⚡ "Don't think. Route." - Jev Brain v1.0.0**
