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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("IMAGINATION_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "IMAGINATION_RATE_LIMIT_MAX",
  "IMAGINATION_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const EnvironmentTypeEnum = z.enum([
  "neo_lab",
  "sovereign_vehicle",
  "home",
  "office",
  "factory_floor",
  "custom",
])

const TrainingStatusEnum = z.enum([
  "untrained",
  "collecting_data",
  "training",
  "evaluating",
  "deployed",
  "failed",
])

const SurpriseEventTypeEnum = z.enum([
  "object_teleport",
  "color_change",
  "physics_violation",
  "trajectory_divergence",
  "sensor_anomaly",
  "deepfake_detected",
])

const SeverityEnum = z.enum(["low", "medium", "high", "critical"])

const ProbeTypeEnum = z.enum([
  "position",
  "orientation",
  "velocity",
  "temperature",
  "pressure",
  "custom",
])

const SimulationStatusEnum = z.enum([
  "planned",
  "simulating",
  "complete",
  "executed",
  "abandoned",
])

const CreateWorldModelSchema = z.object({
  action: z.literal("create_world_model"),
  modelName: z.string().min(1).max(500),
  environmentType: EnvironmentTypeEnum,
  hardwareUsed: z.string().max(500).optional(),
  latentDim: z.number().int().min(1).optional(),
  parameterCount: z.number().int().min(1).optional(),
})

const UpdateWorldModelSchema = z.object({
  action: z.literal("update_world_model"),
  modelId: z.string().min(1).max(120),
  trainingStatus: TrainingStatusEnum.optional(),
  accuracyPct: z.number().min(0).max(100).optional(),
  trainingDataFrames: z.number().int().min(0).optional(),
  trainingHours: z.number().min(0).optional(),
  surpriseThreshold: z.number().min(0).max(1).optional(),
})

const ListWorldModelsSchema = z.object({
  action: z.literal("list_world_models"),
  limit: z.number().int().min(1).max(100).optional(),
})

const SimulateRolloutSchema = z.object({
  action: z.literal("simulate_rollout"),
  worldModelId: z.string().min(1).max(120),
  goalDescription: z.string().min(1).max(4000),
  numRollouts: z.number().int().min(1).max(100000).optional(),
})

const GetSimulationSchema = z.object({
  action: z.literal("get_simulation"),
  simulationId: z.string().min(1).max(120),
})

const LogSurpriseSchema = z.object({
  action: z.literal("log_surprise"),
  worldModelId: z.string().min(1).max(120),
  eventType: SurpriseEventTypeEnum,
  predictedState: z.record(z.unknown()).optional(),
  actualState: z.record(z.unknown()).optional(),
  surpriseDelta: z.number(),
  severity: SeverityEnum.optional(),
})

const ListSurprisesSchema = z.object({
  action: z.literal("list_surprises"),
  worldModelId: z.string().min(1).max(120).optional(),
  severity: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const CreateProbeSchema = z.object({
  action: z.literal("create_probe"),
  worldModelId: z.string().min(1).max(120),
  probeType: ProbeTypeEnum,
  probeLabel: z.string().max(500).optional(),
  extractedValue: z.record(z.unknown()),
  groundTruthValue: z.record(z.unknown()).optional(),
})

const ListProbesSchema = z.object({
  action: z.literal("list_probes"),
  worldModelId: z.string().min(1).max(120).optional(),
  probeType: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateWorldModelSchema,
  UpdateWorldModelSchema,
  ListWorldModelsSchema,
  SimulateRolloutSchema,
  GetSimulationSchema,
  LogSurpriseSchema,
  ListSurprisesSchema,
  CreateProbeSchema,
  ListProbesSchema,
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
    key: `imagination:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for Imagination access." },
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

  /* ---- create_world_model ---- */
  if (input.action === "create_world_model") {
    const { data, error } = await supabase
      .from("world_models")
      .insert({
        owner_user_id: userId,
        model_name: input.modelName,
        environment_type: input.environmentType,
        hardware_used: input.hardwareUsed ?? null,
        latent_dim: input.latentDim ?? 192,
        parameter_count: input.parameterCount ?? 15000000,
        training_status: "untrained",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, worldModel: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_world_model ---- */
  if (input.action === "update_world_model") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.trainingStatus !== undefined) updates.training_status = input.trainingStatus
    if (input.accuracyPct !== undefined) updates.accuracy_pct = input.accuracyPct
    if (input.trainingDataFrames !== undefined) updates.training_data_frames = input.trainingDataFrames
    if (input.trainingHours !== undefined) updates.training_hours = input.trainingHours
    if (input.surpriseThreshold !== undefined) updates.surprise_threshold = input.surpriseThreshold
    if (input.trainingStatus === "deployed") updates.deployed_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("world_models")
      .update(updates)
      .eq("id", input.modelId)
      .eq("owner_user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, worldModel: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_world_models ---- */
  if (input.action === "list_world_models") {
    const limit = input.limit ?? 20

    const { data, error } = await supabase
      .from("world_models")
      .select("*")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, worldModels: data },
      200,
      rateLimit,
    )
  }

  /* ---- simulate_rollout ---- */
  if (input.action === "simulate_rollout") {
    const { data, error } = await supabase
      .from("imaginary_simulations")
      .insert({
        world_model_id: input.worldModelId,
        user_id: userId,
        goal_description: input.goalDescription,
        num_rollouts: input.numRollouts ?? 1000,
        status: "planned",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, simulation: data },
      200,
      rateLimit,
    )
  }

  /* ---- get_simulation ---- */
  if (input.action === "get_simulation") {
    const { data, error } = await supabase
      .from("imaginary_simulations")
      .select("*")
      .eq("id", input.simulationId)
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, simulation: data },
      200,
      rateLimit,
    )
  }

  /* ---- log_surprise ---- */
  if (input.action === "log_surprise") {
    const { data, error } = await supabase
      .from("surprise_events")
      .insert({
        world_model_id: input.worldModelId,
        user_id: userId,
        event_type: input.eventType,
        predicted_state: input.predictedState ?? null,
        actual_state: input.actualState ?? null,
        surprise_delta: input.surpriseDelta,
        severity: input.severity ?? "medium",
        auto_response: "logged",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, surpriseEvent: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_surprises ---- */
  if (input.action === "list_surprises") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("surprise_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.worldModelId) {
      query = query.eq("world_model_id", input.worldModelId)
    }
    if (input.severity) {
      query = query.eq("severity", input.severity)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, surpriseEvents: data },
      200,
      rateLimit,
    )
  }

  /* ---- create_probe ---- */
  if (input.action === "create_probe") {
    const { data, error } = await supabase
      .from("latent_probes")
      .insert({
        world_model_id: input.worldModelId,
        user_id: userId,
        probe_type: input.probeType,
        probe_label: input.probeLabel ?? null,
        extracted_value: input.extractedValue,
        ground_truth_value: input.groundTruthValue ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, probe: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_probes ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 20

  let query = supabase
    .from("latent_probes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (input.worldModelId) {
    query = query.eq("world_model_id", input.worldModelId)
  }
  if (input.probeType) {
    query = query.eq("probe_type", input.probeType)
  }

  const { data, error } = await query

  if (error) {
    console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, probes: data },
    200,
    rateLimit,
  )
}
