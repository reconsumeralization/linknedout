import {
  resolveEmailAuthOrResponse
} from "@/lib/email/email-api-utils"
import {
  SendOrDraftRequestSchema,
  saveEmailDraft,
  searchEmailMessages,
  sendEmailMessage,
  toEmailErrorResponse,
} from "@/lib/email/email-data-server"
import { validateUuidParam } from "@/lib/shared/route-params"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// SENTINEL v1.0.0 — Runtime Enforcement Layer
const SENTINEL_VERSION = "1.0.0"
const SENTINEL_MODE = process.env.SENTINEL_MODE || "shadow"

// Rate limiting configuration
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "EMAIL_MESSAGES_RATE_LIMIT_MAX",
  "EMAIL_MESSAGES_RATE_LIMIT_WINDOW_MS",
  { max: 120, windowMs: 60_000 },
)
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("EMAIL_MESSAGES_MAX_BODY_BYTES", 8 * 1024 * 1024)
const MAX_QUERY_TEXT_CHARS = 1_000
const MAX_QUERY_LIMIT = 200

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Sentinel-Version": SENTINEL_VERSION,
  "X-Sentinel-Mode": SENTINEL_MODE,
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `email-messages:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function enhancedEmailApiResponse(
  payload: unknown,
  status: number = 200,
  rateLimit?: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...(rateLimit ? createRateLimitHeaders(rateLimit) : {}),
      ...(extraHeaders || {}),
    },
  })
}

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined
  }
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return undefined
}

function parseIntegerParam(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  const normalized = Math.floor(parsed)
  if (normalized < 1) {
    return 1
  }
  if (normalized > MAX_QUERY_LIMIT) {
    return MAX_QUERY_LIMIT
  }
  return normalized
}

function normalizeSearchText(value: string | null): string | undefined {
  if (!value) {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.slice(0, MAX_QUERY_TEXT_CHARS)
}

export async function GET(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)

  if (!rateLimit.allowed) {
    return enhancedEmailApiResponse(
      {
        ok: false,
        error: "rate_limit_exceeded",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      429,
      rateLimit,
    )
  }

  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  const url = new URL(req.url)
  const rawIntegrationId = url.searchParams.get("integrationId")
  let integrationId: string | undefined
  if (rawIntegrationId) {
    const integrationIdResult = validateUuidParam(rawIntegrationId, "integrationId")
    if (!integrationIdResult.ok) {
      return enhancedEmailApiResponse(
        {
          ok: false,
          error: integrationIdResult.error,
          sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
        },
        integrationIdResult.status,
        rateLimit,
      )
    }
    integrationId = integrationIdResult.value
  }
  const text = normalizeSearchText(url.searchParams.get("q") || url.searchParams.get("text"))

  try {
    const messages = await searchEmailMessages(authResult.auth, {
      integrationId,
      text,
      isDraft: parseBooleanParam(url.searchParams.get("isDraft")),
      isRead: parseBooleanParam(url.searchParams.get("isRead")),
      isStarred: parseBooleanParam(url.searchParams.get("isStarred")),
      limit: parseIntegerParam(url.searchParams.get("limit")),
    })

    return enhancedEmailApiResponse(
      {
        ok: true,
        messages,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE, status: "NOMINAL" },
        generatedAt: new Date().toISOString(),
      },
      200,
      rateLimit,
    )
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return enhancedEmailApiResponse(
      {
        ...failure.payload,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      failure.status,
      rateLimit,
    )
  }
}

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)

  if (!rateLimit.allowed) {
    return enhancedEmailApiResponse(
      {
        ok: false,
        error: "rate_limit_exceeded",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      429,
      rateLimit,
    )
  }

  const authResult = await resolveEmailAuthOrResponse(req)
  if (!authResult.auth) {
    return authResult.response
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!bodyResult.ok) {
    return enhancedEmailApiResponse(
      {
        ok: false,
        error: bodyResult.error,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      bodyResult.status,
      rateLimit,
    )
  }

  const parsed = SendOrDraftRequestSchema.safeParse(bodyResult.value)
  if (!parsed.success) {
    return enhancedEmailApiResponse(
      {
        ok: false,
        error: "Invalid send/draft request payload.",
        details: parsed.error.flatten(),
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      400,
      rateLimit,
    )
  }

  try {
    if (parsed.data.action === "send") {
      const sent = await sendEmailMessage(authResult.auth, parsed.data.payload)
      return enhancedEmailApiResponse(
        {
          ok: true,
          action: "send",
          ...sent,
          sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE, status: "NOMINAL" },
          generatedAt: new Date().toISOString(),
        },
        201,
        rateLimit,
      )
    }

    const draft = await saveEmailDraft(authResult.auth, parsed.data.payload)
    return enhancedEmailApiResponse(
      {
        ok: true,
        action: "draft",
        ...draft,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE, status: "NOMINAL" },
        generatedAt: new Date().toISOString(),
      },
      201,
      rateLimit,
    )
  } catch (error) {
    const failure = toEmailErrorResponse(error)
    return enhancedEmailApiResponse(
      {
        ...failure.payload,
        sentinel: { version: SENTINEL_VERSION, mode: SENTINEL_MODE },
      },
      failure.status,
      rateLimit,
    )
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "X-Sentinel-Version": SENTINEL_VERSION,
      "X-Sentinel-Mode": SENTINEL_MODE,
    },
  })
}
