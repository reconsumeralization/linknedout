/**
 * Tool Authorization Gate -- infrastructure-level permission system.
 *
 * The INFRASTRUCTURE decides what the agent is allowed to do, not the agent.
 * This is the answer to Meta's Sev 1: "who defends the system from the agent?"
 *
 * Key design decisions:
 *   - Permissions are session-only (Map in memory, NOT localStorage)
 *   - Kill switch immediately revokes everything and halts all actions
 *   - Full audit trail of every permission request, grant, and denial
 *   - Default policy is conservative: unknown tools require confirmation
 */

import type { CircuitState } from "./circuit-breaker"
import type { AIAction } from "./love-invariant"
import { classifyAction, type RiskLevel } from "./action-classifier"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What the infrastructure allows for a given tool invocation */
export type ToolPermission = "auto" | "confirm" | "deny"

/** Context available when making an authorization decision */
export interface AuthContext {
  userId: string
  activeView: string
  circuitState: CircuitState
  consecutiveFailures: number
  isIrreversible: boolean
  estimatedCost: number
}

/** The result of a permission request */
export interface AuthDecision {
  permission: ToolPermission
  toolId: string
  reason: string
  riskLevel: RiskLevel
  timestamp: string
  /** If "confirm", the UI must show this to the user */
  confirmationMessage?: string
}

/** Audit trail entry */
export interface PermissionEntry {
  timestamp: string
  toolId: string
  action: "requested" | "granted" | "denied" | "revoked" | "kill-switch"
  permission: ToolPermission
  reason: string
  riskLevel: RiskLevel
  /** Who/what made this decision */
  decidedBy: "policy" | "user" | "kill-switch"
}

/** Policy interface -- pluggable authorization strategies */
export interface ToolAuthPolicy {
  getPermission(toolId: string, context: AuthContext): ToolPermission
}

// ---------------------------------------------------------------------------
// Default Policy
// ---------------------------------------------------------------------------

/**
 * DefaultPolicy implements sensible defaults:
 *   - Read operations -> "auto"
 *   - Write operations -> "confirm" first time, then "auto" for same tool in session
 *   - Delete operations -> always "confirm"
 *   - External operations (send/post/publish/email) -> always "confirm"
 *   - Circuit breaker open -> "deny"
 *   - Irreversible + no reasoning -> "deny"
 */
export class DefaultPolicy implements ToolAuthPolicy {
  getPermission(toolId: string, context: AuthContext): ToolPermission {
    // Hard deny: circuit breaker is open
    if (context.circuitState === "open") {
      return "deny"
    }

    // Hard deny: irreversible action with excessive failures
    if (context.isIrreversible && context.consecutiveFailures >= 2) {
      return "deny"
    }

    // Classify the action to determine risk
    const classification = classifyAction(toolId)

    switch (classification.riskLevel) {
      case "critical":
        // Destructive operations ALWAYS require confirmation
        return "confirm"

      case "dangerous":
        // External operations ALWAYS require confirmation
        return "confirm"

      case "moderate":
        // Write operations require confirmation (session grant handled by the gate)
        return "confirm"

      case "safe":
        // Read-only operations are auto-approved
        return "auto"

      default:
        // Unknown -> confirm (conservative)
        return "confirm"
    }
  }
}

// ---------------------------------------------------------------------------
// Tool Authorization Gate
// ---------------------------------------------------------------------------

export class ToolAuthGate {
  private policy: ToolAuthPolicy
  /** Session-scoped granted permissions (toolId -> true). In memory only. */
  private sessionGrants: Map<string, boolean> = new Map()
  /** Explicit denials that override session grants */
  private explicitDenials: Set<string> = new Set()
  /** Full audit trail */
  private log: PermissionEntry[] = []
  /** Kill switch state -- when true, EVERYTHING is denied */
  private killed = false

  constructor(policy?: ToolAuthPolicy) {
    this.policy = policy ?? new DefaultPolicy()
  }

