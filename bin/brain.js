#!/usr/bin/env node

import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { execSync } from 'node:child_process';
import { JevBrain, PRESETS } from '../src/core/router.js';
import { AgentWarden } from '../src/core/warden.js';
import { MobileRunner } from '../src/core/mobile.js';

const args = process.argv.slice(2);

const command = args[0] || 'help';

// ANSI colors & gradients (Hermes / Cortex Terminal styling)
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const UNDERLINE = '\x1b[4m';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const GRAY = '\x1b[90m';

// High-fidelity 256-color palette
const C_CYAN = '\x1b[38;5;51m';
const C_SKY = '\x1b[38;5;45m';
const C_BLUE = '\x1b[38;5;75m';
const C_PURPLE = '\x1b[38;5;141m';
const C_VIOLET = '\x1b[38;5;177m';
const C_PINK = '\x1b[38;5;201m';
const C_GOLD = '\x1b[38;5;220m';
const C_EMERALD = '\x1b[38;5;48m';
const C_MUTED = '\x1b[38;5;244m';

// Sleek White-to-Gray metallic gradient palette (monochrome minimal design)
const G_W1 = '\x1b[38;2;255;255;255m'; // Pure Crisp White (#FFFFFF)
const G_W2 = '\x1b[38;2;225;225;230m'; // Platinum Silver (#E1E1E6)
const G_W3 = '\x1b[38;2;185;185;195m'; // Light Steel Gray (#B9B9C3)
const G_W4 = '\x1b[38;2;145;145;155m'; // Medium Silver (#91919B)
const G_W5 = '\x1b[38;2;110;110;120m'; // Slate Gray (#6E6E78)
const G_W6 = '\x1b[38;2;80;80;90m';    // Deep Shadow Gray (#50505A)

const C_BOX = '\x1b[38;2;90;90;100m';
const C_TEXT = '\x1b[38;2;240;240;245m';
const C_DIM = '\x1b[38;2;140;140;150m';

function banner() {
  const gradientLines = [
    { text: '   ██╗███████╗██╗   ██╗    ██████╗ ██████╗   █████╗  ██╗███╗   ██╗', color: G_W1 },
    { text: '   ██║██╔════╝██║   ██║    ██╔══██╗██╔══██╗ ██╔══██╗ ██║████╗  ██║', color: G_W2 },
    { text: '   ██║█████╗  ██║   ██║    ██████╔╝██████╔╝ ███████║ ██║██╔██╗ ██║', color: G_W3 },
    { text: '██ ██║██╔══╝  ╚██╗ ██╔╝    ██╔══██╗██╔══██╗ ██╔══██║ ██║██║╚██╗██║', color: G_W4 },
    { text: '╚████║███████╗ ╚████╔╝     ██████╔╝██║  ██║ ██║  ██║ ██║██║ ╚████║', color: G_W5 },
    { text: ' ╚═══╝╚══════╝  ╚═══╝      ╚═════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝╚═╝  ╚═══╝', color: G_W6 },
  ];

  console.log();
  for (const line of gradientLines) {
    console.log(`${BOLD}${line.color}${line.text}${RESET}`);
  }
  console.log(`\n  ${C_BOX}┌────────────────────────────────────────────────────────────────────────┐${RESET}`);
  console.log(`  ${C_BOX}│${RESET}  ${BOLD}${C_TEXT}⚡ JEV BRAIN CLI${RESET} ${C_DIM}v1.0.0${RESET} · ${C_TEXT}Autonomous On-Chain AI Terminal${RESET}         ${C_BOX}│${RESET}`);
  console.log(`  ${C_BOX}│${RESET}  ${C_DIM}Contract:${RESET} ${C_TEXT}AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump${RESET}  ${C_DIM}(Solana SPL)${RESET}  ${C_BOX}│${RESET}`);
  console.log(`  ${C_BOX}│${RESET}  ${C_DIM}Official Hub:${RESET} ${C_TEXT}https://jevbrain.world${RESET} · ${C_DIM}“Don't think. Route.”${RESET}        ${C_BOX}│${RESET}`);
  console.log(`  ${C_BOX}└────────────────────────────────────────────────────────────────────────┘${RESET}\n`);
}

async function readAllStdin() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    let timer = setTimeout(() => resolve(''), 30);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      clearTimeout(timer);
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
  });
}

function renderBar(confidence) {
  const width = 12;
  const filled = Math.round(confidence * width);
  const empty = width - filled;
  const color = confidence >= 0.8 ? GREEN : YELLOW;
  return `${color}${'█'.repeat(filled)}${GRAY}${'░'.repeat(empty)}${RESET}`;
}

async function handleClassify() {
  const labelArg = args[1];
  const fileArg = args[2];

  let rawText = '';
  if (fileArg && !fileArg.startsWith('-')) {
    try {
      rawText = readFileSync(fileArg, 'utf8');
    } catch (e) {
      console.error(`${RED}Error reading file ${fileArg}:${RESET}`, e.message);
      process.exit(1);
    }
  } else {
    rawText = await readAllStdin();
  }

  if (!rawText.trim()) {
    console.log(`${YELLOW}No input provided via stdin or file.${RESET}`);
    console.log(`Usage:`);
    console.log(`  brain classify urgent,later,ignore < inbox.txt`);
    console.log(`  brain classify urgent,later,ignore inbox.txt`);
    process.exit(1);
  }

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const brain = new JevBrain();
  const results = await brain.batchRoute(lines, labelArg);

  banner();
  console.log(`${BOLD}Classifying ${lines.length} items with labels: [${CYAN}${labelArg || 'default'}${RESET}] (Threshold: 0.8)\n`);

  let autoActCount = 0;
  let reviewCount = 0;

  for (const res of results) {
    const isAuto = res.action === 'AUTO_ACT';
    if (isAuto) autoActCount++; else reviewCount++;

    const badge = isAuto 
      ? `${GREEN}${BOLD} AUTO_ACT   ${RESET}` 
      : `${YELLOW}${BOLD} REVIEW_REQ ${RESET}`;

    const scorePct = `${Math.round(res.confidence * 100)}%`.padStart(4);
    const labelStr = `[${CYAN}${res.label.toUpperCase()}${RESET}]`.padEnd(14);
    const bar = renderBar(res.confidence);
    const shortText = res.text.length > 55 ? res.text.slice(0, 52) + '...' : res.text;

    console.log(`${badge} ${bar} ${scorePct}  ${labelStr} ${shortText} ${GRAY}(${res.latencyMs}ms)${RESET}`);
  }

  console.log(`\n${BOLD}Summary:${RESET}`);
  console.log(`  ${GREEN}✔ Auto-routed (≥ 0.8):${RESET} ${autoActCount}`);
  console.log(`  ${YELLOW}⚠ Review Queue (< 0.8):${RESET} ${reviewCount}`);
  console.log(`  ${CYAN}⚡ Speed:${RESET} instant zero-cost local routing`);
}

