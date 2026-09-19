/**
 * DexScreener Live Market Cap & Dynamic Tier Calculator
 * Calculates token holder tiers dynamically based on live Market Cap & Token Price.
 */

let cachedMarketData = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000; // Cache 30 seconds

/**
 * Fetch live market data from DexScreener
 * @param {string} contractAddress - Solana mint or EVM CA
 * @param {string} chain - 'solana', 'ethereum', 'base'
 */
export async function fetchLiveMarketData(contractAddress = '', chain = 'solana') {
  const now = Date.now();
  if (cachedMarketData && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedMarketData;
  }

  const ca = contractAddress || process.env.TOKEN_CONTRACT_ADDRESS;

  if (!ca) {
    // Simulated initial launch phase (e.g. 100k MC base) until CA is provided
    cachedMarketData = {
      live: false,
      contractAddress: 'PENDING_LAUNCH_CA',
      chain,
      priceUsd: 0.0001,
      marketCap: 100000, // 100k base
      fdv: 100000,
      liquidityUsd: 25000,
      volume24h: 45000,
      source: 'Default 100k MC Baseline (Add CA in .env to activate live DexScreener)'
    };
    lastFetchTime = now;
    return cachedMarketData;
  }

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${ca}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) throw new Error(`DexScreener API error ${res.status}`);
    const json = await res.json();

    if (json.pairs && json.pairs.length > 0) {
      // Pick the highest liquidity pair
      const bestPair = json.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

      cachedMarketData = {
        live: true,
        contractAddress: ca,
        chain: bestPair.chainId || chain,
        dexId: bestPair.dexId,
        pairAddress: bestPair.pairAddress,
        priceUsd: parseFloat(bestPair.priceUsd) || 0.0001,
        marketCap: bestPair.marketCap || bestPair.fdv || 100000,
        fdv: bestPair.fdv || 100000,
        liquidityUsd: bestPair.liquidity?.usd || 0,
        volume24h: bestPair.volume?.h24 || 0,
        url: bestPair.url,
        source: 'DexScreener Live Feed'
      };
      lastFetchTime = now;
      return cachedMarketData;
    }
  } catch (err) {
    console.error('DexScreener fetch warning:', err.message);
  }

  // Fallback if network issue
  return cachedMarketData || {
    live: false,
    contractAddress: ca,
    priceUsd: 0.0001,
    marketCap: 100000,
    source: 'Fallback Baseline'
  };
}

export const HOLDING_TIERS = [
  {
    id: 1,
    tierId: 5,
    name: 'Dynasty Magnate',
    tierName: 'Dynasty Magnate',
    minBagUsd: 500,
    weight: 5.0,
    cutPct: 25,
    unlockedCategory: 'frontier',
    description: 'Full unrestricted access to top Frontier AI models (Claude 3.5 Sonnet, GPT-4o, o1-preview) & all 500+ OpenRouter models',
    allowedModels: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'openai/o1-preview', 'deepseek/deepseek-chat', 'meta-llama/llama-3.1-70b-instruct', 'all']
  },
  {
    id: 2,
    tierId: 4,
    name: 'Syndicate Director',
    tierName: 'Syndicate Director',
    minBagUsd: 150,
    weight: 3.0,
    cutPct: 20,
    unlockedCategory: 'pro-plus',
    description: 'High-performance access to Claude 3.5 Haiku, GPT-4o Mini, Llama 3.1 70B, DeepSeek Coder',
    allowedModels: ['meta-llama/llama-3.1-70b-instruct', 'anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini', 'deepseek/deepseek-chat', 'google/gemini-flash-1.5']
  },
  {
    id: 3,
    tierId: 3,
    name: 'Principal Partner',
    tierName: 'Principal Partner',
    minBagUsd: 50,
    weight: 2.0,
    cutPct: 20,
    unlockedCategory: 'pro',
    description: 'Access to GPT-4o Mini, Gemini 1.5 Flash, DeepSeek Chat, and Mistral 7B',
    allowedModels: ['openai/gpt-4o-mini', 'google/gemini-flash-1.5', 'deepseek/deepseek-chat', 'mistralai/mistral-7b-instruct']
  },
  {
    id: 4,
    tierId: 2,
    name: 'Charter Associate',
    tierName: 'Charter Associate',
    minBagUsd: 10,
    weight: 1.0,
    cutPct: 25,
    unlockedCategory: 'associate',
    description: 'Access to Gemini 1.5 Flash, Llama 3.1 8B, and DeepSeek Chat',
    allowedModels: ['meta-llama/llama-3.1-8b-instruct', 'google/gemini-flash-1.5', 'deepseek/deepseek-chat']
  },
  {
    id: 5,
    tierId: 1,
    name: 'Reserve Initiate',
    tierName: 'Reserve Initiate',
    minBagUsd: 0,
    weight: 0.1,
    cutPct: 10,
    unlockedCategory: 'initiate',
    description: 'Entry access to fast lightweight models (Llama 8B, Gemini Flash)',
    allowedModels: ['meta-llama/llama-3.1-8b-instruct', 'google/gemini-flash-1.5']
  }
];

/**
 * Calculate dynamic tier based on Live Market Cap & User Holding
 * Adopted directly from chat 3a34a66c-26f8-4ddd-92e4-de2cf26a5e29:
 * 
 * Logic:
 * When Market Cap is 100k -> Price is low -> User needs more tokens for a $500 bag.
 * When Market Cap is 5M -> Price is high -> User needs fewer tokens for a $500 bag.
 * Therefore, Tier is determined strictly by the **Dollar Value of the User's Bag ($)**!
 * 
 * Tiers:
 * 1. Dynasty Magnate: >= $500 (5.0x / 25% Cut) -> Frontier AI
 * 2. Syndicate Director: >= $150 (3.0x / 20% Cut) -> Pro Plus AI
 * 3. Principal Partner: >= $50 (2.0x / 20% Cut) -> Pro AI
 * 4. Charter Associate: >= $10 (1.0x / 25% Cut) -> Standard AI
 * 5. Reserve Initiate: < $10 (0.1x / 10% Cut) -> Entry AI
 */
export function calculateDynamicTier(tokenHoldingAmount, marketData) {
  const priceUsd = marketData.priceUsd || 0.0001;
  const bagUsdValue = tokenHoldingAmount * priceUsd;
  const mc = marketData.marketCap || 100000;

  if (tokenHoldingAmount <= 0) {
    return {
      tierId: 0,
      tierName: 'Guest',
      name: 'Guest',
      weight: 0,
      cutPct: 0,
      unlockedCategory: 'none',
      description: 'Holding required to access Jev Brain AI models',
      bagUsdValue: 0,
      marketCap: mc,
      tokensHeld: 0,
      allowedModels: []
    };
  }

  let selectedTier;
  if (bagUsdValue >= 500) {
    selectedTier = HOLDING_TIERS[0];
  } else if (bagUsdValue >= 150) {
    selectedTier = HOLDING_TIERS[1];
  } else if (bagUsdValue >= 50) {
    selectedTier = HOLDING_TIERS[2];
  } else if (bagUsdValue >= 10) {
    selectedTier = HOLDING_TIERS[3];
  } else {
    selectedTier = HOLDING_TIERS[4];
  }

  return {
    ...selectedTier,
    bagUsdValue: Math.round(bagUsdValue * 100) / 100,
    marketCap: mc,
    tokensHeld: tokenHoldingAmount
  };
}
