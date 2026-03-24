import {
  getMcpSubagentProfile,
  requiresAuthenticatedSessionForSubagent,
} from "@/lib/agents/mcp-subagents"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { GET as baseGet, OPTIONS as baseOptions, POST as basePost } from "../../route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SUBAGENT_ID = "supabase"

const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "SUPABASE_SUBAGENT_RATE_LIMIT_MAX",
  "SUPABASE_SUBAGENT_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(extraHeaders || {}),
    },
  })
}

async function getRateLimitResult(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `supabase-subagent:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function withSupabaseSubagent(req: Request): Request {
  const url = new URL(req.url)
  url.pathname = "/api/chat"
  url.searchParams.set("subagent", SUBAGENT_ID)
  return new Request(url.toString(), req)
}

export async function GET(req: Request): Promise<Response> {
  const rateLimitResult = await getRateLimitResult(req)
  const rateLimitHeaders = createRateLimitHeaders(rateLimitResult)

  if (!rateLimitResult.allowed) {
    return jsonResponse(
      { error: "rate_limit_exceeded", retryAfterSeconds: rateLimitResult.retryAfterSeconds },
      429,
      rateLimitHeaders,
    )
  }

  const profile = getMcpSubagentProfile(SUBAGENT_ID)
  if (!profile) {
    return jsonResponse({ error: "subagent_not_found", subagent: SUBAGENT_ID }, 404, rateLimitHeaders)
  }

  if (requiresAuthenticatedSessionForSubagent(SUBAGENT_ID)) {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "authentication_required", message: "This subagent requires an authenticated session" },
        401,
        rateLimitHeaders,
      )
    }
  }

  const response = await baseGet(withSupabaseSubagent(req))
  // Merge rate limit headers into the response
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

export async function POST(req: Request): Promise<Response> {
  const rateLimitResult = await getRateLimitResult(req)
  const rateLimitHeaders = createRateLimitHeaders(rateLimitResult)

  if (!rateLimitResult.allowed) {
    return jsonResponse(
      { error: "rate_limit_exceeded", retryAfterSeconds: rateLimitResult.retryAfterSeconds },
      429,
      rateLimitHeaders,
    )
  }

  const profile = getMcpSubagentProfile(SUBAGENT_ID)
  if (!profile) {
    return jsonResponse({ error: "subagent_not_found", subagent: SUBAGENT_ID }, 404, rateLimitHeaders)
  }

  if (requiresAuthenticatedSessionForSubagent(SUBAGENT_ID)) {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "authentication_required", message: "This subagent requires an authenticated session" },
        401,
        rateLimitHeaders,
      )
    }
  }

  const response = await basePost(withSupabaseSubagent(req))
  // Merge rate limit headers into the response
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

export async function OPTIONS(req: Request): Promise<Response> {
  void req
  return baseOptions()
}
