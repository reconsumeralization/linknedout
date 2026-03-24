import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

let client: SupabaseClient | null = null
let serverClient: SupabaseClient | null = null
const userScopedClients = new Map<string, { client: SupabaseClient; createdAt: number }>()

// Cache TTL for user-scoped clients (5 minutes)
const USER_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Check if Supabase public environment variables are configured
 */
export function hasSupabasePublicEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/**
 * Check if Supabase service role environment variables are configured (server-side only)
 */
export function hasSupabaseServiceEnv(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && 
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

/**
 * Check if any Supabase environment is configured
 */
export function hasSupabaseEnv(): boolean {
  return hasSupabasePublicEnv() || hasSupabaseServiceEnv()
}

/**
 * Get Supabase configuration info (safe for logging, no secrets)
 */
export function getSupabaseConfig(): {
  hasPublicEnv: boolean
  hasServiceEnv: boolean
  url: string | null
  isConfigured: boolean
} {
  return {
    hasPublicEnv: hasSupabasePublicEnv(),
    hasServiceEnv: hasSupabaseServiceEnv(),
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null,
    isConfigured: hasSupabaseEnv(),
  }
}

/**
 * Default client options for better reliability
 */
const defaultClientOptions: SupabaseClientOptions<"public"> = {
  auth: {
    autoRefreshToken: true,
    persistSession: typeof window !== "undefined",
    detectSessionInUrl: typeof window !== "undefined",
  },
  global: {
    headers: {
      "x-client-info": "linkedout-app",
    },
  },
}

/**
 * Server-side client options (no persistence)
 */
const serverClientOptions: SupabaseClientOptions<"public"> = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    headers: {
      "x-client-info": "linkedout-app-server",
    },
  },
}

/**
 * Get the public Supabase client (uses anon key, respects RLS)
 * Safe for client-side use
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  if (!client) {
    client = createClient(url, anonKey, defaultClientOptions)
  }

  return client
}

/**
 * Get the service role Supabase client (bypasses RLS)
 * Server-side only - never expose to client
 */
export function getSupabaseServiceClient(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    console.error("getSupabaseServiceClient should not be called on the client side")
    return null
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return null
  }

  if (!serverClient) {
    serverClient = createClient(url, serviceKey, serverClientOptions)
  }

  return serverClient
}

/**
 * Create a user-scoped Supabase client with a specific access token
 * Useful for server-side operations that need to respect user's RLS policies
 * Clients are cached for performance but expire after TTL
 */
export function createUserScopedClient(accessToken: string): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  // Check cache for existing client
  const cached = userScopedClients.get(accessToken)
  if (cached && Date.now() - cached.createdAt < USER_CLIENT_CACHE_TTL_MS) {
    return cached.client
  }

  // Clean up expired clients periodically
  cleanupExpiredUserClients()

  const userClient = createClient(url, anonKey, {
    ...defaultClientOptions,
    global: {
      headers: {
        ...defaultClientOptions.global?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Cache the new client
  userScopedClients.set(accessToken, { client: userClient, createdAt: Date.now() })

  return userClient
}

/**
 * Clean up expired user-scoped clients from cache
 */
function cleanupExpiredUserClients(): void {
  const now = Date.now()
  for (const [token, { createdAt }] of userScopedClients.entries()) {
    if (now - createdAt >= USER_CLIENT_CACHE_TTL_MS) {
      userScopedClients.delete(token)
    }
  }
}

/**
 * Invalidate a specific user-scoped client (e.g., on logout)
 */
export function invalidateUserScopedClient(accessToken: string): void {
  userScopedClients.delete(accessToken)
}

/**
 * Reset all clients (useful for testing or when auth state changes)
 */
export function resetSupabaseClients(): void {
  client = null
  serverClient = null
  userScopedClients.clear()
}

/**
 * Get diagnostic info about client state (for debugging)
 */
export function getClientDiagnostics(): {
  hasPublicClient: boolean
  hasServerClient: boolean
  userClientCount: number
  config: ReturnType<typeof getSupabaseConfig>
} {
  return {
    hasPublicClient: client !== null,
    hasServerClient: serverClient !== null,
    userClientCount: userScopedClients.size,
    config: getSupabaseConfig(),
  }
}