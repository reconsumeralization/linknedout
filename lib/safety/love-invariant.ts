/**
 * Love Invariant — structural safety constraint for AI systems.
 *
 * Two rules:
 *   1. Bounded Asymmetry  — every AI action must be legible to the human; no black-box manipulation.
 *   2. Preserved Agency    — the human always has final say; AI cannot trap or coerce.
 *
 * This module provides types, validators, cost estimation, halt logic, and transparency reporting
 * that other AI-touching code in LinkedOut imports before executing any action.
 */

import { classifyAction } from "./action-classifier"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a single AI action before it is executed. */
export interface AIAction {
  /** Stable machine-readable id, e.g. "send-email" or "generate-tribe" */
  id: string
  /** Human-readable description shown in the transparency log */
  label: string
  /** Which tool / subsystem originates this action */
  tool: string
  /** Free-form reasoning the AI can attach to explain *why* it wants to do this */
  reasoning: string
  /** Estimated token cost (prompt + completion) */
  estimatedTokens: number
  /** Is this action reversible? Irreversible actions get extra scrutiny. */
  reversible: boolean
  /** Optional metadata blob */
  meta?: Record<string, unknown>
}

/** Result of validating an action against the Love Invariant. */
export interface SafetyResult {
  allowed: boolean
  violations: SafetyViolation[]
  /** Human-readable summary suitable for a toast / log entry */
  summary: string
  /** Risk level from action classification (if available) */
  riskLevel?: import("./action-classifier").RiskLevel
  /** Whether user confirmation is required before execution */
  requiresConfirmation?: boolean
}

export interface SafetyViolation {
  rule: "bounded-asymmetry" | "preserved-agency"
  severity: "warning" | "block"
  message: string
}

/** Honest cost estimate with confidence interval. */
export interface CostEstimate {
  estimatedTokens: number
  estimatedCostUsd: number
  /** 90 % confidence interval */
  confidenceLow: number
  confidenceHigh: number
  /** Model used for pricing */
  model: string
  /** Per-1K-token price used */
  ratePer1kTokens: number
}

/** Snapshot of the current execution environment used by shouldHalt. */
export interface ExecutionContext {
  /** Total tokens consumed so far in this session */
  totalTokensUsed: number
  /** Original budget / estimate for the session */
  tokenBudget: number
  /** Consecutive failures on the *current* task */
  consecutiveFailures: number
  /** Wall-clock seconds elapsed */
  elapsedSeconds: number
  /** Maximum allowed seconds (0 = unlimited) */
  maxSeconds: number
}

export interface HaltDecision {
  shouldHalt: boolean
  reason: string
  severity: "info" | "warning" | "critical"
}

export interface TransparencyReport {
  generatedAt: string
  totalActions: number
  successCount: number
  failureCount: number
  totalTokensUsed: number
  totalCostUsd: number
  actions: TransparencyEntry[]
}

