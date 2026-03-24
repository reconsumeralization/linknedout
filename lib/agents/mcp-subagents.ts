import {
  createForbiddenResponse,
  createUnauthorizedResponse,
  getMissingScopesForTool,
} from "@/lib/auth/mcp-auth"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"
import { SUPABASE_LLM_DB_TOOL_NAMES } from "@/lib/supabase/supabase-llm-db-tools"

export type McpSubagentId = "supabase"

export interface McpSubagentProfile {
  id: McpSubagentId
  name: string
  description: string
  instructions: string
  allowedTools: string[]
  requiredScopes: string[]
  maxToolCallsPerRequest?: number
  timeoutMs?: number
  retryPolicy?: {
    maxRetries: number
    backoffMs: number
  }
}

export interface SubagentExecutionContext {
  subagentId: McpSubagentId
  profile: McpSubagentProfile
  startTime: number
  toolCallCount: number
  auth: SupabaseAuthContext | null
}

const SUPABASE_ALLOWED_TOOLS = new Set<string>(SUPABASE_LLM_DB_TOOL_NAMES)

const DEFAULT_MAX_TOOL_CALLS = 50
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_MS = 1000

const SUBAGENT_PROFILES: Record<McpSubagentId, McpSubagentProfile> = {
  supabase: {
    id: "supabase",
    name: "Supabase Secure DB Sub-Agent",
    description:
      "Restricted MCP sub-agent for secure, user-scoped Supabase logical database operations.",
    instructions:
      "Use only Supabase Rapid Fire DB tools. Never request or execute raw SQL. Keep writes minimal, validate workspace and collection IDs, and prefer read paths before mutating data.",
    allowedTools: [...SUPABASE_LLM_DB_TOOL_NAMES],
    requiredScopes: ["mcp:tools", "mcp:db:read", "mcp:db:write"],
    maxToolCallsPerRequest: 100,
    timeoutMs: 60000,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 500,
    },
  },
}

