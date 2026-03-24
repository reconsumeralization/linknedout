import { dispatchSentinelKpiWebhookAlerts, resolveSentinelAlertingConfig } from "@/lib/sentinel/sentinel-alerting"
import {
  listSentinelActiveOwnerIds,
  resolveSentinelSnapshotForOwnerService,
} from "@/lib/sentinel/sentinel-data"
import { getMaxBodyBytesFromEnv, readRequestTextWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { timingSafeEqual } from "node:crypto"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("SENTINEL_CRON_MAX_BODY_BYTES", 24_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "SENTINEL_CRON_RATE_LIMIT_MAX",
  "SENTINEL_CRON_RATE_LIMIT_WINDOW_MS",
  { max: 30, windowMs: 60_000 },
)

const DEFAULT_MAX_OWNERS_PER_RUN = Math.min(
  Math.max(Number.parseInt(process.env.SENTINEL_ALERT_MAX_OWNERS_PER_RUN || "100", 10) || 100, 1),
  500,
)
const DEFAULT_LOOKBACK_HOURS = Math.min(
  Math.max(Number.parseInt(process.env.SENTINEL_ALERT_OWNER_LOOKBACK_HOURS || "24", 10) || 24, 1),
  168,
)

const BodySchema = z.object({
  maxOwners: z.number().int().min(1).max(500).optional(),
  lookbackHours: z.number().int().min(1).max(168).optional(),
  dryRun: z.boolean().optional(),
})

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `sentinel-cron:${clientAddress}`,
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

function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }
  const value = headerValue.trim()
  if (!value.toLowerCase().startsWith("bearer ")) {
    return null
  }
  const token = value.slice(7).trim()
  return token || null
}

function safeSecretEquals(expected: string, provided: string | null): boolean {
  if (!provided) {
    return false
  }
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)
  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }
  return timingSafeEqual(expectedBuffer, providedBuffer)
}

function isAuthorizedCronRequest(req: Request): boolean {
  const expectedSecret = process.env.SENTINEL_CRON_SECRET
  if (!expectedSecret) {
    return false
  }

  const headerSecret = req.headers.get("x-cron-secret")
  const bearerSecret = extractBearerToken(req.headers.get("authorization"))
  return (
    safeSecretEquals(expectedSecret, headerSecret) ||
    safeSecretEquals(expectedSecret, bearerSecret)
  )
}

async function parseCronBody(req: Request): Promise<
  | { ok: true; value: z.infer<typeof BodySchema> }
  | { ok: false; status: number; error: string }
> {
  const textResult = await readRequestTextWithLimit(req, MAX_BODY_BYTES)
  if (!textResult.ok) {
    return textResult
  }

  if (!textResult.text.trim()) {
    return { ok: true, value: {} }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(textResult.text)
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body." }
  }

  const parsed = BodySchema.safeParse(parsedJson)
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Invalid cron payload." }
  }

  return { ok: true, value: parsed.data }
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

  if (!isAuthorizedCronRequest(req)) {
    return jsonResponse(
      { ok: false, error: "Unauthorized cron request." },
      401,
      rateLimit,
    )
  }

  const alertingConfig = resolveSentinelAlertingConfig()

  return jsonResponse(
    {
      ok: true,
      status: "ready",
      cronConfigured: Boolean(process.env.SENTINEL_CRON_SECRET),
      defaults: {
        maxOwnersPerRun: DEFAULT_MAX_OWNERS_PER_RUN,
        ownerLookbackHours: DEFAULT_LOOKBACK_HOURS,
      },
      alerting: {
        enabled: alertingConfig.enabled,
        webhookConfigured: alertingConfig.webhookConfigured,
        cooldownSeconds: alertingConfig.cooldownSeconds,
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

  if (!isAuthorizedCronRequest(req)) {
    return jsonResponse(
      { ok: false, error: "Unauthorized cron request." },
      401,
      rateLimit,
    )
  }

  const parsedBody = await parseCronBody(req)
  if (!parsedBody.ok) {
    return jsonResponse({ ok: false, error: parsedBody.error }, parsedBody.status, rateLimit)
  }

  const maxOwners = parsedBody.value.maxOwners || DEFAULT_MAX_OWNERS_PER_RUN
  const lookbackHours = parsedBody.value.lookbackHours || DEFAULT_LOOKBACK_HOURS
  const dryRun = parsedBody.value.dryRun === true

  const ownerUserIds = await listSentinelActiveOwnerIds({
    lookbackHours,
    maxOwners,
  })

  let ownersWithTriggeredAlerts = 0
  let triggeredCount = 0
  let sentCount = 0
  let skippedCooldownCount = 0
  let failedCount = 0
  let ownerErrorCount = 0
  const ownerResults: Array<{
    ownerUserId: string
    triggeredCount: number
    sentCount: number
    skippedCooldownCount: number
    failedCount: number
  }> = []
  const ownerErrors: Array<{ ownerUserId: string; error: string }> = []

  for (const ownerUserId of ownerUserIds) {
    try {
      const snapshot = await resolveSentinelSnapshotForOwnerService({ ownerUserId })
      const dispatch = await dispatchSentinelKpiWebhookAlerts({
        ownerUserId,
        snapshot,
        triggerSource: "cron",
        dryRun,
      })

      if (dispatch.triggeredCount > 0) {
        ownersWithTriggeredAlerts += 1
      }
      triggeredCount += dispatch.triggeredCount
      sentCount += dispatch.sentCount
      skippedCooldownCount += dispatch.skippedCooldownCount
      failedCount += dispatch.failedCount

      if (dispatch.triggeredCount > 0 || dispatch.failedCount > 0) {
        ownerResults.push({
          ownerUserId,
          triggeredCount: dispatch.triggeredCount,
          sentCount: dispatch.sentCount,
          skippedCooldownCount: dispatch.skippedCooldownCount,
          failedCount: dispatch.failedCount,
        })
      }
    } catch (err) {
      ownerErrorCount += 1
      const message = err instanceof Error ? err.message : String(err)
      ownerErrors.push({ ownerUserId, error: message })
    }
  }

  return jsonResponse(
    {
      ok: true,
      executedAt: new Date().toISOString(),
      dryRun,
      maxOwners,
      lookbackHours,
      ownersScanned: ownerUserIds.length,
      ownerErrorCount,
      ownerErrors: ownerErrors.slice(0, 20),
      ownersWithTriggeredAlerts,
      triggeredCount,
      sentCount,
      skippedCooldownCount,
      failedCount,
      ownerResults: ownerResults.slice(0, 50),
    },
    200,
    rateLimit,
  )
}
