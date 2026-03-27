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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("SHERLOG_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "SHERLOG_RATE_LIMIT_MAX",
  "SHERLOG_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const ArtifactTypeEnum = z.enum([
  "screenshot",
  "process_log",
  "browser_history",
  "sysinfo",
  "installer_binary",
])

const ClassificationEnum = z.enum(["web_lure", "file_lure", "hybrid", "unknown"])

const InfectionStatusEnum = z.enum(["suspected", "confirmed", "benign", "false_positive"])

const LureTypeEnum = z.enum([
  "youtube_redirect",
  "mega_download",
  "google_ad",
  "sponsored_link",
  "direct_download",
  "custom",
])

const SeverityEnum = z.enum(["low", "medium", "high", "critical"])

const IocTypeEnum = z.enum(["url", "domain", "ip", "file_hash", "ad_id", "installer_name"])

const SubmitArtifactSchema = z.object({
  action: z.literal("submit_artifact"),
  artifactType: ArtifactTypeEnum,
  storageRef: z.string().max(2000).optional(),
  rawData: z.record(z.unknown()).optional(),
  fileHashSha256: z.string().max(128).optional(),
  sourceDescription: z.string().max(2000).optional(),
  classification: ClassificationEnum.optional(),
})

const AnalyzeArtifactSchema = z.object({
  action: z.literal("analyze_artifact"),
  artifactId: z.string().min(1).max(120),
})

