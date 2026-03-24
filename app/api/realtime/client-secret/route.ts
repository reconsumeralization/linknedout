import { getRealtimeToolDefinitions, resolveRealtimeAuthContext } from "@/lib/realtime/realtime-tools"
import { buildAegisRealtimeInstructions, evaluateAegisModelAccess } from "@/lib/security/aegis-policy"
import {
  getMcpSubagentProfile,
  requiresAuthenticatedSessionForSubagent,
  resolveMcpSubagentIdFromRequest,
} from "@/lib/agents/mcp-subagents"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { isPrivateOrLocalHostname } from "@/lib/security/network-security"
import { z } from "zod"

export const runtime = "nodejs"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("REALTIME_CLIENT_SECRET_MAX_BODY_BYTES", 128_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "REALTIME_CLIENT_SECRET_RATE_LIMIT_MAX",
  "REALTIME_CLIENT_SECRET_RATE_LIMIT_WINDOW_MS",
  { max: 30, windowMs: 60_000 },
)
const REQUIRE_REALTIME_AUTH =
  process.env.REALTIME_REQUIRE_AUTH === "true" ||
  (process.env.REALTIME_REQUIRE_AUTH !== "false" && process.env.NODE_ENV === "production")
const ALLOW_INSECURE_UPSTREAM_IN_PROD = process.env.REALTIME_ALLOW_INSECURE_UPSTREAM === "true"
const ALLOW_PRIVATE_UPSTREAM_HOST_IN_PROD =
  process.env.REALTIME_ALLOW_PRIVATE_UPSTREAM_HOST === "true"

const RealtimeClientSecretBodySchema = z.object({
  model: z.string().min(1).max(100).optional(),
  voice: z.string().min(1).max(100).optional(),
  instructions: z.string().max(100_000).optional(),
  outputModalities: z.array(z.enum(["text", "audio"])).max(2).optional(),
  toolChoice: z.union([
    z.literal("auto"),
    z.literal("none"),
    z.literal("required"),
    z.object({
      type: z.literal("function"),
      name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/),
    }),
  ]).optional(),
  expiresAfterSeconds: z.number().int().min(60).max(3600).optional(),
})

function jsonResponse(payload: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(extraHeaders || {}),
    },
  })
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 500)
  }
  return "Unknown upstream error."
}

function truncateText(value: string, maxLength = 4000): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength)}... [truncated]`
}

async function getRateLimitResult(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `realtime-client-secret:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function getOpenAiBaseUrl(): string {
  const fallback = "https://api.openai.com"
  const raw = (process.env.OPENAI_API_BASE_URL || fallback).trim()

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return fallback
    }

    if (
      process.env.NODE_ENV === "production" &&
      !ALLOW_INSECURE_UPSTREAM_IN_PROD &&
      parsed.protocol !== "https:"
    ) {
      return fallback
    }

    if (
      process.env.NODE_ENV === "production" &&
      !ALLOW_PRIVATE_UPSTREAM_HOST_IN_PROD &&
      isPrivateOrLocalHostname(parsed.hostname)
    ) {
      return fallback
    }

    parsed.search = ""
    parsed.hash = ""
    return parsed.toString().replace(/\/+$/, "")
  } catch {
    return fallback
  }
}

function getDefaultRealtimeModel(): string {
  return process.env.OPENAI_REALTIME_MODEL || "gpt-realtime"
}

function getDefaultRealtimeVoice(): string | undefined {
  return process.env.OPENAI_REALTIME_VOICE || undefined
}

