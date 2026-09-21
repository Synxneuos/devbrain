process.env.NODE_ENV = 'test';
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

test('User Profile: POST /api/user/profile saves and GET retrieves onboarding details (session-bound)', async () => {
  const wallet = Wallet.createRandom();
  const address = wallet.address.toLowerCase();

  // Establish a signed session first (profile writes are wallet-bound)
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${wallet.address}`);
  const { message } = await nonceRes.json();
  const signature = await wallet.signMessage(message);
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, signature, message })
  });
  const { sessionToken } = await verifyRes.json();
  assert.ok(sessionToken, 'Session token required for profile access');

  // Profile write without session must be rejected
  const unauthRes = await fetch(`${baseUrl}/api/user/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, name: 'Hacker', email: 'h@x.io' })
  });
  assert.strictEqual(unauthRes.status, 401);

  // Save profile with session
  const saveRes = await fetch(`${baseUrl}/api/user/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
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

  // Retrieve profile with own session
  const getRes = await fetch(`${baseUrl}/api/user/profile?address=${address}`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.strictEqual(getData.success, true);
  assert.strictEqual(getData.profile.name, 'Naquib Mirza');
  assert.strictEqual(getData.profile.email, 'naquib@example.com');

  // Reading someone else's profile must be forbidden
  const otherSession = Wallet.createRandom();
  const otherNonce = await (await fetch(`${baseUrl}/api/wallet/nonce?address=${otherSession.address}`)).json();
  const otherSig = await otherSession.signMessage(otherNonce.message);
  const otherVerify = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: otherSession.address, signature: otherSig, message: otherNonce.message })
  });
  const { sessionToken: otherToken } = await otherVerify.json();
  const spyRes = await fetch(`${baseUrl}/api/user/profile?address=${address}`, {
    headers: { 'Authorization': `Bearer ${otherToken}` }
  });
  assert.strictEqual(spyRes.status, 403);
});

test('Chat Security: /api/chat rejects unauthenticated requests (credit theft prevention)', async () => {
  const testWallet = Wallet.createRandom();
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Summarize Bitcoin price history',
      walletAddress: testWallet.address
    })
  });
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.ok(data.error.includes('Unauthorized'));
});

test('Chat Security: /api/chat succeeds with signature-bound session token', async () => {
  const testWallet = Wallet.createRandom();
  
  // 1. Get challenge
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${testWallet.address}`);
  const { message } = await nonceRes.json();

  // 2. Sign challenge
  const signature = await testWallet.signMessage(message);

  // 3. Verify signature and obtain session token
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: testWallet.address,
      signature,
      message,
      tokensHeld: 10000000
    })
  });
  const verifyData = await verifyRes.json();
  assert.ok(verifyData.sessionToken, 'Must issue cryptographic sessionToken');

  // 4. Send chat request with sessionToken
  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${verifyData.sessionToken}`
    },
    body: JSON.stringify({
      prompt: 'Hello Jev Brain',
      walletAddress: testWallet.address
    })
  });
  assert.strictEqual(chatRes.status, 200);
  const chatData = await chatRes.json();
  assert.ok(chatData.response);
  assert.strictEqual(chatData.walletAddress, testWallet.address.toLowerCase());
});

test('Wallet Auth: client-supplied tokensHeld is ignored (server-authoritative tier, no elevation)', async () => {
  const testWallet = Wallet.createRandom();

  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${testWallet.address}`);
  const { message } = await nonceRes.json();
  const signature = await testWallet.signMessage(message);

  // Client fraudulently claims a whale-size holding
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: testWallet.address,
      signature,
      message,
      tokensHeld: 999999999
    })
  });

  assert.strictEqual(verifyRes.status, 200);
  const data = await verifyRes.json();
  assert.strictEqual(data.success, true);
  // Server never trusts client holdings: with no token contract configured in
  // the test env the fallback tier is baseline 'Wallet Member', never 'Dynasty Magnate'.
  assert.notStrictEqual(data.userTier.tierName, 'Dynasty Magnate');
  assert.strictEqual(data.userTier.tierName, 'Wallet Member');
  assert.strictEqual(data.tokensHeld, 0);
});

test('Chat Security: /api/chat rejects models above the wallet holding tier', async () => {
  const testWallet = Wallet.createRandom();

  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${testWallet.address}`);
  const { message } = await nonceRes.json();
  const signature = await testWallet.signMessage(message);

  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: testWallet.address, signature, message })
  });
  const verifyData = await verifyRes.json();
  assert.ok(verifyData.sessionToken);

  // 'Wallet Member' fallback tier only allows basic models; frontier must be rejected.
  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${verifyData.sessionToken}`
    },
    body: JSON.stringify({
      prompt: 'Give me the deepest answer',
      model: 'anthropic/claude-3.5-sonnet'
    })
  });

  assert.strictEqual(chatRes.status, 403);
  const chatData = await chatRes.json();
  assert.ok(chatData.error.includes('not included in your'));
});

