/**
 * Jev Brain - Crash & Redeploy Persistence Test
 *
 * Reproduces the exact Railway redeploy failure mode:
 *   Process 1: holder accrues credits + generates CLI API key  → close everything
 *   Process 2: fresh DatabaseAdapter + fresh RewardsStore on the SAME db file
 *   → credits, ledger history, holder tier state and API keys MUST survive intact.
 *
 * Proves credits are wallet-bound (NOT API-key-bound and NOT in-memory).
 */
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-persist-'));
const DB_FILE = path.join(tmpDir, 'jev-brain.db');

// Simulates Process 1 (pre-deploy container)
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = DB_FILE;

const { DatabaseAdapter } = await import('../src/core/db-adapter.js');
const { RewardsStore } = await import('../src/core/rewards-store.js');
const { setMockHolderBalance } = await import('../src/core/holder-eligibility.js');
const { accrueCreditsForHolder } = await import('../src/core/credit-engine.js');

function encodeBase58(buffer) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + (buffer.toString('hex') || '0'));
  let str = '';
  while (num > 0n) {
    const rem = num % 58n;
    num = num / 58n;
    str = ALPHABET[Number(rem)] + str;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) str = '1' + str;
  return str;
}

const { publicKey, privateKey: _pk } = crypto.generateKeyPairSync('ed25519');
const holderAddress = encodeBase58(publicKey.export({ type: 'spki', format: 'der' }).subarray(12));

// ── Process 1: accrue credits + create CLI key, then container "dies" ──
setMockHolderBalance(holderAddress, 250000);
const accrual = await accrueCreditsForHolder(holderAddress, { forceAmount: 123456 });
assert.ok(accrual, 'Accrual should run');

const before = { rewardsStore: null };
const { rewardsStore } = await import('../src/core/rewards-store.js');
before.rewardsStore = rewardsStore.getAccountSummary(holderAddress);
assert.strictEqual(before.rewardsStore.available, '123456', `Expected 123456 credits, got ${before.rewardsStore.available}`);

const cliKey = rewardsStore.db.createApiKey({
  walletAddress: holderAddress,
  name: 'Survivor Key',
  tokensHeld: 250000,
  tierId: 4
});
assert.ok(cliKey.apiKey.startsWith('jev_live_'));

// Simulate crash/redeploy: close DB handles (WAL is checkpointed on close)
rewardsStore.db.close();
console.log('✔ Process 1: 123,456 credits accrued + CLI key created, container terminated');

// ── Process 2: fresh deploy boot on the SAME database file ──
const freshAdapter = new DatabaseAdapter(DB_FILE);
const freshStore = new RewardsStore(freshAdapter);

const after = freshStore.getAccountSummary(holderAddress);
assert.strictEqual(after.available, '123456', 'Available credits MUST survive redeploy unchanged');
assert.strictEqual(after.earned, '123456', 'Earned credits MUST survive redeploy unchanged');

const ledger = freshStore.getLedgerHistory(holderAddress, 10);
assert.ok(ledger.length >= 1, 'Credit ledger history MUST survive redeploy');

const survivorKey = freshAdapter.getApiKey(cliKey.apiKey);
assert.ok(survivorKey, 'CLI API key MUST survive redeploy and still authenticate');
assert.strictEqual(survivorKey.wallet_address, holderAddress);

const holderAccount = freshAdapter.getHolderAccount(holderAddress);
assert.ok(holderAccount && (holderAccount.lastAccrualAt || holderAccount.last_accrual_at), 'Holder accrual clock MUST survive redeploy (no double-grant, no reset)');

// Simulate ANOTHER redeploy (multiple deployments must never zero balances)
freshAdapter.close();
const thirdAdapter = new DatabaseAdapter(DB_FILE);
const thirdStore = new RewardsStore(thirdAdapter);
assert.strictEqual(thirdStore.getAccountSummary(holderAddress).available, '123456', 'Credits MUST survive N redeploys');

console.log('✔ Process 2 & 3: credits (123,456), ledger, holder clock and CLI key all intact after redeploy');

thirdAdapter.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
console.log('\nPERSISTENCE TEST PASSED — credits are wallet-bound and survive unlimited redeploys when the DB file is on persistent storage');
process.exit(0);