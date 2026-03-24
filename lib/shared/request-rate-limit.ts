import { isIP } from "node:net"
import "server-only"

// ============================================================================
// Types
// ============================================================================

type RateLimitBucket = {
  count: number
  resetAt: number
}

export type RateLimitResult = {
  /** Whether the request is allowed under the rate limit */
  allowed: boolean
  /** Number of requests remaining in the current window */
  remaining: number
  /** Seconds until the rate limit resets */
  retryAfterSeconds: number
  /** Maximum requests allowed in the window */
  limit: number
  /** Unix timestamp (ms) when the window resets */
  resetAt: number
}

export type CheckRateLimitOptions = {
  /** Unique key identifying the rate limit bucket (e.g., IP address, user ID) */
  key: string
  /** Maximum number of requests allowed in the window */
  max: number
  /** Window duration in milliseconds */
  windowMs: number
  /** Optional timestamp override for testing */
  now?: number
}

export type RateLimitConfig = {
  /** Maximum number of requests allowed in the window */
  max: number
  /** Window duration in milliseconds */
  windowMs: number
}

/** Result type for rate limit check - either allowed or error response */
export type RateLimitCheckResult =
  | { allowed: true; result: RateLimitResult; response: null }
  | { allowed: false; result: RateLimitResult; response: Response }

/** Options for configuring rate limit enforcement behavior */
export type EnforceRateLimitOptions = CheckRateLimitOptions & {
  /** Custom error message for rate limit response */
  message?: string
  /** Additional headers to include in the rate limit response */
  headers?: HeadersInit
  /** Whether to include rate limit headers in successful responses */
  includeHeadersOnSuccess?: boolean
}

/** Predefined rate limit configurations for common use cases */
export type RateLimitPreset = "strict" | "standard" | "relaxed" | "api" | "auth"

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of buckets to store in memory before cleanup */
const MAX_BUCKETS = 20_000

/** Default window duration: 1 minute */
const DEFAULT_WINDOW_MS = 60_000

/** Maximum window duration: 1 hour */
const MAX_WINDOW_MS = 3_600_000

/** Minimum window duration: 1 second */
const MIN_WINDOW_MS = 1_000

/** Default request limit per window */
const DEFAULT_LIMIT = 60

/** Maximum request limit per window */
const MAX_LIMIT = 10_000

/** Minimum request limit per window */
const MIN_LIMIT = 1

/** Headers sent with rate-limited responses */
const RATE_LIMIT_HEADERS = {
  LIMIT: "X-RateLimit-Limit",
  REMAINING: "X-RateLimit-Remaining",
  RESET: "X-RateLimit-Reset",
  RETRY_AFTER: "Retry-After",
  POLICY: "X-RateLimit-Policy",
} as const

/** Predefined rate limit configurations */
const RATE_LIMIT_PRESETS: Record<RateLimitPreset, RateLimitConfig> = {
  /** Strict: 10 requests per 10 seconds - for sensitive operations */
  strict: { max: 10, windowMs: 10_000 },
  /** Standard: 60 requests per minute - general API usage */
  standard: { max: 60, windowMs: 60_000 },
  /** Relaxed: 200 requests per minute - high-volume endpoints */
  relaxed: { max: 200, windowMs: 60_000 },
  /** API: 1000 requests per minute - authenticated API access */
  api: { max: 1000, windowMs: 60_000 },
  /** Auth: 5 requests per 15 seconds - login/auth attempts */
  auth: { max: 5, windowMs: 15_000 },
} as const

// ============================================================================
// In-Memory Storage
// ============================================================================

const buckets = new Map<string, RateLimitBucket>()

/** Tracks the last cleanup time to avoid excessive cleanup operations */
let lastCleanupTime = 0

/** Minimum interval between cleanup operations (in milliseconds) */
const CLEANUP_INTERVAL_MS = 10_000

/**
 * Cleans up expired buckets and enforces memory limits.
 * Called automatically during rate limit checks with throttling to prevent excessive cleanup.
 *
 * @param now - Current timestamp in milliseconds
 * @param force - Force cleanup regardless of throttle interval
 */
