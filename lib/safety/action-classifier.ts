/**
 * Action Classifier -- classifies AI tool actions by risk level.
 *
 * This is infrastructure-level classification: the SYSTEM decides the risk,
 * not the agent.  The agent cannot override or negotiate these classifications.
 *
 * Risk levels:
 *   safe      -- read-only, no side effects
 *   moderate  -- creates or modifies data locally
 *   dangerous -- affects external systems or user-facing state
 *   critical  -- irreversible, destructive, or bulk operations
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = "safe" | "moderate" | "dangerous" | "critical"

export interface ActionClassification {
  riskLevel: RiskLevel
  requiresConfirmation: boolean
  isReversible: boolean
  affectsExternalSystems: boolean
  /** Human-readable explanation of why this risk level was assigned */
  description: string
}

// ---------------------------------------------------------------------------
// Pattern rules (order matters -- first match wins within a tier)
// ---------------------------------------------------------------------------

/** Patterns that indicate critical risk -- irreversible / destructive */
const CRITICAL_PATTERNS = [
  "delete",
  "remove",
  "purge",
  "destroy",
  "drop",
  "wipe",
  "truncate",
  "bulk-delete",
  "mass-delete",
]

/** Patterns that indicate dangerous risk -- external side effects */
const DANGEROUS_PATTERNS = [
  "send",
  "post",
  "publish",
  "email",
  "broadcast",
  "notify",
  "share",
  "export",
  "webhook",
  "forward",
  "submit",
]

/** Patterns that indicate moderate risk -- local writes */
const MODERATE_PATTERNS = [
  "create",
  "update",
  "upsert",
  "edit",
  "modify",
  "set",
  "assign",
  "move",
  "rename",
  "merge",
  "archive",
]

/** Patterns that indicate safe operations -- read-only */
const SAFE_PATTERNS = [
  "fetch",
  "get",
  "list",
  "search",
  "read",
  "find",
  "count",
  "check",
  "validate",
  "analyze",
  "suggest",
  "recommend",
  "preview",
  "inspect",
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(toolId: string, patterns: string[]): boolean {
  const lower = toolId.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

function hasExternalUrl(params: Record<string, unknown>): boolean {
  const json = JSON.stringify(params).toLowerCase()
  return (
    json.includes("http://") ||
    json.includes("https://") ||
    json.includes("mailto:") ||
    json.includes("smtp")
  )
}

function estimateRecordCount(params: Record<string, unknown>): number {
  // Look for arrays, "ids" fields, or "count" / "limit" hints
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) return value.length
    if (
      (key === "count" || key === "limit" || key === "batchSize") &&
      typeof value === "number"
    ) {
      return value
    }
    if (key === "ids" && typeof value === "string") {
      return value.split(",").length
    }
  }
  return 1
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify an AI tool action by risk level.
 *
 * This function is DETERMINISTIC and PURE -- given the same inputs it always
 * returns the same classification.  The agent cannot influence the result.
 */
export function classifyAction(
  toolId: string,
  params: Record<string, unknown> = {},
): ActionClassification {
  const recordCount = estimateRecordCount(params)
  const externalUrl = hasExternalUrl(params)

  // --- Critical: destructive operations ---
  if (matchesAny(toolId, CRITICAL_PATTERNS)) {
    return {
      riskLevel: "critical",
      requiresConfirmation: true,
      isReversible: false,
      affectsExternalSystems: externalUrl,
      description: `Destructive operation "${toolId}" -- data loss is likely irreversible.`,
    }
  }

  // --- Dangerous: external side effects ---
  if (matchesAny(toolId, DANGEROUS_PATTERNS)) {
    return {
      riskLevel: "dangerous",
      requiresConfirmation: true,
      isReversible: false,
      affectsExternalSystems: true,
      description: `External operation "${toolId}" -- affects systems outside LinkedOut.`,
    }
  }

  // --- External URL in any operation bumps to dangerous ---
  if (externalUrl && !matchesAny(toolId, SAFE_PATTERNS)) {
    return {
      riskLevel: "dangerous",
      requiresConfirmation: true,
      isReversible: false,
      affectsExternalSystems: true,
      description: `Operation "${toolId}" targets an external URL -- elevated risk.`,
    }
  }

  // --- Moderate: local writes ---
  if (matchesAny(toolId, MODERATE_PATTERNS)) {
    const effectiveRisk: RiskLevel = recordCount > 10 ? "dangerous" : "moderate"
    return {
      riskLevel: effectiveRisk,
      requiresConfirmation: effectiveRisk === "dangerous" || recordCount > 10,
      isReversible: true,
      affectsExternalSystems: false,
      description:
        recordCount > 10
          ? `Bulk write "${toolId}" affecting ${recordCount} records -- elevated to dangerous.`
          : `Write operation "${toolId}" -- modifies local data.`,
    }
  }

  // --- Safe: read-only ---
  if (matchesAny(toolId, SAFE_PATTERNS)) {
    return {
      riskLevel: "safe",
      requiresConfirmation: false,
      isReversible: true,
      affectsExternalSystems: false,
      description: `Read-only operation "${toolId}".`,
    }
  }

  // --- Unknown tools default to moderate (cautious) ---
  return {
    riskLevel: "moderate",
    requiresConfirmation: true,
    isReversible: true,
    affectsExternalSystems: externalUrl,
    description: `Unknown operation "${toolId}" -- defaulting to moderate risk (cautious).`,
  }
}

/**
 * Quick check: does this action need user confirmation?
 * Convenience wrapper around classifyAction.
 */
export function needsConfirmation(
  toolId: string,
  params: Record<string, unknown> = {},
): boolean {
  return classifyAction(toolId, params).requiresConfirmation
}
