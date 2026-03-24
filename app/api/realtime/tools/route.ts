import {
  executeRealtimeTool,
  getRealtimeToolDefinitions,
  resolveRealtimeAuthContext,
} from "@/lib/realtime/realtime-tools"
import {
  getMcpSubagentProfile,
  requiresAuthenticatedSessionForSubagent,
  resolveMcpSubagentIdFromRequest,
} from "@/lib/agents/mcp-subagents"
import { shouldRequireRealtimeToolAuth } from "@/lib/security/mcp-tool-security"
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

// Constants
const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/
const SESSION_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,200}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_CALL_ID_LENGTH = 200
const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS"
const CORS_ALLOWED_HEADERS = "Content-Type, Authorization"
const CORS_ALLOW_ORIGIN =
  process.env.CORS_ALLOWED_ORIGIN ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000"
const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("REALTIME_TOOLS_MAX_BODY_BYTES", 128_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "REALTIME_TOOLS_RATE_LIMIT_MAX",
  "REALTIME_TOOLS_RATE_LIMIT_WINDOW_MS",
  { max: 120, windowMs: 60_000 },
)

// Request validation schema
const RealtimeToolRequestSchema = z.object({
  name: z.string().regex(TOOL_NAME_PATTERN).optional(),
  toolName: z.string().regex(TOOL_NAME_PATTERN).optional(),
  arguments: z.unknown().optional(),
  args: z.unknown().optional(),
  callId: z.string().max(MAX_CALL_ID_LENGTH).optional(),
  call_id: z.string().max(MAX_CALL_ID_LENGTH).optional(),
  approvalId: z.string().regex(UUID_PATTERN).optional(),
  approval_id: z.string().regex(UUID_PATTERN).optional(),
})

type RealtimeToolRequest = z.infer<typeof RealtimeToolRequestSchema>

// Response helpers
const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
  "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
}

