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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("LINKEDOUT_CURATION_MAX_BODY_BYTES", 512_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "LINKEDOUT_CURATION_RATE_LIMIT_MAX",
  "LINKEDOUT_CURATION_RATE_LIMIT_WINDOW_MS",
  { max: 90, windowMs: 60_000 },
)
const ObjectiveIdSchema = z.string().uuid()

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const VALID_ACTIONS = ["cull", "whitelist", "archive", "restore"] as const
const CurationActionSchema = z.object({
  profileIds: z.array(z.string().min(1).max(200)).min(1).max(500),
  action: z.enum(VALID_ACTIONS),
  note: z.string().max(5000).nullable().optional(),
  objectiveId: ObjectiveIdSchema.nullable().optional(),
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
    key: `linkedout-curation:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function unauthorized(rateLimit: RateLimitResult): NextResponse {
  return jsonResponse({ error: "Unauthorized. Supabase bearer token required." }, 401, rateLimit)
}

// GET: fetch curation action history for a user
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
  const sb = getSupabase()
  if (!sb) return jsonResponse({ actions: [] }, 200, rateLimit)
  const { data, error } = await sb
    .from("linkedout_curation_actions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return jsonResponse({ error: error.message }, 500, rateLimit)
  return jsonResponse({ actions: data ?? [] }, 200, rateLimit)
}

// POST: log a batch curation action + update contact states
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
  const parsed = CurationActionSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid curation payload.", details: parsed.error.flatten() },
      400,
      rateLimit,
    )
  }
  const body = parsed.data
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase not configured" }, 503, rateLimit)

  // Log the curation action
  const { data: actionData, error: actionError } = await sb
    .from("linkedout_curation_actions")
    .insert({
      user_id: auth.userId,
      profile_ids: body.profileIds,
      action: body.action,
      note: body.note ?? null,
    })
    .select()
    .single()

  if (actionError) return jsonResponse({ error: actionError.message }, 500, rateLimit)

  // Cascade to contact_states if objectiveId provided
  if (body.objectiveId && (body.profileIds as string[]).length > 0) {
    const queueStatus =
      body.action === "whitelist" ? "whitelisted"
      : body.action === "archive" ? "archived"
      : body.action === "restore" ? "nurture"
      : "curate" // cull stays as curate (lowest tier, not removed)

    const rows = body.profileIds.map((profileId) => ({
      user_id: auth.userId,
      profile_id: profileId,
      objective_id: body.objectiveId,
      queue_status: queueStatus,
      updated_at: new Date().toISOString(),
    }))

    const { error: upsertError } = await sb
      .from("linkedout_contact_states")
      .upsert(rows, { onConflict: "user_id,profile_id,objective_id" })
    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, 500, rateLimit)
    }
  }

  return jsonResponse({ ok: true, action: actionData }, 200, rateLimit)
}
