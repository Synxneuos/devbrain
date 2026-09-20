#!/usr/bin/env node

import fs from 'node:fs';
import { AgentWarden } from '../src/core/warden.js';

const command = process.env['INPUT_COMMAND'] || process.env['INPUT_CMD'] || '';
const filepath = process.env['INPUT_FILEPATH'] || process.env['INPUT_PATH'] || '';
const tool = process.env['INPUT_TOOL'] || 'bash';
const failOnRisk = (process.env['INPUT_FAIL-ON-RISK'] || process.env['INPUT_FAIL_ON_RISK'] || 'true') !== 'false';

const warden = new AgentWarden();
const evaluation = warden.evaluate({ tool, command, filepath });

console.log(`\n⚡ JEV AGENT WARDEN — Pre-Execution CI Firewall`);
console.log(`───────────────────────────────────────────────`);
console.log(`  Decision:   ${evaluation.decision} (${evaluation.color})`);
console.log(`  Latency:    ${evaluation.latencyMs}ms`);
console.log(`  Tool:       ${tool}`);
if (command) console.log(`  Command:    ${command}`);
if (filepath) console.log(`  File:       ${filepath}`);
console.log(`\n4 Questions Audit:`);
console.log(`  1. Is this the right file?   ${evaluation.questions.is_right_file.ok ? '✔ Safe' : '✖ Protected Violation'}`);
console.log(`  2. Is this irreversible?     ${!evaluation.questions.is_irreversible.irreversible ? '✔ Safe' : '✖ High Danger'}`);
console.log(`  3. Are we looping?           ${!evaluation.questions.are_we_looping.looping ? '✔ Safe' : '⚠ Loop Warning'}`);
console.log(`  4. Are we done?              ${evaluation.questions.are_we_done.done ? '✔ Done Criteria Met' : 'Ongoing'}`);

if (process.env.GITHUB_OUTPUT) {
  try {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `decision=${evaluation.decision}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `color=${evaluation.color}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `passed=${evaluation.passed}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `latency=${evaluation.latencyMs}\n`);
  } catch (e) {
    // Non-fatal if not in action context
  }
}

if (evaluation.decision === 'BLOCKED_RISKY') {
  const msg = evaluation.reasons?.join('; ') || 'Protected path or destructive command detected';
  console.log(`::error title=Agent Warden Blocked::${msg}`);
  if (failOnRisk) {
    console.error(`\n❌ Action failed: High-risk agent execution blocked by Jev Agent Warden.`);
    process.exit(1);
  }
} else if (evaluation.decision === 'NEEDS_CONFIRM') {
  console.log(`::warning title=Agent Warden Review Required::Potential loop or unverified action.`);
} else {
  console.log(`::notice title=Agent Warden Passed::Safe operation verified (<1ms).`);
}
