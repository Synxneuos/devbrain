// Jev Brain - Web3 AI Agent Platform & Decision Engine
// Multi-Model Routing, Dynamic DexScreener Tiers & Agent Warden

// ============================================
// GLOBAL STATE & STORAGE
// ============================================
let currentWallet = null;
let isTokenHolder = false;
let userTier = null;
let totalSavingsUsd = 0.00;
let currentChatId = null;
let allOpenRouterModels = [];
let discoveredProvider = null;
let currentUserProfile = null;
let activeGenerationController = null;
let pendingAttachment = null;
let speechRecognition = null;
let audioRecorder = null;
let audioChunks = [];

// Persistent Chats & Projects
const STORAGE_CHATS_KEY = 'jevbrain_chats_v2';
const STORAGE_ACTIVE_CHAT_KEY = 'jevbrain_active_chat_v2';
const STORAGE_WALLET_KEY = 'jevbrain_wallet';
const STORAGE_SESSION_TOKEN = 'jevbrain_session_token';

// Returns the wallet-signature-bound session token for authenticated API calls.
function getSessionToken() {
  return sessionStorage.getItem(STORAGE_SESSION_TOKEN) || localStorage.getItem(STORAGE_SESSION_TOKEN) || '';
}

// Authenticated fetch headers (Bearer + X-Session-Token) for session-bound endpoints.
function authHeaders(extra = {}) {
  const token = getSessionToken();
  return token
    ? { ...extra, 'Authorization': `Bearer ${token}`, 'X-Session-Token': token }
    : { ...extra };
}
const STORAGE_PROFILE_PREFIX = 'jevbrain_profile_';
const STORAGE_TIER_PREFIX = 'jevbrain_tier_';
const STORAGE_PROJECTS_PREFIX = 'jevbrain_projects_';

// ============================================
// DOM SELECTORS
// ============================================
const elements = {
  center: document.getElementById('claude-center'),
  hero: document.getElementById('claude-hero'),
  heroHeading: document.getElementById('hero-heading'),
  messages: document.getElementById('messages-stream'),
  input: document.getElementById('prompt-input'),
  sendBtn: document.getElementById('send-btn'),
  modelSelect: document.getElementById('model-select'),
  modelInlineSearch: document.getElementById('model-inline-search'),
  attachBtn: document.getElementById('attach-btn'),
  attachmentInput: document.getElementById('attachment-input'),
  attachmentChip: document.getElementById('attachment-chip'),
  voiceBtn: document.getElementById('voice-input-btn'),
  audioBtn: document.getElementById('audio-record-btn'),
  newChatBtn: document.getElementById('new-chat-btn'),
  savedPill: document.getElementById('total-saved-pill'),
  collapseBtn: document.getElementById('collapse-sidebar-btn'),
  reopenBtn: document.getElementById('sidebar-reopen-btn'),
  sidebar: document.getElementById('sidebar'),
  gateOverlay: document.getElementById('wallet-gate-overlay'),
  connectBtn: document.getElementById('connect-wallet-btn'),
  verifyBtn: document.getElementById('quick-verify-btn'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  mc: document.getElementById('mc-display'),
  tier: document.getElementById('tier-display'),
  avatar: document.getElementById('user-avatar-badge'),
  name: document.getElementById('user-name-display'),
  status: document.getElementById('wallet-status-sub'),
  holder: document.getElementById('holder-status-text'),
  profileBar: document.getElementById('profile-bar'),
  chatsList: document.getElementById('chats-list'),
  topbarTitle: document.getElementById('topbar-title'),

  // Onboarding Modal
  onboardingModal: document.getElementById('onboarding-modal'),
  onboardingClose: document.getElementById('onboarding-modal-close'),
  onboardingForm: document.getElementById('onboarding-form'),
  onboardingNameInput: document.getElementById('onboarding-name-input'),
  onboardingEmailInput: document.getElementById('onboarding-email-input'),
  onboardingWalletAddr: document.getElementById('onboarding-wallet-addr'),
  onboardingConfirmBtn: document.getElementById('onboarding-confirm-btn'),

  // Modals
  tierModal: document.getElementById('tier-modal-overlay'),
  tierClose: document.getElementById('tier-modal-close'),
  tierPill: document.getElementById('tier-pill'),
  mcPill: document.getElementById('mc-pill'),

  projectsModal: document.getElementById('projects-modal'),
  projectsClose: document.getElementById('projects-modal-close'),
  navProjects: document.getElementById('nav-projects'),
  projectsList: document.getElementById('projects-list-container'),
  newProjName: document.getElementById('new-project-name'),
  newProjDesc: document.getElementById('new-project-desc'),
  btnCreateProject: document.getElementById('btn-create-project'),

  artifactsModal: document.getElementById('artifacts-modal'),
  artifactsClose: document.getElementById('artifacts-modal-close'),
  navArtifacts: document.getElementById('nav-artifacts'),
  artifactsList: document.getElementById('artifacts-sidebar-list'),
  artifactTitle: document.getElementById('artifact-preview-title'),
  artifactCode: document.getElementById('artifact-preview-code'),
  btnCopyArtifact: document.getElementById('btn-copy-artifact'),
  btnDownloadArtifact: document.getElementById('btn-download-artifact'),

  wardenModal: document.getElementById('warden-modal'),
  wardenClose: document.getElementById('warden-modal-close'),
  navWarden: document.getElementById('nav-code'),
  wardenInput: document.getElementById('warden-test-input'),
  btnRunWarden: document.getElementById('btn-run-warden-test'),
  wardenBox: document.getElementById('warden-verdict-box'),
  wardenBadge: document.getElementById('warden-verdict-badge'),
  wardenReason: document.getElementById('warden-verdict-reason'),
  wardenChkFile: document.getElementById('warden-chk-file'),
  wardenChkIrrev: document.getElementById('warden-chk-irrev'),
  wardenChkLoop: document.getElementById('warden-chk-loop'),
  wardenChkDone: document.getElementById('warden-chk-done'),

  routerModal: document.getElementById('router-modal'),
  routerClose: document.getElementById('router-modal-close'),
  navRouter: document.getElementById('nav-customize'),
  routerModelCount: document.getElementById('router-model-count'),
  routerModelSearch: document.getElementById('router-model-search'),
  routerModelsGrid: document.getElementById('router-models-grid'),

  searchModal: document.getElementById('search-modal'),
  searchClose: document.getElementById('search-modal-close'),
  chatSearchInput: document.getElementById('chat-search-input'),
  chatSearchResults: document.getElementById('chat-search-results'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnExportMd: document.getElementById('btn-export-md'),
  btnProfileDownload: document.querySelector('.icon-mini[title*="Download"]'),
  btnProfileSearch: document.querySelector('.icon-mini[title*="Search"]')
};

// ============================================
// METAMASK & WEB3 WALLET DETECTION (EIP-6963 & Injected)
// ============================================
window.addEventListener('eip6963:announceProvider', (event) => {
  const info = event.detail.info;
  if (info) {
    if (info.rdns === 'io.metamask' || info.name.toLowerCase().includes('metamask')) {
      discoveredProvider = event.detail.provider;
      console.log('🦊 Official MetaMask provider detected via EIP-6963:', info.name);
    } else if (!discoveredProvider) {
      discoveredProvider = event.detail.provider;
      console.log('🌐 Web3 provider detected via EIP-6963:', info.name);
    }
  }
});

// Trigger discovery event
window.dispatchEvent(new Event('eip6963:requestProvider'));

function getWeb3Provider() {
  if (discoveredProvider) return discoveredProvider;
  if (typeof window.ethereum !== 'undefined') {
    if (Array.isArray(window.ethereum.providers)) {
      const metaMask = window.ethereum.providers.find(p => p.isMetaMask);
      if (metaMask) return metaMask;
      return window.ethereum.providers[0];
    }
    return window.ethereum;
  }
  return null;
}

function registerWalletProviderListeners() {
  const provider = getWeb3Provider();
  if (!provider?.on) return;
  provider.on('accountsChanged', (accounts) => {
    const next = accounts?.[0]?.toLowerCase();
    if (!next || (currentWallet && next !== currentWallet.toLowerCase())) {
      disconnectWallet();
      if (next) elements.status.textContent = 'Account changed — reconnect required';
    }
  });
  provider.on('chainChanged', () => {
    // Token balances and eligibility are network-specific. Never keep the old tier.
    if (currentWallet) {
      disconnectWallet();
      alert('Network changed. Please reconnect your wallet so Jev can verify the new network.');
    }
  });
}

// Convert string to hex for personal_sign parameters
function stringToHex(str) {
  let hex = '0x';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const n = code.toString(16);
    hex += (n.length < 2 ? '0' + n : n);
  }
  return hex;
}

// ============================================
// METAMASK WALLET CONNECTION & SIGNATURE AUTHENTICATION
// ============================================
async function connectMetaMaskWallet() {
  const provider = getWeb3Provider();
  if (!provider) {
    const install = confirm('MetaMask is required to authenticate with Jev Brain.\n\nClick OK to open https://metamask.io/download/ and install MetaMask.');
    if (install) {
      window.open('https://metamask.io/download/', '_blank');
    }
    return;
  }

  const btn = elements.connectBtn;
  const originalHtml = btn ? btn.innerHTML : '';

  try {
    if (btn) {
      btn.innerHTML = '<span>🦊</span> <span>Requesting Accounts...</span>';
      btn.disabled = true;
    }

    // Step 1: Request accounts popup (eth_requestAccounts)
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts[0]) {
      throw new Error('No Ethereum account selected in MetaMask.');
    }
    const account = accounts[0].toLowerCase();

    if (btn) {
      btn.innerHTML = '<span>🦊</span> <span>Sign Message in MetaMask...</span>';
    }

    // Step 2: Request challenge nonce from backend
    const nonceRes = await fetch(`/api/wallet/nonce?address=${encodeURIComponent(account)}`);
    if (!nonceRes.ok) {
      throw new Error('Failed to generate authentication challenge from server.');
    }
    const { nonce, message } = await nonceRes.json();

    // Step 3: Prompt cryptographic personal_sign signature in MetaMask
    let signature = null;
    const msgHex = stringToHex(message);
    try {
      // Standard personal_sign: params [hexMessage, account]
      signature = await provider.request({
        method: 'personal_sign',
        params: [msgHex, account]
      });
    } catch (hexErr) {
      // Fallback for providers expecting plain text: params [message, account]
      signature = await provider.request({
        method: 'personal_sign',
        params: [message, account]
      });
    }

    if (!signature) {
      throw new Error('Cryptographic signature was rejected or cancelled.');
    }

    if (btn) {
      btn.innerHTML = '<span>⏳</span> <span>Verifying Signature...</span>';
    }

    // Step 4: Verify cryptographic signature on backend
    const verifyRes = await fetch('/api/wallet/verify-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: account,
        signature,
        message,
      })
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.success) {
      throw new Error(verifyData.error || 'Cryptographic signature verification failed.');
    }

    if (verifyData.sessionToken) {
      sessionStorage.setItem(STORAGE_SESSION_TOKEN, verifyData.sessionToken);
      localStorage.setItem(STORAGE_SESSION_TOKEN, verifyData.sessionToken);
    }

    // Step 5: Unlock UI and update state
    await onWalletAuthenticated(verifyData.address, verifyData.tokensHeld, verifyData.userTier);

  } catch (err) {
    console.error('MetaMask authentication error:', err);
    if (err.code === 4001) {
      alert('MetaMask request rejected by user.');
    } else {
      alert('MetaMask Error: ' + (err.message || err));
    }
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml || `
        <svg width="18" height="18" viewBox="0 0 318.6 318.6" fill="none">
          <path d="M274.1 35.5l-99.5 73.9L193 65.8z" fill="#E2761B" stroke="#E2761B" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M44.4 35.5l98.7 74.6-18.4-44.3zM238.3 206.8l-29.7 40.9 50.9 14 14.7-54.2zM44.4 207.5l14.7 54.2 50.8-14-29.6-40.9z" fill="#E4761B" stroke="#E4761B" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M109.9 247.7l-47.3 13 42 30.6 5.3-43.6zM208.6 247.7l5.3 43.6 42-30.6-47.3-13z" fill="#D7C1B3" stroke="#D7C1B3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M109.9 247.7l-5.3 43.6 54.7 27.3 54.7-27.3-5.3-43.6-49.4 14.8z" fill="#233447" stroke="#233447" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M193 65.8l-18.4 43.6 32.7 58.2 55.4-18.8 11.4-113.3zM44.4 35.5l11.4 113.3 55.4 18.8 32.7-58.2-18.4-43.6z" fill="#E4761B" stroke="#E4761B" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M262.5 148.8l-55.4 18.8 31.2 39.2 14.7-54.2zM111.4 167.6L56 148.8l9.5 54.9 31.2-39.2z" fill="#F6851B" stroke="#F6851B" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M143.1 110.1l-32.7 58.2 48.9 26.6 48.9-26.6-32.7-58.2z" fill="#C0AD9E" stroke="#C0AD9E" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M159.3 194.9l-48.9-26.6-1.5 24.1 50.4 20.3 50.4-20.3-1.5-24.1z" fill="#161616" stroke="#161616" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M159.3 212.7l-50.4-20.3 1 55.3 49.4-14.8 49.4 14.8 1-55.3z" fill="#763D16" stroke="#763D16" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Connect Wallet</span>
      `;
      btn.disabled = false;
    }
  }
}

