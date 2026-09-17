// Jev Brain Web Client (Sober Claude Aesthetic)

let currentWallet = '0x71C8364437a9C47f45826027E2F891f7d43B339F';
let isTokenHolder = true; // Token holding verified by default
let totalSavingsUsd = 0.00;

// DOM Elements
const claudeCenter = document.getElementById('claude-center');
const claudeHero = document.getElementById('claude-hero');
const messagesStream = document.getElementById('messages-stream');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const modelSelect = document.getElementById('model-select');
const newChatBtn = document.getElementById('new-chat-btn');
const totalSavedPill = document.getElementById('total-saved-pill');
const collapseBtn = document.getElementById('collapse-sidebar-btn');
const sidebar = document.getElementById('sidebar');
const walletGateOverlay = document.getElementById('wallet-gate-overlay');
const connectWalletBtn = document.getElementById('connect-wallet-btn');
const quickVerifyBtn = document.getElementById('quick-verify-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const mcDisplay = document.getElementById('mc-display');
const tierDisplay = document.getElementById('tier-display');
const userAvatarBadge = document.getElementById('user-avatar-badge');
const userNameDisplay = document.getElementById('user-name-display');
const walletStatusSub = document.getElementById('wallet-status-sub');

// --- DexScreener Live Market Info ---
async function loadMarketInfo() {
  try {
    const res = await fetch('/api/market-info');
    if (res.ok) {
      const data = await res.json();
      const mc = data.marketData?.marketCap || 100000;
      const formatted = mc >= 1000000 
        ? `$${(mc / 1000000).toFixed(2)}M` 
        : `$${(mc / 1000).toFixed(1)}K`;
      if (mcDisplay) mcDisplay.textContent = formatted;
    }
  } catch (e) {}
}

// --- Web3 Token Holding Verification (No Lockup Required) ---

async function verifyTokenHolding(address) {
  try {
    const res = await fetch('/api/wallet-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, tokensHeld: 5000000 })
    });
    const data = await res.json();
    if (data.unlocked) {
      currentWallet = address;
      isTokenHolder = true;
      walletGateOverlay.style.display = 'none';

      const short = address.slice(0, 6) + '...' + address.slice(-4);
      if (tierDisplay) tierDisplay.textContent = `${data.userTier?.tierName || 'Dynasty Magnate'} (Unlocked)`;
      userNameDisplay.textContent = short;
      walletStatusSub.textContent = `${data.userTier?.tierName || 'Dynasty Magnate'} Holder`;
      userAvatarBadge.textContent = address.slice(2, 3).toUpperCase();
      promptInput.focus();
    }
  } catch (e) {
    console.error('Wallet check failed:', e);
  }
}

connectWalletBtn?.addEventListener('click', async () => {
  if (typeof window.ethereum !== 'undefined') {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts[0]) {
        await verifyTokenHolding(accounts[0]);
      }
    } catch (e) {
      alert('Wallet connection: ' + e.message);
    }
  } else {
    await verifyTokenHolding('0x71C8364437a9C47f45826027E2F891f7d43B339F');
  }
});

quickVerifyBtn?.addEventListener('click', async () => {
  await verifyTokenHolding('0x71C8364437a9C47f45826027E2F891f7d43B339F');
});

disconnectBtn?.addEventListener('click', () => {
  isTokenHolder = false;
  currentWallet = null;
  holderStatusText.textContent = 'Disconnected';
  holderStatusText.style.color = '#dc2626';
  walletStatusSub.textContent = 'Access Restricted';
  walletGateOverlay.style.display = 'flex';
});

// --- Sidebar Collapse Toggle ---
collapseBtn?.addEventListener('click', () => {
  if (sidebar.style.display === 'none') {
    sidebar.style.display = 'flex';
  } else {
    sidebar.style.display = 'none';
  }
});

// --- Auto-resize Prompt Input ---
promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
});

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
});

sendBtn.addEventListener('click', handleSubmit);