function cleanupBuckets(now: number, force = false): void {
  // Throttle cleanup operations unless forced
  if (!force && now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
    return
  }
  lastCleanupTime = now

  // Remove expired buckets
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }

  // Guard against unbounded memory growth by removing oldest entries
  if (buckets.size > MAX_BUCKETS) {
    let deleted = 0
    const targetSize = Math.floor(MAX_BUCKETS / 2)
    const maxDeletions = Math.floor(MAX_BUCKETS / 2)
    
    for (const key of buckets.keys()) {
      buckets.delete(key)
      deleted += 1
      if (buckets.size <= targetSize || deleted >= maxDeletions) {
        break
      }
    }
  }
}

/**
 * Clears all rate limit buckets from memory.
 * Useful for testing or manual reset scenarios.
 */
export function clearRateLimitBuckets(): void {
  buckets.clear()
  lastCleanupTime = 0
}

/**
 * Gets the current number of rate limit buckets in memory.
 * Useful for monitoring memory usage.
 */
export function getRateLimitBucketCount(): number {
  return buckets.size
}

/**
 * Gets statistics about rate limit bucket usage.
 * Useful for monitoring and debugging.
 *
 * @returns Object containing bucket statistics
 */
export function getRateLimitStats(): {
  bucketCount: number
  maxBuckets: number
  utilizationPercent: number
  lastCleanupTime: number
} {
  return {
    bucketCount: buckets.size,
    maxBuckets: MAX_BUCKETS,
    utilizationPercent: Math.round((buckets.size / MAX_BUCKETS) * 100),
    lastCleanupTime,
  }
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalizes a window duration to a safe value within bounds.
 *
 * @param value - Window duration in milliseconds
 * @returns Normalized window duration (min: 1s, default: 60s, max: 1h)
 */
function normalizeWindowMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_WINDOW_MS
  }
  return Math.max(MIN_WINDOW_MS, Math.min(Math.floor(value), MAX_WINDOW_MS))
}

/**
 * Normalizes a request limit to a safe value within bounds.
 *
 * @param value - Maximum number of requests
 * @returns Normalized limit (min: 1, default: 60, max: 10,000)
 */
function normalizeLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_LIMIT
  }
  return Math.max(MIN_LIMIT, Math.min(Math.floor(value), MAX_LIMIT))
}

/**
 * Normalizes an IP address header value by stripping ports and validating format.
 *
 * @param value - Raw header value
 * @returns Validated IP address or null if invalid
 */
function normalizeIpHeaderValue(value: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim().replace(/^["']+|["']+$/g, "")
  if (!trimmed || trimmed.length > 128) {
    return null
  }

  let candidate = trimmed

  // Handle [IPv6]:port format
  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]")
    if (closingBracket > 1) {
      candidate = candidate.slice(1, closingBracket)
    }
  } else {
    // Handle IPv4:port format
    const portMatch = /^(.+):(\d{1,5})$/.exec(candidate)
    if (portMatch && portMatch[1]?.includes(".")) {
      candidate = portMatch[1]
    }
  }

  // Strip IPv6 zone index (e.g., fe80::1%eth0)
  candidate = candidate.split("%")[0] ?? candidate
  return isIP(candidate) ? candidate : null
}

/**
 * Normalizes a rate limit key to ensure consistent formatting.
 *
 * @param key - Raw rate limit key
 * @returns Normalized key with consistent formatting
 */
function normalizeKey(key: string): string {
  if (!key || typeof key !== "string") {
    return "unknown"
  }
  // Truncate overly long keys to prevent memory issues
  const trimmed = key.trim().slice(0, 256)
  return trimmed || "unknown"
}

// ============================================================================
// Client Address Extraction
// ============================================================================

