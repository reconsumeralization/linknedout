import { evaluateAegisToolPolicy } from "@/lib/security/aegis-policy"
import { generateC2PAManifest } from "@/lib/security/c2pa-manifest"
import { createLinkedinTools } from "@/lib/linkedin/linkedin-tools"
import { createLinkedinWorkflowTools } from "@/lib/linkedin/linkedin-workflow-tools"
import { createUserScopedClient } from "@/lib/supabase/supabase"
import {
  getVerificationToolForAction,
  resolveCriticalWorkflowContext,
} from "@/lib/security/critical-workflow-policy"
import {
  findPendingVerifications,
  markVerificationResult,
} from "@/lib/security/critical-verification-store"
import { canAccessTool, getRequiredScopesForTool } from "@/lib/auth/mcp-auth"
import { resolveMcpAuthContextFromRequest } from "@/lib/auth/mcp-request-auth"
import {
  filterToolsForSubagent,
  isToolAllowedForSubagent,
  type McpSubagentId,
} from "@/lib/agents/mcp-subagents"
import { logMcpToolAuditEvent } from "@/lib/security/mcp-tool-audit"
import {
  getDataEgressToolRateLimitPerMinuteForTool,
  getDataEgressToolRateLimitWindowMs,
  inspectDataEgressWorkflowShape,
  inspectDataEgressRisk,
  isDestructiveToolByPolicy,
  inspectToolArgumentsForInjection,
  isDataEgressToolAllowedByPolicy,
  isDataEgressToolByPolicy,
  isPrivilegedToolByPolicy,
  isToolAllowedByPolicy,
  sanitizeToolDescription,
  shouldRequireDestructiveToolApproval,
  shouldRequireEgressShapeApproval,
  shouldEnforceDataEgressDlp,
  shouldRequirePrivilegedToolApproval,
  summarizeToolArgs,
} from "@/lib/security/mcp-tool-security"
import { checkRateLimit, createRateLimitKey, type RateLimitResult } from "@/lib/shared/request-rate-limit"
import {
  consumeSentinelVetoApprovalForExecution,
  createSentinelVetoApproval,
  resolveManifestParentHashForExecution,
} from "@/lib/sentinel/sentinel-data"
import {
  computeToolRiskScore,
  detectCredentialAccess,
  getVetoGateConfig,
  vetoGateCheck,
} from "@/lib/sentinel/sentinel-engine"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"
import { createSupabaseLlmDbTools } from "@/lib/supabase/supabase-llm-db-tools"
import { createSovereignTools } from "@/lib/sovereign/sovereign-tools"
import { createWebSearchTools } from "@/lib/shared/web-search-tools"
import { z } from "zod"

// ============================================================================
// Type Definitions
// ============================================================================

type ToolLike = {
  description?: string
  inputSchema?: unknown
  execute?: (...args: unknown[]) => Promise<unknown> | unknown
}

export type RealtimeFunctionToolDefinition = {
  type: "function"
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolExecutionResult =
  | { ok: true; output: unknown; metadata?: ToolExecutionMetadata }
  | { ok: false; error: string; details?: unknown; statusCode?: number; metadata?: ToolExecutionMetadata }

export type ToolExecutionMetadata = {
  executionTimeMs: number
  toolName: string
  riskScore: number
  riskLevel: RiskLevel
  manifestId?: string
  traceId?: string
}

export type ToolExecutionContext = {
  transport?: "mcp" | "realtime-tools" | "chat"
  sessionId?: string
  clientAddress?: string
  subagentId?: McpSubagentId | null
  approvalId?: string | null
  traceId?: string
  timeout?: number
  retryAttempt?: number
}

export type RiskLevel = "low" | "medium" | "high" | "critical"

export type ToolRegistryOptions = {
  subagentId?: McpSubagentId | null
  includeDisabled?: boolean
  filterByScope?: string[]
}

// ============================================================================
// Constants
// ============================================================================

const TOOL_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{1,63}$/
const APPROVAL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const APPROVAL_ARG_KEYS = new Set([
  "approvalid",
  "approval_id",
  "sentinelapprovalid",
  "sentinel_approval_id",
  "__sentinelapprovalid",
  "__sentinel_approval_id",
])

const DEFAULT_TOOL_DESCRIPTION = "Tool callable by the realtime assistant."
const MAX_INJECTION_REASONS_TO_DISPLAY = 5
const MAX_DLP_REASONS_TO_DISPLAY = 5
const DEFAULT_TOOL_TIMEOUT_MS = 30000
const MAX_RETRY_ATTEMPTS = 3

// Risk score thresholds
const RISK_THRESHOLD_CRITICAL = 80
const RISK_THRESHOLD_HIGH = 60
const RISK_THRESHOLD_MEDIUM = 35

// Minimum risk scores for specific scenarios
const MIN_RISK_SCORE_DATA_EGRESS = 65
const MIN_RISK_SCORE_PRIVILEGED = 55

// ============================================================================
// Error Classes
// ============================================================================

export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
    public readonly isRetryable: boolean = false,
  ) {
    super(message)
    this.name = "ToolExecutionError"
  }
}

export class ToolTimeoutError extends ToolExecutionError {
  constructor(toolName: string, timeoutMs: number) {
    super(`Tool '${toolName}' execution timed out after ${timeoutMs}ms`, 408, undefined, true)
    this.name = "ToolTimeoutError"
  }
}

export class ToolValidationError extends ToolExecutionError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details, false)
    this.name = "ToolValidationError"
  }
}

export class ToolAuthorizationError extends ToolExecutionError {
  constructor(message: string, details?: unknown) {
    super(message, 403, details, false)
    this.name = "ToolAuthorizationError"
  }
}

export class ToolNotFoundError extends ToolExecutionError {
  constructor(toolName: string) {
    super(`Tool '${toolName}' not found in registry`, 404, undefined, false)
    this.name = "ToolNotFoundError"
  }
}

export class ToolPolicyBlockedError extends ToolExecutionError {
  constructor(toolName: string, policyType: string) {
    super(`Tool '${toolName}' blocked by ${policyType} policy`, 403, { policyType }, false)
    this.name = "ToolPolicyBlockedError"
  }
}

// ============================================================================
// Zod Schema Utilities
// ============================================================================

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapSchema(schema.unwrap())
  }
  if (schema instanceof z.ZodDefault) {
    return unwrapSchema(schema.removeDefault())
  }
  if (schema instanceof z.ZodCatch) {
    return unwrapSchema(schema._def.innerType)
  }
  if (schema instanceof z.ZodEffects) {
    return unwrapSchema(schema.innerType())
  }
  return schema
}

