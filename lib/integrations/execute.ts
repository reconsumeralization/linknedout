import "server-only"

import { createClient } from "@supabase/supabase-js"
import { redisDel, redisStringGet, redisStringSet } from "@/lib/shared/rate-limit-redis"
import { validateProviderEnv } from "@/lib/integrations/validate-provider-env"

export const MARKETPLACE_EXECUTE_PROVIDERS = new Set([
  "resend",
  "openai",
  "groq",
  "mistral",
  "redis",
  "supabase",
  "posthog",
])

export function providerSupportsMarketplaceExecute(providerId: string): boolean {
  return MARKETPLACE_EXECUTE_PROVIDERS.has(providerId)
}

export type MarketplaceExecuteContext = {
  userId: string
  accessToken: string
}

/** Request header overrides (same names as `resolve-request-keys.ts`) for execute route. */
export type MarketplaceKeyOverrides = {
  openai?: string | null
  groq?: string | null
  mistral?: string | null
}

function resolveApiKey(
  providerId: string,
  overrides: MarketplaceKeyOverrides | undefined,
): string | null {
  switch (providerId) {
    case "openai":
      return overrides?.openai?.trim() || process.env.OPENAI_API_KEY?.trim() || null
    case "groq":
      return overrides?.groq?.trim() || process.env.GROQ_API_KEY?.trim() || null
    case "mistral":
      return overrides?.mistral?.trim() || process.env.MISTRAL_API_KEY?.trim() || null
    default:
      return null
  }
}

function requireEnvConfigured(
  providerId: string,
  overrides?: MarketplaceKeyOverrides,
): { ok: true } | { ok: false; error: string } {
  const v = validateProviderEnv(providerId)
  if (!v) return { ok: false, error: "Unknown provider." }
  if (v.oauth) return { ok: true }

  if (providerId === "openai" || providerId === "groq" || providerId === "mistral") {
    if (resolveApiKey(providerId, overrides)) return { ok: true }
    return {
      ok: false,
      error: `Missing API key for ${providerId} (set env or pass x-user-* headers on /api/integrations/execute).`,
    }
  }

  if (!v.configured) {
    return { ok: false, error: `Missing environment variables: ${v.missingEnvKeys.join(", ")}` }
  }
  return { ok: true }
}

async function resendSend(input: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const from = String(input.from ?? "").trim()
  const to = String(input.to ?? "").trim()
  const subject = String(input.subject ?? "").trim()
  const text = input.text != null ? String(input.text) : ""
  const html = input.html != null ? String(input.html) : ""
  if (!from || !to || !subject || (!text && !html)) {
    return { ok: false, error: "from, to, subject, and text or html are required." }
  }
  const key = process.env.RESEND_API_KEY!.trim()
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.includes(",") ? to.split(",").map((s) => s.trim()) : to,
      subject,
      ...(html ? { html } : { text }),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false, error: typeof body.message === "string" ? body.message : `Resend HTTP ${res.status}` }
  }
  return { ok: true, result: body }
}

async function resendBatch(input: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const emails = input.emails
  if (!Array.isArray(emails) || emails.length === 0) {
    return { ok: false, error: "emails must be a non-empty array of { from, to, subject, html|text }." }
  }
  const key = process.env.RESEND_API_KEY!.trim()
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ emails }),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { ok: false, error: typeof body.message === "string" ? body.message : `Resend HTTP ${res.status}` }
  }
  return { ok: true, result: body }
}