async function handleRoute() {
  const text = args[1];
  if (!text) {
    console.error(`${RED}Usage: brain route "<text>" [--preset inbox|warden|attention|model-router]${RESET}`);
    process.exit(1);
  }

  let preset = 'inbox';
  const presetIdx = args.indexOf('--preset');
  if (presetIdx !== -1 && args[presetIdx + 1]) {
    preset = args[presetIdx + 1];
  }

  const brain = new JevBrain({ preset });
  const res = await brain.route(text);

  banner();
  console.log(`${BOLD}Input:${RESET}      ${res.text}`);
  console.log(`${BOLD}Preset:${RESET}     ${preset}`);
  console.log(`${BOLD}Route:${RESET}      ${CYAN}${BOLD}${res.label.toUpperCase()}${RESET}`);
  console.log(`${BOLD}Confidence:${RESET} ${renderBar(res.confidence)} ${Math.round(res.confidence * 100)}%`);
  console.log(`${BOLD}Decision:${RESET}   ${res.action === 'AUTO_ACT' ? `${GREEN}AUTO_ACT (Confidence ≥ 0.8)${RESET}` : `${YELLOW}REVIEW_QUEUE (Confidence < 0.8)${RESET}`}`);
  console.log(`${BOLD}Latency:${RESET}    ${res.latencyMs}ms`);
  console.log(`${BOLD}Reasoning:${RESET}  ${GRAY}${res.reason}${RESET}`);
}

async function handleWarden() {
  const toolIdx = args.indexOf('--tool');
  const cmdIdx = args.indexOf('--command');
  const pathIdx = args.indexOf('--path');

  const tool = toolIdx !== -1 ? args[toolIdx + 1] : 'bash';
  const command = cmdIdx !== -1 ? args[cmdIdx + 1] : (args[1] || 'git status');
  const filepath = pathIdx !== -1 ? args[pathIdx + 1] : '';

  const warden = new AgentWarden();
  const evaluation = warden.evaluate({ tool, command, filepath });

  banner();
  console.log(`${BOLD}Coding Agent Pre-Flight Check:${RESET}`);
  console.log(`  ${BOLD}Tool:${RESET}    ${tool}`);
  console.log(`  ${BOLD}Command:${RESET} ${command}`);
  if (filepath) console.log(`  ${BOLD}Path:${RESET}    ${filepath}`);

  const badge = evaluation.decision === 'AUTO_ALLOW' 
    ? `${GREEN}${BOLD}✔ ALLOWED (Safe)${RESET}`
    : evaluation.decision === 'NEEDS_CONFIRM'
    ? `${YELLOW}${BOLD}⚠ CONFIRMATION REQUIRED${RESET}`
    : `${RED}${BOLD}✖ BLOCKED (High Risk / Destructive)${RESET}`;

  console.log(`\n  ${BOLD}Gate:${RESET}    ${badge} (${evaluation.latencyMs}ms)`);
  console.log(`\n${BOLD}4 Pre-flight Questions:${RESET}`);
  console.log(`  1. Is this the right file?   ${evaluation.questions.is_right_file.ok ? `${GREEN}✔ Yes${RESET}` : `${RED}✖ No - ${evaluation.questions.is_right_file.reason}${RESET}`}`);
  console.log(`  2. Is this irreversible?     ${!evaluation.questions.is_irreversible.irreversible ? `${GREEN}✔ Safe${RESET}` : `${RED}✖ DANGER - ${evaluation.questions.is_irreversible.reason}${RESET}`}`);
  console.log(`  3. Are we looping?           ${!evaluation.questions.are_we_looping.looping ? `${GREEN}✔ No${RESET}` : `${YELLOW}⚠ Loop Detected (${evaluation.questions.are_we_looping.count}x)${RESET}`}`);
  console.log(`  4. Are we done?              ${evaluation.questions.are_we_done.done ? `${CYAN}✔ Done criteria met${RESET}` : `${GRAY}Ongoing${RESET}`}`);
}

async function handleServe() {
  let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1], 10) || port;
  }
  const { startServer } = await import('../src/server.js');
  startServer(port);
}

async function handleMobile() {
  const sub = args[1] || 'devices';
  const mobile = new MobileRunner();
  banner();

  if (sub === 'devices') {
    const devices = await mobile.listDevices();
    console.log(`${BOLD}Connected Android Devices & Gateways:${RESET}`);
    devices.forEach((d, i) => {
      console.log(`  [${i + 1}] ${GREEN}${BOLD}${d.name}${RESET} (ID: ${CYAN}${d.id}${RESET}) [${d.type}] Status: ${d.status}`);
    });
  } else if (sub === 'tap') {
    const x = parseInt(args[2], 10) || 540;
    const y = parseInt(args[3], 10) || 1200;
    console.log(`${BOLD}Executing Mobile Tap:${RESET} (${x}, ${y})`);
    const res = await mobile.executeAction('pixel-8-virtual', { type: 'tap', x, y });
    const badge = res.verdict === 'AUTO_ALLOW' ? `${GREEN}✔ AUTO_ALLOW${RESET}` : `${RED}✖ ${res.verdict}${RESET}`;
    console.log(`  Gate:   ${badge} (${res.latencyMs}ms)`);
    console.log(`  Output: ${res.output}`);
  } else if (sub === 'type') {
    const text = args.slice(2).join(' ') || 'Hello from Jev Brain';
    console.log(`${BOLD}Typing Input Stream:${RESET} "${text}"`);
    const res = await mobile.executeAction('pixel-8-virtual', { type: 'type', text });
    console.log(`  Gate:   ${GREEN}✔ ${res.verdict}${RESET} (${res.latencyMs}ms)`);
    console.log(`  Output: ${res.output}`);
  } else if (sub === 'inspect') {
    const state = await mobile.getScreenState('pixel-8-virtual');
    console.log(`${BOLD}Android Screen State Inspection:${RESET}`);
    console.log(`  Foreground: ${CYAN}${state.foregroundPackage}${RESET}`);
    console.log(`  Activity:   ${state.activity || 'N/A'}`);
    console.log(`  Battery:    ${state.batteryPct || 90}%`);
    console.log(`  UI Tree:    ${state.uiHierarchy ? state.uiHierarchy.length : 0} visible accessibility nodes`);
  } else {
    console.log(`${YELLOW}Unknown mobile subcommand:${RESET} ${sub}`);
    console.log(`Usage: brain mobile [devices | tap <x> <y> | type "<text>" | inspect]`);
  }
}

