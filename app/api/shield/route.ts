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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("SHIELD_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "SHIELD_RATE_LIMIT_MAX",
  "SHIELD_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const AnomalyTypeEnum = z.enum(["covert_channel", "coded_instructions", "timing_attack", "normal"])

const AdversaryStatusEnum = z.enum(["draft", "active", "confirmed", "archived"])

const DeviceTypeEnum = z.enum([
  "server",
  "firewall",
  "router",
  "vehicle",
  "smr",
  "iot_sensor",
  "one_charge",
  "custom",
])

const LifecycleStatusEnum = z.enum(["active", "warning", "zombie", "culled", "decommissioned"])

const DataClassificationEnum = z.enum(["public", "internal", "sensitive", "critical", "sovereign"])

const EncryptionMethodEnum = z.enum([
  "artifact_proximity",
  "biometric_confirm",
  "dual_key",
  "sovereign_enclave",
])

const GateStatusEnum = z.enum(["active", "locked", "revoked"])

const SeverityEnum = z.enum(["low", "medium", "high", "critical"])

const IocTypeEnum = z.enum(["url", "domain", "ip", "file_hash", "ad_id", "installer_name"])

const AuditEntropySchema = z.object({
  action: z.literal("audit_entropy"),
  sourceIp: z.string().min(1).max(200),
  portDistribution: z.record(z.unknown()),
  timingPattern: z.record(z.unknown()).optional(),
  entropyScore: z.number(),
  analyzedPackets: z.number().int().optional(),
})

const ListEntropyAnomaliesSchema = z.object({
  action: z.literal("list_entropy_anomalies"),
  anomalousOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const CreateAdversaryProfileSchema = z.object({
  action: z.literal("create_adversary_profile"),
  profileName: z.string().min(1).max(500),
  stylometricFeatures: z.record(z.unknown()),
  threatActorGroup: z.string().max(500).optional(),
  linkedNarrativeIds: z.array(z.string()).optional(),
})

const UpdateAdversaryProfileSchema = z.object({
  action: z.literal("update_adversary_profile"),
  profileId: z.string().min(1).max(120),
  status: AdversaryStatusEnum.optional(),
  confidenceScore: z.number().optional(),
  stylometricFeatures: z.record(z.unknown()).optional(),
})

const ListAdversaryProfilesSchema = z.object({
  action: z.literal("list_adversary_profiles"),
  status: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const RegisterDeviceSchema = z.object({
  action: z.literal("register_device"),
  deviceId: z.string().min(1).max(500),
  deviceType: DeviceTypeEnum,
  heartbeatSource: z.string().max(200).optional(),
})

const UpdateDeviceLifecycleSchema = z.object({
  action: z.literal("update_device_lifecycle"),
  stateId: z.string().min(1).max(120),
  lastHeartbeatAt: z.string().max(100).optional(),
  lifecycleStatus: LifecycleStatusEnum.optional(),
  consecutiveMissedDays: z.number().int().optional(),
})

const CullZombiesSchema = z.object({
  action: z.literal("cull_zombies"),
})

const RegisterEncryptionGateSchema = z.object({
  action: z.literal("register_encryption_gate"),
  dataLabel: z.string().min(1).max(500),
  dataClassification: DataClassificationEnum,
  artifactId: z.string().max(120).optional(),
  encryptionMethod: EncryptionMethodEnum.optional(),
})

const VerifyEncryptionSchema = z.object({
  action: z.literal("verify_encryption"),
  gateId: z.string().min(1).max(120),
})

const SyncTribalImmunitySchema = z.object({
  action: z.literal("sync_tribal_immunity"),
  iocs: z.array(
    z.object({
      iocType: IocTypeEnum,
      iocValue: z.string().min(1).max(2000),
      threatCategory: z.string().max(200).optional(),
      severity: SeverityEnum.optional(),
    }),
  ),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  AuditEntropySchema,
  ListEntropyAnomaliesSchema,
  CreateAdversaryProfileSchema,
  UpdateAdversaryProfileSchema,
  ListAdversaryProfilesSchema,
  RegisterDeviceSchema,
  UpdateDeviceLifecycleSchema,
  CullZombiesSchema,
  RegisterEncryptionGateSchema,
  VerifyEncryptionSchema,
  SyncTribalImmunitySchema,
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
    key: `shield:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for Shield access." },
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

  /* ---- audit_entropy ---- */
  if (input.action === "audit_entropy") {
    const isAnomalous = input.entropyScore < 3.5
    let anomalyType = "normal"
    if (isAnomalous) {
      if (input.entropyScore < 1.0) {
        anomalyType = "coded_instructions"
      } else if (input.entropyScore < 2.0) {
        anomalyType = "covert_channel"
      } else {
        anomalyType = "timing_attack"
      }
    }

    const { data, error } = await supabase
      .from("traffic_entropy_ledger")
      .insert({
        user_id: userId,
        source_ip: input.sourceIp,
        port_distribution: input.portDistribution,
        timing_pattern: input.timingPattern ?? {},
        entropy_score: input.entropyScore,
        is_anomalous: isAnomalous,
        anomaly_type: anomalyType,
        analyzed_packets: input.analyzedPackets ?? 0,
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, entry: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_entropy_anomalies ---- */
  if (input.action === "list_entropy_anomalies") {
    const limit = input.limit ?? 20
    const anomalousOnly = input.anomalousOnly ?? true

    let query = supabase
      .from("traffic_entropy_ledger")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (anomalousOnly) {
      query = query.eq("is_anomalous", true)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, entries: data },
      200,
      rateLimit,
    )
  }

  /* ---- create_adversary_profile ---- */
  if (input.action === "create_adversary_profile") {
    const { data, error } = await supabase
      .from("adversary_stylometry")
      .insert({
        analyst_user_id: userId,
        profile_name: input.profileName,
        stylometric_features: input.stylometricFeatures,
        threat_actor_group: input.threatActorGroup ?? null,
        linked_narrative_ids: input.linkedNarrativeIds ?? [],
        status: "draft",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, profile: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_adversary_profile ---- */
  if (input.action === "update_adversary_profile") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.status !== undefined) updates.status = input.status
    if (input.confidenceScore !== undefined) updates.confidence_score = input.confidenceScore
    if (input.stylometricFeatures !== undefined) updates.stylometric_features = input.stylometricFeatures

    const { data, error } = await supabase
      .from("adversary_stylometry")
      .update(updates)
      .eq("id", input.profileId)
      .eq("analyst_user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, profile: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_adversary_profiles ---- */
  if (input.action === "list_adversary_profiles") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("adversary_stylometry")
      .select("*")
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
      { ok: true, action: input.action, profiles: data },
      200,
      rateLimit,
    )
  }

  /* ---- register_device ---- */
  if (input.action === "register_device") {
    const { data, error } = await supabase
      .from("device_lifecycle_states")
      .insert({
        user_id: userId,
        device_id: input.deviceId,
        device_type: input.deviceType,
        heartbeat_source: input.heartbeatSource ?? null,
        last_heartbeat_at: new Date().toISOString(),
        lifecycle_status: "active",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, device: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_device_lifecycle ---- */
  if (input.action === "update_device_lifecycle") {
    const updates: Record<string, unknown> = {}
    if (input.lastHeartbeatAt !== undefined) updates.last_heartbeat_at = input.lastHeartbeatAt
    if (input.lifecycleStatus !== undefined) updates.lifecycle_status = input.lifecycleStatus
    if (input.consecutiveMissedDays !== undefined) updates.consecutive_missed_days = input.consecutiveMissedDays

    const { data, error } = await supabase
      .from("device_lifecycle_states")
      .update(updates)
      .eq("id", input.stateId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, device: data },
      200,
      rateLimit,
    )
  }

  /* ---- cull_zombies ---- */
  if (input.action === "cull_zombies") {
    const { data: zombies, error: fetchError } = await supabase
      .from("device_lifecycle_states")
      .select("id")
      .eq("user_id", userId)
      .eq("lifecycle_status", "zombie")
      .eq("auto_cull_enabled", true)

    if (fetchError) {
      return jsonResponse({ ok: false, error: fetchError.message }, 400, rateLimit)
    }

    if (!zombies || zombies.length === 0) {
      return jsonResponse(
        { ok: true, action: input.action, culledCount: 0 },
        200,
        rateLimit,
      )
    }

    const zombieIds = zombies.map((z) => z.id)
    const { error: updateError } = await supabase
      .from("device_lifecycle_states")
      .update({
        lifecycle_status: "culled",
        cull_executed_at: new Date().toISOString(),
      })
      .in("id", zombieIds)
      .eq("user_id", userId)

    if (updateError) {
      return jsonResponse({ ok: false, error: updateError.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, culledCount: zombieIds.length },
      200,
      rateLimit,
    )
  }

  /* ---- register_encryption_gate ---- */
  if (input.action === "register_encryption_gate") {
    const { data, error } = await supabase
      .from("biometric_encryption_gates")
      .insert({
        user_id: userId,
        data_label: input.dataLabel,
        data_classification: input.dataClassification,
        artifact_id: input.artifactId ?? null,
        encryption_method: input.encryptionMethod ?? "artifact_proximity",
        status: "active",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, gate: data },
      200,
      rateLimit,
    )
  }

  /* ---- verify_encryption ---- */
  if (input.action === "verify_encryption") {
    const { data: gate, error: fetchError } = await supabase
      .from("biometric_encryption_gates")
      .select("*")
      .eq("id", input.gateId)
      .eq("user_id", userId)
      .single()

    if (fetchError || !gate) {
      return jsonResponse(
        { ok: false, error: fetchError?.message ?? "Gate not found." },
        400,
        rateLimit,
      )
    }

    const { error: updateError } = await supabase
      .from("biometric_encryption_gates")
      .update({
        access_count: (gate.access_count ?? 0) + 1,
        last_access_at: new Date().toISOString(),
      })
      .eq("id", gate.id)
      .eq("user_id", userId)

    if (updateError) {
      return jsonResponse({ ok: false, error: updateError.message }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        gateId: gate.id,
        status: gate.status,
        dataClassification: gate.data_classification,
        encryptionMethod: gate.encryption_method,
        accessCount: (gate.access_count ?? 0) + 1,
        verified: gate.status === "active",
      },
      200,
      rateLimit,
    )
  }

  /* ---- sync_tribal_immunity ---- */
  // Last branch in the discriminated union
  const results: unknown[] = []
  for (const ioc of input.iocs) {
    const { data, error } = await supabase
      .from("tribal_herd_immunity")
      .upsert(
        {
          ioc_type: ioc.iocType,
          ioc_value: ioc.iocValue,
          threat_category: ioc.threatCategory ?? "infostealer",
          severity: ioc.severity ?? "high",
          reported_by_count: 1,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "ioc_type,ioc_value" },
      )
      .select()
      .single()

    if (!error && data) {
      await supabase
        .from("tribal_herd_immunity")
        .update({
          reported_by_count: (data.reported_by_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
          tribal_propagation_count: (data.tribal_propagation_count ?? 0) + 1,
        })
        .eq("id", data.id)

      results.push(data)
    }
  }

  return jsonResponse(
    { ok: true, action: input.action, syncedCount: results.length, iocs: results },
    200,
    rateLimit,
  )
}
