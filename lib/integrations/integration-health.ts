import { hasSupabasePublicEnv } from "@/lib/supabase/supabase"
import { validateProviderEnv } from "@/lib/integrations/validate-provider-env"

export type IntegrationHealthProbe = "ok" | "error" | "unknown"

export type IntegrationHealthResult = {
  providerId: string
  probe: IntegrationHealthProbe
  message?: string
  validation: NonNullable<ReturnType<typeof validateProviderEnv>>
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 12_000): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ac.signal })
    let body: unknown = null
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      try {
        body = await res.json()
      } catch {
        body = null
      }
    }
    return { ok: res.ok, status: res.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : "fetch failed" }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Non-destructive health checks. Falls back to env validation only when no probe exists.
 */
export async function runIntegrationHealthCheck(providerId: string): Promise<IntegrationHealthResult | null> {
  const validation = validateProviderEnv(providerId)
  if (!validation) return null

  const base = (): IntegrationHealthResult => ({
    providerId,
    probe: "unknown",
    message: validation.oauth
      ? "OAuth provider — complete consent in provider console; env checklist may not apply."
      : validation.envKeys.length === 0
        ? "No env keys listed in catalog for automated check."
        : validation.configured
          ? "Keys present; no automated probe for this provider."
          : `Missing environment variables: ${validation.missingEnvKeys.join(", ")}`,
    validation,
  })

  if (!validation.configured && !validation.oauth) {
    return {
      providerId,
      probe: "error",
      message: `Missing: ${validation.missingEnvKeys.join(", ")}`,
      validation,
    }
  }

  switch (providerId) {
    case "openai": {
      const key = process.env.OPENAI_API_KEY?.trim()
      if (!key) return { providerId, probe: "error", message: "OPENAI_API_KEY missing", validation }
      const r = await fetchJson("https://api.openai.com/v1/models?limit=1", {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (r.ok) return { providerId, probe: "ok", message: "OpenAI API reachable.", validation }
      return { providerId, probe: "error", message: `OpenAI HTTP ${r.status}`, validation }
    }
    case "groq": {
      const key = process.env.GROQ_API_KEY?.trim()
      if (!key) return { providerId, probe: "error", message: "GROQ_API_KEY missing", validation }
      const r = await fetchJson("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (r.ok) return { providerId, probe: "ok", message: "Groq API reachable.", validation }
      return { providerId, probe: "error", message: `Groq HTTP ${r.status}`, validation }
    }
    case "mistral": {
      const key = process.env.MISTRAL_API_KEY?.trim()
      if (!key) return { providerId, probe: "error", message: "MISTRAL_API_KEY missing", validation }
      const r = await fetchJson("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (r.ok) return { providerId, probe: "ok", message: "Mistral API reachable.", validation }
      return { providerId, probe: "error", message: `Mistral HTTP ${r.status}`, validation }
    }
    case "anthropic": {
      const key = process.env.ANTHROPIC_API_KEY?.trim()
      if (!key) return { providerId, probe: "error", message: "ANTHROPIC_API_KEY missing", validation }
      return {
        providerId,
        probe: "unknown",
        message: "Key present — use /api/chat or agents for Anthropic; no free zero-cost probe.",
        validation,
      }
    }
    case "google-ai": {
      const key = process.env.GOOGLE_API_KEY?.trim()
      if (!key) return { providerId, probe: "error", message: "GOOGLE_API_KEY missing", validation }
      return {
        providerId,
        probe: "unknown",
        message: "Key present — Gemini calls go through app model stack; no separate probe.",
        validation,
      }
    }
    case "redis": {
      const { isRedisRateLimitAvailable } = await import("@/lib/shared/rate-limit-redis")
      if (isRedisRateLimitAvailable()) {
        return { providerId, probe: "ok", message: "Redis client available (REDIS_URL).", validation }
      }
      return { providerId, probe: "error", message: "REDIS_URL missing or client failed to init.", validation }
    }
    case "supabase": {
      if (hasSupabasePublicEnv()) {
        return { providerId, probe: "ok", message: "Supabase public env configured.", validation }
      }
      return { providerId, probe: "error", message: "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing.", validation }
    }
    case "resend": {
      const key = process.env.RESEND_API_KEY?.trim()
      if (!key) return { providerId, probe: "error", message: "RESEND_API_KEY missing", validation }
      const r = await fetchJson("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (r.ok) return { providerId, probe: "ok", message: "Resend API reachable.", validation }
      return { providerId, probe: "error", message: `Resend HTTP ${r.status}`, validation }
    }
    case "posthog": {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
      const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim()
      if (!key) return { providerId, probe: "error", message: "NEXT_PUBLIC_POSTHOG_KEY missing", validation }
      return {
        providerId,
        probe: "unknown",
        message: host
          ? "Keys present — marketplace runner sends analytics:track to configured host."
          : "Project key present — defaulting capture host to us.i.posthog.com in runner.",
        validation,
      }
    }
    case "mongodb": {
      const url = process.env.MONGODB_URL?.trim() || process.env.MONGODB_DATA_API_URL?.trim()
      if (!url) return { providerId, probe: "error", message: "MONGODB_URL or MONGODB_DATA_API_URL missing", validation }
      return { providerId, probe: "unknown", message: "Mongo env present — use /api/mongodb/proxy for calls.", validation }
    }
    default:
      return base()
  }
}
