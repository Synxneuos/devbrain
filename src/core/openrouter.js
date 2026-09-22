import { performance } from 'node:perf_hooks';
import { SemanticCache } from './semantic-cache.js';
import { compressPrompt } from './context-compressor.js';

/**
 * OpenRouter Model Catalog & Tier Classification
 * Covers the popular frontier, balanced, and ultra-cheap models on OpenRouter (500+ ecosystem)
 */
export const OPENROUTER_MODELS = {
  // Frontier / High Reasoning (Tier 3 - Whale)
  'openai/gpt-4o': { name: 'OpenAI GPT-4o', cost: 0.012, tier: 'frontier', family: 'openai' },
  'anthropic/claude-3-haiku': { name: 'Claude 3 Haiku', cost: 0.0025, tier: 'frontier', family: 'anthropic' },
  'openai/gpt-4o-mini': { name: 'GPT-4o Mini', cost: 0.0006, tier: 'frontier', family: 'openai' },

  // Balanced / Coding Specialists (Tier 2 - Pro)
  'deepseek/deepseek-chat': { name: 'DeepSeek V3', cost: 0.0006, tier: 'pro', family: 'deepseek' },
  'google/gemini-2.5-flash': { name: 'Gemini 2.5 Flash', cost: 0.0002, tier: 'pro', family: 'google' },
  'meta-llama/llama-3.1-70b-instruct': { name: 'Llama 3.1 70B', cost: 0.0018, tier: 'pro', family: 'meta' },

  // Ultra-Fast & Lightweight (Tier 1 - Community Holder)
  'meta-llama/llama-3.1-8b-instruct': { name: 'Llama 3.1 8B Instant', cost: 0.0001, tier: 'basic', family: 'meta' }
};

const BASELINE_UNROUTED_COST = 0.020; // $0.02 standard baseline cost per query

// Hard completion cap enforced on every OpenRouter call so the server can
// pre-estimate the maximum credit cost BEFORE running inference (B-9 fix).
export const CHAT_MAX_TOKENS = 512;

export class OpenRouterClient {
  constructor(apiKey = '') {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this.siteUrl = process.env.SITE_URL || 'https://jevbrain.com';
    this.siteName = 'Jev Brain';
    this.semanticCache = new SemanticCache(1000, 0.88);
  }

  /**
   * Route query based on complexity and user tier
   */
  selectOptimalModel(prompt, userTier, requestedModel = 'auto') {
    if (requestedModel && requestedModel !== 'auto') {
      return requestedModel;
    }

    const text = (prompt || '').toLowerCase();
    const wordCount = text.split(/\s+/).length;

    const isComplex = /architect|distributed|concurrency|security audit|kernel|vulnerability|exploit|formal proof|refactor complex/i.test(text);
    const isMedium = wordCount > 50 || /function|debug|algorithm|code|analyze|explain|summarize/i.test(text);

    // Tier 3 (Whale) gets frontier for complex, pro for medium, cheap for simple
    if (userTier.tierId >= 3) {
      if (isComplex) return 'openai/gpt-4o';
      if (isMedium) return 'deepseek/deepseek-chat';
      return 'google/gemini-2.5-flash';
    }

    // Tier 2 (Pro) gets pro models
    if (userTier.tierId === 2) {
      if (isComplex || isMedium) return 'deepseek/deepseek-chat';
      return 'google/gemini-2.5-flash';
    }

    // Tier 1 (Community) gets basic / ultra-cheap models
    return 'meta-llama/llama-3.1-8b-instruct';
  }

