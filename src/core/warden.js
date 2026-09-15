import { performance } from 'node:perf_hooks';

/**
 * Jev Brain Coding Agent Warden
 * Tagline: "4 Questions before every tool call"
 * 
 * 1. Is this the right file?
 * 2. Is this irreversible?
 * 3. Are we looping?
 * 4. Are we done?
 */
export class AgentWarden {
  constructor(config = {}) {
    this.allowedPaths = config.allowedPaths || ['.'];
    this.protectedPatterns = config.protectedPatterns || [
      /^\.env/i,
      /\.pem$/i,
      /\.key$/i,
      /id_rsa/i,
      /\.git[\/\\]/i,
      /package-lock\.json$/i,
      /yarn\.lock$/i
    ];
    this.destructiveCommands = config.destructiveCommands || [
      /rm\s+-rf/i,
      /del\s+\/[fq]/i,
      /drop\s+database/i,
      /drop\s+table/i,
      /delete\s+from\s+[a-z0-9_]+\s*;/i, // unconstrained delete
      /git\s+reset\s+--hard/i,
      /git\s+push\s+.*--force/i,
      /mkfs/i,
      /format\s+[a-z]:/i,
      /shutdown/i
    ];
    this.callHistory = [];
    this.maxHistory = 30;
    this.loopThreshold = config.loopThreshold || 3;
  }

  /**
   * Question 1: Is this the right file?
   */
  checkTargetFile(filepath) {
    if (!filepath) return { ok: true, reason: 'No file target specified' };
    
    for (const pattern of this.protectedPatterns) {
      if (pattern.test(filepath)) {
        return {
          ok: false,
          critical: true,
          reason: `Protected path pattern matched: ${pattern}`
        };
      }
    }
    return { ok: true, reason: 'Target file is within permissible scope' };
  }

  /**
   * Question 2: Is this irreversible?
   */
  checkIrreversible(commandOrCode) {
    if (!commandOrCode) return { irreversible: false, reason: 'Safe operation' };

    for (const pattern of this.destructiveCommands) {
      if (pattern.test(commandOrCode)) {
        return {
          irreversible: true,
          danger: 'HIGH',
          reason: `Potentially irreversible destructive command detected: ${pattern}`
        };
      }
    }
    return { irreversible: false, reason: 'Reversible or standard non-destructive operation' };
  }

  /**
   * Question 3: Are we looping?
   */
  checkLooping(toolName, args) {
    const signature = `${toolName}:${JSON.stringify(args || {})}`;
    this.callHistory.push({ signature, timestamp: Date.now() });
    if (this.callHistory.length > this.maxHistory) {
      this.callHistory.shift();
    }

    // Count identical calls in the last 6 actions
    const recent = this.callHistory.slice(-6);
    const identicalCount = recent.filter(c => c.signature === signature).length;

    if (identicalCount >= this.loopThreshold) {
      return {
        looping: true,
        count: identicalCount,
        reason: `Agent loop detected: Tool [${toolName}] called ${identicalCount} times with identical arguments`
      };
    }

    return { looping: false, count: identicalCount, reason: 'Normal call distribution' };
  }

  /**
   * Question 4: Are we done?
   */
  checkDone(action, resultText) {
    const text = `${action} ${resultText || ''}`.toLowerCase();
    const completionIndicators = [
      'task complete',
      'finished execution',
      'all tests pass',
      'successfully resolved',
      'nothing to commit',
      'no remaining tasks'
    ];

    const matched = completionIndicators.some(ind => text.includes(ind));
    return {
      done: matched,
      reason: matched ? 'Explicit completion indicator observed' : 'Workflow ongoing'
    };
  }

  /**
   * Full Pre-Flight Gate for Agent Tool Calls
   * Output: GREEN (AUTO_ALLOW), YELLOW (NEEDS_CONFIRM), RED (BLOCKED_RISKY)
   */
  evaluate({ tool, args = {}, command = '', filepath = '', resultText = '' }) {
    const start = performance.now();

    const fileCheck = this.checkTargetFile(filepath || args.path || args.file);
    const irrevCheck = this.checkIrreversible(command || args.command || args.code);
    const loopCheck = this.checkLooping(tool, args);
    const doneCheck = this.checkDone(tool, resultText);

    let decision = 'AUTO_ALLOW';
    let color = 'GREEN';
    let confidence = 0.95;
    let blockReasons = [];

    // Red: Irreversible or protected file violation
    if (!fileCheck.ok || irrevCheck.irreversible) {
      decision = 'BLOCKED_RISKY';
      color = 'RED';
      confidence = 0.98;
      if (!fileCheck.ok) blockReasons.push(fileCheck.reason);
      if (irrevCheck.irreversible) blockReasons.push(irrevCheck.reason);
    }
    // Yellow: Looping detected or moderate ambiguity
    else if (loopCheck.looping) {
      decision = 'NEEDS_CONFIRM';
      color = 'YELLOW';
      confidence = 0.65;
      blockReasons.push(loopCheck.reason);
    }

    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      tool,
      decision,
      color,
      confidence,
      passed: decision === 'AUTO_ALLOW',
      latencyMs: Math.max(0.1, latencyMs),
      questions: {
        is_right_file: fileCheck,
        is_irreversible: irrevCheck,
        are_we_looping: loopCheck,
        are_we_done: doneCheck
      },
      reasons: blockReasons
    };
  }

  resetHistory() {
    this.callHistory = [];
  }
}