function asZodSchema(schema: unknown): z.ZodTypeAny | null {
  return schema instanceof z.ZodType ? schema : null
}

function hasSafeParse(
  schema: unknown,
): schema is { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: unknown } } {
  return Boolean(schema && typeof (schema as Record<string, unknown>).safeParse === "function")
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const unwrapped = unwrapSchema(schema)

  if (unwrapped instanceof z.ZodString) {
    const checks = (unwrapped as z.ZodString)._def.checks || []
    const result: Record<string, unknown> = { type: "string" }
    for (const check of checks) {
      if (check.kind === "min") result.minLength = check.value
      if (check.kind === "max") result.maxLength = check.value
      if (check.kind === "email") result.format = "email"
      if (check.kind === "url") result.format = "uri"
      if (check.kind === "uuid") result.format = "uuid"
      if (check.kind === "regex") result.pattern = check.regex.source
    }
    return result
  }

  if (unwrapped instanceof z.ZodNumber) {
    const checks = (unwrapped as z.ZodNumber)._def.checks || []
    const result: Record<string, unknown> = { type: "number" }
    for (const check of checks) {
      if (check.kind === "min") result.minimum = check.value
      if (check.kind === "max") result.maximum = check.value
      if (check.kind === "int") result.type = "integer"
    }
    return result
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return { type: "boolean" }
  }

  if (unwrapped instanceof z.ZodNull) {
    return { type: "null" }
  }

  if (unwrapped instanceof z.ZodLiteral) {
    return { const: unwrapped.value }
  }

  if (unwrapped instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: unwrapped.options,
    }
  }

  if (unwrapped instanceof z.ZodNativeEnum) {
    const values = Object.values(unwrapped.enum)
    return {
      enum: values,
    }
  }

  if (unwrapped instanceof z.ZodArray) {
    const result: Record<string, unknown> = {
      type: "array",
      items: zodToJsonSchema(unwrapped.element),
    }
    const minLength = unwrapped._def.minLength
    const maxLength = unwrapped._def.maxLength
    if (minLength !== null) result.minItems = minLength.value
    if (maxLength !== null) result.maxItems = maxLength.value
    return result
  }

  if (unwrapped instanceof z.ZodTuple) {
    return {
      type: "array",
      items: unwrapped.items.map((item: z.ZodTypeAny) => zodToJsonSchema(item)),
      minItems: unwrapped.items.length,
      maxItems: unwrapped.items.length,
    }
  }

  if (unwrapped instanceof z.ZodRecord) {
    return {
      type: "object",
      additionalProperties: zodToJsonSchema(unwrapped.valueSchema),
    }
  }

  if (unwrapped instanceof z.ZodMap) {
    return {
      type: "object",
      additionalProperties: zodToJsonSchema(unwrapped._def.valueType),
    }
  }

  if (unwrapped instanceof z.ZodSet) {
    return {
      type: "array",
      items: zodToJsonSchema(unwrapped._def.valueType),
      uniqueItems: true,
    }
  }

  if (unwrapped instanceof z.ZodUnion) {
    return {
      anyOf: unwrapped.options.map((option: z.ZodTypeAny) => zodToJsonSchema(option)),
    }
  }

  if (unwrapped instanceof z.ZodDiscriminatedUnion) {
    return {
      oneOf: [...unwrapped.options.values()].map((option: z.ZodTypeAny) => zodToJsonSchema(option)),
      discriminator: { propertyName: unwrapped.discriminator },
    }
  }

  if (unwrapped instanceof z.ZodIntersection) {
    return {
      allOf: [
        zodToJsonSchema(unwrapped._def.left),
        zodToJsonSchema(unwrapped._def.right),
      ],
    }
  }

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, child] of Object.entries(shape)) {
      const isOptional =
        child instanceof z.ZodOptional ||
        child instanceof z.ZodDefault ||
        child instanceof z.ZodCatch
      properties[key] = zodToJsonSchema(child as z.ZodTypeAny)
      if (!isOptional) {
        required.push(key)
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
    }
  }

  return {
    type: "object",
    additionalProperties: true,
  }
}

// ============================================================================
// Tool Name and Description Utilities
// ============================================================================

function normalizeToolName(name: string): string | null {
  if (!name || typeof name !== "string") {
    return null
  }
  const trimmed = name.trim()
  if (!TOOL_NAME_REGEX.test(trimmed)) {
    return null
  }
  return trimmed
}

function safeToolDescription(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_TOOL_DESCRIPTION
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return DEFAULT_TOOL_DESCRIPTION
  }
  return sanitizeToolDescription(trimmed)
}

// ============================================================================
// Argument Processing Utilities
// ============================================================================

function normalizeArguments(raw: unknown): unknown {
  if (typeof raw === "string") {
    if (!raw.trim()) {
      return {}
    }
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw
  }
  if (Array.isArray(raw)) {
    return { _arrayArgs: raw }
  }
  return {}
}

function normalizeApprovalId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || !APPROVAL_ID_PATTERN.test(trimmed)) {
    return null
  }
  return trimmed.toLowerCase()
}

function extractApprovalFromArgs(input: unknown): { args: unknown; approvalId: string | null } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { args: input, approvalId: null }
  }

  const source = input as Record<string, unknown>
  const next: Record<string, unknown> = {}
  let approvalId: string | null = null

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.replace(/[\s_-]/g, "").toLowerCase()
    if (APPROVAL_ARG_KEYS.has(normalizedKey)) {
      const candidate = normalizeApprovalId(value)
      if (candidate) {
        approvalId = candidate
      }
      continue
    }
    next[key] = value
  }

  return { args: next, approvalId }
}

// ============================================================================
// Risk Assessment Utilities
// ============================================================================

function toRiskLevelFromScore(score: number): RiskLevel {
  if (score >= RISK_THRESHOLD_CRITICAL) {
    return "critical"
  }
  if (score >= RISK_THRESHOLD_HIGH) {
    return "high"
  }
  if (score >= RISK_THRESHOLD_MEDIUM) {
    return "medium"
  }
  return "low"
}

function computeApprovalRiskScore(
  baseRiskScore: number,
  isPrivileged: boolean,
  isDataEgress: boolean,
): number {
  if (isPrivileged || isDataEgress) {
    const minScore = isDataEgress ? MIN_RISK_SCORE_DATA_EGRESS : MIN_RISK_SCORE_PRIVILEGED
    return Math.max(baseRiskScore, minScore)
  }
  return baseRiskScore
}

