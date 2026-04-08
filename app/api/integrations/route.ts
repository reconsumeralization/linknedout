import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { createClient } from "@supabase/supabase-js"
import { INTEGRATION_CATALOG } from "@/lib/connectors/integration-catalog"
import { isIntegrationRuntimeWired } from "@/lib/connectors/integration-runtime"
import {
  deriveImplementationStatus,
  partialIntegrationHint,
  providerSupportsMarketplaceExecute,
} from "@/lib/integrations/execute"
import { runIntegrationHealthCheck } from "@/lib/integrations/integration-health"
import { validateProviderEnv } from "@/lib/integrations/validate-provider-env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("INTEGRATIONS_MAX_BODY_BYTES", 32_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "INTEGRATIONS_RATE_LIMIT_MAX",
  "INTEGRATIONS_RATE_LIMIT_WINDOW_MS",
  { max: 90, windowMs: 60_000 },
)

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `integrations:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" }

function jsonResponse(payload: unknown, status: number, rl: RateLimitResult): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...createRateLimitHeaders(rl) },
  })
}

// ─── GET: list integrations + user configs ────────────────────────────────────

export async function GET(req: Request) {
  const rl = await getRateLimit(req)
  if (!rl.allowed) return jsonResponse({ error: "Rate limited" }, 429, rl)

  const auth = await requireSupabaseAuth(req)
  if (auth.response) return auth.response

  const sb = supabaseAdmin()
  const url = new URL(req.url)
  const action = url.searchParams.get("action") ?? "catalog"

  if (action === "catalog") {
    const { data: configs } = await sb
      .from("integration_configs")
      .select("provider, status, enabled, health_status, installed_at, tool_count, category")
      .eq("user_id", auth.auth.userId)

    const configMap = new Map(
      (configs ?? []).map((c: Record<string, unknown>) => [c.provider as string, c])
    )

    const catalog = INTEGRATION_CATALOG.map((entry) => {
      const userConfig = configMap.get(entry.id) as Record<string, unknown> | undefined
      const envV = validateProviderEnv(entry.id)
      const runtimeWired = isIntegrationRuntimeWired(entry.id)
      const marketplaceExecute = providerSupportsMarketplaceExecute(entry.id)
      const implementationStatus = deriveImplementationStatus(entry.id, runtimeWired)
      return {
        ...entry,
        runtimeWired,
        marketplaceExecute,
        implementationStatus,
        partialHint:
          implementationStatus === "partial" ? partialIntegrationHint(entry.id) : null,
        envValidation: envV
          ? {
              configured: envV.configured,
              missingEnvKeys: envV.missingEnvKeys,
              oauth: envV.oauth,
              docsUrl: envV.docsUrl,
              envKeys: envV.envKeys,
            }
          : null,
        installed: !!userConfig,
        status: (userConfig?.status as string) ?? "disconnected",
        enabled: (userConfig?.enabled as boolean) ?? false,
        healthStatus: (userConfig?.health_status as string) ?? "unknown",
        installedAt: (userConfig?.installed_at as string) ?? null,
        userToolCount: (userConfig?.tool_count as number) ?? 0,
      }
    })

    return jsonResponse({
      ok: true,
      catalog,
      totalAvailable: INTEGRATION_CATALOG.filter((i) => i.available).length,
      totalInstalled: configs?.length ?? 0,
    }, 200, rl)
  }

  if (action === "my_integrations") {
    const { data: configs, error } = await sb
      .from("integration_configs")
      .select("*")
      .eq("user_id", auth.auth.userId)
      .order("installed_at", { ascending: false })

    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, integrations: configs }, 200, rl)
  }

  if (action === "health") {
    const provider = url.searchParams.get("provider")
    if (!provider?.trim()) return jsonResponse({ error: "Missing provider query param" }, 400, rl)
    const health = await runIntegrationHealthCheck(provider.trim())
    if (!health) return jsonResponse({ error: "Unknown provider" }, 404, rl)
    return jsonResponse({ ok: true, health }, 200, rl)
  }

  if (action === "usage") {
    const provider = url.searchParams.get("provider")
    let query = sb
      .from("integration_usage_log")
      .select("*")
      .eq("user_id", auth.auth.userId)
      .order("created_at", { ascending: false })
      .limit(100)

    if (provider) query = query.eq("provider", provider)

    const { data, error } = await query
    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, usage: data }, 200, rl)
  }

  return jsonResponse({ error: "Unknown action" }, 400, rl)
}

// ─── POST: install / configure / uninstall integrations ───────────────────────

export async function POST(req: Request) {
  const rl = await getRateLimit(req)
  if (!rl.allowed) return jsonResponse({ error: "Rate limited" }, 429, rl)

  const auth = await requireSupabaseAuth(req)
  if (auth.response) return auth.response

  const body = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request body" }, 400, rl)
  }

  const sb = supabaseAdmin()
  const { action } = body as Record<string, unknown>

  if (action === "install") {
    const { provider, config } = body as Record<string, unknown>
    const entry = INTEGRATION_CATALOG.find((i) => i.id === provider)
    if (!entry) return jsonResponse({ error: "Unknown provider" }, 400, rl)
    if (!entry.available) return jsonResponse({ error: "Integration not yet available" }, 400, rl)

    const { data, error } = await sb
      .from("integration_configs")
      .upsert({
        user_id: auth.auth.userId,
        provider: entry.id,
        display_name: entry.name,
        category: entry.category,
        status: "connected",
        config: config ?? {},
        tool_count: entry.agentTools.length,
        enabled: true,
      }, { onConflict: "user_id,provider" })
      .select()
      .single()

    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, action: "installed", integration: data }, 200, rl)
  }

  if (action === "configure") {
    const { provider, config, enabled } = body as Record<string, unknown>

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (config !== undefined) updates.config = config
    if (enabled !== undefined) updates.enabled = enabled

    const { data, error } = await sb
      .from("integration_configs")
      .update(updates)
      .eq("user_id", auth.auth.userId)
      .eq("provider", provider as string)
      .select()
      .single()

    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, action: "configured", integration: data }, 200, rl)
  }

  if (action === "uninstall") {
    const { provider } = body as Record<string, unknown>

    const { error } = await sb
      .from("integration_configs")
      .delete()
      .eq("user_id", auth.auth.userId)
      .eq("provider", provider as string)

    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, action: "uninstalled", provider }, 200, rl)
  }

  if (action === "health_check") {
    const { provider } = body as Record<string, unknown>

    const { data, error } = await sb
      .from("integration_configs")
      .update({
        last_health_check: new Date().toISOString(),
        health_status: "healthy",
      })
      .eq("user_id", auth.auth.userId)
      .eq("provider", provider as string)
      .select()
      .single()

    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, action: "health_checked", integration: data }, 200, rl)
  }

  if (action === "log_usage") {
    const { provider, toolName, agentId, status, latencyMs, tokensUsed, costUsd, errorMessage } =
      body as Record<string, unknown>

    const { error } = await sb
      .from("integration_usage_log")
      .insert({
        user_id: auth.auth.userId,
        provider,
        tool_name: toolName,
        agent_id: agentId,
        status: status ?? "success",
        latency_ms: latencyMs,
        tokens_used: tokensUsed,
        cost_usd: costUsd,
        error_message: errorMessage,
      })

    if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rl)
    return jsonResponse({ ok: true, action: "usage_logged" }, 200, rl)
  }

  return jsonResponse({ error: "Unknown action" }, 400, rl)
}
