process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert';
import { wrapOpenAI, wrapFetch, JevSecurityError } from '../src/sdk/wrapper.js';
import { jevMiddleware } from '../src/sdk/middleware.js';
import { AgentWarden } from '../src/core/warden.js';
import { SemanticCache } from '../src/core/semantic-cache.js';

test('SDK wrapOpenAI: caches duplicate prompts and avoids duplicate execution', async () => {
  let callCount = 0;
  const mockClient = {
    chat: {
      completions: {
        create: async (params) => {
          callCount++;
          return {
            id: 'mock-1',
            choices: [{ message: { role: 'assistant', content: 'Cached result for: ' + params.messages[0].content } }]
          };
        }
      }
    }
  };

  const wrapped = wrapOpenAI(mockClient, { warden: false, cache: true });
  
  // Call 1: Miss
  const res1 = await wrapped.chat.completions.create({
    messages: [{ role: 'user', content: 'What is the capital of France?' }]
  });
  assert.strictEqual(callCount, 1);
  assert.strictEqual(res1.choices[0].message.content.includes('France'), true);

  // Call 2: Hit
  const res2 = await wrapped.chat.completions.create({
    messages: [{ role: 'user', content: 'What is the capital of France?' }]
  });
  assert.strictEqual(callCount, 1, 'Should not call original create on semantic cache hit');
  assert.strictEqual(res2._jev.cacheHit, true);
  assert.strictEqual(res2.choices[0].message.content, res1.choices[0].message.content);
});

test('SDK wrapOpenAI: intercepts and blocks destructive tool calls (BLOCKED_RISKY)', async () => {
  const mockClient = {
    chat: {
      completions: {
        create: async () => {
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      id: 'call_123',
                      type: 'function',
                      function: {
                        name: 'bash',
                        arguments: JSON.stringify({ command: 'rm -rf /data/system' })
                      }
                    }
                  ]
                }
              }
            ]
          };
        }
      }
    }
  };

  const wrapped = wrapOpenAI(mockClient, { failOnRisk: true, cache: false });

  await assert.rejects(
    async () => {
      await wrapped.chat.completions.create({
        messages: [{ role: 'user', content: 'Delete old temp data' }]
      });
    },
    (err) => {
      assert.ok(err instanceof JevSecurityError);
      assert.ok(err.message.includes('Agent Warden Blocked'));
      assert.strictEqual(err.evaluation.decision, 'BLOCKED_RISKY');
      return true;
    }
  );
});

test('SDK wrapOpenAI: allows safe tool calls and annotates _jevWarden', async () => {
  const mockClient = {
    chat: {
      completions: {
        create: async () => {
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      id: 'call_456',
                      type: 'function',
                      function: {
                        name: 'bash',
                        arguments: JSON.stringify({ command: 'git status' })
                      }
                    }
                  ]
                }
              }
            ]
          };
        }
      }
    }
  };

  const wrapped = wrapOpenAI(mockClient, { failOnRisk: true, cache: false });
  const res = await wrapped.chat.completions.create({
    messages: [{ role: 'user', content: 'Check git status' }]
  });

  const toolCall = res.choices[0].message.tool_calls[0];
  assert.ok(toolCall._jevWarden);
  assert.strictEqual(toolCall._jevWarden.decision, 'AUTO_ALLOW');
  assert.strictEqual(toolCall._jevWarden.passed, true);
});

test('SDK jevMiddleware: attaches triage metadata to requests', async () => {
  const middleware = jevMiddleware({ preset: 'inbox' });
  const req = {
    body: { text: 'URGENT: Database replication lag is critical!' }
  };
  const res = {};
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.ok(req.jev);
  assert.strictEqual(req.jev.action, 'AUTO_ACT');
  assert.strictEqual(req.jev.label, 'urgent');
  assert.ok(req.jev.latencyMs >= 0);
});

test('SDK jevMiddleware: blocks destructive payloads when warden is enabled', async () => {
  const middleware = jevMiddleware({ warden: true, blockRisky: true });
  const req = {
    body: { tool: 'bash', command: 'rm -rf /' }
  };
  let responseStatus = 0;
  let responseData = null;
  const res = {
    status: (code) => {
      responseStatus = code;
      return {
        json: (data) => {
          responseData = data;
        }
      };
    }
  };
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false, 'Next should not be called on blocked request');
  assert.strictEqual(responseStatus, 403);
  assert.ok(responseData.error.includes('Blocked by Jev Agent Warden'));
  assert.strictEqual(responseData.evaluation.decision, 'BLOCKED_RISKY');
});
