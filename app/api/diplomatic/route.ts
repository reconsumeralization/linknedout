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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("DIPLOMATIC_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "DIPLOMATIC_RATE_LIMIT_MAX",
  "DIPLOMATIC_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const RiskLevelEnum = z.enum(["low", "medium", "high", "critical"])

const LureTypeEnum = z.enum([
  "document",
  "meeting_request",
  "introduction",
  "proposal",
  "letter",
  "gift",
  "invitation",
])

const StakesLevelEnum = z.enum(["standard", "elevated", "high", "critical", "sovereign"])

const AuditProxyInfluenceSchema = z.object({
  action: z.literal("audit_proxy_influence"),
  subjectName: z.string().min(1).max(500),
  relationshipType: z.string().max(200).optional(),
  linkedEntity: z.string().max(500).optional(),
  linkedCountry: z.string().max(200).optional(),
  externalFinancialIncentives: z.array(z.record(z.unknown())).optional(),
  biasIndicators: z.record(z.unknown()).optional(),
  influenceScore: z.number().optional(),
  riskLevel: RiskLevelEnum.optional(),
})

const VerifyDiplomaticLureSchema = z.object({
  action: z.literal("verify_diplomatic_lure"),
  lureLabel: z.string().min(1).max(500),
  lureType: LureTypeEnum.optional(),
  claimedIntent: z.string().max(2000).optional(),
  sourceEntity: z.string().max(500).optional(),
  sourceCountry: z.string().max(200).optional(),
  semanticValidityScore: z.number().optional(),
  proofOfBuildPresent: z.boolean().optional(),
  proofDetails: z.record(z.unknown()).optional(),
})

const CalculateDiplomaticRefundSchema = z.object({
  action: z.literal("calculate_diplomatic_refund"),
  incidentLabel: z.string().min(1).max(500),
  timeLostMinutes: z.number().int().optional(),
  financialExposureUsd: z.number().optional(),
  rootCause: z.string().max(2000).optional(),
  proxyAuditId: z.string().uuid().optional(),
  lureId: z.string().uuid().optional(),
  lessonsLearned: z.string().max(4000).optional(),
})

const EnforceHandshakeSchema = z.object({
  action: z.literal("enforce_handshake"),
  sessionLabel: z.string().min(1).max(500),
  participants: z.array(
    z.object({
      name: z.string().min(1).max(200),
      role: z.string().max(200).optional(),
      verified: z.boolean().optional(),
    }),
  ),
  stakesLevel: StakesLevelEnum.optional(),
  artifactId: z.string().max(200).optional(),
})

const ListProxyAuditsSchema = z.object({
  action: z.literal("list_proxy_audits"),
  riskLevel: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const ListLureReviewsSchema = z.object({
  action: z.literal("list_lure_reviews"),
  verdict: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const ListRefundsSchema = z.object({
  action: z.literal("list_refunds"),
  limit: z.number().int().min(1).max(100).optional(),
})

const ListHandshakeGatesSchema = z.object({
  action: z.literal("list_handshake_gates"),
  status: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  AuditProxyInfluenceSchema,
  VerifyDiplomaticLureSchema,
  CalculateDiplomaticRefundSchema,
  EnforceHandshakeSchema,
  ListProxyAuditsSchema,
  ListLureReviewsSchema,
  ListRefundsSchema,
  ListHandshakeGatesSchema,
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
    key: `diplomatic:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for Diplomatic Integrity access." },
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

  /* ---- audit_proxy_influence ---- */
  if (input.action === "audit_proxy_influence") {
    const { data, error } = await supabase
      .from("proxy_influence_audit")
      .insert({
        analyst_user_id: userId,
        subject_name: input.subjectName,
        relationship_type: input.relationshipType ?? "friend",
        linked_entity: input.linkedEntity ?? null,
        linked_country: input.linkedCountry ?? null,
        external_financial_incentives: input.externalFinancialIncentives ?? [],
        bias_indicators: input.biasIndicators ?? {},
        influence_score: input.influenceScore ?? 0,
        risk_level: input.riskLevel ?? "low",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audit: data },
      200,
      rateLimit,
    )
  }

  /* ---- verify_diplomatic_lure ---- */
  if (input.action === "verify_diplomatic_lure") {
    const { data, error } = await supabase
      .from("diplomatic_lure_registry")
      .insert({
        reviewer_user_id: userId,
        lure_label: input.lureLabel,
        lure_type: input.lureType ?? "document",
        claimed_intent: input.claimedIntent ?? null,
        source_entity: input.sourceEntity ?? null,
        source_country: input.sourceCountry ?? null,
        semantic_validity_score: input.semanticValidityScore ?? 0,
        proof_of_build_present: input.proofOfBuildPresent ?? false,
        proof_details: input.proofDetails ?? {},
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, review: data },
      200,
      rateLimit,
    )
  }

  /* ---- calculate_diplomatic_refund ---- */
  if (input.action === "calculate_diplomatic_refund") {
    const reputationalCostScore = (input.timeLostMinutes ?? 0) * 0.1 + (input.financialExposureUsd ?? 0) * 0.01

    const { data, error } = await supabase
      .from("diplomatic_refund_ledger")
      .insert({
        user_id: userId,
        incident_label: input.incidentLabel,
        time_lost_minutes: input.timeLostMinutes ?? 0,
        financial_exposure_usd: input.financialExposureUsd ?? 0,
        reputational_cost_score: Math.round(reputationalCostScore * 100) / 100,
        root_cause: input.rootCause ?? null,
        proxy_audit_id: input.proxyAuditId ?? null,
        lure_id: input.lureId ?? null,
        lessons_learned: input.lessonsLearned ?? null,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, refund: data },
      200,
      rateLimit,
    )
  }

  /* ---- enforce_handshake ---- */
  if (input.action === "enforce_handshake") {
    const stakesLevel = input.stakesLevel ?? "standard"
    const sovereigntyScore = stakesLevel === "sovereign" ? 100
      : stakesLevel === "critical" ? 85
      : stakesLevel === "high" ? 70
      : stakesLevel === "elevated" ? 50
      : 30

    const { data, error } = await supabase
      .from("handshake_sovereignty_gates")
      .insert({
        user_id: userId,
        session_label: input.sessionLabel,
        participants: input.participants,
        stakes_level: stakesLevel,
        artifact_id: input.artifactId ?? null,
        sovereignty_score: sovereigntyScore,
        session_status: "pending",
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, gate: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_proxy_audits ---- */
  if (input.action === "list_proxy_audits") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("proxy_influence_audit")
      .select("*")
      .eq("analyst_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.riskLevel) {
      query = query.eq("risk_level", input.riskLevel)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audits: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_lure_reviews ---- */
  if (input.action === "list_lure_reviews") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("diplomatic_lure_registry")
      .select("*")
      .eq("reviewer_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.verdict) {
      query = query.eq("verdict", input.verdict)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, reviews: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_refunds ---- */
  if (input.action === "list_refunds") {
    const limit = input.limit ?? 20

    const { data, error } = await supabase
      .from("diplomatic_refund_ledger")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, refunds: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_handshake_gates ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  let query = supabase
    .from("handshake_sovereignty_gates")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (input.status) {
    query = query.eq("session_status", input.status)
  }

  const { data, error } = await query

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, gates: data },
    200,
    rateLimit,
  )
}