function shouldRetryExecution(error: unknown, attempt: number): boolean {
  if (attempt >= MAX_RETRY_ATTEMPTS) {
    return false
  }
  if (error instanceof ToolTimeoutError) {
    return true
  }
  if (error instanceof ToolExecutionError && error.isRetryable) {
    return true
  }
  return false
}

// ============================================================================
// Tool Registry Functions
// ============================================================================

export function getRealtimeToolRegistry(
  authContext: SupabaseAuthContext | null,
): Record<string, ToolLike> {
  const linkedinTools = createLinkedinTools(authContext)
  const workflowTools = (() => {
    if (!authContext?.isSupabaseSession || !authContext.userId) return {} as Record<string, ToolLike>
    const wfClient = createUserScopedClient(authContext.accessToken)
    if (!wfClient) return {} as Record<string, ToolLike>
    return createLinkedinWorkflowTools(wfClient, authContext.userId) as Record<string, ToolLike>
  })()
  const supabaseTools =
    authContext?.isSupabaseSession === true
      ? (createSupabaseLlmDbTools(authContext) as Record<string, ToolLike>)
      : ({} as Record<string, ToolLike>)
  const webSearchTools = createWebSearchTools() as Record<string, ToolLike>
  const sovereignTools = authContext?.isSupabaseSession === true
    ? (createSovereignTools(authContext) as Record<string, ToolLike>)
    : ({} as Record<string, ToolLike>)
  return {
    ...linkedinTools,
    ...workflowTools,
    ...supabaseTools,
    ...webSearchTools,
    ...sovereignTools,
  } as Record<string, ToolLike>
}

export function getRealtimeExecutableToolRegistry(
  authContext: SupabaseAuthContext | null,
  options?: ToolRegistryOptions,
): Record<string, ToolLike> {
  const registry = getRealtimeToolRegistry(authContext)
  const entries = Object.entries(registry).filter(([name, tool]) => {
    const normalizedName = normalizeToolName(name)
    if (!normalizedName || !tool || typeof tool.execute !== "function") {
      return false
    }
    if (!options?.includeDisabled && !isToolAllowedByPolicy(normalizedName)) {
      return false
    }
    if (!canAccessTool(authContext, normalizedName)) {
      return false
    }
    if (options?.filterByScope && options.filterByScope.length > 0) {
      const requiredScopes = getRequiredScopesForTool(normalizedName)
      const hasMatchingScope = requiredScopes.some((scope) =>
        options.filterByScope!.includes(scope),
      )
      if (!hasMatchingScope && requiredScopes.length > 0) {
        return false
      }
    }
    return isToolAllowedForSubagent(options?.subagentId || null, normalizedName)
  })

  return Object.fromEntries(entries)
}

export function getRealtimeToolDefinitions(
  authContext: SupabaseAuthContext | null,
  options?: ToolRegistryOptions,
): RealtimeFunctionToolDefinition[] {
  const registry = getRealtimeExecutableToolRegistry(authContext, options)
  const definitions: RealtimeFunctionToolDefinition[] = []

  for (const [name, tool] of Object.entries(registry)) {
    const normalizedName = normalizeToolName(name)
    if (!normalizedName || !tool || typeof tool.execute !== "function") {
      continue
    }
    if (!isToolAllowedByPolicy(normalizedName)) {
      continue
    }

    const zodSchema = asZodSchema(tool.inputSchema)
    const parameters = zodSchema
      ? zodToJsonSchema(zodSchema)
      : {
          type: "object",
          additionalProperties: true,
        }

    definitions.push({
      type: "function",
      name: normalizedName,
      description: safeToolDescription(tool.description),
      parameters,
    })
  }

  return filterToolsForSubagent(options?.subagentId || null, definitions).filter((definition) =>
    canAccessTool(authContext, definition.name),
  )
}

export function getToolDefinitionByName(
  authContext: SupabaseAuthContext | null,
  toolName: string,
): RealtimeFunctionToolDefinition | null {
  const normalizedName = normalizeToolName(toolName)
  if (!normalizedName) {
    return null
  }
  const definitions = getRealtimeToolDefinitions(authContext)
  return definitions.find((def) => def.name === normalizedName) || null
}

// ============================================================================
// Tool Execution Security Context
// ============================================================================

interface SecurityContext {
  normalizedName: string
  sanitizedArgs: unknown
  executionApprovalId: string | null
  privilegedApprovalRequired: boolean
  destructiveTool: boolean
  destructiveApprovalRequired: boolean
  dataEgressTool: boolean
  dataEgressAllowedByPolicy: boolean
  dataEgressApprovalRequired: boolean
  dataEgressShape: {
    payloadByteSize: number
    attachmentCount: number
    threadMessageCount: number
    thresholdExceeded: boolean
    reasons: string[]
  }
  egressShapeApprovalRequired: boolean
  criticalWorkflowContext: ReturnType<typeof resolveCriticalWorkflowContext>
  argInspection: { blocked: boolean; reasons: string[] }
  dataEgressRisk: { flagged: boolean; reasons: string[] }
  argSummary: { argHash: string; argSizeBytes: number; redactedPreview: string }
  credentialAccessDetected: boolean
  effectiveRiskScore: number
  vetoResult: { shouldVeto: boolean; riskLevel: RiskLevel; reasons: string[] }
  vetoConfig: ReturnType<typeof getVetoGateConfig>
  transport: "mcp" | "realtime-tools" | "chat"
  isAuthenticated: boolean
}

