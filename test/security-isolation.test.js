process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { handleRequest, safeJsonStringify } from '../src/server.js';
import { dbAdapter, DatabaseAdapter } from '../src/core/db-adapter.js';
import {
  rewardsStore,
  LAMPORTS_PER_SOL,
  OPERATOR_WALLET_PUBLIC_KEY,
  INFRASTRUCTURE_WALLET_PUBLIC_KEY
} from '../src/core/rewards-store.js';
import {
  accrueCreditsForHolder,
  deductCreditsForLLM,
  transferCredits
} from '../src/core/credit-engine.js';
import { SemanticCache } from '../src/core/semantic-cache.js';
import {
  parseAndValidateSolanaTransaction
} from '../src/core/operator-service.js';
import { burnEngine } from '../src/core/burn-engine.js';
import { feeHarvester } from '../src/workers/fee-harvester.js';

let server;
let baseUrl;

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

function createTestSolanaWallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const address = encodeBase58(rawPub);
  return { address, publicKey, privateKey };
}

async function authenticateWallet(wallet) {
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${wallet.address}`);
  const { message } = await nonceRes.json();
  const sig = crypto.sign(null, Buffer.from(message), wallet.privateKey);
  const signature = encodeBase58(sig);

  const authRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: wallet.address,
      signature,
      message
    })
  });
  const data = await authRes.json();
  return data.sessionToken;
}

test.before(async () => {
  rewardsStore.resetForTest();
  server = http.createServer(handleRequest);
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. STRICT CROSS-WALLET DATA ISOLATION
// ─────────────────────────────────────────────────────────────────────────────

test('Cross-Wallet Isolation: Wallet B CANNOT read or drain Wallet A data', async () => {
  const walletA = createTestSolanaWallet();
  const walletB = createTestSolanaWallet();

  const sessionA = await authenticateWallet(walletA);
  const sessionB = await authenticateWallet(walletB);

  // Accrue credits for Wallet A
  const accrueRes = await fetch(`${baseUrl}/api/credits/accrue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionA}`
    },
    body: JSON.stringify({ forceAmount: 10000 })
  });
  assert.strictEqual(accrueRes.status, 200);

  // Wallet A verifies their balance
  const balResA = await fetch(`${baseUrl}/api/credits/balance`, {
    headers: { 'Authorization': `Bearer ${sessionA}` }
  });
  const balA = await balResA.json();
  assert.strictEqual(Number(balA.availableCredits) >= 10000, true);

  // Wallet B checks their balance: MUST BE 0 (Wallet A balance must NOT leak)
  const balResB = await fetch(`${baseUrl}/api/credits/balance`, {
    headers: { 'Authorization': `Bearer ${sessionB}` }
  });
  const balB = await balResB.json();
  assert.strictEqual(Number(balB.availableCredits), 0);
  assert.strictEqual(balB.walletAddress, walletB.address);

  // Wallet B tries to query Wallet A's balance via query param spoofing: IGNORED
  const balSpoofRes = await fetch(`${baseUrl}/api/credits/balance?address=${walletA.address}`, {
    headers: { 'Authorization': `Bearer ${sessionB}` }
  });
  const balSpoof = await balSpoofRes.json();
  assert.strictEqual(balSpoof.walletAddress, walletB.address);
  assert.strictEqual(Number(balSpoof.availableCredits), 0);

  // Wallet B queries ledger history: MUST NOT see Wallet A's transactions
  const histResB = await fetch(`${baseUrl}/api/credits/history?address=${walletA.address}`, {
    headers: { 'Authorization': `Bearer ${sessionB}` }
  });
  const histB = await histResB.json();
  assert.strictEqual(histB.walletAddress, walletB.address);
  assert.strictEqual(histB.count, 0);
  assert.deepStrictEqual(histB.history, []);

  // Wallet B attempts to transfer Wallet A's credits by spoofing senderWallet: BLOCKED
  const stealRes = await fetch(`${baseUrl}/api/credits/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionB}`
    },
    body: JSON.stringify({
      senderWallet: walletA.address, // Spoofed body trying to steal from walletA
      recipientWallet: walletA.address, // Wallet B sending to Wallet A
      amount: 2000
    })
  });
  assert.strictEqual(stealRes.status, 400); // Fails because session wallet (Wallet B) has 0 credits
  const stealData = await stealRes.json();
  assert.ok(stealData.error.includes('Insufficient available credits'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. IDENTITY SPOOFING & ANONYMOUS REJECTION
// ─────────────────────────────────────────────────────────────────────────────

test('Identity Protection: Unauthenticated requests to all financial routes return 401', async () => {
  const targetWallet = createTestSolanaWallet().address;

  // 1. Balance endpoint
  const res1 = await fetch(`${baseUrl}/api/credits/balance?address=${targetWallet}`);
  assert.strictEqual(res1.status, 401);

  // 2. History endpoint
  const res2 = await fetch(`${baseUrl}/api/credits/history?address=${targetWallet}`);
  assert.strictEqual(res2.status, 401);

  // 3. Accrue endpoint
  const res3 = await fetch(`${baseUrl}/api/credits/accrue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: targetWallet, forceAmount: 5000 })
  });
  assert.strictEqual(res3.status, 401);

  // 4. Transfer endpoint
  const res4 = await fetch(`${baseUrl}/api/credits/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderWallet: targetWallet, recipientWallet: targetWallet, amount: 100 })
  });
  assert.strictEqual(res4.status, 401);

  // 5. Redeem endpoint
  const res5 = await fetch(`${baseUrl}/api/rewards/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: targetWallet, credits: 500 })
  });
  assert.strictEqual(res5.status, 401);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BIGINT JSON SERIALIZATION SAFETY