// ============================================
// USER PROFILE & FIRST-TIME ONBOARDING
// ============================================
async function getUserProfile(address) {
  if (!address) return null;
  const key = STORAGE_PROFILE_PREFIX + address.toLowerCase();
  const local = localStorage.getItem(key);
  if (local) {
    try {
      return JSON.parse(local);
    } catch (e) {}
  }

  // Fallback to server (session-bound: profile reads require own signed session)
  try {
    const res = await fetch(`/api/user/profile?address=${encodeURIComponent(address.toLowerCase())}`, {
      headers: { 'Authorization': `Bearer ${getSessionToken()}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.profile) {
        localStorage.setItem(key, JSON.stringify(data.profile));
        return data.profile;
      }
    }
  } catch (e) {}

  return null;
}

async function saveUserProfile(address, name, email) {
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim();
  const profile = {
    address: address.toLowerCase(),
    name: cleanName,
    email: cleanEmail,
    updatedAt: Date.now()
  };

  currentUserProfile = profile;
  const key = STORAGE_PROFILE_PREFIX + address.toLowerCase();
  localStorage.setItem(key, JSON.stringify(profile));

  // Sync to backend (session-bound: a wallet can only write its own profile)
  try {
    await fetch('/api/user/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getSessionToken()}`
      },
      body: JSON.stringify(profile)
    });
  } catch (e) {
    console.error('Failed to sync profile to server:', e);
  }

  applyUserProfile(profile);
}

function applyUserProfile(profile) {
  if (!profile) return;
  const name = profile.name || 'User';
  const initial = name.charAt(0).toUpperCase();

  // Sidebar profile info
  if (elements.name) elements.name.textContent = name;
  if (elements.status) elements.status.textContent = 'MetaMask Verified';
  if (elements.avatar) elements.avatar.textContent = initial;

  // Main Page / Hero Welcome text
  if (elements.heroHeading) {
    elements.heroHeading.textContent = `Hey, welcome to Jev, ${name}!`;
  }

  // Re-render chat messages if chat is open to reflect user's name
  if (currentChatId) {
    loadChatMessages(currentChatId);
  }
}

function promptOnboarding(address) {
  if (!elements.onboardingModal) return;
  elements.onboardingModal.style.display = 'flex';
  if (elements.onboardingWalletAddr) {
    elements.onboardingWalletAddr.textContent = address.slice(0, 6) + '...' + address.slice(-4);
  }
  if (currentUserProfile) {
    if (elements.onboardingNameInput) elements.onboardingNameInput.value = currentUserProfile.name || '';
    if (elements.onboardingEmailInput) elements.onboardingEmailInput.value = currentUserProfile.email || '';
  } else {
    if (elements.onboardingNameInput) elements.onboardingNameInput.value = '';
    if (elements.onboardingEmailInput) elements.onboardingEmailInput.value = '';
  }
  setTimeout(() => {
    elements.onboardingNameInput?.focus();
  }, 100);
}