export async function executeMarketplaceIntegration(opts: {
  providerId: string
  tool: string
  input: Record<string, unknown>
  ctx: MarketplaceExecuteContext
  keyOverrides?: MarketplaceKeyOverrides
}): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const { providerId, tool, input, ctx, keyOverrides } = opts

  if (!providerSupportsMarketplaceExecute(providerId)) {
    return {
      ok: false,
      error: `Provider "${providerId}" is not executable via the marketplace runner yet. Use existing app APIs (e.g. /api/chat, /api/mongodb/proxy).`,
    }
  }

  const envGate = requireEnvConfigured(providerId, keyOverrides)
  if (!envGate.ok) return envGate

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  try {
    switch (providerId) {
      case "resend": {
        if (tool === "email:send") return resendSend(input)
        if (tool === "email:batch") return resendBatch(input)
        return { ok: false, error: `Unknown Resend tool "${tool}". Use email:send or email:batch.` }
      }
      case "openai": {
        const key = resolveApiKey("openai", keyOverrides)
        if (!key) return { ok: false, error: "OpenAI API key missing." }
        if (tool === "llm:embed") {
          const model = String(input.model ?? "text-embedding-3-small")
          const embedInput = input.input
          if (typeof embedInput !== "string" || !embedInput.trim()) {
            return { ok: false, error: "llm:embed requires string input.input" }
          }
          const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, input: embedInput }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            return { ok: false, error: typeof (body as { error?: { message?: string } }).error?.message === "string" ? (body as { error: { message: string } }).error.message : `OpenAI HTTP ${res.status}` }
          }
          return { ok: true, result: body }
        }
        if (tool === "llm:generate" || tool === "llm:vision") {
          return {
            ok: false,
            error: "Use /api/chat or agent flows for chat/completions; marketplace runner only supports llm:embed here.",
          }
        }
        return { ok: false, error: `Unknown OpenAI tool "${tool}".` }
      }
      case "groq": {
        const key = resolveApiKey("groq", keyOverrides)
        if (!key) return { ok: false, error: "Groq API key missing." }
        if (tool === "llm:generate" || tool === "llm:generate_fast") {
          const model = String(input.model ?? "llama-3.3-70b-versatile")
          const messages = input.messages
          if (!Array.isArray(messages) || messages.length === 0) {
            return { ok: false, error: "llm:generate requires messages: [{role, content}, ...]" }
          }
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, max_tokens: Math.min(Number(input.max_tokens ?? 512), 1024) }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            return { ok: false, error: `Groq HTTP ${res.status}` }
          }
          return { ok: true, result: body }
        }
        if (tool === "llm:embed" || tool === "llm:vision") {
          return { ok: false, error: "Groq tool not mapped for embed/vision in marketplace runner." }
        }
        return { ok: false, error: `Unknown Groq tool "${tool}".` }
      }
      case "mistral": {
        const key = resolveApiKey("mistral", keyOverrides)
        if (!key) return { ok: false, error: "Mistral API key missing." }
        if (tool === "llm:embed") {
          const model = String(input.model ?? "mistral-embed")
          const embedInput = input.input
          if (typeof embedInput !== "string" || !embedInput.trim()) {
            return { ok: false, error: "llm:embed requires string input.input" }
          }
          const res = await fetch("https://api.mistral.ai/v1/embeddings", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, input: embedInput }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) return { ok: false, error: `Mistral HTTP ${res.status}` }
          return { ok: true, result: body }
        }
        if (tool === "llm:generate") {
          return { ok: false, error: "Use /api/chat for Mistral chat; marketplace runner supports llm:embed only." }
        }
        return { ok: false, error: `Unknown Mistral tool "${tool}".` }
      }
      case "posthog": {
        if (tool === "analytics:track") {
          const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
          const hostBase = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").trim().replace(/\/$/, "")
          if (!apiKey) return { ok: false, error: "NEXT_PUBLIC_POSTHOG_KEY missing." }
          const event = String(input.event ?? "").trim()
          if (!event) return { ok: false, error: "analytics:track requires string event" }
          const distinctId = String(input.distinct_id ?? ctx.userId).trim() || "anonymous"
          const props =
            input.properties != null && typeof input.properties === "object" && !Array.isArray(input.properties)
              ? (input.properties as Record<string, unknown>)
              : {}
          const res = await fetch(`${hostBase}/capture/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: apiKey,
              event,
              properties: { distinct_id: distinctId, ...props },
            }),
          })
          const body = await res.json().catch(() => ({}))
          if (!res.ok) {
            const msg = typeof (body as { detail?: string }).detail === "string" ? (body as { detail: string }).detail : `PostHog HTTP ${res.status}`
            return { ok: false, error: msg }
          }
          return { ok: true, result: body }
        }
        if (tool === "analytics:identify" || tool === "flag:evaluate") {
          return {
            ok: false,
            error: `Tool "${tool}" is not exposed via marketplace runner yet; use analytics:track only.`,
          }
        }
        return { ok: false, error: `Unknown PostHog tool "${tool}". Use analytics:track.` }
      }
      case "redis": {
        if (tool === "cache:get") {
          const key = String(input.key ?? "")
          if (!key) return { ok: false, error: "cache:get requires key" }
          const v = await redisStringGet(key)
          return { ok: true, result: { key, value: v } }
        }
        if (tool === "cache:set") {
          const key = String(input.key ?? "")
          const value = String(input.value ?? "")
          const ttl = input.ttlSeconds != null ? Number(input.ttlSeconds) : undefined
          if (!key) return { ok: false, error: "cache:set requires key" }
          const ok = await redisStringSet(key, value, ttl)
          return ok ? { ok: true, result: { key, set: true } } : { ok: false, error: "Redis unavailable or set failed." }
        }
        if (tool === "cache:del") {
          const key = String(input.key ?? "")
          if (!key) return { ok: false, error: "cache:del requires key" }
          const n = await redisDel(key)
          return { ok: true, result: { deleted: n } }
        }
        return { ok: false, error: `Unknown Redis tool "${tool}".` }
      }
      case "supabase": {
        if (!url || !anon) return { ok: false, error: "Supabase env not configured." }
        const sb = createClient(url, anon, {
          global: { headers: { Authorization: `Bearer ${ctx.accessToken}` } },
        })
        if (tool === "db:query_data" || tool === "db:read_schema" || tool === "db:write_data" || tool === "db:run_migration") {
          if (tool !== "db:query_data") {
            return {
              ok: false,
              error: `Tool "${tool}" is not exposed via marketplace runner (safety). Use Supabase SQL editor or migrations.`,
            }
          }
          const table = String(input.table ?? "profiles")
          const limit = Math.min(Math.max(Number(input.limit ?? 5), 1), 20)
          const allowed = new Set(["profiles", "tribes", "projects"])
          if (!allowed.has(table)) {
            return { ok: false, error: `Table "${table}" not allowed. Use: ${[...allowed].join(", ")}.` }
          }
          const { data, error } = await sb.from(table).select("*").limit(limit)
          if (error) return { ok: false, error: error.message }
          return { ok: true, result: { table, rows: data ?? [] } }
        }
        return { ok: false, error: `Unknown Supabase tool "${tool}".` }
      }
      default:
        return { ok: false, error: "Unhandled provider." }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Execution failed." }
  }
}

/** For API catalog merge: live = marketplace execute, partial = runtime wired elsewhere, planned = registry only. */
export function deriveImplementationStatus(providerId: string, runtimeWired: boolean): "live" | "partial" | "planned" {
  if (providerSupportsMarketplaceExecute(providerId)) return "live"
  if (runtimeWired) return "partial"
  return "planned"
}

/** UI hint for `implementationStatus === "partial"` rows in the integrations catalog. */
export function partialIntegrationHint(providerId: string): string | null {
  switch (providerId) {
    case "mongodb":
      return "MongoDB: use POST /api/mongodb/proxy (not the marketplace runner)."
    case "anthropic":
      return "Anthropic: agents/chat when AI_GATEWAY_API_KEY or @ai-sdk/anthropic is configured."
    case "google-ai":
      return "Google AI: env/health here; model calls use your Google keys on configured routes."
    default:
      return "In-repo wiring exists; not executable via POST /api/integrations/execute yet."
  }
}
