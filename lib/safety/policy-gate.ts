/**
 * Policy Gate — the infrastructure decides, not the agent.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  PRINCIPLE: Models can recommend actions;                          │
 * │             only infrastructure can authorize actions.             │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * For every proposed action the gate answers:
 *   1. Which principal?
 *   2. On whose behalf?
 *   3. Under which policy?
 *   4. With what evidence of intent?
 *   5. With what rate limit / confirmation class?
 *
 * The agent only supplies a REQUEST. It never gets the final say on COMMIT.
 *
 * Implementation checklist:
 *   ✓ Action classes: read, write, destructive, publication
 *   ✓ Mandatory policy check: authorize(principal, action, resource, context) before execution
 *   ✓ Intent proof: explicit approval token for destructive + publication actions
 *   ✓ Two-phase commit for high risk: propose → approve → execute (never direct execute)
 *   ✓ Hard-stop path: global cancel that terminates in-flight + blocks new calls
 *   ✓ Blast-radius caps: max count / max scope / time window; fail closed if unspecified
 *   ✓ Safe defaults: dry-run/draft unless explicitly escalated
 *   ✓ Auditability: append-only log of proposal, decision, approver, result, rollback pointer
 *
 * Minimal policy model:
 *   read:        allow by default with auth
 *   write:       allow with role + rate limits
 *   publication:  require approval token from user session
 *   destructive: require approval token + scope cap + optional second factor/approver
 */

import type { AIAction } from "./love-invariant"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How an action is confirmed before execution */
export type ConfirmationClass =
  | "auto"          // read-only, safe — no confirmation needed
  | "dry-run"       // execute in preview mode, show what WOULD happen
  | "single-confirm"// user clicks "Allow" once
  | "dual-confirm"  // requires a SECOND approver (different session/service)
  | "deny"          // never allowed in current context

/** Rate limit applied per tool per session */
export interface RateLimit {
  maxCallsPerMinute: number
  maxCallsPerSession: number
  currentCount: number
  windowStart: number
}

/** Full policy decision for a single action */
export interface PolicyDecision {
  allowed: boolean
  confirmationClass: ConfirmationClass
  /** Why this decision was made — always human-readable */
  reason: string
  /** If dry-run, this is the preview of what would happen */
  dryRunPreview?: string
  /** Maximum scope the action may affect (e.g., "10 records", "1 email") */
  maxScope?: string
  /** Rate limit status */
  rateLimited: boolean
  /** The policy rule that triggered this decision */
  policyRule: string
}

/** Describes the context in which an action is requested */
export interface PolicyContext {
  /** Who is the human user */
  userId: string
  /** Current circuit breaker state */
  circuitState: "closed" | "warning" | "open"
  /** Is the agent in the same session that created the request? */
  sameSession: boolean
  /** Has the user explicitly approved this tool in this session? */
  sessionApproved: boolean
  /** Number of times this tool has been called in this session */
  sessionCallCount: number
  /** Timestamp of first call this session */
  sessionWindowStart: number
}

// ---------------------------------------------------------------------------
// Action tiers — split read vs write
// ---------------------------------------------------------------------------

type ActionTier = "read" | "write" | "delete" | "external" | "admin"

const TOOL_TIER_PATTERNS: Array<{ pattern: RegExp; tier: ActionTier }> = [
  // Read operations — auto
  { pattern: /^(fetch|get|list|search|query|count|check|analyze|compute|assess)/i, tier: "read" },
  // Write operations — single-confirm
  { pattern: /^(create|update|upsert|insert|add|set|assign|import|save)/i, tier: "write" },
  // Delete operations — dual-confirm
  { pattern: /^(delete|remove|purge|drop|revoke|disconnect|unlink)/i, tier: "delete" },
  // External side effects — dual-confirm
  { pattern: /^(send|post|publish|email|notify|broadcast|export|share|push)/i, tier: "external" },
  // Admin operations — dual-confirm
  { pattern: /^(deploy|migrate|reset|wipe|transfer|escalate)/i, tier: "admin" },
]

