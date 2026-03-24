import { getMcpSubagentProfile } from "@/lib/agents/mcp-subagents"
import { getRealtimeToolDefinitions, resolveRealtimeAuthContext } from "@/lib/realtime/realtime-tools"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"

export const runtime = "nodejs"

const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "SUBAGENT_HEALTH_RATE_LIMIT_MAX",
  "SUBAGENT_HEALTH_RATE_LIMIT_WINDOW_MS",
  { max: 120, windowMs: 60_000 },
)

function jsonResponse(
  payload: unknown,
  status = 200,
  rateLimit?: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(rateLimit ? createRateLimitHeaders(rateLimit) : {}),
      ...(extraHeaders || {}),
    },
  })
}

async function getRateLimitResult(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `subagent-health:supabase:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  )
}

export async function GET(req: Request): Promise<Response> {
  const rateLimit = await getRateLimitResult(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "rate_limit_exceeded",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    )
  }

  const authContext = await resolveRealtimeAuthContext(req)
  if (!authContext?.isSupabaseSession) {
    return jsonResponse(
      {
        ok: false,
        error: "auth_required",
        message: "A valid Supabase bearer token is required.",
      },
      401,
      rateLimit,
    )
  }

  const subagentId = "supabase" as const
  const profile = getMcpSubagentProfile(subagentId)
  const tools = getRealtimeToolDefinitions(authContext, { subagentId })

  const flagEnabled = process.env.ENABLE_SUPABASE_LLM_DB_TOOLS === "true"
  const supabaseConfigured = isSupabaseConfigured()
  const ready = Boolean(profile && flagEnabled && supabaseConfigured && tools.length > 0)

  return jsonResponse(
    {
      ok: true,
      ready,
      endpoint: "/api/subagents/supabase/health",
      subagent: profile
        ? {
            id: profile.id,
            name: profile.name,
            description: profile.description,
            requiredScopes: profile.requiredScopes,
          }
        : null,
      auth: {
        userId: authContext.userId,
        email: authContext.email,
        isSupabaseSession: authContext.isSupabaseSession,
      },
      tools: {
        count: tools.length,
        names: tools.map((tool) => tool.name),
      },
      checks: {
        enableSupabaseLlmDbTools: flagEnabled,
        supabaseConfigured,
        mcpDefaultSubagent: process.env.MCP_DEFAULT_SUBAGENT || null,
      },
      timestamp: new Date().toISOString(),
    },
    200,
    rateLimit,
  )
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  })
}
