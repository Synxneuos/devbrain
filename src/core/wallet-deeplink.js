/**
 * Jev Brain - Mobile Wallet Deep Linking & Auto-Connect Utilities
 * Provides standard Universal Links for Phantom (Solana) and MetaMask (EVM)
 * to open installed mobile apps directly on iOS & Android devices.
 */

/**
 * Detects whether the current environment is a mobile phone or tablet.
 * @param {string} [ua] - User agent string
 * @param {number} [maxTouchPoints] - Navigator maxTouchPoints
 * @param {number} [innerWidth] - Viewport width in pixels
 * @returns {boolean}
 */
export function isMobileUserAgent(ua = '', maxTouchPoints = 0, innerWidth = 1024) {
  const normalizedUA = (ua || '').toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(normalizedUA);
  const isTouchDevice = maxTouchPoints > 0;
  return isMobileUA || (isTouchDevice && innerWidth <= 820);
}

/**
 * Builds the canonical Phantom Universal Link for mobile browsing.
 * Standard format: https://phantom.app/ul/browse/<encoded_url>?ref=<encoded_ref>
 * @param {string} targetUrl - The website URL to open in Phantom
 * @param {string} [refOrigin] - Optional origin for referral
 * @returns {string} Universal link to launch native Phantom app
 */
export function buildPhantomDeepLink(targetUrl = 'https://jevbrain.world/', refOrigin = '') {
  try {
    const url = new URL(targetUrl);
    url.searchParams.set('auto_connect', 'phantom');
    const dappUrl = url.toString();
    const ref = refOrigin || url.origin;
    return `https://phantom.app/ul/browse/${encodeURIComponent(dappUrl)}?ref=${encodeURIComponent(ref)}`;
  } catch (err) {
    return 'https://phantom.app/';
  }
}

/**
 * Builds the canonical MetaMask Universal Link for mobile browsing.
 * Standard format: https://metamask.app.link/dapp/<host_and_path_without_protocol>
 * @param {string} targetUrl - The website URL to open in MetaMask
 * @returns {string} Universal link to launch native MetaMask app
 */
export function buildMetaMaskDeepLink(targetUrl = 'https://jevbrain.world/') {
  try {
    const url = new URL(targetUrl);
    url.searchParams.set('auto_connect', 'metamask');
    // MetaMask expects domain and path without leading https:// or http://
    const hostAndPath = (url.host + url.pathname + (url.search || '') + (url.hash || '')).replace(/^\/+/, '');
    return `https://metamask.app.link/dapp/${hostAndPath}`;
  } catch (err) {
    return 'https://metamask.io/download/';
  }
}

/**
 * Extracts and validates the auto_connect parameter from a URL.
 * @param {string} urlStr
 * @returns {'phantom' | 'metamask' | null}
 */
export function parseAutoConnectParam(urlStr) {
  try {
    const url = new URL(urlStr, 'https://jevbrain.world');
    const val = url.searchParams.get('auto_connect');
    if (val === 'phantom' || val === 'metamask') {
      return val;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Removes the auto_connect parameter from a URL without mutating other query params.
 * @param {string} urlStr
 * @returns {string}
 */
export function cleanAutoConnectParam(urlStr) {
  try {
    const url = new URL(urlStr, 'https://jevbrain.world');
    url.searchParams.delete('auto_connect');
    const search = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
    return url.pathname + search + (url.hash || '');
  } catch {
    return urlStr;
  }
}