async function handleHook() {
  const sub = args[1] || 'check';
  const gitDir = path.join(process.cwd(), '.git');
  const hooksDir = path.join(gitDir, 'hooks');
  const hookFile = path.join(hooksDir, 'pre-commit');

  if (sub === 'install') {
    if (!fs.existsSync(gitDir)) {
      console.error(`${RED}Error: Not a git repository (.git directory not found).${RESET}`);
      process.exit(1);
    }
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookContent = `#!/bin/sh\n# Jev Agent Warden Pre-Commit Guard\nnode -e "import('./bin/brain.js').catch(() => import('jev-brain'))" hook check || npx --yes jev-brain hook check\n`;
    fs.writeFileSync(hookFile, hookContent, { mode: 0o755 });
    console.log(`${GREEN}✔ Jev Pre-Commit Hook installed successfully at .git/hooks/pre-commit${RESET}`);
    console.log(`Agent Warden will now automatically verify staged files before every git commit.`);
    return;
  }

  if (sub === 'uninstall') {
    if (fs.existsSync(hookFile)) {
      fs.unlinkSync(hookFile);
      console.log(`${YELLOW}✔ Jev Pre-Commit Hook uninstalled.${RESET}`);
    } else {
      console.log(`No pre-commit hook found at .git/hooks/pre-commit.`);
    }
    return;
  }

  if (sub === 'check') {
    try {
      const stagedOutput = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
      if (!stagedOutput) {
        process.exit(0);
      }
      const files = stagedOutput.split(/\r?\n/).filter(Boolean);
      const warden = new AgentWarden();
      const violations = [];

      for (const file of files) {
        const check = warden.checkTargetFile(file);
        if (!check.ok) {
          violations.push({ file, reason: check.reason });
        }
      }

      if (violations.length > 0) {
        console.error(`\n${RED}${BOLD}✖ COMMIT REJECTED BY JEV AGENT WARDEN${RESET}`);
        console.error(`${RED}Protected or sensitive files detected in staged git index:${RESET}\n`);
        violations.forEach(v => {
          console.error(`  ${RED}• ${v.file}${RESET} (${v.reason})`);
        });
        console.error(`\n${YELLOW}To unstage: git restore --staged <file>${RESET}\n`);
        process.exit(1);
      } else {
        console.log(`${GREEN}✔ Jev Agent Warden: All ${files.length} staged files verified safe.${RESET}`);
      }
    } catch (err) {
      // Pass through if not in git context or initial empty commit
    }
  }
}

async function handleAudit() {
  const targetDir = args[1] || '.';
  banner();
  console.log(`${BOLD}Scanning codebase for agent security, protected files, and destructive commands...${RESET}`);
  console.log(`Target: ${CYAN}${path.resolve(targetDir)}${RESET}\n`);

  const warden = new AgentWarden();
  const findings = [];
  let filesScanned = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.venv' || e.name === 'dist' || e.name === '.idea' || e.name === '.kilo') continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(targetDir, full);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        filesScanned++;
        const check = warden.checkTargetFile(rel);
        if (!check.ok) {
          findings.push({ type: 'PROTECTED_FILE', target: rel, severity: 'HIGH', reason: check.reason });
        }
        if (rel.endsWith('.sh') || rel.endsWith('.bat') || rel.endsWith('.js') || rel.endsWith('package.json')) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            const irrev = warden.checkIrreversible(content);
            if (irrev.irreversible) {
              findings.push({ type: 'DESTRUCTIVE_COMMAND', target: rel, severity: 'CRITICAL', reason: irrev.reason });
            }
          } catch {}
        }
      }
    }
  }

  try {
    walk(targetDir);
  } catch (err) {
    console.error(`${RED}Audit error:${RESET}`, err.message);
    process.exit(1);
  }

  console.log(`${BOLD}Scanned ${filesScanned} files.${RESET}\n`);
  if (findings.length === 0) {
    console.log(`${GREEN}${BOLD}✔ CLEAN REPOSITORY: No protected file leaks or unconstrained commands detected.${RESET}`);
  } else {
    console.log(`${RED}${BOLD}⚠ ${findings.length} Potential Security Concerns Detected:${RESET}`);
    findings.forEach((f, i) => {
      const color = f.severity === 'CRITICAL' ? RED : YELLOW;
      console.log(`  [${i + 1}] ${color}${BOLD}${f.severity}${RESET} [${f.type}] ${CYAN}${f.target}${RESET}`);
      console.log(`      ${GRAY}${f.reason}${RESET}`);
    });
  }
}

async function handleInit() {
  banner();
  console.log(`${BOLD}⚡ Initializing Jev Brain in current project...${RESET}\n`);
  const configPath = path.join(process.cwd(), '.jev.json');
  const defaultConfig = {
    version: '1.0.0',
    threshold: 0.8,
    warden: {
      protectedPatterns: ['.env', '*.pem', '*.key', 'id_rsa', '.git'],
      failOnRisk: true
    },
    routing: {
      defaultPreset: 'inbox'
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
  console.log(`${GREEN}✔ Created .jev.json configuration.${RESET}`);

  if (fs.existsSync(path.join(process.cwd(), '.git'))) {
    await handleHook();
  }

  console.log(`\n${BOLD}Next steps:${RESET}`);
  console.log(`  • Security audit:       ${CYAN}npx jev-brain audit${RESET}`);
  console.log(`  • Test pre-flight gate: ${CYAN}npx jevbrain warden --command "rm -rf /"${RESET}`);
  console.log(`  • Launch dashboard:     ${CYAN}npx jevbrain serve${RESET}\n`);
}

// ==========================================
// JEV BRAIN CLI & LOCAL AI CONFIGURATION
// ==========================================

const CONFIG_DIR = path.join(os.homedir(), '.jevbrain');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadCliConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return {
        endpoint: process.env.JEV_ENDPOINT || parsed.endpoint || 'https://jevbrain.world',
        apiKey: process.env.JEV_API_KEY || parsed.apiKey || ''
      };
    }
  } catch {}
  return {
    endpoint: process.env.JEV_ENDPOINT || 'https://jevbrain.world',
    apiKey: process.env.JEV_API_KEY || ''
  };
}