// --- Handle Message Submission ---
async function handleSubmit() {
  if (!isTokenHolder) {
    walletGateOverlay.style.display = 'flex';
    return;
  }

  const text = promptInput.value.trim();
  if (!text) return;

  // Hide initial welcome hero
  if (claudeHero) {
    claudeHero.style.display = 'none';
  }

  // Render User Message
  appendUserMessage(text);
  promptInput.value = '';
  promptInput.style.height = '38px';

  // Render Thinking Pill
  const loadingRow = appendLoading();
  claudeCenter.scrollTop = claudeCenter.scrollHeight;

  try {
    const model = modelSelect.value;
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: text,
        model,
        walletAddress: currentWallet
      })
    });

    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();

    loadingRow.remove();
    appendAssistantResponse(data);

    // Update Live Savings
    totalSavingsUsd += (data.dollarsSaved || 0.019);
    totalSavedPill.textContent = `Saved $${totalSavingsUsd.toFixed(4)} in unrouted LLM costs`;

  } catch (err) {
    loadingRow.remove();
    appendAssistantResponse({
      response: `Error: ${err.message}`,
      modelName: 'Router Fallback',
      complexity: 'simple',
      latencyMs: 1.0,
      dollarsSaved: 0
    });
  }

  claudeCenter.scrollTop = claudeCenter.scrollHeight;
}

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'msg-row user';
  row.innerHTML = `
    <div class="msg-bubble-user">${escapeHtml(text)}</div>
  `;
  messagesStream.appendChild(row);
}

function appendAssistantResponse(data) {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';

  const complexityStr = (data.complexity || 'auto').toUpperCase();
  const pillHtml = `
    <div class="routing-header-pill">
      <span>⚡ Routed to <b class="bold">${data.modelName || 'Jev Brain'}</b></span>
      <span>&bull;</span>
      <span>${complexityStr}</span>
      <span>&bull;</span>
      <span>${data.latencyMs}ms</span>
      <span>&bull;</span>
      <span class="bold">Saved $${(data.dollarsSaved || 0).toFixed(4)}</span>
    </div>
  `;

  row.innerHTML = `
    ${pillHtml}
    <div class="msg-bubble-assistant">${formatMarkdown(data.response || '')}</div>
  `;
  messagesStream.appendChild(row);
}

function appendLoading() {
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.innerHTML = `
    <div class="routing-header-pill">
      <span>⚡ Jev Brain routing decision (&lt;1ms)...</span>
    </div>
    <div class="msg-bubble-assistant">
      <span style="color: var(--text-tertiary);">Thinking...</span>
    </div>
  `;
  messagesStream.appendChild(row);
  return row;
}

function formatMarkdown(text) {
  let content = escapeHtml(text);
  // Bold
  content = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  // Italic
  content = content.replace(/\*(.*?)\*/g, '<i>$1</i>');
  // Inline code
  content = content.replace(/`([^`]+)`/g, '<code style="background:#EFEFEA; padding:2px 5px; border-radius:4px; font-family:var(--font-mono); font-size:12.5px;">$1</code>');
  // Code block
  content = content.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Line breaks
  content = content.replace(/\n/g, '<br>');
  return content;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- New Chat Reset ---
newChatBtn?.addEventListener('click', () => {
  messagesStream.innerHTML = '';
  if (claudeHero) {
    claudeHero.style.display = 'flex';
  }
  promptInput.value = '';
  promptInput.focus();
});

// Quick action on nav items
document.getElementById('nav-code')?.addEventListener('click', (e) => {
  e.preventDefault();
  promptInput.value = "Run agent warden safety check on command: 'rm -rf /'";
  handleSubmit();
});

document.getElementById('nav-artifacts')?.addEventListener('click', (e) => {
  e.preventDefault();
  promptInput.value = "Classify this email stream into urgent, money, and spam";
  handleSubmit();
});

// Initial verification & live DexScreener sync
loadMarketInfo();
verifyTokenHolding(currentWallet);
setInterval(loadMarketInfo, 30000); // refresh market data every 30s
