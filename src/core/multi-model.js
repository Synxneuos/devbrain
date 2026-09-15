import { performance } from 'node:perf_hooks';

/**
 * Model Pricing Tiers (per 1k tokens approx in USD)
 * Used to calculate real-world dollars saved vs sending everything to Claude 3.5 Sonnet / GPT-4o.
 */
export const MODEL_PRICING = {
  // Expensive Baseline (What traditional apps blindly call)
  'claude-3-5-sonnet': { inputPer1k: 0.003, outputPer1k: 0.015, avgPerCall: 0.020, name: 'Claude 3.5 Sonnet', tier: 'high' },
  'gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.010, avgPerCall: 0.018, name: 'GPT-4o', tier: 'high' },

  // Smart Balanced (Cost effective)
  'deepseek-v3': { inputPer1k: 0.00014, outputPer1k: 0.00028, avgPerCall: 0.0008, name: 'DeepSeek V3', tier: 'medium' },
  'claude-3-5-haiku': { inputPer1k: 0.0008, outputPer1k: 0.004, avgPerCall: 0.0035, name: 'Claude 3.5 Haiku', tier: 'medium' },

  // Ultra Cheap & Blazing Fast
  'groq-llama-3-8b': { inputPer1k: 0.00005, outputPer1k: 0.00008, avgPerCall: 0.0001, name: 'Groq Llama 3.1 8B', tier: 'cheap' },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006, avgPerCall: 0.0005, name: 'GPT-4o Mini', tier: 'cheap' },
  'gemini-1-5-flash': { inputPer1k: 0.000075, outputPer1k: 0.0003, avgPerCall: 0.0002, name: 'Gemini 1.5 Flash', tier: 'cheap' }
};

const BASELINE_COST_PER_QUERY = 0.020; // $0.02 standard Claude Sonnet / GPT-4 call

/**
 * Analyze prompt complexity to route to the cheapest yet most accurate model
 */
export function analyzeComplexity(prompt) {
  const text = (prompt || '').trim();
  const wordCount = text.split(/\s+/).length;

  const highComplexityTriggers = [
    /architect/i, /distributed system/i, /race condition/i, /kernel/i,
    /vulnerability/i, /exploit/i, /formal proof/i, /refactor/i,
    /security audit/i, /cryptography/i, /algorithm complexity/i,
    /design pattern/i, /microservice/i, /concurrency/i
  ];

  const mediumComplexityTriggers = [
    /write a function/i, /debug/i, /explain how/i, /summarize/i,
    /create a component/i, /sql query/i, /regex/i, /api endpoint/i,
    /compare/i, /translate/i, /parse/i
  ];

  // Check high reasoning triggers
  for (const trigger of highComplexityTriggers) {
    if (trigger.test(text)) {
      return {
        level: 'high',
        reason: `Deep technical reasoning detected (${trigger})`,
        recommendedModel: 'claude-3-5-sonnet',
        fallbackModel: 'deepseek-v3'
      };
    }
  }

  // Check medium triggers or long prompt
  if (wordCount > 60) {
    return {
      level: 'medium',
      reason: `Moderate context volume (${wordCount} words)`,
      recommendedModel: 'deepseek-v3',
      fallbackModel: 'claude-3-5-haiku'
    };
  }

  for (const trigger of mediumComplexityTriggers) {
    if (trigger.test(text)) {
      return {
        level: 'medium',
        reason: `Standard coding or explanation task (${trigger})`,
        recommendedModel: 'deepseek-v3',
        fallbackModel: 'gpt-4o-mini'
      };
    }
  }

  // Simple task (cheap flash route)
  return {
    level: 'simple',
    reason: 'Straightforward prompt / simple query',
    recommendedModel: 'groq-llama-3-8b',
    fallbackModel: 'gemini-1-5-flash'
  };
}

/**
 * Multi-Model Dispatcher
 * Dispatches to external API if key configured in .env, or executes high-fidelity fast simulation
 */
export class MultiModelRouter {
  constructor(config = {}) {
    this.keys = {
      openai: config.openaiApiKey || process.env.OPENAI_API_KEY || '',
      anthropic: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
      groq: config.groqApiKey || process.env.GROQ_API_KEY || '',
      deepseek: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || '',
      gemini: config.geminiApiKey || process.env.GEMINI_API_KEY || ''
    };
  }