export async function POST(req: Request): Promise<Response> {
  const subagentId = resolveMcpSubagentIdFromRequest(req)
  const subagentProfile = getMcpSubagentProfile(subagentId)
  const rateLimit = await getRateLimitResult(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return jsonResponse(
      { error: "Server is missing OPENAI_API_KEY. Realtime token minting is disabled." },
      503,
      createRateLimitHeaders(rateLimit),
    )
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.error }, bodyResult.status, createRateLimitHeaders(rateLimit))
  }

  const rawBody = bodyResult.value
  const parsed = RealtimeClientSecretBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid request body.", details: parsed.error.flatten() },
      400,
      createRateLimitHeaders(rateLimit),
    )
  }

  const authContext = await resolveRealtimeAuthContext(req)
  if (REQUIRE_REALTIME_AUTH && !authContext?.isSupabaseSession) {
    return jsonResponse(
      { error: "A valid Supabase bearer token is required for realtime client secret minting." },
      401,
      createRateLimitHeaders(rateLimit),
    )
  }
  if (requiresAuthenticatedSessionForSubagent(subagentId) && !authContext?.isSupabaseSession) {
    return jsonResponse(
      { error: "A valid Supabase bearer token is required for this sub-agent." },
      401,
      createRateLimitHeaders(rateLimit),
    )
  }
  const tools = getRealtimeToolDefinitions(authContext, { subagentId })
  const expiresAfterSeconds =
    parsed.data.expiresAfterSeconds ||
    Number(process.env.OPENAI_REALTIME_EXPIRES_AFTER_SECONDS || 600)
  const chosenModel = parsed.data.model || getDefaultRealtimeModel()
  const aegisModelDecision = evaluateAegisModelAccess(chosenModel)
  if (aegisModelDecision.blocked) {
    return jsonResponse(
      {
        error: aegisModelDecision.reason || "Realtime model is not authorized by AEGIS policy.",
        code: "AEGIS_MODEL_BLOCKED",
      },
      403,
      createRateLimitHeaders(rateLimit),
    )
  }

  const sessionPayload: Record<string, unknown> = {
    type: "realtime",
    model: chosenModel,
    tool_choice: parsed.data.toolChoice || "auto",
    tools,
  }

  const voice = parsed.data.voice || getDefaultRealtimeVoice()
  if (voice) {
    sessionPayload.voice = voice
  }

  const aegisRealtimeInstructions = buildAegisRealtimeInstructions(parsed.data.instructions)
  if (aegisRealtimeInstructions) {
    sessionPayload.instructions = aegisRealtimeInstructions
  }

  if (parsed.data.outputModalities && parsed.data.outputModalities.length > 0) {
    sessionPayload.output_modalities = parsed.data.outputModalities
  }

  const payload: Record<string, unknown> = {
    session: sessionPayload,
    expires_after: {
      anchor: "created_at",
      seconds: expiresAfterSeconds,
    },
  }

  let response: Response
  try {
    response = await fetch(`${getOpenAiBaseUrl()}/v1/realtime/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to create realtime client secret.",
        upstreamStatus: null,
        upstream: normalizeErrorMessage(error),
      },
      502,
      createRateLimitHeaders(rateLimit),
    )
  }

  let rawText = ""
  try {
    rawText = await response.text()
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to create realtime client secret.",
        upstreamStatus: response.status,
        upstream: normalizeErrorMessage(error),
      },
      502,
      createRateLimitHeaders(rateLimit),
    )
  }

  const contentType = response.headers.get("content-type") || ""
  let responseBody: Record<string, unknown> = { raw: rawText }
  if (contentType.includes("application/json")) {
    try {
      responseBody = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      responseBody = { raw: rawText }
    }
  }

  if (!response.ok) {
    return jsonResponse(
      {
        error: "Failed to create realtime client secret.",
        upstreamStatus: response.status,
        upstream:
          typeof responseBody.raw === "string"
            ? { raw: truncateText(responseBody.raw) }
            : responseBody,
      },
      502,
      createRateLimitHeaders(rateLimit),
    )
  }

  return jsonResponse({
    ok: true,
    ...responseBody,
    metadata: {
      toolsRegistered: tools.length,
      supabaseToolsEnabled: authContext?.isSupabaseSession === true,
      subagent: subagentProfile
        ? {
            id: subagentProfile.id,
            name: subagentProfile.name,
            description: subagentProfile.description,
            allowedTools: subagentProfile.allowedTools,
          }
        : null,
    },
  }, 200, createRateLimitHeaders(rateLimit))
}

export async function GET(req: Request): Promise<Response> {
  const subagentId = resolveMcpSubagentIdFromRequest(req)
  const subagentProfile = getMcpSubagentProfile(subagentId)
  const rateLimit = await getRateLimitResult(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      {
        ...createRateLimitHeaders(rateLimit),
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    )
  }

  const authContext = await resolveRealtimeAuthContext(req)
  if (REQUIRE_REALTIME_AUTH && !authContext?.isSupabaseSession) {
    return jsonResponse(
      { error: "A valid Supabase bearer token is required for realtime client secret discovery." },
      401,
      createRateLimitHeaders(rateLimit),
    )
  }
  if (requiresAuthenticatedSessionForSubagent(subagentId) && !authContext?.isSupabaseSession) {
    return jsonResponse(
      { error: "A valid Supabase bearer token is required for this sub-agent." },
      401,
      createRateLimitHeaders(rateLimit),
    )
  }

  return jsonResponse(
    {
      ok: true,
      endpoint: subagentId
        ? `/api/realtime/client-secret?subagent=${subagentId}`
        : "/api/realtime/client-secret",
      subagent: subagentProfile
        ? {
            id: subagentProfile.id,
            name: subagentProfile.name,
            description: subagentProfile.description,
            allowedTools: subagentProfile.allowedTools,
          }
        : null,
      requiresOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      defaultModel: getDefaultRealtimeModel(),
    },
    200,
    createRateLimitHeaders(rateLimit),
  )
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}
