/**
 * DexScreener Live Market Cap & Dynamic Tier Calculator
 * Calculates token holder tiers dynamically based on live Market Cap & Token Price.
 */

let cachedMarketData = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10000; // Cache 10 seconds for live responsive updates

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

  const ca = contractAddress || process.env.TOKEN_CONTRACT_ADDRESS || 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump';

  if (!ca) {
    // Simulated initial launch phase (e.g. 100k MC base) until CA is provided
    cachedMarketData = {
      live: false,
      contractAddress: 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump',
      symbol: 'jevbrain',
      name: 'Jev Brain',
      chain,
      priceUsd: 0.0001,
      marketCap: 100000, // 100k base
      fdv: 100000,
      liquidityUsd: 25000,
      volume24h: 45000,
      priceChange24h: 0,
      source: 'Default 100k MC Baseline'
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
        symbol: bestPair.baseToken?.symbol || 'jevbrain',
        name: bestPair.baseToken?.name || 'Jev Brain',
        chain: bestPair.chainId || chain,
        dexId: bestPair.dexId,
        pairAddress: bestPair.pairAddress,
        priceUsd: parseFloat(bestPair.priceUsd) || 0.0001,
        marketCap: bestPair.marketCap || bestPair.fdv || 100000,
        fdv: bestPair.fdv || 100000,
        liquidityUsd: bestPair.liquidity?.usd || 0,
        volume24h: bestPair.volume?.h24 || 0,
        priceChange24h: bestPair.priceChange?.h24 || 0,
        priceChange1h: bestPair.priceChange?.h1 || 0,
        priceChange5m: bestPair.priceChange?.m5 || 0,
        url: bestPair.url || `https://dexscreener.com/solana/${ca}`,
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
    baseUsd: 100,
    baseTokens: 1_000_000,
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
    baseUsd: 30,
    baseTokens: 300_000,
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
    baseUsd: 10,
    baseTokens: 100_000,
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
    baseUsd: 2.5,
    baseTokens: 25_000,
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
    baseUsd: 0.1,
    baseTokens: 1_000,
    weight: 0.1,
    cutPct: 10,
    unlockedCategory: 'initiate',
    description: 'Entry access to fast lightweight models (Llama 8B, Gemini Flash)',
    allowedModels: ['meta-llama/llama-3.1-8b-instruct', 'google/gemini-flash-1.5']
  }
];

/**
 * Calculate dynamic tier based on Live Market Cap & User Holding
 * 
 * CORE ECONOMIC ENGINE:
 * 1. Low MC ($100K):
 *    - Token price is cheap ($0.0001). Users hold MORE tokens (1M for Whale).
 *    - Trust is early/moderate, so required dollar investment is lower ($100).
 * 
 * 2. High MC ($1M, $10M, $100M):
 *    - Token price is high ($0.001 - $0.10). Users hold FEWER tokens (100k -> 31k).
 *    - Trust is high/institutional, so investors put in LARGER dollar amounts ($316 -> $1,000 -> $3,162).
 * 
 * Formula:
 * - Trust Factor = sqrt(MC / 100,000)
 * - Required Bag ($) = baseUsd * Trust Factor
 * - Required Tokens = Required Bag ($) / Token Price = baseTokens / Trust Factor
 * 
 * Dual Qualification: A user qualifies if their Bag Value ($) >= Required Bag OR their Tokens Held >= Required Tokens!
 */
export function calculateDynamicTier(tokenHoldingAmount, marketData) {
  const mc = marketData.marketCap || 100000;
  const priceUsd = marketData.priceUsd || (mc / 1_000_000_000);
  // Guard against priceUsd=0 to prevent Infinity/NaN in token calculations
  const safePriceUsd = priceUsd > 0 ? priceUsd : 0.0000000001;
  const bagUsdValue = tokenHoldingAmount * safePriceUsd;
  
  // Trust Multiplier scales sub-linearly with Market Cap (baseline 100k MC = 1.0x)
  const trustFactor = Math.max(1.0, Math.sqrt(mc / 100000));

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
      priceUsd,
      trustFactor: Math.round(trustFactor * 100) / 100,
      allowedModels: []
    };
  }

  // Compute live thresholds for all tiers under current Market Cap
  const dynamicTiers = HOLDING_TIERS.map(t => {
    const requiredUsd = Math.round(t.baseUsd * trustFactor * 100) / 100;
    const requiredTokens = Math.max(1, Math.round(requiredUsd / safePriceUsd));
    return {
      ...t,
      requiredUsd,
      requiredTokens
    };
  });

  // Pick highest qualifying tier: either dollar value matches OR token quantity matches
  let selectedTier = dynamicTiers[dynamicTiers.length - 1]; // Default to Reserve Initiate
  for (const t of dynamicTiers) {
    if (bagUsdValue >= t.requiredUsd || tokenHoldingAmount >= t.requiredTokens) {
      selectedTier = t;
      break;
    }
  }

  return {
    ...selectedTier,
    bagUsdValue: Math.round(bagUsdValue * 100) / 100,
    marketCap: mc,
    priceUsd,
    trustFactor: Math.round(trustFactor * 100) / 100,
    tokensHeld: tokenHoldingAmount,
    dynamicTiers
  };
}
