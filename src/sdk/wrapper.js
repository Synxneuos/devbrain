import { AgentWarden } from '../core/warden.js';
import { SemanticCache } from '../core/semantic-cache.js';
import { compressPrompt } from '../core/context-compressor.js';

export class JevSecurityError extends Error {
  constructor(message, evaluation) {
    super(message);
    this.name = 'JevSecurityError';
    this.evaluation = evaluation;
  }
}

/**
 * Universal OpenAI SDK Wrapper
 * Adds 0ms semantic caching, prompt bloat compression, and pre-execution Agent Warden firewall
 * to any standard OpenAI client instance (OpenAI, AzureOpenAI, Groq, Mistral, Together AI).
 *
 * @param {object} client - OpenAI instance (new OpenAI())
 * @param {object} options - Configuration options
 * @returns {object} Wrapped client
 */
export function wrapOpenAI(client, options = {}) {
  if (!client) {
    throw new Error('wrapOpenAI requires an OpenAI client instance.');
  }

  const cache = options.cache !== false ? (options.semanticCache || new SemanticCache()) : null;
  const warden = options.warden !== false ? (options.wardenInstance || new AgentWarden()) : null;
  const compress = options.compress !== false;
  const failOnRisk = options.failOnRisk !== false;

  if (!client.chat || !client.chat.completions || typeof client.chat.completions.create !== 'function') {
    throw new Error('Provided client does not have chat.completions.create');
  }

  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async function jevWrappedCreate(params, ...rest) {
    const messages = params?.messages || [];
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const promptText = lastUserMsg ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content)) : '';

    // 1. Level 0 Semantic Cache Lookup (0.1ms latency, 100% token cost saved)
    if (cache && promptText && !params.stream) {
      const cached = cache.lookup(promptText);
      if (cached) {
        return {
          id: 'jev-cache-' + Date.now(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: params.model || 'cached-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: cached.response
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          },
          _jev: {
            cacheHit: true,
            latencyMs: cached.latencyMs,
            dollarsSaved: cached.dollarsSaved || 0.02
          }
        };
      }
    }

    // 2. Adaptive Prompt Compression (Prunes 35-50% redundant whitespace/bloat)
    let finalParams = params;
    if (compress && messages.length > 0) {
      const compressedMessages = messages.map(msg => {
        if (typeof msg.content === 'string' && msg.content.length > 60) {
          const { compressed } = compressPrompt(msg.content);
          return { ...msg, content: compressed || msg.content };
        }
        return msg;
      });
      finalParams = { ...params, messages: compressedMessages };
    }

    // 3. Execute original LLM call
    const response = await originalCreate(finalParams, ...rest);

    // If streaming, return the stream directly
    if (params.stream) {
      return response;
    }

    // 4. Pre-Flight Agent Warden Evaluation on Tool/Function Calls
    const message = response.choices?.[0]?.message;
    if (warden && message?.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function?.name || '';
        let args = {};
        try {
          args = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {}

        const cmd = args.command || args.cmd || args.script || (typeof args === 'string' ? args : '');
        const filepath = args.path || args.filepath || args.file || '';

        const evaluation = warden.evaluate({
          tool: fnName || 'tool',
          command: cmd,
          filepath,
          args
        });

        toolCall._jevWarden = evaluation;

        if (failOnRisk && evaluation.decision === 'BLOCKED_RISKY') {
          const reasonMsg = evaluation.reasons?.join('; ') || 'Destructive or protected resource access';
          throw new JevSecurityError(
            `[Agent Warden Blocked] Risky tool call: "${fnName}" command: "${cmd}". Reason: ${reasonMsg}`,
            evaluation
          );
        }
      }
    }

    // 5. Cache response for instant future reuse
    if (cache && promptText && message?.content) {
      cache.store(promptText, message.content, params.model || 'openai');
    }

    response._jev = {
      cacheHit: false,
      compressed: Boolean(compress)
    };

    return response;
  };

  client._isJevWrapped = true;
  return client;
}

/**
 * Universal Fetch Proxy / Interceptor
 */
export function wrapFetch(originalFetch = globalThis.fetch, options = {}) {
  const warden = options.warden !== false ? (options.wardenInstance || new AgentWarden()) : null;
  const failOnRisk = options.failOnRisk !== false;

  return async function jevFetch(url, init = {}) {
    if (warden && init.method === 'POST' && init.body && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body);
        const cmd = parsed.command || parsed.cmd || '';
        const filepath = parsed.filepath || parsed.path || '';
        if (cmd || filepath) {
          const evaluation = warden.evaluate({ tool: 'http_post', command: cmd, filepath, args: parsed });
          if (failOnRisk && evaluation.decision === 'BLOCKED_RISKY') {
            throw new JevSecurityError(`[Agent Warden Blocked] Destructive HTTP payload to ${url}`, evaluation);
          }
        }
      } catch (e) {
        if (e instanceof JevSecurityError) throw e;
      }
    }
    return originalFetch(url, init);
  };
}
