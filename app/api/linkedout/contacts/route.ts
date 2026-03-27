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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("LINKEDOUT_CONTACTS_MAX_BODY_BYTES", 512_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "LINKEDOUT_CONTACTS_RATE_LIMIT_MAX",
  "LINKEDOUT_CONTACTS_RATE_LIMIT_WINDOW_MS",
  { max: 120, windowMs: 60_000 },
)
const QUEUE_STATUS_VALUES = ["intro", "nurture", "curate", "whitelisted", "archived"] as const
const ObjectiveIdSchema = z.string().uuid()

const ContactStateSchema = z.object({
  profileId: z.string().min(1).max(200),
  objectiveId: ObjectiveIdSchema,
  queueStatus: z.enum(QUEUE_STATUS_VALUES),
  score: z.number().min(0).max(100).nullable().optional(),
  intentFit: z.number().min(0).max(100).nullable().optional(),
  relationshipStrength: z.number().min(0).max(100).nullable().optional(),
  freshness: z.number().min(0).max(100).nullable().optional(),
})

const BatchContactStateSchema = z.object({
  states: z.array(ContactStateSchema).min(1).max(500),
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
    key: `linkedout-contacts:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function unauthorized(rateLimit: RateLimitResult): NextResponse {
  return jsonResponse({ error: "Unauthorized. Supabase bearer token required." }, 401, rateLimit)
}

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// GET: fetch all contact states for a user (optionally filtered by objective)
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
  const objectiveId = req.nextUrl.searchParams.get("objectiveId")
  const parsedObjectiveId = objectiveId ? ObjectiveIdSchema.safeParse(objectiveId) : null
  if (objectiveId && !parsedObjectiveId?.success) {
    return jsonResponse({ error: "Invalid objectiveId format." }, 400, rateLimit)
  }
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase service role is not configured." }, 503, rateLimit)
  let q = sb.from("linkedout_contact_states").select("*").eq("user_id", userId)
  if (parsedObjectiveId?.success) q = q.eq("objective_id", parsedObjectiveId.data)
  const { data, error } = await q
  if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rateLimit)
  return jsonResponse({ states: data ?? [] }, 200, rateLimit)
}

// POST: upsert a single contact state
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
  const parsed = ContactStateSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid contact state payload.", details: parsed.error.flatten() },
      400,
      rateLimit,
    )
  }
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase not configured" }, 503, rateLimit)
  const state = parsed.data
  const { error } = await sb.from("linkedout_contact_states").upsert(
    {
      user_id: auth.userId,
      profile_id: state.profileId,
      objective_id: state.objectiveId,
      queue_status: state.queueStatus,
      score: state.score ?? null,
      intent_fit: state.intentFit ?? null,
      relationship_strength: state.relationshipStrength ?? null,
      freshness: state.freshness ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,profile_id,objective_id" },
  )
  if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rateLimit)
  return jsonResponse({ ok: true }, 200, rateLimit)
}

// PUT: batch upsert contact states
export async function PUT(req: NextRequest) {
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
  const parsed = BatchContactStateSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid batch contact state payload.", details: parsed.error.flatten() },
      400,
      rateLimit,
    )
  }
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase not configured" }, 503, rateLimit)
  const rows = parsed.data.states.map((s) => ({
    user_id: auth.userId,
    profile_id: s.profileId,
    objective_id: s.objectiveId,
    queue_status: s.queueStatus,
    score: s.score ?? null,
    intent_fit: s.intentFit ?? null,
    relationship_strength: s.relationshipStrength ?? null,
    freshness: s.freshness ?? null,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await sb
    .from("linkedout_contact_states")
    .upsert(rows, { onConflict: "user_id,profile_id,objective_id" })
  if (error) console.error("[API]", error.message); return jsonResponse({ error: "Operation failed" }, 500, rateLimit)
  return jsonResponse({ ok: true, count: rows.length }, 200, rateLimit)
}
