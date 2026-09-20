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
import { verifyMessage } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

// Authenticated Sessions Map: sessionToken -> { address, userTier, tokensHeld, createdAt }
const authenticatedSessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24-hour session TTL

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of authenticatedSessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      authenticatedSessions.delete(token);
    }
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

const defaultBrain = new JevBrain();
const defaultWarden = new AgentWarden();
const openRouterClient = new OpenRouterClient();
const mobileRunner = new MobileRunner({ warden: defaultWarden });

// Persistent Real Projects Store
let projects = savedState.projects || [
  { id: 'proj-1', name: 'Trading Bot', description: 'Robinhood Chain DexScreener automation', createdAt: '2026-09-17', chatCount: 2 },
  { id: 'proj-2', name: 'Agent Safety Proxy', description: 'Agent Warden pre-flight command firewall', createdAt: '2026-09-18', chatCount: 3 },
  { id: 'proj-3', name: 'Inbox AI Triage', description: 'Zero-key sub-millisecond email classification', createdAt: '2026-09-19', chatCount: 1 }
];

// Persistent Real Artifacts Store
let artifacts = savedState.artifacts || [
  { id: 'art-1', title: 'OpenRouter Dynamic Model Router', type: 'code', language: 'javascript', code: '// Jev Brain Multi-Model Dynamic Cost Matrix\nexport function routeModel(prompt, complexity) {\n  if (complexity === "simple") return "meta-llama/llama-3.1-8b-instruct";\n  if (complexity === "medium") return "anthropic/claude-3.5-haiku";\n  return "anthropic/claude-3.5-sonnet";\n}', createdAt: '2026-09-18' },
  { id: 'art-2', title: 'Warden 4-Question Safety Ruleset', type: 'config', language: 'json', code: '{\n  "protectedPaths": [".env", ".git", "id_rsa", "*.pem"],\n  "destructiveKeywords": ["rm -rf", "drop database", "format", "mkfs"],\n  "maxLoopRepetition": 3\n}', createdAt: '2026-09-19' },
  { id: 'art-3', title: 'Dynamic DexScreener Tier Curve', type: 'math', language: 'markdown', code: '# Dynamic MC Tier Formula\nTrust Multiplier = sqrt(MC / 100,000)\nRequired Bag ($) = baseUsd * Trust Multiplier\nTokens Needed = Required Bag / Token Price', createdAt: '2026-09-19' }
];

function persistState() {
  writeState({
    profiles: Object.fromEntries(userProfiles.entries()),
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
      // Proxy to OpenRouter to get all 500+ models
      try {
        const modelRes = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Accept': 'application/json' }
        });
        
        if (modelRes.ok) {
          const modelData = await modelRes.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ models: modelData.data || [] }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch models' }));
        }
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
        const result = defaultWarden.evaluate({
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

        // Signature-bound cryptographic session validation
        cleanupSessions();
        const authHeader = req.headers['authorization'] || '';
        const sessionToken = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : (req.headers['x-session-token'] || body.sessionToken || '');

        if (!sessionToken || !authenticatedSessions.has(sessionToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Valid wallet signature session required. Please connect and sign in with your wallet.' }));
          return;
        }

        const session = authenticatedSessions.get(sessionToken);
        if (Date.now() - session.createdAt > SESSION_TTL_MS) {
          authenticatedSessions.delete(sessionToken);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session expired. Please reconnect and sign in with your wallet again.' }));
          return;
        }

        const walletAddress = session.address;
        const userTier = session.userTier;

        // Execute via internal OpenRouter
        const result = await openRouterClient.executeChat(prompt, userTier, model);

        // Update statistics
        stats.totalProcessed++;
        stats.totalLatencyMs += result.latencyMs;
        stats.estimatedCostSavedUsd += result.dollarsSaved;
        if (result.tier === 'basic' || result.tier === 'pro') {
          stats.autoActCount++;
        } else {
          stats.reviewCount++;
        }

        const payload = {
          ...result,
          walletAddress,
          userTier,
          totalSavedUsd: Math.round(stats.estimatedCostSavedUsd * 1000) / 1000
        };

        if (url.pathname === '/api/chat/stream') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          res.write(`data: ${JSON.stringify({ token: result.response })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true, ...payload })}\n\n`);
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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
      const address = (url.searchParams.get('address') || '').toLowerCase();
      if (!address) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Wallet address is required.' }));
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
      res.end(JSON.stringify({ nonce, message }));
      return;
    }

    if (url.pathname === '/api/wallet/verify-signature' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const address = (body.address || '').toLowerCase();
        const signature = body.signature || '';
        const message = body.message || '';
        const tokensHeld = parseFloat(body.tokensHeld) || 5000000;

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

        // 1. Verify cryptographic signature with ethers
        let verifiedAddress = '';
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

        activeNonces.delete(address);

        // 2. Fetch market data & calculate dynamic tier
        const marketData = await fetchLiveMarketData();
        const userTier = calculateDynamicTier(tokensHeld, marketData);

        // 3. Issue cryptographic signature-bound session token
        cleanupSessions();
        const sessionToken = crypto.randomBytes(32).toString('hex');
        authenticatedSessions.set(sessionToken, {
          address: verifiedAddress,
          userTier,
          tokensHeld,
          createdAt: Date.now()
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

    if (url.pathname === '/api/user/profile' && req.method === 'GET') {
      const address = (url.searchParams.get('address') || '').toLowerCase();
      const profile = userProfiles.get(address) || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, profile }));
      return;
    }

    if (url.pathname === '/api/user/profile' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const address = (body.address || '').toLowerCase();
        const name = (body.name || '').trim();
        const email = (body.email || '').trim();

        if (!address || !name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Address and name are required.' }));
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

    if (url.pathname === '/api/warden-check' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const command = body.command || body.actionText || '';
        const tool = body.tool || 'bash';
        const filepath = body.filepath || '';
        
        const evaluation = defaultWarden.evaluate({
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
            id: 'proj-' + (projects.length + 1),
            name: body.name || 'Untitled Project',
            description: body.description || '',
            createdAt: new Date().toISOString().slice(0, 10),
            chatCount: 0
          };
          projects.unshift(newProject);
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
            id: 'art-' + (artifacts.length + 1),
            title: body.title || 'Generated Artifact',
            type: body.type || 'code',
            language: body.language || 'javascript',
            code: body.code || '',
            createdAt: new Date().toISOString().slice(0, 10)
          };
          artifacts.unshift(newArtifact);
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
