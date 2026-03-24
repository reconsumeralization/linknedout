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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("LINKEDOUT_OBJECTIVES_MAX_BODY_BYTES", 256_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "LINKEDOUT_OBJECTIVES_RATE_LIMIT_MAX",
  "LINKEDOUT_OBJECTIVES_RATE_LIMIT_WINDOW_MS",
  { max: 90, windowMs: 60_000 },
)

const ObjectivePayloadSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(200),
  keywords: z.array(z.string().max(120)).max(200).optional(),
  industries: z.array(z.string().max(120)).max(200).optional(),
  skills: z.array(z.string().max(120)).max(200).optional(),
  notePrefix: z.string().max(5000).optional(),
  isActive: z.boolean().optional(),
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
    key: `linkedout-objectives:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function unauthorized(rateLimit: RateLimitResult): NextResponse {
  return jsonResponse({ error: "Unauthorized. Supabase bearer token required." }, 401, rateLimit)
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

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
  if (!sb) return jsonResponse({ objectives: [] }, 200, rateLimit)
  const { data, error } = await sb
    .from("linkedout_objectives")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  if (error) return jsonResponse({ error: error.message }, 500, rateLimit)
  return jsonResponse({ objectives: data ?? [] }, 200, rateLimit)
}

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

  const parsed = ObjectivePayloadSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid objective payload.", details: parsed.error.flatten() },
      400,
      rateLimit,
    )
  }

  const body = parsed.data
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase not configured" }, 503, rateLimit)
  const nowIso = new Date().toISOString()
  const payload = {
    label: body.label,
    keywords: body.keywords ?? [],
    industries: body.industries ?? [],
    skills: body.skills ?? [],
    note_prefix: body.notePrefix ?? "",
    is_active: body.isActive ?? false,
    updated_at: nowIso,
  }

  if (body.id) {
    const { data, error } = await sb
      .from("linkedout_objectives")
      .update(payload)
      .eq("id", body.id)
      .eq("user_id", auth.userId)
      .select()
      .single()
    if (error) return jsonResponse({ error: error.message }, 500, rateLimit)
    return jsonResponse({ objective: data }, 200, rateLimit)
  }

  const { data, error } = await sb
    .from("linkedout_objectives")
    .insert({
      ...payload,
      user_id: auth.userId,
      created_at: nowIso,
    })
    .select()
    .single()
  if (error) return jsonResponse({ error: error.message }, 500, rateLimit)
  return jsonResponse({ objective: data }, 200, rateLimit)
}

export async function DELETE(req: NextRequest) {
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

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return jsonResponse({ error: "id required" }, 400, rateLimit)
  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return jsonResponse({ error: "Invalid id format." }, 400, rateLimit)
  }
  const sb = getSupabase()
  if (!sb) return jsonResponse({ error: "Supabase not configured" }, 503, rateLimit)
  const { error } = await sb
    .from("linkedout_objectives")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", auth.userId)
  if (error) return jsonResponse({ error: error.message }, 500, rateLimit)
  return jsonResponse({ ok: true }, 200, rateLimit)
}