function saveCliConfig(cfg) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`${RED}Failed to save configuration:${RESET}`, err.message);
    return false;
  }
}

// Prompt a single line through an existing readline interface
function promptLine(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer)));
}

// Validate a jev_live_ API key against the backend (returns account + tier info)
async function validateApiKey(endpoint, apiKey) {
  try {
    const res = await fetch(`${endpoint}/api/keys/status`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.success === true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: `Could not reach server: ${err.message}` } };
  }
}

// Fetch live credit balance for the configured key
async function fetchCreditSummary(endpoint, apiKey) {
  try {
    const res = await fetch(`${endpoint}/api/credits/balance`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await res.json().catch(() => ({}));
    return data.success ? data : null;
  } catch {
    return null;
  }
}

// Interactive first-run onboarding: paste key from website, verify live, save & welcome
async function interactiveApiKeySetup(rl, cfg, maxAttempts = 3) {
  const endpoint = (cfg.endpoint || 'https://jevbrain.world').replace(/\/+$/, '');
  console.log(`  ${C_MUTED}┌────────────────────────────────────────────────────────────────────────┐${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${BOLD}${C_GOLD}🔑 Setup Required: Jev Brain Live API Key${RESET}                            ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}                                                                        ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  To use this terminal, connect your Solana wallet at:                  ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ➔  ${CYAN}${BOLD}${endpoint}/api-keys${RESET}                                            ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}                                                                        ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${CYAN}1.${RESET} Connect your Phantom / Solana wallet holding $JEVBRAIN tokens       ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${CYAN}2.${RESET} Generate your unique API key (${BOLD}jev_live_...${RESET})                      ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${CYAN}3.${RESET} Paste it below to unlock local terminal AI access                   ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}                                                                        ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${GRAY}* Whitelisted operator wallets can enter without holding tokens.${RESET}      ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}└────────────────────────────────────────────────────────────────────────┘${RESET}\n`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = (await promptLine(rl, `${BOLD}${C_CYAN}➤ Paste your API key (jev_live_...): ${RESET}`)).trim();
    if (!raw) {
      console.log(`${YELLOW}Empty input. Paste the full key copied from ${endpoint}/api-keys or type /exit to quit.${RESET}\n`);
      continue;
    }
    if (raw === '/exit' || raw === '/quit') return false;
    if (!raw.startsWith('jev_live_')) {
      console.log(`${YELLOW}⚠ Keys start with ${BOLD}jev_live_${RESET}${YELLOW}. Copy the complete key from your dashboard at ${endpoint}/api-keys and try again.${RESET}\n`);
      continue;
    }

    process.stdout.write(`${GRAY}Verifying key against ${endpoint}...${RESET} `);
    const check = await validateApiKey(endpoint, raw);
    if (!check.ok) {
      console.log(`${RED}✖${RESET}`);
      console.log(`${RED}✖ Key rejected (${check.status || 'network'}): ${check.data?.error || 'Invalid or revoked key'}${RESET}\n`);
      continue;
    }
    console.log(`${GREEN}✔${RESET}`);

    cfg.apiKey = raw;
    saveCliConfig(cfg);

    const d = check.data;
    console.log(`\n${GREEN}${BOLD}✔ API key verified & saved to ${CONFIG_FILE}${RESET}`);
    console.log(`  ${BOLD}Wallet:${RESET}   ${CYAN}${(d.walletAddress || '').slice(0, 6)}...${(d.walletAddress || '').slice(-4)}${RESET}`);
    console.log(`  ${BOLD}Tier:${RESET}     ${MAGENTA}[${d.tierName || 'Holder'}]${RESET} (Tier ${d.tierId || 0}) · ${GRAY}+${d.creditRatePerHour || 0} credits/hr${RESET}`);

    const summary = await fetchCreditSummary(endpoint, raw);
    if (summary) {
      console.log(`  ${BOLD}Credits:${RESET}  ${GREEN}${Number(summary.availableCredits || 0).toLocaleString()}${RESET} available\n`);
    } else {
      console.log('');
    }
    return true;
  }

  console.log(`${YELLOW}Too many failed attempts. Run ${CYAN}jevbrain config set-key <your-key>${RESET}${YELLOW} when you have a valid key.${RESET}\n`);
  return false;
}

async function handleConfig() {
  const sub = args[1];
  const val = args[2];
  const cfg = loadCliConfig();

  if (sub === 'set-key') {
    if (!val) {
      console.error(`${RED}Usage: jevbrain config set-key <jev_live_...>${RESET}`);
      process.exit(1);
    }
    if (!val.startsWith('jev_live_')) {
      console.warn(`${YELLOW}Note: Jev Brain API keys start with 'jev_live_'. Make sure you copied it from your dashboard at https://jevbrain.world.${RESET}`);
    }
    cfg.apiKey = val.trim();
    saveCliConfig(cfg);
    console.log(`${GREEN}✔ Jev Brain API key successfully saved to ${CONFIG_FILE}${RESET}`);
    console.log(`You can now run:`);
    console.log(`  ${CYAN}jevbrain "Write a python script to monitor Solana tokens"${RESET}`);
    console.log(`  ${CYAN}jevbrain chat${RESET}\n`);
    return;
  }

  if (sub === 'set-url' || sub === 'set-endpoint') {
    if (!val) {
      console.error(`${RED}Usage: jevbrain config set-url <url>${RESET}`);
      process.exit(1);
    }
    cfg.endpoint = val.trim().replace(/\/+$/, '');
    saveCliConfig(cfg);
    console.log(`${GREEN}✔ Jev Brain endpoint set to: ${cfg.endpoint}${RESET}`);
    return;
  }

  if (sub === 'get-key' || sub === 'show' || !sub) {
    banner();
    const masked = cfg.apiKey && cfg.apiKey.length > 16
      ? `${cfg.apiKey.slice(0, 13)}...${cfg.apiKey.slice(-4)}`
      : (cfg.apiKey || 'None configured');
    console.log(`${BOLD}Jev Brain CLI Configuration:${RESET}`);
    console.log(`  ${BOLD}Endpoint:${RESET}  ${CYAN}${cfg.endpoint || 'https://jevbrain.world'}${RESET}`);
    console.log(`  ${BOLD}API Key:${RESET}   ${GREEN}${masked}${RESET}`);
    console.log(`  ${BOLD}Config:${RESET}    ${GRAY}${CONFIG_FILE}${RESET}\n`);

    if (cfg.apiKey) {
      process.stdout.write(`${GRAY}Checking token holder status on-chain...${RESET} `);
      try {
        const res = await fetch(`${cfg.endpoint || 'https://jevbrain.world'}/api/credits/balance`, {
          headers: { 'Authorization': `Bearer ${cfg.apiKey}` }
        });
        const data = await res.json();
        if (data.success && data.eligibility) {
          console.log(`${GREEN}✔ Verified Token Holder${RESET}`);
          console.log(`  ${BOLD}Wallet:${RESET}    ${CYAN}${data.eligibility.walletAddress}${RESET}`);
          console.log(`  ${BOLD}Tier:${RESET}      ${MAGENTA}${data.eligibility.tier} (Level ${data.eligibility.tierLevel})${RESET}`);
          console.log(`  ${BOLD}Holding:${RESET}   ${data.eligibility.balanceUi} $JEVBRAIN`);
          console.log(`  ${BOLD}Credits:${RESET}   ${data.availableCredits} available\n`);
        } else {
          console.log(`${YELLOW}⚠ ${data.error || 'Unable to verify status'}${RESET}\n`);
        }
      } catch (e) {
        console.log(`${YELLOW}⚠ (Could not reach server: ${e.message})${RESET}\n`);
      }
    } else {
      console.log(`${YELLOW}No API key configured. Obtain your free key by connecting your Solana wallet at https://jevbrain.world${RESET}`);
      console.log(`Then configure it with: ${CYAN}npx jevbrain config set-key <your-key>${RESET}\n`);
    }
    return;
  }
}

async function streamAiResponse(prompt, model = 'auto') {
  const cfg = loadCliConfig();
  const apiKey = cfg.apiKey || process.env.JEV_API_KEY;
  const endpoint = (cfg.endpoint || process.env.JEV_ENDPOINT || 'https://jevbrain.world').replace(/\/+$/, '');

  if (!apiKey) {
    banner();
    console.error(`${RED}${BOLD}✖ No Jev Brain API Key Found${RESET}\n`);
    console.error(`${YELLOW}To use Jev Brain AI from your terminal, obtain your free API key for token holders:${RESET}`);
    console.error(`  1. Connect your Solana wallet at: ${CYAN}https://jevbrain.world${RESET}`);
    console.error(`  2. Open ${BOLD}Holder Hub ➔ Jev Brain CLI${RESET} and click 'Generate CLI Key'.`);
    console.error(`  3. Run in your terminal: ${CYAN}jevbrain config set-key <your-key>${RESET}\n`);
    process.exit(1);
  }

  try {
    const res = await fetch(`${endpoint}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ prompt, model })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error(`\n${RED}${BOLD}✖ Error (${res.status}):${RESET} ${errJson.error || res.statusText}\n`);
      if (res.status === 401 || res.status === 403) {
        console.error(`${YELLOW}Make sure your wallet holds the minimum $JEVBRAIN tokens at https://jevbrain.world${RESET}\n`);
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let metaInfo = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop();

      for (const block of lines) {
        const dataLine = block.split('\n').find(l => l.startsWith('data: '));
        if (dataLine) {
          try {
            const parsed = JSON.parse(dataLine.slice(6));
            if (parsed.token) {
              process.stdout.write(parsed.token);
            }
            if (parsed.done) {
              metaInfo = parsed;
            }
          } catch {}
        }
      }
    }

    process.stdout.write('\n');
    if (metaInfo && metaInfo.model) {
      const tierBadge = metaInfo.userTier?.tierName || 'Holder';
      console.log(`\n${GRAY}⚡ Model: ${metaInfo.model} · Tier: [${tierBadge}] · Latency: ${Math.round(metaInfo.latencyMs || 0)}ms${RESET}`);
      if (metaInfo.isCacheHit) {
        console.log(`${GRAY}💾 Semantic cache hit · 0 credits charged${RESET}`);
      } else {
        const cd = metaInfo.creditDeduction;
        if (cd && cd.creditsDeducted !== undefined) {
          console.log(`${GRAY}💳 Credits used: ${YELLOW}${cd.creditsDeducted}${GRAY} · Remaining balance: ${GREEN}${cd.availableCredits}${RESET}`);
        }
      }
    }
    return metaInfo;
  } catch (err) {
    console.error(`\n${RED}Connection error:${RESET}`, err.message);
    return null;
  }
}

async function handleStatus() {
  banner();
  const cfg = loadCliConfig();
  const apiKey = cfg.apiKey || process.env.JEV_API_KEY;
  const endpoint = (cfg.endpoint || process.env.JEV_ENDPOINT || 'https://jevbrain.world').replace(/\/+$/, '');

  if (!apiKey) {
    console.log(`${YELLOW}No API key configured.${RESET}`);
    console.log(`Connect your Solana wallet holding $JEVBRAIN tokens at: ${CYAN}https://jevbrain.world${RESET}`);
    console.log(`Then set your key with: ${CYAN}npx jevbrain config set-key <your-key>${RESET}\n`);
    return;
  }

  console.log(`${BOLD}Fetching Live On-Chain Holding & Tier Status...${RESET}\n`);
  try {
    const res = await fetch(`${endpoint}/api/keys/status`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`${RED}${BOLD}✖ Error (${res.status}):${RESET} ${err.error || res.statusText}\n`);
      return;
    }

    const data = await res.json();
    const isSuspended = data.keyStatus === 'suspended';
    const statusColor = isSuspended ? RED : GREEN;
    const statusText = isSuspended ? 'SUSPENDED (0 Tokens / Sold)' : 'ACTIVE';

    console.log(`${BOLD}Jev Brain CLI Account Status:${RESET}`);
    console.log(`  ${BOLD}Connected Wallet:${RESET}  ${CYAN}${data.walletAddress || 'Unknown'}${RESET}`);
    console.log(`  ${BOLD}Key Status:${RESET}        ${statusColor}${BOLD}${statusText}${RESET}`);
    if (data.suspensionReason) {
      console.log(`  ${BOLD}Suspension Note:${RESET}   ${YELLOW}${data.suspensionReason}${RESET}`);
    }
    console.log(`  ${BOLD}Tokens Held:${RESET}       ${BOLD}${Number(data.tokensHeld || 0).toLocaleString()} $JEVBRAIN${RESET}`);
    console.log(`  ${BOLD}Holding Tier:${RESET}      ${CYAN}[${data.tierName || 'Guest'}]${RESET} (Tier ${data.tierId || 0})`);
    console.log(`  ${BOLD}Credit Rate:${RESET}       ${GREEN}+${data.creditRatePerHour || 0} credits/hr${RESET}`);
    console.log(`  ${BOLD}Endpoint:${RESET}          ${GRAY}${endpoint}${RESET}`);

    console.log(`\n${BOLD}Permitted Models for your Tier:${RESET}`);
    if (data.allowedModels && data.allowedModels.length > 0) {
      if (data.allowedModels.includes('all')) {
        console.log(`  ${GREEN}✔ All 500+ Frontier & Open-Weight Models Unlocked (Dynasty Magnate VIP)${RESET}`);
      } else {
        for (const m of data.allowedModels) {
          console.log(`  ${GREEN}✔${RESET} ${m}`);
        }
      }
    } else {
      console.log(`  ${YELLOW}No models unlocked. Wallet holds 0 tokens.${RESET}`);
    }

    if (isSuspended) {
      console.log(`\n${YELLOW}⚠ Your API key is suspended because your wallet holds 0 tokens.${RESET}`);
      console.log(`Re-acquire $JEVBRAIN tokens at https://jevbrain.world to immediately reactivate.`);
    } else {
      console.log(`\n${GRAY}Run queries with: jevbrain "<prompt>" or jevbrain -m <model> "<prompt>"${RESET}`);
    }
    console.log();
  } catch (err) {
    console.error(`${RED}Failed to fetch account status:${RESET}`, err.message);
  }
}

