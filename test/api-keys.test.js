process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import { handleRequest } from '../src/server.js';
import { dbAdapter } from '../src/core/db-adapter.js';
import { rewardsStore } from '../src/core/rewards-store.js';
import { setMockHolderBalance } from '../src/core/holder-eligibility.js';

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

test.before(async () => {
  server = http.createServer(handleRequest);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  dbAdapter.close();
});

test('API Key DB Adapter: CRUD operations and revocation', (t) => {
  const wallet = createTestSolanaWallet();

  // Create key
  const created = dbAdapter.createApiKey({
    walletAddress: wallet.address,
    name: 'MacBook Pro CLI'
  });

  assert.ok(created.apiKey.startsWith('jev_live_'), 'Key must start with jev_live_');
  assert.strictEqual(created.walletAddress, wallet.address);
  assert.strictEqual(created.name, 'MacBook Pro CLI');

  // Lookup active key
  const fetched = dbAdapter.getApiKey(created.apiKey);
  assert.ok(fetched, 'Fetched key must exist');
  assert.strictEqual(fetched.wallet_address, wallet.address);
  assert.strictEqual(fetched.is_revoked, 0);

  // List keys
  const keys = dbAdapter.listApiKeys(wallet.address);
  assert.strictEqual(keys.length, 1);
  assert.strictEqual(keys[0].keyId, created.keyId);
  assert.ok(keys[0].maskedKey.includes('...'), 'Listed key must be masked');

  // Revoke key
  const revoked = dbAdapter.revokeApiKey({
    keyId: created.keyId,
    walletAddress: wallet.address
  });
  assert.strictEqual(revoked, true);

  // Lookup revoked key
  const afterRevoke = dbAdapter.getApiKey(created.apiKey);
  assert.strictEqual(afterRevoke, null, 'Revoked key must not be returned as active');
});

test('API Key Endpoints: Generate, List, and Revoke via HTTP', async (t) => {
  const wallet = createTestSolanaWallet();

  // 1. Get auth nonce
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${wallet.address}`);
  const nonceData = await nonceRes.json();
  const challenge = nonceData.message;

  // Sign challenge with Ed25519
  const sigBytes = crypto.sign(null, Buffer.from(challenge, 'utf8'), wallet.privateKey);
  const sigB58 = encodeBase58(sigBytes);

  // Verify signature to get session token
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: wallet.address,
      signature: sigB58,
      message: challenge
    })
  });
  const verifyData = await verifyRes.json();
  const sessionToken = verifyData.sessionToken;
  assert.ok(sessionToken, 'Session token must be granted');

  // 2. Mock tokens for holder eligibility in test
  setMockHolderBalance(wallet.address, 1000000); // 1,000,000 tokens (Whale Tier)

  // Accrue credits for LLM chat usage
  await fetch(`${baseUrl}/api/credits/accrue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ forceAmount: 5000, mockBalance: 1000000 })
  });

  // 3. Generate API Key
  const genRes = await fetch(`${baseUrl}/api/keys/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ name: 'Terminal CLI Key' })
  });
  const genData = await genRes.json();
  assert.strictEqual(genRes.status, 200);
  assert.ok(genData.success);
  assert.ok(genData.key.apiKey.startsWith('jev_live_'));
  const cliKey = genData.key.apiKey;
  const keyId = genData.key.keyId;

  // 4. List API Keys
  const listRes = await fetch(`${baseUrl}/api/keys`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  const listData = await listRes.json();
  assert.strictEqual(listRes.status, 200);
  assert.ok(listData.keys.some(k => k.keyId === keyId));

  // 5. Use API Key to fetch balance
  const balRes = await fetch(`${baseUrl}/api/credits/balance`, {
    headers: { 'Authorization': `Bearer ${cliKey}` }
  });
  const balData = await balRes.json();
  assert.strictEqual(balRes.status, 200);
  assert.strictEqual(balData.walletAddress, wallet.address);

  // 6. Use API Key to chat
  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cliKey}`
    },
    body: JSON.stringify({ prompt: 'Hello from Jev Brain CLI' })
  });
  const chatData = await chatRes.json();
  assert.strictEqual(chatRes.status, 200);
  assert.ok(chatData.isSuccess);

  // 7. Revoke Key
  const revokeRes = await fetch(`${baseUrl}/api/keys/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ keyId })
  });
  const revokeData = await revokeRes.json();
  assert.strictEqual(revokeRes.status, 200);
  assert.strictEqual(revokeData.revoked, true);

  // 8. Re-attempt chat with revoked key -> Must return 401
  const reChatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cliKey}`
    },
    body: JSON.stringify({ prompt: 'Should be rejected' })
  });
  assert.strictEqual(reChatRes.status, 401);
});

test('API Key Security: Non-token holders are rejected from key generation and AI access', async () => {
  const brokeWallet = createTestSolanaWallet();
  // 1. Initial holding allowed at sign-in
  setMockHolderBalance(brokeWallet.address, 1000);

  // Authenticate session
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${brokeWallet.address}`);
  const { message } = await nonceRes.json();
  const sig = crypto.sign(null, Buffer.from(message), brokeWallet.privateKey);
  const signature = encodeBase58(sig);

  const authRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: brokeWallet.address,
      signature,
      message
    })
  });
  const { sessionToken } = await authRes.json();
  assert.ok(sessionToken, 'Session token granted when initially holding');

  // 2. User dumps / sells all tokens (balance drops to 0 on-chain)
  setMockHolderBalance(brokeWallet.address, 0);

  // Generation must be rejected with 403 Forbidden because live holding is now 0
  const genRes = await fetch(`${baseUrl}/api/keys/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ name: 'Unauthorized Key' })
  });
  assert.strictEqual(genRes.status, 403);
  const genData = await genRes.json();
  assert.ok(genData.error.includes('Minimum Tier 1'));

  // 3. Direct DB insert of a key for a zero-token wallet: AI access must still be rejected on-chain
  const forgedKey = dbAdapter.createApiKey({
    walletAddress: brokeWallet.address,
    name: 'Zero Balance Key'
  });

  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${forgedKey.apiKey}`
    },
    body: JSON.stringify({ prompt: 'Should fail live holding check' })
  });
  assert.strictEqual(chatRes.status, 403);
  const chatData = await chatRes.json();
  assert.ok(chatData.error.includes('Access Denied'));
});