async function onWalletAuthenticated(address, tokens = 0, precalculatedTier = null) {
  try {
    let tierData = precalculatedTier;
    if (!tierData) {
      const cachedTier = localStorage.getItem(STORAGE_TIER_PREFIX + address.toLowerCase());
      if (cachedTier) tierData = JSON.parse(cachedTier);
      else throw new Error('Wallet session expired. Please reconnect MetaMask.');
    }

    currentWallet = address;
    isTokenHolder = true;
    userTier = tierData;
    refreshInlineModelOptions(elements.modelInlineSearch?.value || '');

    // Unlock UI
    elements.gateOverlay.style.display = 'none';
    const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

    // Check user profile: first-time onboarding vs returning user
    const profile = await getUserProfile(address);
    if (profile && profile.name) {
      currentUserProfile = profile;
      applyUserProfile(profile);
      if (elements.onboardingModal) elements.onboardingModal.style.display = 'none';
    } else {
      // First time connect: open Claude AI style onboarding modal
      elements.name.textContent = 'Setting up...';
      elements.status.textContent = 'Profile Setup';
      elements.avatar.textContent = '✻';
      promptOnboarding(address);
    }

    if (elements.holder) {
      elements.holder.textContent = 'Verified Holder';
      elements.holder.style.color = '#10b981';
    }
    if (elements.tier) {
      elements.tier.textContent = `${userTier.tierName || 'Dynasty Magnate'} (Unlocked)`;
    }

    // Topbar Connect Button update
    const topbarBtn = document.getElementById('topbar-connect-wallet-btn');
    const topbarText = document.getElementById('topbar-wallet-btn-text');
    if (topbarBtn) topbarBtn.classList.add('connected');
    if (topbarText) topbarText.textContent = shortAddr;

    // Web3 Modal update
    const rBadge = document.getElementById('rainbow-modal-badge');
    const rAddr = document.getElementById('rainbow-modal-address');
    const rTier = document.getElementById('rainbow-modal-tier-text');
    const rConnBtn = document.getElementById('rainbow-modal-connect-btn');
    const rDiscBtn = document.getElementById('rainbow-modal-disconnect-btn');
    if (rBadge) {
      rBadge.textContent = 'Verified Holder';
      rBadge.style.background = 'rgba(16,185,129,0.15)';
      rBadge.style.color = '#10b981';
    }
    if (rAddr) rAddr.textContent = address;
    if (rTier) rTier.textContent = `Tier: ${userTier.tierName || 'Dynasty Magnate'} • Unlocked Full Access`;
    if (rConnBtn) rConnBtn.style.display = 'none';
    if (rDiscBtn) rDiscBtn.style.display = 'block';

    localStorage.setItem(STORAGE_WALLET_KEY, address);
    localStorage.setItem(STORAGE_TIER_PREFIX + address.toLowerCase(), JSON.stringify(userTier));
    console.log(`✓ MetaMask Verified! Tier: [${userTier.tierName}] Bag: ${userTier.bagUsdValue}`);
    loadServerChats(address);
  } catch (err) {
    console.error('Verification failure:', err);
  }
}

function disconnectWallet() {
  currentWallet = null;
  isTokenHolder = false;
  userTier = null;
  currentUserProfile = null;
  localStorage.removeItem(STORAGE_WALLET_KEY);
  sessionStorage.removeItem(STORAGE_SESSION_TOKEN);
  localStorage.removeItem(STORAGE_SESSION_TOKEN);

  if (elements.heroHeading) {
    elements.heroHeading.textContent = 'Welcome! I’m Jev Brain.';
  }
  if (elements.onboardingModal) {
    elements.onboardingModal.style.display = 'none';
  }

  elements.gateOverlay.style.display = 'flex';
  elements.name.textContent = 'Not Connected';
  elements.status.textContent = 'Access Restricted';
  elements.avatar.textContent = '?';
  if (elements.tier) elements.tier.textContent = 'Locked';
  if (elements.holder) {
    elements.holder.textContent = 'Disconnected';
    elements.holder.style.color = '#dc2626';
  }

  const topbarBtn = document.getElementById('topbar-connect-wallet-btn');
  const topbarText = document.getElementById('topbar-wallet-btn-text');
  if (topbarBtn) topbarBtn.classList.remove('connected');
  if (topbarText) topbarText.textContent = 'Connect Wallet';

  const rBadge = document.getElementById('rainbow-modal-badge');
  const rAddr = document.getElementById('rainbow-modal-address');
  const rTier = document.getElementById('rainbow-modal-tier-text');
  const rConnBtn = document.getElementById('rainbow-modal-connect-btn');
  const rDiscBtn = document.getElementById('rainbow-modal-disconnect-btn');
  if (rBadge) {
    rBadge.textContent = 'Disconnected';
    rBadge.style.background = 'rgba(239,68,68,0.15)';
    rBadge.style.color = '#ef4444';
  }
  if (rAddr) rAddr.textContent = 'No wallet connected';
  if (rTier) rTier.textContent = 'Requires token holding to access frontier AI models';
  if (rConnBtn) rConnBtn.style.display = 'flex';
  if (rDiscBtn) rDiscBtn.style.display = 'none';
}

// ============================================
// CHATS & MULTI-SESSION MANAGER
// ============================================
function getSavedChats() {
  try {
    const raw = localStorage.getItem(STORAGE_CHATS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveChats(chats) {
  localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(chats));
}

function getActiveChatId() {
  return localStorage.getItem(STORAGE_ACTIVE_CHAT_KEY) || null;
}

function setActiveChatId(id) {
  localStorage.setItem(STORAGE_ACTIVE_CHAT_KEY, id);
  currentChatId = id;
}

function initChats() {
  let chats = getSavedChats();
  if (chats.length === 0) {
    const initial = {
      id: 'chat-initial',
      title: 'Your first chat with Jev Brain',
      messages: [],
      createdAt: Date.now()
    };
    chats = [initial];
    saveChats(chats);
  }

  const activeId = getActiveChatId() || chats[0].id;
  setActiveChatId(activeId);
  renderChatsList();
  loadChatMessages(activeId);
}

function renderChatsList() {
  const chats = getSavedChats();
  elements.chatsList.innerHTML = '';

  chats.forEach((chat) => {
    const item = document.createElement('div');
    const isActive = chat.id === currentChatId;
    item.className = `chat-thread-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <span class="thread-dot">${isActive ? '●' : '○'}</span>
      <span class="thread-title" title="${escapeHtml(chat.title)}">${escapeHtml(chat.title)}</span>
    `;

    item.addEventListener('click', () => {
      if (!isTokenHolder) { elements.gateOverlay.style.display = 'flex'; return; }
      setActiveChatId(chat.id);
      renderChatsList();
      loadChatMessages(chat.id);
    });

    elements.chatsList.appendChild(item);
  });
}

function loadChatMessages(chatId) {
  const chats = getSavedChats();
  const chat = chats.find(c => c.id === chatId) || chats[0];
  if (!chat) return;

  elements.messages.innerHTML = '';
  if (elements.topbarTitle) elements.topbarTitle.textContent = chat.title;

  if (chat.messages && chat.messages.length > 0) {
    if (elements.hero) elements.hero.style.display = 'none';
    chat.messages.forEach(msg => {
      if (msg.role === 'user') {
        appendUserMessage(msg.content, false);
      } else {
        appendAssistantResponse(msg, false);
      }
    });
  } else {
    if (elements.hero) elements.hero.style.display = 'flex';
  }
}

function createNewChat() {
  if (!isTokenHolder) {
    elements.gateOverlay.style.display = 'flex';
    return;
  }

  const chats = getSavedChats();
  const newChatObj = {
    id: 'chat-' + Date.now(),
    title: 'New chat',
    messages: [],
    createdAt: Date.now()
  };

  chats.unshift(newChatObj);
  saveChats(chats);
  setActiveChatId(newChatObj.id);

  elements.messages.innerHTML = '';
  if (elements.hero) elements.hero.style.display = 'flex';
  if (elements.input) {
    elements.input.value = '';
    elements.input.focus();
  }
  if (elements.topbarTitle) elements.topbarTitle.textContent = 'New chat';

  renderChatsList();
}

function saveMessageToCurrentChat(role, payload) {
  const chats = getSavedChats();
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  chat.messages.push({
    role,
    content: typeof payload === 'string' ? payload : payload.response,
    modelName: payload.modelName,
    latencyMs: payload.latencyMs,
    dollarsSaved: payload.dollarsSaved,
    timestamp: Date.now()
  });

  // Auto-generate title from first user query
  if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
    const raw = typeof payload === 'string' ? payload : payload.content;
    chat.title = raw.length > 30 ? raw.slice(0, 30) + '...' : raw;
    if (elements.topbarTitle) elements.topbarTitle.textContent = chat.title;
  }

  saveChats(chats);
  renderChatsList();
  // Fire-and-forget server sync (session-bound; server ignores any address in body).
  if (getSessionToken()) {
    const savedChat = chats.find(item => item.id === currentChatId);
    fetch('/api/chats', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ chat: savedChat })
    }).catch(() => {});
  }
}

