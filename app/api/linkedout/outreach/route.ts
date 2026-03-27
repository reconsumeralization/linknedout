import { createClient } from "@supabase/supabase-js"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { resolveSupabaseAuthContextFromRequest } from "@/lib/supabase/supabase-auth"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("LINKEDOUT_OUTREACH_MAX_BODY_BYTES", 256_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "LINKEDOUT_OUTREACH_RATE_LIMIT_MAX",
  "LINKEDOUT_OUTREACH_RATE_LIMIT_WINDOW_MS",
  { max: 120, windowMs: 60_000 },
)
const ObjectiveIdSchema = z.string().uuid()

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const VALID_EVENT_TYPES = ["note_copied", "profile_opened", "intro_generated", "cull_exported"] as const
const VALID_EVENT_TYPES_SET = new Set<string>(VALID_EVENT_TYPES)

const OutreachEventSchema = z.object({
  profileId: z.string().min(1).max(200),
  eventType: z.enum(VALID_EVENT_TYPES),
  objectiveId: ObjectiveIdSchema.nullable().optional(),
  payload: z.unknown().optional(),
})

function jsonResponse(payload: unknown, status = 200, rateLimit?: RateLimitResult): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: rateLimit ? createRateLimitHeaders(rateLimit) : undefined,
  })
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `linkedout-outreach:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function unauthorized(rateLimit: RateLimitResult): NextResponse {
  return jsonResponse({ error: "Unauthorized. Supabase bearer token required." }, 401, rateLimit)
}

function normalizeSince(value: string | null): string | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString()
}

// GET: fetch outreach events (optionally filtered by date range)
export async function GET(req: NextRequest) {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds },
      429,
      rateLimit,
    )
  }

  const auth = await resolveSupabaseAuthContextFromRequest(req)
  if (!auth) {
    return unauthorized(rateLimit)
  }

  const userId = auth.userId
  const since = req.nextUrl.searchParams.get("since") // ISO timestamp
  const normalizedSince = normalizeSince(since)
  if (since && !normalizedSince) {
    return jsonResponse({ error: "Invalid since timestamp." }, 400, rateLimit)
  }
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase service role is not configured." }, 503, rateLimit)
  let q = sb
    .from("linkedout_outreach_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500)
  if (normalizedSince) q = q.gte("created_at", normalizedSince)
  const { data, error } = await q
  if (error) return jsonResponse({ error: error.message }, 500, rateLimit)
  return jsonResponse({ events: data ?? [] }, 200, rateLimit)
}

// POST: log a single outreach event
export async function POST(req: NextRequest) {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds },
      429,
      rateLimit,
    )
  }

  const auth = await resolveSupabaseAuthContextFromRequest(req)
  if (!auth) {
    return unauthorized(rateLimit)
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.error }, bodyResult.status, rateLimit)
  }
  const parsed = OutreachEventSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid outreach event payload.", details: parsed.error.flatten() },
      400,
      rateLimit,
    )
  }
  const body = parsed.data
  if (!VALID_EVENT_TYPES_SET.has(body.eventType)) {
    return jsonResponse(
      { error: `eventType must be one of: ${VALID_EVENT_TYPES.join(", ")}` },
      400,
      rateLimit,
    )
  }
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase not configured" }, 503, rateLimit)
  const { error } = await sb.from("linkedout_outreach_events").insert({
    user_id: auth.userId,
    profile_id: body.profileId,
    event_type: body.eventType,
    objective_id: body.objectiveId ?? null,
    payload: body.payload ?? null,
  })
  if (error) return jsonResponse({ error: error.message }, 500, rateLimit)
  return jsonResponse({ ok: true }, 200, rateLimit)
}
