import {
  createForbiddenResponse,
  createUnauthorizedResponse,
  getMissingScopesForTool,
} from "@/lib/auth/mcp-auth"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"
import { SUPABASE_LLM_DB_TOOL_NAMES } from "@/lib/supabase/supabase-llm-db-tools"

export type McpSubagentId = string

export interface McpSubagentProfile {
  id: string
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
  subagentId: string
  profile: McpSubagentProfile
  startTime: number
  toolCallCount: number
  auth: SupabaseAuthContext | null
}

/**
 * Minimal agent definition interface for profile resolution.
 * Compatible with AgentDefinitionRecord from agent-platform-types.ts
 * (AgentDefinitionRecord extends this shape via duck typing).
 */
export interface AgentDefinition {
  id?: string
  name?: string
  purpose?: string
  description?: string
  skills?: string[]
  connectors?: string[]
  tools?: string[]
}

const SUPABASE_ALLOWED_TOOLS = new Set<string>(SUPABASE_LLM_DB_TOOL_NAMES)

const DEFAULT_MAX_TOOL_CALLS = 50
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BACKOFF_MS = 1000

const SUBAGENT_PROFILES: Map<string, McpSubagentProfile> = new Map()

// Initialize built-in profiles
function initializeBuiltInProfiles() {
  SUBAGENT_PROFILES.set("supabase", {
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
  })

  SUBAGENT_PROFILES.set("sales-intel", {
    id: "sales-intel",
    name: "Sales Intelligence Sub-Agent",
    description: "Specialized sub-agent for CRM, email, and web research tools.",
    instructions:
      "Use CRM tools to gather customer data, email tools to manage communications, and web tools for market research. Maintain data privacy and compliance with CRM policies.",
    allowedTools: [
      "crm:read_contact",
      "crm:read_account",
      "crm:read_opportunity",
      "crm:write_contact",
      "crm:write_opportunity",
      "email:read_inbox",
      "email:send_message",
      "web:search",
      "web:fetch_page",
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:crm:read",
      "mcp:crm:write",
      "mcp:email:read",
      "mcp:email:send",
      "mcp:web:read",
    ],
    maxToolCallsPerRequest: 100,
    timeoutMs: 60000,
  })

  SUBAGENT_PROFILES.set("weekly-reporter", {
    id: "weekly-reporter",
    name: "Weekly Reporter Sub-Agent",
    description: "Sub-agent for aggregating email, calendar, Slack, and document information for weekly reports.",
    instructions:
      "Collect information from email, calendar, Slack, and documents to compile comprehensive weekly reports. Summarize key meetings, updates, and action items.",
    allowedTools: [
      "email:read_inbox",
      "email:read_message",
      "calendar:read_events",
      "calendar:read_details",
      "slack:read_messages",
      "slack:read_channels",
      "docs:read_document",
      "docs:search_docs",
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:email:read",
      "mcp:calendar:read",
      "mcp:slack:read",
      "mcp:docs:read",
    ],
    maxToolCallsPerRequest: 80,
    timeoutMs: 45000,
  })

  SUBAGENT_PROFILES.set("content-clipper", {
    id: "content-clipper",
    name: "Content Clipper Sub-Agent",
    description: "Sub-agent for capturing and organizing content from YouTube, Google Drive, and Slack.",
    instructions:
      "Extract content from YouTube videos, Google Drive files, and Slack messages. Organize and save clips for future reference and sharing.",
    allowedTools: [
      "youtube:search_videos",
      "youtube:get_transcript",
      "drive:read_file",
      "drive:list_files",
      "drive:upload_file",
      "drive:create_folder",
      "slack:read_messages",
      "slack:write_message",
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:youtube:read",
      "mcp:drive:read",
      "mcp:drive:write",
      "mcp:slack:write",
    ],
    maxToolCallsPerRequest: 60,
    timeoutMs: 90000,
  })

  SUBAGENT_PROFILES.set("orchestrator", {
    id: "orchestrator",
    name: "Orchestrator Sub-Agent",
    description: "Master orchestrator with access to all tools and scopes.",
    instructions:
      "Coordinate complex workflows across all available tools. Manage sub-agent delegation, data flow, and cross-system orchestration.",
    allowedTools: [
      "*", // All tools allowed
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:crm:read",
      "mcp:crm:write",
      "mcp:email:read",
      "mcp:email:send",
      "mcp:web:read",
      "mcp:calendar:read",
      "mcp:slack:read",
      "mcp:slack:write",
      "mcp:docs:read",
      "mcp:docs:write",
      "mcp:youtube:read",
      "mcp:drive:read",
      "mcp:drive:write",
      "mcp:db:read",
      "mcp:db:write",
      "mcp:meta:read",
      "mcp:meta:write",
    ],
    maxToolCallsPerRequest: 500,
    timeoutMs: 120000,
  })

  SUBAGENT_PROFILES.set("meta-reasoner", {
    id: "meta-reasoner",
    name: "Meta-Reasoner Sub-Agent",
    description: "Sub-agent for database analysis, system evolution, and metrics computation.",
    instructions:
      "Perform deep analysis of database state, track system evolution metrics, and generate insights. Use read-only access for analysis.",
    allowedTools: [
      "db:read_schema",
      "db:query_data",
      "db:compute_stats",
      "meta:read_metrics",
      "meta:read_evolution",
      "meta:write_metrics",
      "meta:update_evolution",
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:db:read",
      "mcp:meta:read",
      "mcp:meta:write",
    ],
    maxToolCallsPerRequest: 200,
    timeoutMs: 60000,
  })

  SUBAGENT_PROFILES.set("linkedin-crm", {
    id: "linkedin-crm",
    name: "LinkedIn CRM Sub-Agent",
    description: "Sub-agent for LinkedIn profile management, tribe operations, CRM analysis, and network intelligence.",
    instructions:
      "Use LinkedIn tools for profile search, tribe formation, project management, network analysis, and outreach automation. Always validate inputs and prefer read operations before writes.",
    allowedTools: [
      "*", // LinkedIn tools are dynamically created — allow all and filter at route level
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:crm:read",
      "mcp:crm:write",
      "mcp:db:read",
      "mcp:db:write",
    ],
    maxToolCallsPerRequest: 150,
    timeoutMs: 90000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 750,
    },
  })

  SUBAGENT_PROFILES.set("sovereign", {
    id: "sovereign",
    name: "Sovereign Civilization Sub-Agent",
    description: "Sub-agent for governance proposals, marketplace, content attestation, world modeling, threat analysis, and sovereign operations.",
    instructions:
      "Execute sovereign civilization tools including governance, marketplace, knowledge operations, world modeling, security audits, and tribal infrastructure. Require approval for high-impact actions.",
    allowedTools: [
      "*", // Sovereign tools are dynamically created — allow all and filter at route level
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:db:read",
      "mcp:db:write",
      "mcp:meta:read",
      "mcp:meta:write",
    ],
    maxToolCallsPerRequest: 200,
    timeoutMs: 120000,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
    },
  })

  SUBAGENT_PROFILES.set("security-sentinel", {
    id: "security-sentinel",
    name: "Security Sentinel Sub-Agent",
    description: "Sub-agent for continuous threat detection, anomaly monitoring, compliance auditing, and security scanning.",
    instructions:
      "Monitor system for threats, detect anomalies, audit compliance, and scan for vulnerabilities. Report findings immediately. Never modify production data directly — flag issues for human review.",
    allowedTools: [
      "db:read_schema",
      "db:query_data",
      "meta:read_metrics",
      "meta:read_evolution",
    ],
    requiredScopes: [
      "mcp:tools",
      "mcp:db:read",
      "mcp:meta:read",
    ],
    maxToolCallsPerRequest: 100,
    timeoutMs: 60000,
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 500,
    },
  })
}

