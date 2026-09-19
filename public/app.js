// Jev Brain - Real Web3 AI Platform

let currentWallet = null;
let isTokenHolder = false;
let userTier = null;
let totalSavingsUsd = 0.00;
let allModels = [];

const elements = {
  center: document.getElementById('claude-center'),
  hero: document.getElementById('claude-hero'),
  messages: document.getElementById('messages-stream'),
  input: document.getElementById('prompt-input'),
  sendBtn: document.getElementById('send-btn'),
  modelSelect: document.getElementById('model-select'),
  newChatBtn: document.getElementById('new-chat-btn'),
  savedPill: document.getElementById('total-saved-pill'),
  collapseBtn: document.getElementById('collapse-sidebar-btn'),
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
  holder: document.getElementById('holder-status-text')
};

async function loadModels() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const data = await res.json();
    allModels = data.data || [];
    console.log('Loaded ' + allModels.length + ' models');
    
    if (elements.modelSelect) {
      elements.modelSelect.innerHTML = '<option value="auto">Auto (Smart Router)</option>';
      allModels.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        elements.modelSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Models load error:', e);
  }
}

function addSearch() {
  if (!elements.modelSelect) return;
  const wrap = document.createElement('div');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search models...';
  input.style.cssText = 'width:100%;padding:6px;margin:4px 0;border:1px solid #ddd;border-radius:6px;';
  
  input.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    Array.from(elements.modelSelect.options).forEach(o => {
      o.style.display = o.text.toLowerCase().includes(q) ? 'block' : 'none';
    });
  });
  
  wrap.appendChild(input);
  elements.modelSelect.parentNode.insertBefore(wrap, elements.modelSelect);
}

async function loadMarket() {
  try {
    const res = await fetch('/api/market-info');
    if (res.ok) {
      const data = await res.json();
      const mc = data.marketData?.marketCap || 0;
      if (mc > 0 && elements.mc) {
        elements.mc.textContent = mc >= 1000000 ? '$' + (mc/1000000).toFixed(2) + 'M' : '$' + (mc/1000).toFixed(1) + 'K';
      }
    }
  } catch (e) {}
}

async function connectWallet() {
  try {
    let provider = null;
    if (typeof window.rainbow !== 'undefined') provider = window.rainbow;
    else if (typeof window.ethereum !== 'undefined') provider = window.ethereum;
    else {
      alert('Install Rainbow Wallet: https://rainbow.me');
      return;
    }
    
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (accounts[0]) await onWalletConnected(accounts[0]);
  } catch (e) {
    alert('Wallet error: ' + e.message);
  }
}

async function onWalletConnected(address) {
  currentWallet = address;
  updateUI(address, 'Verifying...', '#f59e0b');
  
  try {
    const res = await fetch('/api/wallet-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, tokensHeld: 0 })
    });
    
    const data = await res.json();
    
    if (data.unlocked) {
      isTokenHolder = true;
      userTier = data.userTier;
      elements.gateOverlay.style.display = 'none';
      updateUI(address, 'Connected', '#10b981');
      if (elements.tier) elements.tier.textContent = data.userTier?.tierName || 'Member';
      elements.input.focus();
      localStorage.setItem('jevbrain_wallet', address);
    } else {
      isTokenHolder = false;
      elements.gateOverlay.style.display = 'flex';
      updateUI(address, 'Tokens Required', '#dc2626');
      alert('Access Denied: Hold 1M+ tokens to use Jev Brain');
    }
  } catch (e) {
    console.error(e);
    updateUI(address, 'Error', '#dc2626');
  }
}

function updateUI(addr, status, color) {
  const short = addr.slice(0,6) + '...' + addr.slice(-4);
  elements.name.textContent = short;
  elements.status.textContent = status;
  elements.avatar.textContent = addr.slice(2,3).toUpperCase();
  elements.holder.textContent = status;
  elements.holder.style.color = color;
}

function disconnect() {
  currentWallet = null;
  isTokenHolder = false;
  userTier = null;
  elements.gateOverlay.style.display = 'flex';
  elements.holder.textContent = 'Disconnected';
  elements.holder.style.color = '#dc2626';
  elements.status.textContent = 'Not Connected';
  elements.name.textContent = 'Not Connected';
  elements.avatar.textContent = '?';
  localStorage.removeItem('jevbrain_wallet');
}

