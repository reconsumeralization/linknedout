import { createHash, randomBytes } from "node:crypto"
import {
  getMcpEgressDlpPatterns,
  getMcpInjectionCategoryPatterns,
  getMcpSuspiciousTextPatterns,
  logSecurityPatternRegistryLoad,
} from "@/lib/security/security-patterns"

// ============================================================================
// Configuration Parsing Utilities
// ============================================================================

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeToolName(value: string): string {
  return value.trim().toLowerCase()
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false
  }
  return null
}

function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue
  }
  const parsed = parseInt(value.trim(), 10)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

function parseStringArrayEnv(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) {
    return defaultValue
  }
  return parseCsv(value)
}

function parseToolRateLimitMap(value: string | undefined): Map<string, number> {
  const output = new Map<string, number>()
  if (!value) {
    return output
  }

  for (const rawEntry of value.split(",")) {
    const entry = rawEntry.trim()
    if (!entry) {
      continue
    }

    const separatorIndex = entry.includes(":") ? entry.indexOf(":") : entry.indexOf("=")
    if (separatorIndex <= 0) {
      continue
    }

    const rawToolName = entry.slice(0, separatorIndex).trim()
    const rawLimit = entry.slice(separatorIndex + 1).trim()
    const normalizedToolName = normalizeToolName(rawToolName)
    if (!normalizedToolName) {
      continue
    }

    const parsedLimit = Number.parseInt(rawLimit, 10)
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      continue
    }

    output.set(normalizedToolName, Math.floor(parsedLimit))
  }

  return output
}

logSecurityPatternRegistryLoad("mcp-tool-security")