async function getRateLimitResult(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `realtime-tools:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponseWithRateLimit(
  payload: unknown,
  status: number,
  rateLimit: RateLimitResult,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
      ...(extraHeaders || {}),
    },
  })
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: "Tool returned a non-serializable result." })
  }
}

function buildConversationItem(callId: string, output: unknown) {
  return {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: safeStringify(output),
    },
  }
}

function extractToolParams(data: RealtimeToolRequest) {
  const toolName = data.toolName ?? data.name
  const callId = data.callId ?? data.call_id ?? null
  const rawArgs = data.arguments ?? data.args
  const approvalId = data.approvalId ?? data.approval_id ?? null
  return { toolName, callId, rawArgs, approvalId }
}

function normalizeSessionId(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 200) {
    return null
  }
  return SESSION_ID_PATTERN.test(trimmed) ? trimmed : null
}

function resolveExecutionSessionId(req: Request, callId: string | null): string | null {
  return (
    normalizeSessionId(req.headers.get("x-session-id")) ||
    normalizeSessionId(req.headers.get("openai-session-id")) ||
    normalizeSessionId(req.headers.get("mcp-session-id")) ||
    normalizeSessionId(callId) ||
    null
  )
}

function resolveApprovalId(req: Request, bodyApprovalId: string | null): string | null {
  if (bodyApprovalId && UUID_PATTERN.test(bodyApprovalId)) {
    return bodyApprovalId.toLowerCase()
  }

  const headerValue =
    req.headers.get("x-sentinel-approval-id") ||
    req.headers.get("sentinel-approval-id") ||
    req.headers.get("x-approval-id")
  if (!headerValue) {
    return null
  }
  const trimmed = headerValue.trim()
  if (!UUID_PATTERN.test(trimmed)) {
    return null
  }
  return trimmed.toLowerCase()
}

// Route handlers
export async function POST(req: Request): Promise<Response> {
  const subagentId = resolveMcpSubagentIdFromRequest(req)
  const rateLimit = await getRateLimitResult(req)
  if (!rateLimit.allowed) {
    return jsonResponseWithRateLimit(
      {
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
      {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    )
  }

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return jsonResponseWithRateLimit({ error: parsedBody.error }, parsedBody.status, rateLimit)
  }

  const rawBody: unknown = parsedBody.value
  const parsed = RealtimeToolRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return jsonResponseWithRateLimit(
      { error: "Invalid realtime tool request.", details: parsed.error.flatten() },
      400,
      rateLimit,
    )
  }

  const { toolName, callId, rawArgs, approvalId } = extractToolParams(parsed.data)

  if (!toolName) {
    return jsonResponseWithRateLimit(
      { error: "Missing tool name in 'toolName' or 'name' field." },
      400,
      rateLimit,
    )
  }

  const authContext = await resolveRealtimeAuthContext(req)
  const sessionId = resolveExecutionSessionId(req, callId)
  const executionApprovalId = resolveApprovalId(req, approvalId)
  if (requiresAuthenticatedSessionForSubagent(subagentId) && !authContext?.isSupabaseSession) {
    return jsonResponseWithRateLimit(
      { error: "A valid Supabase bearer token is required for this sub-agent." },
      401,
      rateLimit,
    )
  }
  if (shouldRequireRealtimeToolAuth() && !authContext) {
    return jsonResponseWithRateLimit(
      { error: "A valid bearer token is required for realtime tool execution." },
      401,
      rateLimit,
    )
  }
  const clientAddress = getClientAddressFromRequest(req)
  const result = await executeRealtimeTool(authContext, toolName, rawArgs, {
    transport: "realtime-tools",
    clientAddress,
    sessionId: sessionId || undefined,
    subagentId,
    approvalId: executionApprovalId,
  })

  if (!result.ok) {
    const sentinelVetoed = result.statusCode === 202
    const errorPayload = {
      ok: false,
      toolName,
      callId,
      error: result.error,
      details: result.details,
      sentinel_vetoed: sentinelVetoed,
    }

    return jsonResponseWithRateLimit(
      {
        ...errorPayload,
        conversationItem: callId ? buildConversationItem(callId, errorPayload) : null,
      },
      result.statusCode ?? 400,
      rateLimit,
    )
  }

  return jsonResponseWithRateLimit(
    {
      ok: true,
      toolName,
      callId,
      output: result.output,
      conversationItem: callId ? buildConversationItem(callId, result.output) : null,
      followupEvent: { type: "response.create" },
    },
    200,
    rateLimit,
  )
}

export async function GET(req: Request): Promise<Response> {
  const subagentId = resolveMcpSubagentIdFromRequest(req)
  const subagentProfile = getMcpSubagentProfile(subagentId)
  const rateLimit = await getRateLimitResult(req)
  if (!rateLimit.allowed) {
    return jsonResponseWithRateLimit(
      {
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
      {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    )
  }

  const authContext = await resolveRealtimeAuthContext(req)
  if (requiresAuthenticatedSessionForSubagent(subagentId) && !authContext?.isSupabaseSession) {
    return jsonResponseWithRateLimit(
      { error: "A valid Supabase bearer token is required for this sub-agent." },
      401,
      rateLimit,
    )
  }
  if (shouldRequireRealtimeToolAuth() && !authContext) {
    return jsonResponseWithRateLimit(
      { error: "A valid bearer token is required for realtime tool discovery." },
      401,
      rateLimit,
    )
  }
  const tools = getRealtimeToolDefinitions(authContext, { subagentId })

  return jsonResponseWithRateLimit(
    {
      ok: true,
      tools,
      subagent: subagentProfile
        ? {
            id: subagentProfile.id,
            name: subagentProfile.name,
            description: subagentProfile.description,
            allowedTools: subagentProfile.allowedTools,
            requiredScopes: subagentProfile.requiredScopes,
          }
        : null,
      metadata: {
        total: tools.length,
        supabaseToolsEnabled: authContext?.isSupabaseSession === true,
        timestamp: new Date().toISOString(),
      },
    },
    200,
    rateLimit,
  )
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
      "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  })
}
