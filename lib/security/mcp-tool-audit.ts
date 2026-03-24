import "server-only"

import type { McpSubagentId, SubagentExecutionContext } from "@/lib/agents/mcp-subagents"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"

const TABLE = process.env.SUPABASE_MCP_AUDIT_TABLE || "mcp_tool_audit_events"
const MAX_RETRY_ATTEMPTS = 2
const RETRY_DELAY_MS = 100

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function asSafeString(value: string | undefined | null, max: number): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return trimmed.slice(0, max)
}

function asSafeNumber(value: number | undefined | null, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function sanitizeStringArray(arr: unknown, maxItems = 100, maxItemLength = 500): string[] {
  if (!Array.isArray(arr)) {
    return []
  }
  return arr
    .slice(0, maxItems)
    .map((item) => {
      if (typeof item === "string") {
        return item.slice(0, maxItemLength)
      }
      return String(item).slice(0, maxItemLength)
    })
    .filter(Boolean)
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractClientAddress(req: Request | null): string | null {
  if (!req) {
    return null
  }

  // Check common headers for client IP
  const forwardedFor = req.headers.get("x-forwarded-for")
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    const firstIp = forwardedFor.split(",")[0]?.trim()
    if (firstIp) {
      return firstIp
    }
  }

  const realIp = req.headers.get("x-real-ip")
  if (realIp) {
    return realIp.trim()
  }

  const cfConnectingIp = req.headers.get("cf-connecting-ip")
  if (cfConnectingIp) {
    return cfConnectingIp.trim()
  }

  return null
}

function extractRequestId(req: Request | null): string | null {
  if (!req) {
    return null
  }

  return (
    req.headers.get("x-request-id") ||
    req.headers.get("x-correlation-id") ||
    req.headers.get("x-trace-id") ||
    null
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuditTransport = "mcp" | "realtime-tools" | "chat" | "subagent"
export type AuditStatus = "allowed" | "blocked" | "failed" | "vetoed" | "rate_limited" | "unauthorized"

export interface McpToolAuditEventInput {
  ownerUserId?: string
  sessionId?: string
  clientAddress?: string
  transport: AuditTransport
  toolName: string
  status: AuditStatus
  blockedReason?: string
  argHash?: string
  argSizeBytes?: number
  argPreview?: string
  errorMessage?: string
  authIssuer?: string
  scopes?: string[]
  riskScore?: number
  riskLevel?: string
  manifestId?: string
  manifestHash?: string
  parentHash?: string
  injectionMatches?: string[]
  credentialAccessDetected?: boolean
  vetoed?: boolean
  executionDurationMs?: number
  subagentId?: string
  requestId?: string
  // Enhanced fields
  traceId?: string
  authMode?: "supabase" | "introspection" | "auto"
  tokenSubject?: string
  audiences?: string[]
  httpMethod?: string
  httpPath?: string
  userAgent?: string
  toolCallIndex?: number
  totalToolCalls?: number
  batchId?: string
  criticalWorkflowClass?: "none" | "destructive" | "egress"
  verificationRequired?: boolean
  verificationState?: "not_required" | "pending" | "passed" | "failed"
  verificationTargetTool?: string
  verificationSubject?: string
  verificationDueAt?: string
  verificationCheckedAt?: string
  egressPayloadBytes?: number
  egressAttachmentCount?: number
  egressThreadMessageCount?: number
  egressShapeApprovalRequired?: boolean
}

export interface AuditEventFromAuthContext {
  auth: SupabaseAuthContext | null
  req?: Request | null
  toolName: string
  status: AuditStatus
  transport?: AuditTransport
  blockedReason?: string
  errorMessage?: string
  executionDurationMs?: number
  subagentId?: McpSubagentId | null
  additionalContext?: Partial<McpToolAuditEventInput>
}

export interface AuditEventFromSubagentContext {
  context: SubagentExecutionContext
  req?: Request | null
  toolName: string
  status: AuditStatus
  blockedReason?: string
  errorMessage?: string
  executionDurationMs?: number
  additionalContext?: Partial<McpToolAuditEventInput>
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Logging Function
// ─────────────────────────────────────────────────────────────────────────────

export async function logMcpToolAuditEvent(input: McpToolAuditEventInput): Promise<void> {
  const client = getSupabaseServerClient()
  if (!client) {
    return
  }

  try {
    const basePayload = {
      owner_user_id: input.ownerUserId || null,
      session_id: asSafeString(input.sessionId, 200),
      client_address: asSafeString(input.clientAddress, 120),
      transport: input.transport,
      tool_name: asSafeString(input.toolName, 160) || "unknown",
      status: input.status,
      blocked_reason: asSafeString(input.blockedReason, 2000),
      arg_hash: asSafeString(input.argHash, 128),
      arg_size_bytes: asSafeNumber(input.argSizeBytes, 0, Number.MAX_SAFE_INTEGER),
      arg_preview: asSafeString(input.argPreview, 4000),
      error_message: asSafeString(input.errorMessage, 2000),
      auth_issuer: asSafeString(input.authIssuer, 500),
      scopes: sanitizeStringArray(input.scopes, 50, 200),
      created_at: new Date().toISOString(),
    }

    // Normalize transport and status for legacy schema compatibility
    const normalizedTransport = (() => {
      switch (input.transport) {
        case "chat":
        case "subagent":
          return "realtime-tools"
        default:
          return input.transport
      }
    })()

    const normalizedStatus = (() => {
      switch (input.status) {
        case "vetoed":
        case "rate_limited":
        case "unauthorized":
          return "blocked"
        default:
          return input.status
      }
    })()

    const legacyPayload = {
      ...basePayload,
      transport: normalizedTransport,
      status: normalizedStatus,
    }

    const sentinelPayload = {
      ...basePayload,
      risk_score: asSafeNumber(input.riskScore, 0, 100),
      risk_level: asSafeString(input.riskLevel, 32),
      manifest_id: asSafeString(input.manifestId, 200),
      manifest_hash: asSafeString(input.manifestHash, 200),
      parent_hash: asSafeString(input.parentHash, 200),
      injection_matches: sanitizeStringArray(input.injectionMatches, 20, 1000),
      credential_access_detected: Boolean(input.credentialAccessDetected),
      vetoed: Boolean(input.vetoed),
      execution_duration_ms: asSafeNumber(input.executionDurationMs, 0, Number.MAX_SAFE_INTEGER),
      subagent_id: asSafeString(input.subagentId, 100),
      request_id: asSafeString(input.requestId, 200),
      // Enhanced fields
      auth_mode: asSafeString(input.authMode, 32),
      token_subject: asSafeString(input.tokenSubject, 200),
      audiences: sanitizeStringArray(input.audiences, 10, 500),
      http_method: asSafeString(input.httpMethod, 16),
      http_path: asSafeString(input.httpPath, 500),
      user_agent: asSafeString(input.userAgent, 500),
      tool_call_index: asSafeNumber(input.toolCallIndex, 0, Number.MAX_SAFE_INTEGER),
      total_tool_calls: asSafeNumber(input.totalToolCalls, 0, Number.MAX_SAFE_INTEGER),
      batch_id: asSafeString(input.batchId, 200),
      critical_workflow_class: asSafeString(input.criticalWorkflowClass, 32) || "none",
      verification_required: Boolean(input.verificationRequired),
      verification_state: asSafeString(input.verificationState, 32) || "not_required",
      verification_target_tool: asSafeString(input.verificationTargetTool, 160),
      verification_subject: asSafeString(input.verificationSubject, 500),
      verification_due_at: asSafeString(input.verificationDueAt, 64),
      verification_checked_at: asSafeString(input.verificationCheckedAt, 64),
      egress_payload_bytes: asSafeNumber(input.egressPayloadBytes, 0, Number.MAX_SAFE_INTEGER),
      egress_attachment_count: asSafeNumber(
        input.egressAttachmentCount,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      egress_thread_message_count: asSafeNumber(
        input.egressThreadMessageCount,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      egress_shape_approval_required: Boolean(input.egressShapeApprovalRequired),
    }

    // Try sentinel schema first with retry logic
    for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const result = await client.from(TABLE).insert(sentinelPayload)
      
      if (!result.error) {
        return
      }

      const errorCode = asSafeString((result.error as { code?: string }).code, 32)
      const errorMessage = asSafeString(
        (result.error as { message?: string }).message,
        500,
      )

      // Check if it's a schema mismatch (missing column)
      const missingColumn =
        errorCode === "42703" ||
        Boolean(errorMessage && /column .* does not exist/i.test(errorMessage))

      if (missingColumn) {
        // Fall back to legacy schema
        await client.from(TABLE).insert(legacyPayload)
        return
      }

      // For transient errors, retry with backoff
      const isTransient =
        errorCode === "40001" || // serialization failure
        errorCode === "53300" || // too many connections
        errorCode === "57P03" || // cannot connect now
        Boolean(errorMessage && /timeout|connection|temporarily/i.test(errorMessage))

      if (isTransient && attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
        continue
      }

      // Non-retryable error or max retries reached, try legacy as fallback
      await client.from(TABLE).insert(legacyPayload)
      return
    }
  } catch {
    // Best-effort audit logging; do not break request path.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an audit event input from an auth context and request.
 * Extracts common fields automatically from the auth context.
 */
export function buildAuditEventFromAuth(params: AuditEventFromAuthContext): McpToolAuditEventInput {
  const { auth, req, toolName, status, transport, blockedReason, errorMessage, executionDurationMs, subagentId, additionalContext } = params

  return {
    ownerUserId: auth?.userId || undefined,
    sessionId: undefined,
    clientAddress: extractClientAddress(req ?? null) || undefined,
    transport: transport || (subagentId ? "subagent" : "mcp"),
    toolName,
    status,
    blockedReason,
    errorMessage,
    authIssuer: auth?.issuer || undefined,
    scopes: auth?.scopes || undefined,
    executionDurationMs,
    subagentId: subagentId || undefined,
    requestId: extractRequestId(req ?? null) || undefined,
    tokenSubject: auth?.userId || undefined,
    audiences: auth?.audiences || undefined,
    httpMethod: req?.method || undefined,
    httpPath: req ? new URL(req.url).pathname : undefined,
    userAgent: req?.headers.get("user-agent") || undefined,
    ...additionalContext,
  }
}

/**
 * Build an audit event input from a subagent execution context.
 * Automatically extracts subagent-specific fields.
 */
export function buildAuditEventFromSubagent(params: AuditEventFromSubagentContext): McpToolAuditEventInput {
  const { context, req, toolName, status, blockedReason, errorMessage, executionDurationMs, additionalContext } = params

  return {
    ownerUserId: context.auth?.userId || undefined,
    sessionId: undefined,
    clientAddress: extractClientAddress(req ?? null) || undefined,
    transport: "subagent",
    toolName,
    status,
    blockedReason,
    errorMessage,
    authIssuer: context.auth?.issuer || undefined,
    scopes: context.auth?.scopes || undefined,
    executionDurationMs,
    subagentId: context.subagentId,
    requestId: extractRequestId(req ?? null) || undefined,
    tokenSubject: context.auth?.userId || undefined,
    audiences: context.auth?.audiences || undefined,
    httpMethod: req?.method || undefined,
    httpPath: req ? new URL(req.url).pathname : undefined,
    userAgent: req?.headers.get("user-agent") || undefined,
    toolCallIndex: context.toolCallCount,
    totalToolCalls: context.profile.maxToolCallsPerRequest,
    ...additionalContext,
  }
}

/**
 * Log an audit event using an auth context.
 * Convenience wrapper that builds and logs in one call.
 */
export async function logAuditEventFromAuth(params: AuditEventFromAuthContext): Promise<void> {
  const input = buildAuditEventFromAuth(params)
  await logMcpToolAuditEvent(input)
}

/**
 * Log an audit event using a subagent execution context.
 * Convenience wrapper that builds and logs in one call.
 */
export async function logAuditEventFromSubagent(params: AuditEventFromSubagentContext): Promise<void> {
  const input = buildAuditEventFromSubagent(params)
  await logMcpToolAuditEvent(input)
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Logging
// ─────────────────────────────────────────────────────────────────────────────

export async function logMcpToolAuditEventBatch(
  events: McpToolAuditEventInput[],
): Promise<void> {
  if (!events.length) {
    return
  }

  // Generate a batch ID for correlation
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const eventsWithBatchId = events.map((event, index) => ({
    ...event,
    batchId,
    toolCallIndex: event.toolCallIndex ?? index,
    totalToolCalls: event.totalToolCalls ?? events.length,
  }))

  // Log events concurrently but limit concurrency to avoid overwhelming the DB
  const BATCH_SIZE = 10
  for (let i = 0; i < eventsWithBatchId.length; i += BATCH_SIZE) {
    const batch = eventsWithBatchId.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(logMcpToolAuditEvent))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialized Audit Logging Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log an authorization failure audit event.
 */
export async function logAuthorizationFailure(
  req: Request,
  auth: SupabaseAuthContext | null,
  toolName: string,
  reason: string,
  subagentId?: McpSubagentId | null,
): Promise<void> {
  await logAuditEventFromAuth({
    auth,
    req,
    toolName,
    status: "unauthorized",
    blockedReason: reason,
    subagentId,
  })
}

/**
 * Log a rate limit exceeded audit event.
 */
export async function logRateLimitExceeded(
  req: Request,
  context: SubagentExecutionContext,
  toolName: string,
  reason: string,
): Promise<void> {
  await logAuditEventFromSubagent({
    context,
    req,
    toolName,
    status: "rate_limited",
    blockedReason: reason,
  })
}

/**
 * Log a successful tool execution audit event.
 */
export async function logToolExecutionSuccess(
  req: Request,
  auth: SupabaseAuthContext | null,
  toolName: string,
  executionDurationMs: number,
  subagentId?: McpSubagentId | null,
): Promise<void> {
  await logAuditEventFromAuth({
    auth,
    req,
    toolName,
    status: "allowed",
    executionDurationMs,
    subagentId,
  })
}

/**
 * Log a tool execution failure audit event.
 */
export async function logToolExecutionFailure(
  req: Request,
  auth: SupabaseAuthContext | null,
  toolName: string,
  errorMessage: string,
  executionDurationMs?: number,
  subagentId?: McpSubagentId | null,
): Promise<void> {
  await logAuditEventFromAuth({
    auth,
    req,
    toolName,
    status: "failed",
    errorMessage,
    executionDurationMs,
    subagentId,
  })
}