function buildSecurityContext(
  normalizedName: string,
  rawArgs: unknown,
  context: ToolExecutionContext | undefined,
  approvalIdOverride: string | null,
  authContext: SupabaseAuthContext | null,
): SecurityContext {
  const transport = context?.transport || "realtime-tools"
  const normalizedArgs = normalizeArguments(rawArgs)
  const approvalFromArgs = extractApprovalFromArgs(normalizedArgs)
  const executionApprovalId =
    normalizeApprovalId(approvalIdOverride) || approvalFromArgs.approvalId
  const sanitizedArgs = approvalFromArgs.args
  const isAuthenticated = Boolean(authContext?.userId)

  const criticalWorkflowContext = resolveCriticalWorkflowContext(normalizedName, sanitizedArgs)
  const privilegedApprovalRequired =
    shouldRequirePrivilegedToolApproval() && isPrivilegedToolByPolicy(normalizedName)
  const destructiveTool = isDestructiveToolByPolicy(normalizedName)
  const destructiveApprovalRequired =
    shouldRequireDestructiveToolApproval() && destructiveTool
  const dataEgressTool = isDataEgressToolByPolicy(normalizedName)
  const dataEgressAllowedByPolicy = isDataEgressToolAllowedByPolicy(normalizedName)
  const argInspection = inspectToolArgumentsForInjection(sanitizedArgs)
  const dataEgressRisk = inspectDataEgressRisk(sanitizedArgs)
  const dataEgressApprovalRequired = dataEgressTool && dataEgressRisk.flagged
  const dataEgressShape = inspectDataEgressWorkflowShape(sanitizedArgs)
  const egressShapeApprovalRequired =
    dataEgressTool && shouldRequireEgressShapeApproval() && dataEgressShape.thresholdExceeded
  const argSummary = summarizeToolArgs(sanitizedArgs)
  const credentialAccessDetected = detectCredentialAccess(sanitizedArgs)

  const riskScore = computeToolRiskScore({
    toolName: normalizedName,
    injectionMatches: argInspection.reasons,
    credentialAccessDetected,
    argSizeBytes: argSummary.argSizeBytes,
    transport,
    isAuthenticated,
  })
  const effectiveRiskScore = dataEgressApprovalRequired
    ? Math.max(riskScore, MIN_RISK_SCORE_DATA_EGRESS)
    : riskScore

  const vetoConfig = getVetoGateConfig()
  const vetoResult = vetoGateCheck({
    riskScore: effectiveRiskScore,
    injectionMatches: argInspection.reasons,
    credentialAccessDetected,
    config: vetoConfig,
  })

  return {
    normalizedName,
    sanitizedArgs,
    executionApprovalId,
    privilegedApprovalRequired,
    destructiveTool,
    destructiveApprovalRequired,
    dataEgressTool,
    dataEgressAllowedByPolicy,
    dataEgressApprovalRequired,
    dataEgressShape,
    egressShapeApprovalRequired,
    criticalWorkflowContext,
    argInspection,
    dataEgressRisk,
    argSummary,
    credentialAccessDetected,
    effectiveRiskScore,
    vetoResult,
    vetoConfig,
    transport,
    isAuthenticated,
  }
}

// ============================================================================
// Audit Logging Helper
// ============================================================================

interface AuditLogInput {
  toolNameForLog: string
  status: "allowed" | "blocked" | "failed" | "vetoed"
  blockedReason?: string
  errorMessage?: string
  vetoed: boolean
  criticalWorkflowClass?: "none" | "destructive" | "egress"
  verificationRequired?: boolean
  verificationState?: "not_required" | "pending" | "passed" | "failed"
  verificationTargetTool?: string | null
  verificationSubject?: string | null
  verificationDueAt?: string | null
  verificationCheckedAt?: string | null
}

async function createAuditLogger(
  authContext: SupabaseAuthContext | null,
  securityContext: SecurityContext,
  context: ToolExecutionContext | undefined,
) {
  return async (input: AuditLogInput) => {
    const defaultCriticalWorkflowClass: "none" | "destructive" | "egress" =
      securityContext.dataEgressTool
        ? "egress"
        : securityContext.criticalWorkflowContext.workflowClass

    const parentHash = await resolveManifestParentHashForExecution({
      ownerUserId: authContext?.userId,
      sessionId: context?.sessionId || null,
    })

    const manifest = generateC2PAManifest({
      toolName: input.toolNameForLog,
      transport: securityContext.transport,
      argHash: securityContext.argSummary.argHash,
      actorId: authContext?.userId || "anonymous",
      sessionId: context?.sessionId || null,
      riskScore: securityContext.effectiveRiskScore,
      vetoed: input.vetoed,
      injectionMatches: securityContext.argInspection.reasons,
      credentialAccessDetected: securityContext.credentialAccessDetected,
      parentHash,
    })

    await logMcpToolAuditEvent({
      ownerUserId: authContext?.userId,
      sessionId: context?.sessionId,
      clientAddress: context?.clientAddress,
      transport: securityContext.transport,
      toolName: input.toolNameForLog,
      status: input.status,
      blockedReason: input.blockedReason,
      argHash: securityContext.argSummary.argHash,
      argSizeBytes: securityContext.argSummary.argSizeBytes,
      argPreview: securityContext.argSummary.redactedPreview,
      errorMessage: input.errorMessage,
      authIssuer: authContext?.issuer || undefined,
      scopes: authContext?.scopes || [],
      riskScore: securityContext.effectiveRiskScore,
      riskLevel: securityContext.vetoResult.riskLevel,
      manifestId: manifest.manifestId,
      manifestHash: manifest.manifestHash,
      parentHash: manifest.parentHash || undefined,
      injectionMatches: securityContext.argInspection.reasons,
      credentialAccessDetected: securityContext.credentialAccessDetected,
      vetoed: input.vetoed,
      traceId: context?.traceId,
      criticalWorkflowClass: input.criticalWorkflowClass || defaultCriticalWorkflowClass,
      verificationRequired: Boolean(input.verificationRequired),
      verificationState: input.verificationState || "not_required",
      verificationTargetTool:
        input.verificationTargetTool ||
        securityContext.criticalWorkflowContext.targetToolName ||
        undefined,
      verificationSubject:
        input.verificationSubject || securityContext.criticalWorkflowContext.subject || undefined,
      verificationDueAt: input.verificationDueAt || undefined,
      verificationCheckedAt: input.verificationCheckedAt || undefined,
      egressPayloadBytes: securityContext.dataEgressShape.payloadByteSize,
      egressAttachmentCount: securityContext.dataEgressShape.attachmentCount,
      egressThreadMessageCount: securityContext.dataEgressShape.threadMessageCount,
      egressShapeApprovalRequired: securityContext.egressShapeApprovalRequired,
    })

    return manifest
  }
}

type VerificationOutcome = {
  targetTool: string
  subject: string | null
  verified: boolean
  evidence: unknown
}

function buildVerificationDueAtIso(windowSeconds: number): string {
  const normalizedWindow = Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 120
  return new Date(Date.now() + normalizedWindow * 1000).toISOString()
}

function extractVerificationOutcome(output: unknown): VerificationOutcome | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null
  }

  const container = output as Record<string, unknown>
  const verification =
    container.verification && typeof container.verification === "object" && !Array.isArray(container.verification)
      ? (container.verification as Record<string, unknown>)
      : null

  if (!verification) {
    return null
  }

  const targetTool =
    typeof verification.targetTool === "string" ? verification.targetTool.trim() : ""
  if (!targetTool) {
    return null
  }

  const verified = verification.verified === true
  const subject =
    typeof verification.subject === "string" && verification.subject.trim()
      ? verification.subject.trim()
      : null

  return {
    targetTool,
    subject,
    verified,
    evidence: verification.evidence ?? null,
  }
}

