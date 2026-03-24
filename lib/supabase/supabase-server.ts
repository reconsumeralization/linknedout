import "server-only";

import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

// Singleton service role client
let serverClient: SupabaseClient | null = null

// Cache for user-scoped clients keyed by access token
const userScopedClients = new Map<string, { client: SupabaseClient; createdAt: number }>()

// Cache TTL for user-scoped clients (5 minutes)
const USER_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000

// Clean up expired clients periodically (every minute)
const CLEANUP_INTERVAL_MS = 60 * 1000
let cleanupIntervalId: NodeJS.Timeout | null = null

// Track initialization state for debugging
let initializationTime: number | null = null

/**
 * Server-side client options (no persistence, optimized for server)
 */
const serverClientOptions: SupabaseClientOptions<"public"> = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      "x-client-info": "linkedout-app-server",
    },
  },
  db: {
    schema: "public",
  },
}

/**
 * Check if Supabase server environment variables are configured
 */
export function hasSupabaseServerEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Check if Supabase URL is configured (either public or server-specific)
 */
export function hasSupabaseUrl(): boolean {
  return Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
}

/**
 * Check if anon key is available for user-scoped clients
 */
export function hasSupabaseAnonKey(): boolean {
  return Boolean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Get Supabase server configuration info (safe for logging, no secrets)
 */
export function getSupabaseServerConfig(): {
  hasServerEnv: boolean
  hasUrl: boolean
  hasAnonKey: boolean
  url: string | null
  isConfigured: boolean
  cachedClientsCount: number
  initializationTime: number | null
} {
  return {
    hasServerEnv: hasSupabaseServerEnv(),
    hasUrl: hasSupabaseUrl(),
    hasAnonKey: hasSupabaseAnonKey(),
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    isConfigured: hasSupabaseServerEnv(),
    cachedClientsCount: userScopedClients.size,
    initializationTime,
  }
}

/**
 * Validate the service role client is working
 * Performs a lightweight health check
 */
export async function validateSupabaseServerClient(): Promise<{
  ok: boolean
  error?: string
  latencyMs?: number
}> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { ok: false, error: "Server client not configured" }
  }

  const start = Date.now()
  try {
    // Simple auth check - doesn't hit the database
    const { error } = await client.auth.getSession()
    const latencyMs = Date.now() - start

    if (error) {
      return { ok: false, error: error.message, latencyMs }
    }

    return { ok: true, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - start
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      latencyMs,
    }
  }
}

/**
 * Get the service role Supabase client (bypasses RLS)
 * Server-side only - never expose to client
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return null
  }

  if (!serverClient) {
    serverClient = createClient(url, serviceRoleKey, serverClientOptions)
    initializationTime = Date.now()
  }

  return serverClient
}

/**
 * Start the cleanup interval for expired user-scoped clients
 */
function startCleanupInterval(): void {
  if (cleanupIntervalId) return

  cleanupIntervalId = setInterval(() => {
    const now = Date.now()
    let expiredCount = 0

    for (const [token, { createdAt }] of userScopedClients.entries()) {
      if (now - createdAt > USER_CLIENT_CACHE_TTL_MS) {
        userScopedClients.delete(token)
        expiredCount++
      }
    }

    // Log cleanup activity in development
    if (process.env.NODE_ENV === "development" && expiredCount > 0) {
      console.debug(`[Supabase] Cleaned up ${expiredCount} expired user-scoped clients`)
    }

    // Stop interval if no clients remain
    if (userScopedClients.size === 0 && cleanupIntervalId) {
      clearInterval(cleanupIntervalId)
      cleanupIntervalId = null
    }
  }, CLEANUP_INTERVAL_MS)

  // Ensure the interval doesn't prevent Node.js from exiting
  if (cleanupIntervalId.unref) {
    cleanupIntervalId.unref()
  }
}

/**
 * Create a user-scoped Supabase client with a specific access token
 * Useful for server-side operations that need to respect user's RLS policies
 * Clients are cached for performance but expire after TTL
 *
 * @param accessToken - The user's JWT access token
 * @param options - Optional configuration
 * @returns A Supabase client scoped to the user, or null if not configured
 */
export function createUserScopedClient(
  accessToken: string,
  options?: {
    skipCache?: boolean
  }
): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  // Validate access token format (basic check)
  if (!accessToken || typeof accessToken !== "string" || accessToken.length < 10) {
    console.warn("[Supabase] Invalid access token provided to createUserScopedClient")
    return null
  }

  // Check cache for existing client (unless skipCache is true)
  if (!options?.skipCache) {
    const cached = userScopedClients.get(accessToken)
    if (cached && Date.now() - cached.createdAt < USER_CLIENT_CACHE_TTL_MS) {
      return cached.client
    }
  }

  // Create new user-scoped client
  const client = createClient(url, anonKey, {
    ...serverClientOptions,
    global: {
      headers: {
        ...serverClientOptions.global?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  // Cache the client
  userScopedClients.set(accessToken, { client, createdAt: Date.now() })

  // Start cleanup interval if not already running
  startCleanupInterval()

  return client
}

/**
 * Invalidate a specific user's cached client
 * Useful when a user logs out or their session is revoked
 */
export function invalidateUserClient(accessToken: string): boolean {
  return userScopedClients.delete(accessToken)
}

/**
 * Clear all cached user-scoped clients
 * Useful for testing or when you need to force re-authentication
 */
export function clearUserScopedClients(): void {
  const count = userScopedClients.size
  userScopedClients.clear()

  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }

  if (process.env.NODE_ENV === "development" && count > 0) {
    console.debug(`[Supabase] Cleared ${count} cached user-scoped clients`)
  }
}

/**
 * Get the count of cached user-scoped clients
 * Useful for monitoring/debugging
 */
export function getUserScopedClientCount(): number {
  return userScopedClients.size
}

/**
 * Get detailed cache statistics for monitoring
 */
export function getUserScopedClientStats(): {
  count: number
  oldestClientAgeMs: number | null
  newestClientAgeMs: number | null
  cleanupIntervalActive: boolean
} {
  const now = Date.now()
  let oldest: number | null = null
  let newest: number | null = null

  for (const { createdAt } of userScopedClients.values()) {
    const age = now - createdAt
    if (oldest === null || age > oldest) oldest = age
    if (newest === null || age < newest) newest = age
  }

  return {
    count: userScopedClients.size,
    oldestClientAgeMs: oldest,
    newestClientAgeMs: newest,
    cleanupIntervalActive: cleanupIntervalId !== null,
  }
}

/**
 * Reset all server-side Supabase state
 * Primarily for testing purposes
 */
export function resetSupabaseServerState(): void {
  serverClient = null
  clearUserScopedClients()
  initializationTime = null
}