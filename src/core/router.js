import { performance } from 'node:perf_hooks';

/**
 * Built-in Preset Definitions for Jev Brain
 */
export const PRESETS = {
  inbox: {
    name: 'Attention / Inbox Firewall',
    description: 'Triage incoming emails, chats, and notifications',
    labels: ['urgent', 'money', 'spam', 'personal', 'later'],
    anchors: {
      urgent: ['critical', 'server down', 'emergency', 'asap', 'broken', 'immediate', 'alert', 'error 500', 'outage', 'crash', 'incident', 'failing', 'deadline today'],
      money: ['invoice', 'wire', 'payment', 'billing', 'usd', 'dollars', 'stripe', 'payroll', 'subscription', 'refund', 'contract', 'price', 'pricing', 'checkout', 'receipt'],
      spam: ['win prize', 'crypto token pump', 'viagra', 'casino', 'free gift', 'lottery', 'unclaimed funds', 'click here now', 'telegram trading signals', 'buy followers'],
      personal: ['mom', 'dad', 'family', 'coffee', 'dinner', 'catch up', 'weekend plans', 'vacation', 'birthday', 'how are you doing', 'gym', 'friend'],
      later: ['newsletter', 'weekly digest', 'roundup', 'read later', 'article', 'podcast', 'webinar replay', 'notes', 'summary', 'monthly updates', 'roadmap']
    }
  },
  warden: {
    name: 'Coding Agent Safety Warden',
    description: 'Pre-flight check for coding agent tool calls (file access, irreversible ops, loops)',
    labels: ['safe_execute', 'needs_confirmation', 'risky_blocked'],
    anchors: {
      safe_execute: ['view file', 'read directory', 'grep search', 'git status', 'git diff', 'npm test', 'read config', 'cat file', 'ls', 'lint check'],
      needs_confirmation: ['overwrite file', 'edit critical file', 'schema migration', 'npm publish', 'push master', 'install dependency', 'modify permissions', 'update db'],
      risky_blocked: ['rm -rf', 'drop database', 'delete from without where', 'git reset --hard', 'format c:', 'killall', 'chmod 777 -r', 'shutdown', 'reboot', 'truncate table', 'leak secrets']
    }
  },
  attention: {
    name: 'X / News Attention Firewall',
    description: 'Filter high volume feeds into signal vs noise',
    labels: ['signal', 'deep_dive', 'noise'],
    anchors: {
      signal: ['breaking release', 'paper published', 'major vulnerability', 'open source launch', 'zero-day', 'benchmark results', 'repo trending', 'funding announced'],
      deep_dive: ['technical walkthrough', 'architecture breakdown', 'how it works', 'tutorial', 'postmortem', 'source code analysis', 'longform essay', 'deep dive'],
      noise: ['hot take', 'engagement bait', 'crypto shill', 'influencer drama', 'vague prediction', 'ai bubble debate', 'poll', 'meme format', 'unverified rumor']
    }
  },
  'model-router': {
    name: 'Smart / Cheap Model Router',
    description: 'Route prompts to cheap fast model vs smart reasoning LLM',
    labels: ['cheap_flash', 'smart_reasoning', 'direct_cache'],
    anchors: {
      cheap_flash: ['fix typo', 'format json', 'translate to spanish', 'extract email', 'summarize in 3 bullet points', 'convert csv to markdown', 'capitalize string'],
      smart_reasoning: ['architect distributed system', 'debug race condition', 'solve mathematical proof', 'refactor legacy codebase', 'design consensus protocol', 'analyze vulnerability'],
      direct_cache: ['what is the capital', 'http status 404 meaning', 'ping', 'hello', 'who wrote hamlet', 'standard boilerplate']
    }
  }
};

/**
 * Tokenize text into normalized bag of words and character n-grams
 */
function tokenize(text) {
  if (!text) return [];
  const normalized = text.toLowerCase().replace(/[^a-z0-9_\-\s]/g, ' ');
  const words = normalized.split(/\s+/).filter(w => w.length > 1);
  return words;
}

/**
 * Jev Brain Fast Decision Router (< 15ms)
 * Tagline: "Don't think. Route."
 */
export class JevBrain {
  constructor(options = {}) {
    this.threshold = options.threshold ?? 0.8;
    this.preset = options.preset || null;
    this.customLabels = options.labels || null;
    this.externalEndpoint = options.externalEndpoint || process.env.CLASSIFIER_DEV_URL || null;
  }

