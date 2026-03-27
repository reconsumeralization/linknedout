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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("INTERPLANETARY_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "INTERPLANETARY_RATE_LIMIT_MAX",
  "INTERPLANETARY_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const DeregulationStatusEnum = z.enum([
  "identified", "analyzed", "exemption_generated", "approved", "rejected", "archived",
])

const FrictionTypeEnum = z.enum([
  "bureaucratic", "regulatory", "compliance", "jurisdictional", "procedural",
])

const PowerSourceEnum = z.enum([
  "smr", "rtg", "fission_sr1", "fusion_experimental", "solar_concentrated", "geothermal",
])

const LocationTypeEnum = z.enum([
  "terrestrial", "orbital", "lunar_surface", "deep_space", "submarine",
])

const MissionPhaseEnum = z.enum([
  "experimentation", "infrastructure", "permanence",
])

const ContributionTypeEnum = z.enum([
  "compute", "design", "hardware", "logistics", "research", "funding",
])

const ImpactSeverityEnum = z.enum([
  "low", "medium", "high", "critical", "mission_threatening",
])

const ExecutePermissionlessLaunchSchema = z.object({
  action: z.literal("execute_permissionless_launch"),
  policySection: z.string().min(1).max(1000),
  frictionType: FrictionTypeEnum.optional(),
})

const ListPolicyEntriesSchema = z.object({
  action: z.literal("list_policy_entries"),
  status: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const InitializeNuclearHearthSchema = z.object({
  action: z.literal("initialize_nuclear_hearth"),
  hearthName: z.string().min(1).max(500),
  powerSource: PowerSourceEnum.optional(),
  locationType: LocationTypeEnum.optional(),
  outputKwh: z.number().optional(),
})

const ListHearthConfigsSchema = z.object({
  action: z.literal("list_hearth_configs"),
  limit: z.number().int().min(1).max(100).optional(),
})

const LaunchLunarSprintSchema = z.object({
  action: z.literal("launch_lunar_sprint"),
  sprintName: z.string().min(1).max(500),
  missionPhase: MissionPhaseEnum.optional(),
  stakedTokens: z.number().optional(),
  contributionType: ContributionTypeEnum.optional(),
})

const ListLunarStakesSchema = z.object({
  action: z.literal("list_lunar_stakes"),
  phase: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const MonitorSupplyChainSchema = z.object({
  action: z.literal("monitor_supply_chain"),
  vendorName: z.string().min(1).max(500),
  criticalPathItem: z.string().min(1).max(500),
  slippageDays: z.number().int().optional(),
  impactSeverity: ImpactSeverityEnum.optional(),
})

const ListSlippageSchema = z.object({
  action: z.literal("list_slippage"),
  severity: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  ExecutePermissionlessLaunchSchema,
  ListPolicyEntriesSchema,
  InitializeNuclearHearthSchema,
  ListHearthConfigsSchema,
  LaunchLunarSprintSchema,
  ListLunarStakesSchema,
  MonitorSupplyChainSchema,
  ListSlippageSchema,
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
    key: `interplanetary:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for Interplanetary Pipeline access." },
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

  /* ---- execute_permissionless_launch ---- */
  if (input.action === "execute_permissionless_launch") {
    const { data, error } = await supabase
      .from("deregulated_policy_ledger")
      .insert({
        user_id: userId,
        policy_section: input.policySection,
        friction_type: input.frictionType ?? "bureaucratic",
        deregulation_status: "analyzed",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, policy: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_policy_entries ---- */
  if (input.action === "list_policy_entries") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("deregulated_policy_ledger")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.status) {
      query = query.eq("deregulation_status", input.status)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, policies: data },
      200,
      rateLimit,
    )
  }

  /* ---- initialize_nuclear_hearth ---- */
  if (input.action === "initialize_nuclear_hearth") {
    const { data, error } = await supabase
      .from("nuclear_hearth_configs")
      .insert({
        user_id: userId,
        hearth_name: input.hearthName,
        power_source: input.powerSource ?? "smr",
        location_type: input.locationType ?? "terrestrial",
        output_kwh: input.outputKwh ?? 0,
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, hearth: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_hearth_configs ---- */
  if (input.action === "list_hearth_configs") {
    const limit = input.limit ?? 20

    const { data, error } = await supabase
      .from("nuclear_hearth_configs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, hearths: data },
      200,
      rateLimit,
    )
  }

  /* ---- launch_lunar_sprint ---- */
  if (input.action === "launch_lunar_sprint") {
    const { data, error } = await supabase
      .from("lunar_sprint_stakes")
      .insert({
        user_id: userId,
        sprint_name: input.sprintName,
        mission_phase: input.missionPhase ?? "experimentation",
        staked_tokens: input.stakedTokens ?? 0,
        contribution_type: input.contributionType ?? "compute",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, stake: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_lunar_stakes ---- */
  if (input.action === "list_lunar_stakes") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("lunar_sprint_stakes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.phase) {
      query = query.eq("mission_phase", input.phase)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, stakes: data },
      200,
      rateLimit,
    )
  }

  /* ---- monitor_supply_chain ---- */
  if (input.action === "monitor_supply_chain") {
    const { data, error } = await supabase
      .from("supply_chain_slippage")
      .insert({
        monitor_user_id: userId,
        vendor_name: input.vendorName,
        critical_path_item: input.criticalPathItem,
        slippage_days: input.slippageDays ?? 0,
        impact_severity: input.impactSeverity ?? "low",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, slippage: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_slippage ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  let query = supabase
    .from("supply_chain_slippage")
    .select("*")
    .eq("monitor_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (input.severity) {
    query = query.eq("impact_severity", input.severity)
  }

  const { data, error } = await query

  if (error) {
    console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, slippages: data },
    200,
    rateLimit,
  )
}