// Merge this wallet's server-stored chats into the local list after auth.
async function loadServerChats(address) {
  if (!getSessionToken()) return;
  try {
    const res = await fetch('/api/chats', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const serverChats = Array.isArray(data.chats) ? data.chats : [];
    if (!serverChats.length) return;

    const local = getSavedChats();
    let merged = false;
    for (const sc of serverChats) {
      const existing = local.find(c => c.id === sc.id);
      if (!existing) {
        local.push(sc);
        merged = true;
      } else if ((sc.messages || []).length > (existing.messages || []).length) {
        local[local.indexOf(existing)] = sc;
        merged = true;
      }
    }
    if (merged) {
      saveChats(local);
      renderChatsList();
      if (currentChatId) loadChatMessages(currentChatId);
    }
  } catch (e) {
    console.warn('Server chat sync unavailable:', e.message);
  }
}

// ============================================
// CHAT SEND & EXECUTION
// ============================================
async function handleSubmit() {
  if (!isTokenHolder || !currentWallet) {
    elements.gateOverlay.style.display = 'flex';
    return;
  }

  const text = elements.input.value.trim();
  if (!text && !pendingAttachment) return;
  const attachmentContext = pendingAttachment?.text ? `\n\nAttached file (${pendingAttachment.name}):\n${pendingAttachment.text.slice(0, 120000)}` : '';
  const promptText = `${text}${attachmentContext}`.trim();

  if (elements.hero) elements.hero.style.display = 'none';
  appendUserMessage(text || `Attached ${pendingAttachment.name}`, true);
  elements.input.value = '';
  elements.input.style.height = '38px';
  pendingAttachment = null;
  if (elements.attachmentChip) elements.attachmentChip.hidden = true;

  if (activeGenerationController) {
    activeGenerationController.abort();
    return;
  }
  const loadingRow = appendLoading();
  activeGenerationController = new AbortController();
  if (elements.sendBtn) elements.sendBtn.title = 'Stop generation';
  elements.center.scrollTop = elements.center.scrollHeight;

  try {
    const model = elements.modelSelect.value;
    const sessionToken = sessionStorage.getItem(STORAGE_SESSION_TOKEN) || localStorage.getItem(STORAGE_SESSION_TOKEN) || '';
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': sessionToken ? `Bearer ${sessionToken}` : '',
        'X-Session-Token': sessionToken
      },
      body: JSON.stringify({
        prompt: promptText,
        model,
        walletAddress: currentWallet,
        sessionToken
      }),
      signal: activeGenerationController.signal
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'API request failed: ' + res.status);
    }

    loadingRow.remove();
    const streamRow = appendStreamingAssistant();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let responseText = '';
    let finalData = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const event of events) {
        const line = event.split('\n').find(item => item.startsWith('data:'));
        if (!line) continue;
        const packet = JSON.parse(line.slice(5).trim());
        if (packet.error) throw new Error(packet.error);
        if (packet.token) {
          responseText += packet.token;
          streamRow.querySelector('.msg-bubble-assistant').innerHTML = formatMarkdown(responseText);
          elements.center.scrollTop = elements.center.scrollHeight;
        }
        if (packet.done) finalData = packet;
      }
    }
    finalData = finalData || { response: responseText, modelName: 'Jev Gateway', latencyMs: 0, dollarsSaved: 0 };
    streamRow.querySelector('.routing-header-pill span').textContent = `⚡ ${finalData.modelName || model} • ${finalData.latencyMs || 0}ms • Saved $${(finalData.dollarsSaved || 0).toFixed(4)}`;
    saveMessageToCurrentChat('assistant', { ...finalData, response: responseText });

    totalSavingsUsd += (finalData.dollarsSaved || 0);
    elements.savedPill.textContent = `Saved $${totalSavingsUsd.toFixed(4)}`;

    // Extract any code block as artifact
    extractAndSaveArtifact(text, responseText);

  } catch (err) {
    loadingRow.remove();
    if (err.name !== 'AbortError') {
      appendAssistantResponse({
        response: `I couldn't complete that request. ${err.message}`,
        modelName: 'Jev Gateway',
        latencyMs: 0,
        dollarsSaved: 0
      }, true);
    }
  }

  activeGenerationController = null;
  if (elements.sendBtn) elements.sendBtn.title = 'Send';

  elements.center.scrollTop = elements.center.scrollHeight;
}

function appendStreamingAssistant() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = '<div class="routing-header-pill"><span>⚡ Jev Gateway • streaming...</span></div><div class="msg-bubble-assistant"></div>';
  elements.messages.appendChild(row);
  return row;
}

function appendUserMessage(text, shouldSave = true) {
  const row = document.createElement('div');
  row.className = 'msg-row user';
  const userName = (currentUserProfile && currentUserProfile.name) ? currentUserProfile.name : 'You';
  const userInitial = userName.charAt(0).toUpperCase();
  row.innerHTML = `
    <div class="msg-user-header">
      <span class="msg-user-name">${escapeHtml(userName)}</span>
      <span class="msg-user-avatar-mini">${escapeHtml(userInitial)}</span>
    </div>
    <div class="msg-bubble-user">${escapeHtml(text)}</div>
  `;
  elements.messages.appendChild(row);
  if (shouldSave) saveMessageToCurrentChat('user', text);
}

function appendAssistantResponse(data, shouldSave = true) {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  const pillHtml = data.modelName ? 
    `<div class="routing-header-pill"><span>⚡ ${data.modelName} • ${data.latencyMs}ms • Saved $${(data.dollarsSaved || 0).toFixed(4)}</span></div>` : 
    '';
  row.innerHTML = `${pillHtml}<div class="msg-bubble-assistant">${formatMarkdown(data.response || '')}</div>`;
  elements.messages.appendChild(row);
  if (shouldSave) saveMessageToCurrentChat('assistant', data);
}

function appendLoading() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `<div class="routing-header-pill"><span>⚡ Jev Routing...</span></div><div class="msg-bubble-assistant"><span>Analyzing complexity and routing model...</span></div>`;
  elements.messages.appendChild(row);
  return row;
}

function extractAndSaveArtifact(userPrompt, responseText) {
  if (!responseText) return;
  const match = responseText.match(/```([a-z0-9_-]*)\n([\s\S]*?)```/);
  if (match) {
    const lang = match[1] || 'javascript';
    const code = match[2].trim();
    fetch('/api/artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: userPrompt.slice(0, 32) + ' snippet',
        type: 'code',
        language: lang,
        code
      })
    }).catch(() => {});
  }
}

// ============================================
// PROJECTS MANAGER (REAL API)
// ============================================
async function openProjectsModal() {
  elements.projectsModal.style.display = 'flex';
  renderProjectsList(getLocalProjects());
}

function getLocalProjects() {
  if (!currentWallet) return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PROJECTS_PREFIX + currentWallet.toLowerCase()) || '[]');
  } catch {
    return [];
  }
}

function saveLocalProjects(projects) {
  if (!currentWallet) return;
  localStorage.setItem(STORAGE_PROJECTS_PREFIX + currentWallet.toLowerCase(), JSON.stringify(projects));
}

function renderProjectsList(projects) {
  elements.projectsList.innerHTML = '';
  if (projects.length === 0) {
    elements.projectsList.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:12px 0;">${currentWallet ? 'No projects created yet. Create your first workspace above.' : 'Connect your wallet to create and access your private projects.'}</div>`;
    return;
  }

  projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'project-item-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:13px;font-family:var(--font-serif);">${escapeHtml(p.name)}</strong>
        <span style="font-size:10px;color:var(--text-muted);">${p.createdAt || '2026-09-19'}</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(p.description || 'Workspace container')}</div>
      <div style="font-size:10.5px;color:var(--accent-terracotta);margin-top:4px;font-weight:600;">✓ Active Workspace</div>
    `;
    card.addEventListener('click', () => {
      elements.projectsModal.style.display = 'none';
      if (elements.topbarTitle) elements.topbarTitle.textContent = `${p.name} • Project`;
    });
    elements.projectsList.appendChild(card);
  });
}

async function handleCreateProject() {
  if (!currentWallet) {
    elements.gateOverlay.style.display = 'flex';
    return;
  }
  const name = elements.newProjName.value.trim();
  const desc = elements.newProjDesc.value.trim();
  if (!name) { alert('Enter a project name'); return; }

  const projects = getLocalProjects();
  projects.unshift({
    id: `project-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    name,
    description: desc,
    createdAt: new Date().toISOString().slice(0, 10),
    chatCount: 0
  });
  saveLocalProjects(projects);
  elements.newProjName.value = '';
  elements.newProjDesc.value = '';
  renderProjectsList(projects);
}

