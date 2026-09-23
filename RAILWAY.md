# Railway Deployment — Persistent Credits & Zero-Reset Guide

## Why credits were resetting to 0 previously

Holder credits, the credit ledger, holder accrual clocks, projects, artifacts, and CLI API keys live in an ACID SQLite database (`jev-brain.db`).
Railway's default container filesystem is **ephemeral**: every time code is deployed or the service restarts, Railway spawns a completely fresh container image. The previous unmounted container filesystem was deleted, resetting the database to empty (balance = 0).

---

## What has been implemented (100% Fail-Safe)

### 1. Robust Volume & Data Directory Resolution (`src/core/db-adapter.js`)
The database and state directory resolves in this authoritative priority order:
1. `DATABASE_PATH` — direct DB file path (e.g. `/data/jev-brain.db`).
2. `JEV_DATA_DIR` — persistent directory pinned by env var or `Dockerfile` (`ENV JEV_DATA_DIR=/data`).
3. `RAILWAY_VOLUME_MOUNT_PATH` — auto-detected when Railway exports the volume mount path.
4. **Auto-detected `/data` Mount** — if running on Linux/Docker/Railway and `/data` exists and is writable, it is automatically selected as persistent storage (`PERSISTENT_STORAGE = true`) with **zero warnings**.
5. Fallback `./data` next to repo (emits warning in production if persistent storage is missing).

### 2. Auto-Persisting `SESSION_SECRET` (`src/server.js`)
- If `SESSION_SECRET` is set in Railway Variables, it is used immediately.
- If the user forgets to set `SESSION_SECRET`, the server generates a cryptographically random 32-byte secret and **persists it to `/data/.session_secret`** on the attached volume.
- Across every future deploy, the server reads `/data/.session_secret`. **Users will never be logged out across redeploys!**

### 3. Graceful Shutdown & WAL Checkpoint on Redeploys
- Railway sends a `SIGTERM` signal prior to stopping old containers.
- The server traps `SIGTERM` and `SIGINT`, executes `PRAGMA wal_checkpoint(TRUNCATE)`, and closes the SQLite handle cleanly.
- All writes in flight are flushed into the persistent `/data/jev-brain.db` file before the old container stops.

---

## One-Time Setup in Railway Dashboard

1. In your **Railway Project**, click your Jev Brain service.
2. Click **+ New** (or right-click canvas / service settings) → **Volume**.
3. Set **Mount Path: `/data`**.
4. Redeploy your service.
5. In your Railway deploy logs, you will see:
   ```
   [DBAdapter] Database file: /data/jev-brain.db
   ```
   and **no ephemeral storage warning**.
6. From that point on, **no matter how many times you redeploy, all credits, ledger records, API keys, and user sessions remain 100% intact and permanent.**

---

## Important Rules

- **Replicas = 1**: Keep instance count at 1 (SQLite is single-writer; background fee harvester, reconciler, and auditor daemons run as a single coordinated process).
- **Volumes are per-service**: If you have multiple environments (e.g. staging and production), make sure each service has its own Volume attached.
- If migrating to multi-instance horizontal scaling in the future, use the included PostgreSQL schema: `migrations/001_rewards_and_credits_schema.sql`.

---

## Verification Commands

```bash
# Verify multiple redeploys simulate crash without losing credits
node test/persistence.test.mjs

# Verify interactive CLI and key persistence
npm run test:cli

# Run full 11-suite regression test
npm test
```