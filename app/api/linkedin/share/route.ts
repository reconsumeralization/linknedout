/**
 * POST /api/linkedin/share — create a UGC post on LinkedIn on behalf of the member.
 * Requires Authorization: Bearer <Supabase session> and a connected LinkedIn identity with w_member_social.
 * Body: { text: string, visibility?: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN" }
 *
 * Uses token introspection before posting; on 429 respects Retry-After and retries once.
 * Audit: optional SUPABASE_LINKEDIN_SHARE_AUDIT_TABLE (e.g. linkedin_share_audit).
 */

import {
  publishLinkedinTextShareForUser,
} from "@/lib/linkedin/linkedin-share-server"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("LINKEDIN_SHARE_MAX_BODY_BYTES", 32_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "LINKEDIN_SHARE_RATE_LIMIT_MAX",
  "LINKEDIN_SHARE_RATE_LIMIT_WINDOW_MS",
  { max: 30, windowMs: 60_000 },
)

const ShareRequestBodySchema = z.object({
  text: z.string().min(1).max(3000),
  visibility: z.enum(["PUBLIC", "CONNECTIONS", "LOGGED_IN"]).optional(),
})

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

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `linkedin-share:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    const retrySec = rateLimit.retryAfterSeconds ?? 60
    return jsonResponse(
      {
        ok: false,
        error: "rate_limit_exceeded",
        retryAfterSeconds: retrySec,
        message: `Too many posts; try again in ${Math.ceil(retrySec / 60)} minute${retrySec > 60 ? "s" : ""}.`,
      },
      429,
      rateLimit,
      { "Retry-After": String(retrySec) },
    )
  }

  const auth = await resolveSupabaseAuthContextFromRequest(req)
  if (!auth?.userId) {
    return jsonResponse(
      { ok: false, error: "unauthorized", message: "Sign in required" },
      401,
      rateLimit,
    )
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!bodyResult.ok) {
    return jsonResponse(
      { ok: false, error: "invalid_body", message: bodyResult.error },
      bodyResult.status,
      rateLimit,
    )
  }
  const parsed = ShareRequestBodySchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_body",
        message: "Request body must include text and optional visibility.",
        details: parsed.error.flatten().fieldErrors,
      },
      400,
      rateLimit,
    )
  }

  const text = parsed.data.text.trim()
  if (!text) {
    return jsonResponse(
      { ok: false, error: "missing_text", message: "Body must include text." },
      400,
      rateLimit,
    )
  }

  const visibility = parsed.data.visibility ?? "PUBLIC"

  const result = await publishLinkedinTextShareForUser({
    userId: auth.userId,
    text,
    visibility,
    retryOnRateLimit: true,
    audit: {
      shareType: "text",
      metadata: {
        source: "route",
      },
    },
  })

  if (result.ok) {
    return jsonResponse({ ok: true, ugcPostId: result.ugcPostId }, 200, rateLimit)
  }

  const status = result.status === 429 ? 429 : result.status >= 500 ? 502 : result.status
  const retryHeaders =
    status === 429 && result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined
  const retryMin = result.retryAfter != null ? Math.ceil(result.retryAfter / 60) : null
  const userMessage =
    result.status === 429
      ? retryMin != null
        ? `LinkedIn limit reached; try again in ${retryMin} minute${retryMin !== 1 ? "s" : ""}.`
        : "LinkedIn limit reached; try again in a few minutes."
      : result.error
  return jsonResponse(
    {
      ok: false,
      error: result.code,
      message: userMessage,
      retryAfter: result.retryAfter,
    },
    status,
    rateLimit,
    retryHeaders,
  )
}