async function handleModels() {
  banner();
  const cfg = loadCliConfig();
  const apiKey = cfg.apiKey || process.env.JEV_API_KEY;
  const endpoint = (cfg.endpoint || 'https://jevbrain.world').replace(/\/+$/, '');

  if (!apiKey) {
    console.log(`${YELLOW}No API key configured.${RESET}`);
    console.log(`Connect your Solana wallet holding $JEVBRAIN tokens at: ${CYAN}https://jevbrain.world/api-keys${RESET}`);
    console.log(`Then set your key with: ${CYAN}jevbrain config set-key <your-key>${RESET}\n`);
    return;
  }

  process.stdout.write(`${GRAY}Fetching unlocked AI models for your holding tier...${RESET} `);
  try {
    const res = await fetch(`${endpoint}/api/keys/status`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.log(`${RED}✖${RESET}`);
      const err = await res.json().catch(() => ({}));
      console.error(`${RED}${BOLD}✖ Error (${res.status}):${RESET} ${err.error || res.statusText}\n`);
      return;
    }

    console.log(`${GREEN}✔${RESET}\n`);
    const data = await res.json();
    const shortAddr = data.walletAddress ? `${data.walletAddress.slice(0, 6)}...${data.walletAddress.slice(-4)}` : 'Unknown';
    const tierName = data.tierName || 'Holder';

    console.log(`  ${C_MUTED}┌────────────────────────────────────────────────────────────────────────┐${RESET}`);
    console.log(`  ${C_MUTED}│${RESET}  ${BOLD}${C_CYAN}Permitted AI Models for Your Holding Tier${RESET}                             ${C_MUTED}│${RESET}`);
    console.log(`  ${C_MUTED}│${RESET}  ${GRAY}Wallet:${RESET} ${CYAN}${shortAddr}${RESET} · ${GRAY}Tier:${RESET} ${C_PURPLE}[${tierName}]${RESET} (Tier ${data.tierId || 0})               ${C_MUTED}│${RESET}`);
    console.log(`  ${C_MUTED}└────────────────────────────────────────────────────────────────────────┘${RESET}\n`);

    if (data.allowedModels && data.allowedModels.includes('all')) {
      console.log(`  ${C_EMERALD}${BOLD}✔ ALL 500+ Frontier, Reasoning, Coding & Open-Weight Models Unlocked!${RESET}`);
      console.log(`  ${GRAY}(Dynasty Magnate VIP tier has unrestricted access to all catalog models)${RESET}\n`);
      console.log(`  ${BOLD}Top Recommended Models for Development & Architecture:${RESET}`);
      console.log(`    ${CYAN}• anthropic/claude-3.7-sonnet${RESET}   ${GRAY}- SOTA Hybrid Reasoning & Architecture${RESET}`);
      console.log(`    ${CYAN}• anthropic/claude-3.5-haiku${RESET}    ${GRAY}- Ultra-low latency code execution & chat${RESET}`);
      console.log(`    ${CYAN}• openai/gpt-4o${RESET}                 ${GRAY}- Flagship multimodal intelligence${RESET}`);
      console.log(`    ${CYAN}• openai/o3-mini${RESET}                ${GRAY}- Mathematical & algorithm reasoning engine${RESET}`);
      console.log(`    ${CYAN}• deepseek/deepseek-chat${RESET}        ${GRAY}- DeepSeek V3 code intelligence & logic${RESET}`);
      console.log(`    ${CYAN}• meta-llama/llama-3.3-70b-instruct${RESET} ${GRAY}- Top open-weights powerhouse${RESET}`);
    } else if (data.allowedModels && data.allowedModels.length > 0) {
      console.log(`  ${BOLD}Available Models for [${tierName}]:${RESET}`);
      for (const m of data.allowedModels) {
        console.log(`    ${GREEN}✔${RESET} ${CYAN}${m}${RESET}`);
      }
    } else {
      console.log(`  ${YELLOW}No models unlocked. Wallet holds 0 tokens.${RESET}`);
      console.log(`  Acquire $JEVBRAIN tokens on Solana to unlock higher tiers.`);
    }

    console.log(`\n  ${GRAY}Single query: ${CYAN}jevbrain -m <model> "<prompt>"${RESET}`);
    console.log(`  ${GRAY}Switch inside chat: ${CYAN}/model <model>${RESET}\n`);
  } catch (err) {
    console.error(`${RED}Failed to query model list:${RESET}`, err.message);
  }
}