async function checkDataEgressToolRateLimit(
  authContext: SupabaseAuthContext | null,
  securityContext: SecurityContext,
  context: ToolExecutionContext | undefined,
): Promise<RateLimitResult | null> {
  if (!securityContext.dataEgressTool) {
    return null
  }

  const limitPerMinute = getDataEgressToolRateLimitPerMinuteForTool(securityContext.normalizedName)
  if (!Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
    return null
  }

  const windowMs = getDataEgressToolRateLimitWindowMs()
  const actorKey =
    authContext?.userId ||
    context?.clientAddress ||
    context?.sessionId ||
    "anonymous"
  const key = createRateLimitKey(
    "egress-tool",
    securityContext.transport,
    securityContext.normalizedName,
    actorKey,
  )

  const result = await checkRateLimit({
    key,
    max: limitPerMinute,
    windowMs,
  })

  if (result.allowed) {
    return null
  }

  return result
}

// ============================================================================
// Tool Execution with Timeout
// ============================================================================

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new ToolTimeoutError(toolName, timeoutMs))
    }, timeoutMs)

    fn()
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

// ============================================================================
// Tool Execution Metrics
// ============================================================================

interface ExecutionMetrics {
  startTime: number
  getElapsedMs: () => number
}

function createExecutionMetrics(): ExecutionMetrics {
  const startTime = performance.now()
  return {
    startTime,
    getElapsedMs: () => performance.now() - startTime,
  }
}

// ============================================================================
// Main Tool Execution Function
// ============================================================================

