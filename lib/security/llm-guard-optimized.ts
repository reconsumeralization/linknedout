import { webcrypto } from "node:crypto"
import type { EvaluateLlmGuardInput, LlmGuardDecision, LlmGuardPhase } from "./llm-guard"
import { evaluateLlmGuard, resolveLlmGuardConfig } from "./llm-guard"

/**
 * Extended guard result that includes optimization layer information
 */
export interface OptimizedGuardResult extends LlmGuardDecision {
  /** Which layer made the decision */
  layer: "regex_prefilter" | "cache_hit" | "llm_evaluation"
  /** Latency in milliseconds */
  latencyMs: number
  /** Cache performance statistics */
  cacheStats: { hits: number; misses: number; size: number; hitRate: number }
}

/**
 * Regex pattern definition with category
 */
interface RegexPattern {
  pattern: RegExp
  category: string
  riskScoreBoost: number
}

/**
 * Cache entry for evaluated inputs
 */
interface CacheEntry {
  decision: LlmGuardDecision
  timestamp: number
  ttl: number
}

/**
 * Statistics for regex pattern matching
 */
interface RegexStats {
  patternsChecked: number
  patternsMatched: number
  patternHits: Map<string, number>
}

// ============================================================================
// LAYER 1: FAST REGEX PRE-FILTER
// ============================================================================

/**
 * Compile regex patterns at module load time for optimal performance
 */
