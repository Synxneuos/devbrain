import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JevBrain, PRESETS } from './core/router.js';
import { AgentWarden } from './core/warden.js';
import { OpenRouterClient, OPENROUTER_MODELS } from './core/openrouter.js';
import { fetchLiveMarketData, calculateDynamicTier } from './core/dexscreener.js';
import { MobileRunner } from './core/mobile.js';
import { EXTENDED_MODELS, getModelTier } from './core/extended-models.js';
import { verifyMessage, JsonRpcProvider, Contract, isAddress } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env configuration if present
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of envContent.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = process.env.STATE_FILE || (
  process.env.NODE_ENV === 'test'
    ? path.join(DATA_DIR, 'jev-state.test.json')
    : path.join(DATA_DIR, 'jev-state.json')
);

// State persistence
fs.mkdirSync(DATA_DIR, { recursive: true });
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function writeState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8'); } catch {}
}
const savedState = readState();

// Active signature authentication nonces (5-minute TTL)
const activeNonces = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000;

// Stateless HMAC-signed session tokens: base64url(payload).hmacSignature
// Survives server restarts and works across serverless instances when SESSION_SECRET is set.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24-hour session TTL
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  console.warn('[security] SESSION_SECRET is not set — session tokens will not survive restarts. Set SESSION_SECRET in production.');
  return crypto.randomBytes(32).toString('hex');
})();

function signSessionPayload(payloadB64) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('hex');
}

// session payload: { a: address, th: server-verified tokensHeld, dc: tokenCheckDisabled, exp: expiry }
function issueSessionToken(session) {
  const payloadB64 = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payloadB64}.${signSessionPayload(payloadB64)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = signSessionPayload(payloadB64);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const session = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!session || !session.a || !session.exp || Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

function parseSession(req, body = {}) {
  const authHeader = (req.headers.authorization || '').trim();
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.headers['x-session-token'] || body.sessionToken || '');
  return verifySessionToken(token);
}

// Compute the effective access tier. Only server-verified balances are trusted.
async function resolveUserTier(tokensHeld, tokenCheckDisabled, marketData) {
  const market = marketData || await fetchLiveMarketData();
  if (tokenCheckDisabled) {
    // No token contract/RPC configured: any authenticated wallet gets entry-level access.
    return {
      ...calculateDynamicTier(1, market),
      tierName: 'Wallet Member',
      name: 'Wallet Member',
      tokensHeld: 0,
      tokenCheckDisabled: true
    };
  }
  return calculateDynamicTier(tokensHeld, market);
}

// Server-side ERC-20 balance verification. Never trusts client-supplied amounts.
const DEFAULT_RPC_URLS = {
  ethereum: 'https://eth.llamarpc.com',
  polygon: 'https://polygon-rpc.com',
  base: 'https://mainnet.base.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  bsc: 'https://bsc-dataseed.binance.org'
};
const TOKEN_BALANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
];
const balanceCache = new Map(); // address -> { tokensHeld, updatedAt }
const BALANCE_CACHE_TTL_MS = 60 * 1000;

// Base58 Utilities for Solana
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_BIGINT = BigInt(58);

function decodeBase58(str) {
  let num = 0n;
  for (const c of str) {
    const idx = BASE58_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error('Invalid Base58 char: ' + c);
    num = num * BASE58_BIGINT + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  let bytes = Buffer.from(hex, 'hex');
  let leadingZeros = 0;
  for (const c of str) {
    if (c === '1') leadingZeros++;
    else break;
  }
  if (leadingZeros > 0) bytes = Buffer.concat([Buffer.alloc(leadingZeros), bytes]);
  return bytes;
}

function isSolanaAddress(addr) {
  return typeof addr === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function verifySolanaSignature(address, message, signature) {
  try {
    const rawKey = decodeBase58(address);
    if (rawKey.length !== 32) return false;
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const derKey = Buffer.concat([spkiPrefix, rawKey]);
    const pubKey = crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });

    let sigBytes;
    if (/^[0-9a-fA-F]{128}$/.test(signature)) {
      sigBytes = Buffer.from(signature, 'hex');
    } else {
      sigBytes = decodeBase58(signature);
    }
    if (sigBytes.length !== 64) return false;

    const msgBytes = Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8');
    return crypto.verify(null, msgBytes, pubKey, sigBytes);
  } catch (err) {
    return false;
  }
}

