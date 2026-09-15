#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { JevBrain, PRESETS } from '../src/core/router.js';
import { AgentWarden } from '../src/core/warden.js';
import { startServer } from '../src/server.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

// ANSI colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const MAGENTA = '\x1b[35m';

function banner() {
  console.log(`
${CYAN}${BOLD}⚡ JEV BRAIN${RESET} ${GRAY}v1.0.0${RESET}
${MAGENTA}“Don't think. Route.”${RESET}
  `);
}

async function readAllStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    if (process.stdin.isTTY) {
      resolve('');
    }
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
  let port = 3333;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1], 10) || 3333;
  }
  startServer(port);
}

function showHelp() {
  banner();
  console.log(`${BOLD}Commands:${RESET}`);
  console.log(`  ${CYAN}brain classify <labels> [file]${RESET}    Batch route from stdin or file`);
  console.log(`  ${CYAN}brain route "<text>" [--preset]${RESET}    Single item instant routing decision`);
  console.log(`  ${CYAN}brain warden --tool <name> ...${RESET}     Coding agent 4-question safety gate`);
  console.log(`  ${CYAN}brain serve [--port 3333]${RESET}          Launch Web dashboard and REST API`);
  console.log(`\n${BOLD}Examples:${RESET}`);
  console.log(`  brain classify urgent,later,ignore < inbox.txt`);
  console.log(`  brain route "Server disk full emergency!" --preset inbox`);
  console.log(`  brain warden --tool bash --command "rm -rf /"`);
  console.log(`  brain serve --port 3333`);
}

switch (command) {
  case 'classify':
    handleClassify();
    break;
  case 'route':
    handleRoute();
    break;
  case 'warden':
    handleWarden();
    break;
  case 'serve':
    handleServe();
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    break;
}
