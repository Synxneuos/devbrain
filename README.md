# ⚡ Jev Brain

> **“Don’t think. Route.”**  
> Ultra-fast local decision daemon (< 20ms) sitting in front of agents, scripts, and heavy LLMs.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Latency](https://img.shields.io/badge/Decision%20Latency-%3C1ms-brightgreen.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success.svg)]()
[![Node](https://img.shields.io/badge/Node-v20%2B-informational.svg)]()

---

## 💡 The Core Problem

LLMs are brilliant at reasoning, but terrible at mundane high-frequency triage:
- Why wake up a heavy 70B/Opus model and wait **2,500ms** (and pay \$0.03) just to decide if an email is spam, or if a tool call is safe?
- **Jev Brain** acts as a local attention firewall and decision daemon. It executes in **sub-millisecond latency (< 1ms)**:
  - **Confidence $\ge$ 0.80** $\rightarrow$ **`AUTO_ACT`** (Instant zero-cost routing)
  - **Confidence $<$ 0.80** $\rightarrow$ **`REVIEW_QUEUE`** (Pass to Grok / Claude / Human)

```
Incoming Stream (Emails / Tool Calls / Tweets)
       │
       ▼
┌───────────────────────────────────────────────┐
│              ⚡ JEV BRAIN                    │
│    Local Decision Daemon (< 1ms latency)      │
└──────────────────────┬────────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
Confidence ≥ 0.8                Confidence < 0.8
 🚀 AUTO-ACT                     ⚠ REVIEW QUEUE
(Direct zero-cost route)        (Sent to Grok / Claude / Human)
```

---

## 📦 3 Concrete Products Built-In

### 1. Jev Brain for Inbox & Notifications
Triage emails, chats, or webhooks into `urgent`, `money`, `spam`, `personal`, and `later`. High confidence items are auto-tagged; ambiguous ones drop into the review queue.

### 2. Jev Brain for Coding Agents (Agent Warden)
Every tool call passes through **4 pre-flight questions**:
1. *Is this the right file?* (Blocks `.env`, `.git/`, SSH keys, root paths)
2. *Is this irreversible?* (Blocks `rm -rf`, `drop table`, `git reset --hard`)
3. *Are we looping?* (Catches repeating tool loops $\ge 3\times$)
4. *Are we done?* (Detects task termination criteria)

Outputs **Green** (`AUTO_ALLOW`), **Yellow** (`NEEDS_CONFIRM`), or **Red** (`BLOCKED_RISKY`).

### 3. Jev Brain for X & News Firehose
Personal attention firewall turning 100+ tweets/headlines into `signal`, `deep_dive`, and `noise`.

### 4. Jev Mobile Runner (Autonomous Android Device Gateway)
Operates connected Android devices natively via ADB / Mobilerun protocol with pre-flight Agent Warden safety checks.
- **Interactive Web Mirror:** Real-time phone canvas with direct click-to-tap, drag-to-swipe, and Android navigation keys (`Back`, `Home`, `Recents`).
- **CLI Execution Suite:** Execute gestures and UI inspection directly from terminal (`brain mobile devices`, `brain mobile tap 540 1200`, `brain mobile inspect`).
- **Pre-Flight Safety Firewall:** Prevents destructive shell injections, unauthorized resets, or loop repetition on physical & virtual devices.
- **Dual Mode:** Seamlessly bridges to real USB/WiFi ADB devices or spins up an interactive Virtual Android Device (`Pixel 8 Pro - Android 14`).

---

## 🚀 Quickstart

### Prerequisites
- Node.js v20 or newer (No external dependencies required!)

### 1. Run via CLI
Classify from standard input or file:
```bash
# Pipe directly
cat samples/inbox.txt | node bin/brain.js classify urgent,money,spam,later

# Or classify a file directly
node bin/brain.js classify urgent,money,spam,later samples/inbox.txt
```

Instant single routing:
```bash
node bin/brain.js route "Emergency: Payment gateway throwing 502" --preset inbox
```

Agent Warden check:
```bash
node bin/brain.js warden --tool bash --command "rm -rf /"
```

### 2. Launch Web Dashboard & REST API
```bash
npm start
# or: node bin/brain.js serve --port 3333
```
Open **`http://localhost:3333`** to access the real-time Kanban decision matrix, live confidence meters, and sample streams.

---

## 🛠 API Endpoints

- `POST /api/route` — Classify single text item
- `POST /api/batch` — Classify array of items
- `POST /api/warden` — Run coding agent pre-flight gate
- `GET /api/stats` — Real-time latency, throughput, and estimated dollar savings

---

## 👥 Contributors & Collaboration

Developed collaboratively by **Synxneuos** and **Claude Opus 5** starting September 15, 2026:
- **Synxneuos**: Architecture, specification, pipelines, and web matrix.
- **Claude Opus 5**: Core sub-millisecond decision engine, confidence calibration matrix, and Agent Warden safety gates.
- **Co-Author**: Claude Opus 5

License: MIT
