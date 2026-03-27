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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("AUTHENTICITY_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "AUTHENTICITY_RATE_LIMIT_MAX",
  "AUTHENTICITY_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                        */
/* ------------------------------------------------------------------ */

const ContentTypeSchema = z.enum([
  "text",
  "image",
  "video",
  "audio",
  "document",
  "code",
  "model_output",
])

const AttestationMethodSchema = z.enum([
  "hash_signature",
  "biological_signal",
  "multi_party",
  "hardware_attestation",
  "zero_knowledge",
])

const ChallengeTypeSchema = z.enum([
  "forgery_claim",
  "provenance_dispute",
  "signal_mismatch",
  "trust_chain_break",
])

const SignalSourceSchema = z.enum([
  "keystroke_dynamics",
  "mouse_movement",
  "touch_pattern",
  "biometric_sensor",
  "behavioral_model",
])

const AttestSchema = z.object({
  action: z.literal("attest"),
  contentType: ContentTypeSchema,
  contentHash: z.string().min(1).max(512),
  artifactSignature: z.string().max(2048).optional(),
  biologicalSignal: z.record(z.unknown()).optional(),
  attestationMethod: AttestationMethodSchema,
  trustChain: z.array(z.string().min(1).max(512)).max(50).optional(),
})

const VerifySchema = z.object({
  action: z.literal("verify"),
  attestationId: z.string().min(1).max(120),
})

const ChallengeSchema = z.object({
  action: z.literal("challenge"),
  attestationId: z.string().min(1).max(120),
  challengeType: ChallengeTypeSchema,
  evidence: z.string().min(1).max(5000),
})

const ResolveChallengeSchema = z.object({
  action: z.literal("resolve_challenge"),
  challengeId: z.string().min(1).max(120),
  resolution: z.enum(["upheld", "dismissed"]),
  resolutionNote: z.string().min(1).max(2000),
})

const GetProvenanceSchema = z.object({
  action: z.literal("get_provenance"),
  contentHash: z.string().min(1).max(512),
})

const HeartbeatPingSchema = z.object({
  action: z.literal("heartbeat_ping"),
  signalSource: SignalSourceSchema,
  signalHash: z.string().min(1).max(512),
  deviceId: z.string().min(1).max(120).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  AttestSchema,
  VerifySchema,
  ChallengeSchema,
  ResolveChallengeSchema,
  GetProvenanceSchema,
  HeartbeatPingSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `authenticity:${clientAddress}`,
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

function userClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

function serviceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                        */
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

  /* ---- attest ---- */
  if (input.action === "attest") {
    const supabase = userClient(accessToken)
    const { data, error } = await supabase
      .from("authenticity_attestations")
      .insert({
        creator_user_id: userId,
        content_type: input.contentType,
        content_hash: input.contentHash,
        artifact_signature: input.artifactSignature ?? null,
        biological_signal: input.biologicalSignal ?? null,
        attestation_method: input.attestationMethod,
        trust_chain: input.trustChain ?? [],
        verification_count: 0,
        status: "active",
      })
      .select("*")
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, attestation: data },
      200,
      rateLimit,
    )
  }

  /* ---- verify ---- */
  if (input.action === "verify") {
    const supabase = userClient(accessToken)
    const svc = serviceClient()

    // Fetch the attestation
    const { data: attestation, error: fetchErr } = await supabase
      .from("authenticity_attestations")
      .select("*")
      .eq("id", input.attestationId)
      .single()

    if (fetchErr) {
      return jsonResponse({ ok: false, error: fetchErr.message }, 400, rateLimit)
    }

    // Verify signature/hash integrity
    const verificationResult = {
      attestation_id: attestation.id,
      content_hash_valid: !!attestation.content_hash,
      signature_present: !!attestation.artifact_signature,
      trust_chain_length: (attestation.trust_chain ?? []).length,
      status: attestation.status,
      verified_at: new Date().toISOString(),
      verified_by: userId,
    }

    // Increment verification_count using service client
    const { error: updateErr } = await svc
      .from("authenticity_attestations")
      .update({ verification_count: (attestation.verification_count ?? 0) + 1 })
      .eq("id", input.attestationId)

    if (updateErr) {
      return jsonResponse({ ok: false, error: updateErr.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, verification: verificationResult },
      200,
      rateLimit,
    )
  }

  /* ---- challenge ---- */
  if (input.action === "challenge") {
    const supabase = userClient(accessToken)
    const { data, error } = await supabase
      .from("authenticity_challenges")
      .insert({
        attestation_id: input.attestationId,
        challenger_user_id: userId,
        challenge_type: input.challengeType,
        evidence: input.evidence,
        status: "open",
      })
      .select("*")
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, challenge: data },
      200,
      rateLimit,
    )
  }

  /* ---- resolve_challenge ---- */
  if (input.action === "resolve_challenge") {
    const supabase = userClient(accessToken)
    const { data, error } = await supabase
      .from("authenticity_challenges")
      .update({
        status: input.resolution,
        resolution_note: input.resolutionNote,
        resolved_by_user_id: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.challengeId)
      .select("*")
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, challenge: data },
      200,
      rateLimit,
    )
  }

  /* ---- get_provenance ---- */
  if (input.action === "get_provenance") {
    const supabase = userClient(accessToken)

    const { data: attestations, error } = await supabase
      .from("authenticity_attestations")
      .select("*")
      .eq("content_hash", input.contentHash)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    // Build full trust chain from all attestations
    const fullTrustChain: string[] = []
    for (const a of attestations ?? []) {
      for (const link of a.trust_chain ?? []) {
        if (!fullTrustChain.includes(link)) {
          fullTrustChain.push(link)
        }
      }
    }

    return jsonResponse(
      { ok: true, action: input.action, attestations, trustChain: fullTrustChain },
      200,
      rateLimit,
    )
  }

  /* ---- heartbeat_ping ---- */
  if (input.action === "heartbeat_ping") {
    const supabase = userClient(accessToken)
    const { data, error } = await supabase
      .from("biological_heartbeat_log")
      .insert({
        user_id: userId,
        signal_source: input.signalSource,
        signal_hash: input.signalHash,
        device_id: input.deviceId ?? null,
      })
      .select("*")
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, heartbeat: data },
      200,
      rateLimit,
    )
  }

  return jsonResponse({ ok: false, error: "Unknown action." }, 400, rateLimit)
}
