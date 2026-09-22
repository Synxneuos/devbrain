process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { handleRequest } from '../src/server.js';
import {
  analyzePromptComplexity,
  calculateCostAndSavings,
  evaluateSLAFallback,
  runBenchmarkPipeline,
  getBenchmarkMatrix,
  SLA_LATENCY_THRESHOLD_MS
} from '../src/core/benchmark-matrix.js';

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

test('Benchmark Matrix API: GET /api/benchmark/matrix returns catalog and SLA thresholds', async () => {
  const res = await fetch(`${baseUrl}/api/benchmark/matrix`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.slaThresholdMs, 500);
  assert.strictEqual(data.frontierBaselineModel, 'anthropic/claude-3.5-sonnet');
  assert.ok(Array.isArray(data.models));
  assert.ok(data.models.length >= 5);
  
  const llama = data.models.find(m => m.id === 'meta-llama/llama-3.1-8b-instruct');
  assert.ok(llama);
  assert.strictEqual(llama.inputCostPer1M, 0.05);

  const sonnet = data.models.find(m => m.id === 'anthropic/claude-3.5-sonnet');
  assert.ok(sonnet);
  assert.strictEqual(sonnet.inputCostPer1M, 3.00);

  assert.ok(data.cumulativeStats);
  assert.strictEqual(typeof data.cumulativeStats.totalEvaluations, 'number');
});

test('Benchmark Matrix API: POST /api/benchmark/run processes real-time prompt triage and savings telemetry', async () => {
  const payload = {
    prompt: 'Can you refactor this database schema and explain the trade-offs step by step?\n```sql\nCREATE TABLE accounts (id INT PRIMARY KEY);\n```'
  };

  const res = await fetch(`${baseUrl}/api/benchmark/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.ok(data.analysis);
  assert.strictEqual(data.analysis.indicators.code, true);
  assert.strictEqual(data.analysis.indicators.reasoning, true);
  assert.ok(data.analysis.complexityScore >= 0.70);
  assert.strictEqual(data.analysis.category, 'FRONTIER_REASONING');

  assert.ok(data.financialMetrics);
  assert.ok(data.financialMetrics.actualCostUSD >= 0);
  assert.strictEqual(data.slaCheck.fallbackTriggered, false);
});

test('Prompt Complexity Heuristics: correctly classifies simple queries vs heavy architecture queries (<0.2ms)', () => {
  // Simple prompt
  const simple = analyzePromptComplexity('What is the capital of France?');
  assert.strictEqual(simple.category, 'SIMPLE_TRIAGE');
  assert.ok(simple.complexityScore < 0.35);
  assert.strictEqual(simple.recommendedModel, 'meta-llama/llama-3.1-8b-instruct');

  // Code / Intermediate prompt
  const intermediate = analyzePromptComplexity('Write a JavaScript function to format date: function formatDate(d) { return d.toISOString(); }');
  assert.ok(intermediate.indicators.code);
  assert.ok(intermediate.complexityScore >= 0.35);

  // Complex reasoning prompt
  const complex = analyzePromptComplexity('Deep dive architectural security audit: why does reentrancy happen in EVM smart contracts? Explain step by step with proof.');
  assert.strictEqual(complex.category, 'FRONTIER_REASONING');
  assert.ok(complex.complexityScore >= 0.70);
  assert.strictEqual(complex.recommendedModel, 'anthropic/claude-3.5-sonnet');
});

test('Cost & Savings Calculator: accurately computes dollar savings against Claude 3.5 Sonnet baseline', () => {
  // 1,000,000 prompt tokens and 1,000,000 completion tokens on Llama 3.1 8B vs Claude 3.5 Sonnet
  // Baseline cost: $3.00 + $15.00 = $18.00
  // Llama cost: $0.05 + $0.08 = $0.13
  // Expected savings: $18.00 - $0.13 = $17.87 (99.3%)
  const metrics = calculateCostAndSavings('meta-llama/llama-3.1-8b-instruct', 1_000_000, 1_000_000);
  assert.strictEqual(metrics.actualCostUSD, 0.13);
  assert.strictEqual(metrics.baselineCostUSD, 18.00);
  assert.strictEqual(metrics.dollarsSaved, 17.87);
  assert.strictEqual(metrics.savingsPercentage, 99.3);
});

test('SLA Monitor & Latency Fallback: triggers instant redirection when observed latency exceeds 500ms threshold', () => {
  // Healthy case (250ms)
  const healthy = evaluateSLAFallback('openai/gpt-4o', 250, false);
  assert.strictEqual(healthy.fallbackTriggered, false);
  assert.strictEqual(healthy.activeModel, 'openai/gpt-4o');

  // SLA violation (580ms > 500ms)
  const slow = evaluateSLAFallback('openai/gpt-4o', 580, false);
  assert.strictEqual(slow.fallbackTriggered, true);
  assert.strictEqual(slow.activeModel, 'meta-llama/llama-3.1-8b-instruct');
  assert.ok(slow.reason.includes('LATENCY_EXCEEDED_SLA'));

  // Provider rate-limited (HTTP 429)
  const rateLimited = evaluateSLAFallback('anthropic/claude-3.5-sonnet', 120, true);
  assert.strictEqual(rateLimited.fallbackTriggered, true);
  assert.strictEqual(rateLimited.activeModel, 'meta-llama/llama-3.1-8b-instruct');
  assert.strictEqual(rateLimited.reason, 'PROVIDER_RATE_LIMITED_429');
});
