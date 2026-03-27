/**
 * Circuit Breaker — automatic halt mechanism for AI actions.
 *
 * Tracks consecutive failures per tool/action and token/cost consumption.
 * Prevents runaway AI behavior by opening the circuit when thresholds are exceeded.
 *
 * States:
 *   CLOSED  — normal operation, actions flow through
 *   OPEN    — halted, all actions are rejected until manual reset
 *   WARNING — still allowing actions but approaching limits
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CircuitState = "closed" | "warning" | "open"

export interface CircuitStatus {
  state: CircuitState
  /** Per-tool failure counts */
  failureCounts: Record<string, number>
  /** Total tokens consumed */
  totalTokensUsed: number
  /** Original token budget */
  tokenBudget: number
  /** Ratio of used / budget (0 if no budget) */
  usageRatio: number
  /** Human-readable reason if not closed */
  reason: string
  /** Timestamp of last state change */
  lastStateChange: string
}

export interface AttemptResult {
  allowed: boolean
  state: CircuitState
  reason: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_FAILURES = 3
const WARNING_MULTIPLIER = 1.5
const HALT_MULTIPLIER = 2.0

// ---------------------------------------------------------------------------
// CircuitBreaker class
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  private failureCounts: Map<string, number> = new Map()
  private totalTokensUsed = 0
  private tokenBudget: number
  private maxFailures: number
  private state: CircuitState = "closed"
  private reason = ""
  private lastStateChange: string = new Date().toISOString()
  private listeners: Set<(status: CircuitStatus) => void> = new Set()

  constructor(opts?: { tokenBudget?: number; maxFailures?: number }) {
    this.tokenBudget = opts?.tokenBudget ?? 0
    this.maxFailures = opts?.maxFailures ?? DEFAULT_MAX_FAILURES
  }

  // ---- Public API ----------------------------------------------------------

  /**
   * Check whether an action for the given tool is allowed to proceed.
   * Returns an AttemptResult — caller must respect `allowed: false`.
   */
  attempt(tool: string): AttemptResult {
    if (this.state === "open") {
      return { allowed: false, state: "open", reason: this.reason }
    }

    const failures = this.failureCounts.get(tool) ?? 0
    if (failures >= this.maxFailures) {
      this.open(`Tool "${tool}" has ${failures} consecutive failures (limit: ${this.maxFailures}).`)
      return { allowed: false, state: "open", reason: this.reason }
    }

    return { allowed: true, state: this.state, reason: "" }
  }

  /** Record a successful action — resets the failure counter for the tool. */
  recordSuccess(tool: string, tokensUsed = 0): void {
    this.failureCounts.set(tool, 0)
    this.addTokens(tokensUsed)
  }

  /** Record a failed action — increments the consecutive failure counter. */
  recordFailure(tool: string, tokensUsed = 0): void {
    const current = this.failureCounts.get(tool) ?? 0
    const next = current + 1
    this.failureCounts.set(tool, next)
    this.addTokens(tokensUsed)

    if (next >= this.maxFailures) {
      this.open(`Tool "${tool}" hit ${next} consecutive failures.`)
    }
  }

  /** Is the circuit currently open (halted)? */
  isOpen(): boolean {
    return this.state === "open"
  }

  /** Get the current state label. */
  getState(): CircuitState {
    return this.state
  }

  /** Full status snapshot. */
  getStatus(): CircuitStatus {
    const usageRatio = this.tokenBudget > 0 ? this.totalTokensUsed / this.tokenBudget : 0
    return {
      state: this.state,
      failureCounts: Object.fromEntries(this.failureCounts),
      totalTokensUsed: this.totalTokensUsed,
      tokenBudget: this.tokenBudget,
      usageRatio,
      reason: this.reason,
      lastStateChange: this.lastStateChange,
    }
  }

  /** Reset the breaker to closed — manual human action. */
  reset(): void {
    this.failureCounts.clear()
    this.totalTokensUsed = 0
    this.setState("closed", "Manually reset by user.")
  }

  /** Reset only a specific tool's failure count. */
  resetTool(tool: string): void {
    this.failureCounts.delete(tool)
    // Re-evaluate state
    if (this.state === "open") {
      const anyOverLimit = [...this.failureCounts.values()].some((c) => c >= this.maxFailures)
      if (!anyOverLimit && !this.isCostOverrun()) {
        this.setState("closed", `Tool "${tool}" reset; no remaining violations.`)
      }
    }
  }

  /** Update the token budget (e.g. user increases it mid-session). */
  setTokenBudget(budget: number): void {
    this.tokenBudget = budget
    // Re-evaluate cost state
    if (!this.isCostOverrun() && !this.hasFailureOverrun()) {
      if (this.state === "open" || this.state === "warning") {
        this.setState("closed", "Budget updated; within limits.")
      }
    }
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(listener: (status: CircuitStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ---- Internals -----------------------------------------------------------

  private addTokens(tokens: number): void {
    if (tokens <= 0) return
    this.totalTokensUsed += tokens

    if (this.tokenBudget > 0) {
      const ratio = this.totalTokensUsed / this.tokenBudget
      if (ratio >= HALT_MULTIPLIER) {
        this.open(
          `Token usage (${this.totalTokensUsed}) hit ${HALT_MULTIPLIER}x budget (${this.tokenBudget}).`,
        )
      } else if (ratio >= WARNING_MULTIPLIER && this.state === "closed") {
        this.setState(
          "warning",
          `Token usage at ${(ratio * 100).toFixed(0)}% of budget — approaching limit.`,
        )
      }
    }
  }

  private open(reason: string): void {
    this.setState("open", reason)
  }

  private setState(next: CircuitState, reason: string): void {
    if (this.state === next && this.reason === reason) return
    this.state = next
    this.reason = reason
    this.lastStateChange = new Date().toISOString()
    this.emit()
  }

  private isCostOverrun(): boolean {
    return this.tokenBudget > 0 && this.totalTokensUsed / this.tokenBudget >= HALT_MULTIPLIER
  }

  private hasFailureOverrun(): boolean {
    return [...this.failureCounts.values()].some((c) => c >= this.maxFailures)
  }

  private emit(): void {
    const status = this.getStatus()
    for (const fn of this.listeners) {
      try { fn(status) } catch { /* listener errors are swallowed */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton for app-wide use
// ---------------------------------------------------------------------------

let _global: CircuitBreaker | null = null

/** Get (or create) the app-wide circuit breaker. */
export function getCircuitBreaker(opts?: { tokenBudget?: number; maxFailures?: number }): CircuitBreaker {
  if (!_global) {
    _global = new CircuitBreaker(opts)
  }
  return _global
}

/** Replace the global instance (useful in tests). */
export function resetGlobalCircuitBreaker(): void {
  _global?.reset()
  _global = null
}