// ============================================
// ARTIFACTS GALLERY (REAL PREVIEW & SAVE)
// ============================================
let loadedArtifacts = [];
let selectedArtifactIndex = 0;

async function openArtifactsModal() {
  elements.artifactsModal.style.display = 'flex';

  try {
    const res = await fetch('/api/artifacts');
    const data = await res.json();
    loadedArtifacts = data.artifacts || [];
    renderArtifactsGallery();
  } catch (e) {
    console.error('Artifacts fetch error:', e);
  }
}

function renderArtifactsGallery() {
  elements.artifactsList.innerHTML = '';
  if (loadedArtifacts.length === 0) {
    elements.artifactsList.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">No artifacts generated yet.</div>';
    return;
  }

  loadedArtifacts.forEach((art, idx) => {
    const item = document.createElement('div');
    const isActive = idx === selectedArtifactIndex;
    item.className = `artifact-list-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <div style="font-weight:600;">${escapeHtml(art.title)}</div>
      <div style="font-size:10px;color:var(--text-muted);">${art.language || 'code'} • ${art.createdAt || '2026-09-19'}</div>
    `;
    item.addEventListener('click', () => {
      selectedArtifactIndex = idx;
      renderArtifactsGallery();
    });
    elements.artifactsList.appendChild(item);
  });

  const activeArt = loadedArtifacts[selectedArtifactIndex] || loadedArtifacts[0];
  if (activeArt) {
    elements.artifactTitle.textContent = activeArt.title;
    elements.artifactCode.textContent = activeArt.code || '// No code';
  }
}

function copyActiveArtifact() {
  const activeArt = loadedArtifacts[selectedArtifactIndex];
  if (activeArt && activeArt.code) {
    navigator.clipboard.writeText(activeArt.code);
    elements.btnCopyArtifact.textContent = '✓ Copied!';
    setTimeout(() => { elements.btnCopyArtifact.textContent = '📋 Copy'; }, 1500);
  }
}

