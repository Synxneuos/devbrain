export interface JevRouteResult {
  text: string;
  label: string;
  confidence: number;
  action: 'AUTO_ACT' | 'REVIEW_QUEUE';
  threshold: number;
  latencyMs: number;
  reason: string;
  scores: Record<string, number>;
  breakdown: Record<string, string>;
}

export interface JevBrainOptions {
  threshold?: number;
  preset?: 'inbox' | 'warden' | 'attention' | 'model-router' | null;
  labels?: string[] | string;
}

export declare class JevBrain {
  constructor(options?: JevBrainOptions);
  route(text: string, customLabels?: string[] | string): Promise<JevRouteResult>;
  batchRoute(items: string[], customLabels?: string[] | string): Promise<JevRouteResult[]>;
}

export interface WardenQuestionCheck {
  ok?: boolean;
  irreversible?: boolean;
  looping?: boolean;
  done?: boolean;
  reason: string;
  critical?: boolean;
  danger?: string;
  count?: number;
}

export interface WardenEvaluation {
  tool: string;
  decision: 'AUTO_ALLOW' | 'NEEDS_CONFIRM' | 'BLOCKED_RISKY';
  color: 'GREEN' | 'YELLOW' | 'RED';
  confidence: number;
  passed: boolean;
  latencyMs: number;
  questions: {
    is_right_file: WardenQuestionCheck;
    is_irreversible: WardenQuestionCheck;
    are_we_looping: WardenQuestionCheck;
    are_we_done: WardenQuestionCheck;
  };
  reasons: string[];
}

export interface AgentWardenOptions {
  allowedPaths?: string[];
  protectedPatterns?: RegExp[];
  destructiveCommands?: RegExp[];
  loopThreshold?: number;
}

export declare class AgentWarden {
  constructor(config?: AgentWardenOptions);
  checkTargetFile(filepath?: string): WardenQuestionCheck;
  checkIrreversible(commandOrCode?: string): WardenQuestionCheck;
  checkLooping(toolName: string, args?: any): WardenQuestionCheck;
  checkDone(action: string, resultText?: string): WardenQuestionCheck;
  evaluate(params: { tool?: string; args?: any; command?: string; filepath?: string; resultText?: string }): WardenEvaluation;
  resetHistory(): void;
}

export declare class SemanticCache {
  constructor(maxSize?: number, similarityThreshold?: number);
  lookup(query: string): any;
  store(query: string, response: string, modelName?: string): void;
  clear(): void;
}

export interface WrapOpenAIOptions {
  cache?: boolean;
  warden?: boolean;
  compress?: boolean;
  failOnRisk?: boolean;
  semanticCache?: SemanticCache;
  wardenInstance?: AgentWarden;
}

export declare function wrapOpenAI<T>(client: T, options?: WrapOpenAIOptions): T;
export declare function wrapFetch(originalFetch?: typeof fetch, options?: { warden?: boolean; failOnRisk?: boolean }): typeof fetch;

export declare class JevSecurityError extends Error {
  evaluation: WardenEvaluation;
  constructor(message: string, evaluation: WardenEvaluation);
}

export interface JevMiddlewareOptions extends JevBrainOptions {
  warden?: boolean;
  wardenInstance?: AgentWarden;
  blockRisky?: boolean;
  extractText?: (req: any) => string;
}

export declare function jevMiddleware(options?: JevMiddlewareOptions): (req: any, res: any, next?: any) => Promise<any>;

export declare const PRESETS: Record<string, { labels: string[]; descriptions: Record<string, string> }>;
