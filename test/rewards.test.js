process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { handleRequest } from '../src/server.js';
import {
  getHolderEligibility,
  isValidSolanaAddress,
  resolveHolderTier,
  OFFICIAL_SOLANA_MINT
} from '../src/core/holder-eligibility.js';
import {
  rewardsStore,
  LAMPORTS_PER_SOL,
  INFRASTRUCTURE_BASIS_POINTS,
  MANUAL_BASIS_POINTS,
  TOTAL_BASIS_POINTS,
  INFRASTRUCTURE_WALLET_PUBLIC_KEY,
  OPERATOR_WALLET_PUBLIC_KEY
} from '../src/core/rewards-store.js';
import {
  accrueCreditsForHolder,
  deductCreditsForLLM,
  transferCredits,
  LAMPORTS_PER_CREDIT,
  MIN_REDEMPTION_CREDITS
} from '../src/core/credit-engine.js';
import {
  getPendingTransfers,
  isValidSolanaSignature
} from '../src/core/operator-service.js';
import { burnEngine } from '../src/core/burn-engine.js';

let server;
let baseUrl;

// Helper: Base58 encoder for Ed25519 testing
function encodeBase58(buffer) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + (buffer.toString('hex') || '0'));
  let str = '';
  while (num > 0n) {
    const rem = num % 58n;
    num = num / 58n;
    str = ALPHABET[Number(rem)] + str;
  }
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) str = '1' + str;
    else break;
  }
  return str;
}

// Generate valid Solana keypair for tests
function createTestSolanaWallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const address = encodeBase58(rawPub);
  return { address, publicKey, privateKey };
}

test.before(async () => {
  server = http.createServer(handleRequest);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. SOLANA WALLET & ELIGIBILITY TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Solana Holder Eligibility: verifies valid address format and rejects corrupted input', () => {
  assert.strictEqual(isValidSolanaAddress('AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump'), true);
  assert.strictEqual(isValidSolanaAddress('InvalidSolanaKey123'), false);
  assert.strictEqual(isValidSolanaAddress('0x1234567890123456789012345678901234567890'), false);
  assert.strictEqual(isValidSolanaAddress(''), false);
});

test('Solana Holder Eligibility: deterministic holding tier resolution', () => {
  const whale = resolveHolderTier(1_500_000);
  assert.strictEqual(whale.tierName, 'Dynasty Magnate');
  assert.strictEqual(whale.creditRatePerHour, 2500);

  const director = resolveHolderTier(250_000);
  assert.strictEqual(director.tierName, 'Syndicate Director');
  assert.strictEqual(director.creditRatePerHour, 750);

  const partner = resolveHolderTier(15_000);
  assert.strictEqual(partner.tierName, 'Principal Partner');
  assert.strictEqual(partner.creditRatePerHour, 200);

  const initiate = resolveHolderTier(500);
  assert.strictEqual(initiate.tierName, 'Reserve Initiate');
  assert.strictEqual(initiate.creditRatePerHour, 10);

  const zero = resolveHolderTier(0);
  assert.strictEqual(zero.tierLevel, 0);
  assert.strictEqual(zero.creditRatePerHour, 0);
});