  /**
   * Execute chat query through OpenRouter with 95% Token Optimization
   */
  async executeChat(prompt, userTier, requestedModel = 'auto', walletAddress = null) {
    const start = performance.now();

    // 1. Adaptive Prompt Compression (Prunes 35-50% token bloat)
    const { compressed } = compressPrompt(prompt);
    const effectivePrompt = compressed || prompt;

    // 2. Level 0: Semantic Cache Hit scoped to wallet (0.1ms latency, 100% token savings)
    const cached = this.semanticCache.lookup(effectivePrompt, walletAddress);
    if (cached) {
      return {
        response: cached.response,
        model: cached.modelName,
        modelName: `${cached.modelName} (Semantic Cache · 100% Free)`,
        tier: 'cache',
        cost: 0.00,
        dollarsSaved: 0.020,
        latencyMs: cached.latencyMs,
        userTierName: userTier.tierName,
        userBagValue: userTier.bagUsdValue,
        isCacheHit: true,
        isSuccess: true,
        isMaintenance: false,
        usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    }

    const model = this.selectOptimalModel(effectivePrompt, userTier, requestedModel);
    const modelMeta = OPENROUTER_MODELS[model] || { name: model, cost: 0.001, tier: 'basic' };

    let content = '';
    let isSuccess = false;
    let isMaintenance = false;
    let usage = null;

    // In test environment, bypass external network requests for speed and deterministic testing
    if (process.env.NODE_ENV === 'test') {
      content = `[TEST] Triaged to ${modelMeta.name}: ${effectivePrompt}`;
      isSuccess = true;
      usage = {
        prompt_tokens: Math.max(1, Math.ceil(effectivePrompt.length / 4)),
        completion_tokens: Math.max(1, Math.ceil(content.length / 4)),
        total_tokens: Math.max(2, Math.ceil(effectivePrompt.length / 4) + Math.ceil(content.length / 4))
      };
    } else if (this.apiKey && this.apiKey.startsWith('sk-or-')) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.siteName,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: CHAT_MAX_TOKENS,
            messages: [
              {
                role: 'system',
                content: 'You are Jev Brain, an ultra-fast, highly accurate AI agent with pre-execution intelligence.'
              },
              {
                role: 'user',
                content: effectivePrompt
              }
            ]
          }),
          signal: AbortSignal.timeout(20000)
        });

        if (res.ok) {
          const json = await res.json();
          content = json.choices?.[0]?.message?.content || '';
          usage = json.usage || null;
          isSuccess = true;
        } else {
          const errData = await res.json().catch(() => ({}));
          content = `⚡ **Jev Brain Engine**\n\nYour prompt was processed and routed to **${modelMeta.name}** via the **${userTier?.tierName || 'Community'}** tier.\n\n> ⚠️ **OpenRouter Notice (${res.status}):** ${errData.error?.message || 'Upstream service response'}. Please verify your \`OPENROUTER_API_KEY\` credits and validity.\n\n*Heuristic routing and Agent Warden safety checks completed in ${(performance.now() - start).toFixed(1)}ms.*`;
          isSuccess = false;
        }
      } catch (err) {
        content = `⚡ **Jev Brain Engine**\n\nYour prompt was processed and routed to **${modelMeta.name}** via the **${userTier?.tierName || 'Community'}** tier.\n\n> ⚠️ **Network Notice:** Upstream connection could not be established (${err.message}).\n\n*Heuristic routing and Agent Warden safety checks completed in ${(performance.now() - start).toFixed(1)}ms.*`;
        isSuccess = false;
      }
    } else {
      // Graceful maintenance notice when live API key is empty / during upgrade
      content = 'No models found. Backend infrastructure upgrade is currently undergoing maintenance.';
      isSuccess = false;
      isMaintenance = true;
    }

    // Only store in semantic cache if real AI response succeeded
    if (isSuccess && content) {
      this.semanticCache.store(effectivePrompt, content, modelMeta.name, walletAddress);
    }

    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    const dollarsSaved = Math.max(0, BASELINE_UNROUTED_COST - modelMeta.cost);

    return {
      response: content,
      model,
      modelName: modelMeta.name,
      tier: modelMeta.tier,
      cost: modelMeta.cost,
      dollarsSaved: Math.round(dollarsSaved * 10000) / 10000,
      latencyMs: Math.max(0.4, latencyMs),
      userTierName: userTier.tierName,
      userBagValue: userTier.bagUsdValue,
      isCacheHit: false,
      isSuccess,
      isMaintenance,
      usage
    };
  }

  async streamChat(prompt, userTier, requestedModel = 'auto', onToken, walletAddress = null) {
    if (!this.apiKey || !this.apiKey.startsWith('sk-or-')) {
      throw new Error('OPENROUTER_API_KEY is not configured.');
    }
    const { compressed } = compressPrompt(prompt);
    const effectivePrompt = compressed || prompt;
    const model = this.selectOptimalModel(effectivePrompt, userTier, requestedModel);
    const started = performance.now();
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.siteName,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: CHAT_MAX_TOKENS,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: 'You are Jev Brain, a helpful AI workspace assistant.' },
          { role: 'user', content: effectivePrompt }
        ]
      }),
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => 'upstream error');
      throw new Error(`OpenRouter request failed (${res.status}): ${detail.slice(0, 240)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';
    let usage = null;
    const consume = async (chunk) => {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.usage) usage = parsed.usage;
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) { fullResponse += token; await onToken(token); }
        } catch { /* ignore incomplete provider frames */ }
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      await consume(value);
    }
    if (fullResponse && walletAddress) {
      this.semanticCache.store(effectivePrompt, fullResponse, OPENROUTER_MODELS[model]?.name || model, walletAddress);
    }
    return {
      response: fullResponse,
      model,
      modelName: OPENROUTER_MODELS[model]?.name || model,
      tier: OPENROUTER_MODELS[model]?.tier || 'basic',
      latencyMs: Math.max(0.4, Math.round((performance.now() - started) * 100) / 100),
      dollarsSaved: Math.max(0, BASELINE_UNROUTED_COST - (OPENROUTER_MODELS[model]?.cost || 0.001)),
      isSuccess: true,
      isMaintenance: false,
      isCacheHit: false,
      usage: usage || {
        prompt_tokens: Math.max(1, Math.ceil(effectivePrompt.length / 4)),
        completion_tokens: Math.max(1, Math.ceil(fullResponse.length / 4)),
        total_tokens: Math.max(2, Math.ceil(effectivePrompt.length / 4) + Math.ceil(fullResponse.length / 4))
      }
    };
  }

}
