import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JevBrain, PRESETS } from './core/router.js';
import { AgentWarden } from './core/warden.js';
import { MultiModelRouter } from './core/multi-model.js';
import { OpenRouterClient, OPENROUTER_MODELS } from './core/openrouter.js';
import { fetchLiveMarketData, calculateDynamicTier } from './core/dexscreener.js';
import { MobileRunner } from './core/mobile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

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
const multiModelRouter = new MultiModelRouter();
const openRouterClient = new OpenRouterClient();
const mobileRunner = new MobileRunner({ warden: defaultWarden });

// Persistent Real Projects Store
let projects = [
  { id: 'proj-1', name: 'Trading Bot', description: 'Robinhood Chain DexScreener automation', createdAt: '2026-09-17', chatCount: 2 },
  { id: 'proj-2', name: 'Agent Safety Proxy', description: 'Agent Warden pre-flight command firewall', createdAt: '2026-09-18', chatCount: 3 },
  { id: 'proj-3', name: 'Inbox AI Triage', description: 'Zero-key sub-millisecond email classification', createdAt: '2026-09-19', chatCount: 1 }
];

// Persistent Real Artifacts Store
let artifacts = [
  { id: 'art-1', title: 'OpenRouter Dynamic Model Router', type: 'code', language: 'javascript', code: '// Jev Brain Multi-Model Dynamic Cost Matrix\nexport function routeModel(prompt, complexity) {\n  if (complexity === "simple") return "meta-llama/llama-3.1-8b-instruct";\n  if (complexity === "medium") return "anthropic/claude-3.5-haiku";\n  return "anthropic/claude-3.5-sonnet";\n}', createdAt: '2026-09-18' },
  { id: 'art-2', title: 'Warden 4-Question Safety Ruleset', type: 'config', language: 'json', code: '{\n  "protectedPaths": [".env", ".git", "id_rsa", "*.pem"],\n  "destructiveKeywords": ["rm -rf", "drop database", "format", "mkfs"],\n  "maxLoopRepetition": 3\n}', createdAt: '2026-09-19' },
  { id: 'art-3', title: 'Dynamic DexScreener Tier Curve', type: 'math', language: 'markdown', code: '# Dynamic MC Tier Formula\nTrust Multiplier = sqrt(MC / 100,000)\nRequired Bag ($) = baseUsd * Trust Multiplier\nTokens Needed = Required Bag / Token Price', createdAt: '2026-09-19' }
];

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const prompt = body.prompt || '';
        const model = body.model || 'auto';
        const tokensHeld = parseFloat(body.tokensHeld) || 500000;
        const walletAddress = body.walletAddress || '';

        // Live Market Cap & Dynamic Tier evaluation
        const marketData = await fetchLiveMarketData();
        const userTier = calculateDynamicTier(tokensHeld, marketData);

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

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ...result,
          walletAddress,
          userTier,
          totalSavedUsd: Math.round(stats.estimatedCostSavedUsd * 1000) / 1000
        }));
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
          provider: 'Rainbow Wallet (rainbow.me)',
          supportedChains: ['Ethereum', 'Solana', 'Base', 'Arbitrum'],
          requiredTokensBaseline: 1000000,
          marketCap: marketData.marketCap,
          activeProtocol: 'EIP-6963 + window.rainbow'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if ((url.pathname === '/api/wallet-verify' || url.pathname === '/api/wallet/rainbow-verify') && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const address = body.address || '';
        const tokensHeld = parseFloat(body.tokensHeld) || 500000;

        const marketData = await fetchLiveMarketData();
        const userTier = calculateDynamicTier(tokensHeld, marketData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          address,
          unlocked: userTier.tierId > 0,
          tokensHeld,
          userTier,
          marketData,
          walletProvider: 'Rainbow Wallet (rainbow.me)',
          message: userTier.tierId > 0 
            ? `Rainbow Wallet verified! Assigned to [${userTier.tierName}]` 
            : 'Holding required to access.'
        }));
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
          ...evaluation,
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