/**
 * Extracts the client IP address from a request.
 * Checks headers in order of trustworthiness:
 * 1. CF-Connecting-IP (Cloudflare)
 * 2. X-Real-IP (nginx, other proxies)
 * 3. X-Forwarded-For (standard proxy header, first entry)
 *
 * @param req - The incoming request
 * @returns Client IP address or "unknown" if not determinable
 *
 * @example
 * const clientIp = getClientAddressFromRequest(req)
 * const rateLimitKey = `api:${clientIp}`
 */
export function getClientAddressFromRequest(req: Request): string {
  // Cloudflare's trusted client IP header
  const cfIp = normalizeIpHeaderValue(req.headers.get("cf-connecting-ip"))
  if (cfIp) {
    return cfIp
  }

  // Common proxy header for real client IP
  const realIp = normalizeIpHeaderValue(req.headers.get("x-real-ip"))
  if (realIp) {
    return realIp
  }

  // Standard forwarding header (first entry is original client)
  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]
    const parsed = normalizeIpHeaderValue(first ?? null)
    if (parsed) {
      return parsed
    }
  }

  return "unknown"
}

/**
 * Creates a composite rate limit key from multiple identifiers.
 * Useful for creating hierarchical rate limits (e.g., per-user + per-IP).
 *
 * @param parts - Key parts to combine
 * @returns Composite key string
 *
 * @example
 * const key = createRateLimitKey("api", userId, clientIp)
 * // => "api:user123:192.168.1.1"
 */