function downloadActiveArtifact() {
  const activeArt = loadedArtifacts[selectedArtifactIndex];
  if (!activeArt) return;
  const blob = new Blob([activeArt.code || ''], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ext = activeArt.language === 'json' ? 'json' : activeArt.language === 'markdown' ? 'md' : 'js';
  a.download = `${activeArt.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// AGENT WARDEN PRE-FLIGHT TEST BENCH
// ============================================
function openWardenModal() {
  elements.wardenModal.style.display = 'flex';
}

async function runWardenCheck(commandToTest) {
  const cmd = commandToTest || elements.wardenInput.value.trim();
  if (!cmd) return;

  elements.btnRunWarden.textContent = 'Evaluating...';
  try {
    const res = await fetch('/api/warden-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });

    const data = await res.json();
    elements.wardenBox.style.display = 'block';

    const decision = data.decision || 'AUTO_ALLOW';
    elements.wardenBadge.textContent = decision;
    elements.wardenReason.textContent = data.reasons?.join(' | ') || 'Command verified safe.';

    if (decision === 'BLOCKED_RISKY') {
      elements.wardenBadge.style.background = 'rgba(225, 29, 72, 0.15)';
      elements.wardenBadge.style.color = '#e11d48';
    } else if (decision === 'NEEDS_CONFIRM') {
      elements.wardenBadge.style.background = 'rgba(245, 158, 11, 0.15)';
      elements.wardenBadge.style.color = '#b45309';
    } else {
      elements.wardenBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      elements.wardenBadge.style.color = '#059669';
    }

    const q = data.questions || {};
    const checks = data.checks || {};
    const fileCheck = checks.fileCheck || q.is_right_file || {};
    const irrevCheck = checks.irrevCheck || q.is_irreversible || {};
    const loopCheck = checks.loopCheck || q.are_we_looping || {};
    const doneCheck = checks.doneCheck || q.are_we_done || {};

    const isFileSafe = fileCheck.ok !== false;
    elements.wardenChkFile.textContent = `1. File: ${isFileSafe ? '✓ Safe' : '✗ Protected'}`;
    elements.wardenChkFile.style.color = isFileSafe ? '#059669' : '#e11d48';

    const isIrreversible = irrevCheck.irreversible === true;
    elements.wardenChkIrrev.textContent = `2. Irreversible: ${isIrreversible ? '✗ Dangerous' : '✓ Safe'}`;
    elements.wardenChkIrrev.style.color = isIrreversible ? '#e11d48' : '#059669';

    const isLooping = loopCheck.looping === true;
    elements.wardenChkLoop.textContent = `3. Loop: ${isLooping ? '✗ Loop' : '✓ OK'}`;
    elements.wardenChkLoop.style.color = isLooping ? '#e11d48' : '#059669';

    const isDone = doneCheck.done === true;
    elements.wardenChkDone.textContent = `4. Finished: ${isDone ? '✓ Done' : '○ Ongoing'}`;

  } catch (e) {
    alert('Warden check failed');
  } finally {
    elements.btnRunWarden.textContent = 'Evaluate';
  }
}

// ============================================
// MODEL ROUTER MODAL
// ============================================
async function openRouterModal() {
  elements.routerModal.style.display = 'flex';

  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load OpenRouter models');
    renderModelRouterGrid(data.models || []);
  } catch (e) {
    elements.routerModelsGrid.innerHTML = `<div style="grid-column:1/-1;color:#b91c1c;font-size:12px;padding:12px;">${escapeHtml(e.message)}</div>`;
  }
}

function renderModelRouterGrid(modelsMap) {
  elements.routerModelsGrid.innerHTML = '';
  const entries = Array.isArray(modelsMap)
    ? modelsMap.map(model => [model.id, {
      name: model.name || model.id,
      tier: model.architecture?.modality === 'text->text' ? 'TEXT' : 'MULTIMODAL',
      cost: Number(model.pricing?.prompt || 0) * 1000000
    }])
    : Object.entries(modelsMap);
  elements.routerModelCount.textContent = `${entries.length}+ Models`;

  entries.forEach(([id, m]) => {
    const card = document.createElement('div');
    card.className = 'router-model-card';
    card.innerHTML = `
      <div style="font-weight:600;display:flex;justify-content:space-between;">
        <span>${escapeHtml(m.name)}</span>
        <span style="color:var(--accent-terracotta);font-size:10px;">${m.tier?.toUpperCase()}</span>
      </div>
      <div style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">${id}</div>
      <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Est: $${m.cost}/1M tokens</div>
    `;
    card.addEventListener('click', () => {
      if (![...elements.modelSelect.options].some(option => option.value === id)) {
        elements.modelSelect.add(new Option(m.name, id));
      }
      elements.modelSelect.value = id;
      elements.routerModal.style.display = 'none';
    });
    elements.routerModelsGrid.appendChild(card);
  });
}

function filterRouterModels() {
  const q = elements.routerModelSearch.value.toLowerCase();
  const cards = elements.routerModelsGrid.querySelectorAll('.router-model-card');
  cards.forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(q) ? 'block' : 'none';
  });
}

function refreshInlineModelOptions(query = '') {
  if (!elements.modelSelect || !allOpenRouterModels.length) return;
  const selected = elements.modelSelect.value;
  const allowed = userTier?.allowedModels || [];
  const canUseAll = allowed.includes('all') || !currentWallet;
  const needle = query.trim().toLowerCase();
  const models = allOpenRouterModels.filter(model => {
    const haystack = `${model.id} ${model.name || ''}`.toLowerCase();
    const matchesSearch = !needle || haystack.includes(needle);
    const allowedForTier = canUseAll || allowed.some(rule => model.id === rule || model.id.startsWith(rule));
    return matchesSearch && allowedForTier;
  }).slice(0, 80);
  elements.modelSelect.innerHTML = '<option value="auto">Jev Router • Auto (OpenRouter)</option>';
  models.forEach(model => elements.modelSelect.add(new Option(model.name || model.id, model.id)));
  if ([...elements.modelSelect.options].some(option => option.value === selected)) elements.modelSelect.value = selected;
}

async function loadOpenRouterModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    if (res.ok && Array.isArray(data.models)) {
      allOpenRouterModels = data.models;
      refreshInlineModelOptions(elements.modelInlineSearch?.value || '');
    }
  } catch (err) {
    console.warn('Model catalog unavailable:', err.message);
  }
}

function handleAttachment(file) {
  if (!file) return;
  const maxBytes = 1024 * 1024;
  if (file.size > maxBytes) {
    alert('Attachment is too large. Please choose a file under 1 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingAttachment = { name: file.name, text: String(reader.result || '') };
    if (elements.attachmentChip) {
      elements.attachmentChip.hidden = false;
      elements.attachmentChip.textContent = `📎 ${file.name} ×`;
    }
  };
  reader.onerror = () => alert('Could not read this attachment.');
  reader.readAsText(file);
}

function toggleVoiceDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Voice dictation is not supported in this browser. Try Chrome or Edge.');
    return;
  }
  if (speechRecognition) {
    speechRecognition.stop();
    speechRecognition = null;
    elements.voiceBtn?.classList.remove('recording');
    return;
  }
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = navigator.language || 'en-US';
  speechRecognition.onresult = event => {
    const transcript = [...event.results].map(result => result[0].transcript).join('');
    elements.input.value = transcript;
    elements.input.dispatchEvent(new Event('input'));
  };
  speechRecognition.onerror = event => {
    if (event.error !== 'aborted') alert(`Voice dictation failed: ${event.error}`);
    speechRecognition = null;
    elements.voiceBtn?.classList.remove('recording');
  };
  speechRecognition.onend = () => {
    speechRecognition = null;
    elements.voiceBtn?.classList.remove('recording');
  };
  speechRecognition.start();
  elements.voiceBtn?.classList.add('recording');
}

async function toggleAudioRecording() {
  if (audioRecorder?.state === 'recording') {
    audioRecorder.stop();
    elements.audioBtn.textContent = '✓';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alert('Audio recording is not supported in this browser.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    audioRecorder = new MediaRecorder(stream);
    audioRecorder.ondataavailable = event => { if (event.data.size) audioChunks.push(event.data); };
    audioRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(audioChunks, { type: audioRecorder.mimeType || 'audio/webm' });
      pendingAttachment = { name: `voice-note-${Date.now()}.webm`, blob, text: '[Voice recording attached]' };
      if (elements.attachmentChip) {
        elements.attachmentChip.hidden = false;
        elements.attachmentChip.textContent = `🎙️ Voice note ready ×`;
      }
      elements.audioBtn.textContent = '◉';
      elements.audioBtn.classList.remove('recording');
    };
    audioRecorder.start();
    elements.audioBtn.textContent = '■';
    elements.audioBtn.classList.add('recording');
  } catch (err) {
    alert(`Microphone permission was not granted: ${err.message}`);
  }
}

// ============================================
// SEARCH & TRANSCRIPT EXPORT
// ============================================
function openSearchModal() {
  elements.searchModal.style.display = 'flex';
  elements.chatSearchInput.focus();
}

function handleSearchMessages() {
  const query = elements.chatSearchInput.value.trim().toLowerCase();
  if (!query) {
    elements.chatSearchResults.innerHTML = 'Type above to search messages across all sessions.';
    return;
  }

  const chats = getSavedChats();
  let matches = [];

  chats.forEach(c => {
    c.messages.forEach(m => {
      if (m.content && m.content.toLowerCase().includes(query)) {
        matches.push({ chatTitle: c.title, chatId: c.id, content: m.content, role: m.role });
      }
    });
  });

  if (matches.length === 0) {
    elements.chatSearchResults.innerHTML = '<div style="color:var(--text-muted);">No matching messages found.</div>';
    return;
  }

  elements.chatSearchResults.innerHTML = matches.map(m => `
    <div style="padding:6px;border-bottom:1px solid var(--border-light);cursor:pointer;" onclick="switchFromSearch('${m.chatId}')">
      <span style="font-weight:600;font-size:11px;color:var(--accent-terracotta);">${escapeHtml(m.chatTitle)}</span>
      <div style="font-size:11.5px;">${escapeHtml(m.content.slice(0, 100))}...</div>
    </div>
  `).join('');
}

window.switchFromSearch = function(chatId) {
  elements.searchModal.style.display = 'none';
  setActiveChatId(chatId);
  renderChatsList();
  loadChatMessages(chatId);
};

function exportCurrentChat(format = 'json') {
  const chats = getSavedChats();
  const chat = chats.find(c => c.id === currentChatId);
  if (!chat) return;

  let blob;
  let filename = `${chat.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  if (format === 'json') {
    blob = new Blob([JSON.stringify(chat, null, 2)], { type: 'application/json' });
    filename += '.json';
  } else {
    let md = `# ${chat.title}\n\nDate: ${new Date(chat.createdAt).toLocaleString()}\n\n`;
    chat.messages.forEach(m => {
      md += `### ${m.role === 'user' ? 'User' : 'Jev Brain (' + (m.modelName || 'Router') + ')'}\n\n${m.content}\n\n---\n\n`;
    });
    blob = new Blob([md], { type: 'text/markdown' });
    filename += '.md';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// DYNAMIC TIER MODAL (DEXSCREENER SYNCED)
// ============================================
const TOKEN_CA = 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump';

function copyCA() {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(TOKEN_CA).then(showCopiedFeedback).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function fallbackCopy() {
  try {
    const tempInput = document.createElement('input');
    tempInput.value = TOKEN_CA;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showCopiedFeedback();
  } catch (e) {
    prompt('Copy Token Contract Address (CA):', TOKEN_CA);
  }
}

function showCopiedFeedback() {
  const targets = [
    document.getElementById('copy-ca-btn'),
    document.getElementById('hero-copy-ca')
  ];
  targets.forEach(btn => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✅ Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    }
  });
}

async function loadMarketInfo() {
  try {
    const res = await fetch('/api/market-info');
    if (res.ok) {
      const data = await res.json();
      const m = data.marketData || {};
      const mc = m.marketCap || 100000;
      const price = m.priceUsd || 0.0001;
      const vol = m.volume24h || 0;
      const liq = m.liquidityUsd || 0;

      const formatUsd = (num) => {
        if (!num || isNaN(num)) return '$0';
        if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
        if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
        return `$${Number(num).toFixed(2)}`;
      };

      const formatPrice = (p) => {
        if (!p || isNaN(p)) return '$0.00';
        if (p < 0.0001) return `$${Number(p).toFixed(7)}`;
        if (p < 0.01) return `$${Number(p).toFixed(5)}`;
        return `$${Number(p).toFixed(4)}`;
      };

      // Topbar MC display
      if (elements.mc) elements.mc.textContent = formatUsd(mc);

      // Hero Token Widget updates
      const heroMc = document.getElementById('hero-mc');
      const heroPrice = document.getElementById('hero-price');
      const heroVol = document.getElementById('hero-vol');
      const heroLiq = document.getElementById('hero-liq');

      if (heroMc) heroMc.textContent = formatUsd(mc);
      if (heroPrice) heroPrice.textContent = formatPrice(price);
      if (heroVol) heroVol.textContent = formatUsd(vol);
      if (heroLiq) heroLiq.textContent = formatUsd(liq);

      renderTierModalTable(data);
    }
  } catch (e) {
    console.warn('Market info fetch failed:', e);
  }
}

function renderTierModalTable(data) {
  const modalMc = document.getElementById('modal-mc');
  const modalPrice = document.getElementById('modal-price');
  const modalTrust = document.getElementById('modal-trust');
  const container = document.getElementById('tier-table-container');
  if (!container) return;

  const mc = data?.marketData?.marketCap || 100000;
  const price = data?.marketData?.priceUsd || (mc / 1000000000);
  const trust = data?.trustFactor || Math.max(1.0, Math.sqrt(mc / 100000));

  if (modalMc) modalMc.textContent = mc >= 1000000 ? `$${(mc / 1000000).toFixed(2)}M` : `$${(mc / 1000).toFixed(1)}K`;
  if (modalPrice) modalPrice.textContent = `$${price.toFixed(6)}`;
  if (modalTrust) modalTrust.textContent = `${trust.toFixed(2)}x`;

  const tiers = data?.dynamicTiers || [];
  let html = `
    <table>
      <thead>
        <tr>
          <th>Tier</th>
          <th>Min Bag ($)</th>
          <th>Tokens Needed</th>
          <th>Multiplier</th>
          <th>Unlocked AI Models</th>
        </tr>
      </thead>
      <tbody>
  `;

  tiers.forEach(t => {
    const isActive = userTier?.tierName === t.name;
    const activeClass = isActive ? 'tier-row-active' : '';
    html += `
      <tr class="${activeClass}">
        <td class="tier-badge-cell">${isActive ? '● ' : ''}${t.name}</td>
        <td><strong>$${t.requiredUsd.toLocaleString()}</strong></td>
        <td>${t.requiredTokens.toLocaleString()}</td>
        <td>${t.weight}x (${t.cutPct}% Cut)</td>
        <td style="font-size:11px;color:var(--text-secondary);">${t.description}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ============================================
// MARKDOWN & STRING FORMATTING
// ============================================
function formatMarkdown(text) {
  if (!text) return '';
  let content = escapeHtml(text);
  content = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  content = content.replace(/\*(.*?)\*/g, '<i>$1</i>');
  content = content.replace(/`([^`]+)`/g, '<code style="background:var(--bg-pill);padding:2px 5px;border-radius:4px;font-family:var(--font-mono);font-size:12px;">$1</code>');
  content = content.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/g, '<pre style="background:var(--bg-pill);padding:10px;border-radius:6px;font-family:var(--font-mono);font-size:12px;overflow-x:auto;"><code>$2</code></pre>');
  content = content.replace(/\n/g, '<br>');
  return content;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================
// ATTACH EVENT LISTENERS
// ============================================

// ============================================
// MOBILE RUNNER (ANDROID DEVICE GATEWAY)
// ============================================
let mobilePollInterval = null;

async function openMobileModal() {
  const modal = document.getElementById('mobile-modal');
  if (modal) modal.style.display = 'flex';
  await refreshMobileDevices();
  await refreshMobileLogs();
  if (!mobilePollInterval) {
    mobilePollInterval = setInterval(refreshMobileLogs, 4000);
  }
}

function closeMobileModal() {
  const modal = document.getElementById('mobile-modal');
  if (modal) modal.style.display = 'none';
  if (mobilePollInterval) {
    clearInterval(mobilePollInterval);
    mobilePollInterval = null;
  }
}

async function refreshMobileDevices() {
  try {
    const res = await fetch('/api/mobile/devices');
    const data = await res.json();
    const select = document.getElementById('mobile-device-select');
    if (select && data.devices) {
      select.innerHTML = '';
      data.devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.name} • ADB`;
        select.appendChild(opt);
      });
      const hasDevice = data.devices.length > 0;
      const empty = document.getElementById('mobile-empty-state');
      const phone = document.getElementById('mobile-phone-frame');
      if (empty) empty.style.display = hasDevice ? 'none' : 'flex';
      if (phone) phone.style.display = hasDevice ? 'flex' : 'none';
      document.querySelectorAll('#mobile-modal .warden-preset-btn, #mobile-modal .phone-icon-btn').forEach(button => { button.disabled = !hasDevice; });
      if (!hasDevice) select.innerHTML = '<option value="">No ADB device connected</option>';
    }
  } catch (e) {
    console.error('Failed to load mobile devices:', e);
  }
}

async function executeMobileAction(action) {
  const select = document.getElementById('mobile-device-select');
  const deviceId = select ? select.value : 'pixel-8-virtual';
  
  try {
    const res = await fetch('/api/mobile/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, ...action })
    });
    const result = await res.json();
    await refreshMobileScreen();
    await refreshMobileLogs();
    return result;
  } catch (e) {
    console.error('Mobile action error:', e);
  }
}

async function refreshMobileScreen() {
  const select = document.getElementById('mobile-device-select');
  const deviceId = select ? select.value : 'pixel-8-virtual';
  try {
    const res = await fetch(`/api/mobile/screen?deviceId=${deviceId}`);
    const data = await res.json();
    const titleEl = document.getElementById('phone-app-title');
    const subEl = document.getElementById('phone-sub-state');
    if (titleEl && data.foregroundPackage) {
      titleEl.textContent = data.foregroundPackage.split('.').pop() || 'Android';
    }
    if (subEl && data.foregroundPackage) {
      subEl.textContent = `Foreground: ${data.foregroundPackage}`;
    }
  } catch (e) {
    console.error('Screen refresh error:', e);
  }
}

async function refreshMobileLogs() {
  try {
    const res = await fetch('/api/mobile/logs');
    const data = await res.json();
    const container = document.getElementById('mobile-logs-container');
    if (!container || !data.logs) return;

    if (data.logs.length === 0) {
      container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:12px;">No actions recorded yet. Tap on screen or click actions above.</div>';
      return;
    }

    container.innerHTML = '';
    data.logs.slice(0, 15).forEach(l => {
      const card = document.createElement('div');
      card.className = 'mobile-log-card';
      const badgeColor = l.verdict === 'AUTO_ALLOW' ? '#10b981' : l.verdict === 'NEEDS_CONFIRM' ? '#f59e0b' : '#ef4444';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;font-family:var(--font-mono);">${escapeHtml(l.action.toUpperCase())}</span>
          <span style="font-size:10px;font-weight:600;color:${badgeColor};border:1px solid ${badgeColor};padding:1px 5px;border-radius:4px;">${l.verdict}</span>
        </div>
        <div style="font-size:10.5px;color:var(--text-secondary);font-family:var(--font-mono);">${escapeHtml(l.output || l.reason || '')}</div>
        <div style="font-size:9.5px;color:var(--text-muted);text-align:right;">${l.latencyMs}ms • ${new Date(l.timestamp).toLocaleTimeString()}</div>
      `;
      container.appendChild(card);
    });
  } catch (e) {
    console.error('Failed to refresh mobile logs:', e);
  }
}

function bindEvents() {
  // Wallet
  elements.connectBtn?.addEventListener('click', connectMetaMaskWallet);
  elements.disconnectBtn?.addEventListener('click', disconnectWallet);

  // New Chat
  elements.newChatBtn?.addEventListener('click', createNewChat);

  // Sidebar Feature Navigation
  elements.navProjects?.addEventListener('click', (e) => { e.preventDefault(); openProjectsModal(); });
  elements.navArtifacts?.addEventListener('click', (e) => { e.preventDefault(); openArtifactsModal(); });
  elements.navWarden?.addEventListener('click', (e) => { e.preventDefault(); openWardenModal(); });
  elements.navRouter?.addEventListener('click', (e) => { e.preventDefault(); openRouterModal(); });

  // Modals Close
  elements.projectsClose?.addEventListener('click', () => { elements.projectsModal.style.display = 'none'; });
  elements.artifactsClose?.addEventListener('click', () => { elements.artifactsModal.style.display = 'none'; });
  elements.wardenClose?.addEventListener('click', () => { elements.wardenModal.style.display = 'none'; });
  elements.routerClose?.addEventListener('click', () => { elements.routerModal.style.display = 'none'; });
  elements.searchClose?.addEventListener('click', () => { elements.searchModal.style.display = 'none'; });
  elements.tierClose?.addEventListener('click', () => { elements.tierModal.style.display = 'none'; });

  // Modal Backdrop Click
  [elements.projectsModal, elements.artifactsModal, elements.wardenModal, elements.routerModal, elements.searchModal, elements.tierModal].forEach(m => {
    m?.addEventListener('click', (e) => {
      if (e.target === m) m.style.display = 'none';
    });
  });

  // Projects Modal
  elements.btnCreateProject?.addEventListener('click', handleCreateProject);

  // Artifacts Modal
  elements.btnCopyArtifact?.addEventListener('click', copyActiveArtifact);
  elements.btnDownloadArtifact?.addEventListener('click', downloadActiveArtifact);

  // Warden Presets & Test
  elements.btnRunWarden?.addEventListener('click', () => runWardenCheck());
  document.querySelectorAll('.warden-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      elements.wardenInput.value = cmd;
      runWardenCheck(cmd);
    });
  });

  // Router Search
  elements.routerModelSearch?.addEventListener('input', filterRouterModels);

  // Profile Bottom Actions
  elements.btnProfileDownload?.addEventListener('click', () => exportCurrentChat('md'));
  elements.btnProfileSearch?.addEventListener('click', openSearchModal);
  elements.chatSearchInput?.addEventListener('input', handleSearchMessages);
  elements.btnExportJson?.addEventListener('click', () => exportCurrentChat('json'));
  elements.btnExportMd?.addEventListener('click', () => exportCurrentChat('md'));

  // Tier Pill
  elements.tierPill?.addEventListener('click', (e) => {
    if (e.target.id === 'disconnect-btn') return;
    elements.tierModal.style.display = 'flex';
  });
  elements.mcPill?.addEventListener('click', () => {
    elements.tierModal.style.display = 'flex';
  });

  // Sidebar Collapse
  elements.collapseBtn?.addEventListener('click', () => {
    elements.sidebar.classList.add('collapsed');
    elements.reopenBtn?.classList.add('visible');
  });
  elements.reopenBtn?.addEventListener('click', () => {
    elements.sidebar.classList.remove('collapsed');
    elements.reopenBtn.classList.remove('visible');
  });

  // Chat Input
  elements.attachBtn?.addEventListener('click', () => elements.attachmentInput?.click());
  elements.attachmentInput?.addEventListener('change', event => handleAttachment(event.target.files?.[0]));
  elements.attachmentChip?.addEventListener('click', () => {
    pendingAttachment = null;
    elements.attachmentChip.hidden = true;
    if (elements.attachmentInput) elements.attachmentInput.value = '';
  });
  elements.voiceBtn?.addEventListener('click', toggleVoiceDictation);
  elements.audioBtn?.addEventListener('click', toggleAudioRecording);
  elements.modelInlineSearch?.addEventListener('input', event => refreshInlineModelOptions(event.target.value));

  elements.input?.addEventListener('input', () => {
    elements.input.style.height = 'auto';
    elements.input.style.height = Math.min(elements.input.scrollHeight, 180) + 'px';
  });
  elements.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  });
  elements.sendBtn?.addEventListener('click', handleSubmit);

  // Web3 & MetaMask Modal & Topbar Events
  const topbarWalletBtn = document.getElementById('topbar-connect-wallet-btn');
  const walletModal = document.getElementById('rainbow-modal');
  const walletModalClose = document.getElementById('rainbow-modal-close');
  const walletModalConn = document.getElementById('rainbow-modal-connect-btn');
  const walletModalDisc = document.getElementById('rainbow-modal-disconnect-btn');

  topbarWalletBtn?.addEventListener('click', () => {
    if (!currentWallet) {
      connectMetaMaskWallet();
    } else {
      if (walletModal) walletModal.style.display = 'flex';
    }
  });

  walletModalClose?.addEventListener('click', () => {
    if (walletModal) walletModal.style.display = 'none';
  });

  walletModalConn?.addEventListener('click', async () => {
    await connectMetaMaskWallet();
    if (walletModal) walletModal.style.display = 'none';
  });


  walletModalDisc?.addEventListener('click', () => {
    disconnectWallet();
    if (walletModal) walletModal.style.display = 'none';
  });

  // Onboarding Form & Profile Editing Events
  elements.onboardingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elements.onboardingNameInput ? elements.onboardingNameInput.value.trim() : '';
    const email = elements.onboardingEmailInput ? elements.onboardingEmailInput.value.trim() : '';
    if (!name) {
      alert('Please enter your name.');
      return;
    }
    if (!email) {
      alert('Please enter your email address.');
      return;
    }
    if (currentWallet) {
      await saveUserProfile(currentWallet, name, email);
      if (elements.onboardingModal) elements.onboardingModal.style.display = 'none';
    }
  });

  elements.onboardingClose?.addEventListener('click', () => {
    if (elements.onboardingModal) elements.onboardingModal.style.display = 'none';
  });

  elements.profileBar?.addEventListener('click', () => {
    if (currentWallet) {
      promptOnboarding(currentWallet);
    }
  });


  // Mobile Runner Events
  document.getElementById('nav-mobile')?.addEventListener('click', (e) => {
    e.preventDefault();
    openMobileModal();
  });
  document.getElementById('mobile-modal-close')?.addEventListener('click', closeMobileModal);
  document.getElementById('btn-refresh-devices')?.addEventListener('click', refreshMobileDevices);

  // Phone screen canvas click for direct tap
  const phoneCanvas = document.getElementById('phone-screen-canvas');
  phoneCanvas?.addEventListener('click', (e) => {
    if (e.target.closest('.phone-nav-bar') || e.target.closest('.phone-icon-btn')) return;
    const rect = phoneCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaledX = Math.round((clickX / rect.width) * 1080);
    const scaledY = Math.round((clickY / rect.height) * 2400);

    const ripple = document.getElementById('phone-tap-indicator');
    if (ripple) {
      ripple.style.left = clickX + 'px';
      ripple.style.top = clickY + 'px';
      ripple.style.display = 'block';
      setTimeout(() => { ripple.style.display = 'none'; }, 400);
    }

    executeMobileAction({ type: 'tap', x: scaledX, y: scaledY });
  });

  document.querySelectorAll('.phone-icon-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const pkg = btn.getAttribute('data-pkg');
      const x = btn.getAttribute('data-x');
      const y = btn.getAttribute('data-y');
      if (action === 'launch') {
        executeMobileAction({ type: 'launch', package: pkg });
      } else {
        executeMobileAction({ type: 'tap', x: parseInt(x, 10), y: parseInt(y, 10) });
      }
    });
  });

  document.getElementById('btn-phone-back')?.addEventListener('click', () => executeMobileAction({ type: 'key', key: 'BACK' }));
  document.getElementById('btn-phone-home')?.addEventListener('click', () => executeMobileAction({ type: 'key', key: 'HOME' }));
  document.getElementById('btn-phone-recents')?.addEventListener('click', () => executeMobileAction({ type: 'key', key: 'APP_SWITCH' }));

  document.getElementById('btn-mobile-open-chrome')?.addEventListener('click', () => executeMobileAction({ type: 'launch', package: 'com.android.chrome' }));
  document.getElementById('btn-mobile-open-settings')?.addEventListener('click', () => executeMobileAction({ type: 'launch', package: 'com.android.settings' }));
  document.getElementById('btn-mobile-type')?.addEventListener('click', () => executeMobileAction({ type: 'type', text: 'Jev Brain Autonomous Agent' }));
  document.getElementById('btn-mobile-swipe-up')?.addEventListener('click', () => executeMobileAction({ type: 'swipe', x1: 540, y1: 1800, x2: 540, y2: 600, duration: 250 }));
  document.getElementById('btn-mobile-inspect')?.addEventListener('click', refreshMobileScreen);

  // Contract Address (CA) One-Click Copy
  document.getElementById('copy-ca-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    copyCA();
  });
  document.getElementById('ca-pill')?.addEventListener('click', () => {
    copyCA();
  });
  document.getElementById('hero-copy-ca')?.addEventListener('click', (e) => {
    e.stopPropagation();
    copyCA();
  });

}

