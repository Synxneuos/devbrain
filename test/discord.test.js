process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { handleRequest } from '../src/server.js';
import { SERVER_ROLES, OFFICIAL_TOKEN_CA } from '../src/discord/bot.js';

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

test('Discord Integration: GET /api/discord/info returns official CA and roles', async () => {
  const res = await fetch(`${baseUrl}/api/discord/info`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.officialCA, 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump');
  assert.ok(Array.isArray(data.roles));
  assert.strictEqual(data.roles.length, 9);

  const memberRole = data.roles.find(r => r.name === 'Verified Member');
  assert.ok(memberRole, 'Verified Member role must exist');
  assert.strictEqual(memberRole.color, 0x10B981);

  const arbiter = data.roles.find(r => r.name === 'Neural Arbiter');
  assert.ok(arbiter, 'Neural Arbiter role must exist');
  assert.strictEqual(arbiter.color, 0x7C3AED);

  const warden = data.roles.find(r => r.name === 'Agent Warden');
  assert.ok(warden, 'Agent Warden role must exist');
  assert.strictEqual(warden.color, 0x0284C7);

  const dynasty = data.roles.find(r => r.name === 'Dynasty Magnate');
  assert.ok(dynasty, 'Dynasty Magnate role must exist');
});

test('Discord Sentinel: Prohibited Scam/FUD Regex Patterns', () => {
  const SCAM_PATTERNS = [
    /\b(scam|fake|rug|honeypot|drainer|phishing)\b/i,
    /claim\s+your\s+tokens/i,
    /connect\s+wallet\s+to\s+claim/i,
    /dm\s+(me\s+)?for\s+(support|help)/i,
    /seed\s+phrase|private\s+key/i
  ];

  const violations = [
    'this is a scam project',
    'total fake token',
    'will rug soon',
    'claim your tokens now',
    'connect wallet to claim rewards',
    'dm me for support',
    'send me your private key'
  ];

  for (const text of violations) {
    const matched = SCAM_PATTERNS.some(r => r.test(text));
    assert.ok(matched, `Expected violation for: "${text}"`);
  }

  const benign = [
    'How does Jev Brain model routing work?',
    'I just verified my token holding',
    'Checking my Dynasty Magnate tier'
  ];

  for (const text of benign) {
    const matched = SCAM_PATTERNS.some(r => r.test(text));
    assert.strictEqual(matched, false, `Expected clean message for: "${text}"`);
  }
});

test('Discord Sentinel: Rogue Mod & Unauthorized Token Launch Shield Patterns', () => {
  const ROGUE_PATTERNS = [
    /dev\s+(is\s+)?(launching|dropping|deploying|releasing)/i,
    /new\s+(token|ca|contract|pump|coin)/i,
    /stealth\s+launch/i,
    /presale(\s+live)?/i,
    /fair\s+launch/i,
    /airdrop(\s+live|\s+claim|\s+now)/i,
    /migration\s+(to|live)/i,
    /pump\.fun\/(?!AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump)[a-zA-Z0-9]{32,44}/i
  ];

  const rogueMessages = [
    'dev is launching new token guys buy here',
    'dev releasing a second coin',
    'stealth launch in 5 mins',
    'presale is now live',
    'pump.fun/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R buy new coin',
    'airdrop live now'
  ];

  for (const msg of rogueMessages) {
    const isRogue = ROGUE_PATTERNS.some(r => r.test(msg));
    assert.ok(isRogue, `Expected rogue detection for: "${msg}"`);
  }

  // Official CA should NOT trigger pump.fun rogue pattern
  const officialPump = `pump.fun/${OFFICIAL_TOKEN_CA}`;
  const pumpPattern = /pump\.fun\/(?!AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump)[a-zA-Z0-9]{32,44}/i;
  assert.strictEqual(pumpPattern.test(officialPump), false, 'Official CA must not be flagged');
});

test('Discord Verification: POST /api/discord/verify rejects missing credentials', async () => {
  const res = await fetch(`${baseUrl}/api/discord/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ discordUserId: '123' })
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
});

test('Discord Human Verification: POST /api/discord/verify-human rejects missing discordUserId', async () => {
  const res = await fetch(`${baseUrl}/api/discord/verify-human`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
});
