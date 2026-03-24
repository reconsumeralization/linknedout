type RealtimeClientEventSender = (event: Record<string, unknown>) => void

export interface RealtimeFunctionCall {
  name: string
  callId: string
  arguments: unknown
}

export interface ProcessRealtimeToolCallsOptions {
  sendClientEvent: RealtimeClientEventSender
  accessToken?: string | null
  endpoint?: string
  subagent?: "supabase" | null
  dedupeWindowMs?: number
  onToolResult?: (result: unknown) => void
  onToolError?: (error: string) => void
}

type ToolCallDedupeEntry = {
  status: "pending" | "resolved"
  timestamp: number
}

const RECENT_TOOL_CALL_KEYS = new Map<string, ToolCallDedupeEntry>()
const DEFAULT_DEDUPE_WINDOW_MS = 5 * 60 * 1000
const PENDING_DEDUPE_TTL_MS = 60 * 1000

function buildCallDedupeKey(call: RealtimeFunctionCall): string {
  return `${call.callId}:${call.name}`
}

function purgeExpiredDedupeEntries(now: number, windowMs: number): void {
  for (const [key, entry] of RECENT_TOOL_CALL_KEYS.entries()) {
    const ttlMs = entry.status === "pending" ? Math.max(windowMs, PENDING_DEDUPE_TTL_MS) : windowMs
    if (now - entry.timestamp > ttlMs) {
      RECENT_TOOL_CALL_KEYS.delete(key)
    }
  }
}

function reserveCallExecution(call: RealtimeFunctionCall, windowMs: number): boolean {
  const now = Date.now()
  purgeExpiredDedupeEntries(now, windowMs)
  const dedupeKey = buildCallDedupeKey(call)
  if (RECENT_TOOL_CALL_KEYS.has(dedupeKey)) {
    return false
  }
  RECENT_TOOL_CALL_KEYS.set(dedupeKey, {
    status: "pending",
    timestamp: now,
  })
  return true
}

function markCallExecutionResolved(call: RealtimeFunctionCall): void {
  RECENT_TOOL_CALL_KEYS.set(buildCallDedupeKey(call), {
    status: "resolved",
    timestamp: Date.now(),
  })
}

function releaseCallExecutionReservation(call: RealtimeFunctionCall): void {
  RECENT_TOOL_CALL_KEYS.delete(buildCallDedupeKey(call))
}

function resolveToolEndpoint(options: ProcessRealtimeToolCallsOptions): string {
  if (options.endpoint) {
    return options.endpoint
  }
  if (options.subagent === "supabase") {
    return "/api/realtime/tools/subagents/supabase"
  }
  return "/api/realtime/tools"
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function extractFromFunctionCallDoneEvent(event: Record<string, unknown>): RealtimeFunctionCall[] {
  if (event.type !== "response.function_call_arguments.done") {
    return []
  }

  const name = toStringValue(event.name)
  const callId = toStringValue(event.call_id)
  if (!name || !callId) {
    return []
  }

  return [
    {
      name,
      callId,
      arguments: event.arguments ?? {},
    },
  ]
}

function extractFromOutputItemDoneEvent(event: Record<string, unknown>): RealtimeFunctionCall[] {
  if (event.type !== "response.output_item.done") {
    return []
  }

  const item = asRecord(event.item)
  if (!item || item.type !== "function_call") {
    return []
  }

  const name = toStringValue(item.name)
  const callId = toStringValue(item.call_id)
  if (!name || !callId) {
    return []
  }

  return [
    {
      name,
      callId,
      arguments: item.arguments ?? {},
    },
  ]
}

function extractFromResponseDoneEvent(event: Record<string, unknown>): RealtimeFunctionCall[] {
  if (event.type !== "response.done") {
    return []
  }

  const response = asRecord(event.response)
  if (!response || !Array.isArray(response.output)) {
    return []
  }

  const calls: RealtimeFunctionCall[] = []
  for (const outputItem of response.output) {
    const item = asRecord(outputItem)
    if (!item || item.type !== "function_call") {
      continue
    }
    const name = toStringValue(item.name)
    const callId = toStringValue(item.call_id)
    if (!name || !callId) {
      continue
    }
    calls.push({
      name,
      callId,
      arguments: item.arguments ?? {},
    })
  }
  return calls
}

export function extractRealtimeFunctionCalls(serverEvent: unknown): RealtimeFunctionCall[] {
  const event = asRecord(serverEvent)
  if (!event) {
    return []
  }

  return [
    ...extractFromFunctionCallDoneEvent(event),
    ...extractFromOutputItemDoneEvent(event),
    ...extractFromResponseDoneEvent(event),
  ]
}

async function postRealtimeToolCall(
  call: RealtimeFunctionCall,
  accessToken: string | null | undefined,
  endpoint: string,
): Promise<Record<string, unknown> | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      toolName: call.name,
      arguments: call.arguments,
      callId: call.callId,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== "object") {
    return null
  }
  return payload as Record<string, unknown>
}

export async function processRealtimeToolCallsFromServerEvent(
  serverEvent: unknown,
  options: ProcessRealtimeToolCallsOptions,
): Promise<void> {
  const calls = extractRealtimeFunctionCalls(serverEvent)
  if (calls.length === 0) {
    return
  }

  const endpoint = resolveToolEndpoint(options)
  const dedupeWindowMs = Math.max(1_000, options.dedupeWindowMs || DEFAULT_DEDUPE_WINDOW_MS)
  for (const call of calls) {
    if (!reserveCallExecution(call, dedupeWindowMs)) {
      continue
    }
    try {
      const payload = await postRealtimeToolCall(call, options.accessToken || null, endpoint)
      if (!payload) {
        releaseCallExecutionReservation(call)
        options.onToolError?.(`No payload from ${endpoint} for tool "${call.name}".`)
        continue
      }

      markCallExecutionResolved(call)

      const conversationItem = asRecord(payload.conversationItem)
      if (conversationItem) {
        options.sendClientEvent(conversationItem)
      }

      const followupEvent = asRecord(payload.followupEvent)
      if (followupEvent) {
        options.sendClientEvent(followupEvent)
      }

      if (payload.ok === false) {
        const error = toStringValue(payload.error) || "Tool execution failed."
        options.onToolError?.(error)
      } else {
        options.onToolResult?.(payload)
      }
    } catch (error) {
      releaseCallExecutionReservation(call)
      options.onToolError?.(
        error instanceof Error ? error.message : `Tool execution failed for "${call.name}".`,
      )
    }
  }
}

export const __testing = {
  buildCallDedupeKey,
  clearRecentToolCallDedupe(): void {
    RECENT_TOOL_CALL_KEYS.clear()
  },
}
