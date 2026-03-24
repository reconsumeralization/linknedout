import { runDueAgentSchedules } from "@/lib/agents/agent-platform-server"
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

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("AGENT_CONTROL_PLANE_CRON_MAX_BODY_BYTES", 24_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "AGENT_CONTROL_PLANE_CRON_RATE_LIMIT_MAX",
  "AGENT_CONTROL_PLANE_CRON_RATE_LIMIT_WINDOW_MS",
  { max: 30, windowMs: 60_000 },
)

const BodySchema = z.object({
  maxSchedules: z.number().int().min(1).max(200).optional(),
  dryRun: z.boolean().optional(),
})

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `agent-control-plane-cron:${clientAddress}`,
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
  const expectedSecret = process.env.AGENT_CONTROL_PLANE_CRON_SECRET
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

  return jsonResponse(
    {
      ok: true,
      status: "ready",
      cronConfigured: Boolean(process.env.AGENT_CONTROL_PLANE_CRON_SECRET),
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

  const result = await runDueAgentSchedules({
    maxSchedules: parsedBody.value.maxSchedules,
    dryRun: parsedBody.value.dryRun,
  })

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 500, rateLimit)
  }

  return jsonResponse(
    {
      ...result,
    },
    200,
    rateLimit,
  )
}