function newChat() {
  if (!isTokenHolder) {
    elements.gateOverlay.style.display = 'flex';
    return;
  }
  messages = [];
  elements.messages.innerHTML = '';
  elements.input.value = '';
  elements.hero.style.display = 'flex';
  totalSavingsUsd = 0;
  elements.savedPill.textContent = 'Saved $0.0000';
  elements.input.focus();
}

function showArtifacts() {
  if (!isTokenHolder) {
    elements.gateOverlay.style.display = 'flex';
    return;
  }
  const panel = document.createElement('div');
  panel.className = 'artifacts-panel';
  panel.style.cssText = 'position:fixed;top:0;right:0;width:400px;height:100vh;background:#fff;border-left:1px solid #ddd;padding:20px;overflow-y:auto;z-index:1000;box-shadow:-2px 0 8px rgba(0,0,0,0.1);';
  panel.innerHTML = '<h2>Artifacts</h2><p>Your generated code and assets will appear here.</p><button onclick="this.parentElement.remove()" style="position:absolute;top:10px;right:10px;">&times;</button>';
  document.body.appendChild(panel);
}

async function send() {
  if (!isTokenHolder || !currentWallet) {
    elements.gateOverlay.style.display = 'flex';
    return;
  }
  
  const text = elements.input.value.trim();
  if (!text) return;
  
  elements.hero.style.display = 'none';
  appendMsg('user', text);
  elements.input.value = '';
  
  const loading = appendLoading();
  
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, model: elements.modelSelect.value, walletAddress: currentWallet })
    });
    
    const data = await res.json();
    loading.remove();
    appendResponse(data);
    totalSavingsUsd += (data.dollarsSaved || 0);
    elements.savedPill.textContent = 'Saved $' + totalSavingsUsd.toFixed(4);
  } catch (e) {
    loading.remove();
    appendResponse({ response: 'Error: ' + e.message, modelName: 'Error', latencyMs: 0, dollarsSaved: 0 });
  }
}

function appendMsg(role, text) {
  const row = document.createElement('div');
  row.className = 'msg-row ' + role;
  row.innerHTML = '<div class="msg-bubble-' + role + '">' + escapeHtml(text) + '</div>';
  elements.messages.appendChild(row);
}

function appendResponse(data) {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  const pill = data.modelName ? '<div class="routing-header-pill"><span>' + data.modelName + ' • ' + data.latencyMs + 'ms • Saved $' + (data.dollarsSaved||0).toFixed(4) + '</span></div>' : '';
  row.innerHTML = pill + '<div class="msg-bubble-assistant">' + fmt(data.response) + '</div>';
  elements.messages.appendChild(row);
}

function appendLoading() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = '<div class="routing-header-pill"><span>Routing...</span></div><div class="msg-bubble-assistant">Thinking...</div>';
  elements.messages.appendChild(row);
  return row;
}

function fmt(text) {
  if (!text) return '';
  let h = escapeHtml(text);
  h = h.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  h = h.replace(/\*(.*?)\*/g, '<i>$1</i>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/```[a-z]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  return h.replace(/\n/g, '<br>');
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Events
elements.connectBtn?.addEventListener('click', connectWallet);
elements.verifyBtn?.addEventListener('click', connectWallet);
elements.disconnectBtn?.addEventListener('click', disconnect);
elements.newChatBtn?.addEventListener('click', newChat);
document.getElementById('nav-artifacts')?.addEventListener('click', e => { e.preventDefault(); showArtifacts(); });
elements.collapseBtn?.addEventListener('click', () => { elements.sidebar.style.display = elements.sidebar.style.display === 'none' ? 'flex' : 'none'; });
elements.input?.addEventListener('input', () => { elements.input.style.height = 'auto'; elements.input.style.height = Math.min(elements.input.scrollHeight, 180) + 'px'; });
elements.input?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
elements.sendBtn?.addEventListener('click', send);

// Init
(async () => {
  await loadModels();
  addSearch();
  await loadMarket();
  setInterval(loadMarket, 30000);
  
  const saved = localStorage.getItem('jevbrain_wallet');
  if (saved) await onWalletConnected(saved);
})();
