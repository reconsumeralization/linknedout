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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("ACCOUNTABILITY_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "ACCOUNTABILITY_RATE_LIMIT_MAX",
  "ACCOUNTABILITY_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const GapTypeEnum = z.enum([
  "prosecution_stall",
  "regulatory_capture",
  "institutional_latency",
  "evidence_suppression",
  "jurisdictional_void",
  "whistleblower_retaliation",
])

const SanctionTypeEnum = z.enum([
  "token_freeze",
  "compute_revoke",
  "tribal_exclusion",
  "staking_suspend",
  "full_lockout",
])

const AuditAccountabilityGapSchema = z.object({
  action: z.literal("audit_accountability_gap"),
  subjectLabel: z.string().min(1).max(500),
  gapType: GapTypeEnum.optional(),
  institutionalBody: z.string().max(500).optional(),
  financialExposureUsd: z.number().optional(),
})

const ListAccountabilityGapsSchema = z.object({
  action: z.literal("list_accountability_gaps"),
  status: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const ExecuteEconomicSanctionSchema = z.object({
  action: z.literal("execute_economic_sanction"),
  targetNodeLabel: z.string().min(1).max(500),
  sanctionType: SanctionTypeEnum.optional(),
  reason: z.string().min(1).max(2000),
  frozenTokenAmount: z.number().optional(),
})

const ListSanctionsSchema = z.object({
  action: z.literal("list_sanctions"),
  sanctionStatus: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const ReconstructNarrativeSchema = z.object({
  action: z.literal("reconstruct_narrative"),
  datasetLabel: z.string().min(1).max(500),
  originalRedactionPct: z.number().optional(),
})

const ListReconstructionsSchema = z.object({
  action: z.literal("list_reconstructions"),
  verificationStatus: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const VerifyNetworkHygieneSchema = z.object({
  action: z.literal("verify_network_hygiene"),
  networkSize: z.number().int().optional(),
})

const ListHygieneReportsSchema = z.object({
  action: z.literal("list_hygiene_reports"),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  AuditAccountabilityGapSchema,
  ListAccountabilityGapsSchema,
  ExecuteEconomicSanctionSchema,
  ListSanctionsSchema,
  ReconstructNarrativeSchema,
  ListReconstructionsSchema,
  VerifyNetworkHygieneSchema,
  ListHygieneReportsSchema,
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
    key: `accountability:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for Forensic Accountability access." },
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

  /* ---- audit_accountability_gap ---- */
  if (input.action === "audit_accountability_gap") {
    const { data, error } = await supabase
      .from("accountability_gap_audit")
      .insert({
        analyst_user_id: userId,
        subject_label: input.subjectLabel,
        gap_type: input.gapType ?? "prosecution_stall",
        institutional_body: input.institutionalBody ?? null,
        financial_exposure_usd: input.financialExposureUsd ?? 0,
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

  /* ---- list_accountability_gaps ---- */
  if (input.action === "list_accountability_gaps") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("accountability_gap_audit")
      .select("*")
      .eq("analyst_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.status) {
      query = query.eq("status", input.status)
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

  /* ---- execute_economic_sanction ---- */
  if (input.action === "execute_economic_sanction") {
    const { data, error } = await supabase
      .from("economic_sanction_ledger")
      .insert({
        enforcer_user_id: userId,
        target_node_label: input.targetNodeLabel,
        sanction_type: input.sanctionType ?? "token_freeze",
        reason: input.reason,
        frozen_token_amount: input.frozenTokenAmount ?? 0,
        sanction_status: "pending",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, sanction: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_sanctions ---- */
  if (input.action === "list_sanctions") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("economic_sanction_ledger")
      .select("*")
      .eq("enforcer_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.sanctionStatus) {
      query = query.eq("sanction_status", input.sanctionStatus)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, sanctions: data },
      200,
      rateLimit,
    )
  }

  /* ---- reconstruct_narrative ---- */
  if (input.action === "reconstruct_narrative") {
    const redactionPct = input.originalRedactionPct ?? 0
    const confidence = Math.max(0, Math.min(100, 100 - redactionPct * 0.8))

    const { data, error } = await supabase
      .from("hidden_narrative_reconstructions")
      .insert({
        analyst_user_id: userId,
        dataset_label: input.datasetLabel,
        original_redaction_pct: redactionPct,
        reconstruction_confidence: Math.round(confidence * 100) / 100,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, reconstruction: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_reconstructions ---- */
  if (input.action === "list_reconstructions") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("hidden_narrative_reconstructions")
      .select("*")
      .eq("analyst_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.verificationStatus) {
      query = query.eq("verification_status", input.verificationStatus)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, reconstructions: data },
      200,
      rateLimit,
    )
  }

  /* ---- verify_network_hygiene ---- */
  if (input.action === "verify_network_hygiene") {
    const networkSize = input.networkSize ?? 30000
    const highRisk = Math.round(networkSize * 0.02)
    const mediumRisk = Math.round(networkSize * 0.08)
    const lowRisk = Math.round(networkSize * 0.15)
    const humanAlphaScore = Math.round((1 - (highRisk + mediumRisk) / networkSize) * 100 * 100) / 100

    const { data, error } = await supabase
      .from("network_hygiene_reports")
      .insert({
        user_id: userId,
        network_size: networkSize,
        high_risk_nodes: highRisk,
        medium_risk_nodes: mediumRisk,
        low_risk_nodes: lowRisk,
        risk_categories: {
          proxy_influence: Math.round(highRisk * 0.4),
          regulatory_capture: Math.round(highRisk * 0.3),
          dormant_liability: Math.round(highRisk * 0.3),
        },
        separation_degrees_to_risk: 2.3,
        human_alpha_impact_score: humanAlphaScore,
        recommendations: [
          "Review high-risk nodes for proxy influence patterns",
          "Increase separation from regulatory-capture clusters",
          "Prune dormant liability connections quarterly",
        ],
        report_status: "generated",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, report: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_hygiene_reports ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  const { data, error } = await supabase
    .from("network_hygiene_reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, reports: data },
    200,
    rateLimit,
  )
}
