import test from 'node:test';
import assert from 'node:assert';
import { MobileRunner } from '../src/core/mobile.js';

test('MobileRunner: device discovery reports only connected ADB devices', async () => {
  const runner = new MobileRunner();
  const devices = await runner.listDevices();
  assert.ok(Array.isArray(devices));
  assert.ok(devices.every(d => d.type === 'physical_adb'));
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

test('MobileRunner: malicious deviceId command injection payload blocked', async () => {
  const runner = new MobileRunner();
  const res = await runner.executeAction('emulator-5554; rm -rf /', { type: 'tap', x: 100, y: 100 });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.blocked, true);
  assert.strictEqual(res.verdict, 'BLOCKED_RISKY');
  assert.ok(res.reason.includes('Invalid device identifier format'));
});

test('MobileRunner: malicious package command injection payload blocked', async () => {
  const runner = new MobileRunner();
  const res = await runner.executeAction('pixel-8-virtual', {
    type: 'launch',
    package: 'com.android.chrome && cat /etc/passwd'
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.blocked, true);
  assert.strictEqual(res.verdict, 'BLOCKED_RISKY');
  assert.ok(res.reason.includes('Invalid package name format'));
});

test('MobileRunner: malicious key injection payload blocked', async () => {
  const runner = new MobileRunner();
  const res = await runner.executeAction('pixel-8-virtual', {
    type: 'key',
    key: 'HOME; reboot'
  });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.blocked, true);
  assert.strictEqual(res.verdict, 'BLOCKED_RISKY');
  assert.ok(res.reason.includes('Invalid key format'));
});

