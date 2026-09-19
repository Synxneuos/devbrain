import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Wallet } from 'ethers';
import { handleRequest } from '../src/server.js';

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(handleRequest);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

test('Wallet Auth: GET /api/wallet/nonce returns challenge message & nonce', async () => {
  const testWallet = Wallet.createRandom();
  const res = await fetch(`${baseUrl}/api/wallet/nonce?address=${testWallet.address}`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.nonce);
  assert.ok(data.message.includes('Welcome to Jev Brain!'));
  assert.ok(data.message.includes(testWallet.address.toLowerCase()));
});

test('Wallet Auth: POST /api/wallet/verify-signature authenticates valid MetaMask signature', async () => {
  const testWallet = Wallet.createRandom();
  
  // 1. Get challenge nonce
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${testWallet.address}`);
  const { message } = await nonceRes.json();

  // 2. Cryptographically sign challenge message
  const signature = await testWallet.signMessage(message);

  // 3. Verify signature on backend
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: testWallet.address,
      signature,
      message,
      tokensHeld: 5000000
    })
  });

  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.success, true);
  assert.strictEqual(verifyData.verified, true);
  assert.strictEqual(verifyData.address, testWallet.address.toLowerCase());
  assert.strictEqual(verifyData.unlocked, true);
  assert.ok(verifyData.userTier);
  assert.ok(verifyData.userTier.tierName);
});

test('Wallet Auth: POST /api/wallet/verify-signature rejects invalid signature or address mismatch', async () => {
  const walletA = Wallet.createRandom();
  const walletB = Wallet.createRandom();

  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${walletA.address}`);
  const { message } = await nonceRes.json();

  // Signed by wallet B instead of wallet A
  const fraudulentSig = await walletB.signMessage(message);

  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: walletA.address, // Claiming to be Wallet A
      signature: fraudulentSig,  // But signed by Wallet B
      message,
      tokensHeld: 5000000
    })
  });

  assert.strictEqual(verifyRes.status, 401);
  const data = await verifyRes.json();
  assert.strictEqual(data.success, false);
  assert.ok(data.error.includes('mismatch'));
});

test('User Profile: POST /api/user/profile saves and GET retrieves onboarding details', async () => {
  const wallet = Wallet.createRandom();
  const address = wallet.address.toLowerCase();

  // Save profile
  const saveRes = await fetch(`${baseUrl}/api/user/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address,
      name: 'Naquib Mirza',
      email: 'naquib@example.com'
    })
  });
  assert.strictEqual(saveRes.status, 200);
  const saveData = await saveRes.json();
  assert.strictEqual(saveData.success, true);
  assert.strictEqual(saveData.profile.name, 'Naquib Mirza');
  assert.strictEqual(saveData.profile.email, 'naquib@example.com');

  // Retrieve profile
  const getRes = await fetch(`${baseUrl}/api/user/profile?address=${address}`);
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.strictEqual(getData.success, true);
  assert.strictEqual(getData.profile.name, 'Naquib Mirza');
  assert.strictEqual(getData.profile.email, 'naquib@example.com');
});

