// ---------------------------------------------------------------------------
// Server-side: resolve API keys from request headers (user-provided) or env
// Supports: OpenAI, Anthropic, Google, Mistral, Groq, Ollama, custom endpoints
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createOpenAI } from "@ai-sdk/openai"

// ── AI Provider Resolution ──────────────────────────────────────────────

/**
 * Resolve the OpenAI API key from the request.
 * Priority: user header > env var
 */
export function resolveOpenAIKey(req: Request): string | null {
  const userKey = req.headers.get("x-user-openai-key")?.trim()
  if (userKey) return userKey
  return process.env.OPENAI_API_KEY?.trim() || null
}

/** Resolve Anthropic API key */
export function resolveAnthropicKey(req: Request): string | null {
  return req.headers.get("x-user-anthropic-key")?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null
}

/** Resolve Google Gemini API key */
export function resolveGoogleKey(req: Request): string | null {
  return req.headers.get("x-user-google-key")?.trim() || process.env.GOOGLE_API_KEY?.trim() || null
}

/** Resolve Mistral API key */
export function resolveMistralKey(req: Request): string | null {
  return req.headers.get("x-user-mistral-key")?.trim() || process.env.MISTRAL_API_KEY?.trim() || null
}

/** Resolve Groq API key */
export function resolveGroqKey(req: Request): string | null {
  return req.headers.get("x-user-groq-key")?.trim() || process.env.GROQ_API_KEY?.trim() || null
}

/** Resolve Ollama local URL */
export function resolveOllamaUrl(req: Request): string | null {
  return req.headers.get("x-user-ollama-url")?.trim() || process.env.OLLAMA_URL?.trim() || null
}

/** Resolve custom model endpoint URL */
export function resolveLocalModelUrl(req: Request): string | null {
  return req.headers.get("x-user-local-model-url")?.trim() || process.env.LOCAL_MODEL_URL?.trim() || null
}

/** Get the user's preferred model */
export function resolvePreferredModel(req: Request): string {
  return req.headers.get("x-user-preferred-model")?.trim() || process.env.DEFAULT_MODEL || "gpt-4o-mini"
}

/** Get all available AI provider keys from the request */
export function resolveAllAIProviders(req: Request): {
  openai: string | null
  anthropic: string | null
  google: string | null
  mistral: string | null
  groq: string | null
  ollama: string | null
  custom: string | null
  preferredModel: string
} {
  return {
    openai: resolveOpenAIKey(req),
    anthropic: resolveAnthropicKey(req),
    google: resolveGoogleKey(req),
    mistral: resolveMistralKey(req),
    groq: resolveGroqKey(req),
    ollama: resolveOllamaUrl(req),
    custom: resolveLocalModelUrl(req),
    preferredModel: resolvePreferredModel(req),
  }
}

/** Check if any AI provider is available */
export function hasAnyAIAccess(req: Request): boolean {
  const providers = resolveAllAIProviders(req)
  return Boolean(providers.openai || providers.anthropic || providers.google || providers.mistral || providers.groq || providers.ollama || providers.custom)
}

/**
 * Create an OpenAI-compatible provider from the resolved key.
 * Can also create providers for Groq/Mistral/custom endpoints that use OpenAI-compatible APIs.
 */
export function resolveOpenAIProvider(req: Request) {
  const apiKey = resolveOpenAIKey(req)
  if (!apiKey) return null
  return createOpenAI({ apiKey })
}

// ── Supabase Resolution ─────────────────────────────────────────────────

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

// ── Data Source Resolution ───────────────────────────────────────────────

/** Resolve MongoDB connection string */
export function resolveMongoDBUrl(req: Request): string | null {
  return req.headers.get("x-user-mongodb-url")?.trim() || process.env.MONGODB_URL?.trim() || null
}

/** Resolve Notion API key */
export function resolveNotionKey(req: Request): string | null {
  return req.headers.get("x-user-notion-key")?.trim() || process.env.NOTION_API_KEY?.trim() || null
}

// ── Convenience Checks ──────────────────────────────────────────────────

export function hasOpenAIAccess(req: Request): boolean {
  return resolveOpenAIKey(req) !== null
}

export function hasSupabaseAccess(req: Request): boolean {
  return resolveSupabaseCredentials(req) !== null
}

export function hasMongoDBAccess(req: Request): boolean {
  return resolveMongoDBUrl(req) !== null
}

export function hasNotionAccess(req: Request): boolean {
  return resolveNotionKey(req) !== null
}