// ============================================================================
// Serialization and Hashing
// ============================================================================

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value)
    return typeof serialized === "string" ? serialized : "null"
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${pairs.join(",")}}`
}

function computeHash(data: string, algorithm: "sha256" | "sha512" | "sha384" | "md5" = "sha256"): string {
  return createHash(algorithm).update(data, "utf8").digest("hex")
}

function computeHmac(data: string, secret: string, algorithm: "sha256" | "sha512" = "sha256"): string {
  const { createHmac } = require("node:crypto")
  return createHmac(algorithm, secret).update(data, "utf8").digest("hex")
}

function generateNonce(bytes: number = 16): string {
  return randomBytes(bytes).toString("hex")
}

function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url")
}

// ============================================================================
// Sensitive Data Redaction
// ============================================================================

const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /authorization/i,
  /credential/i,
  /auth[_-]?token/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /bearer/i,
  /session[_-]?id/i,
  /cookie/i,
  /x-api-key/i,
  /x-auth-token/i,
  /jwt/i,
  /signing[_-]?key/i,
  /encryption[_-]?key/i,
  /master[_-]?key/i,
  /service[_-]?account/i,
  /client[_-]?secret/i,
  /oauth/i,
  /ssn/i,
  /social[_-]?security/i,
  /credit[_-]?card/i,
  /cvv/i,
  /pin/i,
]

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function redactSensitive(input: unknown, depth: number = 0, visited: WeakSet<object> = new WeakSet()): unknown {
  const maxDepth = 20
  if (depth > maxDepth) {
    return "[MAX_DEPTH_EXCEEDED]"
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitive(item, depth + 1, visited))
  }

  if (!input || typeof input !== "object") {
    return input
  }

  // Circular reference detection
  if (visited.has(input)) {
    return "[CIRCULAR_REFERENCE]"
  }
  visited.add(input)

  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      output[key] = "[REDACTED]"
      continue
    }
    output[key] = redactSensitive(value, depth + 1, visited)
  }
  return output
}

function redactSensitiveValue(value: string): string {
  if (value.length <= 4) {
    return "****"
  }
  const visibleChars = Math.min(4, Math.floor(value.length * 0.2))
  return value.slice(0, visibleChars) + "****" + value.slice(-visibleChars)
}

// ============================================================================
// Injection Detection Patterns
// ============================================================================

const SUSPICIOUS_TEXT_PATTERNS = getMcpSuspiciousTextPatterns()

const INJECTION_CATEGORY_PATTERNS = getMcpInjectionCategoryPatterns()

function collectSuspiciousMatches(value: unknown, path: string, output: string[], depth: number = 0): void {
  const maxDepth = 20
  if (depth > maxDepth) {
    return
  }

  if (typeof value === "string") {
    const trimmed = value.slice(0, 15_000)
    for (const pattern of SUSPICIOUS_TEXT_PATTERNS) {
      if (pattern.test(trimmed)) {
        output.push(`${path}: matched pattern ${pattern.source.slice(0, 50)}`)
      }
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSuspiciousMatches(item, `${path}[${index}]`, output, depth + 1))
    return
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectSuspiciousMatches(item, `${path}.${key}`, output, depth + 1)
    }
  }
}

function categorizeInjectionFindings(reasons: string[]): Set<string> {
  const categories: Set<string> = new Set()
  for (const reason of reasons) {
    for (const [category, patterns] of Object.entries(INJECTION_CATEGORY_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(reason)) {
          categories.add(category)
          break
        }
      }
    }
  }
  return categories
}

// ============================================================================
// Tool Allowlist/Blocklist Management
// ============================================================================

export function getMcpAllowedTools(): Set<string> {
  return new Set(parseCsv(process.env.MCP_ALLOWED_TOOLS).map(normalizeToolName))
}

export function getMcpBlockedTools(): Set<string> {
  return new Set(parseCsv(process.env.MCP_BLOCKED_TOOLS).map(normalizeToolName))
}

export function shouldEnforceToolAllowlist(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_ENFORCE_TOOL_ALLOWLIST)
  if (configured !== null) {
    return configured
  }
  return process.env.NODE_ENV === "production"
}

export function isToolAllowedByPolicy(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  if (!normalized) {
    return false
  }

  const blocked = getMcpBlockedTools()
  if (blocked.has(normalized)) {
    return false
  }

  const allowed = getMcpAllowedTools()
  if (!shouldEnforceToolAllowlist()) {
    return true
  }
  if (allowed.size === 0) {
    return false
  }
  return allowed.has(normalized)
}

// Wildcard pattern matching for tool names
function isToolMatchingPattern(toolName: string, pattern: string): boolean {
  const normalized = normalizeToolName(toolName)
  const normalizedPattern = normalizeToolName(pattern)
  
  if (normalizedPattern.includes("*")) {
    const regex = new RegExp("^" + normalizedPattern.replace(/\*/g, ".*") + "$")
    return regex.test(normalized)
  }
  
  return normalized === normalizedPattern
}

export function getMcpToolPatternAllowlist(): string[] {
  return parseStringArrayEnv(process.env.MCP_TOOL_PATTERN_ALLOWLIST)
}

export function getMcpToolPatternBlocklist(): string[] {
  return parseStringArrayEnv(process.env.MCP_TOOL_PATTERN_BLOCKLIST)
}

export function isToolAllowedByPatternPolicy(toolName: string): boolean {
  const blocklist = getMcpToolPatternBlocklist()
  for (const pattern of blocklist) {
    if (isToolMatchingPattern(toolName, pattern)) {
      return false
    }
  }
  
  const allowlist = getMcpToolPatternAllowlist()
  if (allowlist.length === 0) {
    return true
  }
  
  for (const pattern of allowlist) {
    if (isToolMatchingPattern(toolName, pattern)) {
      return true
    }
  }
  
  return false
}

// ============================================================================
// Suspicious Argument Blocking
// ============================================================================

export function shouldBlockSuspiciousToolArgs(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_BLOCK_SUSPICIOUS_TOOL_ARGS)
  if (configured !== null) {
    return configured
  }
  return process.env.NODE_ENV === "production"
}

export function getMaxToolArgSizeBytes(): number {
  return parseIntEnv(process.env.MCP_MAX_TOOL_ARG_SIZE_BYTES, 1_000_000)
}

export function getMaxToolArgDepth(): number {
  return parseIntEnv(process.env.MCP_MAX_TOOL_ARG_DEPTH, 20)
}

export function getMaxToolArgArrayLength(): number {
  return parseIntEnv(process.env.MCP_MAX_TOOL_ARG_ARRAY_LENGTH, 1000)
}

function validateArgStructure(value: unknown, depth: number = 0, path: string = "$"): string[] {
  const errors: string[] = []
  const maxDepth = getMaxToolArgDepth()
  const maxArrayLength = getMaxToolArgArrayLength()
  
  if (depth > maxDepth) {
    errors.push(`${path}: Exceeded maximum depth of ${maxDepth}`)
    return errors
  }
  
  if (Array.isArray(value)) {
    if (value.length > maxArrayLength) {
      errors.push(`${path}: Array length ${value.length} exceeds maximum of ${maxArrayLength}`)
    }
    value.forEach((item, index) => {
      errors.push(...validateArgStructure(item, depth + 1, `${path}[${index}]`))
    })
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > maxArrayLength) {
      errors.push(`${path}: Object has ${entries.length} keys, exceeds maximum of ${maxArrayLength}`)
    }
    for (const [key, item] of entries) {
      errors.push(...validateArgStructure(item, depth + 1, `${path}.${key}`))
    }
  }
  
  return errors
}

// ============================================================================
// Privileged Tool Classification
// ============================================================================

const PRIVILEGED_TOOL_PREFIXES = [
  "create",
  "update",
  "upsert",
  "delete",
  "remove",
  "add",
  "send",
  "post",
  "set",
  "grant",
  "revoke",
  "resolve",
  "dismiss",
  "connect",
  "disconnect",
  "write",
  "patch",
  "publish",
  "archive",
  "restore",
  "insert",
  "execute",
  "run",
  "invoke",
  "trigger",
  "deploy",
  "terminate",
  "kill",
  "stop",
  "start",
  "enable",
  "disable",
  "modify",
  "alter",
  "configure",
  "install",
  "uninstall",
  "upgrade",
  "downgrade",
  "migrate",
  "import",
  "reset",
  "purge",
  "wipe",
  "clear",
  "approve",
  "reject",
  "authorize",
  "deauthorize",
] as const

const EGRESS_TOOL_PREFIXES = [
  "send",
  "post",
  "publish",
  "share",
  "export",
  "notify",
  "email",
  "message",
  "upload",
  "transmit",
  "broadcast",
  "forward",
  "relay",
  "dispatch",
  "distribute",
  "sync",
  "push",
  "webhook",
  "callback",
] as const

const DESTRUCTIVE_TOOL_PREFIXES = [
  "delete",
  "remove",
  "drop",
  "truncate",
  "purge",
  "wipe",
  "clear",
  "destroy",
  "terminate",
  "kill",
  "reset",
  "uninstall",
  "revoke",
] as const

// ============================================================================
// Data Loss Prevention (DLP) Patterns
// ============================================================================

const EGRESS_DLP_PATTERNS = getMcpEgressDlpPatterns()

const DLP_SEVERITY_MAP: Record<string, "low" | "medium" | "high" | "critical"> = {
  "PRIVATE\\s+KEY": "critical",
  "aws_secret_access_key": "critical",
  "Bearer\\s+": "high",
  "sk-[A-Za-z0-9]": "high",
  "\\d{3}-\\d{2}-\\d{4}": "high",
  "confidential": "medium",
  "internal\\s+only": "medium",
}

function collectEgressRiskMatches(value: unknown, path: string, output: string[], depth: number = 0): void {
  const maxDepth = 20
  if (depth > maxDepth) {
    return
  }

  if (typeof value === "string") {
    const candidate = value.slice(0, 25_000)
    for (const pattern of EGRESS_DLP_PATTERNS) {
      if (pattern.test(candidate)) {
        output.push(`${path}: potential sensitive data (${pattern.source.slice(0, 30)}...)`)
      }
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectEgressRiskMatches(item, `${path}[${index}]`, output, depth + 1))
    return
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectEgressRiskMatches(item, `${path}.${key}`, output, depth + 1)
    }
  }
}

function isHeuristicallyPrivilegedTool(normalizedToolName: string): boolean {
  return PRIVILEGED_TOOL_PREFIXES.some((prefix) => normalizedToolName.startsWith(prefix))
}

function isHeuristicallyDestructiveTool(normalizedToolName: string): boolean {
  return DESTRUCTIVE_TOOL_PREFIXES.some((prefix) => normalizedToolName.startsWith(prefix))
}

export function getMcpPrivilegedTools(): Set<string> {
  return new Set(parseCsv(process.env.MCP_PRIVILEGED_TOOLS).map(normalizeToolName))
}

export function getMcpNonPrivilegedTools(): Set<string> {
  return new Set(parseCsv(process.env.MCP_NON_PRIVILEGED_TOOLS).map(normalizeToolName))
}

export function getMcpDestructiveTools(): Set<string> {
  return new Set(parseCsv(process.env.MCP_DESTRUCTIVE_TOOLS).map(normalizeToolName))
}

export function shouldAutoClassifyPrivilegedTools(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_AUTO_CLASSIFY_PRIVILEGED_TOOLS)
  if (configured !== null) {
    return configured
  }
  return true
}

export function isPrivilegedToolByPolicy(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  if (!normalized) {
    return false
  }

  const nonPrivileged = getMcpNonPrivilegedTools()
  if (nonPrivileged.has(normalized)) {
    return false
  }

  const privileged = getMcpPrivilegedTools()
  if (privileged.has(normalized)) {
    return true
  }

  if (!shouldAutoClassifyPrivilegedTools()) {
    return false
  }

  return isHeuristicallyPrivilegedTool(normalized)
}

export function isDestructiveToolByPolicy(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  if (!normalized) {
    return false
  }

  const destructive = getMcpDestructiveTools()
  if (destructive.has(normalized)) {
    return true
  }

  return isHeuristicallyDestructiveTool(normalized)
}

// ============================================================================
// Data Egress Classification
// ============================================================================

function isHeuristicallyDataEgressTool(normalizedToolName: string): boolean {
  return EGRESS_TOOL_PREFIXES.some((prefix) => normalizedToolName.startsWith(prefix))
}

export function getMcpDataEgressTools(): Set<string> {
  return new Set(parseCsv(process.env.MCP_DATA_EGRESS_TOOLS).map(normalizeToolName))
}

export function getMcpNonDataEgressTools(): Set<string> {
  return new Set(parseCsv(process.env.MCP_NON_DATA_EGRESS_TOOLS).map(normalizeToolName))
}

export function getMcpDataEgressToolAllowlist(): Set<string> {
  return new Set(parseCsv(process.env.MCP_DATA_EGRESS_TOOL_ALLOWLIST).map(normalizeToolName))
}

export function shouldAutoClassifyDataEgressTools(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_AUTO_CLASSIFY_DATA_EGRESS_TOOLS)
  if (configured !== null) {
    return configured
  }
  return true
}

export function shouldEnforceDataEgressToolAllowlist(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_ENFORCE_DATA_EGRESS_TOOL_ALLOWLIST)
  if (configured !== null) {
    return configured
  }
  return process.env.NODE_ENV === "production" && getMcpDataEgressToolAllowlist().size > 0
}

export function isDataEgressToolByPolicy(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  if (!normalized) {
    return false
  }

  const explicitNonEgress = getMcpNonDataEgressTools()
  if (explicitNonEgress.has(normalized)) {
    return false
  }

  const explicitEgress = getMcpDataEgressTools()
  if (explicitEgress.has(normalized)) {
    return true
  }

  if (!shouldAutoClassifyDataEgressTools()) {
    return false
  }

  return isHeuristicallyDataEgressTool(normalized)
}

export function isDataEgressToolAllowedByPolicy(toolName: string): boolean {
  const normalized = normalizeToolName(toolName)
  if (!normalized) {
    return false
  }

  if (!isDataEgressToolByPolicy(normalized)) {
    return true
  }

  if (!shouldEnforceDataEgressToolAllowlist()) {
    return true
  }

  const allowlist = getMcpDataEgressToolAllowlist()
  if (allowlist.size === 0) {
    return true
  }

  return allowlist.has(normalized)
}

export function shouldEnforceDataEgressDlp(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_ENFORCE_DATA_EGRESS_DLP)
  if (configured !== null) {
    return configured
  }
  return process.env.NODE_ENV === "production"
}

export interface DataEgressRiskResult {
  flagged: boolean
  reasons: string[]
  severity: "low" | "medium" | "high" | "critical"
  recommendedAction: "allow" | "warn" | "block" | "quarantine"
  detectedPatterns: string[]
  affectedPaths: string[]
}

export interface DataEgressWorkflowShapeResult {
  payloadByteSize: number
  attachmentCount: number
  threadMessageCount: number
  thresholdExceeded: boolean
  reasons: string[]
}

const ATTACHMENT_KEY_PATTERN = /(attachment|attachments|file|files|media|asset|assets)/i
const THREAD_KEY_PATTERN = /(thread|messages|message_history|conversation|history)/i
const MAX_WORKFLOW_SHAPE_DEPTH = 8

function countCollectionLikeEntries(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length
  }
  if (value && typeof value === "object") {
    return 1
  }
  if (typeof value === "string" && value.trim()) {
    return 1
  }
  return 0
}

function collectWorkflowShapeCounts(
  value: unknown,
  depth: number,
  stats: { attachmentCount: number; threadMessageCount: number },
): void {
  if (depth > MAX_WORKFLOW_SHAPE_DEPTH) {
    return
  }

  if (!value || typeof value !== "object") {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectWorkflowShapeCounts(item, depth + 1, stats)
    }
    return
  }

  const record = value as Record<string, unknown>
  for (const [key, entry] of Object.entries(record)) {
    if (ATTACHMENT_KEY_PATTERN.test(key)) {
      stats.attachmentCount += countCollectionLikeEntries(entry)
    }
    if (THREAD_KEY_PATTERN.test(key) && Array.isArray(entry)) {
      stats.threadMessageCount += entry.length
    }

    if (entry && typeof entry === "object") {
      collectWorkflowShapeCounts(entry, depth + 1, stats)
    }
  }
}

export function shouldRequireEgressShapeApproval(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_EGRESS_SHAPE_APPROVAL_ENABLED)
  if (configured !== null) {
    return configured
  }
  return true
}

export function getEgressApprovalPayloadBytesThreshold(): number {
  const configured = parseIntEnv(process.env.MCP_EGRESS_APPROVAL_PAYLOAD_BYTES_THRESHOLD, 65_536)
  return Math.max(1_024, configured)
}

export function getEgressApprovalAttachmentCountThreshold(): number {
  const configured = parseIntEnv(process.env.MCP_EGRESS_APPROVAL_ATTACHMENT_COUNT_THRESHOLD, 3)
  return Math.max(1, configured)
}

export function getEgressApprovalThreadMessageCountThreshold(): number {
  const configured = parseIntEnv(process.env.MCP_EGRESS_APPROVAL_THREAD_MESSAGE_COUNT_THRESHOLD, 10)
  return Math.max(1, configured)
}

export function inspectDataEgressRisk(rawArgs: unknown): DataEgressRiskResult {
  const reasons: string[] = []
  collectEgressRiskMatches(rawArgs, "$", reasons)

  const detectedPatterns: Set<string> = new Set()
  const affectedPaths: Set<string> = new Set()
  
  for (const reason of reasons) {
    const pathMatch = reason.match(/^(\$[^:]+):/)
    if (pathMatch) {
      affectedPaths.add(pathMatch[1])
    }
    const patternMatch = reason.match(/\(([^)]+)\.\.\.\)$/)
    if (patternMatch) {
      detectedPatterns.add(patternMatch[1])
    }
  }

  const severityMap: Record<number, DataEgressRiskResult["severity"]> = {
    0: "low",
    1: "medium",
    3: "high",
    5: "critical",
  }

  const matchCount = reasons.length
  let severity: DataEgressRiskResult["severity"] = "low"
  for (const [threshold, sev] of Object.entries(severityMap).reverse()) {
    if (matchCount >= parseInt(threshold, 10)) {
      severity = sev
      break
    }
  }

  // Escalate severity based on detected pattern types
  for (const pattern of detectedPatterns) {
    for (const [patternKey, patternSeverity] of Object.entries(DLP_SEVERITY_MAP)) {
      if (pattern.includes(patternKey)) {
        const severityOrder = ["low", "medium", "high", "critical"]
        if (severityOrder.indexOf(patternSeverity) > severityOrder.indexOf(severity)) {
          severity = patternSeverity
        }
      }
    }
  }

  const actionMap: Record<DataEgressRiskResult["severity"], DataEgressRiskResult["recommendedAction"]> = {
    low: "allow",
    medium: "warn",
    high: "block",
    critical: "quarantine",
  }

  return {
    flagged: shouldEnforceDataEgressDlp() && reasons.length > 0,
    reasons,
    severity,
    recommendedAction: actionMap[severity],
    detectedPatterns: Array.from(detectedPatterns),
    affectedPaths: Array.from(affectedPaths),
  }
}

export function inspectDataEgressWorkflowShape(rawArgs: unknown): DataEgressWorkflowShapeResult {
  const stats = {
    attachmentCount: 0,
    threadMessageCount: 0,
  }
  collectWorkflowShapeCounts(rawArgs, 0, stats)

  const serialized = stableStringify(rawArgs)
  const payloadByteSize = Buffer.byteLength(serialized, "utf8")

  const payloadBytesThreshold = getEgressApprovalPayloadBytesThreshold()
  const attachmentThreshold = getEgressApprovalAttachmentCountThreshold()
  const threadMessagesThreshold = getEgressApprovalThreadMessageCountThreshold()

  const reasons: string[] = []
  if (payloadByteSize >= payloadBytesThreshold) {
    reasons.push(`payload byte size ${payloadByteSize} >= ${payloadBytesThreshold}`)
  }
  if (stats.attachmentCount >= attachmentThreshold) {
    reasons.push(`attachment count ${stats.attachmentCount} >= ${attachmentThreshold}`)
  }
  if (stats.threadMessageCount >= threadMessagesThreshold) {
    reasons.push(`thread message count ${stats.threadMessageCount} >= ${threadMessagesThreshold}`)
  }

  return {
    payloadByteSize,
    attachmentCount: stats.attachmentCount,
    threadMessageCount: stats.threadMessageCount,
    thresholdExceeded: reasons.length > 0,
    reasons,
  }
}

// ============================================================================
// Privileged Tool Approval
// ============================================================================

export function shouldRequirePrivilegedToolApproval(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_REQUIRE_PRIVILEGED_TOOL_APPROVAL)
  if (configured !== null) {
    return configured
  }
  return process.env.NODE_ENV === "production"
}

export function shouldRequireDestructiveToolApproval(): boolean {
  const configured = parseBooleanEnv(process.env.MCP_REQUIRE_DESTRUCTIVE_TOOL_APPROVAL)
  if (configured !== null) {
    return configured
  }
  return true // Always require approval for destructive tools by default
}

export function getPrivilegedToolApprovalTimeoutMs(): number {
  return parseIntEnv(process.env.MCP_PRIVILEGED_TOOL_APPROVAL_TIMEOUT_MS, 300_000) // 5 minutes default
}

export function getDestructiveToolApprovalTimeoutMs(): number {
  return parseIntEnv(process.env.MCP_DESTRUCTIVE_TOOL_APPROVAL_TIMEOUT_MS, 600_000) // 10 minutes default
}

// ============================================================================
// Injection Detection
// ============================================================================

export interface InjectionInspectionResult {
  blocked: boolean
  reasons: string[]
  riskScore: number
  categories: string[]
  severity: "none" | "low" | "medium" | "high" | "critical"
  mitigations: string[]
}

export function inspectToolArgumentsForInjection(rawArgs: unknown): InjectionInspectionResult {
  const reasons: string[] = []
  collectSuspiciousMatches(rawArgs, "$", reasons)

  // Validate structure
  const structureErrors = validateArgStructure(rawArgs)
  reasons.push(...structureErrors)

  // Categorize findings
  const categories = categorizeInjectionFindings(reasons)

  const riskScore = Math.min(100, reasons.length * 15 + categories.size * 10)

  let severity: InjectionInspectionResult["severity"] = "none"
  if (riskScore > 80) {
    severity = "critical"
  } else if (riskScore > 60) {
    severity = "high"
  } else if (riskScore > 40) {
    severity = "medium"
  } else if (riskScore > 0) {
    severity = "low"
  }

  const mitigations: string[] = []
  if (categories.has("prompt_injection")) {
    mitigations.push("Sanitize user input and validate against known injection patterns")
  }
  if (categories.has("command_injection")) {
    mitigations.push("Avoid passing user input to shell commands; use parameterized execution")
  }
  if (categories.has("sql_injection")) {
    mitigations.push("Use parameterized queries and prepared statements")
  }
  if (categories.has("ssrf_attempt")) {
    mitigations.push("Validate and whitelist allowed URLs and IP ranges")
  }
  if (categories.has("path_traversal")) {
    mitigations.push("Normalize paths and validate against allowed directories")
  }
  if (categories.has("xxe_attack")) {
    mitigations.push("Disable external entity processing in XML parsers")
  }

  return {
    blocked: shouldBlockSuspiciousToolArgs() && reasons.length > 0,
    reasons,
    riskScore,
    categories: Array.from(categories),
    severity,
    mitigations,
  }
}

// ============================================================================
// Tool Description Sanitization
// ============================================================================

export function sanitizeToolDescription(description: string): string {
  const maxLength = parseIntEnv(process.env.MCP_MAX_TOOL_DESCRIPTION_LENGTH, 1200)
  const trimmed = description.trim().slice(0, maxLength)

  if (!trimmed) {
    return "Tool callable by authenticated assistants."
  }

  const findings = inspectToolArgumentsForInjection(trimmed)
  if (findings.reasons.length > 0) {
    return "Tool callable by authenticated assistants. Follow system and safety policies."
  }

  // Remove any potential HTML/script tags
  const sanitized = trimmed
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .replace(/data:/gi, "")
    .replace(/vbscript:/gi, "")

  return sanitized
}

// ============================================================================
// Tool Argument Summarization
// ============================================================================

export interface ToolArgsSummary {
  redactedPreview: string
  argHash: string
  argSizeBytes: number
  truncated: boolean
  sensitiveFieldsDetected: number
  nonce: string
  structureDepth: number
  keyCount: number
  timestamp: number
}

function calculateStructureDepth(value: unknown, depth: number = 0): number {
  if (depth > 100) return depth
  
  if (Array.isArray(value)) {
    return value.reduce<number>((max, item) => Math.max(max, calculateStructureDepth(item, depth + 1)), depth + 1)
  }
  
  if (value && typeof value === "object") {
    const entries = Object.values(value as Record<string, unknown>)
    return entries.reduce<number>((max, item) => Math.max(max, calculateStructureDepth(item, depth + 1)), depth + 1)
  }
  
  return depth
}

function countKeys(value: unknown, count: number = 0): number {
  if (Array.isArray(value)) {
    return value.reduce((acc, item) => countKeys(item, acc), count)
  }
  
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries.reduce((acc, [, item]) => countKeys(item, acc + 1), count)
  }
  
  return count
}

export function summarizeToolArgs(rawArgs: unknown): ToolArgsSummary {
  const redacted = redactSensitive(rawArgs)
  const serialized = stableStringify(redacted)
  const argHash = computeHash(serialized, "sha256")
  const argSizeBytes = Buffer.byteLength(serialized, "utf8")

  // Count redacted fields
  const redactedCount = (serialized.match(/\[REDACTED\]/g) || []).length

  const maxPreviewSize = parseIntEnv(process.env.MCP_MAX_ARG_PREVIEW_SIZE, 4000)
  const truncated = serialized.length > maxPreviewSize

  return {
    redactedPreview: serialized.slice(0, maxPreviewSize),
    argHash,
    argSizeBytes,
    truncated,
    sensitiveFieldsDetected: redactedCount,
    nonce: generateNonce(8),
    structureDepth: calculateStructureDepth(rawArgs),
    keyCount: countKeys(rawArgs),
    timestamp: Date.now(),
  }
}

// ============================================================================
// Realtime Tool Authentication
// ============================================================================

export function shouldRequireRealtimeToolAuth(): boolean {
  const configured = parseBooleanEnv(process.env.REALTIME_TOOLS_REQUIRE_AUTH)
  if (configured !== null) {
    return configured
  }
  return process.env.NODE_ENV === "production"
}

export function getRealtimeToolAuthTimeoutMs(): number {
  return parseIntEnv(process.env.REALTIME_TOOL_AUTH_TIMEOUT_MS, 30_000)
}

export function getRealtimeToolMaxConcurrent(): number {
  return parseIntEnv(process.env.REALTIME_TOOL_MAX_CONCURRENT, 5)
}

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

export function getToolRateLimitPerMinute(): number {
  return parseIntEnv(process.env.MCP_TOOL_RATE_LIMIT_PER_MINUTE, 60)
}

export function getPrivilegedToolRateLimitPerMinute(): number {
  return parseIntEnv(process.env.MCP_PRIVILEGED_TOOL_RATE_LIMIT_PER_MINUTE, 10)
}

export function getDestructiveToolRateLimitPerMinute(): number {
  return parseIntEnv(process.env.MCP_DESTRUCTIVE_TOOL_RATE_LIMIT_PER_MINUTE, 5)
}

export function getDataEgressToolRateLimitPerMinute(): number {
  return parseIntEnv(process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMIT_PER_MINUTE, 20)
}

export function getDataEgressToolRateLimitWindowMs(): number {
  const configured = parseIntEnv(process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMIT_WINDOW_MS, 60_000)
  return Math.max(1_000, configured)
}

export function getMcpDataEgressToolRateLimitOverrides(): Map<string, number> {
  return parseToolRateLimitMap(process.env.MCP_DATA_EGRESS_TOOL_RATE_LIMITS)
}

export function getDataEgressToolRateLimitPerMinuteForTool(toolName: string): number {
  const normalized = normalizeToolName(toolName)
  if (!normalized) {
    return getDataEgressToolRateLimitPerMinute()
  }

  const overrides = getMcpDataEgressToolRateLimitOverrides()
  const override = overrides.get(normalized)
  if (override && override > 0) {
    return override
  }

  return getDataEgressToolRateLimitPerMinute()
}

// ============================================================================
// Session and Context Tracking
// ============================================================================

export interface ToolExecutionContext {
  sessionId: string
  userId?: string
  toolName: string
  toolArgs: unknown
  timestamp: number
  requestId: string
  parentRequestId?: string
  clientIp?: string
  userAgent?: string
}

export function createToolExecutionContext(
  toolName: string,
  toolArgs: unknown,
  options: Partial<ToolExecutionContext> = {}
): ToolExecutionContext {
  return {
    sessionId: options.sessionId || generateSecureToken(16),
    userId: options.userId,
    toolName,
    toolArgs,
    timestamp: Date.now(),
    requestId: options.requestId || generateSecureToken(16),
    parentRequestId: options.parentRequestId,
    clientIp: options.clientIp,
    userAgent: options.userAgent,
  }
}

// ============================================================================
// Audit Logging
// ============================================================================

export interface ToolAuditEntry {
  timestamp: number
  eventType: "tool_request" | "tool_approval" | "tool_execution" | "tool_blocked" | "tool_error"
  toolName: string
  context: ToolExecutionContext
  securityCheckResult?: ToolSecurityCheckResult
  outcome?: "success" | "failure" | "timeout" | "rejected"
  error?: string
  durationMs?: number
}

export function createAuditEntry(
  eventType: ToolAuditEntry["eventType"],
  toolName: string,
  context: ToolExecutionContext,
  additionalData: Partial<ToolAuditEntry> = {}
): ToolAuditEntry {
  return {
    timestamp: Date.now(),
    eventType,
    toolName,
    context,
    ...additionalData,
  }
}

// ============================================================================
// Comprehensive Security Check
// ============================================================================

export interface ToolSecurityCheckResult {
  allowed: boolean
  requiresApproval: boolean
  isPrivileged: boolean
  isDestructive: boolean
  isDataEgress: boolean
  injectionRisk: InjectionInspectionResult
  egressRisk: DataEgressRiskResult
  blockedReasons: string[]
  warnings: string[]
  recommendedRateLimit: number
  requiredApprovalLevel: "none" | "standard" | "elevated" | "admin"
  securityScore: number
}

export function performToolSecurityCheck(
  toolName: string,
  toolArgs: unknown,
): ToolSecurityCheckResult {
  const blockedReasons: string[] = []
  const warnings: string[] = []

  // Check if tool is allowed
  const allowed = isToolAllowedByPolicy(toolName) && isToolAllowedByPatternPolicy(toolName)
  if (!allowed) {
    blockedReasons.push(`Tool "${toolName}" is not allowed by policy`)
  }

  // Check if privileged
  const isPrivileged = isPrivilegedToolByPolicy(toolName)
  const isDestructive = isDestructiveToolByPolicy(toolName)
  
  let requiresApproval = false
  let requiredApprovalLevel: ToolSecurityCheckResult["requiredApprovalLevel"] = "none"
  
  if (isDestructive && shouldRequireDestructiveToolApproval()) {
    requiresApproval = true
    requiredApprovalLevel = "admin"
  } else if (isPrivileged && shouldRequirePrivilegedToolApproval()) {
    requiresApproval = true
    requiredApprovalLevel = isDestructive ? "elevated" : "standard"
  }

  // Check if data egress
  const isDataEgress = isDataEgressToolByPolicy(toolName)

  // Check for injection
  const injectionRisk = inspectToolArgumentsForInjection(toolArgs)
  if (injectionRisk.blocked) {
    blockedReasons.push(`Suspicious patterns detected in tool arguments: ${injectionRisk.categories.join(", ")}`)
  } else if (injectionRisk.reasons.length > 0) {
    warnings.push(`Potential injection patterns detected (not blocked): ${injectionRisk.reasons.length} findings`)
  }

  // Check for data egress risks
  const egressRisk = inspectDataEgressRisk(toolArgs)
  if (egressRisk.flagged && egressRisk.recommendedAction === "block") {
    blockedReasons.push(`Data egress risk detected: ${egressRisk.severity} severity`)
  } else if (egressRisk.flagged && egressRisk.recommendedAction === "quarantine") {
    blockedReasons.push(`Critical data egress risk detected: quarantine required`)
  } else if (egressRisk.reasons.length > 0) {
    warnings.push(`Potential sensitive data in arguments: ${egressRisk.reasons.length} findings`)
  }

  // Check argument size
  const serialized = stableStringify(toolArgs)
  const argSize = Buffer.byteLength(serialized, "utf8")
  const maxSize = getMaxToolArgSizeBytes()
  if (argSize > maxSize) {
    blockedReasons.push(`Tool argument size (${argSize} bytes) exceeds maximum allowed (${maxSize} bytes)`)
  }

  // Determine recommended rate limit
  let recommendedRateLimit = getToolRateLimitPerMinute()
  if (isDestructive) {
    recommendedRateLimit = Math.min(recommendedRateLimit, getDestructiveToolRateLimitPerMinute())
  } else if (isPrivileged) {
    recommendedRateLimit = Math.min(recommendedRateLimit, getPrivilegedToolRateLimitPerMinute())
  }
  if (isDataEgress) {
    recommendedRateLimit = Math.min(
      recommendedRateLimit,
      getDataEgressToolRateLimitPerMinuteForTool(toolName),
    )
  }

  // Calculate security score (100 = perfectly safe, 0 = extremely risky)
  let securityScore = 100
  securityScore -= injectionRisk.riskScore * 0.4
  securityScore -= (egressRisk.reasons.length * 5)
  if (isDestructive) securityScore -= 15
  if (isPrivileged) securityScore -= 10
  if (isDataEgress) securityScore -= 10
  if (blockedReasons.length > 0) securityScore -= 20
  securityScore = Math.max(0, Math.min(100, securityScore))

  return {
    allowed: allowed && blockedReasons.length === 0,
    requiresApproval,
    isPrivileged,
    isDestructive,
    isDataEgress,
    injectionRisk,
    egressRisk,
    blockedReasons,
    warnings,
    recommendedRateLimit,
    requiredApprovalLevel,
    securityScore: Math.round(securityScore),
  }
}

// ============================================================================
// Tool Execution Wrapper
// ============================================================================

export interface ToolExecutionOptions {
  bypassSecurityCheck?: boolean
  forceApproval?: boolean
  timeout?: number
  context?: Partial<ToolExecutionContext>
}

export interface ToolExecutionResult<T = unknown> {
  success: boolean
  result?: T
  error?: string
  securityCheck: ToolSecurityCheckResult
  executionContext: ToolExecutionContext
  durationMs: number
  auditEntry: ToolAuditEntry
}

export async function executeToolWithSecurityCheck<T>(
  toolName: string,
  toolArgs: unknown,
  executor: () => Promise<T>,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult<T>> {
  const startTime = Date.now()
  const context = createToolExecutionContext(toolName, toolArgs, options.context)
  
  // Perform security check
  const securityCheck = options.bypassSecurityCheck 
    ? {
        allowed: true,
        requiresApproval: false,
        isPrivileged: false,
        isDestructive: false,
        isDataEgress: false,
        injectionRisk: { blocked: false, reasons: [], riskScore: 0, categories: [], severity: "none" as const, mitigations: [] },
        egressRisk: { flagged: false, reasons: [], severity: "low" as const, recommendedAction: "allow" as const, detectedPatterns: [], affectedPaths: [] },
        blockedReasons: [],
        warnings: [],
        recommendedRateLimit: 60,
        requiredApprovalLevel: "none" as const,
        securityScore: 100,
      }
    : performToolSecurityCheck(toolName, toolArgs)

  if (!securityCheck.allowed) {
    const auditEntry = createAuditEntry("tool_blocked", toolName, context, {
      securityCheckResult: securityCheck,
      outcome: "rejected",
    })
    
    return {
      success: false,
      error: `Tool execution blocked: ${securityCheck.blockedReasons.join("; ")}`,
      securityCheck,
      executionContext: context,
      durationMs: Date.now() - startTime,
      auditEntry,
    }
  }

  if (securityCheck.requiresApproval && !options.forceApproval) {
    const auditEntry = createAuditEntry("tool_approval", toolName, context, {
      securityCheckResult: securityCheck,
      outcome: "rejected",
    })
    
    return {
      success: false,
      error: `Tool requires ${securityCheck.requiredApprovalLevel} approval`,
      securityCheck,
      executionContext: context,
      durationMs: Date.now() - startTime,
      auditEntry,
    }
  }

  try {
    const timeout = options.timeout || (securityCheck.isDestructive ? getDestructiveToolApprovalTimeoutMs() : getPrivilegedToolApprovalTimeoutMs())
    
    const result = await Promise.race([
      executor(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Tool execution timeout")), timeout)
      ),
    ])

    const auditEntry = createAuditEntry("tool_execution", toolName, context, {
      securityCheckResult: securityCheck,
      outcome: "success",
      durationMs: Date.now() - startTime,
    })

    return {
      success: true,
      result,
      securityCheck,
      executionContext: context,
      durationMs: Date.now() - startTime,
      auditEntry,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    const auditEntry = createAuditEntry("tool_error", toolName, context, {
      securityCheckResult: securityCheck,
      outcome: "failure",
      error: errorMessage,
      durationMs: Date.now() - startTime,
    })

    return {
      success: false,
      error: errorMessage,
      securityCheck,
      executionContext: context,
      durationMs: Date.now() - startTime,
      auditEntry,
    }
  }
}

// ============================================================================
// Utility Exports
// ============================================================================

export {
  calculateStructureDepth, computeHash,
  computeHmac, countKeys, generateNonce,
  generateSecureToken, isToolMatchingPattern, normalizeToolName, redactSensitive,
  redactSensitiveValue, stableStringify, validateArgStructure
}