export function createRateLimitKey(...parts: (string | number)[]): string {
  return parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(":")
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Gets a predefined rate limit configuration.
 *
 * @param preset - Preset name
 * @returns Rate limit configuration
 *
 * @example
 * const config = getRateLimitPreset("auth")
 * // => { max: 5, windowMs: 15000 }
 */
export function getRateLimitPreset(preset: RateLimitPreset): RateLimitConfig {
  return { ...RATE_LIMIT_PRESETS[preset] }
}

/**
 * Parses rate limit configuration from environment variables with fallback defaults.
 *
 * @param maxEnv - Environment variable name for max requests
 * @param windowEnv - Environment variable name for window duration
 * @param defaults - Default values if env vars are not set
 * @returns Normalized rate limit configuration
 *
 * @example
 * const config = parseRateLimitConfigFromEnv(
 *   "API_RATE_LIMIT_MAX",
 *   "API_RATE_LIMIT_WINDOW_MS",
 *   { max: 100, windowMs: 60000 }
 * )
 */
export function parseRateLimitConfigFromEnv(
  maxEnv: string,
  windowEnv: string,
  defaults: RateLimitConfig,
): RateLimitConfig {
  const max = Number(process.env[maxEnv] || defaults.max)
  const windowMs = Number(process.env[windowEnv] || defaults.windowMs)
  return {
    max: normalizeLimit(max),
    windowMs: normalizeWindowMs(windowMs),
  }
}

/**
 * Creates a rate limit configuration from a preset with optional overrides.
 *
 * @param preset - Base preset name
 * @param overrides - Optional overrides for specific values
 * @returns Merged rate limit configuration
 *
 * @example
 * const config = createRateLimitConfig("standard", { max: 100 })
 * // => { max: 100, windowMs: 60000 }
 */
export function createRateLimitConfig(
  preset: RateLimitPreset,
  overrides?: Partial<RateLimitConfig>,
): RateLimitConfig {
  const base = getRateLimitPreset(preset)
  return {
    max: normalizeLimit(overrides?.max ?? base.max),
    windowMs: normalizeWindowMs(overrides?.windowMs ?? base.windowMs),
  }
}

// ============================================================================
// Rate Limiting Functions
// ============================================================================

/**
 * Checks rate limit using Redis when available, otherwise falls back to in-memory.
 * Use this in API routes so production can scale with a shared Redis backend.
 *
 * @param options - Rate limit check options
 * @returns Promise resolving to rate limit result
 *
 * @example
 * const result = await checkRateLimit({
 *   key: `api:${clientIp}`,
 *   max: 100,
 *   windowMs: 60000,
 * })
 *
 * if (!result.allowed) {
 *   return new Response("Rate limit exceeded", {
 *     status: 429,
 *     headers: createRateLimitHeaders(result),
 *   })
 * }
 */
export async function checkRateLimit(
  options: CheckRateLimitOptions,
): Promise<RateLimitResult> {
  const { isRedisRateLimitAvailable } = await import("@/lib/shared/rate-limit-redis")
  if (isRedisRateLimitAvailable()) {
    const { checkRedisRateLimit } = await import("@/lib/shared/rate-limit-redis")
    return checkRedisRateLimit(options)
  }
  return Promise.resolve(checkInMemoryRateLimit(options))
}

/**
 * Checks rate limit using in-memory storage.
 * Suitable for single-instance deployments or development.
 *
 * @param options - Rate limit check options
 * @returns Rate limit result
 *
 * @example
 * const result = checkInMemoryRateLimit({
 *   key: `api:${clientIp}`,
 *   max: 100,
 *   windowMs: 60000,
 * })
 */
export function checkInMemoryRateLimit(options: CheckRateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now()
  const max = normalizeLimit(options.max)
  const windowMs = normalizeWindowMs(options.windowMs)
  const key = normalizeKey(options.key)

  cleanupBuckets(now)

  const existing = buckets.get(key)
  
  // Create new bucket if none exists or current one has expired
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      remaining: Math.max(max - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      limit: max,
      resetAt,
    }
  }

  // Increment existing bucket
  existing.count += 1
  const allowed = existing.count <= max
  
  return {
    allowed,
    remaining: Math.max(max - existing.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    limit: max,
    resetAt: existing.resetAt,
  }
}

/**
 * Checks rate limit for multiple keys simultaneously.
 * Returns the most restrictive result (lowest remaining, earliest reset).
 *
 * @param keys - Array of rate limit keys to check
 * @param config - Rate limit configuration to apply to all keys
 * @returns Promise resolving to the most restrictive rate limit result
 *
 * @example
 * // Check both IP-based and user-based limits
 * const result = await checkMultipleRateLimits(
 *   [`ip:${clientIp}`, `user:${userId}`],
 *   { max: 100, windowMs: 60000 }
 * )
 */
export async function checkMultipleRateLimits(
  keys: string[],
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const results = await Promise.all(
    keys.map((key) =>
      checkRateLimit({
        key,
        max: config.max,
        windowMs: config.windowMs,
      })
    )
  )

  // Return the most restrictive result
  return results.reduce((mostRestrictive, current) => {
    // If any result is not allowed, the combined result is not allowed
    if (!current.allowed) {
      if (mostRestrictive.allowed || current.remaining < mostRestrictive.remaining) {
        return current
      }
    }
    // Return the one with fewer remaining requests
    if (current.remaining < mostRestrictive.remaining) {
      return current
    }
    return mostRestrictive
  })
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Creates standard rate limit headers for inclusion in HTTP responses.
 *
 * @param result - Rate limit check result
 * @param options - Optional configuration
 * @returns Headers object suitable for Response constructor
 *
 * @example
 * return new Response(body, {
 *   headers: {
 *     ...createRateLimitHeaders(result),
 *     "Content-Type": "application/json",
 *   },
 * })
 */
export function createRateLimitHeaders(
  result: RateLimitResult,
  options: { includePolicy?: boolean; policyName?: string } = {},
): HeadersInit {
  const headers: Record<string, string> = {
    [RATE_LIMIT_HEADERS.LIMIT]: String(result.limit),
    [RATE_LIMIT_HEADERS.REMAINING]: String(result.remaining),
    [RATE_LIMIT_HEADERS.RESET]: String(Math.ceil(result.resetAt / 1000)),
  }

  if (options.includePolicy && options.policyName) {
    headers[RATE_LIMIT_HEADERS.POLICY] = options.policyName
  }

  return headers
}

/**
 * Creates a complete 429 Too Many Requests response with proper headers.
 *
 * @param result - Rate limit check result
 * @param options - Optional response customization
 * @returns Response object ready to return from API route
 *
 * @example
 * if (!result.allowed) {
 *   return createRateLimitResponse(result)
 * }
 *
 * @example
 * // With custom message
 * if (!result.allowed) {
 *   return createRateLimitResponse(result, {
 *     message: "Too many requests. Please slow down.",
 *   })
 * }
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  options: {
    /** Custom error message */
    message?: string
    /** Additional headers to include */
    headers?: HeadersInit
    /** Custom error code */
    errorCode?: string
    /** Include documentation link */
    docsUrl?: string
  } = {},
): Response {
  const {
    message = "Rate limit exceeded. Please try again later.",
    headers: extraHeaders = {},
    errorCode = "rate_limit_exceeded",
    docsUrl,
  } = options

  const body: Record<string, unknown> = {
    error: errorCode,
    message,
    retryAfterSeconds: result.retryAfterSeconds,
    limit: result.limit,
    remaining: result.remaining,
  }

  if (docsUrl) {
    body.docsUrl = docsUrl
  }

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      [RATE_LIMIT_HEADERS.RETRY_AFTER]: String(result.retryAfterSeconds),
      ...createRateLimitHeaders(result),
      ...extraHeaders,
    },
  })
}

