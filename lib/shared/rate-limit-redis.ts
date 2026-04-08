import "server-only"

import { createRequire } from "node:module"
import type { RateLimitResult } from "@/lib/shared/request-rate-limit"

const RATE_LIMIT_KEY_PREFIX = "rl:"
const WINDOW_BUFFER_MS = 60_000 // 1 min buffer so key expires after window

function normalizeWindowMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 60_000
  }
  return Math.min(Math.floor(value), 3_600_000)
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 60
  }
  return Math.min(Math.floor(value), 10_000)
}

export type RedisRateLimitOptions = {
  key: string
  max: number
  windowMs: number
  now?: number
}

type RedisLikeClient = {
  incr: (key: string) => Promise<number>
  pexpire: (key: string, ttlMs: number) => Promise<number>
  get?: (key: string) => Promise<string | null>
  set?: (key: string, value: string, ...args: unknown[]) => Promise<unknown>
  del?: (...keys: string[]) => Promise<number>
}

type RedisCtor = new (
  url: string,
  options: {
    maxRetriesPerRequest: number
    enableReadyCheck: boolean
    lazyConnect: boolean
  },
) => RedisLikeClient

let redisClient: RedisLikeClient | null = null
let redisClientError: Error | null = null
const nodeRequire = createRequire(import.meta.url)

function loadRedisCtor(): RedisCtor {
  const moduleName = ["io", "redis"].join("")
  const loaded = nodeRequire(moduleName) as unknown

  if (typeof loaded === "function") {
    return loaded as RedisCtor
  }

  const maybeDefault = (loaded as { default?: unknown })?.default
  if (typeof maybeDefault === "function") {
    return maybeDefault as RedisCtor
  }

  throw new Error("ioredis did not export a Redis constructor")
}

function getRedisClient(): RedisLikeClient | null {
  if (redisClientError) {
    return null
  }
  if (redisClient) {
    return redisClient
  }
  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    return null
  }
  try {
    const Redis = loadRedisCtor()
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    })
    return redisClient
  } catch (err) {
    redisClientError = err instanceof Error ? err : new Error(String(err))
    return null
  }
}

export function isRedisRateLimitAvailable(): boolean {
  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    return false
  }
  return getRedisClient() !== null
}

/** String GET for marketplace cache tools (ioredis supports get/set/del). */
export async function redisStringGet(key: string): Promise<string | null> {
  const client = getRedisClient()
  if (!client || typeof client.get !== "function") return null
  return client.get(key)
}

export async function redisStringSet(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const client = getRedisClient()
  if (!client || typeof client.set !== "function") return false
  const raw = client as RedisLikeClient & { set: (...a: unknown[]) => Promise<unknown> }
  if (ttlSeconds != null && ttlSeconds > 0) {
    await raw.set(key, value, "EX", ttlSeconds)
  } else {
    await raw.set(key, value)
  }
  return true
}

export async function redisDel(...keys: string[]): Promise<number> {
  const client = getRedisClient()
  if (!client || typeof client.del !== "function" || keys.length === 0) return 0
  return client.del(...keys)
}

/**
 * Check rate limit using Redis. Uses fixed-window counters.
 * Key format: rl:{key}:{windowStartMs}. If Redis is unavailable, returns allowed: true
 * so the in-memory fallback can be used by the caller (checkRateLimit handles that).
 */
export async function checkRedisRateLimit(
  options: RedisRateLimitOptions,
): Promise<RateLimitResult> {
  const client = getRedisClient()
  if (!client) {
    // Caller should use in-memory; return a permissive result so we don't double-count
    const now = options.now ?? Date.now()
    const windowMs = normalizeWindowMs(options.windowMs)
    const max = normalizeLimit(options.max)
    return {
      allowed: true,
      remaining: max - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      limit: max,
      resetAt: now + windowMs,
    }
  }

  const now = options.now ?? Date.now()
  const max = normalizeLimit(options.max)
  const windowMs = normalizeWindowMs(options.windowMs)
  const windowStart = Math.floor(now / windowMs) * windowMs
  const redisKey = `${RATE_LIMIT_KEY_PREFIX}${options.key}:${windowStart}`
  const resetAt = windowStart + windowMs

  try {
    const count = await client.incr(redisKey)
    if (count === 1) {
      await client.pexpire(redisKey, windowMs + WINDOW_BUFFER_MS)
    }
    const allowed = count <= max
    const remaining = Math.max(max - count, 0)
    const retryAfterSeconds = Math.max(Math.ceil((resetAt - now) / 1000), 1)
    return {
      allowed,
      remaining,
      retryAfterSeconds,
      limit: max,
      resetAt,
    }
  } catch (err) {
    console.warn("[rate-limit-redis] Redis error, treating as allowed:", err)
    return {
      allowed: true,
      remaining: max - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      limit: max,
      resetAt,
    }
  }
}
