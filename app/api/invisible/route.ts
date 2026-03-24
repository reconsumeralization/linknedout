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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("INVISIBLE_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "INVISIBLE_RATE_LIMIT_MAX",
  "INVISIBLE_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const SandboxStatusEnum = z.enum([
  "provisioned",
  "running",
  "completed",
  "vaporized",
  "failed",
])

const IsolationLevelEnum = z.enum([
  "strict",
  "permissive",
  "quarantine",
])

const VisualSessionStatusEnum = z.enum([
  "active",
  "completed",
  "failed",
  "archived",
])

const BlueprintStatusEnum = z.enum([
  "draft",
  "published",
  "verified",
  "deprecated",
])

const ProvisionWasmSchema = z.object({
  action: z.literal("provision_wasm"),
  artifactName: z.string().min(1).max(500),
  intentDescription: z.string().max(2000).optional(),
  isolationLevel: IsolationLevelEnum.optional(),
  memoryLimitMb: z.number().int().min(1).max(4096).optional(),
})

const UpdateWasmSchema = z.object({
  action: z.literal("update_wasm"),
  artifactId: z.string().min(1).max(120),
  sandboxStatus: SandboxStatusEnum.optional(),
  executionTimeMs: z.number().int().optional(),
  vantaCompliant: z.boolean().optional(),
  sentryTested: z.boolean().optional(),
})