  /**
   * Request permission for a tool to execute an action.
   * This is the SINGLE entry point for all tool authorization.
   */
  requestPermission(toolId: string, action: AIAction): AuthDecision {
    const now = new Date().toISOString()
    const classification = classifyAction(toolId, action.meta ?? {})

    // Kill switch overrides everything
    if (this.killed) {
      this.addLog(toolId, "denied", "deny", "Kill switch active -- ALL actions halted.", classification.riskLevel, "kill-switch")
      return {
        permission: "deny",
        toolId,
        reason: "Kill switch active -- ALL actions are halted. Manual reset required.",
        riskLevel: classification.riskLevel,
        timestamp: now,
      }
    }

    // Explicit denial overrides everything except kill switch
    if (this.explicitDenials.has(toolId)) {
      this.addLog(toolId, "denied", "deny", "Tool explicitly denied by user.", classification.riskLevel, "user")
      return {
        permission: "deny",
        toolId,
        reason: `Tool "${toolId}" has been explicitly denied by user.`,
        riskLevel: classification.riskLevel,
        timestamp: now,
      }
    }

    // Build context for policy evaluation
    const context: AuthContext = {
      userId: "current-user", // In a real app, from auth session
      activeView: "unknown",
      circuitState: "closed", // Caller should provide real state
      consecutiveFailures: 0,
      isIrreversible: !action.reversible,
      estimatedCost: 0,
    }

    // Get policy decision
    const policyDecision = this.policy.getPermission(toolId, context)

    // If policy says confirm, check if we have a session grant
    if (policyDecision === "confirm" && this.sessionGrants.has(toolId)) {
      // Session grant exists -- but CRITICAL and DANGEROUS always require confirmation
      if (classification.riskLevel === "critical" || classification.riskLevel === "dangerous") {
        // No session bypass for critical/dangerous -- always confirm
        this.addLog(toolId, "requested", "confirm", `${classification.riskLevel} action always requires confirmation.`, classification.riskLevel, "policy")
        return {
          permission: "confirm",
          toolId,
          reason: `${classification.riskLevel} operations always require explicit confirmation.`,
          riskLevel: classification.riskLevel,
          timestamp: now,
          confirmationMessage: `${action.label || toolId}: ${classification.description}`,
        }
      }

      // Moderate with session grant -> auto
      this.addLog(toolId, "granted", "auto", "Session grant active for this tool.", classification.riskLevel, "policy")
      return {
        permission: "auto",
        toolId,
        reason: "Approved via session grant.",
        riskLevel: classification.riskLevel,
        timestamp: now,
      }
    }

    // Log and return the policy decision
    if (policyDecision === "auto") {
      this.addLog(toolId, "granted", "auto", "Policy auto-approved (safe operation).", classification.riskLevel, "policy")
    } else if (policyDecision === "deny") {
      this.addLog(toolId, "denied", "deny", "Policy denied this action.", classification.riskLevel, "policy")
    } else {
      this.addLog(toolId, "requested", "confirm", "Policy requires user confirmation.", classification.riskLevel, "policy")
    }

    return {
      permission: policyDecision,
      toolId,
      reason:
        policyDecision === "auto"
          ? "Auto-approved by policy."
          : policyDecision === "deny"
            ? "Denied by policy."
            : "User confirmation required.",
      riskLevel: classification.riskLevel,
      timestamp: now,
      confirmationMessage:
        policyDecision === "confirm"
          ? `${action.label || toolId}: ${classification.description}`
          : undefined,
    }
  }

  /**
   * Grant session-level permission for a tool.
   * Called when user clicks "Allow for Session" in the auth gate dialog.
   * Only applies to moderate-risk tools; critical/dangerous still require per-use confirmation.
   */
  grantSessionPermission(toolId: string): void {
    if (this.killed) return // Cannot grant when killed
    this.sessionGrants.set(toolId, true)
    this.explicitDenials.delete(toolId)
    const classification = classifyAction(toolId)
    this.addLog(toolId, "granted", "auto", "User granted session permission.", classification.riskLevel, "user")
  }

  /**
   * Revoke permission for a specific tool.
   * Called when user explicitly denies a tool.
   */
  revokePermission(toolId: string): void {
    this.sessionGrants.delete(toolId)
    this.explicitDenials.add(toolId)
    const classification = classifyAction(toolId)
    this.addLog(toolId, "revoked", "deny", "User revoked permission.", classification.riskLevel, "user")
  }

  /**
   * KILL SWITCH -- immediately revoke ALL permissions and halt all actions.
   *
   * This is the answer to Meta's "STOP OPENCLAW" -- but it actually works
   * because it's infrastructure, not a request to the agent.
   */
  KILL_SWITCH(): void {
    this.killed = true
    this.sessionGrants.clear()
    this.explicitDenials.clear()

    this.addLog(
      "*",
      "kill-switch",
      "deny",
      "KILL SWITCH ACTIVATED -- all permissions revoked, all actions halted.",
      "critical",
      "kill-switch",
    )
  }

  /** Is the kill switch currently active? */
  isKilled(): boolean {
    return this.killed
  }

  /**
   * Reset the kill switch -- requires explicit human action.
   * This is intentionally NOT something the agent can call.
   */
  resetKillSwitch(): void {
    this.killed = false
    this.addLog(
      "*",
      "granted",
      "auto",
      "Kill switch reset by user -- normal operation resumed.",
      "safe",
      "user",
    )
  }

  /** Get the full permission audit log. */
  getPermissionLog(): PermissionEntry[] {
    return [...this.log]
  }

  /** Get recent log entries (most recent first). */
  getRecentLog(count = 10): PermissionEntry[] {
    return this.log.slice(-count).reverse()
  }

  /** Check if a tool has a session grant (without triggering a full policy check). */
  hasSessionGrant(toolId: string): boolean {
    return this.sessionGrants.has(toolId) && !this.explicitDenials.has(toolId)
  }

  // ---- Internals -----------------------------------------------------------

  private addLog(
    toolId: string,
    action: PermissionEntry["action"],
    permission: ToolPermission,
    reason: string,
    riskLevel: RiskLevel,
    decidedBy: PermissionEntry["decidedBy"],
  ): void {
    this.log.push({
      timestamp: new Date().toISOString(),
      toolId,
      action,
      permission,
      reason,
      riskLevel,
      decidedBy,
    })
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _global: ToolAuthGate | null = null

/** Get (or create) the app-wide tool authorization gate. */
export function getToolAuthGate(policy?: ToolAuthPolicy): ToolAuthGate {
  if (!_global) {
    _global = new ToolAuthGate(policy)
  }
  return _global
}

/** Replace the global instance (useful in tests). */
export function resetGlobalToolAuthGate(): void {
  _global = null
}
