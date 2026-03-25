// ---------------------------------------------------------------------------
// Server-side: resolve API keys from request headers (user-provided) or env
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createOpenAI } from "@ai-sdk/openai"

/**
 * Resolve the OpenAI API key from the request.
 * Priority: user header > env var
 */
export function resolveOpenAIKey(req: Request): string | null {
  const userKey = req.headers.get("x-user-openai-key")?.trim()
  if (userKey) return userKey
  return process.env.OPENAI_API_KEY?.trim() || null
}

/**
 * Create an OpenAI provider from the resolved key.
 */
export function resolveOpenAIProvider(req: Request) {
  const apiKey = resolveOpenAIKey(req)
  if (!apiKey) return null
  return createOpenAI({ apiKey })
}

/**
 * Resolve Supabase URL + anon key from request headers or env.
 */
export function resolveSupabaseCredentials(req: Request): {
  url: string
  anonKey: string
} | null {
  const userUrl = req.headers.get("x-user-supabase-url")?.trim()
  const userKey = req.headers.get("x-user-supabase-anon-key")?.trim()
  if (userUrl && userKey) return { url: userUrl, anonKey: userKey }

  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey }

  return null
}

/**
 * Create a Supabase client scoped to the request's credentials + bearer token.
 */
export function resolveSupabaseClientFromRequest(req: Request): SupabaseClient | null {
  const creds = resolveSupabaseCredentials(req)
  if (!creds) return null

  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "").trim()

  return createClient(creds.url, creds.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-client-info": "linkedout-app-server",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
    },
  })
}

/**
 * Check if the request has any form of OpenAI key available.
 */
export function hasOpenAIAccess(req: Request): boolean {
  return resolveOpenAIKey(req) !== null
}

/**
 * Check if the request has any form of Supabase access.
 */
export function hasSupabaseAccess(req: Request): boolean {
  return resolveSupabaseCredentials(req) !== null
}
