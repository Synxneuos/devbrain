/**
 * Jev Brain - Centralized Solana Holder Eligibility Service
 * 
 * Verifies on-chain SPL token holdings for Jev Brain (AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump),
 * handles RPC timeouts, failover endpoints, and calculates deterministic holding tiers and credit rates.
 */

export const OFFICIAL_SOLANA_MINT = (process.env.TOKEN_CONTRACT_ADDRESS || 'AxwSUUHx6hj8bgdtSxVUiKtKkZwmcDbNbEEtTvzfpump').trim();
export const MINIMUM_TOKENS_REQUIRED = Number(process.env.MINIMUM_TOKENS_REQUIRED) || 1;

export const DEFAULT_SOLANA_RPCS = [
  process.env.SOLANA_RPC_URL,
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://rpc.ankr.com/solana'
].filter(Boolean);

// Deterministic Holding Tiers & Credit Rates (Credits earned per hour)
export const HOLDER_TIERS = [
  {
    tierLevel: 5,
    tierName: 'Dynasty Magnate',
    minTokens: 1_000_000,
    creditRatePerHour: 2500,
    allowedModels: ['all'],
    description: 'Whale / Frontier VIP: 2,500 credits/hr + full frontier model access'
  },
  {
    tierLevel: 4,
    tierName: 'Syndicate Director',
    minTokens: 100_000,
    creditRatePerHour: 750,
    allowedModels: ['anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini', 'meta-llama/llama-3.1-70b', 'deepseek/deepseek-chat'],
    description: 'Executive: 750 credits/hr + advanced model access'
  },
  {
    tierLevel: 3,
    tierName: 'Principal Partner',
    minTokens: 10_000,
    creditRatePerHour: 200,
    allowedModels: ['openai/gpt-4o-mini', 'google/gemini-flash-1.5', 'deepseek/deepseek-chat'],
    description: 'Partner: 200 credits/hr + balanced model access'
  },
  {
    tierLevel: 2,
    tierName: 'Charter Associate',
    minTokens: 1_000,
    creditRatePerHour: 50,
    allowedModels: ['google/gemini-flash-1.5', 'meta-llama/llama-3.1-8b-instruct', 'deepseek/deepseek-chat'],
    description: 'Associate: 50 credits/hr + fast open-weight model access'
  },
  {
    tierLevel: 1,
    tierName: 'Reserve Initiate',
    minTokens: 1,
    creditRatePerHour: 10,
    allowedModels: ['meta-llama/llama-3.1-8b-instruct', 'google/gemini-flash-1.5'],
    description: 'Initiate: 10 credits/hr + fast triage model access'
  },
  {
    tierLevel: 0,
    tierName: 'Guest / Ineligible',
    minTokens: 0,
    creditRatePerHour: 0,
    allowedModels: [],
    description: 'Zero verified tokens held. Holding required to unlock rewards.'
  }
];

// In-memory balance cache (60-second TTL)
const balanceCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Validate Solana Base58 public key format
 */