function normalizeSubagentValue(value: string | null): string | null {
  if (!value) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export function resolveMcpSubagentIdFromRequest(req: Request): McpSubagentId | null {
  const url = new URL(req.url)
  const raw =
    normalizeSubagentValue(url.searchParams.get("subagent")) ||
    normalizeSubagentValue(url.searchParams.get("agent"))

  const resolved = raw || normalizeSubagentValue(process.env.MCP_DEFAULT_SUBAGENT || null)
  if (!resolved) {
    return null
  }

  if (resolved === "supabase") {
    return "supabase"
  }

  return null
}

export function getMcpSubagentProfile(id: McpSubagentId | null): McpSubagentProfile | null {
  if (!id) {
    return null
  }
  return SUBAGENT_PROFILES[id] || null
}

export function requiresAuthenticatedSessionForSubagent(id: McpSubagentId | null): boolean {
  return id === "supabase"
}

export function isToolAllowedForSubagent(id: McpSubagentId | null, toolName: string): boolean {
  if (!id) {
    return true
  }
  if (id !== "supabase") {
    return false
  }
  return SUPABASE_ALLOWED_TOOLS.has(toolName)
}

export function filterToolsForSubagent<T extends { name: string }>(
  id: McpSubagentId | null,
  tools: T[],
): T[] {
  if (!id) {
    return tools
  }
  return tools.filter((tool) => isToolAllowedForSubagent(id, tool.name))
}

export function getSubagentInstructions(baseInstructions: string, id: McpSubagentId | null): string {
  const profile = getMcpSubagentProfile(id)
  if (!profile) {
    return baseInstructions
  }
  return `${baseInstructions}\n\nSub-agent policy:\n${profile.instructions}`
}

export function createSubagentExecutionContext(
  id: McpSubagentId,
  auth: SupabaseAuthContext | null = null,
): SubagentExecutionContext | null {
  const profile = getMcpSubagentProfile(id)
  if (!profile) {
    return null
  }
  return {
    subagentId: id,
    profile,
    startTime: Date.now(),
    toolCallCount: 0,
    auth,
  }
}

export function canExecuteToolCall(context: SubagentExecutionContext): {
  allowed: boolean
  reason?: string
} {
  const maxCalls = context.profile.maxToolCallsPerRequest ?? DEFAULT_MAX_TOOL_CALLS
  const timeoutMs = context.profile.timeoutMs ?? DEFAULT_TIMEOUT_MS

  if (context.toolCallCount >= maxCalls) {
    return {
      allowed: false,
      reason: `Maximum tool calls (${maxCalls}) exceeded for subagent "${context.subagentId}"`,
    }
  }

  const elapsed = Date.now() - context.startTime
  if (elapsed >= timeoutMs) {
    return {
      allowed: false,
      reason: `Timeout (${timeoutMs}ms) exceeded for subagent "${context.subagentId}"`,
    }
  }

  return { allowed: true }
}

export function incrementToolCallCount(context: SubagentExecutionContext): void {
  context.toolCallCount++
}

export function getRetryPolicy(id: McpSubagentId | null): {
  maxRetries: number
  backoffMs: number
} {
  const profile = getMcpSubagentProfile(id)
  return {
    maxRetries: profile?.retryPolicy?.maxRetries ?? DEFAULT_MAX_RETRIES,
    backoffMs: profile?.retryPolicy?.backoffMs ?? DEFAULT_BACKOFF_MS,
  }
}

export function getAllSubagentIds(): McpSubagentId[] {
  return Object.keys(SUBAGENT_PROFILES) as McpSubagentId[]
}

export function getAllSubagentProfiles(): McpSubagentProfile[] {
  return Object.values(SUBAGENT_PROFILES)
}

export function validateSubagentScopes(
  id: McpSubagentId | null,
  availableScopes: string[],
): { valid: boolean; missingScopes: string[] } {
  const profile = getMcpSubagentProfile(id)
  if (!profile) {
    return { valid: true, missingScopes: [] }
  }

  const scopeSet = new Set(availableScopes)
  const missingScopes = profile.requiredScopes.filter((scope) => !scopeSet.has(scope))

  return {
    valid: missingScopes.length === 0,
    missingScopes,
  }
}

/**
 * Authorize a subagent request, checking both subagent-level and tool-level scopes.
 * Returns an error Response if authorization fails, null if authorized.
 */
export function authorizeSubagentRequest(
  req: Request,
  auth: SupabaseAuthContext | null,
  subagentId: McpSubagentId,
): Response | null {
  if (!auth) {
    return createUnauthorizedResponse(req, {
      errorDescription: "Authentication required for subagent access",
    })
  }

  const validation = validateSubagentScopes(subagentId, auth.scopes)
  if (!validation.valid) {
    return createForbiddenResponse(req, validation.missingScopes)
  }

  return null
}

/**
 * Authorize a tool call within a subagent context.
 * Checks both subagent tool allowlist and per-tool scope requirements.
 */
export function authorizeSubagentToolCall(
  req: Request,
  context: SubagentExecutionContext,
  toolName: string,
): Response | null {
  // Check if tool is allowed for this subagent
  if (!isToolAllowedForSubagent(context.subagentId, toolName)) {
    return createForbiddenResponse(req, [`subagent:${context.subagentId}:tool:${toolName}`])
  }

  // Check execution limits
  const canExecute = canExecuteToolCall(context)
  if (!canExecute.allowed) {
    return new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        error_description: canExecute.reason,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  // Check tool-specific scopes if auth context is available
  if (context.auth) {
    const missingScopes = getMissingScopesForTool(context.auth, toolName)
    if (missingScopes.length > 0) {
      return createForbiddenResponse(req, missingScopes)
    }
  }

  return null
}

/**
 * Get the list of tools accessible by a subagent given the current auth context.
 */
export function getAccessibleToolsForSubagent(
  subagentId: McpSubagentId | null,
  auth: SupabaseAuthContext | null,
): string[] {
  const profile = getMcpSubagentProfile(subagentId)
  if (!profile) {
    return []
  }

  if (!auth) {
    return []
  }

  // Filter to tools that pass both subagent allowlist and scope requirements
  return profile.allowedTools.filter((toolName) => {
    const missingScopes = getMissingScopesForTool(auth, toolName)
    return missingScopes.length === 0
  })
}

/**
 * Check if a specific tool is accessible within a subagent context.
 */
export function canAccessToolInSubagent(
  subagentId: McpSubagentId | null,
  auth: SupabaseAuthContext | null,
  toolName: string,
): boolean {
  if (!isToolAllowedForSubagent(subagentId, toolName)) {
    return false
  }

  if (!auth) {
    return false
  }

  const missingScopes = getMissingScopesForTool(auth, toolName)
  return missingScopes.length === 0
}