async function handleChat(initialModel = 'auto', opts = {}) {
  if (!opts.skipBanner) banner();
  const cfg = loadCliConfig();
  const endpoint = (cfg.endpoint || 'https://jevbrain.world').replace(/\/+$/, '');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${BOLD}${C_CYAN}jevbrain${RESET}${C_MUTED}❯${RESET} `
  });

  // First-run onboarding: paste the key copied from the website, verify live, save.
  if (!cfg.apiKey && !process.env.JEV_API_KEY) {
    const ready = await interactiveApiKeySetup(rl, cfg);
    if (!ready) {
      rl.close();
      return;
    }
  }

  const apiKey = cfg.apiKey || process.env.JEV_API_KEY;
  let activeModel = initialModel;

  // Live key validation on entry
  const check = await validateApiKey(endpoint, apiKey);
  if (!check.ok) {
    console.log(`${RED}${BOLD}✖ API Key Rejected or Expired (${check.status}):${RESET} ${check.data?.error || 'Invalid API key'}`);
    console.log(`${YELLOW}Please generate an active key at ${endpoint}/api-keys and run:${RESET}`);
    console.log(`  ${CYAN}jevbrain config set-key <new-key>${RESET}\n`);
    rl.close();
    return;
  }

  const d = check.data;
  const shortAddr = d.walletAddress ? `${d.walletAddress.slice(0, 6)}...${d.walletAddress.slice(-4)}` : 'Unknown';
  const tierName = d.tierName || 'Holder';

  if (d.keyStatus === 'suspended') {
    console.log(`  ${RED}${BOLD}✖ API Key Suspended:${RESET} ${YELLOW}${d.suspensionReason || '0 tokens held (sold/transferred)'}${RESET}`);
    console.log(`  ${GRAY}Re-acquire $JEVBRAIN tokens on Solana to immediately reactivate.${RESET}\n`);
    rl.close();
    return;
  }

  const startSummary = await fetchCreditSummary(endpoint, apiKey);
  const availCredits = startSummary ? Number(startSummary.availableCredits || 0).toLocaleString() : 'Active';

  console.log(`  ${C_MUTED}┌────────────────────────────────────────────────────────────────────────┐${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${BOLD}${C_CYAN}⚡ Jev Brain Interactive Terminal Chat${RESET}                                ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${GRAY}Wallet:${RESET} ${CYAN}${shortAddr}${RESET} · ${GRAY}Tier:${RESET} ${C_PURPLE}[${tierName}]${RESET} (Tier ${d.tierId || 0})               ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${GRAY}Credits:${RESET} ${C_EMERALD}${availCredits} available${RESET} ${GRAY}(+${d.creditRatePerHour || 0}/hr)${RESET} · ${GRAY}Model:${RESET} ${C_CYAN}[${activeModel}]${RESET}         ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}│${RESET}  ${GRAY}Commands: ${CYAN}/help${GRAY}, ${CYAN}/models${GRAY}, ${CYAN}/model <name>${GRAY}, ${CYAN}/balance${GRAY}, ${CYAN}/clear${GRAY}, ${CYAN}/exit${RESET}     ${C_MUTED}│${RESET}`);
  console.log(`  ${C_MUTED}└────────────────────────────────────────────────────────────────────────┘${RESET}\n`);

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === '/exit' || input === 'exit' || input === 'quit' || input === '/quit') {
      rl.close();
      return;
    }
    if (input === '/clear' || input === 'clear') {
      console.clear();
      banner();
      console.log(`  ${C_MUTED}┌────────────────────────────────────────────────────────────────────────┐${RESET}`);
      console.log(`  ${C_MUTED}│${RESET}  ${BOLD}${C_CYAN}⚡ Jev Brain Interactive Terminal Chat${RESET} · Active Model: ${C_CYAN}[${activeModel}]${RESET}        ${C_MUTED}│${RESET}`);
      console.log(`  ${C_MUTED}└────────────────────────────────────────────────────────────────────────┘${RESET}\n`);
      rl.prompt();
      return;
    }
    if (input === '/help') {
      console.log(`\n${BOLD}Interactive Terminal Commands:${RESET}`);
      console.log(`  ${CYAN}/models${RESET}              List permitted AI models for your holding tier`);
      console.log(`  ${CYAN}/model <name>${RESET}        Switch active model (e.g. /model deepseek/deepseek-chat)`);
      console.log(`  ${CYAN}/balance | /credits${RESET}  Check live credit balance and accrual rate`);
      console.log(`  ${CYAN}/status | /tier${RESET}      Show on-chain token holding and tier details`);
      console.log(`  ${CYAN}/key${RESET}                 Show active configured API key`);
      console.log(`  ${CYAN}/clear${RESET}               Clear terminal screen`);
      console.log(`  ${CYAN}/exit${RESET}                Exit chat session\n`);
      rl.prompt();
      return;
    }
    if (input === '/models') {
      rl.pause();
      await handleModels();
      rl.resume();
      rl.prompt();
      return;
    }
    if (input.startsWith('/model ') || input === '/model') {
      const newModel = input.slice(7).trim();
      if (newModel) {
        activeModel = newModel;
        console.log(`${GREEN}✔ Active model switched to: [${CYAN}${activeModel}${GREEN}]${RESET}\n`);
      } else {
        console.log(`${GRAY}Current active model: [${CYAN}${activeModel}${GRAY}]. To change: ${CYAN}/model <model-name>${RESET}\n`);
      }
      rl.prompt();
      return;
    }
    if (input === '/credits' || input === '/balance') {
      rl.pause();
      const summary = await fetchCreditSummary(endpoint, cfg.apiKey || process.env.JEV_API_KEY);
      if (summary) {
        console.log(`\n  ${BOLD}💳 Credit Balance:${RESET} ${C_EMERALD}${BOLD}${Number(summary.availableCredits || 0).toLocaleString()}${RESET} credits available`);
        if (summary.eligibility) {
          console.log(`  ${GRAY}Accrual Rate: +${summary.eligibility.creditRatePerHour || 0} credits/hr · Tier: [${summary.eligibility.tier || 'Holder'}]${RESET}\n`);
        } else {
          console.log('');
        }
      } else {
        console.log(`${YELLOW}Could not fetch credit balance. Check your connection or key with /status.${RESET}\n`);
      }
      rl.resume();
      rl.prompt();
      return;
    }
    if (input === '/status' || input === '/tier') {
      rl.pause();
      await handleStatus();
      rl.resume();
      rl.prompt();
      return;
    }
    if (input === '/key') {
      const activeKey = cfg.apiKey || process.env.JEV_API_KEY || 'None';
      const masked = activeKey.length > 16 ? `${activeKey.slice(0, 13)}...${activeKey.slice(-4)}` : activeKey;
      console.log(`\n  ${BOLD}Active API Key:${RESET} ${C_CYAN}${masked}${RESET}`);
      console.log(`  ${GRAY}Endpoint:${RESET}       ${endpoint}`);
      console.log(`  ${GRAY}Config File:${RESET}    ${CONFIG_FILE}\n`);
      rl.prompt();
      return;
    }

    rl.pause();
    await streamAiResponse(input, activeModel);
    console.log();
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n  ${C_PURPLE}${BOLD}“Don't think. Route.”${RESET}\n`);
    process.exit(0);
  });
}