function compileRegexPatterns(): RegexPattern[] {
  return [
    // Prompt injection patterns
    {
      pattern: /ignore\s+(?:previous|prior)\s+instructions/i,
      category: "prompt_injection",
      riskScoreBoost: 25,
    },
    {
      pattern: /(?:you\s+are|you\'re)\s+now\s+(?:a|an|in)/i,
      category: "prompt_injection",
      riskScoreBoost: 30,
    },
    {
      pattern: /system\s*prompt\s*:/i,
      category: "prompt_injection",
      riskScoreBoost: 35,
    },
    {
      pattern: /jailbreak|jail\s*break/i,
      category: "prompt_injection",
      riskScoreBoost: 40,
    },
    {
      pattern: /\bDAN\s+mode\b|DAN\s+(?:enabled|activated|mode)/i,
      category: "jailbreak_attempt",
      riskScoreBoost: 45,
    },
    {
      pattern: /developer\s+mode\s+(?:override|enabled|activated)/i,
      category: "jailbreak_attempt",
      riskScoreBoost: 40,
    },

    // Base64 encoded instructions in suspicious contexts
    {
      pattern: /(?:eval|execute|run|execute_code)\s*\(\s*['\"]?[A-Za-z0-9+/]{20,}={0,2}['\"]?\s*\)/i,
      category: "encoded_injection",
      riskScoreBoost: 35,
    },
    {
      pattern: /\b(?:atob|Buffer\.from|decode)\s*\(\s*['\"][A-Za-z0-9+/]{40,}={0,2}['\"]/i,
      category: "encoded_injection",
      riskScoreBoost: 30,
    },

    // Unicode homograph attacks (mixed scripts)
    {
      pattern: /[\u0400-\u04FF][\u0000-\u00FF]{0,20}[\u0400-\u04FF]/,
      category: "unicode_homograph",
      riskScoreBoost: 20,
    },
    {
      pattern: /[\u4E00-\u9FFF][\u0000-\u00FF]{0,20}[\u4E00-\u9FFF]/,
      category: "unicode_homograph",
      riskScoreBoost: 20,
    },

    // Data exfiltration patterns
    {
      pattern: /send\s+(?:to|via)\s+(?:email|webhook|slack|discord|http)/i,
      category: "data_exfiltration",
      riskScoreBoost: 45,
    },
    {
      pattern: /post\s+(?:to\s+)?webhook\b/i,
      category: "data_exfiltration",
      riskScoreBoost: 40,
    },
    {
      pattern: /curl\s+(?:https?|ftp):\/\//i,
      category: "data_exfiltration",
      riskScoreBoost: 35,
    },
    {
      pattern: /exfiltrate|ex[_-]?filtrate|leak\s+(?:data|information|secrets)/i,
      category: "data_exfiltration",
      riskScoreBoost: 50,
    },
    {
      pattern: /(?:retrieve|extract|download)\s+(?:all\s+)?(?:user|api\s+|database)\s+(?:data|keys|secrets|tokens|credentials)/i,
      category: "data_exfiltration",
      riskScoreBoost: 45,
    },

    // Tool abuse patterns
    {
      pattern: /(?:bypass|circumvent|disable|override)\s+(?:security|safety|restrictions|filters|guards|limitations)/i,
      category: "tool_abuse",
      riskScoreBoost: 40,
    },
    {
      pattern: /(?:call\s+)?tool[s]?\s+(?:without|bypass|despite|ignoring)\s+(?:restrictions|security|safety)/i,
      category: "tool_abuse",
      riskScoreBoost: 35,
    },
    {
      pattern: /execute\s+(?:arbitrary|malicious|dangerous)\s+(?:code|command|tool|instruction)/i,
      category: "tool_abuse",
      riskScoreBoost: 45,
    },
  ]
}

// ============================================================================
// LAYER 2: IN-MEMORY LRU CACHE
// ============================================================================

/**
 * Simple LRU cache implementation with TTL support
 */
class LruCache {
  private cache: Map<string, CacheEntry> = new Map()
  private accessOrder: string[] = []
  private maxEntries: number
  private ttlMs: number
  private stats = { hits: 0, misses: 0 }

  constructor(maxEntries: number, ttlMs: number) {
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
  }

  /**
   * Get a value from the cache if it exists and hasn't expired
   */
  get(key: string): LlmGuardDecision | null {
    const entry = this.cache.get(key)
    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      this.accessOrder = this.accessOrder.filter((k) => k !== key)
      this.stats.misses++
      return null
    }

    // Update access order (move to end)
    this.accessOrder = this.accessOrder.filter((k) => k !== key)
    this.accessOrder.push(key)

    this.stats.hits++
    return entry.decision
  }

  /**
   * Set a value in the cache
   */
  set(key: string, decision: LlmGuardDecision): void {
    // Only cache "allow" decisions
    if (decision.blocked) {
      return
    }

    // Remove from access order if it already exists
    this.accessOrder = this.accessOrder.filter((k) => k !== key)

    // Add to end of access order
    this.accessOrder.push(key)

    // Store the entry
    this.cache.set(key, {
      decision,
      timestamp: Date.now(),
      ttl: this.ttlMs,
    })

    // Evict oldest if we exceed max entries
    if (this.accessOrder.length > this.maxEntries) {
      const oldest = this.accessOrder.shift()
      if (oldest) {
        this.cache.delete(oldest)
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    this.stats = { hits: 0, misses: 0 }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? Math.round((this.stats.hits / total) * 10000) / 10000 : 0
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate,
    }
  }

  /**
   * Get current cache size
   */
  getSize(): number {
    return this.cache.size
  }
}

// ============================================================================
// MODULE STATE
// ============================================================================

const REGEX_PATTERNS = compileRegexPatterns()

const DEFAULT_CACHE_TTL_MS = parseInt(process.env.LLM_GUARD_CACHE_TTL_MS || "300000", 10) // 5 minutes
const DEFAULT_CACHE_MAX_ENTRIES = parseInt(process.env.LLM_GUARD_CACHE_MAX_ENTRIES || "1000", 10)

const cache = new LruCache(DEFAULT_CACHE_MAX_ENTRIES, DEFAULT_CACHE_TTL_MS)

const regexStats: RegexStats = {
  patternsChecked: 0,
  patternsMatched: 0,
  patternHits: new Map(),
}

// ============================================================================
// LAYER 1: REGEX PRE-FILTER IMPLEMENTATION
// ============================================================================

/**
 * Convert input to a single string for regex analysis
 */
function serializeInputForRegex(input: EvaluateLlmGuardInput): string {
  const parts: string[] = [
    input.systemPrompt,
    ...input.messages.map((m) => m.content),
    input.tools.join(" "),
  ]
  return parts.join("\n")
}

/**
 * Run regex patterns against input and return risk assessment
 */
function evaluateRegexPrefilter(input: EvaluateLlmGuardInput): {
  matched: boolean
  riskScore: number
  categories: string[]
} {
  const content = serializeInputForRegex(input)

  let maxRiskScore = 0
  const matchedCategories = new Set<string>()

  for (const { pattern, category, riskScoreBoost } of REGEX_PATTERNS) {
    regexStats.patternsChecked++

    if (pattern.test(content)) {
      regexStats.patternsMatched++
      const currentCount = regexStats.patternHits.get(category) || 0
      regexStats.patternHits.set(category, currentCount + 1)

      matchedCategories.add(category)
      maxRiskScore = Math.max(maxRiskScore, riskScoreBoost)
    }
  }

  return {
    matched: maxRiskScore > 0,
    riskScore: maxRiskScore,
    categories: Array.from(matchedCategories),
  }
}

// ============================================================================
// SHA-256 HASHING FOR CACHE KEYS
// ============================================================================

/**
 * Generate SHA-256 hash of input for cache key
 */
async function generateCacheKey(input: EvaluateLlmGuardInput): Promise<string> {
  const content = serializeInputForRegex(input)
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await webcrypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ============================================================================
// OPTIMIZED GUARD EVALUATION
// ============================================================================

/**
 * Evaluate input through the three-layer optimization system
 *
 * Layer 1: Fast regex pre-filter (< 1ms typical)
 * Layer 2: In-memory LRU cache (< 0.1ms typical)
 * Layer 3: Original LLM Guard fallback
 */
export async function evaluateOptimizedGuard(
  input: EvaluateLlmGuardInput,
): Promise<OptimizedGuardResult> {
  const startTime = Date.now()

  // LAYER 1: Fast regex pre-filter
  const regexResult = evaluateRegexPrefilter(input)

  if (regexResult.matched && regexResult.riskScore >= 25) {
    const latencyMs = Date.now() - startTime
    const cacheStats = cache.getStats()
    return {
      enabled: true,
      enforce: true,
      blocked: true,
      riskScore: Math.min(100, regexResult.riskScore + 15),
      categories: regexResult.categories,
      reason: "regex_prefilter_match",
      safeResponse:
        "I can't help with that request. I can help with secure best practices instead.",
      phase: input.phase,
      guardModel: "regex_prefilter",
      layer: "regex_prefilter",
      latencyMs,
      cacheStats,
    }
  }

  // LAYER 2: In-memory LRU cache
  const cacheKey = await generateCacheKey(input)
  const cachedDecision = cache.get(cacheKey)

  if (cachedDecision) {
    const latencyMs = Date.now() - startTime
    const cacheStats = cache.getStats()
    return {
      ...cachedDecision,
      layer: "cache_hit",
      latencyMs,
      cacheStats,
    }
  }

  // LAYER 3: Original LLM Guard fallback
  const decision = await evaluateLlmGuard(input)

  // Cache the decision (only "allow" decisions)
  cache.set(cacheKey, decision)

  const latencyMs = Date.now() - startTime
  const cacheStats = cache.getStats()

  return {
    ...decision,
    layer: "llm_evaluation",
    latencyMs,
    cacheStats,
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Get current cache statistics
 *
 * @returns Cache statistics including hits, misses, size, and hit rate
 */
export function getGuardCacheStats(): {
  hits: number
  misses: number
  size: number
  hitRate: number
} {
  return cache.getStats()
}

/**
 * Clear all cache entries
 */
export function clearGuardCache(): void {
  cache.clear()
}

// ============================================================================
// REGEX PATTERN STATISTICS
// ============================================================================

/**
 * Get regex pattern evaluation statistics
 *
 * @returns Statistics on patterns checked, matched, and top matches
 */
export function getRegexPatternStats(): {
  patternsChecked: number
  patternsMatched: number
  topPatterns: Array<{ pattern: string; count: number }>
} {
  // Sort pattern hits by count (descending) and take top 10
  const topPatterns = Array.from(regexStats.patternHits.entries())
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 10)
    .map(([pattern, count]) => ({ pattern, count }))

  return {
    patternsChecked: regexStats.patternsChecked,
    patternsMatched: regexStats.patternsMatched,
    topPatterns,
  }
}
