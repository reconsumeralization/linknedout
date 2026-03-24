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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("PIPELINE_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "PIPELINE_RATE_LIMIT_MAX",
  "PIPELINE_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const DeregulationStatusEnum = z.enum(["identified", "analyzed", "automated", "executed", "archived"])

const LunarPhaseEnum = z.enum(["experimentation", "infrastructure", "permanence"])

const ContributionTypeEnum = z.enum(["compute", "design", "engineering", "science", "logistics"])

const LunarStakeStatusEnum = z.enum(["proposed", "funded", "in_progress", "delivered", "verified"])

const SourceTypeEnum = z.enum(["sr1_freedom", "tribal_smr", "lunar_rtg", "orbital_relay"])

const AlertLevelEnum = z.enum(["nominal", "advisory", "caution", "warning", "critical"])

const SupplyChainStatusEnum = z.enum(["on_track", "at_risk", "slipping", "blocked", "resolved", "bypassed"])

const IngestPolicySchema = z.object({
  action: z.literal("ingest_policy"),
  policySection: z.string().min(1).max(2000),
  originalRegulation: z.string().max(5000).optional(),
  executionPath: z.record(z.unknown()).optional(),
})

const AutomatePolicySchema = z.object({
  action: z.literal("automate_policy"),
  policyId: z.string().min(1).max(120),
})

const ListPoliciesSchema = z.object({
  action: z.literal("list_policies"),
  deregulationStatus: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const StakeLunarPhaseSchema = z.object({
  action: z.literal("stake_lunar_phase"),
  phase: LunarPhaseEnum,
  missionName: z.string().min(1).max(500),
  stakedTokens: z.number(),
  contributionType: ContributionTypeEnum,
  deliverableDescription: z.string().max(2000).optional(),
})

const UpdateLunarStakeSchema = z.object({
  action: z.literal("update_lunar_stake"),
  stakeId: z.string().min(1).max(120),
  status: LunarStakeStatusEnum.optional(),
  cosmicEquityPct: z.number().optional(),
  verificationProof: z.record(z.unknown()).optional(),
})

const ReportTelemetrySchema = z.object({
  action: z.literal("report_telemetry"),
  sourceType: SourceTypeEnum,
  powerOutputKw: z.number().optional(),
  thermalEfficiencyPct: z.number().optional(),
  fuelRemainingPct: z.number().optional(),
  telemetryData: z.record(z.unknown()).optional(),
  alertLevel: AlertLevelEnum.optional(),
})

const ListTelemetrySchema = z.object({
  action: z.literal("list_telemetry"),
  sourceType: z.string().max(60).optional(),
  alertLevel: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const RegisterVendorSchema = z.object({
  action: z.literal("register_vendor"),
  vendorName: z.string().min(1).max(500),
  contractDescription: z.string().max(2000).optional(),
  criticalPathItem: z.string().max(1000).optional(),
  scheduledDeliveryDate: z.string().max(30).optional(),
})

const FlagSlippageSchema = z.object({
  action: z.literal("flag_slippage"),
  monitorId: z.string().min(1).max(120),
  projectedDeliveryDate: z.string().min(1).max(30),
  slippageDays: z.number().int(),
})

const ListSupplyChainSchema = z.object({
  action: z.literal("list_supply_chain"),
  status: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  IngestPolicySchema,
  AutomatePolicySchema,
  ListPoliciesSchema,
  StakeLunarPhaseSchema,
  UpdateLunarStakeSchema,
  ReportTelemetrySchema,
  ListTelemetrySchema,
  RegisterVendorSchema,
  FlagSlippageSchema,
  ListSupplyChainSchema,
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
    key: `pipeline:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for Pipeline access." },
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

  /* ---- ingest_policy ---- */
  if (input.action === "ingest_policy") {
    const { data, error } = await supabase
      .from("deregulated_policy_ledger")
      .insert({
        user_id: userId,
        policy_section: input.policySection,
        original_regulation: input.originalRegulation ?? null,
        execution_path: input.executionPath ?? {},
        deregulation_status: "identified",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, policy: data },
      200,
      rateLimit,
    )
  }

  /* ---- automate_policy ---- */
  if (input.action === "automate_policy") {
    const { data, error } = await supabase
      .from("deregulated_policy_ledger")
      .update({
        deregulation_status: "automated",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.policyId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, policy: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_policies ---- */
  if (input.action === "list_policies") {
    const limit = input.limit ?? 50

    let query = supabase
      .from("deregulated_policy_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.deregulationStatus) {
      query = query.eq("deregulation_status", input.deregulationStatus)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, policies: data },
      200,
      rateLimit,
    )
  }

  /* ---- stake_lunar_phase ---- */
  if (input.action === "stake_lunar_phase") {
    const { data, error } = await supabase
      .from("lunar_build_phases")
      .insert({
        user_id: userId,
        phase: input.phase,
        mission_name: input.missionName,
        staked_tokens: input.stakedTokens,
        contribution_type: input.contributionType,
        deliverable_description: input.deliverableDescription ?? null,
        status: "proposed",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, stake: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_lunar_stake ---- */
  if (input.action === "update_lunar_stake") {
    const updates: Record<string, unknown> = {}
    if (input.status !== undefined) updates.status = input.status
    if (input.cosmicEquityPct !== undefined) updates.cosmic_equity_pct = input.cosmicEquityPct
    if (input.verificationProof !== undefined) updates.verification_proof = input.verificationProof

    const { data, error } = await supabase
      .from("lunar_build_phases")
      .update(updates)
      .eq("id", input.stakeId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, stake: data },
      200,
      rateLimit,
    )
  }

  /* ---- report_telemetry ---- */
  if (input.action === "report_telemetry") {
    const { data, error } = await supabase
      .from("fission_power_telemetry")
      .insert({
        user_id: userId,
        source_type: input.sourceType,
        power_output_kw: input.powerOutputKw ?? null,
        thermal_efficiency_pct: input.thermalEfficiencyPct ?? null,
        fuel_remaining_pct: input.fuelRemainingPct ?? null,
        telemetry_data: input.telemetryData ?? {},
        alert_level: input.alertLevel ?? "nominal",
        last_sync_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, telemetry: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_telemetry ---- */
  if (input.action === "list_telemetry") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("fission_power_telemetry")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.sourceType) {
      query = query.eq("source_type", input.sourceType)
    }
    if (input.alertLevel) {
      query = query.eq("alert_level", input.alertLevel)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, telemetry: data },
      200,
      rateLimit,
    )
  }

  /* ---- register_vendor ---- */
  if (input.action === "register_vendor") {
    const { data, error } = await supabase
      .from("supply_chain_monitors")
      .insert({
        user_id: userId,
        vendor_name: input.vendorName,
        contract_description: input.contractDescription ?? null,
        critical_path_item: input.criticalPathItem ?? null,
        scheduled_delivery_date: input.scheduledDeliveryDate ?? null,
        status: "on_track",
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, monitor: data },
      200,
      rateLimit,
    )
  }

  /* ---- flag_slippage ---- */
  if (input.action === "flag_slippage") {
    const newStatus = input.slippageDays > 14 ? "slipping" : "at_risk"
    const uncomfortableAction = input.slippageDays > 30

    const { data, error } = await supabase
      .from("supply_chain_monitors")
      .update({
        projected_delivery_date: input.projectedDeliveryDate,
        slippage_days: input.slippageDays,
        status: newStatus,
        uncomfortable_action_triggered: uncomfortableAction,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.monitorId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        monitor: data,
        uncomfortableActionTriggered: uncomfortableAction,
      },
      200,
      rateLimit,
    )
  }

  /* ---- list_supply_chain ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  let query = supabase
    .from("supply_chain_monitors")
    .select("*")
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
    { ok: true, action: input.action, monitors: data },
    200,
    rateLimit,
  )
}