// ============================================
// APP INITIALIZATION
// ============================================
async function init() {
  console.log('⚡ Jev Brain — Initializing Legit Web3 AI Platform');
  bindEvents();
  registerWalletProviderListeners();
  initChats();
  await loadMarketInfo();
  await loadOpenRouterModels();
  setInterval(loadMarketInfo, 15000); // 15s Live DexScreener Polling

  // Check persisted wallet, but never trust the locally cached tier blindly:
  // the saved session token must validate against the server first.
  const savedWallet = localStorage.getItem(STORAGE_WALLET_KEY);
  if (savedWallet) {
    try {
      const savedTier = JSON.parse(localStorage.getItem(STORAGE_TIER_PREFIX + savedWallet.toLowerCase()) || 'null');
      if (!savedTier || !getSessionToken()) {
        elements.gateOverlay.style.display = 'flex';
      } else {
        const validation = await fetch('/api/session/validate', { headers: authHeaders() });
        const validationData = await validation.json().catch(() => ({}));
        if (validation.ok && validationData.valid && validationData.address === savedWallet.toLowerCase()) {
          await onWalletAuthenticated(savedWallet, 0, savedTier);
        } else {
          // Stale/expired session: force a fresh wallet signature.
          sessionStorage.removeItem(STORAGE_SESSION_TOKEN);
          localStorage.removeItem(STORAGE_SESSION_TOKEN);
          elements.gateOverlay.style.display = 'flex';
        }
      }
    } catch {
      disconnectWallet();
    }
  } else {
    elements.gateOverlay.style.display = 'flex';
  }
}

// Start
init();