// Initialize on module load
initializeBuiltInProfiles()

function normalizeSubagentValue(value: string | null): string | null {
  if (!value) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

/**
 * Register a custom subagent profile dynamically.
 */
export function registerSubagentProfile(profile: McpSubagentProfile): void {
  if (!profile.id) {
    throw new Error("Profile must have an id")
  }
  SUBAGENT_PROFILES.set(profile.id, profile)
}

/**
 * Unregister a subagent profile by id.
 */
export function unregisterSubagentProfile(id: string): void {
  SUBAGENT_PROFILES.delete(id)
}

/**
 * Get a subagent profile by id.
 */
export function getSubagentProfileById(id: string): McpSubagentProfile | null {
  return SUBAGENT_PROFILES.get(id) || null
}

/**
 * Resolve the best-matching subagent profile for an agent definition.
 */
export function resolveSubagentFromAgentDefinition(agent: AgentDefinition): McpSubagentProfile | null {
  // Direct id match
  if (agent.id) {
    const profile = SUBAGENT_PROFILES.get(agent.id)
    if (profile) {
      return profile
    }
  }

  // Name-based heuristics (compatible with both AgentDefinition and AgentDefinitionRecord)
  const name = agent.name?.toLowerCase() || ""
  const description = (agent.description || agent.purpose || "").toLowerCase()
  const toolsStr = [...(agent.tools || []), ...(agent.skills || []), ...(agent.connectors || [])].join(" ").toLowerCase()

  // Check for sales/CRM keywords
  if (name.includes("sales") || name.includes("crm") || description.includes("sales")) {
    return SUBAGENT_PROFILES.get("sales-intel") || null
  }

  // Check for reporting keywords
  if (name.includes("report") || name.includes("weekly") || description.includes("aggregate")) {
    return SUBAGENT_PROFILES.get("weekly-reporter") || null
  }

  // Check for content/video keywords
  if (name.includes("content") || name.includes("clip") || toolsStr.includes("youtube")) {
    return SUBAGENT_PROFILES.get("content-clipper") || null
  }

  // Check for orchestration keywords
  if (name.includes("orchestrat") || name.includes("master") || name.includes("coordinator")) {
    return SUBAGENT_PROFILES.get("orchestrator") || null
  }

  // Check for analysis/metrics keywords
  if (name.includes("meta") || name.includes("reason") || name.includes("analyz")) {
    return SUBAGENT_PROFILES.get("meta-reasoner") || null
  }

  // Check for LinkedIn/CRM keywords
  if (name.includes("linkedin") || name.includes("crm") || name.includes("profile") || name.includes("tribe") || description.includes("linkedin") || description.includes("network")) {
    return SUBAGENT_PROFILES.get("linkedin-crm") || null
  }

  // Check for sovereign/governance keywords
  if (name.includes("sovereign") || name.includes("govern") || name.includes("marketplace") || description.includes("sovereign") || description.includes("governance")) {
    return SUBAGENT_PROFILES.get("sovereign") || null
  }

  // Check for security/sentinel keywords
  if (name.includes("secur") || name.includes("sentinel") || name.includes("threat") || description.includes("security") || description.includes("compliance")) {
    return SUBAGENT_PROFILES.get("security-sentinel") || null
  }

  // Default to supabase
  return SUBAGENT_PROFILES.get("supabase") || null
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

  // Return resolved id if profile exists
  if (SUBAGENT_PROFILES.has(resolved)) {
    return resolved
  }

  return null
}

export function getMcpSubagentProfile(id: McpSubagentId | null): McpSubagentProfile | null {
  if (!id) {
    return null
  }
  return SUBAGENT_PROFILES.get(id) || null
}

export function requiresAuthenticatedSessionForSubagent(id: McpSubagentId | null): boolean {
  if (!id) {
    return false
  }
  const profile = SUBAGENT_PROFILES.get(id)
  return profile ? profile.requiredScopes.length > 0 : false
}

export function isToolAllowedForSubagent(id: McpSubagentId | null, toolName: string): boolean {
  if (!id) {
    return true
  }
  const profile = SUBAGENT_PROFILES.get(id)
  if (!profile) {
    return false
  }
  // If wildcard is in allowed tools, all tools are allowed
  if (profile.allowedTools.includes("*")) {
    return true
  }
  return profile.allowedTools.includes(toolName) || SUPABASE_ALLOWED_TOOLS.has(toolName)
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

export function getAllSubagentIds(): string[] {
  return Array.from(SUBAGENT_PROFILES.keys())
}

export function getAllSubagentProfiles(): McpSubagentProfile[] {
  return Array.from(SUBAGENT_PROFILES.values())
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