const ListWasmSchema = z.object({
  action: z.literal("list_wasm"),
  sandboxStatus: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const StartVisualSessionSchema = z.object({
  action: z.literal("start_visual_session"),
  sessionName: z.string().max(500).optional(),
  targetUrl: z.string().min(1).max(2000),
  modelUsed: z.string().max(200).optional(),
  hardwareNode: z.string().max(200).optional(),
})

const CompleteVisualSessionSchema = z.object({
  action: z.literal("complete_visual_session"),
  sessionId: z.string().min(1).max(120),
  navigationSteps: z.array(z.unknown()).optional(),
  semanticSnapshots: z.array(z.unknown()).optional(),
  elementsInteracted: z.number().int().optional(),
})

const ListVisualSessionsSchema = z.object({
  action: z.literal("list_visual_sessions"),
  status: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const CreateBlueprintSchema = z.object({
  action: z.literal("create_blueprint"),
  blueprintName: z.string().min(1).max(500),
  expertiseDomain: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  skillDefinition: z.record(z.unknown()).optional(),
  hourlyRateEquivalentUsd: z.number().min(0).optional(),
})

const ListBlueprintsSchema = z.object({
  action: z.literal("list_blueprints"),
  expertiseDomain: z.string().max(500).optional(),
  status: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const RecordSanitizationSchema = z.object({
  action: z.literal("record_sanitization"),
  sourceSystem: z.string().min(1).max(500),
  originalDataVolumeMb: z.number().min(0),
  sanitizedDataVolumeMb: z.number().min(0),
  vendorCostBeforeUsd: z.number().min(0).optional(),
  vendorCostAfterUsd: z.number().min(0).optional(),
  garbageCategoriesPruned: z.array(z.string()).optional(),
})

const ListSanitizationSavingsSchema = z.object({
  action: z.literal("list_sanitization_savings"),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  ProvisionWasmSchema,
  UpdateWasmSchema,
  ListWasmSchema,
  StartVisualSessionSchema,
  CompleteVisualSessionSchema,
  ListVisualSessionsSchema,
  CreateBlueprintSchema,
  ListBlueprintsSchema,
  RecordSanitizationSchema,
  ListSanitizationSavingsSchema,
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
    key: `invisible:${clientAddress}`,
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

  /* ---- provision_wasm ---- */
  if (input.action === "provision_wasm") {
    const { data, error } = await supabase
      .from("wasm_artifacts")
      .insert({
        user_id: userId,
        artifact_name: input.artifactName,
        intent_description: input.intentDescription ?? null,
        isolation_level: input.isolationLevel ?? "strict",
        memory_limit_mb: input.memoryLimitMb ?? 256,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, artifact: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_wasm ---- */
  if (input.action === "update_wasm") {
    const updates: Record<string, unknown> = {}
    if (input.sandboxStatus !== undefined) updates.sandbox_status = input.sandboxStatus
    if (input.executionTimeMs !== undefined) updates.execution_time_ms = input.executionTimeMs
    if (input.vantaCompliant !== undefined) updates.vanta_compliant = input.vantaCompliant
    if (input.sentryTested !== undefined) updates.sentry_tested = input.sentryTested
    if (input.sandboxStatus === "completed" || input.sandboxStatus === "failed") {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from("wasm_artifacts")
      .update(updates)
      .eq("id", input.artifactId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, artifact: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_wasm ---- */
  if (input.action === "list_wasm") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("wasm_artifacts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.sandboxStatus) {
      query = query.eq("sandbox_status", input.sandboxStatus)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, artifacts: data },
      200,
      rateLimit,
    )
  }

  /* ---- start_visual_session ---- */
  if (input.action === "start_visual_session") {
    const { data, error } = await supabase
      .from("visual_web_logs")
      .insert({
        user_id: userId,
        session_name: input.sessionName ?? null,
        target_url: input.targetUrl,
        model_used: input.modelUsed ?? "molmo-8b",
        hardware_node: input.hardwareNode ?? null,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, session: data },
      200,
      rateLimit,
    )
  }

  /* ---- complete_visual_session ---- */
  if (input.action === "complete_visual_session") {
    const updates: Record<string, unknown> = {
      status: "completed",
    }
    if (input.navigationSteps !== undefined) updates.navigation_steps = input.navigationSteps
    if (input.semanticSnapshots !== undefined) updates.semantic_snapshots = input.semanticSnapshots
    if (input.elementsInteracted !== undefined) updates.elements_interacted = input.elementsInteracted

    const { data, error } = await supabase
      .from("visual_web_logs")
      .update(updates)
      .eq("id", input.sessionId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, session: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_visual_sessions ---- */
  if (input.action === "list_visual_sessions") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("visual_web_logs")
      .select("*")
      .eq("user_id", userId)
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
      { ok: true, action: input.action, sessions: data },
      200,
      rateLimit,
    )
  }

  /* ---- create_blueprint ---- */
  if (input.action === "create_blueprint") {
    const { data, error } = await supabase
      .from("consultant_blueprints")
      .insert({
        creator_user_id: userId,
        blueprint_name: input.blueprintName,
        expertise_domain: input.expertiseDomain,
        description: input.description ?? null,
        skill_definition: input.skillDefinition ?? {},
        hourly_rate_equivalent_usd: input.hourlyRateEquivalentUsd ?? 0,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, blueprint: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_blueprints ---- */
  if (input.action === "list_blueprints") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("consultant_blueprints")
      .select("*")
      .in("status", ["published", "verified"])
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.expertiseDomain) {
      query = query.eq("expertise_domain", input.expertiseDomain)
    }

    if (input.status) {
      query = query.eq("status", input.status)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, blueprints: data },
      200,
      rateLimit,
    )
  }

  /* ---- record_sanitization ---- */
  if (input.action === "record_sanitization") {
    const reductionPct =
      input.originalDataVolumeMb > 0
        ? ((input.originalDataVolumeMb - input.sanitizedDataVolumeMb) / input.originalDataVolumeMb) * 100
        : 0

    const monthlySavings =
      input.vendorCostBeforeUsd != null && input.vendorCostAfterUsd != null
        ? input.vendorCostBeforeUsd - input.vendorCostAfterUsd
        : null

    const { data, error } = await supabase
      .from("observability_refund_ledger")
      .insert({
        user_id: userId,
        source_system: input.sourceSystem,
        original_data_volume_mb: input.originalDataVolumeMb,
        sanitized_data_volume_mb: input.sanitizedDataVolumeMb,
        reduction_pct: reductionPct,
        garbage_categories_pruned: input.garbageCategoriesPruned ?? [],
        vendor_cost_before_usd: input.vendorCostBeforeUsd ?? null,
        vendor_cost_after_usd: input.vendorCostAfterUsd ?? null,
        monthly_savings_usd: monthlySavings,
        sanitization_rules_applied: input.garbageCategoriesPruned?.length ?? 0,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, ledgerEntry: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_sanitization_savings ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  const { data, error } = await supabase
    .from("observability_refund_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, savings: data },
    200,
    rateLimit,
  )
}
