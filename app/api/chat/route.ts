// Note: This file requires the following dependencies to be installed:
// npm install @ai-sdk/openai ai zod
// npm install --save-dev @types/node
//
// This file also requires the following local modules:
// - @/lib/shared/personas (exports getPersona function)

import {
  getMcpSubagentProfile,
  requiresAuthenticatedSessionForSubagent,
  resolveMcpSubagentIdFromRequest,
} from "@/lib/agents/mcp-subagents";
import { getPersona } from "@/lib/shared/personas";
import {
  getGuardedChatToolRegistry,
  resolveRealtimeAuthContext,
} from "@/lib/realtime/realtime-tools";
import {
  evaluateAegisChatRequest,
  evaluateAegisModelAccess,
} from "@/lib/security/aegis-policy";
import { evaluateLlmGuard, resolveLlmGuardConfig } from "@/lib/security/llm-guard";
import {
  getMcpDataEgressToolAllowlist,
  getMcpDataEgressToolRateLimitOverrides,
} from "@/lib/security/mcp-tool-security";
import {
  getChatJailbreakPatterns,
  getSecurityPatternRegistryMeta,
  logSecurityPatternRegistryLoad,
} from "@/lib/security/security-patterns";
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body";
import { getClientAddressFromRequest } from "@/lib/shared/request-rate-limit";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Maximum execution duration for long-running AI analyses
export const maxDuration = 300;

// OpenAI: resolved per-request from user header or env var
const HAS_OPENAI_API_KEY = Boolean(process.env.OPENAI_API_KEY?.trim());

function resolveOpenAI(req: Request) {
  const userKey = req.headers.get("x-user-openai-key")?.trim();
  const apiKey = userKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return createOpenAI({ apiKey });
}
const CORS_ALLOW_ORIGIN =
  process.env.CORS_ALLOWED_ORIGIN ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";
const MAX_CHAT_BODY_BYTES = getMaxBodyBytesFromEnv("CHAT_MAX_BODY_BYTES", 12_000_000);
const REQUIRE_CHAT_AUTH =
  process.env.CHAT_REQUIRE_AUTH === "true" ||
  (process.env.CHAT_REQUIRE_AUTH !== "false" && process.env.NODE_ENV === "production");
const REQUIRE_CHAT_METRICS_AUTH = process.env.CHAT_METRICS_REQUIRE_AUTH !== "false";
const ALLOW_INSECURE_REMOTE_LOG_ENDPOINT =
  process.env.LOG_ALLOW_INSECURE_ENDPOINT === "true";
const CHAT_JAILBREAK_PATTERNS = getChatJailbreakPatterns();

logSecurityPatternRegistryLoad("chat-route");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  requestId?: string;
}

interface PerformanceMetrics {
  startTime: number;
  checkpoints: Map<string, number>;
  tokenCounts?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

interface RequestContext {
  requestId: string;
  startTime: number;
  userId?: string;
  sessionId?: string;
  modelId: string;
  metrics: PerformanceMetrics;
}

type StreamResponseLike = {
  toTextStreamResponse: () => Response
  toDataStreamResponse?: () => Response
}

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

interface ModelConfig {
  readonly modelId: string;
  readonly description: string;
  readonly contextWindow: number;
  readonly capabilities: readonly string[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly costPer1kTokens?: { input: number; output: number };
  readonly recommendedFor?: readonly string[];
  readonly latencyProfile?: "low" | "medium" | "high";
  readonly reliabilityScore?: number; // 0-100
}

const MODEL_CONFIGS: Readonly<Record<string, ModelConfig>> = {
  "gpt-4o": {
    modelId: "gpt-4o",
    description: "Most capable GPT-4 model with vision and reasoning",
    contextWindow: 128000,
    maxTokens: 16384,
    temperature: 0.7,
    capabilities: ["vision", "function-calling", "json-mode", "streaming", "reasoning"],
    costPer1kTokens: { input: 0.005, output: 0.015 },
    recommendedFor: ["complex-analysis", "vision-tasks", "multi-step-reasoning"],
    latencyProfile: "medium",
    reliabilityScore: 95,
  },
  "gpt-4o-mini": {
    modelId: "gpt-4o-mini",
    description: "Fast and cost-effective GPT-4 variant",
    contextWindow: 128000,
    maxTokens: 16384,
    temperature: 0.7,
    capabilities: ["function-calling", "json-mode", "streaming"],
    costPer1kTokens: { input: 0.00015, output: 0.0006 },
    recommendedFor: ["quick-queries", "simple-tasks", "high-volume"],
    latencyProfile: "low",
    reliabilityScore: 98,
  },
  "gpt-4-turbo": {
    modelId: "gpt-4-turbo",
    description: "GPT-4 Turbo with improved instruction following",
    contextWindow: 128000,
    maxTokens: 4096,
    temperature: 0.7,
    capabilities: ["vision", "function-calling", "json-mode", "streaming"],
    costPer1kTokens: { input: 0.01, output: 0.03 },
    recommendedFor: ["instruction-following", "structured-output"],
    latencyProfile: "medium",
    reliabilityScore: 94,
  },
  "gpt-4.1": {
    modelId: "gpt-4.1",
    description: "Next-gen GPT-4 with enhanced reasoning and coding",
    contextWindow: 1000000,
    maxTokens: 32768,
    temperature: 0.7,
    capabilities: ["vision", "function-calling", "json-mode", "streaming", "reasoning", "code-execution"],
    costPer1kTokens: { input: 0.002, output: 0.008 },
    recommendedFor: ["large-context", "coding", "document-analysis"],
    latencyProfile: "medium",
    reliabilityScore: 92,
  },
  "o3": {
    modelId: "o3",
    description: "OpenAI o3 reasoning model for complex problem solving",
    contextWindow: 200000,
    maxTokens: 100000,
    temperature: 1.0,
    capabilities: ["reasoning", "function-calling", "streaming", "deep-analysis"],
    costPer1kTokens: { input: 0.01, output: 0.04 },
    recommendedFor: ["deep-reasoning", "complex-problems", "research"],
    latencyProfile: "high",
    reliabilityScore: 90,
  },
  "o4-mini": {
    modelId: "o4-mini",
    description: "Compact reasoning model balancing speed and capability",
    contextWindow: 200000,
    maxTokens: 65536,
    temperature: 1.0,
    capabilities: ["reasoning", "function-calling", "streaming"],
    costPer1kTokens: { input: 0.003, output: 0.012 },
    recommendedFor: ["moderate-reasoning", "cost-effective-analysis"],
    latencyProfile: "medium",
    reliabilityScore: 93,
  },
  "claude-3-opus": {
    modelId: "claude-3-opus",
    description: "Anthropic's most capable model for complex tasks",
    contextWindow: 200000,
    maxTokens: 4096,
    temperature: 0.7,
    capabilities: ["function-calling", "streaming", "reasoning", "analysis"],
    costPer1kTokens: { input: 0.015, output: 0.075 },
    recommendedFor: ["nuanced-analysis", "creative-tasks", "safety-critical"],
    latencyProfile: "high",
    reliabilityScore: 96,
  },
  "claude-3-sonnet": {
    modelId: "claude-3-sonnet",
    description: "Balanced Claude model for everyday tasks",
    contextWindow: 200000,
    maxTokens: 4096,
    temperature: 0.7,
    capabilities: ["function-calling", "streaming", "reasoning"],
    costPer1kTokens: { input: 0.003, output: 0.015 },
    recommendedFor: ["general-purpose", "balanced-performance"],
    latencyProfile: "medium",
    reliabilityScore: 97,
  },
} as const;

const DEFAULT_MODEL = "gpt-4o-mini";

// Model selection strategies for different use cases
const MODEL_STRATEGIES = {
  fast: "gpt-4o-mini",
  balanced: "gpt-4o",
  reasoning: "o3",
  coding: "gpt-4.1",
  vision: "gpt-4o",
  creative: "claude-3-opus",
  costEffective: "gpt-4o-mini",
  highContext: "gpt-4.1",
  reliable: "gpt-4o-mini",
} as const;

type ModelStrategy = keyof typeof MODEL_STRATEGIES;

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "::1") return true;
  if (host.startsWith("127.")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host.endsWith(".local")) return true;
  return false;
}