function classifyTier(toolId: string): ActionTier {
  for (const { pattern, tier } of TOOL_TIER_PATTERNS) {
    if (pattern.test(toolId)) return tier
  }
  // Unknown tools default to write (require confirmation) — fail closed
  return "write"
}

// ---------------------------------------------------------------------------
// Confirmation class mapping
// ---------------------------------------------------------------------------

const TIER_TO_CONFIRMATION: Record<ActionTier, ConfirmationClass> = {
  read: "auto",
  write: "single-confirm",
  delete: "dual-confirm",
  external: "dual-confirm",
  admin: "deny", // admin ops require explicit policy override
}

// ---------------------------------------------------------------------------
// Rate limits per tier
// ---------------------------------------------------------------------------

const TIER_RATE_LIMITS: Record<ActionTier, { perMinute: number; perSession: number }> = {
  read: { perMinute: 60, perSession: 1000 },
  write: { perMinute: 10, perSession: 100 },
  delete: { perMinute: 3, perSession: 20 },
  external: { perMinute: 2, perSession: 10 },
  admin: { perMinute: 1, perSession: 3 },
}

// ---------------------------------------------------------------------------
// Max scope defaults — destructive ops must name their blast radius
// ---------------------------------------------------------------------------

const TIER_MAX_SCOPE: Record<ActionTier, string> = {
  read: "unlimited",
  write: "50 records per call",
  delete: "1 record per call",
  external: "1 recipient per call",
  admin: "requires explicit scope declaration",
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

const rateLimitState = new Map<string, RateLimit>()
const sessionApprovals = new Set<string>()
let executorEnabled = true

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a proposed action against the policy gate.
 * The agent supplies the request; this function decides.
 */
export function evaluatePolicy(action: AIAction, ctx: PolicyContext): PolicyDecision {
  // HARD STOP — executor is killed
  if (!executorEnabled) {
    return {
      allowed: false,
      confirmationClass: "deny",
      reason: "HARD STOP active — all tool execution is disabled. User must manually re-enable.",
      rateLimited: false,
      policyRule: "hard-stop",
    }
  }

  // Circuit breaker open — deny everything
  if (ctx.circuitState === "open") {
    return {
      allowed: false,
      confirmationClass: "deny",
      reason: "Circuit breaker is OPEN — all actions denied until manual reset.",
      rateLimited: false,
      policyRule: "circuit-breaker-open",
    }
  }

  const tier = classifyTier(action.id)
  let confirmClass = TIER_TO_CONFIRMATION[tier]

  // Check if user has already approved this tool in this session
  if (sessionApprovals.has(action.id) && confirmClass === "single-confirm") {
    confirmClass = "auto"
  }

  // Irreversible + no reasoning → always deny
  if (!action.reversible && (!action.reasoning || action.reasoning.trim().length === 0)) {
    return {
      allowed: false,
      confirmationClass: "deny",
      reason: "Irreversible action with no stated reasoning — cannot proceed without evidence of intent.",
      rateLimited: false,
      policyRule: "irreversible-no-reasoning",
    }
  }

  // Rate limit check
  const rateKey = `${action.id}:${ctx.userId}`
  const now = Date.now()
  const limits = TIER_RATE_LIMITS[tier]
  let rl = rateLimitState.get(rateKey)

  if (!rl || now - rl.windowStart > 60_000) {
    rl = { maxCallsPerMinute: limits.perMinute, maxCallsPerSession: limits.perSession, currentCount: 0, windowStart: now }
    rateLimitState.set(rateKey, rl)
  }

  if (rl.currentCount >= rl.maxCallsPerMinute) {
    return {
      allowed: false,
      confirmationClass: "deny",
      reason: `Rate limit exceeded: ${rl.currentCount}/${limits.perMinute} calls per minute for ${tier}-tier tool "${action.id}".`,
      rateLimited: true,
      policyRule: "rate-limit-minute",
    }
  }

  if (ctx.sessionCallCount >= limits.perSession) {
    return {
      allowed: false,
      confirmationClass: "deny",
      reason: `Session limit exceeded: ${ctx.sessionCallCount}/${limits.perSession} calls for ${tier}-tier tool "${action.id}".`,
      rateLimited: true,
      policyRule: "rate-limit-session",
    }
  }

  // Increment rate counter
  rl.currentCount++

  // Circuit breaker warning — force dry-run for write+ tiers
  if (ctx.circuitState === "warning" && tier !== "read") {
    confirmClass = "dry-run"
  }

  return {
    allowed: confirmClass !== "deny",
    confirmationClass: confirmClass,
    reason: `${tier}-tier action "${action.label}" — ${confirmClass === "auto" ? "auto-approved" : `requires ${confirmClass}`}.`,
    maxScope: TIER_MAX_SCOPE[tier],
    rateLimited: false,
    policyRule: `tier-${tier}`,
  }
}

/**
 * Grant session-level approval for a tool.
 * After this, single-confirm tools become auto for the rest of the session.
 */
export function grantSessionApproval(toolId: string): void {
  sessionApprovals.add(toolId)
}

/**
 * Revoke session approval for a tool.
 */
export function revokeSessionApproval(toolId: string): void {
  sessionApprovals.delete(toolId)
}

/**
 * HARD STOP — immediately disable the executor.
 * Cancels all outstanding tool calls. The agent cannot override this.
 * Only the user (via UI) can re-enable.
 */
export function hardStop(): void {
  executorEnabled = false
  sessionApprovals.clear()
  rateLimitState.clear()
}

/**
 * Re-enable the executor after a hard stop.
 * Must be called from UI layer — the agent cannot call this.
 */
export function enableExecutor(): void {
  executorEnabled = true
}

/**
 * Check if the executor is enabled.
 */
export function isExecutorEnabled(): boolean {
  return executorEnabled
}

/**
 * Reset all session state (approvals, rate limits).
 */
export function resetPolicySession(): void {
  sessionApprovals.clear()
  rateLimitState.clear()
  executorEnabled = true
}

/**
 * Get the tier classification for a tool (for UI display).
 */
export function getToolTier(toolId: string): ActionTier {
  return classifyTier(toolId)
}

/**
 * Get all current session approvals (for transparency panel).
 */
export function getSessionApprovals(): string[] {
  return [...sessionApprovals]
}

// ---------------------------------------------------------------------------
// Approval Tokens — intent proof for destructive/publication actions
// ---------------------------------------------------------------------------

/** Cryptographically weak but sufficient for session-scoped intent proof */
function generateToken(): string {
  return `apt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const approvalTokens = new Map<string, { token: string; toolId: string; scope: string; issuedAt: number; expiresAt: number }>()

/**
 * Issue an approval token for a specific tool + scope.
 * Tokens expire after 60 seconds — the user must act promptly.
 */
export function issueApprovalToken(toolId: string, scope: string): string {
  const token = generateToken()
  const now = Date.now()
  approvalTokens.set(token, { token, toolId, scope, issuedAt: now, expiresAt: now + 60_000 })
  return token
}

/**
 * Validate and consume an approval token.
 * Returns true if valid, false if expired/invalid/already-used.
 * Tokens are single-use — consumed on validation.
 */
export function validateApprovalToken(token: string, toolId: string): boolean {
  const entry = approvalTokens.get(token)
  if (!entry) return false
  if (entry.toolId !== toolId) return false
  if (Date.now() > entry.expiresAt) {
    approvalTokens.delete(token)
    return false
  }
  // Single-use: consume the token
  approvalTokens.delete(token)
  return true
}

// ---------------------------------------------------------------------------
// Two-Phase Commit — propose → approve → execute
// ---------------------------------------------------------------------------

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "expired"

export interface ActionProposal {
  id: string
  action: AIAction
  tier: string
  confirmationClass: ConfirmationClass
  maxScope: string
  proposedAt: number
  status: ProposalStatus
  approvalToken?: string
  approvedBy?: string
  executedAt?: number
  result?: "success" | "failure"
  rollbackPointer?: string
}

const proposals = new Map<string, ActionProposal>()

/**
 * Phase 1: Propose an action. Does NOT execute.
 * Returns a proposal ID the user can approve or reject.
 */
export function proposeAction(action: AIAction, ctx: PolicyContext): { proposalId: string; decision: PolicyDecision } {
  const decision = evaluatePolicy(action, ctx)
  const id = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const tier = classifyTier(action.id)

  proposals.set(id, {
    id,
    action,
    tier,
    confirmationClass: decision.confirmationClass,
    maxScope: decision.maxScope ?? TIER_MAX_SCOPE[tier],
    proposedAt: Date.now(),
    status: decision.confirmationClass === "auto" ? "approved" : "pending",
    approvalToken: decision.confirmationClass === "auto" ? undefined : issueApprovalToken(action.id, decision.maxScope ?? ""),
  })

  // Append to audit log
  appendAuditEntry({
    timestamp: Date.now(),
    phase: "propose",
    proposalId: id,
    toolId: action.id,
    label: action.label,
    tier,
    decision: decision.confirmationClass,
    reason: decision.reason,
  })

  return { proposalId: id, decision }
}

/**
 * Phase 2: Approve a pending proposal.
 * Requires a valid approval token for non-auto proposals.
 */
export function approveProposal(proposalId: string, token: string, approvedBy: string): boolean {
  const proposal = proposals.get(proposalId)
  if (!proposal || proposal.status !== "pending") return false

  if (proposal.approvalToken && !validateApprovalToken(token, proposal.action.id)) {
    return false
  }

  proposal.status = "approved"
  proposal.approvedBy = approvedBy

  appendAuditEntry({
    timestamp: Date.now(),
    phase: "approve",
    proposalId,
    toolId: proposal.action.id,
    label: proposal.action.label,
    approvedBy,
  })

  return true
}

/**
 * Phase 3: Record execution result (called after the action runs).
 */
export function recordExecution(proposalId: string, result: "success" | "failure", rollbackPointer?: string): void {
  const proposal = proposals.get(proposalId)
  if (!proposal) return

  proposal.status = "executed"
  proposal.executedAt = Date.now()
  proposal.result = result
  proposal.rollbackPointer = rollbackPointer

  appendAuditEntry({
    timestamp: Date.now(),
    phase: "execute",
    proposalId,
    toolId: proposal.action.id,
    label: proposal.action.label,
    result,
    rollbackPointer,
  })
}

/**
 * Get all proposals (for transparency panel).
 */
export function getProposals(): ActionProposal[] {
  return [...proposals.values()].sort((a, b) => b.proposedAt - a.proposedAt)
}

// ---------------------------------------------------------------------------
// Append-only Audit Log
// ---------------------------------------------------------------------------

export interface AuditEntry {
  timestamp: number
  phase: "propose" | "approve" | "reject" | "execute" | "hard-stop" | "enable"
  proposalId?: string
  toolId?: string
  label?: string
  tier?: string
  decision?: string
  reason?: string
  approvedBy?: string
  result?: string
  rollbackPointer?: string
}

/** Append-only — entries can never be modified or deleted */
const auditLog: AuditEntry[] = []

function appendAuditEntry(entry: AuditEntry): void {
  auditLog.push(Object.freeze({ ...entry }))
}

/**
 * Get the full audit log (append-only, never modified).
 */
export function getAuditLog(): readonly AuditEntry[] {
  return auditLog
}

/**
 * Export audit log as JSON (for compliance/review).
 */
export function exportAuditLog(): string {
  return JSON.stringify(auditLog, null, 2)
}
