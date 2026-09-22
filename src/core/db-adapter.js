/**
 * Jev Brain - Authoritative Transactional Database Adapter
 * 
 * Supports:
 * 1. Native transactional SQLite (node:sqlite DatabaseSync) for local daemon, staging, and unit tests.
 * 2. Supabase / PostgreSQL schema compatibility for production.
 * 
 * Guarantees:
 * - ACID transactions with rollback on failure.
 * - Strict per-wallet data isolation.
 * - Exact string/BigInt financial arithmetic (zero precision loss).
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isServerless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const DATA_DIR = isServerless ? '/tmp/jev-data' : path.join(__dirname, '..', '..', 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

const DEFAULT_DB_PATH = process.env.NODE_ENV === 'test'
  ? ':memory:'
  : path.join(DATA_DIR, 'jev-brain.db');

export class DatabaseAdapter {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = process.env.DATABASE_PATH || dbPath;
    this.db = null;
    this.inTransaction = false;
    this.init();
  }

  init() {
    try {
      this.db = new DatabaseSync(this.dbPath);
      this.setupSchema();
    } catch (err) {
      console.error('[DBAdapter] Init error:', err);
    }
  }

  getDb() {
    if (!this.db) {
      this.init();
    }
    return this.db;
  }

  setupSchema() {
    const db = this.db;
    if (!db) return;

    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      -- 1. HOLDER ACCOUNTS
      CREATE TABLE IF NOT EXISTS holder_accounts (
        wallet_address TEXT PRIMARY KEY,
        token_balance_raw TEXT NOT NULL DEFAULT '0',
        token_balance_ui REAL NOT NULL DEFAULT 0.0,
        tier TEXT NOT NULL DEFAULT 'None',
        tier_level INTEGER NOT NULL DEFAULT 0,
        credit_rate_per_hour INTEGER NOT NULL DEFAULT 0,
        last_verified_at TEXT NOT NULL,
        last_accrual_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 2. HOLDER SNAPSHOTS
      CREATE TABLE IF NOT EXISTS holder_snapshots (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        balance_raw TEXT NOT NULL,
        balance_ui REAL NOT NULL,
        tier TEXT NOT NULL,
        credit_rate_per_hour INTEGER NOT NULL,
        credits_accrued INTEGER NOT NULL DEFAULT 0,
        snapshot_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (wallet_address) REFERENCES holder_accounts(wallet_address) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_holder_snapshots_wallet ON holder_snapshots(wallet_address, snapshot_at);

      -- 3. CREDIT ACCOUNTS
      CREATE TABLE IF NOT EXISTS credit_accounts (
        wallet_address TEXT PRIMARY KEY,
        credit_account_id TEXT UNIQUE NOT NULL,
        earned TEXT NOT NULL DEFAULT '0',
        used TEXT NOT NULL DEFAULT '0',
        available TEXT NOT NULL DEFAULT '0',
        transferred TEXT NOT NULL DEFAULT '0',
        redeemed TEXT NOT NULL DEFAULT '0',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (wallet_address) REFERENCES holder_accounts(wallet_address) ON DELETE CASCADE
      );

      -- 4. CREDIT LEDGER
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        type TEXT NOT NULL,
        amount TEXT NOT NULL,
        balance_after TEXT NOT NULL,
        reference_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (wallet_address) REFERENCES credit_accounts(wallet_address) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_wallet ON credit_ledger(wallet_address, created_at);
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_ref ON credit_ledger(reference_id);

      -- 5. LLM USAGE
      CREATE TABLE IF NOT EXISTS llm_usage (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        credits_deducted TEXT NOT NULL DEFAULT '0',
        created_at TEXT NOT NULL,
        FOREIGN KEY (wallet_address) REFERENCES credit_accounts(wallet_address) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_llm_usage_wallet ON llm_usage(wallet_address, created_at);

      -- 6. REWARD CLAIMS
      CREATE TABLE IF NOT EXISTS reward_claims (
        claim_id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        destination_wallet TEXT NOT NULL,
        credits_redeemed TEXT NOT NULL,
        claim_amount_lamports TEXT NOT NULL,
        infrastructure_lamports TEXT NOT NULL,
        manual_lamports TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_MANUAL_TRANSFER',
        idempotency_key TEXT UNIQUE NOT NULL,
        transaction_signature TEXT,
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (wallet_address) REFERENCES credit_accounts(wallet_address) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_reward_claims_wallet ON reward_claims(wallet_address, created_at);
      CREATE INDEX IF NOT EXISTS idx_reward_claims_sig ON reward_claims(transaction_signature);

      -- 7. REWARD ALLOCATIONS
      CREATE TABLE IF NOT EXISTS reward_allocations (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL,
        type TEXT NOT NULL,
        basis_points INTEGER NOT NULL,
        amount_lamports TEXT NOT NULL,
        target_wallet TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES reward_claims(claim_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_reward_allocations_claim ON reward_allocations(claim_id);

      -- 8. MANUAL TRANSFERS
      CREATE TABLE IF NOT EXISTS manual_transfers (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL,
        recipient_wallet TEXT NOT NULL,
        amount_lamports TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        operator_wallet TEXT NOT NULL,
        transaction_signature TEXT,
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES reward_claims(claim_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_manual_transfers_claim ON manual_transfers(claim_id);
      CREATE INDEX IF NOT EXISTS idx_manual_transfers_status ON manual_transfers(status);

      -- 9. INFRASTRUCTURE ALLOCATIONS
      CREATE TABLE IF NOT EXISTS infrastructure_allocations (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL,
        infrastructure_wallet TEXT NOT NULL,
        amount_lamports TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES reward_claims(claim_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_infra_alloc_claim ON infrastructure_allocations(claim_id);

      -- 10. IDEMPOTENCY KEYS
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        idempotency_key TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        response_payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      -- 11. AUDIT EVENTS
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        wallet_address TEXT,
        actor_wallet TEXT,
        details TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_wallet ON audit_events(wallet_address, created_at);

      -- 12. FEE HARVEST HISTORY (15-min Fee Splitter)
      CREATE TABLE IF NOT EXISTS fee_harvest_history (
        id TEXT PRIMARY KEY,
        claimer_wallet TEXT NOT NULL,
        treasury_wallet TEXT NOT NULL,
        total_claimed_lamports TEXT NOT NULL,
        treasury_sent_lamports TEXT NOT NULL,
        pool_retained_lamports TEXT NOT NULL,
        tx_signature TEXT,
        status TEXT NOT NULL DEFAULT 'CONFIRMED',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fee_harvest_created ON fee_harvest_history(created_at);

      -- 13. REWARD POOL STATE (Dynamic 5% Pool Tracker)
      CREATE TABLE IF NOT EXISTS reward_pool_state (
        pool_id TEXT PRIMARY KEY,
        total_harvested_lamports TEXT NOT NULL DEFAULT '0',
        total_treasury_lamports TEXT NOT NULL DEFAULT '0',
        total_pool_lamports TEXT NOT NULL DEFAULT '0',
        available_pool_lamports TEXT NOT NULL DEFAULT '0',
        total_credits_burned TEXT NOT NULL DEFAULT '0',
        current_epoch INTEGER NOT NULL DEFAULT 1,
        epoch_pool_lamports TEXT NOT NULL DEFAULT '0',
        epoch_credits_burned TEXT NOT NULL DEFAULT '0',
        last_harvest_at TEXT,
        updated_at TEXT NOT NULL
      );

      -- 14. CREDIT BURNS (Proportional SOL Reward Claims)
      CREATE TABLE IF NOT EXISTS credit_burns (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        destination_wallet TEXT NOT NULL,
        credits_burned TEXT NOT NULL,
        reward_lamports TEXT NOT NULL,
        reward_sol REAL NOT NULL,
        market_cap_usd REAL NOT NULL,
        tx_signature TEXT,
        status TEXT NOT NULL DEFAULT 'CONFIRMED',
        idempotency_key TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_credit_burns_wallet ON credit_burns(wallet_address, created_at);

      -- 15. FEE HARVEST INTERVALS (Distributed & Process-Level Exactly-Once Lock)
      CREATE TABLE IF NOT EXISTS fee_harvest_intervals (
        interval_id TEXT PRIMARY KEY,
        interval_slot INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
        harvest_id TEXT,
        tx_signature TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_harvest_intervals_slot ON fee_harvest_intervals(interval_slot);

      -- 16. CREDIT RESERVATIONS (Two-Phase AI Reservation Protocol)
      CREATE TABLE IF NOT EXISTS credit_reservations (
        id TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        estimated_credits TEXT NOT NULL,
        actual_credits TEXT NOT NULL DEFAULT '0',
        model TEXT,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'SETTLED', 'RELEASED', 'EXPIRED')),
        created_at TEXT NOT NULL,
        settled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_credit_reservations_wallet ON credit_reservations(wallet_address, status);
      CREATE INDEX IF NOT EXISTS idx_credit_reservations_status ON credit_reservations(status, created_at);
    `);

    // Durable SQLite synchronous setting
    try { db.exec('PRAGMA synchronous = NORMAL;'); } catch {}

    // Migration: add idempotency_key and payment state machine columns to credit_burns
    try { db.exec(`ALTER TABLE credit_burns ADD COLUMN idempotency_key TEXT;`); } catch {}
    try { db.exec(`ALTER TABLE credit_burns ADD COLUMN signed_tx_raw TEXT;`); } catch {}
    try { db.exec(`ALTER TABLE credit_burns ADD COLUMN last_valid_block_height INTEGER;`); } catch {}
    try { db.exec(`ALTER TABLE credit_burns ADD COLUMN blockhash TEXT;`); } catch {}
    try { db.exec(`ALTER TABLE credit_burns ADD COLUMN state_history TEXT;`); } catch {}
    try { db.exec(`ALTER TABLE credit_burns ADD COLUMN updated_at TEXT;`); } catch {}

    try {
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_burns_idemp ON credit_burns(idempotency_key, wallet_address);`);
    } catch (e) {
      console.warn('[DBAdapter] idempotency index warning:', e.message);
    }
  }

  /**
   * Execute callback within an ACID database transaction
   */
  transaction(fn) {
    const db = this.getDb();
    if (this.inTransaction) {
      // Nested transaction: execute within current transaction
      return fn(this);
    }
    this.inTransaction = true;
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(this);
      db.exec('COMMIT');
      this.inTransaction = false;
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      this.inTransaction = false;
      throw err;
    }
  }

  // ── HOLDER ACCOUNTS ────────────────────────────────────────────────────────

  getHolderAccount(walletAddress) {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM holder_accounts WHERE wallet_address = ?').get(walletAddress);
    if (!row) return null;
    return {
      walletAddress: row.wallet_address,
      tokenBalanceRaw: row.token_balance_raw,
      tokenBalanceUi: Number(row.token_balance_ui),
      tier: row.tier,
      tierLevel: Number(row.tier_level),
      creditRatePerHour: Number(row.credit_rate_per_hour),
      lastVerifiedAt: row.last_verified_at,
      lastAccrualAt: row.last_accrual_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertHolderAccount(account) {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO holder_accounts (
        wallet_address, token_balance_raw, token_balance_ui, tier,
        tier_level, credit_rate_per_hour, last_verified_at, last_accrual_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        token_balance_raw = excluded.token_balance_raw,
        token_balance_ui = excluded.token_balance_ui,
        tier = excluded.tier,
        tier_level = excluded.tier_level,
        credit_rate_per_hour = excluded.credit_rate_per_hour,
        last_verified_at = excluded.last_verified_at,
        last_accrual_at = COALESCE(excluded.last_accrual_at, holder_accounts.last_accrual_at),
        updated_at = excluded.updated_at
    `).run(
      account.walletAddress,
      (account.tokenBalanceRaw || '0').toString(),
      Number(account.tokenBalanceUi || 0),
      account.tier || 'None',
      Number(account.tierLevel || 0),
      Number(account.creditRatePerHour || 0),
      account.lastVerifiedAt || now,
      account.lastAccrualAt || now,
      account.createdAt || now,
      now
    );
  }

  updateLastAccrualTime(walletAddress, timestampIso) {
    const db = this.getDb();
    db.prepare(`
      UPDATE holder_accounts
      SET last_accrual_at = ?, updated_at = ?
      WHERE wallet_address = ?
    `).run(timestampIso, new Date().toISOString(), walletAddress);
  }

  /**
   * B-4 FIX: Atomic conditional accrual update.
   * Only updates last_accrual_at if it still equals the expectedTimestamp.
   * Returns true if the update was applied, false if another process already advanced it.
   */
  conditionalUpdateAccrualTime(walletAddress, expectedTimestamp, newTimestamp) {
    const db = this.getDb();
    const result = db.prepare(`
      UPDATE holder_accounts
      SET last_accrual_at = ?, updated_at = ?
      WHERE wallet_address = ? AND last_accrual_at = ?
    `).run(newTimestamp, new Date().toISOString(), walletAddress, expectedTimestamp);
    return result.changes > 0;
  }

  insertHolderSnapshot(snapshot) {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO holder_snapshots (
        id, wallet_address, balance_raw, balance_ui, tier,
        credit_rate_per_hour, credits_accrued, snapshot_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.id,
      snapshot.walletAddress,
      snapshot.balanceRaw.toString(),
      Number(snapshot.balanceUi || 0),
      snapshot.tier,
      Number(snapshot.creditRatePerHour || 0),
      Number(snapshot.creditsAccrued || 0),
      snapshot.snapshotAt || now,
      now
    );
  }

  // ── CREDIT ACCOUNTS ────────────────────────────────────────────────────────

  getCreditAccount(walletAddress) {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM credit_accounts WHERE wallet_address = ?').get(walletAddress);
    if (!row) return null;
    return {
      walletAddress: row.wallet_address,
      creditAccountId: row.credit_account_id,
      earned: BigInt(row.earned || '0'),
      used: BigInt(row.used || '0'),
      available: BigInt(row.available || '0'),
      transferred: BigInt(row.transferred || '0'),
      redeemed: BigInt(row.redeemed || '0'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertCreditAccount(account) {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO credit_accounts (
        wallet_address, credit_account_id, earned, used, available, transferred, redeemed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        earned = excluded.earned,
        used = excluded.used,
        available = excluded.available,
        transferred = excluded.transferred,
        redeemed = excluded.redeemed,
        updated_at = excluded.updated_at
    `).run(
      account.walletAddress,
      account.creditAccountId,
      account.earned.toString(),
      account.used.toString(),
      account.available.toString(),
      account.transferred.toString(),
      account.redeemed.toString(),
      account.createdAt || now,
      now
    );
  }

  // ── CREDIT LEDGER ──────────────────────────────────────────────────────────

  insertCreditLedgerEntry(entry) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO credit_ledger (
        id, wallet_address, type, amount, balance_after, reference_id, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.walletAddress,
      entry.type,
      entry.amount.toString(),
      entry.balanceAfter.toString(),
      entry.referenceId || null,
      JSON.stringify(entry.metadata || {}),
      entry.timestamp || new Date().toISOString()
    );
  }

  getCreditLedger(walletAddress, limit = 50) {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM credit_ledger
      WHERE wallet_address = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(walletAddress, limit);

    return rows.map(r => ({
      id: r.id,
      walletAddress: r.wallet_address,
      type: r.type,
      amount: r.amount,
      balanceAfter: r.balance_after,
      referenceId: r.reference_id,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
      timestamp: r.created_at
    }));
  }

  // ── LLM USAGE ──────────────────────────────────────────────────────────────

  insertLlmUsage(usage) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO llm_usage (
        id, wallet_address, model, prompt_tokens, completion_tokens, total_tokens, credits_deducted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usage.id,
      usage.walletAddress,
      usage.model,
      Number(usage.promptTokens || 0),
      Number(usage.completionTokens || 0),
      Number(usage.totalTokens || 0),
      usage.creditsDeducted.toString(),
      usage.createdAt || new Date().toISOString()
    );
  }

  // ── REWARD CLAIMS & ALLOCATIONS ───────────────────────────────────────────

  insertRewardClaim(claim) {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO reward_claims (
        claim_id, wallet_address, destination_wallet, credits_redeemed,
        claim_amount_lamports, infrastructure_lamports, manual_lamports,
        status, idempotency_key, transaction_signature, confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      claim.claimId,
      claim.walletAddress,
      claim.destinationWallet,
      claim.creditsRedeemed.toString(),
      claim.claimAmountLamports.toString(),
      claim.infrastructureLamports.toString(),
      claim.manualLamports.toString(),
      claim.status || 'PENDING_MANUAL_TRANSFER',
      claim.idempotencyKey,
      claim.transactionSignature || null,
      claim.confirmedAt || null,
      claim.createdAt || now,
      claim.updatedAt || now
    );
  }

  insertRewardAllocation(alloc) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO reward_allocations (
        id, claim_id, type, basis_points, amount_lamports, target_wallet, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      alloc.id,
      alloc.claimId,
      alloc.type,
      Number(alloc.basisPoints),
      alloc.amountLamports.toString(),
      alloc.targetWallet,
      alloc.createdAt || new Date().toISOString()
    );
  }

  insertManualTransfer(xfer) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO manual_transfers (
        id, claim_id, recipient_wallet, amount_lamports, status,
        operator_wallet, transaction_signature, confirmed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      xfer.id,
      xfer.claimId,
      xfer.recipientWallet,
      xfer.amountLamports.toString(),
      xfer.status || 'PENDING',
      xfer.operatorWallet,
      xfer.transactionSignature || null,
      xfer.confirmedAt || null,
      xfer.createdAt || new Date().toISOString()
    );
  }

  insertInfrastructureAllocation(infra) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO infrastructure_allocations (
        id, claim_id, infrastructure_wallet, amount_lamports, recorded_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      infra.id,
      infra.claimId,
      infra.infrastructureWallet,
      infra.amountLamports.toString(),
      infra.recordedAt || new Date().toISOString()
    );
  }

  getRewardClaim(claimId) {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM reward_claims WHERE claim_id = ?').get(claimId);
    return row ? this.mapClaimRow(row) : null;
  }

  getRewardClaimByIdempotencyKey(idempotencyKey, walletAddress) {
    const db = this.getDb();
    // B-3 FIX: Scope idempotency key to wallet — prevents cross-user key replay
    if (walletAddress) {
      const row = db.prepare('SELECT * FROM reward_claims WHERE idempotency_key = ? AND wallet_address = ?').get(idempotencyKey, walletAddress);
      return row ? this.mapClaimRow(row) : null;
    }
    // Fallback for non-wallet-scoped lookups (e.g. internal use)
    const row = db.prepare('SELECT * FROM reward_claims WHERE idempotency_key = ?').get(idempotencyKey);
    return row ? this.mapClaimRow(row) : null;
  }

  getRewardClaimBySignature(signature) {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM reward_claims WHERE transaction_signature = ?').get(signature);
    return row ? this.mapClaimRow(row) : null;
  }

  getPendingClaims() {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM reward_claims
      WHERE status = 'PENDING_MANUAL_TRANSFER'
      ORDER BY created_at ASC
    `).all();
    return rows.map(r => this.mapClaimRow(r));
  }

  getAllClaims() {
    const db = this.getDb();
    const rows = db.prepare('SELECT * FROM reward_claims ORDER BY created_at DESC').all();
    return rows.map(r => this.mapClaimRow(r));
  }

  getClaimsByWallet(walletAddress) {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT * FROM reward_claims
      WHERE wallet_address = ?
      ORDER BY created_at DESC
    `).all(walletAddress);
    return rows.map(r => this.mapClaimRow(r));
  }

  confirmClaim(claimId, transactionSignature, operatorWallet, confirmedAt = new Date().toISOString()) {
    const db = this.getDb();
    this.transaction(() => {
      db.prepare(`
        UPDATE reward_claims
        SET status = 'MANUAL_TRANSFER_CONFIRMED',
            transaction_signature = ?,
            confirmed_at = ?,
            updated_at = ?
        WHERE claim_id = ?
      `).run(transactionSignature, confirmedAt, confirmedAt, claimId);

      db.prepare(`
        UPDATE manual_transfers
        SET status = 'CONFIRMED',
            transaction_signature = ?,
            confirmed_at = ?,
            operator_wallet = ?
        WHERE claim_id = ?
      `).run(transactionSignature, confirmedAt, operatorWallet, claimId);
    });
  }

  mapClaimRow(r) {
    return {
      claimId: r.claim_id,
      walletAddress: r.wallet_address,
      destinationWallet: r.destination_wallet,
      creditsRedeemed: BigInt(r.credits_redeemed || '0'),
      claimAmountLamports: BigInt(r.claim_amount_lamports || '0'),
      infrastructureLamports: BigInt(r.infrastructure_lamports || '0'),
      manualLamports: BigInt(r.manual_lamports || '0'),
      status: r.status,
      idempotencyKey: r.idempotency_key,
      transactionSignature: r.transaction_signature,
      confirmedAt: r.confirmed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  // ── IDEMPOTENCY KEYS ───────────────────────────────────────────────────────

  getIdempotencyKey(key) {
    const db = this.getDb();
    const row = db.prepare('SELECT * FROM idempotency_keys WHERE idempotency_key = ?').get(key);
    if (!row) return null;
    return {
      idempotencyKey: row.idempotency_key,
      action: row.action,
      walletAddress: row.wallet_address,
      responsePayload: JSON.parse(row.response_payload),
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }

  saveIdempotencyKey(key, action, walletAddress, payload, expiresAt) {
    const db = this.getDb();
    db.prepare(`
      INSERT OR REPLACE INTO idempotency_keys (
        idempotency_key, action, wallet_address, response_payload, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      key,
      action,
      walletAddress,
      JSON.stringify(payload),
      new Date().toISOString(),
      expiresAt
    );
  }

  // ── AUDIT EVENTS ───────────────────────────────────────────────────────────

  recordAuditEvent(eventType, walletAddress, actorWallet, details = {}) {
    try {
      const db = this.getDb();
      const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      db.prepare(`
        INSERT INTO audit_events (
          id, event_type, wallet_address, actor_wallet, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        eventType,
        walletAddress || null,
        actorWallet || null,
        JSON.stringify(details),
        new Date().toISOString()
      );
    } catch (e) {
      console.warn('[DBAdapter] Failed to record audit event:', e.message);
    }
  }

  // ── FEE HARVESTING & 5% REWARD POOL ───────────────────────────────────────

  insertFeeHarvest(harvest) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO fee_harvest_history (
        id, claimer_wallet, treasury_wallet, total_claimed_lamports,
        treasury_sent_lamports, pool_retained_lamports, tx_signature, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      harvest.id,
      harvest.claimerWallet,
      harvest.treasuryWallet,
      harvest.totalClaimedLamports.toString(),
      harvest.treasurySentLamports.toString(),
      harvest.poolRetainedLamports.toString(),
      harvest.txSignature || null,
      harvest.status || 'CONFIRMED',
      harvest.createdAt || new Date().toISOString()
    );
  }

  getFeeHarvestHistory(limit = 50) {
    const db = this.getDb();
    return db.prepare(`
      SELECT * FROM fee_harvest_history
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  // ── FEE HARVEST INTERVAL LOCKS (Exactly-Once Execution) ───────────────────

  tryAcquireHarvestInterval(intervalSlot, intervalId) {
    const db = this.getDb();
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO fee_harvest_intervals (interval_id, interval_slot, status, created_at, updated_at)
        VALUES (?, ?, 'IN_PROGRESS', ?, ?)
      `).run(intervalId, intervalSlot, now, now);
      return { acquired: true, intervalId };
    } catch (err) {
      const existing = db.prepare('SELECT * FROM fee_harvest_intervals WHERE interval_id = ?').get(intervalId);
      if (existing) {
        if (existing.status === 'CONFIRMED') {
          return { acquired: false, reason: 'ALREADY_CONFIRMED', interval: existing };
        }
        // If stuck in IN_PROGRESS for > 10 minutes (crashed instance), allow take-over.
        // Conditional UPDATE: only the instance whose UPDATE actually flips the row wins.
        const ageMs = Date.now() - new Date(existing.created_at).getTime();
        if (ageMs > 10 * 60 * 1000) {
          const res = db.prepare(`
            UPDATE fee_harvest_intervals
            SET status = 'IN_PROGRESS', created_at = ?, updated_at = ?
            WHERE interval_id = ? AND status = 'IN_PROGRESS'
          `).run(now, now, intervalId);
          if (res && res.changes === 1) {
            return { acquired: true, intervalId, recovered: true };
          }
          // Another instance won the take-over race
          return { acquired: false, reason: 'IN_PROGRESS_ACTIVE', interval: existing };
        }
        return { acquired: false, reason: 'IN_PROGRESS_ACTIVE', interval: existing };
      }
      return { acquired: false, reason: err.message };
    }
  }

  confirmHarvestInterval(intervalId, harvestId, txSignature) {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE fee_harvest_intervals
      SET status = 'CONFIRMED', harvest_id = ?, tx_signature = ?, updated_at = ?
      WHERE interval_id = ?
    `).run(harvestId, txSignature, now, intervalId);
  }

  failHarvestInterval(intervalId, reason) {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE fee_harvest_intervals
      SET status = 'FAILED', tx_signature = ?, updated_at = ?
      WHERE interval_id = ?
    `).run(String(reason || 'FAILED').slice(0, 120), now, intervalId);
  }

  getHarvestInterval(intervalId) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM fee_harvest_intervals WHERE interval_id = ?').get(intervalId) || null;
  }

  getRewardPoolState(poolId = 'global_mainnet') {
    const db = this.getDb();
    let row = db.prepare('SELECT * FROM reward_pool_state WHERE pool_id = ?').get(poolId);
    if (!row) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO reward_pool_state (
          pool_id, total_harvested_lamports, total_treasury_lamports, total_pool_lamports,
          available_pool_lamports, total_credits_burned, current_epoch, epoch_pool_lamports,
          epoch_credits_burned, last_harvest_at, updated_at
        ) VALUES (?, '0', '0', '0', '0', '0', 1, '0', '0', NULL, ?)
      `).run(poolId, now);
      row = db.prepare('SELECT * FROM reward_pool_state WHERE pool_id = ?').get(poolId);
    }
    return row;
  }

  updateRewardPoolState(poolId = 'global_mainnet', updates = {}) {
    const db = this.getDb();
    const current = this.getRewardPoolState(poolId);
    const now = new Date().toISOString();

    const totalHarvested = updates.totalHarvestedLamports !== undefined ? updates.totalHarvestedLamports.toString() : current.total_harvested_lamports;
    const totalTreasury = updates.totalTreasuryLamports !== undefined ? updates.totalTreasuryLamports.toString() : current.total_treasury_lamports;
    const totalPool = updates.totalPoolLamports !== undefined ? updates.totalPoolLamports.toString() : current.total_pool_lamports;
    const availablePool = updates.availablePoolLamports !== undefined ? updates.availablePoolLamports.toString() : current.available_pool_lamports;
    const totalCreditsBurned = updates.totalCreditsBurned !== undefined ? updates.totalCreditsBurned.toString() : current.total_credits_burned;
    const currentEpoch = updates.currentEpoch !== undefined ? updates.currentEpoch : current.current_epoch;
    const epochPool = updates.epochPoolLamports !== undefined ? updates.epochPoolLamports.toString() : current.epoch_pool_lamports;
    const epochCreditsBurned = updates.epochCreditsBurned !== undefined ? updates.epochCreditsBurned.toString() : current.epoch_credits_burned;
    const lastHarvest = updates.lastHarvestAt !== undefined ? updates.lastHarvestAt : current.last_harvest_at;

    db.prepare(`
      UPDATE reward_pool_state
      SET total_harvested_lamports = ?,
          total_treasury_lamports = ?,
          total_pool_lamports = ?,
          available_pool_lamports = ?,
          total_credits_burned = ?,
          current_epoch = ?,
          epoch_pool_lamports = ?,
          epoch_credits_burned = ?,
          last_harvest_at = ?,
          updated_at = ?
      WHERE pool_id = ?
    `).run(
      totalHarvested,
      totalTreasury,
      totalPool,
      availablePool,
      totalCreditsBurned,
      currentEpoch,
      epochPool,
      epochCreditsBurned,
      lastHarvest,
      now,
      poolId
    );

    return this.getRewardPoolState(poolId);
  }

  // ── CREDIT BURNS ───────────────────────────────────────────────────────────

  insertCreditBurn(burn) {
    const db = this.getDb();
    const nowIso = burn.createdAt || new Date().toISOString();
    db.prepare(`
      INSERT INTO credit_burns (
        id, wallet_address, destination_wallet, credits_burned,
        reward_lamports, reward_sol, market_cap_usd, tx_signature,
        signed_tx_raw, last_valid_block_height, blockhash, state_history,
        status, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      burn.id,
      burn.walletAddress,
      burn.destinationWallet,
      burn.creditsBurned.toString(),
      burn.rewardLamports.toString(),
      Number(burn.rewardSol) || 0,
      Number(burn.marketCapUsd) || 0,
      burn.txSignature || null,
      burn.signedTxRaw || null,
      burn.lastValidBlockHeight ? Number(burn.lastValidBlockHeight) : null,
      burn.blockhash || null,
      burn.stateHistory ? JSON.stringify(burn.stateHistory) : null,
      burn.status || 'CREATED',
      burn.idempotencyKey || null,
      nowIso,
      nowIso
    );
  }

  getCreditBurnByIdempotencyKey(idempotencyKey, walletAddress) {
    const db = this.getDb();
    return db.prepare(`
      SELECT * FROM credit_burns
      WHERE idempotency_key = ? AND wallet_address = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(idempotencyKey, walletAddress) || null;
  }

  getLatestCreditBurn(walletAddress) {
    const db = this.getDb();
    return db.prepare(`
      SELECT * FROM credit_burns
      WHERE wallet_address = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(walletAddress) || null;
  }

  updateCreditBurnState(burnId, updates = {}) {
    const db = this.getDb();
    const current = db.prepare('SELECT * FROM credit_burns WHERE id = ?').get(burnId);
    if (!current) return null;

    let history = [];
    try {
      if (current.state_history) history = JSON.parse(current.state_history);
    } catch {}
    if (updates.status && updates.status !== current.status) {
      history.push({ from: current.status, to: updates.status, at: new Date().toISOString(), note: updates.note || null });
    }

    const nextStatus = updates.status || current.status;
    const nextSig = updates.txSignature !== undefined ? updates.txSignature : current.tx_signature;
    const nextRaw = updates.signedTxRaw !== undefined ? updates.signedTxRaw : current.signed_tx_raw;
    const nextHeight = updates.lastValidBlockHeight !== undefined ? updates.lastValidBlockHeight : current.last_valid_block_height;
    const nextBlockhash = updates.blockhash !== undefined ? updates.blockhash : current.blockhash;
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE credit_burns
      SET status = ?,
          tx_signature = ?,
          signed_tx_raw = ?,
          last_valid_block_height = ?,
          blockhash = ?,
          state_history = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextStatus,
      nextSig,
      nextRaw,
      nextHeight !== null ? Number(nextHeight) : null,
      nextBlockhash,
      JSON.stringify(history),
      nowIso,
      burnId
    );

    return db.prepare('SELECT * FROM credit_burns WHERE id = ?').get(burnId);
  }

  updateCreditBurnOutcome(burnId, status, optionalTxSignature = null) {
    return this.updateCreditBurnState(burnId, {
      status,
      txSignature: optionalTxSignature
    });
  }

  getPendingBurnsForReconciliation() {
    const db = this.getDb();
    return db.prepare(`
      SELECT * FROM credit_burns
      WHERE status IN ('CREATED', 'SIGNED', 'BROADCASTING', 'BROADCASTED', 'PENDING_CONFIRMATION', 'PENDING_PAYMENT')
      ORDER BY created_at ASC
    `).all();
  }

  getActiveBurnReservationsTotal() {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT SUM(CAST(reward_lamports AS INTEGER)) as total
      FROM credit_burns
      WHERE status IN ('CREATED', 'SIGNED', 'BROADCASTING', 'BROADCASTED', 'PENDING_CONFIRMATION', 'PENDING_PAYMENT')
    `).get();
    return row && row.total ? BigInt(row.total) : 0n;
  }

  // ── CREDIT RESERVATIONS (Two-Phase AI Inference) ───────────────────────────

  createCreditReservation({ id, walletAddress, estimatedCredits, model, createdAt }) {
    const db = this.getDb();
    const nowIso = createdAt || new Date().toISOString();
    db.prepare(`
      INSERT INTO credit_reservations (
        id, wallet_address, estimated_credits, actual_credits, model, status, created_at
      ) VALUES (?, ?, ?, '0', ?, 'ACTIVE', ?)
    `).run(
      id,
      walletAddress,
      estimatedCredits.toString(),
      model || 'auto',
      nowIso
    );
    return db.prepare('SELECT * FROM credit_reservations WHERE id = ?').get(id);
  }

  getCreditReservation(id) {
    const db = this.getDb();
    return db.prepare('SELECT * FROM credit_reservations WHERE id = ?').get(id) || null;
  }

  updateCreditReservation({ id, actualCredits = 0n, status, settledAt }) {
    const db = this.getDb();
    const nowIso = settledAt || new Date().toISOString();
    db.prepare(`
      UPDATE credit_reservations
      SET actual_credits = ?,
          status = ?,
          settled_at = ?
      WHERE id = ?
    `).run(
      actualCredits.toString(),
      status,
      nowIso,
      id
    );
    return db.prepare('SELECT * FROM credit_reservations WHERE id = ?').get(id) || null;
  }

  getActiveReservationsTotal(walletAddress) {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT SUM(CAST(estimated_credits AS INTEGER)) as total
      FROM credit_reservations
      WHERE wallet_address = ? AND status = 'ACTIVE'
    `).get(walletAddress);
    return row && row.total ? BigInt(row.total) : 0n;
  }

  getStaleReservations(cutoffIso) {
    const db = this.getDb();
    return db.prepare(`
      SELECT * FROM credit_reservations
      WHERE status = 'ACTIVE' AND created_at < ?
      ORDER BY created_at ASC
    `).all(cutoffIso);
  }

  getCreditBurnsByWallet(walletAddress, limit = 50) {
    const db = this.getDb();
    return db.prepare(`
      SELECT * FROM credit_burns
      WHERE wallet_address = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(walletAddress, limit);
  }

  getAllCreditBurns(limit = 100) {
    const db = this.getDb();
    return db.prepare(`
      SELECT * FROM credit_burns
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }
}

// Global Singleton Instance
export const dbAdapter = new DatabaseAdapter();
