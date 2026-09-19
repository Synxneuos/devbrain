import test from 'node:test';
import assert from 'node:assert';
import { MobileRunner } from '../src/core/mobile.js';

test('MobileRunner: device discovery returns virtual device fallback', async () => {
  const runner = new MobileRunner();
  const devices = await runner.listDevices();
  assert.ok(Array.isArray(devices));
  assert.ok(devices.length >= 1);
  const virtual = devices.find(d => d.id === 'pixel-8-virtual');
  assert.ok(virtual);
  assert.strictEqual(virtual.status, 'online');
});

test('MobileRunner: safe tap action executes and passes Agent Warden (AUTO_ALLOW)', async () => {
  const runner = new MobileRunner();
  const res = await runner.executeAction('pixel-8-virtual', { type: 'tap', x: 500, y: 1000 });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.verdict, 'AUTO_ALLOW');
  assert.ok(res.latencyMs >= 0);
  assert.ok(res.output.includes('500, 1000'));
});

test('MobileRunner: dangerous shell/root injection blocked by Agent Warden (BLOCKED_RISKY)', async () => {
  const runner = new MobileRunner();
  const res = await runner.executeAction('pixel-8-virtual', {
    type: 'type',
    text: 'su -c rm -rf /data/system'
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.blocked, true);
  assert.strictEqual(res.verdict, 'BLOCKED_RISKY');
  assert.ok(res.reason.includes('Destructive input payload'));
});

test('MobileRunner: screen state inspection returns foreground app and UI nodes', async () => {
  const runner = new MobileRunner();
  const state = await runner.getScreenState('pixel-8-virtual');
  assert.ok(state.foregroundPackage);
  assert.ok(Array.isArray(state.uiHierarchy));
  assert.strictEqual(state.uiHierarchy.length > 0, true);
});

test('MobileRunner: execution logs ring buffer records events', async () => {
  const runner = new MobileRunner();
  await runner.executeAction('pixel-8-virtual', { type: 'key', key: 'HOME' });
  const logs = runner.getLogs();
  assert.ok(logs.length >= 1);
  assert.strictEqual(logs[0].action, 'key');
});
