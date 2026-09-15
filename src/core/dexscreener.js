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

/**
 * Calculate dynamic tier based on Live Market Cap & User Holding
 * 
 * Logic:
 * When Market Cap is 100k -> Price is low -> User needs more tokens.
 * When Market Cap is 5M -> Price is high -> User needs fewer tokens.
 * Therefore, Tier is determined by the **Dollar Value of the User's Bag ($)**!
 */
export function calculateDynamicTier(tokenHoldingAmount, marketData) {
  const priceUsd = marketData.priceUsd || 0.0001;
  const bagUsdValue = tokenHoldingAmount * priceUsd;
  const mc = marketData.marketCap || 100000;

  // Dynamic Tier Boundaries (USD value of bag)
  // Tier 3 (Whale / Frontier): Bag >= $500 (Free Claude 3.5 Sonnet, GPT-4o, o1-preview)
  // Tier 2 (Pro): Bag >= $100 (Free Llama 70B, Claude 3.5 Haiku, DeepSeek Coder)
  // Tier 1 (Holder): Bag >= $15 (Free Llama 8B, Gemini Flash, DeepSeek Chat)
  
  if (bagUsdValue >= 500) {
    return {
      tierId: 3,
      tierName: 'Frontier Whale',
      unlockedCategory: 'frontier',
      description: 'Full Free Access to Claude 3.5 Sonnet, GPT-4o, o1, and all 500+ OpenRouter models',
      bagUsdValue: Math.round(bagUsdValue * 100) / 100,
      marketCap: mc,
      tokensHeld: tokenHoldingAmount,
      allowedModels: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'openai/o1-preview', 'deepseek/deepseek-chat', 'meta-llama/llama-3.1-70b-instruct', 'all']
    };
  }

  if (bagUsdValue >= 100) {
    return {
      tierId: 2,
      tierName: 'Pro Holder',
      unlockedCategory: 'pro',
      description: 'Free Access to Llama 3.1 70B, Claude 3.5 Haiku, DeepSeek V3, and GPT-4o Mini',
      bagUsdValue: Math.round(bagUsdValue * 100) / 100,
      marketCap: mc,
      tokensHeld: tokenHoldingAmount,
      allowedModels: ['meta-llama/llama-3.1-70b-instruct', 'anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini', 'deepseek/deepseek-chat', 'google/gemini-flash-1.5']
    };
  }

  if (bagUsdValue >= 15 || tokenHoldingAmount > 0) {
    return {
      tierId: 1,
      tierName: 'Community Holder',
      unlockedCategory: 'basic',
      description: 'Free Access to Groq/Llama 3.1 8B, Gemini 1.5 Flash, Mistral 7B, and DeepSeek Chat',
      bagUsdValue: Math.round(bagUsdValue * 100) / 100,
      marketCap: mc,
      tokensHeld: tokenHoldingAmount,
      allowedModels: ['meta-llama/llama-3.1-8b-instruct', 'google/gemini-flash-1.5', 'deepseek/deepseek-chat', 'mistralai/mistral-7b-instruct']
    };
  }

  return {
    tierId: 0,
    tierName: 'Guest',
    unlockedCategory: 'none',
    description: 'Holding required to access Jev Brain AI models',
    bagUsdValue: 0,
    marketCap: mc,
    tokensHeld: 0,
    allowedModels: []
  };
}
