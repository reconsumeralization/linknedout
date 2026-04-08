import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { executeMarketplaceIntegration, providerSupportsMarketplaceExecute } from "@/lib/integrations/execute"
import { recordIntegrationUsage } from "@/lib/integrations/integration-usage-log"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import { resolveGroqKey, resolveMistralKey, resolveOpenAIKey } from "@/lib/shared/resolve-request-keys"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("INTEGRATIONS_EXECUTE_MAX_BODY_BYTES", 48_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "INTEGRATIONS_EXECUTE_RATE_LIMIT_MAX",
  "INTEGRATIONS_EXECUTE_RATE_LIMIT_WINDOW_MS",
  { max: 40, windowMs: 60_000 },
)

const BodySchema = z.object({
  provider: z.string().min(1).max(64),
  tool: z.string().min(1).max(120),
  input: z.record(z.string(), z.unknown()).optional(),
})

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `integrations-execute:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

export async function POST(req: Request) {
  const rl = await getRateLimit(req)
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ok: false, error: "Rate limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", ...createRateLimitHeaders(rl) },
    })
  }

  const auth = await requireSupabaseAuth(req)
  if (auth.response) return auth.response

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return new Response(JSON.stringify({ ok: false, error: parsedBody.error }), {
      status: parsedBody.status,
      headers: { "Content-Type": "application/json", ...createRateLimitHeaders(rl) },
    })
  }

  const parsed = BodySchema.safeParse(parsedBody.value)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid body", details: parsed.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json", ...createRateLimitHeaders(rl) } },
    )
  }

  const { provider, tool, input } = parsed.data
  const payload = input ?? {}

  if (!providerSupportsMarketplaceExecute(provider)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Provider "${provider}" is not supported by /api/integrations/execute yet.`,
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...createRateLimitHeaders(rl) } },
    )
  }

  const sb = supabaseAdmin()
  const { data: installed, error: installErr } = await sb
    .from("integration_configs")
    .select("id")
    .eq("user_id", auth.auth.userId)
    .eq("provider", provider)
    .maybeSingle()

  if (installErr) {
    console.error("[integrations/execute]", installErr.message)
    return new Response(JSON.stringify({ ok: false, error: "Install check failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...createRateLimitHeaders(rl) },
    })
  }

  if (!installed) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Install this integration in Marketplace before invoking tools.",
      }),
      { status: 403, headers: { "Content-Type": "application/json", ...createRateLimitHeaders(rl) } },
    )
  }

  const keyOverrides = {
    openai: resolveOpenAIKey(req),
    groq: resolveGroqKey(req),
    mistral: resolveMistralKey(req),
  }

  const started = Date.now()
  const result = await executeMarketplaceIntegration({
    providerId: provider,
    tool,
    input: payload,
    ctx: { userId: auth.auth.userId, accessToken: auth.auth.accessToken },
    keyOverrides,
  })
  const latencyMs = Date.now() - started

  await recordIntegrationUsage(sb, {
    userId: auth.auth.userId,
    provider,
    toolName: tool,
    agentId: null,
    ok: result.ok,
    latencyMs,
    errorMessage: result.ok ? null : result.error,
  }, "[integrations/execute] usage log")

  const status = result.ok ? 200 : 422
  return new Response(JSON.stringify(result), {
    status,
    headers: { "Content-Type": "application/json", ...createRateLimitHeaders(rl) },
  })
}