async function getSolanaTokenBalance(address, mint = 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump') {
  const rpcUrl = (process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com').trim();
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        address,
        { mint },
        { encoding: 'jsonParsed' }
      ]
    }),
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error(`Solana RPC error: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Solana RPC error');
  const accounts = json.result?.value || [];
  let totalBalance = 0;
  for (const acc of accounts) {
    const amount = acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof amount === 'number') {
      totalBalance += amount;
    }
  }
  return totalBalance;
}

async function getVerifiedTokenBalance(address) {
  const contract = (process.env.TOKEN_CONTRACT_ADDRESS || 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump').trim();
  const chain = (process.env.TOKEN_CHAIN || 'solana').toLowerCase();
  const checkEnabled = (process.env.TOKEN_CHECK_ENABLED || 'true').toLowerCase() !== 'false';

  // In test suite, skip external on-chain calls so unit tests remain fast & deterministic
  if (process.env.NODE_ENV === 'test' || !checkEnabled || !contract) {
    return {
      tokensHeld: 0,
      enabled: false,
      contract,
      chain,
      reason: 'Token balance check disabled in test or unconfigured.'
    };
  }

  const cached = balanceCache.get(address);
  if (cached && Date.now() - cached.updatedAt < BALANCE_CACHE_TTL_MS) {
    return { tokensHeld: cached.tokensHeld, enabled: true, contract, chain };
  }

  // Solana SPL Token Verification
  if (chain === 'solana' || isSolanaAddress(address) || isSolanaAddress(contract)) {
    if (!isSolanaAddress(address)) {
      return {
        tokensHeld: 0,
        enabled: true,
        contract,
        chain: 'solana',
        error: 'Non-Solana wallet address provided. Connect your Phantom/Solana wallet holding $jevbrain.'
      };
    }
    try {
      const tokensHeld = await getSolanaTokenBalance(address, contract);
      balanceCache.set(address, { tokensHeld, updatedAt: Date.now() });
      return { tokensHeld, enabled: true, contract, chain: 'solana' };
    } catch (err) {
      return { tokensHeld: 0, enabled: true, contract, chain: 'solana', error: `Solana token check failed: ${err.message}` };
    }
  }

  // EVM Token Verification
  if (!isAddress(contract) || !isAddress(address)) {
    return { tokensHeld: 0, enabled: false, contract, chain, reason: 'Invalid address' };
  }

  try {
    const rpcUrl = (process.env.TOKEN_RPC_URL || DEFAULT_RPC_URLS[chain] || DEFAULT_RPC_URLS.ethereum).trim();
    const provider = new JsonRpcProvider(rpcUrl);
    const erc20 = new Contract(contract, TOKEN_BALANCE_ABI, provider);
    const [rawBalance, decimals] = await Promise.all([erc20.balanceOf(address), erc20.decimals()]);
    const tokensHeld = Number(rawBalance) / (10 ** Number(decimals));
    balanceCache.set(address, { tokensHeld, updatedAt: Date.now() });
    return { tokensHeld, enabled: true, contract, chain };
  } catch (err) {
    return { tokensHeld: 0, enabled: true, contract, chain, error: `Token balance verification failed: ${err.shortMessage || err.message}` };
  }
}

// Persistent User Profiles by Wallet Address
const userProfiles = new Map(Object.entries(savedState.profiles || {}));

// Global server analytics
const stats = {
  totalProcessed: 0,
  autoActCount: 0,
  reviewCount: 0,
  totalLatencyMs: 0,
  estimatedCostSavedUsd: 0.00
};

// Each REST surface gets an isolated warden instance so call-history (loop detection)
// never leaks across endpoints, devices, or users.
const defaultBrain = new JevBrain();
const defaultWarden = new AgentWarden();
const openRouterClient = new OpenRouterClient();
const mobileRunner = new MobileRunner({ warden: new AgentWarden() });

// Persistent Real Projects Store (real user-created projects only, no seeds)
let projects = savedState.projects || [];

// Persistent Real Artifacts Store (real generated artifacts only, no seeds)
let artifacts = savedState.artifacts || [];

// Persistent Chats by Wallet Address (session-bound, see /api/chats)
const chatSessions = new Map(Object.entries(savedState.chats || {}));

function persistState() {
  writeState({
    profiles: Object.fromEntries(userProfiles.entries()),
    chats: Object.fromEntries(chatSessions.entries()),
    projects,
    artifacts
  });
}


function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    default: return 'text/plain';
  }
}

// ── Tier-Based Model Allowlist ─────────────────────────────────────
// Enforced server-side on every AI chat request: a session may only use
// models included in its holding tier's allowedModels (or 'all' / tier level).
function isModelAllowedForTier(model, userTier) {
  if (!model || model === 'auto') return true; // Jev auto-router picks a tier-safe model itself
  if (!userTier) return false;

  const allowed = userTier?.allowedModels || [];
  if (allowed.includes('all')) return true; // Whale / Dynasty Magnate has unrestricted access to all models

  // Check explicit allowlist rules first
  if (allowed.some(rule => rule === model || model.startsWith(rule))) {
    return true;
  }

  // Resolve model required tier
  const modelTier = getModelTier(model);
  const userTierLevel = Number(userTier.tierId) || (userTier.tierName === 'Wallet Member' ? 1 : 0);

  // If user holding tier is >= model's required tier, allowed
  if (userTierLevel > 0 && userTierLevel >= modelTier.tierId) {
    return true;
  }

  return false;
}

// ── 500+ Model Catalog Aggregator (OpenRouter + Extended Models) ──
let cachedMergedModels = null;
let lastModelFetch = 0;
const MODEL_CACHE_TTL_MS = 60000; // 1 minute cache

async function getAllMergedModels() {
  const now = Date.now();
  if (cachedMergedModels && (now - lastModelFetch < MODEL_CACHE_TTL_MS)) {
    return cachedMergedModels;
  }

  let openRouterList = [];
  try {
    const modelRes = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });
    if (modelRes.ok) {
      const modelData = await modelRes.json();
      openRouterList = modelData.data || [];
    }
  } catch (err) {
    console.warn('OpenRouter models fetch warning:', err.message);
  }

  const map = new Map();
  // 1. Add OpenRouter models with tier classification
  openRouterList.forEach(m => {
    const t = getModelTier(m);
    map.set(m.id.toLowerCase(), {
      id: m.id,
      name: m.name || m.id,
      description: m.description || '',
      context_length: m.context_length || 8192,
      pricing: m.pricing || { prompt: '0.000001', completion: '0.000002' },
      architecture: m.architecture || { modality: 'text->text' },
      tierId: t.tierId,
      tierName: t.tierName,
      category: t.category
    });
  });

  // 2. Merge extended catalog (guarantees 500+ models)
  EXTENDED_MODELS.forEach(m => {
    const key = m.id.toLowerCase();
    if (!map.has(key)) {
      const t = getModelTier(m);
      map.set(key, {
        ...m,
        tierId: t.tierId,
        tierName: t.tierName,
        category: t.category
      });
    }
  });

  const merged = Array.from(map.values()).sort((a, b) => {
    if (b.tierId !== a.tierId) return b.tierId - a.tierId;
    return a.name.localeCompare(b.name);
  });

  cachedMergedModels = merged;
  lastModelFetch = now;
  return merged;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { // 2MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export async function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `http://${host}`);


    // API Routes
    if (url.pathname === '/api/presets' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ presets: PRESETS }));
      return;
    }

    if (url.pathname === '/api/models' && req.method === 'GET') {
      try {
        const models = await getAllMergedModels();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          count: models.length,
          models
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (url.pathname === '/api/stats' && req.method === 'GET') {
      const avgLatency = stats.totalProcessed > 0 
        ? Math.round((stats.totalLatencyMs / stats.totalProcessed) * 100) / 100 
        : 0;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...stats,
        avgLatencyMs: avgLatency,
        autoRatePct: stats.totalProcessed > 0 
          ? Math.round((stats.autoActCount / stats.totalProcessed) * 100) 
          : 0
      }));
      return;
    }

    if (url.pathname === '/api/route' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const brain = new JevBrain({
          threshold: body.threshold ?? 0.8,
          preset: body.preset || null
        });

        const result = await brain.route(body.text, body.labels);

        // Update stats
        stats.totalProcessed++;
        stats.totalLatencyMs += result.latencyMs;
        if (result.action === 'AUTO_ACT') {
          stats.autoActCount++;
          // Saved ~0.001 USD per skipped LLM call
          stats.estimatedCostSavedUsd += 0.0012;
        } else {
          stats.reviewCount++;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/batch' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const brain = new JevBrain({
          threshold: body.threshold ?? 0.8,
          preset: body.preset || null
        });

        const items = Array.isArray(body.items) ? body.items : (body.text || '').split('\n');
        const results = await brain.batchRoute(items, body.labels);

        for (const r of results) {
          stats.totalProcessed++;
          stats.totalLatencyMs += r.latencyMs;
          if (r.action === 'AUTO_ACT') {
            stats.autoActCount++;
            stats.estimatedCostSavedUsd += 0.0012;
          } else {
            stats.reviewCount++;
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          count: results.length,
          results
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/warden' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const result = new AgentWarden().evaluate({
          tool: body.tool || 'bash',
          command: body.command || '',
          filepath: body.filepath || '',
          args: body.args || {}
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/market-info' && req.method === 'GET') {
      try {
        const marketData = await fetchLiveMarketData();
        const demoTier = calculateDynamicTier(1000000, marketData);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          marketData,
          dynamicTiers: demoTier.dynamicTiers,
          trustFactor: demoTier.trustFactor,
          models: OPENROUTER_MODELS
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if ((url.pathname === '/api/chat' || url.pathname === '/api/chat/stream') && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const prompt = body.prompt || '';
        const model = body.model || 'auto';

        // Signature-bound stateless HMAC session validation
        const session = parseSession(req, body);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Valid wallet signature session required. Please connect and sign in with your wallet.' }));
          return;
        }

        const walletAddress = session.a;
        // Resolve tier fresh on every request from the server-verified balance
        // bound into the session at signature-verification time.
        const userTier = await resolveUserTier(session.th, session.dc, null);

        if (!prompt.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Prompt is required.' }));
          return;
        }

        // Tier-based model allowlist (server-authoritative, closes frontier-tier theft)
        if (!isModelAllowedForTier(model, userTier)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: `Model '${model}' is not included in your [${userTier.tierName || 'Guest'}] holding tier. Select an allowed model or increase your holding tier.`
          }));
          return;
        }

        const recordStats = (r) => {
          stats.totalProcessed++;
          stats.totalLatencyMs += r.latencyMs || 0;
          stats.estimatedCostSavedUsd += r.dollarsSaved || 0;
          if (r.tier === 'frontier') stats.reviewCount++;
          else stats.autoActCount++;
        };

        if (url.pathname === '/api/chat/stream') {
          // True token-by-token streaming when a live OpenRouter key is configured;
          // otherwise a single-chunk response from the local router engine.
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
          });
          const useLiveStream = openRouterClient.apiKey
            && openRouterClient.apiKey.startsWith('sk-or-')
            && process.env.NODE_ENV !== 'test';
          let result = null;
          if (useLiveStream) {
            try {
              result = await openRouterClient.streamChat(prompt, userTier, model, async (token) => {
                res.write(`data: ${JSON.stringify({ token })}\n\n`);
              });
            } catch (streamErr) {
              // Upstream failed (bad key/quota): degrade gracefully to the
              // local router engine notice, matching the non-stream behavior.
              result = null;
            }
          }
          if (!result) {
            result = await openRouterClient.executeChat(prompt, userTier, model);
            res.write(`data: ${JSON.stringify({ token: result.response })}\n\n`);
          }
          recordStats(result);
          res.write(`data: ${JSON.stringify({ done: true, ...result, walletAddress, userTier })}\n\n`);
          res.end();
        } else {
          const result = await openRouterClient.executeChat(prompt, userTier, model);
          recordStats(result);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ...result,
            walletAddress,
            userTier,
            totalSavedUsd: Math.round(stats.estimatedCostSavedUsd * 1000) / 1000
          }));
        }
      } catch (err) {
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }

    if (url.pathname === '/api/wallet/status' && req.method === 'GET') {
      try {
        const marketData = await fetchLiveMarketData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          provider: 'MetaMask & Web3 Wallets (metamask.io)',
          supportedChains: ['Ethereum', 'Base', 'Arbitrum', 'Polygon'],
          requiredTokensBaseline: 1000000,
          marketCap: marketData.marketCap,
          activeProtocol: 'EIP-6963 + window.ethereum + personal_sign'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/wallet/nonce' && req.method === 'GET') {
      const rawAddress = (url.searchParams.get('address') || '').trim();
      const isSol = isSolanaAddress(rawAddress);
      const address = isSol ? rawAddress : rawAddress.toLowerCase();
      if (!address || (!isAddress(address) && !isSol)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Valid wallet address (Solana or EVM) is required.' }));
        return;
      }

      // Cleanup expired nonces
      const now = Date.now();
      for (const [key, entry] of activeNonces.entries()) {
        if (now - entry.createdAt > NONCE_TTL_MS) {
          activeNonces.delete(key);
        }
      }

      const nonce = Math.floor(100000 + Math.random() * 900000).toString();
      const timestamp = new Date().toISOString();
      const message = `Welcome to Jev Brain!\n\nClick to sign and authenticate your wallet.\nThis request will not trigger a blockchain transaction or cost any gas fees.\n\nWallet: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
      activeNonces.set(address, { nonce, message, createdAt: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nonce, message, chain: isSol ? 'solana' : 'evm' }));
      return;
    }

    if (url.pathname === '/api/wallet/verify-signature' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const rawAddress = (body.address || '').trim();
        const isSol = isSolanaAddress(rawAddress);
        const address = isSol ? rawAddress : rawAddress.toLowerCase();
        const signature = body.signature || '';
        const message = body.message || '';
        // NOTE: body.tokensHeld is deliberately ignored. Holdings are read
        // server-side from the chain below — the client is never trusted.

        if (!address || !signature || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Address, message and signature are required.' }));
          return;
        }

        const challenge = activeNonces.get(address);
        if (!challenge || challenge.message !== message || Date.now() - challenge.createdAt > NONCE_TTL_MS) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Authentication challenge is missing or expired.' }));
          return;
        }

        // 1. Verify cryptographic signature (Solana Ed25519 or EVM Secp256k1)
        let verifiedAddress = '';
        if (isSol) {
          const isValidSol = verifySolanaSignature(address, message, signature);
          if (!isValidSol) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid Solana cryptographic signature.' }));
            return;
          }
          verifiedAddress = address;
        } else {
          try {
            verifiedAddress = verifyMessage(message, signature).toLowerCase();
          } catch (sigErr) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid cryptographic signature: ' + sigErr.message }));
            return;
          }

          if (verifiedAddress !== address) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Signature address mismatch' }));
            return;
          }
        }

        activeNonces.delete(address);

        // 2. Read the REAL ERC-20 balance from the chain (never trust client input),
        //    then fetch market data & resolve the effective tier.
        const marketData = await fetchLiveMarketData();
        const balance = await getVerifiedTokenBalance(verifiedAddress);
        const tokenCheckDisabled = !balance.enabled;
        const tokensHeld = tokenCheckDisabled ? 0 : balance.tokensHeld;
        const userTier = await resolveUserTier(tokensHeld, tokenCheckDisabled, marketData);

        if (!tokenCheckDisabled && userTier.tierId <= 0) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            verified: true,
            error: balance.error
              ? `Wallet signature verified, but on-chain token balance could not be verified: ${balance.error}`
              : `Wallet signature verified, but no qualifying ${balance.contract} holding was detected on-chain. A minimum holding is required to unlock AI features.`
          }));
          return;
        }

        // 3. Issue stateless HMAC session token bound to the verified address and
        //    server-verified holdings. Survives restarts when SESSION_SECRET is set.
        const sessionToken = issueSessionToken({
          a: verifiedAddress,
          th: tokensHeld,
          dc: tokenCheckDisabled,
          exp: Date.now() + SESSION_TTL_MS
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          verified: true,
          sessionToken,
          address: verifiedAddress,
          unlocked: userTier.tierId > 0,
          tokensHeld,
          userTier,
          marketData,
          walletProvider: 'MetaMask (Web3 Cryptographically Signed)',
          message: `MetaMask signature verified! Assigned to [${userTier.tierName}]`
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/session/validate' && req.method === 'GET') {
      const session = parseSession(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'No active session.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: true, address: session.a, tokenCheckDisabled: !!session.dc }));
      return;
    }

    if (url.pathname === '/api/user/profile' && req.method === 'GET') {
      // Profiles are PII: only the authenticated session owner may read theirs.
      const session = parseSession(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Unauthorized: Valid wallet signature session required.' }));
        return;
      }
      const requested = (url.searchParams.get('address') || '').toLowerCase();
      if (requested && requested !== session.a) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Forbidden: session does not match this address.' }));
        return;
      }
      const profile = userProfiles.get(session.a) || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, profile }));
      return;
    }

    if (url.pathname === '/api/user/profile' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        // Session-bound: a signed-in wallet can only write its own profile.
        const session = parseSession(req, body);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Unauthorized: Valid wallet signature session required.' }));
          return;
        }
        const address = session.a;
        const name = (body.name || '').trim().slice(0, 120);
        const email = (body.email || '').trim().slice(0, 200);

        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Name is required.' }));
          return;
        }

        const profile = { address, name, email, updatedAt: Date.now() };
        userProfiles.set(address, profile);
        persistState();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, profile }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/chats' && req.method === 'GET') {
      // Server-side chat history — only ever for the authenticated session wallet.
      const session = parseSession(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Valid wallet signature session required.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ chats: chatSessions.get(session.a) || [] }));
      return;
    }

    if (url.pathname === '/api/chats' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const session = parseSession(req, body);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Valid wallet signature session required.' }));
          return;
        }

        const chat = body.chat;
        if (!chat || typeof chat !== 'object' || typeof chat.id !== 'string' || !Array.isArray(chat.messages)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'A valid chat object { id, messages } is required.' }));
          return;
        }

        // Whitelist fields; cap sizes so the state file cannot be bloated by clients.
        const cleanChat = {
          id: chat.id.slice(0, 64),
          title: String(chat.title || 'Chat').slice(0, 120),
          createdAt: Number(chat.createdAt) || Date.now(),
          messages: chat.messages.slice(0, 500).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: String(m.content || '').slice(0, 100000),
            modelName: m.modelName ? String(m.modelName).slice(0, 120) : undefined,
            latencyMs: Number(m.latencyMs) || undefined,
            dollarsSaved: Number(m.dollarsSaved) || undefined,
            timestamp: Number(m.timestamp) || Date.now()
          }))
        };

        const walletChats = chatSessions.get(session.a) || [];
        const existingIdx = walletChats.findIndex(c => c.id === cleanChat.id);
        if (existingIdx !== -1) walletChats[existingIdx] = cleanChat;
        else walletChats.unshift(cleanChat);
        chatSessions.set(session.a, walletChats.slice(0, 100));
        persistState();

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/warden-check' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const command = body.command || body.actionText || '';
        const tool = body.tool || 'bash';
        const filepath = body.filepath || '';
        
        const evaluation = new AgentWarden().evaluate({
          tool,
          command,
          filepath,
          args: { command, path: filepath }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          command,
          verdict: evaluation.decision,
          decision: evaluation.decision,
          ...evaluation,
          checks: {
            fileCheck: evaluation.questions?.is_right_file || { ok: true },
            irrevCheck: evaluation.questions?.is_irreversible || { irreversible: false },
            loopCheck: evaluation.questions?.are_we_looping || { looping: false },
            doneCheck: evaluation.questions?.are_we_done || { done: false }
          },
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/projects') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ projects }));
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const newProject = {
            id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: (body.name || 'Untitled Project').slice(0, 120),
            description: (body.description || '').slice(0, 500),
            createdAt: new Date().toISOString().slice(0, 10),
            chatCount: 0
          };
          projects.unshift(newProject);
          persistState();
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ project: newProject, projects }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
    }

    if (url.pathname === '/api/artifacts') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ artifacts }));
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const newArtifact = {
            id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: (body.title || 'Generated Artifact').slice(0, 120),
            type: body.type || 'code',
            language: (body.language || 'javascript').slice(0, 40),
            code: String(body.code || '').slice(0, 200000),
            createdAt: new Date().toISOString().slice(0, 10)
          };
          artifacts.unshift(newArtifact);
          persistState();
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ artifact: newArtifact, artifacts }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
    }

    if (url.pathname === '/api/mobile/devices' && req.method === 'GET') {
      try {
        const devices = await mobileRunner.listDevices();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ devices }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/mobile/screen' && req.method === 'GET') {
      try {
        const deviceId = url.searchParams.get('deviceId') || 'pixel-8-virtual';
        const screen = await mobileRunner.getScreenState(deviceId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(screen));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/mobile/action' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const deviceId = body.deviceId || 'pixel-8-virtual';
        const result = await mobileRunner.executeAction(deviceId, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/mobile/logs' && req.method === 'GET') {
      const logs = mobileRunner.getLogs(50);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ logs }));
      return;
    }

    // Static Files
    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    
    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // Serve index.html for SPA fallback
          fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, fallbackData) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not Found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(fallbackData);
            }
          });
        } else {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
      } else {
        res.writeHead(200, { 'Content-Type': getContentType(filePath) });
        res.end(data);
      }
    });
}

export function startServer(port = 3333) {
  const server = http.createServer(handleRequest);

  server.listen(port, () => {
    console.log(`\n⚡ Jev Brain Web Daemon running at: http://localhost:${port}`);
    console.log(`“Don't think. Route.” (Decision threshold: 0.8)\n`);
  });

  return server;
}

export default handleRequest;