/**
 * Checks rate limit and returns a response if limit exceeded.
 * Convenience function combining check and response creation.
 *
 * @param options - Rate limit check options
 * @returns Promise resolving to null if allowed, Response if rate limited
 *
 * @example
 * const rateLimitResponse = await enforceRateLimit({
 *   key: `api:${clientIp}`,
 *   max: 100,
 *   windowMs: 60000,
 * })
 * if (rateLimitResponse) return rateLimitResponse
 * // Continue with request handling...
 */
export async function enforceRateLimit(
  options: EnforceRateLimitOptions,
): Promise<Response | null> {
  const { message, headers: extraHeaders, ...checkOptions } = options
  const result = await checkRateLimit(checkOptions)
  
  if (!result.allowed) {
    return createRateLimitResponse(result, { message, headers: extraHeaders })
  }
  
  return null
}

/**
 * Checks rate limit and returns a structured result with response.
 * Useful when you need both the rate limit result and a potential response.
 *
 * @param options - Rate limit check options
 * @returns Promise resolving to result object with response if rate limited
 *
 * @example
 * const check = await checkAndRespond({
 *   key: `api:${clientIp}`,
 *   max: 100,
 *   windowMs: 60000,
 * })
 * if (!check.allowed) return check.response
 * // Use check.result.remaining for logging, etc.
 */
export async function checkAndRespond(
  options: EnforceRateLimitOptions,
): Promise<RateLimitCheckResult> {
  const { message, headers: extraHeaders, ...checkOptions } = options
  const result = await checkRateLimit(checkOptions)
  
  if (!result.allowed) {
    return {
      allowed: false,
      result,
      response: createRateLimitResponse(result, { message, headers: extraHeaders }),
    }
  }
  
  return { allowed: true, result, response: null }
}

/**
 * Creates a rate limiter function with preconfigured settings.
 * Useful for creating reusable rate limiters for specific endpoints.
 *
 * @param config - Rate limit configuration
 * @param keyPrefix - Optional prefix for rate limit keys
 * @returns Rate limiter function
 *
 * @example
 * const apiRateLimiter = createRateLimiter({ max: 100, windowMs: 60000 }, "api")
 *
 * export async function GET(req: Request) {
 *   const clientIp = getClientAddressFromRequest(req)
 *   const response = await apiRateLimiter(clientIp)
 *   if (response) return response
 *   // Continue...
 * }
 */
export function createRateLimiter(
  config: RateLimitConfig,
  keyPrefix?: string,
): (identifier: string, options?: { message?: string }) => Promise<Response | null> {
  const normalizedConfig = {
    max: normalizeLimit(config.max),
    windowMs: normalizeWindowMs(config.windowMs),
  }

  return async (identifier: string, options?: { message?: string }) => {
    const key = keyPrefix ? `${keyPrefix}:${identifier}` : identifier
    return enforceRateLimit({
      key,
      ...normalizedConfig,
      message: options?.message,
    })
  }
}