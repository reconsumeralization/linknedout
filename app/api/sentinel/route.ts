import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import {
  createSentinelIncidentForOwner,
  dismissSentinelThreatForOwner,
  resolveSentinelSnapshotForOwner,
  resolveSentinelVetoDecision,
  updateSentinelIncidentForOwner,
} from "@/lib/sentinel/sentinel-data"
import {
  dispatchSentinelKpiWebhookAlerts,
  getRecentAlertDispatchesForOwner,
} from "@/lib/sentinel/sentinel-alerting"
import type { SentinelPostAction } from "@/lib/sentinel/sentinel-types"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("SENTINEL_MAX_BODY_BYTES", 32_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "SENTINEL_RATE_LIMIT_MAX",
  "SENTINEL_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

const ResolveVetoSchema = z.object({
  action: z.literal("resolve_veto"),
  eventId: z.string().min(1).max(120),
  decision: z.enum(["approved", "rejected"]),
  resolverNote: z.string().max(1000).optional(),
})

const DismissThreatSchema = z.object({
  action: z.literal("dismiss_threat"),
  threatId: z.string().min(1).max(64),
})

const CreateIncidentSchema = z.object({
  action: z.literal("create_incident"),
  title: z.string().min(3).max(160),
  summary: z.string().max(3000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  sourceEventId: z.string().uuid().optional(),
  impactedRoutes: z.array(z.string().min(1).max(200)).max(40).optional(),
  impactedFeatures: z.array(z.string().min(1).max(200)).max(40).optional(),
  impactedUsersEstimate: z.number().int().min(0).max(10_000_000).optional(),
  estimatedRevenueImpactUsd: z.number().min(0).max(1_000_000_000).optional(),
  blastRadius: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(80)).max(40).optional(),
  detectedAt: z.string().datetime().optional(),
  containmentStartedAt: z.string().datetime().optional(),
  containedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
})

const UpdateIncidentSchema = z.object({
  action: z.literal("update_incident"),
  incidentId: z.string().uuid(),
  status: z.enum(["open", "investigating", "contained", "resolved"]).optional(),
  title: z.string().min(3).max(160).optional(),
  summary: z.string().max(3000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  impactedRoutes: z.array(z.string().min(1).max(200)).max(40).optional(),
  impactedFeatures: z.array(z.string().min(1).max(200)).max(40).optional(),
  impactedUsersEstimate: z.number().int().min(0).max(10_000_000).optional(),
  estimatedRevenueImpactUsd: z.number().min(0).max(1_000_000_000).optional(),
  blastRadius: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(80)).max(40).optional(),
  detectedAt: z.string().datetime().optional(),
  containmentStartedAt: z.string().datetime().optional(),
  containedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
})

const PostBodySchema = z.discriminatedUnion("action", [
  ResolveVetoSchema,
  DismissThreatSchema,
  CreateIncidentSchema,
  UpdateIncidentSchema,
])

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `sentinel:${clientAddress}`,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for SENTINEL access." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const auth = authResult.auth

  const [snapshot, recentAlertDispatches] = await Promise.all([
    resolveSentinelSnapshotForOwner({
      accessToken: auth.accessToken,
      ownerUserId: auth.userId,
    }),
    getRecentAlertDispatchesForOwner(auth.userId),
  ])
  const alerting = await dispatchSentinelKpiWebhookAlerts({
    ownerUserId: auth.userId,
    snapshot,
    triggerSource: "api_get",
  })

  return jsonResponse(
    {
      ok: true,
      data: snapshot,
      alerting,
      recentAlertDispatches,
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
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for SENTINEL access." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const auth = authResult.auth

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return jsonResponse(
      {
        ok: false,
        error: parsedBody.error,
      },
      parsedBody.status,
      rateLimit,
    )
  }

  const parsed = PostBodySchema.safeParse(parsedBody.value)
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

  const action = parsed.data as SentinelPostAction
  if (action.action === "resolve_veto") {
    const resolved = await resolveSentinelVetoDecision({
      accessToken: auth.accessToken,
      ownerUserId: auth.userId,
      approvalId: action.eventId,
      decision: action.decision,
      resolverNote: action.resolverNote,
    })
    if (!resolved) {
      return jsonResponse(
        {
          ok: false,
          error: "Unable to resolve veto request.",
        },
        400,
        rateLimit,
      )
    }

    return jsonResponse(
      {
        ok: true,
        action: action.action,
        decision: action.decision,
      },
      200,
      rateLimit,
    )
  }

  if (action.action === "create_incident") {
    const created = await createSentinelIncidentForOwner({
      accessToken: auth.accessToken,
      ownerUserId: auth.userId,
      incident: {
        title: action.title,
        summary: action.summary,
        severity: action.severity,
        sourceEventId: action.sourceEventId,
        impactedRoutes: action.impactedRoutes,
        impactedFeatures: action.impactedFeatures,
        impactedUsersEstimate: action.impactedUsersEstimate,
        estimatedRevenueImpactUsd: action.estimatedRevenueImpactUsd,
        blastRadius: action.blastRadius,
        tags: action.tags,
        detectedAt: action.detectedAt,
        containmentStartedAt: action.containmentStartedAt,
        containedAt: action.containedAt,
        resolvedAt: action.resolvedAt,
      },
    })
    if (!created) {
      return jsonResponse(
        {
          ok: false,
          error: "Unable to create incident.",
        },
        400,
        rateLimit,
      )
    }

    return jsonResponse(
      {
        ok: true,
        action: action.action,
        incident: created,
      },
      200,
      rateLimit,
    )
  }

  if (action.action === "update_incident") {
    const updated = await updateSentinelIncidentForOwner({
      accessToken: auth.accessToken,
      ownerUserId: auth.userId,
      incidentId: action.incidentId,
      patch: {
        status: action.status,
        title: action.title,
        summary: action.summary,
        severity: action.severity,
        impactedRoutes: action.impactedRoutes,
        impactedFeatures: action.impactedFeatures,
        impactedUsersEstimate: action.impactedUsersEstimate,
        estimatedRevenueImpactUsd: action.estimatedRevenueImpactUsd,
        blastRadius: action.blastRadius,
        tags: action.tags,
        detectedAt: action.detectedAt,
        containmentStartedAt: action.containmentStartedAt,
        containedAt: action.containedAt,
        resolvedAt: action.resolvedAt,
      },
    })
    if (!updated) {
      return jsonResponse(
        {
          ok: false,
          error: "Unable to update incident.",
        },
        400,
        rateLimit,
      )
    }

    return jsonResponse(
      {
        ok: true,
        action: action.action,
        incident: updated,
      },
      200,
      rateLimit,
    )
  }

  const dismissed = await dismissSentinelThreatForOwner({
    accessToken: auth.accessToken,
    ownerUserId: auth.userId,
    threatId: action.threatId,
  })
  if (!dismissed) {
    return jsonResponse(
      {
        ok: false,
        error: "Unable to dismiss threat signature.",
      },
      400,
      rateLimit,
    )
  }

  return jsonResponse(
    {
      ok: true,
      action: action.action,
      threatId: action.threatId,
    },
    200,
    rateLimit,
  )
}