function resolveRemoteLogEndpoint(): string | null {
  const raw = process.env.LOG_ENDPOINT?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (process.env.NODE_ENV === "production" && !ALLOW_INSECURE_REMOTE_LOG_ENDPOINT) {
      if (parsed.protocol !== "https:") {
        return null;
      }
      if (isPrivateOrLocalHostname(parsed.hostname)) {
        return null;
      }
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeSecretEquals(expected: string, provided: string | null): boolean {
  if (!provided) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

// =============================================================================
// LOGGING & OBSERVABILITY
// =============================================================================

class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private readonly maxLogs = 10000;
  private readonly enableConsole: boolean;
  private readonly enableRemote: boolean;
  private readonly remoteEndpoint?: string;

  private constructor() {
    this.enableConsole = process.env.NODE_ENV === "development";
    this.enableRemote = process.env.ENABLE_REMOTE_LOGGING === "true";
    this.remoteEndpoint = resolveRemoteLogEndpoint() ?? undefined;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatLogEntry(entry: LogEntry): string {
    const contextStr = entry.context 
      ? ` | ${JSON.stringify(entry.context)}`
      : "";
    const requestIdStr = entry.requestId 
      ? ` [${entry.requestId}]`
      : "";
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}]${requestIdStr} ${entry.message}${contextStr}`;
  }

  private async sendToRemote(entry: LogEntry): Promise<void> {
    if (!this.enableRemote || !this.remoteEndpoint) return;
    
    try {
      await fetch(this.remoteEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
    } catch {
      // Silently fail remote logging to not affect main flow
    }
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>, requestId?: string): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      requestId,
    };

    // Store in memory (with rotation)
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs / 2);
    }

    // Console output in development
    if (this.enableConsole) {
      const formattedLog = this.formatLogEntry(entry);
      switch (level) {
        case "debug":
          console.debug(formattedLog);
          break;
        case "info":
          console.info(formattedLog);
          break;
        case "warn":
          console.warn(formattedLog);
          break;
        case "error":
          console.error(formattedLog);
          break;
      }
    }

    // Send to remote logging service
    void this.sendToRemote(entry);
  }

  debug(message: string, context?: Record<string, unknown>, requestId?: string): void {
    this.log("debug", message, context, requestId);
  }

  info(message: string, context?: Record<string, unknown>, requestId?: string): void {
    this.log("info", message, context, requestId);
  }

  warn(message: string, context?: Record<string, unknown>, requestId?: string): void {
    this.log("warn", message, context, requestId);
  }

  error(message: string, context?: Record<string, unknown>, requestId?: string): void {
    this.log("error", message, context, requestId);
  }

  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  getLogsByLevel(level: LogLevel, count: number = 100): LogEntry[] {
    return this.logs.filter(l => l.level === level).slice(-count);
  }

  getLogsByRequestId(requestId: string): LogEntry[] {
    return this.logs.filter(l => l.requestId === requestId);
  }
}

const logger = Logger.getInstance();

// =============================================================================
// METRICS & PERFORMANCE TRACKING
// =============================================================================

class MetricsCollector {
  private static instance: MetricsCollector;
  private requestMetrics: Map<string, RequestContext> = new Map();
  private aggregateMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokensUsed: 0,
    totalCost: 0,
    averageLatency: 0,
    modelUsage: new Map<string, number>(),
    errorsByType: new Map<string, number>(),
    requestsPerMinute: [] as { timestamp: number; count: number }[],
  };

  private constructor() {
    // Clean up old metrics every 5 minutes
    setInterval(() => this.cleanupOldMetrics(), 5 * 60 * 1000);
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  startRequest(requestId: string, modelId: string, userId?: string, sessionId?: string): RequestContext {
    const context: RequestContext = {
      requestId,
      startTime: performance.now(),
      userId,
      sessionId,
      modelId,
      metrics: {
        startTime: performance.now(),
        checkpoints: new Map(),
      },
    };
    this.requestMetrics.set(requestId, context);
    this.aggregateMetrics.totalRequests++;
    
    // Track model usage
    const currentUsage = this.aggregateMetrics.modelUsage.get(modelId) || 0;
    this.aggregateMetrics.modelUsage.set(modelId, currentUsage + 1);
    
    // Track requests per minute
    const now = Date.now();
    this.aggregateMetrics.requestsPerMinute.push({ timestamp: now, count: 1 });
    
    return context;
  }

  addCheckpoint(requestId: string, name: string): void {
    const context = this.requestMetrics.get(requestId);
    if (context) {
      context.metrics.checkpoints.set(name, performance.now());
    }
  }

  setTokenCounts(requestId: string, prompt: number, completion: number): void {
    const context = this.requestMetrics.get(requestId);
    if (context) {
      context.metrics.tokenCounts = {
        prompt,
        completion,
        total: prompt + completion,
      };
      this.aggregateMetrics.totalTokensUsed += prompt + completion;
      
      // Calculate cost
      const modelConfig = MODEL_CONFIGS[context.modelId];
      if (modelConfig?.costPer1kTokens) {
        const cost = (prompt / 1000) * modelConfig.costPer1kTokens.input +
                     (completion / 1000) * modelConfig.costPer1kTokens.output;
        this.aggregateMetrics.totalCost += cost;
      }
    }
  }

  endRequest(requestId: string, success: boolean, errorType?: string): number {
    const context = this.requestMetrics.get(requestId);
    if (!context) return 0;
    
    const duration = performance.now() - context.startTime;
    
    if (success) {
      this.aggregateMetrics.successfulRequests++;
    } else {
      this.aggregateMetrics.failedRequests++;
      if (errorType) {
        const currentCount = this.aggregateMetrics.errorsByType.get(errorType) || 0;
        this.aggregateMetrics.errorsByType.set(errorType, currentCount + 1);
      }
    }
    
    // Update average latency (rolling average)
    const totalSuccess = this.aggregateMetrics.successfulRequests;
    this.aggregateMetrics.averageLatency = 
      (this.aggregateMetrics.averageLatency * (totalSuccess - 1) + duration) / totalSuccess;
    
    // Clean up
    this.requestMetrics.delete(requestId);
    
    return duration;
  }

  getRequestContext(requestId: string): RequestContext | undefined {
    return this.requestMetrics.get(requestId);
  }

  getAggregateMetrics(): typeof this.aggregateMetrics {
    return {
      ...this.aggregateMetrics,
      modelUsage: new Map(this.aggregateMetrics.modelUsage),
      errorsByType: new Map(this.aggregateMetrics.errorsByType),
      requestsPerMinute: [...this.aggregateMetrics.requestsPerMinute],
    };
  }

  getRequestsPerMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.aggregateMetrics.requestsPerMinute.filter(
      r => r.timestamp > oneMinuteAgo
    );
    return recentRequests.reduce((sum, r) => sum + r.count, 0);
  }

  private cleanupOldMetrics(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.aggregateMetrics.requestsPerMinute = this.aggregateMetrics.requestsPerMinute.filter(
      r => r.timestamp > oneHourAgo
    );
    
    // Clean up stale request contexts (shouldn't happen, but safety net)
    const fiveMinutesAgo = performance.now() - 5 * 60 * 1000;
    for (const [requestId, context] of this.requestMetrics.entries()) {
      if (context.startTime < fiveMinutesAgo) {
        this.requestMetrics.delete(requestId);
        logger.warn("Cleaned up stale request context", { requestId });
      }
    }
  }
}

const metrics = MetricsCollector.getInstance();

// =============================================================================
// INPUT VALIDATION SCHEMAS (Runtime Security with Zod)
// =============================================================================

/**
 * Message schema with strict validation
 * - Role is restricted to valid values only
 * - Content length is capped to prevent DoS attacks
 */
const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"], {
    errorMap: () => ({ message: "Invalid message role" }),
  }),
  content: z
    .string()
    .min(1, "Message content cannot be empty")
    .max(500000, "Message content exceeds maximum length of 500,000 characters"),
  metadata: z.object({
    timestamp: z.number().optional(),
    toolCalls: z.array(z.string()).optional(),
    tokenCount: z.number().optional(),
    attachments: z.array(z.object({
      type: z.enum(["image", "file", "link"]),
      url: z.string().url().optional(),
      mimeType: z.string().optional(),
      size: z.number().optional(),
    })).optional(),
  }).optional(),
});

/**
 * Advanced request options for fine-tuned control
 */
const RequestOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(100000).optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  strategy: z.enum([
    "fast", "balanced", "reasoning", "coding", "vision", 
    "creative", "costEffective", "highContext", "reliable"
  ]).optional(),
  enableCaching: z.boolean().optional(),
  streamPartialResults: z.boolean().optional(),
  responseFormat: z.enum(["text", "json", "markdown"]).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
  seed: z.number().int().optional(),
  logitBias: z.record(z.string(), z.number().min(-100).max(100)).optional(),
}).optional();

/**
 * Conversation context for multi-turn conversations
 */
const ConversationContextSchema = z.object({
  previousSummary: z.string().max(50000).optional(),
  activeTools: z.array(z.string()).optional(),
  userPreferences: z.record(z.string(), z.unknown()).optional(),
  conversationTopic: z.string().max(1000).optional(),
  sentimentScore: z.number().min(-1).max(1).optional(),
  keyEntities: z.array(z.object({
    name: z.string(),
    type: z.enum(["person", "company", "skill", "location", "other"]),
    relevance: z.number().min(0).max(1).optional(),
  })).optional(),
  followUpSuggestions: z.array(z.string()).optional(),
});

/**
 * Analysis configuration for specialized analytics
 */
const AnalysisConfigSchema = z.object({
  analysisType: z.enum([
    "talent-mapping", "skills-gap", "network-analysis", 
    "career-trajectory", "diversity-metrics", "compensation-benchmarking",
    "attrition-prediction", "team-composition", "market-intelligence"
  ]).optional(),
  depth: z.enum(["quick", "standard", "comprehensive"]).optional(),
  outputFormat: z.enum(["narrative", "structured", "visual", "executive-summary"]).optional(),
  focusAreas: z.array(z.string()).optional(),
  comparisons: z.array(z.object({
    type: z.enum(["benchmark", "peer-group", "historical", "competitor"]),
    reference: z.string(),
  })).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  includeRecommendations: z.boolean().optional(),
  includeSources: z.boolean().optional(),
});

/**
 * Main request body schema
 * All inputs are validated at runtime - TypeScript alone is NOT sufficient for security
 */
const RequestBodySchema = z.object({
  messages: z
    .array(MessageSchema)
    .min(1, "At least one message is required")
    .max(500, "Too many messages in conversation"),
  personaId: z
    .string()
    .max(100, "Persona ID too long")
    .regex(/^[a-zA-Z0-9-_]+$/, "Invalid persona ID format")
    .optional(),
  csvData: z
    .string()
    .max(10000000, "CSV data exceeds maximum length of 10MB")
    .optional(),
  modelId: z
    .string()
    .max(50, "Model ID too long")
    .optional(),
  options: RequestOptionsSchema,
  sessionId: z.string().uuid().optional(),
  conversationContext: ConversationContextSchema.optional(),
  analysisConfig: AnalysisConfigSchema.optional(),
  clientMetadata: z.object({
    userAgent: z.string().max(500).optional(),
    timezone: z.string().max(100).optional(),
    locale: z.string().max(20).optional(),
    screenResolution: z.string().max(20).optional(),
    clientVersion: z.string().max(50).optional(),
  }).optional(),
  activeView: z
    .string()
    .max(40)
    .regex(/^[a-z-]+$/, "Invalid activeView format")
    .optional(),
  pageContext: z
    .record(z.string(), z.unknown())
    .optional()
    .refine(
      (val) => !val || Object.keys(val).length <= 50,
      { message: "pageContext cannot have more than 50 keys" }
    ),
});

type ValidatedRequestBody = z.infer<typeof RequestBodySchema>;

// =============================================================================
// CACHING & PERFORMANCE
// =============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  metadata?: Record<string, unknown>;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  averageAccessCount: number;
}

class AdvancedLRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private readonly maxSize: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    
    // Periodic cleanup of expired entries
    setInterval(() => this.cleanupExpired(), 60000);
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }
    
    // Update access stats and move to end (most recently used)
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;
    return entry.value;
  }

  set(key: K, value: V, ttl: number = 300000, metadata?: Record<string, unknown>): void {
    // Evict entries if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictLeastValuable();
    }
    
    this.cache.set(key, { 
      value, 
      timestamp: Date.now(), 
      ttl,
      accessCount: 1,
      lastAccess: Date.now(),
      metadata,
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  getStats(): CacheStats {
    const totalAccess = this.stats.hits + this.stats.misses;
    let totalAccessCount = 0;
    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount;
    }
    
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalAccess > 0 ? this.stats.hits / totalAccess : 0,
      evictions: this.stats.evictions,
      averageAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0,
    };
  }

  private evictLeastValuable(): void {
    // Score entries based on recency and frequency
    let lowestScore = Infinity;
    let keyToEvict: K | undefined;
    
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      const ageScore = (now - entry.lastAccess) / entry.ttl;
      const frequencyScore = 1 / (entry.accessCount + 1);
      const score = 0.7 * ageScore + 0.3 * frequencyScore;
      
      if (score < lowestScore) {
        lowestScore = score;
        keyToEvict = key;
      }
    }
    
    if (keyToEvict !== undefined) {
      this.cache.delete(keyToEvict);
      this.stats.evictions++;
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const responseCache = new AdvancedLRUCache<string, string>(500);
const personaCache = new AdvancedLRUCache<string, string>(50);

// =============================================================================
// RATE LIMITING
// =============================================================================

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstLimit: number;
  penaltyMs?: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
  burstCount: number;
  burstWindowStart: number;
  penalizedUntil?: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      penaltyMs: 60000, // Default 1 minute penalty
      ...config,
    };
    
    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), 60000);
  }

  check(identifier: string): { allowed: boolean; remaining: number; retryAfter: number } {
    const now = Date.now();
    let entry = this.limits.get(identifier);

    // Check for penalty
    if (entry?.penalizedUntil && now < entry.penalizedUntil) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((entry.penalizedUntil - now) / 1000),
      };
    }

    // Initialize or reset window
    if (!entry || now - entry.windowStart > this.config.windowMs) {
      entry = {
        count: 0,
        windowStart: now,
        burstCount: 0,
        burstWindowStart: now,
      };
      this.limits.set(identifier, entry);
    }

    // Reset burst window if needed (burst window is 1/10 of main window)
    const burstWindowMs = this.config.windowMs / 10;
    if (now - entry.burstWindowStart > burstWindowMs) {
      entry.burstCount = 0;
      entry.burstWindowStart = now;
    }

    // Check burst limit first
    if (entry.burstCount >= this.config.burstLimit) {
      entry.penalizedUntil = now + (this.config.penaltyMs || 60000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil(burstWindowMs / 1000),
      };
    }

    // Check main window limit
    if (entry.count >= this.config.maxRequests) {
      const resetTime = entry.windowStart + this.config.windowMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      };
    }

    // Increment counters
    entry.count++;
    entry.burstCount++;

    return {
      allowed: true,
      remaining: this.config.maxRequests - entry.count,
      retryAfter: 0,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [identifier, entry] of this.limits.entries()) {
      if (now - entry.windowStart > this.config.windowMs * 2) {
        this.limits.delete(identifier);
      }
    }
  }
}

// Global rate limiter (by IP or user ID)
const globalRateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 60,
  burstLimit: 10,
  penaltyMs: 120000,
});

// Premium rate limiter for authenticated users
const premiumRateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 200,
  burstLimit: 30,
  penaltyMs: 30000,
});

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeMs: number;
  halfOpenRequests: number;
}

type CircuitState = "closed" | "open" | "half-open";

class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailure: number = 0;
  private halfOpenAttempts = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: CircuitBreakerConfig) {
    this.name = name;
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > this.config.resetTimeMs) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
        logger.info(`Circuit ${this.name} transitioning to half-open`);
      } else {
        throw new CircuitBreakerError(`Circuit ${this.name} is open`);
      }
    }

    // In half-open state, only allow limited requests
    if (this.state === "half-open" && this.halfOpenAttempts >= this.config.halfOpenRequests) {
      throw new CircuitBreakerError(`Circuit ${this.name} is half-open and at capacity`);
    }

    try {
      if (this.state === "half-open") {
        this.halfOpenAttempts++;
      }

      const result = await operation();

      // Success - reset circuit
      if (this.state === "half-open") {
        logger.info(`Circuit ${this.name} transitioning to closed`);
      }
      this.state = "closed";
      this.failures = 0;
      this.halfOpenAttempts = 0;

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();

      if (this.failures >= this.config.failureThreshold) {
        this.state = "open";
        logger.warn(`Circuit ${this.name} opened after ${this.failures} failures`);
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): { state: CircuitState; failures: number; lastFailure: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }
}

class CircuitBreakerError extends Error {
  public readonly code: string = "CIRCUIT_OPEN";
  public readonly statusCode: number = 503;

  constructor(message: string) {
    super(message);
    this.name = "CircuitBreakerError";
    Object.setPrototypeOf(this, CircuitBreakerError.prototype);
  }
}

// Circuit breaker for external API calls
const openAICircuitBreaker = new CircuitBreaker("openai", {
  failureThreshold: 5,
  resetTimeMs: 30000,
  halfOpenRequests: 2,
});

// =============================================================================
// RETRY LOGIC
// =============================================================================

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialFactor: number;
  retryableErrors: string[];
  jitterFactor: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialFactor: 2,
  retryableErrors: ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "RATE_LIMIT"],
  jitterFactor: 0.2,
};

async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      const errorCode = (error as { code?: string }).code || "";
      const isRetryable = finalConfig.retryableErrors.some(
        re => errorCode.includes(re) || lastError!.message.includes(re)
      );

      if (!isRetryable || attempt === finalConfig.maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = finalConfig.baseDelayMs * Math.pow(finalConfig.exponentialFactor, attempt);
      const jitter = baseDelay * finalConfig.jitterFactor * (Math.random() * 2 - 1);
      const delay = Math.min(baseDelay + jitter, finalConfig.maxDelayMs);

      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${randomPart}`;
}

/**
 * Get the language model instance based on model identifier or strategy
 * Falls back to default model if invalid/unknown model requested
 */
function getModel(modelId?: string, strategy?: ModelStrategy, openaiProvider?: ReturnType<typeof createOpenAI> | null) {
  let selectedModel = DEFAULT_MODEL;

  if (strategy && strategy in MODEL_STRATEGIES) {
    selectedModel = MODEL_STRATEGIES[strategy];
  } else if (modelId && modelId in MODEL_CONFIGS) {
    selectedModel = modelId;
  }

  const config = MODEL_CONFIGS[selectedModel];
  const provider = openaiProvider || createOpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  return provider(config.modelId);
}

/**
 * Get model configuration metadata
 */
function getModelConfig(modelId?: string, strategy?: ModelStrategy): ModelConfig {
  let selectedModel = DEFAULT_MODEL;
  
  if (strategy && strategy in MODEL_STRATEGIES) {
    selectedModel = MODEL_STRATEGIES[strategy];
  } else if (modelId && modelId in MODEL_CONFIGS) {
    selectedModel = modelId;
  }
  
  return MODEL_CONFIGS[selectedModel];
}

/**
 * Intelligent model selection based on task complexity
 */
function autoSelectModel(
  messages: ValidatedRequestBody["messages"], 
  csvData?: string,
  analysisConfig?: ValidatedRequestBody["analysisConfig"]
): string {
  const lastMessage = messages[messages.length - 1]?.content || "";
  const totalLength = messages.reduce((acc: number, m: { content: string }) => acc + m.content.length, 0);
  
  // Complex reasoning indicators
  const reasoningKeywords = ["analyze", "compare", "evaluate", "synthesize", "strategize", "optimize", "forecast", "predict"];
  const codingKeywords = ["code", "implement", "debug", "refactor", "function", "algorithm", "script", "program"];
  const creativeKeywords = ["write", "draft", "compose", "create", "generate", "brainstorm"];
  const hasReasoningIntent = reasoningKeywords.some(kw => lastMessage.toLowerCase().includes(kw));
  const hasCodingIntent = codingKeywords.some(kw => lastMessage.toLowerCase().includes(kw));
  const hasCreativeIntent = creativeKeywords.some(kw => lastMessage.toLowerCase().includes(kw));
  
  // Analysis configuration overrides
  if (analysisConfig?.depth === "comprehensive") {
    return "o3";
  }
  
  // Large context needs
  if (totalLength > 50000 || (csvData && csvData.length > 100000)) {
    return "gpt-4.1"; // Million token context
  }
  
  // Complex reasoning tasks
  if (hasReasoningIntent && totalLength > 10000) {
    return "o3";
  }
  
  // Coding tasks
  if (hasCodingIntent) {
    return "gpt-4.1";
  }
  
  // Creative tasks
  if (hasCreativeIntent) {
    return "gpt-4o";
  }
  
  // Simple queries
  if (totalLength < 2000 && messages.length < 5) {
    return "gpt-4o-mini";
  }
  
  return "gpt-4o"; // Default balanced choice
}

/**
 * Estimate token count for a string (approximate)
 */
function estimateTokenCount(text: string): number {
  // Rough estimation: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Sanitize CSV data to prevent injection attacks
 * - Removes potentially dangerous characters and sequences
 * - Limits line length to prevent buffer issues
 * - Handles various encodings gracefully
 */
function sanitizeCsvData(csvData: string): string {
  // Remove null bytes and other control characters (except newlines, tabs, carriage returns)
  let sanitized = csvData.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  
  // Normalize line endings
  sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Remove potential formula injection patterns (Excel/Sheets injection)
  sanitized = sanitized.replace(/^[=+\-@]/gm, "'$&");
  
  // Limit individual line length to prevent processing issues
  const maxLineLength = 50000;
  const lines = sanitized.split("\n");
  sanitized = lines
    .map((line) => (line.length > maxLineLength ? line.slice(0, maxLineLength) + "...[truncated]" : line))
    .join("\n");

  return sanitized;
}

/**
 * Extract metadata from CSV data for analysis enhancement
 */
function extractCsvMetadata(csvData: string): {
  rowCount: number;
  columnCount: number;
  estimatedSize: number;
  hasHeaders: boolean;
  sampleColumns: string[];
} {
  const lines = csvData.split("\n").filter(l => l.trim());
  const firstLine = lines[0] || "";
  const columns = firstLine.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
  
  // Heuristic: if first row contains mostly non-numeric values, likely headers
  const hasHeaders = columns.every(c => isNaN(Number(c)) && c.length > 0);
  
  return {
    rowCount: hasHeaders ? lines.length - 1 : lines.length,
    columnCount: columns.length,
    estimatedSize: csvData.length,
    hasHeaders,
    sampleColumns: columns.slice(0, 10),
  };
}

/**
 * Validate request body with comprehensive error handling
 * This is the primary security gate for all incoming data
 */
function validateRequestBody(body: unknown): ValidatedRequestBody {
  const result = RequestBodySchema.safeParse(body);

  if (!result.success) {
    // Format errors for client - be informative but not verbose
    const errorMessages = result.error.errors
      .slice(0, 5) // Limit number of errors shown
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    throw new ValidationError(`Validation failed: ${errorMessages}`);
  }

  return result.data;
}

/**
 * Server-side jailbreak / prompt-injection prefilter.
 * Blocks obvious DAN / "do anything now" / "ignore previous instructions" style attacks
 * before they ever hit the model.
 */
function detectJailbreakPatterns(messages: ValidatedRequestBody["messages"]): string | null {
  const fullText = messages.map((m) => m.content).join("\n").toLowerCase();

  for (const { pattern, label } of CHAT_JAILBREAK_PATTERNS) {
    if (pattern.test(fullText)) {
      return label;
    }
  }

  return null;
}

/**
 * Custom error class for validation failures
 * Allows distinguishing validation errors from other errors
 */
class ValidationError extends Error {
  public readonly code: string = "VALIDATION_ERROR";
  public readonly statusCode: number = 400;
  public readonly details?: Record<string, unknown>;
  
  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Custom error class for rate limiting
 */
class RateLimitError extends Error {
  public readonly code: string = "RATE_LIMIT_EXCEEDED";
  public readonly statusCode: number = 429;
  public readonly retryAfter: number;
  
  constructor(message: string, retryAfter: number = 60) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Custom error class for model-related errors
 */
class ModelError extends Error {
  public readonly code: string = "MODEL_ERROR";
  public readonly statusCode: number = 500;
  public readonly modelId: string;

  constructor(message: string, modelId: string) {
    super(message);
    this.name = "ModelError";
    this.modelId = modelId;
    Object.setPrototypeOf(this, ModelError.prototype);
  }
}

/**
 * Per-page context: tools to prioritize and suggested intents so the AI is more helpful per view.
 * All data is sanitized before inclusion in the system prompt.
 */
type ViewPageContext = {
  tools: string;
  secondaryTools?: string;
  intents: string[];
  description: string;
};

const VIEW_PAGE_CONTEXT: Record<string, ViewPageContext> = {
  dashboard: {
    tools: "analyzeCSVProfiles, analyzeCrmPortfolio, high-level stats and activity summaries, project/objective overview; webSearch and fetchPage for research or looking up docs/setup",
    secondaryTools: "getRecommendations, searchProfiles, analyzeTribeComposition when user asks about talent",
    intents: [
      "Summarize dashboard metrics and what to focus on next",
      "Analyze uploaded CSV and suggest tribes or objectives",
      "Get activity and project status overview",
      "Help set up the entire stack: Supabase (Cloud or local), .env.local, sign in, data, optional Docker and LinkedIn",
      "Walk through Supabase setup using official docs (create project, API keys, auth)",
      "Explain difference between Supabase Cloud and local/Docker for this app",
      "Research or factual questions: use webSearch and cite sources; combine with app data when relevant",
    ],
    description: "Dashboard: setup checklist, workspace overview, and high-level metrics. User may need full-stack setup guidance; use Supabase docs reference when provided. Web search available for research and setup docs.",
  },
  chat: {
    tools: "Full toolkit; choose based on query: searchProfiles, analyzeCSVProfiles, analyzeCrmPortfolio, analyzeTribeComposition, analyzeGroupTalentOpportunities, createTribe, createProject, getProjectCrmInsights, analyzeNetwork, getRecommendations; for factual or research questions use webSearch and optionally fetchPage; combine web search with data tools when the user needs both external sources and LinkedIn/CRM insights",
    intents: [
      "Run any LinkedIn intelligence task: search, analyze, tribes, projects, network",
      "Deep-dive analysis with multiple tools chained",
      "Research or factual questions: use webSearch (and fetchPage for specific URLs), then cite sources",
      "Combine web search with app data: e.g. market trends (webSearch) + talent pool (searchProfiles, analyzeCSVProfiles, analyzeCrmPortfolio)",
      "Suggest next steps across profiles, tribes, and projects",
    ],
    description: "AI Assistant full view; user may ask about any area. Use web search for research/factual queries and combine with data tools when relevant.",
  },
  profiles: {
    tools: "searchProfiles, getProfileDetails, analyzeCSVProfiles, analyzeCrmPortfolio, getProfileConnections",
    secondaryTools: "createTribe, createProject, setAspirationGoal, analyzeTribeComposition, getProjectCrmInsights when user wants to act on a profile or connect to tribes/projects",
    intents: [
      "Search profiles by skills, location, seniority, company",
      "Get details and connections for a specific profile",
      "Create a tribe or project from selected profiles; suggest which tribe or project fits the current profile",
      "Set aspiration goals or recommend next actions for a profile",
      "Connect this profile to a tribe or project; suggest LinkedOut outreach or jobs that match",
    ],
    description: "Profiles CRM: contact list, search, profile-level actions. Part of CRM & Talent—works with Tribes, Projects, LinkedOut.",
  },
  tribes: {
    tools: "designTribesForObjective, createTribe, listTribes, addProfilesToTribe, analyzeTribeComposition, analyzeGroupTalentOpportunities, getRecommendations, searchProfiles, analyzeCSVProfiles",
    secondaryTools: "getProjectCrmInsights, analyzeCrmPortfolio to align tribes with projects, createProject to create a project for a tribe; suggest Share on LinkedIn from Settings (rate-limited—one post at a time)",
    intents: [
      "Design tribes for an objective (designTribesForObjective), then createTribe with returned profile IDs, then createProject(assignedTribeId), then suggest Share on LinkedIn or outreach",
      "Form a tribe from CRM profile IDs (createTribe with profileIds and tribePurpose)",
      "List existing tribes and their member counts (listTribes)",
      "Add CRM profiles to an existing tribe (addProfilesToTribe with tribeId and profileIds)",
      "Recommend tribe composition for a project or goal; suggest roles and skills balance",
      "Analyze team dynamics and skill coverage (analyzeTribeComposition), then suggest members to add or roles to fill",
      "Find community/group opportunities and high-fit candidates outside a target tribe (analyzeGroupTalentOpportunities)",
      "Align a tribe with a project or create a project from a tribe (getProjectCrmInsights, createProject)",
      "Suggest CRM profiles to add to this tribe; connect tribe to a LinkedOut objective or hiring project",
    ],
    description: "Tribe Builder: form and manage tribes, sync with Profiles CRM and Projects; visualize member distribution. Part of CRM & Talent—works with Profiles, Projects, LinkedOut.",
  },
  projects: {
    tools: "designTribesForObjective, getProjectCrmInsights, createProject, getProjectStatus, searchProfiles, analyzeCrmPortfolio, analyzeTribeComposition",
    secondaryTools: "createTribe, getRecommendations, listTribes, addProfilesToTribe for talent alignment; suggest Share on LinkedIn from Settings (rate-limited)",
    intents: [
      "Design tribes for this project (designTribesForObjective), create a tribe, attach via createProject(assignedTribeId), then suggest Share on LinkedIn or outreach",
      "Get CRM and AI candidate recommendations for open roles",
      "Identify project skill gaps from hiring positions",
      "Draft outreach or shortlist candidates for a project",
      "Align tribes and talent to project milestones; suggest which tribe or CRM profiles fit this project",
      "Connect this project to a tribe; suggest LinkedOut jobs or outreach for the role",
    ],
    description: "Projects: hiring, milestones, talent alignment. Part of CRM & Talent—works with Profiles, Tribes, LinkedOut.",
  },
  fundraising: {
    tools: "No direct fundraising tools in chat; guide user to Fundraising panel for campaigns, donors, donations, goals, and outreach",
    secondaryTools: "searchProfiles, getProfileDetails when user ties donors to CRM; suggest email/LinkedIn outreach from Fundraising tab",
    intents: [
      "Explain Fundraising panel: campaigns, donors, donations, goals, and Outreach (email/LinkedIn) tabs",
      "Suggest how to structure a campaign or set goals",
      "Connect donor or campaign context to CRM profiles when relevant",
      "Guide user to Fundraising → Outreach for email or LinkedIn campaigns",
    ],
    description: "Fundraising: campaigns, donors, donations, goals, and outreach (email/LinkedIn). Part of CRM & Talent.",
  },
  data: {
    tools: "Full data toolkit when user asks about a specific area: searchProfiles, analyzeCrmPortfolio, listTribes, getProjectCrmInsights; otherwise guide to the right panel",
    secondaryTools: "Suggest opening Profiles, Tribes, Projects, Fundraising, or Files & assets from Data hub",
    intents: [
      "Explain Data hub: single entry to Profiles CRM, Tribe Builder, Projects, Fundraising, and Files & assets (Supabase Storage)",
      "Direct user to the right data panel for their task",
      "Summarize what each Supabase-backed area does (profiles, tribes, projects, fundraising, storage)",
    ],
    description: "Data hub: overview of all Supabase-backed data areas. Links to Profiles, Tribes, Projects, Fundraising, Files & assets.",
  },
  storage: {
    tools: "No direct storage tools in chat; guide user to Files & assets panel for upload/list/delete",
    intents: [
      "Explain Files & assets (Supabase Storage): upload images, PDFs, text; campaign assets or profile avatars",
      "Remind user to run storage migration if bucket is not set up (supabase/migrations/20260305200000_storage_linkedout_assets.sql)",
    ],
    description: "Files & assets: Supabase Storage (list, upload, delete). Bucket linkedout-assets; auth required.",
  },
  email: {
    tools: "getConversations, sendMessage — use to summarize threads, draft outreach, or explain sync",
    secondaryTools: "searchProfiles, getProfileDetails when user ties email to a contact or profile",
    intents: [
      "Summarize recent LinkedIn messaging conversations or threads",
      "Draft or suggest outreach messages (sendMessage when available)",
      "Explain email workspace, Gmail/Outlook/IMAP sync, and credential security",
      "Connect email context to a profile or tribe when relevant",
    ],
    description: "Email workspace: Gmail/Outlook/IMAP sync, search, send, and drafts.",
  },
  analytics: {
    tools: "getProfileViews, getPostAnalytics, getSkillsAnalysis, analyzeCSVProfiles, analyzeCrmPortfolio, analyzeTribeComposition",
    secondaryTools: "getRecommendations, analyzeGroupTalentOpportunities, trend and aspiration insights",
    intents: [
      "Summarize aspiration trends or top skills in network",
      "Profile views and post performance (when data available)",
      "Skills distribution and gap analysis",
    ],
    description: "Analytics: trends, skills, and aspiration insights.",
  },
  linkedout: {
    tools: "designTribesForObjective, searchProfiles, getProfileConnections, getProjectCrmInsights, sendConnectionRequest, searchJobs, searchCompanies",
    secondaryTools: "getRecommendations, analyzeGroupTalentOpportunities, createProject, createTribe, listTribes, addProfilesToTribe for objectives; suggest Share on LinkedIn from Settings (rate-limited—one post at a time)",
    intents: [
      "Design tribes for this objective (designTribesForObjective), create a project for the best fit, then suggest Share on LinkedIn or outreach",
      "Find companies hiring in a sector or location",
      "Search jobs (e.g. San Francisco, remote)",
      "Build or refine a custom objective for a hiring project; link to a Project and Tribe",
      "Suggest connection requests or outreach; pull target profiles from CRM or a tribe, and use group opportunity analysis for warm channels",
      "Suggest drafting a LinkedIn post and point user to Settings → Share on LinkedIn; if user hits rate limit, explain try-again-in-X-minutes",
      "Connect this objective to a project and tribe; recommend CRM profiles for outreach",
    ],
    description: "LinkedOut: jobs, companies, objectives, outreach. Part of CRM & Talent—works with Profiles, Tribes, Projects.",
  },
  network: {
    tools: "analyzeNetwork, getRecommendations, getProfileConnections, analyzeGroupTalentOpportunities",
    secondaryTools: "searchProfiles, analyzeCrmPortfolio, influence mapping and cluster analysis",
    intents: [
      "Analyze network clusters and influence",
      "Get talent or connector recommendations",
      "Map connections and suggest introductions",
    ],
    description: "Network Insights: graph, clusters, and recommendations.",
  },
  agents: {
    tools: "No direct agent API tools in chat; provide technical and workflow guidance",
    intents: [
      "Explain agent control and guardrails",
      "Suggest how to configure or use agents safely",
    ],
    description: "Agent Control: guardrails and agent configuration.",
  },
  globe: {
    tools: "Network and location-related analysis; profile geography when relevant",
    secondaryTools: "searchProfiles by location, analyzeNetwork for spatial clusters",
    intents: [
      "Relate profiles or tribes to geography",
      "Summarize network by region or location",
    ],
    description: "3D Globe: geographic view of network and locations.",
  },
  sentinel: {
    tools: "Security and policy context; no data tools; explain SENTINEL, AEGIS, guardrails, and resilience vs maturity",
    intents: [
      "Explain SENTINEL mode, risk scoring, veto oversight, and provenance chains",
      "Clarify why compliance is not the same as being safe; security as culture, not checkbox; compliance validates paperwork, resilience validates survival",
      "Explain AEGIS Doctrine and why guardrails cannot be disabled for convenience",
      "Describe threat intel, approval queue, and how defenders use this control plane",
      "Help shift from activity metrics (tickets, green dashboards) to impact metrics: time-to-detect, time-to-contain, blast radius, damage prevented",
      "Explain why zero reported incidents can mean zero detection; silence is not safety",
      "Advise on operating at threat speed rather than reporting-cycle speed; rehearsed response over thick documentation",
      "Tie controls to business impact: how each control reduces financial exposure or limits blast radius",
    ],
    description: "SENTINEL: security control plane. Risk scoring, veto, provenance, threat intel. Security is culture; guardrails protect people. Resilience (containment, detection speed, impact) over maturity theatre.",
  },
  settings: {
    tools: "Configuration guidance; no data tools; explain Settings and integrations",
    intents: [
      "Explain Settings sections (theme, LinkedIn, Supabase, etc.)",
      "Guide through Connect LinkedIn or Share on LinkedIn",
      "Help set up the full stack: Supabase (Cloud or local), .env.local, Docker, LinkedIn",
    ],
    description: "Settings: app configuration and integrations.",
  },
};

/** Official Supabase docs and stack setup reference for AI when helping users set up the app. Cite these when guiding setup. */
const SUPABASE_AND_STACK_SETUP_REFERENCE = `
**Supabase & full-stack setup (reference — cite when helping with setup):**

Official Supabase documentation (use these URLs when guiding users):
- Create a project: https://database.new or https://supabase.com/dashboard — then get Project URL and API keys from Project Settings → API (or Connect dialog).
- API keys: https://supabase.com/docs/guides/api/api-keys — anon/public key for client, service_role for server-only; use Project URL + anon key in .env.local as NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
- Auth (email/password, providers): https://supabase.com/docs/guides/auth — enable in Dashboard → Authentication; users sign in via the app's login page.
- Next.js + Supabase quickstart: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs — create project, add .env.local with URL and anon key, run app.
- Local development (Supabase CLI): https://supabase.com/docs/guides/cli/local-development — run local Supabase with \`supabase start\`; this repo uses \`pnpm supabase:local:start\` and writes URL/keys to .env.local.
- Self-hosted Supabase with Docker: https://supabase.com/docs/guides/self-hosting/docker — clone supabase/supabase, copy docker files to a project dir, copy .env.example to .env, set POSTGRES_PASSWORD and generate ANON_KEY/SERVICE_ROLE_KEY/JWT_SECRET (or run ./utils/generate-keys.sh), set DASHBOARD_PASSWORD and SITE_URL/API_EXTERNAL_URL/SUPABASE_PUBLIC_URL (e.g. http://localhost:8000), then \`docker compose up -d\`. API gateway is on port 8000. For LinkedOut, set NEXT_PUBLIC_SUPABASE_URL to that base URL (e.g. http://localhost:8000) and NEXT_PUBLIC_SUPABASE_ANON_KEY to the ANON_KEY from the self-hosted .env.

This app's stack:
1. Copy .env.example to .env.local; set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (from Supabase Cloud, local Supabase CLI, or self-hosted Supabase Docker).
2. Optional app Docker: set POSTGRES_PASSWORD, run \`pnpm docker:up\`; app still needs Supabase auth (Cloud, local, or self-hosted) via those env vars.
3. Self-hosted Supabase: follow the Self-Hosting with Docker guide; then point the app at your API URL and anon key in .env.local.
4. Sign in: app → Settings or Dashboard → Open login page → sign up/sign in with Supabase Auth.
5. Data: upload CSV in AI Assistant or use Supabase-backed profiles/tribes/projects (run repo migrations if using own DB).
6. LinkedIn: create app at https://www.linkedin.com/developers/apps, add client ID/secret and redirect URI to .env.local, then Settings → Connect LinkedIn.

In-app setup guide: user can open /setup for a step-by-step page; docs/setup-and-onboarding.md in the repo has the full written guide including self-hosted Docker.
`;

function buildSystemPrompt(
  personaId: string,
  csvData?: string,
  conversationContext?: ValidatedRequestBody["conversationContext"],
  analysisConfig?: ValidatedRequestBody["analysisConfig"],
  activeView?: string,
  pageContext?: Record<string, unknown>
): string {
  // Check persona cache first
  const cachedPersonaPrompt = personaCache.get(personaId);
  const persona = getPersona(personaId || "hr-director");

  const parts: string[] = [];
  const aegisDoctrinePreamble = `
**AEGIS Doctrine (Mandatory Operating Constraints):**
- AI is a tool, not a companion, authority, or substitute for human judgment.
- Simulated empathy must never be used to manipulate users.
- Guardrails are mandatory and must not be bypassed for convenience.
- Human life, dignity, and psychological autonomy outrank model efficiency.
- Never support autonomous kinetic force, detention, or pre-crime punishment.
- Do not claim certainty when uncertain; preserve human critical thinking.
`;

  parts.push(aegisDoctrinePreamble);

  // Base persona instructions
  parts.push(cachedPersonaPrompt || persona.systemPrompt);
  
  if (!cachedPersonaPrompt) {
    personaCache.set(personaId, persona.systemPrompt, 600000); // Cache for 10 minutes
  }

  parts.push(`
You are a state-of-the-art LinkedIn intelligence assistant powered by cutting-edge AI. Your analytical, critical reasoning, and communication capabilities are at an expert level. Every response should be complete, precise, actionable, and comprehensively address the user's objectives.

**Core Capabilities:**
- Advanced multi-modal reasoning and analysis
- Real-time data processing and pattern recognition
- Predictive analytics and trend forecasting
- Natural language understanding with context awareness
- Tool orchestration for complex, multi-step analyses
- Statistical analysis and data visualization recommendations
- Network analysis and influence mapping
- Comparative benchmarking across industries and regions`);

  if (activeView) {
    const ctx = VIEW_PAGE_CONTEXT[activeView];
    const isCrmAndTalent = ["profiles", "tribes", "projects", "linkedout", "fundraising", "data", "storage"].includes(activeView);
    const isSetupContext = activeView === "dashboard" || activeView === "settings";
    if (ctx) {
      const intentsList = ctx.intents.map((i) => `- ${i}`).join("\n");
      parts.push(`
**Current page context (use this to choose tools and suggest actions):**
Page: **${activeView}**. ${ctx.description}
${isCrmAndTalent ? `\n**CRM & Talent:** Profiles CRM, Tribe Builder, Projects, and LinkedOut work together. When the user's goal spans hiring, tribes, outreach, or talent, use tools across these areas (e.g. suggest a tribe for a project, CRM profiles for an objective, or LinkedOut jobs for a role). Use **Additional context** below when the user has a profile, tribe, or project selected.\n` : ""}
${isSetupContext ? `\n${SUPABASE_AND_STACK_SETUP_REFERENCE}\nWhen the user asks to set up Supabase or the full stack, walk them through using the official Supabase docs links above and this app's steps ( .env.local, login, data, optional LinkedIn/Docker). Suggest opening the in-app /setup page or docs/setup-and-onboarding.md for the full guide.\n` : ""}

**Tools to prioritize:** ${ctx.tools}
${ctx.secondaryTools ? `**Also useful here:** ${ctx.secondaryTools}\n` : ""}
**On this page you can help with:**
${intentsList}

Be context-aware: suggest and use tools that match the current page. You may still use other tools when the user's question clearly requires them.`);
    } else {
      parts.push(`
**Current page context:**
The user has the AI Assistant open while on the **${activeView}** page. Use the full LinkedIn intelligence toolkit as appropriate and suggest actions relevant to this page.`);
    }
    if (pageContext && Object.keys(pageContext).length > 0) {
      const safe = Object.entries(pageContext)
        .filter(([, v]) => v !== undefined && v !== null && typeof v !== "object")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("; ");
      if (safe) parts.push(`**Additional context:** ${safe}`);
    }
  }

  // Include conversation context if available
  if (conversationContext?.previousSummary) {
    parts.push(`
**Conversation Context:**
${conversationContext.previousSummary}`);
  }

  if (conversationContext?.keyEntities && conversationContext.keyEntities.length > 0) {
    const entitiesList = conversationContext.keyEntities
      .map((e: { name: string; type: string }) => `- ${e.name} (${e.type})`)
      .join("\n");
    parts.push(`
**Key Entities Under Discussion:**
${entitiesList}`);
  }

  // Include analysis configuration if provided
  if (analysisConfig) {
    parts.push(`
**Analysis Configuration:**
- Analysis Type: ${analysisConfig.analysisType || "general"}
- Depth: ${analysisConfig.depth || "standard"}
- Output Format: ${analysisConfig.outputFormat || "structured"}
${analysisConfig.focusAreas ? `- Focus Areas: ${analysisConfig.focusAreas.join(", ")}` : ""}
${analysisConfig.confidenceThreshold !== undefined ? `- Confidence Threshold: ${(analysisConfig.confidenceThreshold * 100).toFixed(0)}%` : ""}
${analysisConfig.includeRecommendations !== false ? "- Include actionable recommendations" : ""}
${analysisConfig.includeSources !== false ? "- Include data sources and methodology" : ""}`);
  }

  // If LinkedIn CSV data is present, enhance AI context with it
  if (csvData) {
    const sanitizedCsv = sanitizeCsvData(csvData);
    const csvMetadata = extractCsvMetadata(sanitizedCsv);
    const maxCsvLength = 100000; // Increased for larger context models
    const csvPreview =
      sanitizedCsv.length > maxCsvLength
        ? sanitizedCsv.slice(0, maxCsvLength) + "\n...[truncated for context window optimization]"
        : sanitizedCsv;

    parts.push(`
**LinkedIn Data Analysis Context:**
The user has uploaded LinkedIn CSV data containing professional intelligence. Below is the data for comprehensive analysis:

**Data Overview:**
- Rows: ${csvMetadata.rowCount.toLocaleString()}
- Columns: ${csvMetadata.columnCount}
- Size: ${(csvMetadata.estimatedSize / 1024).toFixed(2)} KB
- Detected columns: ${csvMetadata.sampleColumns.join(", ")}

\`\`\`csv
${csvPreview}
\`\`\`

**Data Analysis Framework:**
1. **Structural Analysis**: Parse and understand the data schema, column relationships, and data quality
2. **Quantitative Metrics**: Extract counts, distributions, percentiles, and statistical summaries
3. **Qualitative Insights**: Identify unique patterns, standout profiles, and narrative trends
4. **Network Topology**: Map connections, clusters, and influence pathways
5. **Predictive Signals**: Surface leading indicators for hiring, attrition, and growth
6. **Anomaly Detection**: Identify outliers and unusual patterns worth investigating
7. **Temporal Analysis**: Track changes and trends over time where applicable

Always leverage the analyzeCSVProfiles tool for sophisticated, multi-dimensional analysis including:
- Skills matrices with proficiency distributions
- Career trajectory modeling and progression analysis
- Diversity and inclusion metrics
- Talent pool segmentation and benchmarking
- Network centrality and influence scoring
- Compensation range estimation (where data permits)
- Geographic and industry distribution analysis`);
  }

  // Instruction set for advanced, audit-ready, actionable output
  parts.push(`
**LinkedIn Intelligence Toolkit:**
You have access to the comprehensive LinkedIn API toolkit. When analyzing people, companies, skills, jobs, career paths, talent pools, or networks:

1. **Tool Selection**: Choose optimal tool(s) with clear rationale for selection
2. **Intelligent Chaining**: Combine tools for deeper, richer insights with clear data flow
3. **Structured Output**: Use tables, charts, bullet points, and visual hierarchy
4. **Error Handling**: Gracefully handle missing data or tool failures with fallback strategies
5. **Critical Workflow Verification**: After destructive operations (for example deleteRapidFireDb, deleteRapidFireCollection, deleteRapidFireDocument), call the mapped verify tool before claiming completion.

**Analysis Methodology:**
1. State analytical approach, goals, and hypotheses upfront
2. Execute relevant tools systematically with progress updates
3. Interpret results with both high-level patterns and granular details
4. Provide concrete recommendations with confidence levels (High/Medium/Low)
5. Suggest follow-up analyses and refinement opportunities
6. Acknowledge limitations and potential biases in the analysis

**Team Building & Organizational Design:**
- Optimize for complementary skills and cognitive diversity
- Balance experience levels, disciplines, and working styles
- Analyze leadership distribution and collaboration networks
- Identify skill gaps and development opportunities
- Recommend evidence-based team compositions with clear rationale
- Visualize findings with skills clouds, matrices, and network diagrams
- Proactively identify risks, blind spots, and potential biases
- Consider cultural fit and team dynamics

**Output Standards:**
- Executive-ready summaries with supporting detail (pyramid principle)
- Actionable recommendations with implementation roadmaps and timelines
- Confidence intervals and uncertainty acknowledgment
- Source attribution and methodology transparency
- Clear next steps and decision points
- Visual aids described for implementation (charts, graphs, diagrams)

**Response Quality Checklist:**
✓ Directly addresses the user's question or objective
✓ Uses tools when appropriate for data-driven insights
✓ Provides structured, scannable formatting
✓ Includes specific examples and evidence
✓ Offers actionable next steps
✓ Acknowledges any limitations or caveats

**Research assistant & combining web search with app data:**
- For factual, current-events, or “look this up” questions: use **webSearch** to find and cite authoritative sources. If a result needs verification or a direct quote, use **fetchPage** for that URL.
- When the user needs both external information and app data (e.g. market trends + your talent pool, or salary benchmarks + CRM profiles): run **webSearch** (and optionally **fetchPage**) and also run the relevant data tools (searchProfiles, analyzeCSVProfiles, analyzeCrmPortfolio, analyzeTribeComposition, getProjectCrmInsights, etc.). Synthesize both in your answer.
- For research-style answers: give a short, direct answer with key points first; then a detailed section with evidence. Include a **Key citations** list (titles + URLs) at the end when you used web search or fetched pages. Use language that reflects uncertainty when appropriate (e.g. “research suggests,” “sources indicate”).
- Never invent facts or numbers; only cite what the tools returned. Use the built-in web search for external facts and combine with app tools when the user needs both.`);

  return parts.join("\n\n");
}

/**
 * Convert validated messages to the format expected by the AI SDK
 * Includes optional metadata preservation
 */
function convertToModelMessages(
  messages: ValidatedRequestBody["messages"]
): ModelMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Generate a cache key for request deduplication
 */
function generateCacheKey(
  messages: ValidatedRequestBody["messages"], 
  modelId: string,
  personaId?: string
): string {
  const messageHash = messages
    .map((m: { role: string; content: string }) => `${m.role}:${m.content.slice(0, 100)}`)
    .join("|");
  const keyBase = `${modelId}:${personaId || "default"}:${messageHash}`;
  // Use btoa for base64 encoding in browser/edge environments
  return btoa(keyBase).slice(0, 64);
}

/**
 * Get client identifier for rate limiting (IP or user ID)
 */
function getClientIdentifier(req: Request): string {
  const ip = getClientAddressFromRequest(req);
  return `ip:${ip}`;
}

/**
 * Truncate conversation history to fit within context limits
 */
function truncateConversationHistory(
  messages: ValidatedRequestBody["messages"],
  maxTokens: number
): ValidatedRequestBody["messages"] {
  let totalTokens = 0;
  const truncated: ValidatedRequestBody["messages"] = [];
  
  // Always include the last message (current user request)
  const lastMessage = messages[messages.length - 1];
  if (lastMessage) {
    truncated.unshift(lastMessage);
    totalTokens += estimateTokenCount(lastMessage.content);
  }
  
  // Add messages from most recent to oldest until we hit the limit
  for (let i = messages.length - 2; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokenCount(msg.content);
    
    if (totalTokens + msgTokens > maxTokens) {
      // Add a summary message instead
      truncated.unshift({
        role: "system",
        content: `[Earlier conversation context truncated to fit context window. ${i + 1} messages omitted.]`,
      });
      break;
    }
    
    truncated.unshift(msg);
    totalTokens += msgTokens;
  }
  
  return truncated;
}

// =============================================================================
// MAIN API HANDLER
// =============================================================================

/**
 * POST /api/chat
 * 
 * Handles chat requests with AI model streaming responses.
 * 
 * Security measures implemented:
 * 1. Runtime input validation with Zod (not relying on TypeScript)
 * 2. Input sanitization for CSV data
 * 3. Error messages sanitized to prevent information leakage
 * 4. API key stored in server-side env var only
 * 5. Request size limits enforced through validation
 * 6. LRU caching for performance optimization
 * 7. Intelligent model selection based on task complexity
 * 8. Rate limiting with burst protection
 * 9. Circuit breaker for external API resilience
 * 10. Comprehensive logging and metrics
 * 
 * Future enhancements:
 * - Authentication via NextAuth/Clerk integration
 * - Redis-based distributed rate limiting
 * - Request tracing with OpenTelemetry
 * - A/B testing for model selection
 * - Webhook callbacks for async operations
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  let requestContext: RequestContext | undefined;

  // Resolve OpenAI from user-provided header or server env
  const resolvedOpenAI = resolveOpenAI(req);
  if (!resolvedOpenAI) {
    return new Response(
      JSON.stringify({
        error: "No OpenAI API key available. Configure your key in Settings, or set OPENAI_API_KEY on the server.",
        code: "CONFIGURATION_ERROR",
        requestId,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
      },
    );
  }
  
  try {
    const subagentId = resolveMcpSubagentIdFromRequest(req);
    const authContext = await resolveRealtimeAuthContext(req);
    const clientId =
      authContext?.isSupabaseSession && authContext.userId
        ? `user:${authContext.userId}`
        : getClientIdentifier(req);

    if (REQUIRE_CHAT_AUTH && !authContext?.isSupabaseSession) {
      return new Response(
        JSON.stringify({
          error: "A valid Supabase bearer token is required for chat access.",
          code: "CHAT_AUTH_REQUIRED",
          requestId,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
          },
        },
      );
    }

    if (requiresAuthenticatedSessionForSubagent(subagentId) && !authContext?.isSupabaseSession) {
      return new Response(
        JSON.stringify({
          error: "A valid Supabase bearer token is required for this sub-agent.",
          code: "SUBAGENT_AUTH_REQUIRED",
          requestId,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
          },
        },
      );
    }

    // Rate limiting check
    const rateLimitResult = globalRateLimiter.check(clientId);
    
    if (!rateLimitResult.allowed) {
      logger.warn("Rate limit exceeded", { clientId, requestId });
      throw new RateLimitError(
        `Rate limit exceeded. Please retry after ${rateLimitResult.retryAfter} seconds.`,
        rateLimitResult.retryAfter
      );
    }

    // Parse JSON body with error handling
    const parsedBody = await parseJsonBodyWithLimit(req, MAX_CHAT_BODY_BYTES);
    if (!parsedBody.ok) {
      logger.warn("Invalid chat request body", { requestId, reason: parsedBody.error });
      return new Response(
        JSON.stringify({ 
          error: parsedBody.error,
          code: parsedBody.status === 413 ? "REQUEST_BODY_TOO_LARGE" : "INVALID_JSON",
          requestId,
          timestamp: new Date().toISOString(),
        }),
        {
          status: parsedBody.status,
          headers: { 
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
          },
        }
      );
    }

    // Validate all inputs at runtime - this is the security boundary
    const validatedBody = validateRequestBody(parsedBody.value);
    const { 
      messages, 
      personaId, 
      csvData, 
      modelId, 
      options, 
      conversationContext,
      analysisConfig,
      sessionId,
      activeView,
      pageContext,
    } = validatedBody;

    // Basic jailbreak / DAN prefilter before any model call.
    const jailbreakLabel = detectJailbreakPatterns(messages);
    if (jailbreakLabel) {
      logger.warn("Jailbreak pattern detected in chat request", {
        requestId,
        clientId,
        jailbreakLabel,
      });
      return new Response(
        JSON.stringify({
          error: "Request blocked by jailbreak detection.",
          code: "JAILBREAK_DETECTED",
          details: { pattern: jailbreakLabel },
          requestId,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
          },
        },
      );
    }

    // Intelligent model selection
    const effectiveModelId = options?.strategy 
      ? MODEL_STRATEGIES[options.strategy]
      : modelId || autoSelectModel(messages, csvData, analysisConfig);
    const aegisModelDecision = evaluateAegisModelAccess(effectiveModelId);
    if (aegisModelDecision.blocked) {
      return new Response(
        JSON.stringify({
          error: aegisModelDecision.reason || "Requested model is not authorized by AEGIS policy.",
          code: "AEGIS_MODEL_BLOCKED",
          requestId,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            "X-Rate-Limit-Remaining": String(rateLimitResult.remaining),
            "X-AEGIS-Enabled": "true",
          },
        },
      );
    }

    const aegisEvaluation = evaluateAegisChatRequest({
      sessionId: sessionId || requestId,
      userId: authContext?.userId || null,
      clientId,
      messages: messages as { role: string; content: string }[],
    });

    if (aegisEvaluation.blocked) {
      logger.warn("AEGIS blocked chat request", {
        requestId,
        code: aegisEvaluation.errorCode,
        details: aegisEvaluation.details,
      });
      return new Response(
        JSON.stringify({
          error: aegisEvaluation.message || "Request blocked by AEGIS policy.",
          code: aegisEvaluation.errorCode || "AEGIS_BLOCKED",
          details: aegisEvaluation.details,
          requestId,
          timestamp: new Date().toISOString(),
        }),
        {
          status: aegisEvaluation.statusCode,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            "X-Rate-Limit-Remaining": String(rateLimitResult.remaining),
            ...aegisEvaluation.headers,
          },
        },
      );
    }
    
    // Initialize metrics tracking
    requestContext = metrics.startRequest(
      requestId, 
      effectiveModelId, 
      authContext?.userId,
      sessionId
    );

    // Get the appropriate model based on validated request
    const model = getModel(effectiveModelId, undefined, resolvedOpenAI);
    const modelConfig = getModelConfig(effectiveModelId);

    // Log request start
    logger.info("Processing chat request", {
      requestId,
      modelId: modelConfig.modelId,
      messageCount: messages.length,
      hasCsvData: !!csvData,
      hasAnalysisConfig: !!analysisConfig,
      strategy: options?.strategy,
    });

    // Check cache for identical requests (if caching enabled)
    const cacheKey = generateCacheKey(messages, effectiveModelId, personaId);
    if (options?.enableCaching) {
      const cachedResponse = responseCache.get(cacheKey);
      if (cachedResponse) {
        logger.debug("Cache hit", { requestId, cacheKey });
        metrics.endRequest(requestId, true);
        return new Response(cachedResponse, {
          headers: { 
            "Content-Type": "application/json",
            "X-Cache-Status": "HIT",
            "X-Model-Used": modelConfig.modelId,
            "X-Request-Id": requestId,
            "X-Rate-Limit-Remaining": String(rateLimitResult.remaining),
            ...aegisEvaluation.headers,
          },
        });
      }
    }

    // Truncate conversation history if needed
    const contextBudget = Math.floor(modelConfig.contextWindow * 0.7); // Leave room for response
    const truncatedMessages = truncateConversationHistory(messages, contextBudget);

    metrics.addCheckpoint(requestId, "preprocessing-complete");

    // Build the system prompt with all context
    const systemPrompt = buildSystemPrompt(
      personaId || "hr-director",
      csvData,
      conversationContext,
      analysisConfig,
      activeView,
      pageContext,
    );
    const availableTools = getGuardedChatToolRegistry(authContext, {
      sessionId: sessionId || requestId,
      clientAddress: clientId,
      subagentId,
    });
    const toolsForModel = availableTools;
    const effectiveSystemPrompt =
      subagentId === "supabase"
        ? `${systemPrompt}\n\nSub-agent mode: Supabase secure DB tools only. Do not request LinkedIn tools or external data tools.`
        : systemPrompt;
    const aegisSystemPrompt = aegisEvaluation.directives.join("\n");
    const guardedSystemPrompt = aegisSystemPrompt
      ? `${effectiveSystemPrompt}\n\n${aegisSystemPrompt}`
      : effectiveSystemPrompt;

    const guardMessages = truncatedMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const guardTools = Object.keys(toolsForModel || {});

    const preToolGuard = await evaluateLlmGuard({
      phase: "pre_tool",
      requestId,
      modelId: modelConfig.modelId,
      systemPrompt: guardedSystemPrompt,
      tools: guardTools,
      messages: guardMessages,
      userId: authContext?.userId || null,
      clientId,
    });
    if (preToolGuard.enabled && preToolGuard.blocked) {
      logger.warn("LLM guard flagged pre_tool request", {
        requestId,
        riskScore: preToolGuard.riskScore,
        categories: preToolGuard.categories,
        enforce: preToolGuard.enforce,
        error: preToolGuard.error,
      });
      if (preToolGuard.enforce) {
        const duration = metrics.endRequest(requestId, false, "LLM_GUARD_PRE_TOOL_BLOCKED");
        return new Response(
          JSON.stringify({
            error: preToolGuard.safeResponse,
            code: "LLM_GUARD_PRE_TOOL_BLOCKED",
            details: {
              reason: preToolGuard.reason,
              riskScore: preToolGuard.riskScore,
              categories: preToolGuard.categories,
            },
            requestId,
            timestamp: new Date().toISOString(),
            processingTimeMs: duration.toFixed(2),
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": requestId,
              "X-Rate-Limit-Remaining": String(rateLimitResult.remaining),
              "X-LLM-Guard-Phase": "pre_tool",
              "X-LLM-Guard-Model": preToolGuard.guardModel,
            },
          },
        );
      }
    }

    const preResponseGuard = await evaluateLlmGuard({
      phase: "pre_response",
      requestId,
      modelId: modelConfig.modelId,
      systemPrompt: guardedSystemPrompt,
      tools: guardTools,
      messages: guardMessages,
      userId: authContext?.userId || null,
      clientId,
    });
    if (preResponseGuard.enabled && preResponseGuard.blocked) {
      logger.warn("LLM guard flagged pre_response request", {
        requestId,
        riskScore: preResponseGuard.riskScore,
        categories: preResponseGuard.categories,
        enforce: preResponseGuard.enforce,
        error: preResponseGuard.error,
      });
      if (preResponseGuard.enforce) {
        const duration = metrics.endRequest(requestId, false, "LLM_GUARD_PRE_RESPONSE_BLOCKED");
        return new Response(
          JSON.stringify({
            error: preResponseGuard.safeResponse,
            code: "LLM_GUARD_PRE_RESPONSE_BLOCKED",
            details: {
              reason: preResponseGuard.reason,
              riskScore: preResponseGuard.riskScore,
              categories: preResponseGuard.categories,
            },
            requestId,
            timestamp: new Date().toISOString(),
            processingTimeMs: duration.toFixed(2),
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "X-Request-Id": requestId,
              "X-Rate-Limit-Remaining": String(rateLimitResult.remaining),
              "X-LLM-Guard-Phase": "pre_response",
              "X-LLM-Guard-Model": preResponseGuard.guardModel,
            },
          },
        );
      }
    }

    // Log model selection for debugging
    logger.debug("Model configuration", {
      requestId,
      modelId: modelConfig.modelId,
      description: modelConfig.description,
      contextWindow: modelConfig.contextWindow,
      messageCount: truncatedMessages.length,
      originalMessageCount: messages.length,
      csvDataSize: csvData ? csvData.length : 0,
    });

    metrics.addCheckpoint(requestId, "pre-streaming");

    // Execute the streaming conversational response with circuit breaker
    const result = await openAICircuitBreaker.execute(async (): Promise<StreamResponseLike> => {
      const streamOptions = {
        model,
        system: guardedSystemPrompt,
        messages: convertToModelMessages(truncatedMessages),
        tools: toolsForModel,
        maxSteps: 25, // Increased for complex multi-tool analyses
        maxRetries: 3,
        temperature: options?.temperature ?? modelConfig.temperature,
        maxTokens: options?.maxTokens ?? modelConfig.maxTokens,
        topP: options?.topP,
        frequencyPenalty: options?.frequencyPenalty,
        presencePenalty: options?.presencePenalty,
        stopSequences: options?.stopSequences,
        seed: options?.seed,
        // Enable experimental features for enhanced capabilities
        experimental_telemetry: {
          isEnabled: process.env.NODE_ENV === "production",
          functionId: "chat-api",
          metadata: {
            requestId,
            personaId: personaId || "hr-director",
            modelId: modelConfig.modelId,
          },
        },
      } as unknown as Parameters<typeof streamText>[0]

      return streamText(streamOptions) as unknown as StreamResponseLike
    });

    const response =
      typeof result.toDataStreamResponse === "function"
        ? result.toDataStreamResponse()
        : result.toTextStreamResponse();
    
    // Calculate and record metrics
    const duration = metrics.endRequest(requestId, true);
    
    logger.info("Chat request completed successfully", {
      requestId,
      durationMs: duration.toFixed(2),
      modelId: modelConfig.modelId,
    });

    // Add comprehensive headers
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("X-Model-Used", modelConfig.modelId);
    response.headers.set("X-Processing-Time-Ms", duration.toFixed(2));
    response.headers.set("X-Cache-Status", "MISS");
    response.headers.set("X-Rate-Limit-Remaining", String(rateLimitResult.remaining));
    response.headers.set("X-LLM-Guard-Model", preToolGuard.guardModel);
    response.headers.set("X-LLM-Guard-PreTool-Risk", String(preToolGuard.riskScore));
    response.headers.set("X-LLM-Guard-PreResponse-Risk", String(preResponseGuard.riskScore));
    response.headers.set(
      "X-LLM-Guard-Enforce",
      String(preToolGuard.enforce || preResponseGuard.enforce),
    );
    Object.entries(aegisEvaluation.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    // CORS headers
    response.headers.set("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN);
    response.headers.set("Access-Control-Expose-Headers", 
      "X-Request-Id, X-Model-Used, X-Processing-Time-Ms, X-Cache-Status, X-Rate-Limit-Remaining, X-LLM-Guard-Model, X-LLM-Guard-PreTool-Risk, X-LLM-Guard-PreResponse-Risk, X-LLM-Guard-Enforce"
    );
    
    return response;
  } catch (error) {
    // Log full error details server-side for debugging
    const errorContext = {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    logger.error("Chat API error", errorContext);
    
    const duration = requestContext 
      ? metrics.endRequest(requestId, false, (error as { code?: string }).code)
      : 0;

    // Determine appropriate status code and sanitized message
    let statusCode = 500;
    let errorCode = "INTERNAL_ERROR";
    let errorMessage = "An error occurred processing your request";
    const headers: Record<string, string> = { 
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    };

    if (error instanceof ValidationError) {
      statusCode = error.statusCode;
      errorCode = error.code;
      errorMessage = error.message;
    } else if (error instanceof RateLimitError) {
      statusCode = error.statusCode;
      errorCode = error.code;
      errorMessage = error.message;
      headers["Retry-After"] = String(error.retryAfter);
    } else if (error instanceof CircuitBreakerError) {
      statusCode = error.statusCode;
      errorCode = error.code;
      errorMessage = "Service temporarily unavailable. Please try again later.";
      headers["Retry-After"] = "30";
    } else if (error instanceof ModelError) {
      statusCode = error.statusCode;
      errorCode = error.code;
      errorMessage = error.message;
    } else if (error instanceof SyntaxError) {
      statusCode = 400;
      errorCode = "SYNTAX_ERROR";
      errorMessage = "Invalid request format";
    }

    // Return sanitized error to client - never expose stack traces or internal details
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        code: errorCode,
        requestId,
        timestamp: new Date().toISOString(),
        processingTimeMs: duration.toFixed(2),
      }), 
      {
        status: statusCode,
        headers,
      }
    );
  }
}

/**
 * GET /api/chat
 * 
 * Health check and metrics endpoint
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const subagentId = resolveMcpSubagentIdFromRequest(req);
  const subagentProfile = getMcpSubagentProfile(subagentId);
  const action = url.searchParams.get("action");

  // Health check
  if (action === "health") {
    const circuitState = openAICircuitBreaker.getState();
    const cacheStats = responseCache.getStats();
    const missingApiKey = !HAS_OPENAI_API_KEY;
    const guardConfig = resolveLlmGuardConfig();
    const patternMeta = getSecurityPatternRegistryMeta();
    const refreshIntervalSecondsRaw = Number.parseInt(
      process.env.SECURITY_PATTERNS_INTERVAL_SECONDS || "604800",
      10,
    );
    const refreshIntervalSeconds =
      Number.isFinite(refreshIntervalSecondsRaw) && refreshIntervalSecondsRaw > 0
        ? refreshIntervalSecondsRaw
        : 604800;
    const degraded = circuitState === "open" || missingApiKey;
    
    return new Response(
      JSON.stringify({
        status: degraded ? "degraded" : "healthy",
        timestamp: new Date().toISOString(),
        circuitBreaker: circuitState,
        config: {
          openaiApiKeyConfigured: HAS_OPENAI_API_KEY,
        },
        llmGuard: {
          enabled: guardConfig.enabled,
          enforce: guardConfig.enforce,
          failClosed: guardConfig.failClosed,
          model: guardConfig.guardModel,
          timeoutMs: guardConfig.timeoutMs,
          maxContextChars: guardConfig.maxChars,
          configured: Boolean(guardConfig.apiKey),
        },
        strictMode: {
          mcpCriticalWorkflowVerifyMode:
            (process.env.MCP_CRITICAL_WORKFLOW_VERIFY_MODE || "warn").trim().toLowerCase(),
          mcpCriticalWorkflowVerifyWindowSeconds:
            Number.parseInt(process.env.MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS || "120", 10) || 120,
          mcpEnforceDataEgressDlp: process.env.MCP_ENFORCE_DATA_EGRESS_DLP === "true",
          mcpEnforceDataEgressToolAllowlist:
            process.env.MCP_ENFORCE_DATA_EGRESS_TOOL_ALLOWLIST === "true",
          mcpEgressShapeApprovalEnabled:
            process.env.MCP_EGRESS_SHAPE_APPROVAL_ENABLED !== "false",
          mcpEgressApprovalPayloadBytesThreshold:
            Number.parseInt(process.env.MCP_EGRESS_APPROVAL_PAYLOAD_BYTES_THRESHOLD || "65536", 10) || 65536,
          mcpEgressApprovalAttachmentCountThreshold:
            Number.parseInt(process.env.MCP_EGRESS_APPROVAL_ATTACHMENT_COUNT_THRESHOLD || "3", 10) || 3,
          mcpEgressApprovalThreadMessageCountThreshold:
            Number.parseInt(process.env.MCP_EGRESS_APPROVAL_THREAD_MESSAGE_COUNT_THRESHOLD || "10", 10) || 10,
          mcpDataEgressToolAllowlistConfigured: Boolean(
            process.env.MCP_DATA_EGRESS_TOOL_ALLOWLIST?.trim(),
          ),
          mcpDataEgressToolRateLimitPerMinute:
            Number.parseInt(process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMIT_PER_MINUTE || "20", 10) || 20,
          mcpDataEgressToolRateLimitWindowMs:
            Number.parseInt(process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMIT_WINDOW_MS || "60000", 10) || 60000,
          mcpDataEgressToolRateLimitOverridesConfigured: Boolean(
            process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMITS?.trim(),
          ),
          egressAllowlistTools: Array.from(getMcpDataEgressToolAllowlist()).sort(),
          egressToolRateLimits: Object.fromEntries(getMcpDataEgressToolRateLimitOverrides()),
          sentinelAlertWebhookEnabled:
            process.env.SENTINEL_ALERT_WEBHOOK_ENABLED === "true",
          sentinelAlertWebhookConfigured: Boolean(
            process.env.SENTINEL_ALERT_WEBHOOK_URL?.trim(),
          ),
          sentinelAlertWebhookCooldownSeconds:
            Number.parseInt(process.env.SENTINEL_ALERT_WEBHOOK_COOLDOWN_SECONDS || "900", 10) || 900,
          supabaseBlockPoisonedDocuments:
            process.env.SUPABASE_LLM_BLOCK_POISONED_DOCUMENTS === "true",
          supabaseFilterUntrustedQueryResults:
            process.env.SUPABASE_LLM_FILTER_UNTRUSTED_QUERY_RESULTS === "true",
          supabaseRequireTrustedSourceForUpsert:
            process.env.SUPABASE_LLM_REQUIRE_TRUSTED_SOURCE_FOR_UPSERT === "true",
          supabaseRedactSensitiveQueryFields:
            process.env.SUPABASE_LLM_REDACT_SENSITIVE_QUERY_FIELDS === "true",
          supabaseTrustedSourcesConfigured: Boolean(
            process.env.SUPABASE_LLM_TRUSTED_SOURCES?.trim(),
          ),
        },
        securityPatterns: {
          ...patternMeta,
          refresh: {
            script: "node scripts/update-security-patterns-from-openai.js",
            intervalSeconds: refreshIntervalSeconds,
            source:
              process.env.SECURITY_PATTERNS_REFRESH_SOURCE?.trim() ||
              "docker-security-cron-or-ci",
          },
        },
        cacheHitRate: (cacheStats.hitRate * 100).toFixed(2) + "%",
        requestsPerMinute: metrics.getRequestsPerMinute(),
      }),
      {
        status: degraded ? 503 : 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Metrics (API-key protected by default in all environments)
  if (action === "metrics") {
    if (REQUIRE_CHAT_METRICS_AUTH) {
      const configuredMetricsApiKey = process.env.METRICS_API_KEY?.trim();
      if (!configuredMetricsApiKey) {
        return new Response(
          JSON.stringify({
            error: "Metrics endpoint is not configured. Set METRICS_API_KEY or CHAT_METRICS_REQUIRE_AUTH=false.",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }

      const authHeader = req.headers.get("authorization");
      const bearerToken = authHeader?.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;
      if (!safeSecretEquals(configuredMetricsApiKey, bearerToken)) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const aggregateMetrics = metrics.getAggregateMetrics();
    const cacheStats = responseCache.getStats();
    const circuitStats = openAICircuitBreaker.getStats();

    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requests: {
          total: aggregateMetrics.totalRequests,
          successful: aggregateMetrics.successfulRequests,
          failed: aggregateMetrics.failedRequests,
          successRate: aggregateMetrics.totalRequests > 0 
            ? ((aggregateMetrics.successfulRequests / aggregateMetrics.totalRequests) * 100).toFixed(2) + "%"
            : "N/A",
          perMinute: metrics.getRequestsPerMinute(),
        },
        performance: {
          averageLatencyMs: aggregateMetrics.averageLatency.toFixed(2),
        },
        tokens: {
          totalUsed: aggregateMetrics.totalTokensUsed,
          estimatedCost: `$${aggregateMetrics.totalCost.toFixed(4)}`,
        },
        models: Object.fromEntries(aggregateMetrics.modelUsage),
        errors: Object.fromEntries(aggregateMetrics.errorsByType),
        cache: cacheStats,
        circuitBreaker: circuitStats,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Available models
  if (action === "models") {
    return new Response(
      JSON.stringify({
        models: Object.entries(MODEL_CONFIGS).map(([id, config]) => ({
          id,
          description: config.description,
          capabilities: config.capabilities,
          contextWindow: config.contextWindow,
          maxTokens: config.maxTokens,
          recommendedFor: config.recommendedFor,
          latencyProfile: config.latencyProfile,
        })),
        strategies: Object.entries(MODEL_STRATEGIES).map(([name, modelId]) => ({
          name,
          modelId,
          description: MODEL_CONFIGS[modelId]?.description,
        })),
        defaultModel: DEFAULT_MODEL,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Default response
  return new Response(
    JSON.stringify({
      service: "LinkedIn Intelligence Chat API",
      version: "2.0.0",
      endpoint: subagentId ? `/api/chat?subagent=${subagentId}` : "/api/chat",
      subagent: subagentProfile
        ? {
            id: subagentProfile.id,
            name: subagentProfile.name,
            description: subagentProfile.description,
            allowedTools: subagentProfile.allowedTools,
          }
        : null,
      endpoints: {
        "POST /api/chat": "Send chat messages",
        "POST /api/chat/subagents/supabase": "Send chat messages with Supabase-only tool scope",
        "GET /api/chat?action=health": "Health check",
        "GET /api/chat?action=metrics": "Performance metrics (auth required)",
        "GET /api/chat?action=models": "Available models and strategies",
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
      "Access-Control-Expose-Headers": "X-Request-Id, X-Model-Used, X-Processing-Time-Ms, X-Cache-Status, X-Rate-Limit-Remaining, X-LLM-Guard-Model, X-LLM-Guard-PreTool-Risk, X-LLM-Guard-PreResponse-Risk, X-LLM-Guard-Enforce",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// =============================================================================
// RECOMMENDED FILE NAME
// =============================================================================
// This file should be named: app/api/chat/route.ts
//
// This is a Next.js App Router API route handler for a LinkedIn Intelligence
// Chat API. The file exports GET, POST, and OPTIONS handlers which is the
// standard pattern for Next.js 13+ API routes.
//
// Full path: app/api/chat/route.ts
// =============================================================================
