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
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("EXPERIENCES_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "EXPERIENCES_RATE_LIMIT_MAX",
  "EXPERIENCES_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const EntryTypeEnum = z.enum([
  "career_pivot",
  "failure_lesson",
  "breakthrough",
  "skill_acquisition",
  "mentorship",
  "side_project",
  "industry_insight",
  "personal_growth",
  "custom",
])

const DifficultyLevelEnum = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "expert",
])

const EndorsementTypeEnum = z.enum([
  "verified",
  "resonated",
  "applied_successfully",
  "insightful",
  "brave",
])

const CreateEntrySchema = z.object({
  action: z.literal("create_entry"),
  entryType: EntryTypeEnum,
  title: z.string().min(1).max(500),
  narrative: z.string().min(1).max(10000),
  hardWonAdvice: z.string().max(5000).optional(),
  contextTags: z.array(z.string().min(1).max(120)).max(20).optional(),
  difficultyLevel: DifficultyLevelEnum.optional(),
  tribeId: z.string().max(120).optional(),
})

const UpdateEntrySchema = z.object({
  action: z.literal("update_entry"),
  entryId: z.string().min(1).max(120),
  entryType: EntryTypeEnum.optional(),
  title: z.string().min(1).max(500).optional(),
  narrative: z.string().min(1).max(10000).optional(),
  hardWonAdvice: z.string().max(5000).optional(),
  contextTags: z.array(z.string().min(1).max(120)).max(20).optional(),
  difficultyLevel: DifficultyLevelEnum.optional(),
  tribeId: z.string().max(120).optional(),
  isArchived: z.boolean().optional(),
})

const ListEntriesSchema = z.object({
  action: z.literal("list_entries"),
  entryType: z.string().max(60).optional(),
  tribeId: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

const EndorseSchema = z.object({
  action: z.literal("endorse"),
  experienceId: z.string().min(1).max(120),
  endorsementType: EndorsementTypeEnum,
  comment: z.string().max(2000).optional(),
})

const ListEndorsementsSchema = z.object({
  action: z.literal("list_endorsements"),
  experienceId: z.string().min(1).max(120),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateEntrySchema,
  UpdateEntrySchema,
  ListEntriesSchema,
  EndorseSchema,
  ListEndorsementsSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `experiences:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(
  payload: unknown,
  status: number,
  rateLimit: RateLimitResult,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

function createSupabaseClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  )
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
    )
  }

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return jsonResponse({ ok: false, error: parsedBody.error }, parsedBody.status, rateLimit)
  }

  const parsed = PostRequestSchema.safeParse(parsedBody.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "Invalid request payload.",
        details: parsed.error.flatten(),
      },
      400,
      rateLimit,
    )
  }

  const input: PostRequest = parsed.data
  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for this action." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const accessToken = authResult.auth.accessToken
  const userId = authResult.auth.userId
  const supabase = createSupabaseClient(accessToken)

  /* ---- create_entry ---- */
  if (input.action === "create_entry") {
    const { data, error } = await supabase
      .from("experience_entries")
      .insert({
        author_user_id: userId,
        entry_type: input.entryType,
        title: input.title,
        narrative: input.narrative,
        hard_won_advice: input.hardWonAdvice ?? null,
        context_tags: input.contextTags ?? [],
        difficulty_level: input.difficultyLevel ?? null,
        tribe_id: input.tribeId ?? null,
        verification_count: 0,
        is_archived: false,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, entry: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_entry ---- */
  if (input.action === "update_entry") {
    const updates: Record<string, unknown> = {}
    if (input.entryType !== undefined) updates.entry_type = input.entryType
    if (input.title !== undefined) updates.title = input.title
    if (input.narrative !== undefined) updates.narrative = input.narrative
    if (input.hardWonAdvice !== undefined) updates.hard_won_advice = input.hardWonAdvice
    if (input.contextTags !== undefined) updates.context_tags = input.contextTags
    if (input.difficultyLevel !== undefined) updates.difficulty_level = input.difficultyLevel
    if (input.tribeId !== undefined) updates.tribe_id = input.tribeId
    if (input.isArchived !== undefined) updates.is_archived = input.isArchived

    const { data, error } = await supabase
      .from("experience_entries")
      .update(updates)
      .eq("id", input.entryId)
      .eq("author_user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, entry: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_entries ---- */
  if (input.action === "list_entries") {
    const limit = input.limit ?? 20
    const offset = input.offset ?? 0

    let query = supabase
      .from("experience_entries")
      .select("*", { count: "exact" })
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (input.entryType) {
      query = query.eq("entry_type", input.entryType)
    }
    if (input.tribeId) {
      query = query.eq("tribe_id", input.tribeId)
    }

    const { data, error, count } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, entries: data, total: count },
      200,
      rateLimit,
    )
  }

  /* ---- endorse ---- */
  if (input.action === "endorse") {
    const { data, error } = await supabase
      .from("experience_endorsements")
      .insert({
        experience_id: input.experienceId,
        endorser_user_id: userId,
        endorsement_type: input.endorsementType,
        comment: input.comment ?? null,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    // Increment verification_count on the experience entry
    await supabase.rpc("increment_verification_count", {
      p_experience_id: input.experienceId,
    }).then(async (rpcResult: { error: unknown }) => {
      // Fallback: if RPC doesn't exist, do a manual increment
      if (rpcResult.error) {
        const { data: entry } = await supabase
          .from("experience_entries")
          .select("verification_count")
          .eq("id", input.experienceId)
          .single()

        if (entry) {
          await supabase
            .from("experience_entries")
            .update({ verification_count: (entry.verification_count ?? 0) + 1 })
            .eq("id", input.experienceId)
        }
      }
    })

    return jsonResponse(
      { ok: true, action: input.action, endorsement: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_endorsements ---- */
  // Last branch in the discriminated union
  const { data, error } = await supabase
    .from("experience_endorsements")
    .select("*")
    .eq("experience_id", input.experienceId)
    .order("created_at", { ascending: false })

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, endorsements: data },
    200,
    rateLimit,
  )
}