export async function executeRealtimeTool(
  authContext: SupabaseAuthContext | null,
  toolName: string,
  rawArgs: unknown,
  context?: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const metrics = createExecutionMetrics()
  const registry = getRealtimeToolRegistry(authContext)
  const normalizedName = normalizeToolName(toolName)

  // Build a minimal security context for logging even if tool name is invalid

  if (!normalizedName) {
    const minimalSecurityContext = buildSecurityContext(
      "invalid",
      rawArgs,
      context,
      context?.approvalId || null,
      authContext,
    )
    const logWithSentinel = await createAuditLogger(authContext, minimalSecurityContext, context)

    await logWithSentinel({
      toolNameForLog: "invalid",
      status: "blocked",
      blockedReason: "Invalid tool name.",
      vetoed: false,
    })
    return { ok: false, error: "Invalid tool name." }
  }

  const securityContext = buildSecurityContext(
    normalizedName,
    rawArgs,
    context,
    context?.approvalId || null,
    authContext,
  )
  const logWithSentinel = await createAuditLogger(authContext, securityContext, context)

  const createMetadata = (manifestId?: string): ToolExecutionMetadata => ({
    executionTimeMs: metrics.getElapsedMs(),
    toolName: normalizedName,
    riskScore: securityContext.effectiveRiskScore,
    riskLevel: securityContext.vetoResult.riskLevel,
    manifestId,
    traceId: context?.traceId,
  })

  // AEGIS Policy Check
  const aegisToolDecision = evaluateAegisToolPolicy(normalizedName, securityContext.sanitizedArgs)
  if (aegisToolDecision.blocked) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "blocked",
      blockedReason: aegisToolDecision.reason || "Tool blocked by AEGIS policy.",
      vetoed: false,
    })
    return {
      ok: false,
      error: aegisToolDecision.reason || "Tool blocked by AEGIS policy.",
      statusCode: 403,
      metadata: createMetadata(manifest.manifestId),
    }
  }

  // Sub-agent Policy Check
  if (!isToolAllowedForSubagent(context?.subagentId || null, normalizedName)) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "blocked",
      blockedReason: "Tool blocked by sub-agent policy.",
      vetoed: false,
    })
    return {
      ok: false,
      error: "Tool blocked by sub-agent policy.",
      statusCode: 403,
      metadata: createMetadata(manifest.manifestId),
    }
  }

  // MCP Policy Check
  if (!isToolAllowedByPolicy(normalizedName)) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "blocked",
      blockedReason: "Tool blocked by MCP policy.",
      vetoed: false,
    })
    return {
      ok: false,
      error: "Tool blocked by policy.",
      statusCode: 403,
      metadata: createMetadata(manifest.manifestId),
    }
  }

  if (securityContext.dataEgressTool && !securityContext.dataEgressAllowedByPolicy) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "blocked",
      blockedReason: "Data-egress tool blocked by per-tool allowlist policy.",
      vetoed: false,
    })
    return {
      ok: false,
      error: "Data-egress tool is not in the configured allowlist.",
      statusCode: 403,
      details: {
        dataEgressTool: true,
        allowlistEnforced: true,
      },
      metadata: createMetadata(manifest.manifestId),
    }
  }

  // Scope/Access Check
  if (!canAccessTool(authContext, normalizedName)) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "blocked",
      blockedReason: "Missing required scope.",
      vetoed: false,
    })
    return {
      ok: false,
      error: `Insufficient scope for tool: ${normalizedName}`,
      statusCode: 403,
      details: {
        requiredScopes: getRequiredScopesForTool(normalizedName),
      },
      metadata: createMetadata(manifest.manifestId),
    }
  }

  // Tool Existence Check
  const tool = registry[normalizedName]
  if (!tool || typeof tool.execute !== "function") {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "failed",
      blockedReason: "Tool not found in executable registry.",
      vetoed: false,
    })
    return {
      ok: false,
      error: "Tool not found.",
      metadata: createMetadata(manifest.manifestId),
    }
  }

  // Input Validation
  let executionArgs: unknown = securityContext.sanitizedArgs
  if (hasSafeParse(tool.inputSchema)) {
    const parsed = tool.inputSchema.safeParse(securityContext.sanitizedArgs)
    if (!parsed.success) {
      const manifest = await logWithSentinel({
        toolNameForLog: normalizedName,
        status: "failed",
        blockedReason: "Tool argument validation failed.",
        vetoed: false,
      })
      return {
        ok: false,
        error: "Tool arguments failed validation.",
        details: parsed.error,
        metadata: createMetadata(manifest.manifestId),
      }
    }
    executionArgs = parsed.data
  }

  // Injection Detection
  if (securityContext.argInspection.blocked) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "blocked",
      blockedReason: `Suspicious tool arguments detected: ${securityContext.argInspection.reasons.join(" | ")}`,
      vetoed: false,
    })
    return {
      ok: false,
      error: "Tool arguments blocked by security policy.",
      details: securityContext.argInspection.reasons,
      statusCode: 400,
      metadata: createMetadata(manifest.manifestId),
    }
  }

  const egressRateLimit = await checkDataEgressToolRateLimit(authContext, securityContext, context)
  if (egressRateLimit) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "blocked",
      blockedReason: `Data-egress tool rate limit exceeded (${egressRateLimit.limit}/window).`,
      vetoed: false,
    })
    return {
      ok: false,
      error: "Data-egress tool rate limit exceeded. Retry later.",
      statusCode: 429,
      details: {
        dataEgressTool: true,
        rateLimit: {
          limit: egressRateLimit.limit,
          remaining: egressRateLimit.remaining,
          retryAfterSeconds: egressRateLimit.retryAfterSeconds,
          resetAt: new Date(egressRateLimit.resetAt).toISOString(),
        },
      },
      metadata: createMetadata(manifest.manifestId),
    }
  }

  if (
    securityContext.criticalWorkflowContext.isCriticalActionTool &&
    securityContext.criticalWorkflowContext.verifyMode === "enforce"
  ) {
    const ownerUserId = authContext?.userId || null
    const sessionId = context?.sessionId || null

    if (ownerUserId && sessionId) {
      const pendingVerifications = await findPendingVerifications({
        ownerUserId,
        sessionId,
      })
      const blockingVerifications = pendingVerifications.filter(
        (item) => item.verificationState === "pending" || item.verificationState === "failed",
      )

      if (blockingVerifications.length > 0) {
        const requiredVerifiers = Array.from(
          new Set(
            blockingVerifications
              .map((item) =>
                item.verificationTargetTool
                  ? getVerificationToolForAction(item.verificationTargetTool)
                  : null,
              )
              .filter((value): value is string => Boolean(value)),
          ),
        )

        const firstBlocking = blockingVerifications[0]!
        const blockingReasons = blockingVerifications
          .map((item) => {
            const stateLabel = item.isMissed ? "missed" : item.verificationState
            const target = item.verificationTargetTool || item.toolName
            const subject = item.verificationSubject || "subject:unknown"
            return `${target} (${subject}) is ${stateLabel}`
          })
          .slice(0, 5)
          .join(" | ")

        const manifest = await logWithSentinel({
          toolNameForLog: normalizedName,
          status: "blocked",
          blockedReason: `Verification requirement not satisfied: ${blockingReasons}`,
          vetoed: false,
          criticalWorkflowClass: "destructive",
          verificationRequired: true,
          verificationState: firstBlocking.isMissed ? "failed" : firstBlocking.verificationState,
          verificationTargetTool: firstBlocking.verificationTargetTool,
          verificationSubject: firstBlocking.verificationSubject,
          verificationDueAt: firstBlocking.verificationDueAt,
        })

        return {
          ok: false,
          error:
            "Critical workflow verification required before executing another destructive action.",
          statusCode: 409,
          details: {
            verificationMode: securityContext.criticalWorkflowContext.verifyMode,
            verificationWindowSeconds: securityContext.criticalWorkflowContext.verifyWindowSeconds,
            requiredVerifierTools: requiredVerifiers,
            unresolvedCount: blockingVerifications.length,
            unresolvedVerifications: blockingVerifications.slice(0, 5).map((item) => ({
              targetTool: item.verificationTargetTool,
              subject: item.verificationSubject,
              state: item.isMissed ? "missed" : item.verificationState,
              dueAt: item.verificationDueAt,
            })),
          },
          metadata: createMetadata(manifest.manifestId),
        }
      }
    }
  }

  // Approval Requirement Determination
  const requiresExecutionApproval =
    securityContext.destructiveApprovalRequired ||
    securityContext.privilegedApprovalRequired ||
    securityContext.dataEgressApprovalRequired ||
    securityContext.egressShapeApprovalRequired ||
    securityContext.vetoResult.shouldVeto

  const approvalReasons: string[] = []
  if (securityContext.destructiveApprovalRequired) {
    approvalReasons.push("Destructive tool class requires explicit human approval.")
  }
  if (securityContext.privilegedApprovalRequired) {
    approvalReasons.push("Privileged tool class requires explicit human approval.")
  }
  if (securityContext.dataEgressApprovalRequired) {
    approvalReasons.push(
      `Data egress DLP review required: ${securityContext.dataEgressRisk.reasons.slice(0, MAX_DLP_REASONS_TO_DISPLAY).join(" | ")}`,
    )
  }
  if (securityContext.egressShapeApprovalRequired) {
    approvalReasons.push(
      `Workflow-shaped egress approval required: ${securityContext.dataEgressShape.reasons.join(" | ")}`,
    )
  }
  if (securityContext.vetoResult.shouldVeto) {
    approvalReasons.push(`SENTINEL veto: ${securityContext.vetoResult.reasons.join(" | ")}`)
  }

  // Handle Existing Approval
  if (requiresExecutionApproval && securityContext.executionApprovalId) {
    const approvalCheck = await consumeSentinelVetoApprovalForExecution({
      approvalId: securityContext.executionApprovalId,
      ownerUserId: authContext?.userId,
      toolName: normalizedName,
      transport: securityContext.transport,
      sessionId: context?.sessionId || null,
      argPreview: securityContext.argSummary.redactedPreview,
    })

    if (!approvalCheck.ok) {
      const pendingLike =
        approvalCheck.code === "approval_pending" || approvalCheck.code === "approval_expired"
      const manifest = await logWithSentinel({
        toolNameForLog: normalizedName,
        status: pendingLike ? "vetoed" : "blocked",
        blockedReason: `Approval validation failed: ${approvalCheck.error}`,
        vetoed: pendingLike,
      })
      return {
        ok: false,
        error: approvalCheck.error,
        statusCode: pendingLike ? 202 : 403,
        details: {
          sentinelVetoed: pendingLike,
          approvalRequired: true,
          approvalId: securityContext.executionApprovalId,
          approvalStatus: approvalCheck.code,
          destructiveTool: securityContext.destructiveApprovalRequired,
          privilegedTool: securityContext.privilegedApprovalRequired,
          dataEgressReview: securityContext.dataEgressApprovalRequired,
          egressShapeApprovalRequired: securityContext.egressShapeApprovalRequired,
          egressShapeReasons: securityContext.dataEgressShape.reasons,
          egressShapeMetrics: {
            payloadByteSize: securityContext.dataEgressShape.payloadByteSize,
            attachmentCount: securityContext.dataEgressShape.attachmentCount,
            threadMessageCount: securityContext.dataEgressShape.threadMessageCount,
          },
          dlpEnforced: shouldEnforceDataEgressDlp(),
          dlpReasons: securityContext.dataEgressRisk.reasons.slice(0, MAX_DLP_REASONS_TO_DISPLAY),
        },
        metadata: createMetadata(manifest.manifestId),
      }
    }
  }

  // Create New Approval if Required
  if (requiresExecutionApproval && !securityContext.executionApprovalId) {
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "vetoed",
      blockedReason: approvalReasons.join(" | "),
      vetoed: true,
    })

    const approvalRiskScore = computeApprovalRiskScore(
      securityContext.effectiveRiskScore,
      securityContext.privilegedApprovalRequired || securityContext.destructiveApprovalRequired,
      securityContext.dataEgressApprovalRequired || securityContext.egressShapeApprovalRequired,
    )
    const approvalRiskLevel =
      securityContext.privilegedApprovalRequired ||
      securityContext.destructiveApprovalRequired ||
      securityContext.dataEgressApprovalRequired ||
      securityContext.egressShapeApprovalRequired
        ? toRiskLevelFromScore(approvalRiskScore)
        : securityContext.vetoResult.riskLevel

    const approvalId = await createSentinelVetoApproval({
      ownerUserId: authContext?.userId,
      sessionId: context?.sessionId || null,
      toolName: normalizedName,
      transport: securityContext.transport,
      actorId: authContext?.userId || "anonymous",
      riskScore: approvalRiskScore,
      riskLevel: approvalRiskLevel,
      argPreview: securityContext.argSummary.redactedPreview,
      manifestId: manifest.manifestId,
      reason: approvalReasons.join(" | "),
    })

    return {
      ok: false,
      error:
        "Tool execution paused pending explicit human approval. Resolve the approval and retry with approvalId.",
      statusCode: 202,
      details: {
        sentinelVetoed: true,
        approvalRequired: true,
        approvalId,
        destructiveTool: securityContext.destructiveApprovalRequired,
        privilegedTool: securityContext.privilegedApprovalRequired,
        dataEgressReview: securityContext.dataEgressApprovalRequired,
        dataEgressTool: securityContext.dataEgressTool,
        egressShapeApprovalRequired: securityContext.egressShapeApprovalRequired,
        egressShapeReasons: securityContext.dataEgressShape.reasons,
        egressShapeMetrics: {
          payloadByteSize: securityContext.dataEgressShape.payloadByteSize,
          attachmentCount: securityContext.dataEgressShape.attachmentCount,
          threadMessageCount: securityContext.dataEgressShape.threadMessageCount,
        },
        dlpEnforced: shouldEnforceDataEgressDlp(),
        dlpReasons: securityContext.dataEgressRisk.reasons.slice(0, MAX_DLP_REASONS_TO_DISPLAY),
        privilegedPolicyEnabled: shouldRequirePrivilegedToolApproval(),
        destructivePolicyEnabled: shouldRequireDestructiveToolApproval(),
        mode: securityContext.vetoConfig.mode,
        riskScore: approvalRiskScore,
        riskLevel: approvalRiskLevel,
        reasons: approvalReasons,
      },
      metadata: createMetadata(manifest.manifestId),
    }
  }

  // Execute Tool with Timeout and Retry
  const timeoutMs = context?.timeout || DEFAULT_TOOL_TIMEOUT_MS
  const retryAttempt = context?.retryAttempt || 0

  try {
    const output = await executeWithTimeout(
      async () => tool.execute!(executionArgs),
      timeoutMs,
      normalizedName,
    )

    let verificationRequired = false
    let verificationState: "not_required" | "pending" | "passed" | "failed" = "not_required"
    let verificationTargetTool: string | null = null
    let verificationSubject: string | null = null
    let verificationDueAt: string | null = null
    let verificationCheckedAt: string | null = null
    let criticalWorkflowClass: "none" | "destructive" | "egress" =
      securityContext.dataEgressTool ? "egress" : securityContext.criticalWorkflowContext.workflowClass

    if (
      securityContext.criticalWorkflowContext.isCriticalActionTool &&
      securityContext.criticalWorkflowContext.verificationRequired
    ) {
      verificationRequired = true
      verificationState = "pending"
      verificationTargetTool = securityContext.criticalWorkflowContext.targetToolName
      verificationSubject = securityContext.criticalWorkflowContext.subject
      verificationDueAt = buildVerificationDueAtIso(
        securityContext.criticalWorkflowContext.verifyWindowSeconds,
      )
      criticalWorkflowClass = "destructive"
    }

    if (securityContext.criticalWorkflowContext.isVerificationTool) {
      const verificationOutcome = extractVerificationOutcome(output)
      if (verificationOutcome) {
        verificationRequired = false
        verificationState = verificationOutcome.verified ? "passed" : "failed"
        verificationTargetTool = verificationOutcome.targetTool
        verificationSubject = verificationOutcome.subject || securityContext.criticalWorkflowContext.subject
        verificationCheckedAt = new Date().toISOString()
        criticalWorkflowClass = "destructive"

        if (authContext?.userId && context?.sessionId) {
          await markVerificationResult({
            ownerUserId: authContext.userId,
            sessionId: context.sessionId,
            targetTool: verificationOutcome.targetTool,
            subject: verificationSubject,
            passed: verificationOutcome.verified,
            checkedAt: verificationCheckedAt,
          })
        }
      }
    }

    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "allowed",
      vetoed: false,
      criticalWorkflowClass,
      verificationRequired,
      verificationState,
      verificationTargetTool,
      verificationSubject,
      verificationDueAt,
      verificationCheckedAt,
    })
    return {
      ok: true,
      output,
      metadata: createMetadata(manifest.manifestId),
    }
  } catch (error) {
    // Check if we should retry
    if (shouldRetryExecution(error, retryAttempt)) {
      return executeRealtimeTool(authContext, toolName, rawArgs, {
        ...context,
        retryAttempt: retryAttempt + 1,
        timeout: Math.min(timeoutMs * 1.5, DEFAULT_TOOL_TIMEOUT_MS * 3),
      })
    }

    const errorMessage = error instanceof Error ? error.message : "Tool execution failed."
    const statusCode = error instanceof ToolExecutionError ? error.statusCode : undefined
    const manifest = await logWithSentinel({
      toolNameForLog: normalizedName,
      status: "failed",
      errorMessage,
      vetoed: false,
    })
    return {
      ok: false,
      error: errorMessage,
      statusCode,
      metadata: createMetadata(manifest.manifestId),
    }
  }
}

