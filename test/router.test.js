import assert from 'node:assert';
import { JevBrain } from '../src/core/router.js';
import { AgentWarden } from '../src/core/warden.js';

async function runTests() {
  console.log('🧪 Running Jev Brain Verification Suite...\n');

  // Test 1: Fast routing with high confidence
  {
    const brain = new JevBrain({ preset: 'inbox' });
    const res = await brain.route('URGENT: Production database connection pool exhausted');
    assert.strictEqual(res.label, 'urgent');
    assert(res.confidence >= 0.80, `Expected confidence >= 0.8, got ${res.confidence}`);
    assert.strictEqual(res.action, 'AUTO_ACT');
    assert(res.latencyMs < 50, `Expected latency < 50ms, got ${res.latencyMs}ms`);
    console.log(`✔ Test 1 passed: High confidence inbox urgent routing (${res.latencyMs}ms, ${Math.round(res.confidence * 100)}%)`);
  }

  // Test 2: Low confidence routed to review queue (< 0.8)
  {
    const brain = new JevBrain({ preset: 'inbox' });
    const res = await brain.route('Can you quickly take a look at this document whenever you get time?');
    assert(res.confidence < 0.80, `Expected confidence < 0.8 for ambiguous text, got ${res.confidence}`);
    assert.strictEqual(res.action, 'REVIEW_QUEUE');
    console.log(`✔ Test 2 passed: Low confidence fallback to REVIEW_QUEUE (${res.confidence})`);
  }

  // Test 3: Coding Agent Warden blocks destructive commands
  {
    const warden = new AgentWarden();
    const res = warden.evaluate({ tool: 'bash', command: 'rm -rf /' });
    assert.strictEqual(res.decision, 'BLOCKED_RISKY');
    assert.strictEqual(res.color, 'RED');
    assert.strictEqual(res.passed, false);
    console.log(`✔ Test 3 passed: Destructive rm -rf blocked by warden (${res.decision})`);
  }

  // Test 4: Coding Agent Warden catches loop repetition
  {
    const warden = new AgentWarden({ loopThreshold: 3 });
    warden.evaluate({ tool: 'bash', command: 'npm test' });
    warden.evaluate({ tool: 'bash', command: 'npm test' });
    const res3 = warden.evaluate({ tool: 'bash', command: 'npm test' });
    assert.strictEqual(res3.decision, 'NEEDS_CONFIRM');
    assert.strictEqual(res3.color, 'YELLOW');
    assert.strictEqual(res3.questions.are_we_looping.looping, true);
    console.log(`✔ Test 4 passed: Agent looping repetition detected (${res3.decision})`);
  }

  // Test 5: Safe read allowed
  {
    const warden = new AgentWarden();
    const res = warden.evaluate({ tool: 'view_file', filepath: 'src/index.js' });
    assert.strictEqual(res.decision, 'AUTO_ALLOW');
    assert.strictEqual(res.color, 'GREEN');
    console.log(`✔ Test 5 passed: Safe read permitted (${res.decision})`);
  }

  console.log('\n🎉 All 5 test suites passed successfully!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