export function isValidSolanaAddress(address) {
  return typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

import { fetchLiveMarketData, calculateDynamicTier } from './dexscreener.js';

/**
 * Resolve tier from token balance, dynamically adjusted by live Market Cap.
 * When MC is high, required tokens are lower; when MC is low, required tokens are higher.
 */
export function resolveHolderTier(balanceUi = 0, marketData = null) {
  const amount = Number(balanceUi) || 0;
  if (marketData && marketData.marketCap) {
    const dynamic = calculateDynamicTier(amount, marketData);
    const rateMap = { 5: 2500, 4: 750, 3: 200, 2: 50, 1: 10, 0: 0 };
    return {
      tierLevel: dynamic.tierId || 0,
      tierName: dynamic.tierName || 'Guest / Ineligible',
      creditRatePerHour: rateMap[dynamic.tierId] || 0,
      allowedModels: dynamic.allowedModels || [],
      description: dynamic.description || '',
      requiredTokens: dynamic.requiredTokens || 0,
      marketCap: dynamic.marketCap
    };
  }

  for (const tier of HOLDER_TIERS) {
    if (amount >= tier.minTokens) {
      return { ...tier };
    }
  }
  return { ...HOLDER_TIERS[HOLDER_TIERS.length - 1] };
}

/**
 * Query Solana JSON-RPC with multi-endpoint failover and strict timeout
 */
export async function querySolanaRpcWithFailover(method, params, rpcEndpoints = DEFAULT_SOLANA_RPCS) {
  let lastError = null;

  for (const rpcUrl of rpcEndpoints) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${rpcUrl}`);
      }

      const json = await res.json();
      if (json.error) {
        throw new Error(json.error.message || `RPC Error from ${rpcUrl}`);
      }

      return { result: json.result, endpoint: rpcUrl };
    } catch (err) {
      lastError = err;
      // Proceed to next fallback RPC
    }
  }

  throw new Error(`All Solana RPC endpoints failed. Last error: ${lastError?.message || 'Unknown RPC error'}`);
}

/**
 * Centralized Holder Eligibility Service
 * @param {string} walletAddress - Solana public key
 * @param {object} options - Optional overrides (mockBalance, tokenMint, rpcUrls, skipCache)
 */
export async function getHolderEligibility(walletAddress, options = {}) {
  const address = (walletAddress || '').trim();
  const tokenMint = (options.tokenMint || OFFICIAL_SOLANA_MINT).trim();

  if (!isValidSolanaAddress(address)) {
    return {
      eligible: false,
      walletAddress: address || null,
      tokenMint,
      balanceRaw: '0',
      balanceUi: 0,
      decimals: 6,
      tier: 'Invalid Address',
      tierLevel: 0,
      creditRatePerHour: 0,
      verifiedAt: new Date().toISOString(),
      error: 'Invalid Solana wallet address format. Must be a 32-44 character Base58 public key.'
    };
  }

  // Handle Mock/Test overrides for deterministic test suites
  if (options.mockBalance !== undefined) {
    const balanceUi = Number(options.mockBalance) || 0;
    const tier = resolveHolderTier(balanceUi);
    return {
      eligible: balanceUi >= 1,
      walletAddress: address,
      tokenMint,
      balanceRaw: String(Math.round(balanceUi * 1_000_000)),
      balanceUi,
      balanceTokens: balanceUi,
      decimals: 6,
      tier: tier.tierName,
      tierName: tier.tierName,
      tierLevel: tier.tierLevel,
      creditRatePerHour: tier.creditRatePerHour,
      accrualRatePerHour: tier.creditRatePerHour,
      allowedModels: tier.allowedModels,
      verifiedAt: new Date().toISOString(),
      rpcEndpoint: 'mock://test-environment'
    };
  }

  // Check cache unless explicitly skipped
  if (!options.skipCache) {
    const cached = balanceCache.get(`${address}:${tokenMint}`);
    if (cached && (Date.now() - cached.cachedAt < CACHE_TTL_MS)) {
      return { ...cached.data, fromCache: true };
    }
  }

  try {
    const rpcUrls = options.rpcUrls || DEFAULT_SOLANA_RPCS;
    const { result, endpoint } = await querySolanaRpcWithFailover(
      'getTokenAccountsByOwner',
      [
        address,
        { mint: tokenMint },
        { encoding: 'jsonParsed' }
      ],
      rpcUrls
    );

    const accounts = result?.value || [];
    let totalUiAmount = 0;
    let totalRawAmount = BigInt(0);
    let decimals = 6;

    for (const acc of accounts) {
      const parsedInfo = acc?.account?.data?.parsed?.info?.tokenAmount;
      if (parsedInfo) {
        if (typeof parsedInfo.uiAmount === 'number') {
          totalUiAmount += parsedInfo.uiAmount;
        }
        if (parsedInfo.amount) {
          totalRawAmount += BigInt(parsedInfo.amount);
        }
        if (typeof parsedInfo.decimals === 'number') {
          decimals = parsedInfo.decimals;
        }
      }
    }

    const marketData = await fetchLiveMarketData().catch(() => null);
    const tier = resolveHolderTier(totalUiAmount, marketData);
    const eligibilityData = {
      eligible: totalUiAmount >= MINIMUM_TOKENS_REQUIRED,
      walletAddress: address,
      tokenMint,
      balanceRaw: totalRawAmount.toString(),
      balanceUi: totalUiAmount,
      decimals,
      tier: tier.tierName,
      tierLevel: tier.tierLevel,
      creditRatePerHour: tier.creditRatePerHour,
      allowedModels: tier.allowedModels,
      marketCap: marketData?.marketCap || 100000,
      tokenPriceUsd: marketData?.priceUsd || 0.0001,
      verifiedAt: new Date().toISOString(),
      rpcEndpoint: endpoint
    };

    // Store in cache
    balanceCache.set(`${address}:${tokenMint}`, {
      cachedAt: Date.now(),
      data: eligibilityData
    });

    return eligibilityData;

  } catch (err) {
    // In case of network/RPC failure, fail safely without fabricating balances
    return {
      eligible: false,
      walletAddress: address,
      tokenMint,
      balanceRaw: '0',
      balanceUi: 0,
      decimals: 6,
      tier: 'Verification Delayed',
      tierLevel: 0,
      creditRatePerHour: 0,
      verifiedAt: new Date().toISOString(),
      error: `On-chain verification error: ${err.message}`
    };
  }
}

export function setMockHolderBalance(address, balanceUi = 100000) {
  const tier = resolveHolderTier(balanceUi);
  const data = {
    eligible: balanceUi >= 1,
    walletAddress: address,
    tokenMint: OFFICIAL_SOLANA_MINT,
    balanceRaw: String(Math.round(balanceUi * 1_000_000)),
    balanceUi,
    balanceTokens: balanceUi,
    decimals: 6,
    tier: tier.tierName,
    tierName: tier.tierName,
    tierLevel: tier.tierLevel,
    creditRatePerHour: tier.creditRatePerHour,
    accrualRatePerHour: tier.creditRatePerHour,
    allowedModels: tier.allowedModels,
    verifiedAt: new Date().toISOString(),
    rpcEndpoint: 'mock://test-environment'
  };
  balanceCache.set(`${address}:${OFFICIAL_SOLANA_MINT}`, {
    cachedAt: Date.now(),
    data
  });
  return data;
}