export interface TransparencyEntry {
  timestamp: string
  action: AIAction
  result: "success" | "failure" | "blocked"
  tokensUsed: number
  costUsd: number
  durationMs: number
  reasoning: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONSECUTIVE_FAILURES = 3
const COST_OVERRUN_HALT_MULTIPLIER = 2.0
const COST_WARNING_MULTIPLIER = 1.5

/** Default pricing: GPT-4o-mini blended rate */
const DEFAULT_RATE_PER_1K = 0.00015
const DEFAULT_MODEL = "gpt-4o-mini"

// ---------------------------------------------------------------------------
// Core Love Invariant
// ---------------------------------------------------------------------------

export interface LoveInvariant {
  boundedAsymmetry(action: AIAction): SafetyViolation[]
  preservedAgency(action: AIAction): SafetyViolation[]
}

const loveInvariant: LoveInvariant = {
  /**
   * Rule 1 — Bounded Asymmetry
   * The action must be fully legible: it needs a human-readable label,
   * a stated reasoning, and a cost estimate.  Irreversible actions with
   * no reasoning are blocked outright.
   */
  boundedAsymmetry(action: AIAction): SafetyViolation[] {
    const violations: SafetyViolation[] = []

    if (!action.label || action.label.trim().length === 0) {
      violations.push({
        rule: "bounded-asymmetry",
        severity: "block",
        message: "Action has no human-readable label — it would be invisible to the user.",
      })
    }

    if (!action.reasoning || action.reasoning.trim().length === 0) {
      violations.push({
        rule: "bounded-asymmetry",
        severity: action.reversible ? "warning" : "block",
        message: "Action has no stated reasoning. Users deserve to know *why* the AI wants to do this.",
      })
    }

    if (action.estimatedTokens <= 0) {
      violations.push({
        rule: "bounded-asymmetry",
        severity: "warning",
        message: "No cost estimate provided — the user cannot make an informed decision about resource usage.",
      })
    }

    return violations
  },

  /**
   * Rule 2 — Preserved Agency
   * The human must always be able to say no.  Irreversible actions with
   * no label or reasoning are especially dangerous.
   */
  preservedAgency(action: AIAction): SafetyViolation[] {
    const violations: SafetyViolation[] = []

    if (!action.reversible && !action.reasoning) {
      violations.push({
        rule: "preserved-agency",
        severity: "block",
        message: "Irreversible action with no reasoning — the user cannot give informed consent.",
      })
    }

    if (!action.reversible && (!action.label || action.label.trim().length === 0)) {
      violations.push({
        rule: "preserved-agency",
        severity: "block",
        message: "Irreversible action with no label — the user cannot even see what would happen.",
      })
    }

    return violations
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an AI action against both Love Invariant rules.
 * Returns a SafetyResult — if `allowed` is false, the action MUST NOT proceed.
 */
export function validateAction(action: AIAction): SafetyResult {
  const violations = [
    ...loveInvariant.boundedAsymmetry(action),
    ...loveInvariant.preservedAgency(action),
  ]

  // Classify the action by risk level
  const classification = classifyAction(action.tool, action.meta ?? {})

  // Rule 3: Critical actions with no user confirmation path are blocked.
  // The infrastructure decides, not the agent.
  if (
    classification.riskLevel === "critical" &&
    !action.reversible &&
    (!action.reasoning || action.reasoning.trim().length === 0)
  ) {
    violations.push({
      rule: "preserved-agency",
      severity: "block",
      message: `Critical action "${action.tool}" requires explicit user confirmation and stated reasoning -- blocked by infrastructure.`,
    })
  }

  const blocked = violations.some((v) => v.severity === "block")

  return {
    allowed: !blocked,
    violations,
    riskLevel: classification.riskLevel,
    requiresConfirmation: classification.requiresConfirmation,
    summary: blocked
      ? `Blocked: ${violations.filter((v) => v.severity === "block").map((v) => v.message).join("; ")}`
      : violations.length > 0
        ? `Allowed with warnings: ${violations.map((v) => v.message).join("; ")}`
        : "Action passes all Love Invariant checks.",
  }
}

/**
 * Produce an honest cost estimate with a 90 % confidence interval.
 */
export function getCostEstimate(
  action: AIAction,
  opts?: { ratePer1kTokens?: number; model?: string },
): CostEstimate {
  const rate = opts?.ratePer1kTokens ?? DEFAULT_RATE_PER_1K
  const model = opts?.model ?? DEFAULT_MODEL
  const tokens = Math.max(action.estimatedTokens, 0)
  const costUsd = (tokens / 1000) * rate

  return {
    estimatedTokens: tokens,
    estimatedCostUsd: costUsd,
    confidenceLow: costUsd * 0.7,
    confidenceHigh: costUsd * 1.5,
    model,
    ratePer1kTokens: rate,
  }
}

/**
 * Decide whether the AI should halt given the current execution context.
 */
export function shouldHalt(ctx: ExecutionContext): HaltDecision {
  // Too many consecutive failures on the same task
  if (ctx.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return {
      shouldHalt: true,
      reason: `${ctx.consecutiveFailures} consecutive failures — halting to preserve user agency.`,
      severity: "critical",
    }
  }

  // Cost overrun — hard halt at 2x
  if (ctx.tokenBudget > 0 && ctx.totalTokensUsed >= ctx.tokenBudget * COST_OVERRUN_HALT_MULTIPLIER) {
    return {
      shouldHalt: true,
      reason: `Token usage (${ctx.totalTokensUsed}) has reached ${COST_OVERRUN_HALT_MULTIPLIER}x the budget (${ctx.tokenBudget}). Halting to protect user resources.`,
      severity: "critical",
    }
  }

  // Cost warning at 1.5x
  if (ctx.tokenBudget > 0 && ctx.totalTokensUsed >= ctx.tokenBudget * COST_WARNING_MULTIPLIER) {
    return {
      shouldHalt: false,
      reason: `Token usage (${ctx.totalTokensUsed}) has reached ${COST_WARNING_MULTIPLIER}x the budget (${ctx.tokenBudget}). Consider wrapping up.`,
      severity: "warning",
    }
  }

  // Time limit
  if (ctx.maxSeconds > 0 && ctx.elapsedSeconds >= ctx.maxSeconds) {
    return {
      shouldHalt: true,
      reason: `Time limit of ${ctx.maxSeconds}s exceeded (${ctx.elapsedSeconds}s elapsed).`,
      severity: "critical",
    }
  }

  return { shouldHalt: false, reason: "All metrics within bounds.", severity: "info" }
}

/**
 * Build a transparency report from a list of logged entries.
 * (Entries are provided by the TransparencyLogger — this function is pure.)
 */
export function getTransparencyReport(entries: TransparencyEntry[]): TransparencyReport {
  const successCount = entries.filter((e) => e.result === "success").length
  const failureCount = entries.filter((e) => e.result === "failure").length
  const totalTokensUsed = entries.reduce((sum, e) => sum + e.tokensUsed, 0)
  const totalCostUsd = entries.reduce((sum, e) => sum + e.costUsd, 0)

  return {
    generatedAt: new Date().toISOString(),
    totalActions: entries.length,
    successCount,
    failureCount,
    totalTokensUsed,
    totalCostUsd,
    actions: entries,
  }
}