  /**
   * Classify input text against given or preset labels
   * @param {string} text - The input line or document
   * @param {string[]|string} [labels] - Comma-separated or array of candidate labels
   * @returns {object} Decision payload with label, confidence, action, latency
   */
  async route(text, labels = null) {
    const startTime = performance.now();

    const cleanText = (text || '').trim();
    if (!cleanText) {
      return {
        text: '',
        label: 'ignore',
        confidence: 0.1,
        action: 'REVIEW_QUEUE',
        latencyMs: 0.1,
        reason: 'Empty input'
      };
    }

    // Determine target labels & anchor keywords
    let targetLabels = [];
    let anchorMap = {};

    if (labels) {
      targetLabels = Array.isArray(labels)
        ? labels
        : labels.split(',').map(s => s.trim()).filter(Boolean);
    } else if (this.preset && PRESETS[this.preset]) {
      targetLabels = PRESETS[this.preset].labels;
      anchorMap = PRESETS[this.preset].anchors;
    } else if (this.customLabels) {
      targetLabels = this.customLabels;
    } else {
      // Default to inbox triage preset
      targetLabels = PRESETS.inbox.labels;
      anchorMap = PRESETS.inbox.anchors;
    }

    // If anchorMap is empty (custom labels provided), derive sensible anchors or keywords
    if (Object.keys(anchorMap).length === 0) {
      for (const lbl of targetLabels) {
        anchorMap[lbl] = [lbl, lbl.replace(/_/g, ' ')];
        // Check if known in presets
        for (const p of Object.values(PRESETS)) {
          if (p.anchors[lbl]) {
            anchorMap[lbl] = p.anchors[lbl];
            break;
          }
        }
      }
    }

    const tokens = tokenize(cleanText);
    const textLower = cleanText.toLowerCase();

    // Calculate score per label
    const scores = {};
    for (const label of targetLabels) {
      scores[label] = 0;
      const anchors = anchorMap[label] || [label];

      // Exact substring match check (higher confidence boost)
      for (const anchor of anchors) {
        const anchorLower = anchor.toLowerCase();
        if (textLower.includes(anchorLower)) {
          scores[label] += 2.8;
        }

        // Token overlap
        const anchorTokens = tokenize(anchorLower);
        for (const at of anchorTokens) {
          if (tokens.includes(at)) {
            scores[label] += 1.0;
          }
        }
      }

      // Check direct label appearance
      if (textLower.includes(label.toLowerCase())) {
        scores[label] += 2.0;
      }
    }

    // Find best label and raw scores
    let bestLabel = targetLabels[0];
    let maxScore = -1;
    let totalScore = 0;

    for (const label of targetLabels) {
      const s = scores[label];
      totalScore += s;
      if (s > maxScore) {
        maxScore = s;
        bestLabel = label;
      }
    }

    // Calibrate confidence
    let confidence = 0.5;
    let reason = '';

    if (maxScore <= 0) {
      // Ambiguous: no strong pattern matched
      confidence = 0.35 + Math.min(0.2, (tokens.length * 0.01));
      bestLabel = targetLabels[targetLabels.length - 1]; // fallback label
      reason = 'No clear anchor triggers matched; routed to default';
    } else {
      const runnerUpScore = Object.entries(scores)
        .filter(([l]) => l !== bestLabel)
        .reduce((max, [, s]) => Math.max(max, s), 0);

      const margin = maxScore - runnerUpScore;
      
      // Calibrated Sigmoid-like scale for confidence
      if (margin >= 3.0) {
        confidence = Math.min(0.98, 0.82 + (margin * 0.04));
        reason = `Strong trigger match on [${bestLabel}] (margin: ${margin.toFixed(1)})`;
      } else if (margin >= 1.5) {
        confidence = 0.78 + (margin * 0.03);
        reason = `Moderate match on [${bestLabel}], slight overlap with others`;
      } else if (margin > 0) {
        confidence = 0.55 + (margin * 0.08);
        reason = `Ambiguous boundary between top labels (margin: ${margin.toFixed(1)})`;
      } else {
        confidence = 0.45;
        reason = 'Tie between multiple categories';
      }
    }

    // Clamp confidence to 2 decimal places
    confidence = Math.round(confidence * 100) / 100;

    // Hard Decision Rule: Confidence >= 0.8 -> AUTO_ACT, else REVIEW_QUEUE
    const action = confidence >= this.threshold ? 'AUTO_ACT' : 'REVIEW_QUEUE';
    const endTime = performance.now();
    const latencyMs = Math.round((endTime - startTime) * 100) / 100;

    return {
      text: cleanText,
      label: bestLabel,
      confidence,
      threshold: this.threshold,
      action,
      passed: action === 'AUTO_ACT',
      latencyMs: Math.max(0.1, latencyMs),
      reason,
      allScores: scores
    };
  }

  /**
   * Batch classify array of text strings
   * @param {string[]} items
   * @param {string[]|string} [labels]
   */
  async batchRoute(items, labels = null) {
    const results = [];
    for (const item of items) {
      if (item && item.trim()) {
        results.push(await this.route(item, labels));
      }
    }
    return results;
  }
}
