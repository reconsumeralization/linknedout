import { getRealtimeToolDefinitions, resolveRealtimeAuthContext } from "@/lib/realtime/realtime-tools"
import { buildAegisRealtimeInstructions, evaluateAegisModelAccess } from "@/lib/security/aegis-policy"
import {
  getMcpSubagentProfile,
  requiresAuthenticatedSessionForSubagent,
  resolveMcpSubagentIdFromRequest,
} from "@/lib/agents/mcp-subagents"
import {
  getMaxBodyBytesFromEnv,
  parseJsonBodyWithLimit,
  readRequestTextWithLimit,
} from "@/lib/shared/request-body"
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

const MAX_JSON_BODY_BYTES = getMaxBodyBytesFromEnv("REALTIME_SESSION_MAX_BODY_BYTES", 256_000)
const MAX_SDP_BODY_BYTES = getMaxBodyBytesFromEnv("REALTIME_SESSION_MAX_SDP_BYTES", 200_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "REALTIME_SESSION_RATE_LIMIT_MAX",
  "REALTIME_SESSION_RATE_LIMIT_WINDOW_MS",
  { max: 30, windowMs: 60_000 },
)
const REQUIRE_REALTIME_AUTH =
  process.env.REALTIME_REQUIRE_AUTH === "true" ||
  (process.env.REALTIME_REQUIRE_AUTH !== "false" && process.env.NODE_ENV === "production")
const ALLOW_INSECURE_UPSTREAM_IN_PROD = process.env.REALTIME_ALLOW_INSECURE_UPSTREAM === "true"
const ALLOW_PRIVATE_UPSTREAM_HOST_IN_PROD =
  process.env.REALTIME_ALLOW_PRIVATE_UPSTREAM_HOST === "true"

const RealtimeSessionBodySchema = z.object({
  offerSdp: z.string().min(1),
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
})

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

function sdpResponse(payload: string, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "application/sdp",
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
    key: `realtime-session:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

async function parseSessionRequest(
  req: Request,
): Promise<
  | { ok: true; value: z.infer<typeof RealtimeSessionBodySchema> }
  | { ok: false; status: number; error: string; details?: unknown }
> {
  const contentType = req.headers.get("content-type") || ""
  if (contentType.includes("application/sdp")) {
    const sdpResult = await readRequestTextWithLimit(req, MAX_SDP_BODY_BYTES)
    if (!sdpResult.ok) {
      return { ok: false, status: sdpResult.status, error: sdpResult.error }
    }
    return { ok: true, value: { offerSdp: sdpResult.text } }
  }

  const bodyResult = await parseJsonBodyWithLimit(req, MAX_JSON_BODY_BYTES)
  if (!bodyResult.ok) {
    return { ok: false, status: bodyResult.status, error: bodyResult.error }
  }

  const body = bodyResult.value
  const parsed = RealtimeSessionBodySchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Invalid session request body.",
      details: parsed.error.flatten(),
    }
  }
  return { ok: true, value: parsed.data }
}

export async function POST(req: Request): Promise<Response> {
  const subagentId = resolveMcpSubagentIdFromRequest(req)
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
      { error: "Server is missing OPENAI_API_KEY. Realtime session exchange is disabled." },
      503,
      createRateLimitHeaders(rateLimit),
    )
  }

  const parsedRequest = await parseSessionRequest(req)
  if (!parsedRequest.ok) {
    return jsonResponse(
      {
        error: parsedRequest.error,
        details: parsedRequest.details,
      },
      parsedRequest.status,
      createRateLimitHeaders(rateLimit),
    )
  }
  const requestBody = parsedRequest.value

  const authContext = await resolveRealtimeAuthContext(req)
  if (REQUIRE_REALTIME_AUTH && !authContext?.isSupabaseSession) {
    return jsonResponse(
      { error: "A valid Supabase bearer token is required for realtime session exchange." },
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
  const chosenModel = requestBody.model || getDefaultRealtimeModel()
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
    tool_choice: requestBody.toolChoice || "auto",
    tools,
  }

  const voice = requestBody.voice || getDefaultRealtimeVoice()
  if (voice) {
    sessionPayload.voice = voice
  }

  const aegisRealtimeInstructions = buildAegisRealtimeInstructions(requestBody.instructions)
  if (aegisRealtimeInstructions) {
    sessionPayload.instructions = aegisRealtimeInstructions
  }

  if (requestBody.outputModalities && requestBody.outputModalities.length > 0) {
    sessionPayload.output_modalities = requestBody.outputModalities
  }

  const upstreamBody = new FormData()
  upstreamBody.set("sdp", requestBody.offerSdp)
  upstreamBody.set("session", JSON.stringify(sessionPayload))

  let response: Response
  try {
    response = await fetch(`${getOpenAiBaseUrl()}/v1/realtime/calls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: upstreamBody,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: "OpenAI Realtime call exchange failed.",
        upstreamStatus: null,
        upstream: normalizeErrorMessage(error),
      },
      502,
      createRateLimitHeaders(rateLimit),
    )
  }

  let responseText = ""
  try {
    responseText = await response.text()
  } catch (error) {
    return jsonResponse(
      {
        error: "OpenAI Realtime call exchange failed.",
        upstreamStatus: response.status,
        upstream: normalizeErrorMessage(error),
      },
      502,
      createRateLimitHeaders(rateLimit),
    )
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      try {
        const payload = JSON.parse(responseText)
        return jsonResponse(
          {
            error: "OpenAI Realtime call exchange failed.",
            upstreamStatus: response.status,
            upstream: payload,
          },
          502,
          createRateLimitHeaders(rateLimit),
        )
      } catch {
        // Fall through to raw error response
      }
    }

    return jsonResponse(
      {
        error: "OpenAI Realtime call exchange failed.",
        upstreamStatus: response.status,
        upstream: truncateText(responseText),
      },
      502,
      createRateLimitHeaders(rateLimit),
    )
  }

  return sdpResponse(responseText, 200, createRateLimitHeaders(rateLimit))
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
      { error: "A valid Supabase bearer token is required for realtime session discovery." },
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
      endpoint: subagentId ? `/api/realtime/session?subagent=${subagentId}` : "/api/realtime/session",
      subagent: subagentProfile
        ? {
            id: subagentProfile.id,
            name: subagentProfile.name,
            description: subagentProfile.description,
            allowedTools: subagentProfile.allowedTools,
          }
        : null,
      accepts: ["application/sdp", "application/json"],
      model: getDefaultRealtimeModel(),
      requiresOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
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