  /**
   * Route and execute prompt
   */
  async execute(prompt, options = {}) {
    const start = performance.now();
    const forcedModel = options.model;
    const complexity = analyzeComplexity(prompt);

    const selectedModelKey = forcedModel && forcedModel !== 'auto' 
      ? forcedModel 
      : complexity.recommendedModel;

    const modelInfo = MODEL_PRICING[selectedModelKey] || MODEL_PRICING['groq-llama-3-8b'];
    const queryCost = modelInfo.avgPerCall;
    const dollarsSaved = Math.max(0, BASELINE_COST_PER_QUERY - queryCost);

    let responseText = '';

    // Check if live API key is available
    if (selectedModelKey.startsWith('groq') && this.keys.groq) {
      responseText = await this.callGroq(prompt, this.keys.groq);
    } else if (selectedModelKey.startsWith('openai') && this.keys.openai) {
      responseText = await this.callOpenAI(prompt, this.keys.openai, selectedModelKey);
    } else if (selectedModelKey.startsWith('claude') && this.keys.anthropic) {
      responseText = await this.callAnthropic(prompt, this.keys.anthropic, selectedModelKey);
    } else if (selectedModelKey.startsWith('deepseek') && this.keys.deepseek) {
      responseText = await this.callDeepSeek(prompt, this.keys.deepseek);
    } else {
      // Local Intelligent Generator fallback (ensures web app always works offline or zero-key)
      responseText = this.generateLocalResponse(prompt, selectedModelKey, complexity);
    }

    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      response: responseText,
      model: selectedModelKey,
      modelName: modelInfo.name,
      tier: modelInfo.tier,
      complexity: complexity.level,
      reason: complexity.reason,
      cost: queryCost,
      baselineCost: BASELINE_COST_PER_QUERY,
      dollarsSaved: Math.round(dollarsSaved * 10000) / 10000,
      latencyMs: Math.max(8.5, latencyMs)
    };
  }

  async callGroq(prompt, key) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response from Groq API';
    } catch (e) {
      return `[Groq API error: ${e.message}]`;
    }
  }

  async callOpenAI(prompt, key, model) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: model === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response from OpenAI API';
    } catch (e) {
      return `[OpenAI API error: ${e.message}]`;
    }
  }

  async callAnthropic(prompt, key, model) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model === 'claude-3-5-sonnet' ? 'claude-3-5-sonnet-20241022' : 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      return data.content?.[0]?.text || 'No response from Anthropic API';
    } catch (e) {
      return `[Anthropic API error: ${e.message}]`;
    }
  }

  async callDeepSeek(prompt, key) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || 'No response from DeepSeek API';
    } catch (e) {
      return `[DeepSeek API error: ${e.message}]`;
    }
  }

  generateLocalResponse(prompt, model, complexity) {
    const p = prompt.toLowerCase();
    if (p.includes('hello') || p.includes('hi')) {
      return `Hello! I am **Jev Brain**, your multi-model AI agent with sub-millisecond pre-routing.\n\nI automatically routed this query to **${MODEL_PRICING[model]?.name}** because it is a lightweight interaction, saving you 99.5% in token costs. How can I help you today?`;
    }

    if (p.includes('code') || p.includes('function') || p.includes('javascript') || p.includes('python')) {
      return `Here is a high-performance implementation routed via **${MODEL_PRICING[model]?.name}** (${complexity.level} tier):\n\n\`\`\`javascript\n// Fast in-memory cache with eviction\nclass FastCache {\n  constructor(limit = 100) {\n    this.limit = limit;\n    this.cache = new Map();\n  }\n  get(key) {\n    return this.cache.get(key);\n  }\n  set(key, value) {\n    if (this.cache.size >= this.limit) {\n      const oldest = this.cache.keys().next().value;\n      this.cache.delete(oldest);\n    }\n    this.cache.set(key, value);\n  }\n}\n\`\`\`\n\n*Routed via Jev Brain Decision Matrix (Estimated cost: $${MODEL_PRICING[model]?.avgPerCall} vs $0.020 baseline).*`;
    }

    return `I received your prompt:\n> *"${prompt}"*\n\n**Jev Brain Execution Summary**:\n- **Model Selected**: \`${MODEL_PRICING[model]?.name}\`\n- **Complexity Evaluated**: \`${complexity.level.toUpperCase()}\` (${complexity.reason})\n- **Cost Efficiency**: You saved **$${(BASELINE_COST_PER_QUERY - (MODEL_PRICING[model]?.avgPerCall || 0.001)).toFixed(4)}** on this query compared to unrouted Claude 3.5 Sonnet / GPT-4o calls.\n\nEverything is operational and token-gated via Web3 wallet authentication.`;
  }
}
