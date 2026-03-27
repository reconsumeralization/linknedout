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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("BOUNTIES_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "BOUNTIES_RATE_LIMIT_MAX",
  "BOUNTIES_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const SourcePlatformEnum = z.enum([
  "github",
  "gitcoin",
  "replit",
  "devpost",
  "kaggle",
  "topcoder",
  "hackerone",
  "bugcrowd",
  "immunefi",
  "custom",
])

const PackagingStatusEnum = z.enum([
  "draft",
  "packaging",
  "ready",
  "submitted",
])

const SubmissionResultEnum = z.enum([
  "pending",
  "won",
  "lost",
  "honorable_mention",
  "disqualified",
])

const DiscoverOpportunitySchema = z.object({
  action: z.literal("discover_opportunity"),
  sourcePlatform: SourcePlatformEnum,
  sourceUrl: z.string().max(2000).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  prizeDescription: z.string().max(2000).optional(),
  prizeValueUsd: z.number().min(0).optional(),
  deadline: z.string().max(60).optional(),
  requiredSkills: z.array(z.string().min(1).max(120)).max(30).optional(),
})

const ListOpportunitiesSchema = z.object({
  action: z.literal("list_opportunities"),
  status: z.string().max(60).optional(),
  sourcePlatform: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const CreateSubmissionSchema = z.object({
  action: z.literal("create_submission"),
  opportunityId: z.string().min(1).max(120),
  factoryBuildId: z.string().max(120).optional(),
  submissionUrl: z.string().max(2000).optional(),
})

const UpdateSubmissionSchema = z.object({
  action: z.literal("update_submission"),
  submissionId: z.string().min(1).max(120),
  packagingStatus: PackagingStatusEnum.optional(),
  submissionUrl: z.string().max(2000).optional(),
  result: SubmissionResultEnum.optional(),
  prizeEarnedUsd: z.number().min(0).optional(),
})

const ListMySubmissionsSchema = z.object({
  action: z.literal("list_my_submissions"),
  result: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  DiscoverOpportunitySchema,
  ListOpportunitiesSchema,
  CreateSubmissionSchema,
  UpdateSubmissionSchema,
  ListMySubmissionsSchema,
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
    key: `bounties:${clientAddress}`,
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

  /* ---- discover_opportunity ---- */
  if (input.action === "discover_opportunity") {
    const { data, error } = await supabase
      .from("bounty_opportunities")
      .insert({
        discovered_by_user_id: userId,
        source_platform: input.sourcePlatform,
        source_url: input.sourceUrl ?? null,
        title: input.title,
        description: input.description ?? null,
        prize_description: input.prizeDescription ?? null,
        prize_value_usd: input.prizeValueUsd ?? null,
        deadline: input.deadline ?? null,
        required_skills: input.requiredSkills ?? [],
        status: "open",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, opportunity: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_opportunities ---- */
  if (input.action === "list_opportunities") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("bounty_opportunities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.status) {
      query = query.eq("status", input.status)
    }
    if (input.sourcePlatform) {
      query = query.eq("source_platform", input.sourcePlatform)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, opportunities: data },
      200,
      rateLimit,
    )
  }

  /* ---- create_submission ---- */
  if (input.action === "create_submission") {
    const { data, error } = await supabase
      .from("bounty_submissions")
      .insert({
        opportunity_id: input.opportunityId,
        submitter_user_id: userId,
        factory_build_id: input.factoryBuildId ?? null,
        submission_url: input.submissionUrl ?? null,
        packaging_status: "draft",
        result: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, submission: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_submission ---- */
  if (input.action === "update_submission") {
    const updates: Record<string, unknown> = {}
    if (input.packagingStatus !== undefined) updates.packaging_status = input.packagingStatus
    if (input.submissionUrl !== undefined) updates.submission_url = input.submissionUrl
    if (input.result !== undefined) updates.result = input.result
    if (input.prizeEarnedUsd !== undefined) updates.prize_earned_usd = input.prizeEarnedUsd

    const { data, error } = await supabase
      .from("bounty_submissions")
      .update(updates)
      .eq("id", input.submissionId)
      .eq("submitter_user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, submission: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_my_submissions ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  let query = supabase
    .from("bounty_submissions")
    .select("*")
    .eq("submitter_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (input.result) {
    query = query.eq("result", input.result)
  }

  const { data, error } = await query

  if (error) {
    console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, submissions: data },
    200,
    rateLimit,
  )
}