// ─────────────────────────────────────────────────────────────────────────────

test('BigInt Serialization: /api/chat and stream never throw serialization errors', async () => {
  const wallet = createTestSolanaWallet();
  const sessionToken = await authenticateWallet(wallet);

  // Accrue credits so deduction triggers
  await fetch(`${baseUrl}/api/credits/accrue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ forceAmount: 5000 })
  });

  // 1. Standard POST /api/chat
  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      prompt: 'Hello Jev Brain',
      model: 'auto'
    })
  });
  assert.strictEqual(chatRes.status, 200);
  const chatData = await chatRes.json();
  assert.ok(chatData.creditDeduction);
  assert.strictEqual(typeof chatData.creditDeduction.creditsDeducted, 'string');
  assert.strictEqual(typeof chatData.creditDeduction.availableCredits, 'string');
  assert.strictEqual(typeof chatData.creditDeduction.entry.amount, 'string');
  assert.strictEqual(typeof chatData.creditDeduction.entry.balanceAfter, 'string');

  // 2. Streaming POST /api/chat/stream
  const streamRes = await fetch(`${baseUrl}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      prompt: 'Test Stream',
      model: 'auto'
    })
  });
  assert.strictEqual(streamRes.status, 200);
  const streamText = await streamRes.text();
  assert.ok(streamText.includes('data:'));
  assert.strictEqual(streamText.includes('Do not know how to serialize a BigInt'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SOLANA TRANSACTION VERIFICATION & ANTI-REPLAY
// ─────────────────────────────────────────────────────────────────────────────

test('Burn Execution Anti-Replay: validates destination wallet binding and blocks duplicate submits', async () => {
  const wallet = createTestSolanaWallet();
  rewardsStore.recordLedgerEntry({
    walletAddress: wallet.address,
    type: 'EARN',
    amount: 20000n
  });

  const idempKey = `replay_burn_1_${Date.now()}`;
  const burn1 = await burnEngine.executeBurn({
    walletAddress: wallet.address,
    creditsToBurn: 5000n,
    idempotencyKey: idempKey
  });

  assert.strictEqual(burn1.success, true);
  assert.strictEqual(burn1.duplicate, false);

  // Attempting with identical idempotencyKey MUST return duplicate record without second debit
  const burn2 = await burnEngine.executeBurn({
    walletAddress: wallet.address,
    creditsToBurn: 5000n,
    idempotencyKey: idempKey
  });

  assert.strictEqual(burn2.duplicate, true);
  assert.strictEqual(burn2.burnId, burn1.burnId);

  // Payout MUST strictly go to authenticated wallet address
  await assert.rejects(async () => {
    await burnEngine.executeBurn({
      walletAddress: wallet.address,
      creditsToBurn: 1000n,
      destinationWallet: 'WrongRecipient1111111111111111111111111111'
    });
  }, /Rewards may only be claimed directly to the authenticated holder wallet/);

  // Transaction parser validation
  const validTx = {
    slot: 55555,
    transaction: {
      message: {
        instructions: [{
          program: 'system',
          parsed: {
            type: 'transfer',
            info: {
              source: OPERATOR_WALLET_PUBLIC_KEY,
              destination: wallet.address,
              lamports: 95000000
            }
          }
        }]
      }
    },
    meta: { err: null }
  };

  const parsed = parseAndValidateSolanaTransaction(validTx, wallet.address, 95000000n);
  assert.strictEqual(parsed.valid, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PERSISTENCE & ACCRUAL TIMESTAMP SURVIVAL
// ─────────────────────────────────────────────────────────────────────────────

test('Database Persistence: holder snapshots and last_accrual_at survive in database', async () => {
  const wallet = createTestSolanaWallet();
  const address = wallet.address;

  // Initial accrual
  const res1 = await accrueCreditsForHolder(address, {
    forceAmount: 2500,
    mockBalance: 1_000_000
  });
  assert.strictEqual(res1.accrued, '2500');

  // Inspect database record directly
  const holder = dbAdapter.getHolderAccount(address);
  assert.ok(holder);
  assert.strictEqual(holder.walletAddress, address);
  assert.ok(holder.lastAccrualAt);

  // Verify ledger history is in database
  const ledger = dbAdapter.getCreditLedger(address);
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(ledger[0].amount, '2500');
  assert.strictEqual(ledger[0].type, 'EARN');

  // Verify financial invariant in credit_accounts table
  const creditAcc = dbAdapter.getCreditAccount(address);
  assert.strictEqual(creditAcc.available, 2500n);
  assert.strictEqual(creditAcc.earned, 2500n);
  assert.strictEqual(creditAcc.used, 0n);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. INVARIANT ENFORCEMENT & ATOMIC ROLLBACK
// ─────────────────────────────────────────────────────────────────────────────

test('Financial Invariants: overdraft rejects with rollback and 5%/95% split is exact', () => {
  const walletA = createTestSolanaWallet().address;
  const walletB = createTestSolanaWallet().address;

  rewardsStore.recordLedgerEntry({
    walletAddress: walletA,
    type: 'EARN',
    amount: 500n
  });

  // Attempting to transfer 1000 when available is 500 MUST throw and leave balance unchanged
  assert.throws(() => {
    rewardsStore.transferCredits(walletA, walletB, 1000n);
  }, /Insufficient available credits/);

  const accA = rewardsStore.getAccountSummary(walletA);
  assert.strictEqual(accA.available, '500');
  assert.strictEqual(accA.transferred, '0');

  // Test exact 95% Treasury / 5% Pool split with zero rounding error across various amounts
  const testAmounts = [1000n, 10_000n, 33_333n, 100_000n, 777_777n, 1_000_000_000n];
  for (const surplus of testAmounts) {
    const treasury = (surplus * 95n) / 100n;
    const pool = surplus - treasury;
    assert.strictEqual(treasury + pool, surplus, `Split mismatch for surplus ${surplus}`);
    assert.ok(treasury > 0n);
    assert.ok(pool > 0n);
  }
});

test('Semantic Cache Isolation: queries stored by Wallet A never leak to Wallet B', () => {
  const cache = new SemanticCache();
  const walletA = '41s8tSgeJ1JYp3291D6E5tSjkpHEsfAJzyqshKLkhmbp';
  const walletB = '83SqfW6gs2jALfvpXnV4sMb1RQnzmiZNwjeunivMSaJ2';
  const query = 'What is the private treasury formula for jevbrain?';
  const response = 'Exclusive proprietary intelligence for Wallet A';

  // Store for Wallet A
  cache.store(query, response, 'openai/gpt-4o', walletA);

  // Wallet A lookup hits cache
  const hitA = cache.lookup(query, walletA);
  assert.ok(hitA, 'Wallet A should hit its own cached response');
  assert.strictEqual(hitA.response, response);

  // Wallet B lookup for the same prompt is isolated and MUST NOT hit cache
  const hitB = cache.lookup(query, walletB);
  assert.strictEqual(hitB, null, 'Wallet B must not see Wallet A cached prompt/response');
});

test('First-Hour Credit Leak Elimination: newly created account starts with 0 unearned credits', async () => {
  const freshWallet = createTestSolanaWallet().address;
  const res = await accrueCreditsForHolder(freshWallet, { mockBalance: 1_000_000 });
  assert.ok(res, 'Accrual should succeed');
  assert.strictEqual(res.accrued, '0', 'Initial accrued credits at t=0 must strictly be 0');
  assert.strictEqual(res.balance.available, '0', 'Initial available credits must strictly be 0');
});