const ListArtifactsSchema = z.object({
  action: z.literal("list_artifacts"),
  classification: z.string().max(60).optional(),
  infectionStatus: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const GetNarrativeSchema = z.object({
  action: z.literal("get_narrative"),
  narrativeId: z.string().min(1).max(120),
})

const ImmunizeTribeSchema = z.object({
  action: z.literal("immunize_tribe"),
  narrativeId: z.string().min(1).max(120),
})

const CheckImmunitySchema = z.object({
  action: z.literal("check_immunity"),
  iocType: z.string().min(1).max(60),
  iocValue: z.string().min(1).max(2000),
})

const SubmitLureSchema = z.object({
  action: z.literal("submit_lure"),
  lureUrl: z.string().min(1).max(4000),
  lureType: LureTypeEnum.optional(),
})

const GetDetonationSchema = z.object({
  action: z.literal("get_detonation"),
  detonationId: z.string().min(1).max(120),
})

const ListIocsSchema = z.object({
  action: z.literal("list_iocs"),
  isActive: z.boolean().optional(),
  severity: z.string().max(60).optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  SubmitArtifactSchema,
  AnalyzeArtifactSchema,
  ListArtifactsSchema,
  GetNarrativeSchema,
  ImmunizeTribeSchema,
  CheckImmunitySchema,
  SubmitLureSchema,
  GetDetonationSchema,
  ListIocsSchema,
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
    key: `sherlog:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for SherLog access." },
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

  /* ---- submit_artifact ---- */
  if (input.action === "submit_artifact") {
    const { data, error } = await supabase
      .from("malware_artifacts")
      .insert({
        reporter_user_id: userId,
        artifact_type: input.artifactType,
        storage_ref: input.storageRef ?? null,
        raw_data: input.rawData ?? {},
        file_hash_sha256: input.fileHashSha256 ?? null,
        source_description: input.sourceDescription ?? null,
        classification: input.classification ?? "unknown",
        infection_status: "suspected",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, artifact: data },
      200,
      rateLimit,
    )
  }

  /* ---- analyze_artifact ---- */
  if (input.action === "analyze_artifact") {
    const { data, error } = await supabase
      .from("forensic_narratives")
      .insert({
        artifact_id: input.artifactId,
        analyst_user_id: userId,
        layer1_visual: await (async () => {
          try {
            const { generateObject } = await import("ai")
            const { createOpenAI } = await import("@ai-sdk/openai")
            const aiKey = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY
            if (!aiKey) return { automated: false, note: "AI provider not configured" }
            const openai = createOpenAI({ apiKey: aiKey })
            const { object } = await generateObject({
              model: openai("gpt-4o-mini") as unknown as Parameters<typeof generateObject>[0]["model"],
              schema: z.object({
                fileType: z.string(),
                suspiciousIndicators: z.array(z.string()),
                riskLevel: z.enum(["low", "medium", "high", "critical"]),
                summary: z.string(),
              }),
              prompt: `Analyze forensic artifact ${input.artifactId}. Provide visual-layer analysis: file type indicators, suspicious visual indicators, risk level, and a brief summary.`,
            })
            return object
          } catch {
            return { automated: false, note: "AI provider not configured" }
          }
        })(),
        layer2_vector: await (async () => {
          try {
            const { generateObject } = await import("ai")
            const { createOpenAI } = await import("@ai-sdk/openai")
            const aiKey = process.env.OPENAI_API_KEY ?? process.env.AI_GATEWAY_API_KEY
            if (!aiKey) return { automated: false, note: "AI provider not configured" }
            const openai = createOpenAI({ apiKey: aiKey })
            const { object } = await generateObject({
              model: openai("gpt-4o-mini") as unknown as Parameters<typeof generateObject>[0]["model"],
              schema: z.object({
                urls: z.array(z.string()),
                ipAddresses: z.array(z.string()),
                hashes: z.array(z.string()),
                domains: z.array(z.string()),
                riskScore: z.number().min(0).max(100),
              }),
              prompt: `Extract IOCs (Indicators of Compromise) from forensic artifact ${input.artifactId}. Return any URLs, IP addresses, file hashes, domains found, and an overall risk score 0-100.`,
            })
            return object
          } catch {
            return { automated: false, note: "AI provider not configured" }
          }
        })(),
        combined_narrative: null,
        iocs_extracted: [],
        threat_actor_profile: null,
        time_to_analysis_seconds: null,
        status: "analyzing",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, narrative: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_artifacts ---- */
  if (input.action === "list_artifacts") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("malware_artifacts")
      .select("*")
      .eq("reporter_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.classification) {
      query = query.eq("classification", input.classification)
    }
    if (input.infectionStatus) {
      query = query.eq("infection_status", input.infectionStatus)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, artifacts: data },
      200,
      rateLimit,
    )
  }

  /* ---- get_narrative ---- */
  if (input.action === "get_narrative") {
    const { data, error } = await supabase
      .from("forensic_narratives")
      .select("*")
      .eq("id", input.narrativeId)
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, narrative: data },
      200,
      rateLimit,
    )
  }

  /* ---- immunize_tribe ---- */
  if (input.action === "immunize_tribe") {
    // Fetch the narrative to read iocs_extracted
    const { data: narrative, error: narrativeError } = await supabase
      .from("forensic_narratives")
      .select("id, iocs_extracted")
      .eq("id", input.narrativeId)
      .single()

    if (narrativeError || !narrative) {
      return jsonResponse(
        { ok: false, error: narrativeError?.message ?? "Narrative not found." },
        400,
        rateLimit,
      )
    }

    const iocs = Array.isArray(narrative.iocs_extracted) ? narrative.iocs_extracted : []
    if (iocs.length === 0) {
      return jsonResponse(
        { ok: false, error: "No IOCs extracted from this narrative." },
        400,
        rateLimit,
      )
    }

    const results: unknown[] = []
    for (const ioc of iocs) {
      if (!ioc.ioc_type || !ioc.ioc_value) continue

      const { data, error } = await supabase
        .from("tribal_herd_immunity")
        .upsert(
          {
            source_narrative_id: narrative.id,
            ioc_type: ioc.ioc_type,
            ioc_value: ioc.ioc_value,
            threat_category: ioc.threat_category ?? "infostealer",
            severity: ioc.severity ?? "high",
            reported_by_count: 1,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "ioc_type,ioc_value" },
        )
        .select()
        .single()

      if (!error && data) {
        // Increment reported_by_count for existing rows
        await supabase
          .from("tribal_herd_immunity")
          .update({
            reported_by_count: (data.reported_by_count ?? 0) + 1,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", data.id)

        results.push(data)
      }
    }

    return jsonResponse(
      { ok: true, action: input.action, immunizedCount: results.length, iocs: results },
      200,
      rateLimit,
    )
  }

  /* ---- check_immunity ---- */
  if (input.action === "check_immunity") {
    const { data, error } = await supabase
      .from("tribal_herd_immunity")
      .select("*")
      .eq("ioc_type", input.iocType)
      .eq("ioc_value", input.iocValue)
      .single()

    if (error) {
      return jsonResponse(
        { ok: true, action: input.action, found: false, ioc: null },
        200,
        rateLimit,
      )
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        found: true,
        isActive: data.is_active,
        severity: data.severity,
        ioc: data,
      },
      200,
      rateLimit,
    )
  }

  /* ---- submit_lure ---- */
  if (input.action === "submit_lure") {
    const { data, error } = await supabase
      .from("sandbox_detonations")
      .insert({
        submitted_by_user_id: userId,
        lure_url: input.lureUrl,
        lure_type: input.lureType ?? "custom",
        detonation_environment: "headless_browser",
        status: "queued",
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, detonation: data },
      200,
      rateLimit,
    )
  }

  /* ---- get_detonation ---- */
  if (input.action === "get_detonation") {
    const { data, error } = await supabase
      .from("sandbox_detonations")
      .select("*")
      .eq("id", input.detonationId)
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, detonation: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_iocs ---- */
  // Last branch in the discriminated union
  const limit = input.limit ?? 50

  let query = supabase
    .from("tribal_herd_immunity")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (input.isActive !== undefined) {
    query = query.eq("is_active", input.isActive)
  }
  if (input.severity) {
    query = query.eq("severity", input.severity)
  }

  const { data, error } = await query

  if (error) {
    console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, iocs: data },
    200,
    rateLimit,
  )
}
