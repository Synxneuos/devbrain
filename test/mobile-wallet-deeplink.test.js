import test from 'node:test';
import assert from 'node:assert';
import {
  isMobileUserAgent,
  buildPhantomDeepLink,
  buildMetaMaskDeepLink,
  parseAutoConnectParam,
  cleanAutoConnectParam
} from '../src/core/wallet-deeplink.js';

test('Mobile Detection: identifies iPhone, iPad, and Android mobile devices', () => {
  const iPhoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';
  const androidUA = 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36';
  const desktopChromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  assert.strictEqual(isMobileUserAgent(iPhoneUA, 5, 390), true, 'iPhone should be detected as mobile');
  assert.strictEqual(isMobileUserAgent(androidUA, 5, 412), true, 'Android phone should be detected as mobile');
  assert.strictEqual(isMobileUserAgent(desktopChromeUA, 0, 1920), false, 'Desktop Chrome should NOT be detected as mobile');
  
  // Touchscreen laptop or tablet check
  assert.strictEqual(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5, 768), true, 'iPad/touch tablet <= 820px should be mobile');
  assert.strictEqual(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0, 1440), false, 'Desktop Mac without touch should NOT be mobile');
});

test('Phantom Deep Link: generates valid Universal Link with auto_connect and ref origin', () => {
  const target = 'https://jevbrain.world/';
  const ref = 'https://jevbrain.world';
  const deepLink = buildPhantomDeepLink(target, ref);

  assert.ok(deepLink.startsWith('https://phantom.app/ul/browse/'), 'Must use official Phantom Universal Link base');
  assert.ok(deepLink.includes('auto_connect%3Dphantom') || deepLink.includes('auto_connect=phantom'), 'Must include auto_connect=phantom parameter');
  assert.ok(deepLink.includes('ref=https%3A%2F%2Fjevbrain.world') || deepLink.includes('ref=https://jevbrain.world'), 'Must include referral origin');

  // Verify decoded target URL
  const parsed = new URL(deepLink);
  const encodedDapp = parsed.pathname.replace('/ul/browse/', '');
  const decodedDapp = decodeURIComponent(encodedDapp);
  assert.strictEqual(decodedDapp, 'https://jevbrain.world/?auto_connect=phantom');
  assert.strictEqual(parsed.searchParams.get('ref'), ref);
});

test('Phantom Deep Link: preserves existing query parameters when adding auto_connect', () => {
  const target = 'https://jevbrain.world/?ref_code=sol123&utm_source=twitter';
  const deepLink = buildPhantomDeepLink(target, 'https://jevbrain.world');

  const parsed = new URL(deepLink);
  const encodedDapp = parsed.pathname.replace('/ul/browse/', '');
  const decodedDapp = decodeURIComponent(encodedDapp);
  const dappParsed = new URL(decodedDapp);

  assert.strictEqual(dappParsed.searchParams.get('ref_code'), 'sol123');
  assert.strictEqual(dappParsed.searchParams.get('utm_source'), 'twitter');
  assert.strictEqual(dappParsed.searchParams.get('auto_connect'), 'phantom');
});

test('MetaMask Deep Link: generates valid Universal Link without leading protocol in dapp path', () => {
  const target = 'https://jevbrain.world/';
  const deepLink = buildMetaMaskDeepLink(target);

  assert.ok(deepLink.startsWith('https://metamask.app.link/dapp/'), 'Must use official MetaMask Universal Link base');
  // Protocol (https://) MUST NOT be present after /dapp/
  const afterDapp = deepLink.replace('https://metamask.app.link/dapp/', '');
  assert.ok(!afterDapp.startsWith('http://'), 'Must not have http://');
  assert.ok(!afterDapp.startsWith('https://'), 'Must not have https://');
  assert.strictEqual(afterDapp, 'jevbrain.world/?auto_connect=metamask');
});

test('MetaMask Deep Link: preserves existing subpaths and query parameters', () => {
  const target = 'https://jevbrain.world/chat?session=abc123#composer';
  const deepLink = buildMetaMaskDeepLink(target);

  const afterDapp = deepLink.replace('https://metamask.app.link/dapp/', '');
  assert.ok(afterDapp.startsWith('jevbrain.world/chat?'));
  assert.ok(afterDapp.includes('session=abc123'));
  assert.ok(afterDapp.includes('auto_connect=metamask'));
  assert.ok(afterDapp.includes('#composer'));
});

test('Auto-Connect Parameter Parser & Cleaner: handles handoff gracefully', () => {
  const phantomUrl = 'https://jevbrain.world/?auto_connect=phantom&model=claude';
  const metamaskUrl = 'https://jevbrain.world/?auto_connect=metamask';
  const normalUrl = 'https://jevbrain.world/?model=gpt-4o';

  assert.strictEqual(parseAutoConnectParam(phantomUrl), 'phantom');
  assert.strictEqual(parseAutoConnectParam(metamaskUrl), 'metamask');
  assert.strictEqual(parseAutoConnectParam(normalUrl), null);

  const cleaned = cleanAutoConnectParam(phantomUrl);
  assert.strictEqual(cleaned, '/?model=claude', 'Must strip auto_connect while keeping model');

  const cleanedMetamask = cleanAutoConnectParam(metamaskUrl);
  assert.strictEqual(cleanedMetamask, '/', 'Must strip auto_connect leaving clean path');
});