test('Chat Security: /api/chat rejects forged (unsigned) session tokens', async () => {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer deadbeef.deadbeefdeadbeef'
    },
    body: JSON.stringify({ prompt: 'hello', model: 'auto' })
  });
  assert.strictEqual(res.status, 401);
});

test('Warden Check: POST /api/warden-check returns questions and checks structure', async () => {
  const res = await fetch(`${baseUrl}/api/warden-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command: 'git status',
      filepath: 'src/server.js'
    })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.verdict, 'AUTO_ALLOW');
  assert.ok(data.checks, 'Must contain checks object');
  assert.strictEqual(data.checks.fileCheck.ok, true);
  assert.strictEqual(data.checks.irrevCheck.irreversible, false);
  assert.strictEqual(data.checks.loopCheck.looping, false);
});

test('Wallet Auth: POST /api/wallet/verify-signature authenticates valid Solana Ed25519 signature', async () => {
  const crypto = await import('node:crypto');
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const BASE = BigInt(58);
  function encodeBase58(buffer) {
    let num = BigInt('0x' + buffer.toString('hex'));
    let str = '';
    while (num > 0n) {
      const rem = num % BASE;
      num = num / BASE;
      str = ALPHABET[Number(rem)] + str;
    }
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0) str = '1' + str;
      else break;
    }
    return str;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const solAddress = encodeBase58(rawPub);

  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${solAddress}`);
  assert.strictEqual(nonceRes.status, 200);
  const { message } = await nonceRes.json();

  const sig = crypto.sign(null, Buffer.from(message), privateKey);
  const signature = encodeBase58(sig);

  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: solAddress,
      signature,
      message
    })
  });
  assert.strictEqual(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyData.success, true);
  assert.strictEqual(verifyData.address, solAddress);
  assert.ok(verifyData.sessionToken);
});

test('Projects API: POST /api/projects saves project scoped to session wallet and GET retrieves it', async () => {
  const wallet = Wallet.createRandom();
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${wallet.address}`);
  const { message } = await nonceRes.json();
  const signature = await wallet.signMessage(message);
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, signature, message })
  });
  const { sessionToken } = await verifyRes.json();
  assert.ok(sessionToken);

  // Create project
  const postRes = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ name: 'Alpha Bot', description: 'Algorithmic trading workspace' })
  });
  assert.strictEqual(postRes.status, 201);
  const postData = await postRes.json();
  assert.strictEqual(postData.project.name, 'Alpha Bot');

  // Retrieve projects
  const getRes = await fetch(`${baseUrl}/api/projects`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.ok(Array.isArray(getData.projects));
  assert.ok(getData.projects.some(p => p.name === 'Alpha Bot'));
});

test('Artifacts API: POST /api/artifacts saves artifact scoped to session wallet and GET retrieves it', async () => {
  const wallet = Wallet.createRandom();
  const nonceRes = await fetch(`${baseUrl}/api/wallet/nonce?address=${wallet.address}`);
  const { message } = await nonceRes.json();
  const signature = await wallet.signMessage(message);
  const verifyRes = await fetch(`${baseUrl}/api/wallet/verify-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, signature, message })
  });
  const { sessionToken } = await verifyRes.json();
  assert.ok(sessionToken);

  // Save artifact
  const postRes = await fetch(`${baseUrl}/api/artifacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ title: 'Safety Formula', type: 'code', language: 'javascript', code: 'const safe = true;' })
  });
  assert.strictEqual(postRes.status, 201);
  const postData = await postRes.json();
  assert.strictEqual(postData.artifact.title, 'Safety Formula');

  // Retrieve artifacts
  const getRes = await fetch(`${baseUrl}/api/artifacts`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.ok(Array.isArray(getData.artifacts));
  assert.ok(getData.artifacts.some(a => a.title === 'Safety Formula'));
});

test('Mobile Devices: GET /api/mobile/devices includes virtual device in UI gateway', async () => {
  const res = await fetch(`${baseUrl}/api/mobile/devices`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.devices));
  assert.ok(data.devices.length >= 1, 'UI gateway must provide at least one device for interaction');
  assert.ok(data.devices.some(d => d.id === 'pixel-8-virtual' || d.type === 'physical_adb'));
});

test('Model Catalog: GET /api/models returns maintenance status and notice', async () => {
  const res = await fetch(`${baseUrl}/api/models`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'maintenance');
  assert.strictEqual(data.count, 0);
  assert.ok(data.message.includes('Backend infrastructure upgrade is currently undergoing maintenance'));
});