test('Holder Eligibility API: GET /api/holder/eligibility returns accurate tier & rate', async () => {
  const testWallet = createTestSolanaWallet();
  
  // B-7: eligibility now requires auth — login first via Ed25519 signature
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${testWallet.address}`);
  const nonceData = await nonceRes.json();
  const signature = encodeBase58(crypto.sign(null, Buffer.from(nonceData.message, 'utf8'), testWallet.privateKey));
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: testWallet.address, signature, message: nonceData.message })
  });
  const verifyData = await verifyRes.json();
  assert.ok(verifyData.sessionToken, 'Should receive session token');

  const res = await fetch(`${baseUrl}/api/holder/eligibility?mockBalance=50000`, {
    headers: { 'Authorization': `Bearer ${verifyData.sessionToken}` }
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.eligible, true);
  assert.strictEqual(data.walletAddress, testWallet.address);
  assert.strictEqual(data.tier, 'Principal Partner');
  assert.strictEqual(data.creditRatePerHour, 200);
  assert.strictEqual(data.tokenMint, OFFICIAL_SOLANA_MINT);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CREDIT ACCOUNTING & FINANCIAL INVARIANTS TESTS
// ─────────────────────────────────────────────────────────────────────────────

test('Credit System: accrues credits and maintains financial invariants (available >= 0)', async () => {
  const wallet = createTestSolanaWallet();
  const result = await accrueCreditsForHolder(wallet.address, {
    forceAmount: 500,
    mockBalance: 2000
  });

  assert.strictEqual(result.accrued, '500');
  const summary = rewardsStore.getAccountSummary(wallet.address);
  assert.strictEqual(summary.earned, '500');
  assert.strictEqual(summary.available, '500');
  assert.strictEqual(summary.used, '0');
});

test('Credit System: enforces availableCredits >= 0 and rejects overdrafts', () => {
  const wallet = createTestSolanaWallet();
  rewardsStore.getOrCreateAccount(wallet.address);

  // Attempting to deduct 100 when available is 0 must throw
  assert.throws(() => {
    rewardsStore.recordLedgerEntry({
      walletAddress: wallet.address,
      type: 'USE',
      amount: 100n
    });
  }, /Insufficient credits/);
});

test('Peer-to-Peer Credit Transfer: transfers credits atomically between Solana addresses', () => {
  const sender = createTestSolanaWallet();
  const recipient = createTestSolanaWallet();

  // Initial grant to sender
  rewardsStore.recordLedgerEntry({
    walletAddress: sender.address,
    type: 'EARN',
    amount: 1000n
  });

  const tx = transferCredits(sender.address, recipient.address, 300n);
  assert.ok(tx.transferId);
  assert.strictEqual(tx.amount, '300');

  const senderAcc = rewardsStore.getAccountSummary(sender.address);
  const recipAcc = rewardsStore.getAccountSummary(recipient.address);

  assert.strictEqual(senderAcc.available, '700');
  assert.strictEqual(senderAcc.transferred, '300');
  assert.strictEqual(recipAcc.available, '300');
  assert.strictEqual(recipAcc.earned, '300');
});

test('Peer-to-Peer Credit Transfer: rejects self-transfer and overdrafts', () => {
  const wallet = createTestSolanaWallet();
  rewardsStore.recordLedgerEntry({
    walletAddress: wallet.address,
    type: 'EARN',
    amount: 500n
  });

  // Self-transfer check
  assert.throws(() => {
    transferCredits(wallet.address, wallet.address, 100n);
  }, /Self-transfer is not permitted/);

  // Overdraft check
  const other = createTestSolanaWallet();
  assert.throws(() => {
    transferCredits(wallet.address, other.address, 600n);
  }, /Insufficient available credits/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CANONICAL ON-CHAIN BURN EXECUTION & IDEMPOTENCY
// ─────────────────────────────────────────────────────────────────────────────

test('Financial Invariant: On-chain burn executes with zero deficit and debits credits', async () => {
  const wallet = createTestSolanaWallet();
  const credits = 1000n;

  rewardsStore.recordLedgerEntry({
    walletAddress: wallet.address,
    type: 'EARN',
    amount: 10_000n
  });

  const idempKey = `test_burn_${Date.now()}`;
  const result = await burnEngine.executeBurn({
    walletAddress: wallet.address,
    creditsToBurn: credits,
    idempotencyKey: idempKey
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.creditsBurned, '1000');
  assert.ok(result.txSignature);

  const balance = rewardsStore.getAccountSummary(wallet.address).available;
  assert.strictEqual(balance, '9000');
});

test('Burn Idempotency: duplicate request returns identical burn without double debiting', async () => {
  const wallet = createTestSolanaWallet();
  rewardsStore.recordLedgerEntry({
    walletAddress: wallet.address,
    type: 'EARN',
    amount: 10_000n
  });

  const idempKey = `fixed_idemp_key_${Date.now()}`;

  // First call
  const first = await burnEngine.executeBurn({
    walletAddress: wallet.address,
    creditsToBurn: 2000n,
    idempotencyKey: idempKey
  });
  assert.strictEqual(first.success, true);
  assert.strictEqual(first.duplicate, false);

  const balanceAfterFirst = rewardsStore.getAccountSummary(wallet.address).available;
  assert.strictEqual(balanceAfterFirst, '8000');

  // Second call with EXACT SAME key
  const second = await burnEngine.executeBurn({
    walletAddress: wallet.address,
    creditsToBurn: 2000n,
    idempotencyKey: idempKey
  });

  assert.strictEqual(second.duplicate, true);
  assert.strictEqual(second.burnId, first.burnId);

  // Balance MUST NOT be debited twice
  const balanceAfterSecond = rewardsStore.getAccountSummary(wallet.address).available;
  assert.strictEqual(balanceAfterSecond, '8000');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. OPERATOR SERVICE QUERY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

test('Operator Service: lists pending transfers from canonical burn records', async () => {
  const wallet = createTestSolanaWallet();
  rewardsStore.recordLedgerEntry({
    walletAddress: wallet.address,
    type: 'EARN',
    amount: 10_000n
  });

  const burn = await burnEngine.executeBurn({
    walletAddress: wallet.address,
    creditsToBurn: 1000n,
    idempotencyKey: `operator_test_${Date.now()}`
  });

  assert.ok(burn.burnId);
  const pending = getPendingTransfers();
  assert.ok(pending.operatorWallet);
  assert.ok(Array.isArray(pending.pendingTransfers));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. REST API END-TO-END FLOW
// ─────────────────────────────────────────────────────────────────────────────

test('Rewards REST Endpoints: GET /api/credits/balance and POST /api/credits/transfer', async () => {
  const sender = createTestSolanaWallet();
  const recipient = createTestSolanaWallet();

  // Create session for sender
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${sender.address}`);
  const { message } = await nonceRes.json();
  const sig = crypto.sign(null, Buffer.from(message), sender.privateKey);
  const signature = encodeBase58(sig);

  const authRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: sender.address,
      signature,
      message
    })
  });
  const { sessionToken } = await authRes.json();
  assert.ok(sessionToken);

  // Accrue initial test credits
  await fetch(`${baseUrl}/api/credits/accrue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ forceAmount: 5000 })
  });

  // Check balance endpoint
  const balRes = await fetch(`${baseUrl}/api/credits/balance`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.strictEqual(balRes.status, 200);
  const balData = await balRes.json();
  assert.ok(Number(balData.available) >= 5000);

  // Transfer credits via API
  const xferRes = await fetch(`${baseUrl}/api/credits/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      recipientWallet: recipient.address,
      amount: 1500
    })
  });
  assert.strictEqual(xferRes.status, 200);
  const xferData = await xferRes.json();
  assert.strictEqual(xferData.success, true);
});

test('Security & Zero Secrets Policy: state and responses contain ZERO private keys', async () => {
  const operatorData = getPendingTransfers();
  const serialized = JSON.stringify(operatorData);
  assert.strictEqual(serialized.includes('privateKey'), false);
  assert.strictEqual(serialized.includes('seedPhrase'), false);
  assert.strictEqual(serialized.includes('secretKey'), false);
});