// ============================================================================
// Batch Tool Execution
// ============================================================================

export type BatchToolExecutionResult = {
  results: Array<{
    toolName: string
    result: ToolExecutionResult
  }>
  totalExecutionTimeMs: number
  successCount: number
  failureCount: number
}

export type BatchToolExecutionOptions = Omit<ToolExecutionContext, "retryAttempt"> & {
  concurrency?: number
  stopOnFirstError?: boolean
}

export async function executeRealtimeToolBatch(
  authContext: SupabaseAuthContext | null,
  calls: Array<{ toolName: string; args: unknown }>,
  options?: BatchToolExecutionOptions,
): Promise<BatchToolExecutionResult> {
  const startTime = performance.now()
  const results: Array<{ toolName: string; result: ToolExecutionResult }> = []
  let successCount = 0
  let failureCount = 0

  const concurrency = options?.concurrency || 5
  const stopOnFirstError = options?.stopOnFirstError || false
  const context: Omit<ToolExecutionContext, "retryAttempt"> = {
    transport: options?.transport,
    sessionId: options?.sessionId,
    clientAddress: options?.clientAddress,
    subagentId: options?.subagentId,
    approvalId: options?.approvalId,
    traceId: options?.traceId,
    timeout: options?.timeout,
  }

  // Execute tools in parallel with concurrency limit
  for (let i = 0; i < calls.length; i += concurrency) {
    if (stopOnFirstError && failureCount > 0) {
      break
    }

    const batch = calls.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async ({ toolName, args }) => {
        const result = await executeRealtimeTool(authContext, toolName, args, context)
        return { toolName, result }
      }),
    )
    for (const r of batchResults) {
      results.push(r)
      if (r.result.ok) {
        successCount++
      } else {
        failureCount++
      }
    }
  }

  return {
    results,
    totalExecutionTimeMs: performance.now() - startTime,
    successCount,
    failureCount,
  }
}