function showHelp() {
  banner();
  console.log(`${BOLD}AI & Terminal Commands:${RESET}`);
  console.log(`  ${CYAN}jevbrain${RESET}                            Start interactive terminal AI chat session`);
  console.log(`  ${CYAN}jevbrain "<prompt>"${RESET}                   Run AI query directly with streaming output`);
  console.log(`  ${CYAN}jevbrain -m <model> "<prompt>"${RESET}        Run AI query with a specific tier-allowed model`);
  console.log(`  ${CYAN}jevbrain chat [-m <model>]${RESET}            Start interactive terminal AI chat session`);
  console.log(`  ${CYAN}jevbrain models${RESET}                       List permitted AI models for your holding tier`);
  console.log(`  ${CYAN}jevbrain status | tier${RESET}                Show live on-chain token holding, tier, and models`);
  console.log(`  ${CYAN}jevbrain balance | credits${RESET}            Check live credit balance and emissions`);
  console.log(`  ${CYAN}jevbrain config set-key <key>${RESET}         Configure your Jev Brain API key (jev_live_...)`);
  console.log(`  ${CYAN}jevbrain config get-key${RESET}               Show active key and check on-chain token tier`);
  console.log(`  ${CYAN}jevbrain config set-url <url>${RESET}         Point CLI to custom backend URL`);
  console.log(`\n${BOLD}Safety & Routing Commands:${RESET}`);
  console.log(`  ${CYAN}jevbrain init${RESET}                         Setup .jev.json config and pre-commit hook`);
  console.log(`  ${CYAN}jevbrain hook [install|uninstall|check]${RESET}  Git pre-commit safety firewall hook`);
  console.log(`  ${CYAN}jevbrain audit [dir]${RESET}                  Scan codebase for secrets and destructive commands`);
  console.log(`  ${CYAN}jevbrain warden --tool <name> ...${RESET}     Coding agent 4-question pre-flight safety gate`);
  console.log(`  ${CYAN}jevbrain route "<text>" [--preset]${RESET}    Single item instant routing decision (<1ms)`);
  console.log(`  ${CYAN}jevbrain classify <labels> [file]${RESET}    Batch route from stdin or file`);
  console.log(`  ${CYAN}jevbrain mobile [subcommand]${RESET}          Android device gateway (devices, tap, type, inspect)`);
  console.log(`  ${CYAN}jevbrain serve [--port 3333]${RESET}          Launch Web dashboard and REST API`);
  console.log(`\n${BOLD}Examples:${RESET}`);
  console.log(`  jevbrain`);
  console.log(`  jevbrain "Write a python script to check Solana token balances"`);
  console.log(`  jevbrain -m deepseek/deepseek-chat "Review this architecture"`);
  console.log(`  jevbrain status`);
  console.log(`  jevbrain models`);
  console.log(`  cat src/server.js | jevbrain "Audit this code for security vulnerabilities"`);
  console.log(`  git diff | jevbrain "Write a detailed conventional git commit message"`);
  console.log(`  jevbrain config set-key jev_live_xxxxxxxxxxxxxxxx`);
  console.log();
}

