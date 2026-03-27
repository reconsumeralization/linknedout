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
import { createHash } from "node:crypto"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("BLOCKADE_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "BLOCKADE_RATE_LIMIT_MAX",
  "BLOCKADE_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const ApiAvailabilityEnum = z.enum(["full", "partial", "read_only", "none", "deprecated"])
const BypassMethodEnum = z.enum(["api", "visual", "mcp_local", "hybrid", "none"])
const HardwareTypeEnum = z.enum(["one_charge", "lambda", "cloud", "edge", "sovereign_stone", "custom"])
const McpStatusEnum = z.enum(["provisioning", "online", "degraded", "offline", "decommissioned"])
const BypassStatusEnum = z.enum(["draft", "tested", "verified", "deprecated"])
const CertLevelEnum = z.enum(["standard", "verified", "sovereign", "tribal_broadcast"])

const AuditVendorSchema = z.object({
  action: z.literal("audit_vendor"),
  vendorName: z.string().min(1).max(500),
  productName: z.string().min(1).max(500),
  apiAvailability: ApiAvailabilityEnum.optional(),
  monthlyCostUsd: z.number().optional(),
  mcpSupport: z.boolean().optional(),
  rateLimitHitsMonthly: z.number().int().optional(),
  frictionScore: z.number().optional(),
  lockInTariffUsd: z.number().optional(),
  bypassMethod: BypassMethodEnum.optional(),
})

const ListVendorAuditsSchema = z.object({
  action: z.literal("list_vendor_audits"),
  limit: z.number().int().min(1).max(100).optional(),
})

const ProvisionMcpNodeSchema = z.object({
  action: z.literal("provision_mcp_node"),
  nodeName: z.string().min(1).max(500),
  hardwareType: HardwareTypeEnum.optional(),
  endpointUrl: z.string().max(2000).optional(),
  connectedApps: z.array(z.string()).optional(),
})

const ListMcpNodesSchema = z.object({
  action: z.literal("list_mcp_nodes"),
  status: McpStatusEnum.optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const RegisterVisualBypassSchema = z.object({
  action: z.literal("register_visual_bypass"),
  targetApp: z.string().min(1).max(500),
  targetWorkflow: z.string().min(1).max(500),
  interactionBlueprint: z.array(z.object({
    step: z.number(),
    action: z.string(),
    description: z.string().optional(),
  })).optional(),
  modelUsed: z.string().max(200).optional(),
  tribalShared: z.boolean().optional(),
})

const ListVisualBypassesSchema = z.object({
  action: z.literal("list_visual_bypasses"),
  targetApp: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const CertifyIntentSchema = z.object({
  action: z.literal("certify_intent"),
  agentName: z.string().min(1).max(500),
  intentDescription: z.string().min(1).max(4000),
  outgoingTarget: z.string().max(500).optional(),
  certificationLevel: CertLevelEnum.optional(),
  artifactId: z.string().max(200).optional(),
})

const ListIntentCertsSchema = z.object({
  action: z.literal("list_intent_certs"),
  certificationLevel: CertLevelEnum.optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  AuditVendorSchema,
  ListVendorAuditsSchema,
  ProvisionMcpNodeSchema,
  ListMcpNodesSchema,
  RegisterVisualBypassSchema,
  ListVisualBypassesSchema,
  CertifyIntentSchema,
  ListIntentCertsSchema,
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
    key: `blockade:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for Blockade access." },
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

  /* ---- audit_vendor ---- */
  if (input.action === "audit_vendor") {
    const frictionScore = input.frictionScore ?? (() => {
      let score = 0
      if (input.apiAvailability === "none") score += 40
      else if (input.apiAvailability === "deprecated") score += 35
      else if (input.apiAvailability === "read_only") score += 20
      else if (input.apiAvailability === "partial") score += 10
      if (!input.mcpSupport) score += 20
      if ((input.rateLimitHitsMonthly ?? 0) > 100) score += 15
      if ((input.monthlyCostUsd ?? 0) > 500) score += 10
      return Math.min(score, 100)
    })()

    const lockInTariff = input.lockInTariffUsd ?? (frictionScore * (input.monthlyCostUsd ?? 0) / 100)

    const { data, error } = await supabase
      .from("vendor_openness_audit")
      .insert({
        user_id: userId,
        vendor_name: input.vendorName,
        product_name: input.productName,
        api_availability: input.apiAvailability ?? "none",
        mcp_support: input.mcpSupport ?? false,
        rate_limit_hits_monthly: input.rateLimitHitsMonthly ?? 0,
        monthly_cost_usd: input.monthlyCostUsd ?? 0,
        friction_score: frictionScore,
        lock_in_tariff_usd: lockInTariff,
        bypass_method: input.bypassMethod ?? "none",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audit: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_vendor_audits ---- */
  if (input.action === "list_vendor_audits") {
    const limit = input.limit ?? 20

    const { data, error } = await supabase
      .from("vendor_openness_audit")
      .select("*")
      .eq("user_id", userId)
      .order("friction_score", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audits: data },
      200,
      rateLimit,
    )
  }

  /* ---- provision_mcp_node ---- */
  if (input.action === "provision_mcp_node") {
    const { data, error } = await supabase
      .from("sovereign_mcp_nodes")
      .insert({
        user_id: userId,
        node_name: input.nodeName,
        hardware_type: input.hardwareType ?? "cloud",
        endpoint_url: input.endpointUrl ?? null,
        connected_apps: input.connectedApps ?? [],
        status: "provisioning",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, node: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_mcp_nodes ---- */
  if (input.action === "list_mcp_nodes") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("sovereign_mcp_nodes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.status) {
      query = query.eq("status", input.status)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, nodes: data },
      200,
      rateLimit,
    )
  }

  /* ---- register_visual_bypass ---- */
  if (input.action === "register_visual_bypass") {
    const blueprint = input.interactionBlueprint ?? []

    const { data, error } = await supabase
      .from("visual_bypass_registry")
      .insert({
        creator_user_id: userId,
        target_app: input.targetApp,
        target_workflow: input.targetWorkflow,
        interaction_blueprint: blueprint,
        steps_count: blueprint.length,
        model_used: input.modelUsed ?? "molmo-8b",
        tribal_shared: input.tribalShared ?? false,
        status: "draft",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, bypass: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_visual_bypasses ---- */
  if (input.action === "list_visual_bypasses") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("visual_bypass_registry")
      .select("*")
      .eq("creator_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.targetApp) {
      query = query.eq("target_app", input.targetApp)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, bypasses: data },
      200,
      rateLimit,
    )
  }

  /* ---- certify_intent ---- */
  if (input.action === "certify_intent") {
    const biometricHash = createHash("sha256")
      .update(`${userId}:${input.intentDescription}:${Date.now()}`)
      .digest("hex")

    const { data, error } = await supabase
      .from("agentic_intent_certs")
      .insert({
        user_id: userId,
        agent_name: input.agentName,
        intent_description: input.intentDescription,
        biometric_pulse_hash: biometricHash,
        artifact_id: input.artifactId ?? null,
        certification_level: input.certificationLevel ?? "standard",
        is_certified: true,
        outgoing_target: input.outgoingTarget ?? null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, cert: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_intent_certs ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  let query = supabase
    .from("agentic_intent_certs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (input.certificationLevel) {
    query = query.eq("certification_level", input.certificationLevel)
  }

  const { data, error } = await query

  if (error) {
    console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, certs: data },
    200,
    rateLimit,
  )
}