// ============================================================================
// Guarded Chat Tool Registry
// ============================================================================

export function getGuardedChatToolRegistry(
  authContext: SupabaseAuthContext | null,
  options?: {
    sessionId?: string
    clientAddress?: string
    subagentId?: McpSubagentId | null
    timeout?: number
  },
): Record<string, ToolLike> {
  const executableRegistry = getRealtimeExecutableToolRegistry(authContext, {
    subagentId: options?.subagentId || null,
  })
  const guarded: Record<string, ToolLike> = {}

  for (const [toolName, originalTool] of Object.entries(executableRegistry)) {
    if (!originalTool || typeof originalTool.execute !== "function") {
      continue
    }
    const normalizedName = normalizeToolName(toolName)
    if (!normalizedName) {
      continue
    }

    guarded[normalizedName] = {
      description: safeToolDescription(originalTool.description),
      inputSchema: originalTool.inputSchema,
      execute: async (input: unknown) => {
        const execution = await executeRealtimeTool(authContext, normalizedName, input, {
          transport: "chat",
          sessionId: options?.sessionId,
          clientAddress: options?.clientAddress,
          subagentId: options?.subagentId || null,
          timeout: options?.timeout,
        })

        if (!execution.ok) {
          const wrappedError = new ToolExecutionError(
            execution.error,
            execution.statusCode,
            execution.details,
          )
          throw wrappedError
        }

        return execution.output
      },
    }
  }

  return guarded
}

// ============================================================================
// Authentication Context Resolution
// ============================================================================

export async function resolveRealtimeAuthContext(
  req: Request,
): Promise<SupabaseAuthContext | null> {
  return resolveMcpAuthContextFromRequest(req)
}

// ============================================================================
// Tool Introspection Utilities
// ============================================================================

export type ToolInfo = {
  name: string
  description: string
  requiresApproval: boolean
  isPrivileged: boolean
  isDataEgress: boolean
  requiredScopes: string[]
}

export function listAvailableTools(
  authContext: SupabaseAuthContext | null,
  options?: ToolRegistryOptions,
): ToolInfo[] {
  const definitions = getRealtimeToolDefinitions(authContext, options)
  return definitions.map((def) => ({
    name: def.name,
    description: def.description,
    requiresApproval:
      (isDestructiveToolByPolicy(def.name) && shouldRequireDestructiveToolApproval()) ||
      isPrivilegedToolByPolicy(def.name) ||
      (isDataEgressToolByPolicy(def.name) &&
        (shouldEnforceDataEgressDlp() || shouldRequireEgressShapeApproval())),
    isPrivileged: isPrivilegedToolByPolicy(def.name),
    isDataEgress: isDataEgressToolByPolicy(def.name),
    requiredScopes: getRequiredScopesForTool(def.name),
  }))
}

export function getToolInfo(
  authContext: SupabaseAuthContext | null,
  toolName: string,
): ToolInfo | null {
  const normalizedName = normalizeToolName(toolName)
  if (!normalizedName) {
    return null
  }
  const definition = getToolDefinitionByName(authContext, normalizedName)
  if (!definition) {
    return null
  }
  return {
    name: definition.name,
    description: definition.description,
    requiresApproval:
      isPrivilegedToolByPolicy(definition.name) ||
      (isDataEgressToolByPolicy(definition.name) && shouldEnforceDataEgressDlp()),
    isPrivileged: isPrivilegedToolByPolicy(definition.name),
    isDataEgress: isDataEgressToolByPolicy(definition.name),
    requiredScopes: getRequiredScopesForTool(definition.name),
  }
}

// ============================================================================
// Tool Validation Utilities
// ============================================================================

export function validateToolArguments(
  authContext: SupabaseAuthContext | null,
  toolName: string,
  args: unknown,
): { valid: boolean; errors?: unknown } {
  const normalizedName = normalizeToolName(toolName)
  if (!normalizedName) {
    return { valid: false, errors: "Invalid tool name" }
  }

  const registry = getRealtimeToolRegistry(authContext)
  const tool = registry[normalizedName]
  if (!tool) {
    return { valid: false, errors: "Tool not found" }
  }

  if (!hasSafeParse(tool.inputSchema)) {
    return { valid: true }
  }

  const parsed = tool.inputSchema.safeParse(normalizeArguments(args))
  if (parsed.success) {
    return { valid: true }
  }
  return { valid: false, errors: parsed.error }
}

// ============================================================================
// Utility Exports for Testing
// ============================================================================

export const __testing = {
  normalizeToolName,
  safeToolDescription,
  normalizeArguments,
  normalizeApprovalId,
  extractApprovalFromArgs,
  toRiskLevelFromScore,
  zodToJsonSchema,
  unwrapSchema,
  shouldRetryExecution,
  executeWithTimeout,
  createExecutionMetrics,
  TOOL_NAME_REGEX,
  APPROVAL_ID_PATTERN,
  DEFAULT_TOOL_TIMEOUT_MS,
  MAX_RETRY_ATTEMPTS,
}