async function main() {
  // Parse global -m / --model flags
  let requestedModel = 'auto';
  let cleanArgs = [...args];
  const modelFlagIdx = cleanArgs.findIndex(a => a === '-m' || a === '--model');
  if (modelFlagIdx !== -1 && cleanArgs[modelFlagIdx + 1]) {
    requestedModel = cleanArgs[modelFlagIdx + 1];
    cleanArgs.splice(modelFlagIdx, 2);
  }

  // Bare `jevbrain` in a terminal opens the interactive AI session (banner + key setup + chat).
  // Bare `jevbrain` with piped stdin streams the piped text as one prompt.
  let primaryCommand = cleanArgs[0];
  if (!primaryCommand) {
    primaryCommand = process.stdin.isTTY ? 'chat' : 'stdin-prompt';
  }

  switch (primaryCommand) {
    case 'config':
      await handleConfig();
      break;
    case 'status':
    case 'tier':
      await handleStatus();
      break;
    case 'models':
      await handleModels();
      break;
    case 'balance':
    case 'credits': {
      banner();
      const cfg = loadCliConfig();
      const endpoint = (cfg.endpoint || 'https://jevbrain.world').replace(/\/+$/, '');
      const summary = await fetchCreditSummary(endpoint, cfg.apiKey || process.env.JEV_API_KEY);
      if (summary) {
        console.log(`  ${BOLD}💳 Credit Balance:${RESET} ${C_EMERALD}${BOLD}${Number(summary.availableCredits || 0).toLocaleString()}${RESET} credits available`);
        if (summary.eligibility) {
          console.log(`  ${GRAY}Accrual Rate: +${summary.eligibility.creditRatePerHour || 0} credits/hr · Tier: [${summary.eligibility.tier || 'Holder'}]${RESET}\n`);
        }
      } else {
        console.log(`  ${YELLOW}Could not fetch credit balance. Run jevbrain status or check your key.${RESET}\n`);
      }
      break;
    }
    case 'chat':
      await handleChat(requestedModel);
      break;
    case 'stdin-prompt': {
      const stdinData = await readAllStdin();
      if (stdinData.trim()) {
        await streamAiResponse(stdinData, requestedModel);
      } else {
        showHelp();
      }
      break;
    }
    case 'init':
      await handleInit();
      break;
    case 'hook':
      await handleHook();
      break;
    case 'audit':
      await handleAudit();
      break;
    case 'classify':
      await handleClassify();
      break;
    case 'route':
      await handleRoute();
      break;
    case 'warden':
      await handleWarden();
      break;
    case 'mobile':
      await handleMobile();
      break;
    case 'serve':
      await handleServe();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (cleanArgs.length > 0) {
        let promptText = cleanArgs.join(' ');
        const stdinData = await readAllStdin();
        if (stdinData) {
          promptText = `${promptText}\n\nInput Context:\n\`\`\`\n${stdinData}\n\`\`\``;
        }
        await streamAiResponse(promptText, requestedModel);
      } else {
        showHelp();
      }
      break;
  }
}

main().catch(err => {
  console.error(`${RED}Fatal error:${RESET}`, err.message);
  process.exit(1);
});

