import {
  appendDroneProvenanceRecord,
  createDroneRiskAssessment,
  createDroneSignoffRequest,
  fetchDroneComplianceSnapshot,
  resolveDroneSignoffRequest,
} from "@/lib/shared/drone-delivery-server"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("DRONE_COMPLIANCE_MAX_BODY_BYTES", 96_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "DRONE_COMPLIANCE_RATE_LIMIT_MAX",
  "DRONE_COMPLIANCE_RATE_LIMIT_WINDOW_MS",
  { max: 120, windowMs: 60_000 },
)

const CreateSignoffSchema = z.object({
  action: z.literal("create_signoff_request"),
  missionId: z.string().min(2).max(120),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  reason: z.string().min(2).max(2000),
})

const ResolveSignoffSchema = z.object({
  action: z.literal("resolve_signoff_request"),
  signoffId: z.string().min(2).max(120),
  decision: z.enum(["approved", "rejected"]),
  resolverNote: z.string().max(1000).optional(),
})

const AppendProvenanceSchema = z.object({
  action: z.literal("append_provenance_record"),
  missionId: z.string().min(2).max(120),
  eventType: z.string().min(2).max(180),
  actorType: z.enum(["human", "agent", "drone", "system"]),
  actorId: z.string().max(180).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  integrityHash: z.string().min(16).max(512),
  previousHash: z.string().max(512).optional(),
  manifestRef: z.string().max(512).optional(),
  recordedAt: z.string().datetime().optional(),
})

const CreateRiskAssessmentSchema = z.object({
  action: z.literal("create_risk_assessment"),
  missionId: z.string().min(2).max(120),
  riskScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  tailRisk: z.number().min(0).max(1),
  policyResult: z.enum(["allow", "warn", "hold", "block"]),
  factors: z.array(z.string().min(1).max(120)).max(40).optional(),
  requiresSignoff: z.boolean().optional(),
  assessedBy: z.string().max(180).optional(),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateSignoffSchema,
  ResolveSignoffSchema,
  AppendProvenanceSchema,
  CreateRiskAssessmentSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `drone-compliance:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(payload: unknown, status: number, rateLimit: RateLimitResult): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

export async function GET(req: Request): Promise<Response> {
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

  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for drone compliance operations." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }

  const snapshot = await fetchDroneComplianceSnapshot(authResult.auth.accessToken)

  return jsonResponse(
    {
      ok: true,
      data: snapshot,
      tables: {
        fleets: process.env.SUPABASE_DRONE_FLEETS_TABLE || "drone_fleets",
        units: process.env.SUPABASE_DRONE_UNITS_TABLE || "drone_units",
        docks: process.env.SUPABASE_DRONE_DOCKS_TABLE || "drone_docks",
        missions: process.env.SUPABASE_DRONE_MISSIONS_TABLE || "drone_missions",
        riskAssessments: process.env.SUPABASE_DRONE_RISK_ASSESSMENTS_TABLE || "drone_risk_assessments",
        signoffRequests: process.env.SUPABASE_DRONE_SIGNOFF_REQUESTS_TABLE || "drone_signoff_requests",
        provenanceRecords: process.env.SUPABASE_DRONE_PROVENANCE_TABLE || "drone_provenance_records",
      },
    },
    200,
    rateLimit,
  )
}

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

  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for drone compliance operations." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const accessToken = authResult.auth.accessToken

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

  if (input.action === "create_signoff_request") {
    const result = await createDroneSignoffRequest(accessToken, {
      missionId: input.missionId,
      riskLevel: input.riskLevel,
      reason: input.reason,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse({ ok: true, action: input.action, signoff: result.signoff }, 200, rateLimit)
  }

  if (input.action === "resolve_signoff_request") {
    const result = await resolveDroneSignoffRequest(accessToken, {
      signoffId: input.signoffId,
      decision: input.decision,
      resolverNote: input.resolverNote,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse({ ok: true, action: input.action, signoff: result.signoff }, 200, rateLimit)
  }

  if (input.action === "create_risk_assessment") {
    const result = await createDroneRiskAssessment(accessToken, {
      missionId: input.missionId,
      riskScore: input.riskScore,
      confidence: input.confidence,
      tailRisk: input.tailRisk,
      policyResult: input.policyResult,
      factors: input.factors,
      requiresSignoff: input.requiresSignoff,
      assessedBy: input.assessedBy,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse({ ok: true, action: input.action, assessment: result.assessment }, 200, rateLimit)
  }

  const result = await appendDroneProvenanceRecord(accessToken, {
    missionId: input.missionId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    payload: input.payload,
    integrityHash: input.integrityHash,
    previousHash: input.previousHash,
    manifestRef: input.manifestRef,
    recordedAt: input.recordedAt,
  })
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
  }
  return jsonResponse({ ok: true, action: input.action, record: result.record }, 200, rateLimit)
}
