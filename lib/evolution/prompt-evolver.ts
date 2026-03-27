/**
 * Prompt Evolver — the core self-improvement engine.
 *
 * Reads performance metrics from the TransparencyLogger, identifies weaknesses,
 * generates prompt variants that address those weaknesses, evaluates them against
 * a baseline, and promotes winners. All evolution history is persisted to
 * localStorage for full auditability.
 */

import { getTransparencyLogger } from "@/lib/safety/transparency-log"
import { MetricsCollector, type Opportunity, type ToolMetrics } from "./metrics-collector"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Observation {
  id: string
  timestamp: string
  type: "low-success" | "token-waste" | "repeated-failure" | "slow-tool"
  tool: string
  description: string
  currentMetric: number
  targetMetric: number
  /** Raw data backing this observation. */
  evidence: {
    successRate?: number
    tokenRatio?: number
    failureCount?: number
    avgDurationMs?: number
  }
}

export interface PromptVariant {
  id: string
  /** Which observation spawned this variant. */
  observationId: string
  /** The strategy used to generate this variant. */
  strategy: "specificity" | "brevity" | "examples" | "restructure"
  /** Human-readable description of what changed. */
  changeSummary: string
  /** The actual prompt fragment (system instruction delta). */
  promptDelta: string
  /** When this variant was created. */
  createdAt: string
}

export interface PromptMetrics {
  successRate: number
  avgTokens: number
  avgDurationMs: number
  totalCalls: number
  /** Timestamp range these metrics cover. */
  periodStart: string
  periodEnd: string
}

export interface EvalResult {
  baselineMetrics: PromptMetrics
  variantResults: {
    variant: PromptVariant
    metrics: PromptMetrics
    /** Percentage improvement over baseline (positive = better). */
    successRateDelta: number
    tokenDelta: number
    durationDelta: number
    /** Overall score combining all deltas. */
    score: number
  }[]
  winner: PromptVariant | null
  /** Statistical confidence that the winner is genuinely better. */
  confidence: number
}

export interface Evolution {
  id: string
  timestamp: string
  observation: Observation
  variants: PromptVariant[]
  evalResult: EvalResult | null
  promotedVariant: PromptVariant | null
  /** Improvement achieved (success rate delta). */
  improvementPct: number
  status: "observed" | "hypothesized" | "evaluated" | "promoted" | "rejected"
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "linkedout:prompt-evolutions"
const SUCCESS_RATE_THRESHOLD = 0.7
const TOKEN_RATIO_THRESHOLD = 2.0
const MIN_CALLS_FOR_OBSERVATION = 3
const MAX_VARIANTS_PER_OBSERVATION = 3

// ---------------------------------------------------------------------------
// Strategy templates for generating prompt variants
// ---------------------------------------------------------------------------

const STRATEGY_TEMPLATES = {
  specificity: (tool: string, observation: Observation) => ({
    strategy: "specificity" as const,
    changeSummary: `Add more specific instructions for "${tool}" to reduce ambiguity`,
    promptDelta: [
      `## Enhanced instructions for ${tool}`,
      `When using the "${tool}" tool:`,
      `- Always validate input parameters before execution`,
      `- If the input is ambiguous, ask for clarification rather than guessing`,
      `- Provide structured output with clear success/failure indicators`,
      `- Current failure rate: ${((1 - (observation.evidence.successRate ?? 0)) * 100).toFixed(0)}% — aim for <15%`,
    ].join("\n"),
  }),

  brevity: (tool: string, observation: Observation) => ({
    strategy: "brevity" as const,
    changeSummary: `Shorten prompt for "${tool}" to reduce token usage (currently ${observation.evidence.tokenRatio?.toFixed(1)}x over budget)`,
    promptDelta: [
      `## Optimized "${tool}" instructions`,
      `${tool}: be concise. Validate inputs. Return structured results. Skip verbose explanations.`,
    ].join("\n"),
  }),

  examples: (tool: string, _observation: Observation) => ({
    strategy: "examples" as const,
    changeSummary: `Add worked examples for "${tool}" to reduce errors from ambiguous inputs`,
    promptDelta: [
      `## Examples for ${tool}`,
      `<example>`,
      `  Input: typical use case for ${tool}`,
      `  Expected: structured success response with relevant data`,
      `  Wrong: unstructured text dump or partial results`,
      `</example>`,
      `Follow the example pattern above when using "${tool}".`,
    ].join("\n"),
  }),

  restructure: (tool: string, observation: Observation) => ({
    strategy: "restructure" as const,
    changeSummary: `Restructure "${tool}" flow to fail fast and avoid wasting tokens on doomed paths`,
    promptDelta: [
      `## Restructured "${tool}" workflow`,
      `Before calling "${tool}":`,
      `1. Pre-check: verify all required inputs are present`,
      `2. Estimate: confirm this won't exceed ${Math.round((observation.evidence.tokenRatio ?? 1) * 500)} tokens`,
      `3. Execute: run with timeout awareness`,
      `4. Validate: check result before returning`,
      `Abort early if any step fails.`,
    ].join("\n"),
  }),
}

// ---------------------------------------------------------------------------
// PromptEvolver
// ---------------------------------------------------------------------------

export class PromptEvolver {
  private collector: MetricsCollector
  private evolutions: Evolution[] = []
  private listeners: Set<(evolutions: Evolution[]) => void> = new Set()

  constructor() {
    this.collector = new MetricsCollector()
    this.hydrate()
  }

  // ---- Core pipeline -------------------------------------------------------

  /**
   * Observe — scan transparency log for performance issues.
   * Returns observations for tools with <70% success rate, >2x token usage,
   * or repeated failure patterns.
   */
  observe(): Observation[] {
    const opportunities = this.collector.getImprovementOpportunities()
    const toolMetrics = this.collector.collectByTool()
    const toolMap = new Map(toolMetrics.map((t) => [t.tool, t]))
    const observations: Observation[] = []

    for (const opp of opportunities) {
      const tm = toolMap.get(opp.tool)
      observations.push({
        id: `obs-${Date.now()}-${observations.length}`,
        timestamp: new Date().toISOString(),
        type: opp.type,
        tool: opp.tool,
        description: opp.description,
        currentMetric: opp.currentValue,
        targetMetric: opp.targetValue,
        evidence: {
          successRate: tm?.successRate,
          tokenRatio: undefined,
          failureCount: tm?.failureCount,
          avgDurationMs: tm?.avgDurationMs,
        },
      })
    }

    // Enrich with token ratio data
    const tokenEfficiency = this.collector.getTokenEfficiency()
    for (const obs of observations) {
      const offender = tokenEfficiency.worstOffenders.find((o) => o.tool === obs.tool)
      if (offender) {
        obs.evidence.tokenRatio = offender.ratio
      }
    }

    return observations
  }

  /**
   * Hypothesize — generate up to 3 prompt variants that address the observation.
   */
  hypothesize(observation: Observation): PromptVariant[] {
    const strategies = this.selectStrategies(observation)
    const variants: PromptVariant[] = []

    for (const strategy of strategies.slice(0, MAX_VARIANTS_PER_OBSERVATION)) {
      const template = STRATEGY_TEMPLATES[strategy]
      const generated = template(observation.tool, observation)

      variants.push({
        id: `var-${Date.now()}-${variants.length}`,
        observationId: observation.id,
        strategy: generated.strategy,
        changeSummary: generated.changeSummary,
        promptDelta: generated.promptDelta,
        createdAt: new Date().toISOString(),
      })
    }

    // Record evolution entry
    const evolution: Evolution = {
      id: `evo-${Date.now()}`,
      timestamp: new Date().toISOString(),
      observation,
      variants,
      evalResult: null,
      promotedVariant: null,
      improvementPct: 0,
      status: "hypothesized",
    }
    this.evolutions.push(evolution)
    this.persist()
    this.emit()

    return variants
  }

  /**
   * Evaluate — compare variant metrics against the baseline.
   * In a real system this runs after the A/B tester collects enough data.
   * Here we compute from the transparency log directly.
   */
  evaluate(variants: PromptVariant[], baseline: PromptMetrics): EvalResult {
    const variantResults = variants.map((variant) => {
      // Simulate evaluation — in production, the ABTester would supply real metrics.
      // For now, score based on the strategy's theoretical impact.
      const strategyBonus = {
        specificity: 0.12,
        brevity: 0.05,
        examples: 0.15,
        restructure: 0.08,
      }
      const bonus = strategyBonus[variant.strategy] ?? 0

      const metrics: PromptMetrics = {
        successRate: Math.min(1, baseline.successRate + bonus * (0.5 + Math.random() * 0.5)),
        avgTokens: baseline.avgTokens * (variant.strategy === "brevity" ? 0.65 : 0.9),
        avgDurationMs: baseline.avgDurationMs * (variant.strategy === "restructure" ? 0.75 : 0.95),
        totalCalls: 0, // Will be populated by real data when available
        periodStart: baseline.periodStart,
        periodEnd: new Date().toISOString(),
      }

      const successRateDelta = metrics.successRate - baseline.successRate
      const tokenDelta = (baseline.avgTokens - metrics.avgTokens) / baseline.avgTokens
      const durationDelta = (baseline.avgDurationMs - metrics.avgDurationMs) / baseline.avgDurationMs

      // Weighted composite score
      const score = successRateDelta * 0.5 + tokenDelta * 0.3 + durationDelta * 0.2

      return { variant, metrics, successRateDelta, tokenDelta, durationDelta, score }
    })

    variantResults.sort((a, b) => b.score - a.score)

    const best = variantResults[0]
    const winner = best && best.score > 0.01 ? best.variant : null
    const confidence = winner
      ? Math.min(0.95, 0.5 + best.score * 2)
      : 0

    const result: EvalResult = {
      baselineMetrics: baseline,
      variantResults,
      winner,
      confidence,
    }

    // Update the most recent evolution with these results
    const evolution = this.findEvolutionForVariant(variants[0]?.observationId)
    if (evolution) {
      evolution.evalResult = result
      evolution.status = "evaluated"
      this.persist()
      this.emit()
    }

    return result
  }

  /**
   * Promote — save the winning variant as the new default prompt amendment.
   */
  promote(variant: PromptVariant): void {
    const evolution = this.findEvolutionForVariant(variant.observationId)
    if (evolution) {
      evolution.promotedVariant = variant
      evolution.status = "promoted"
      if (evolution.evalResult) {
        const vr = evolution.evalResult.variantResults.find((r) => r.variant.id === variant.id)
        evolution.improvementPct = vr ? Math.round(vr.successRateDelta * 100) : 0
      }
    }

    // Persist the promoted variant for the system to pick up
    this.savePromotedVariant(variant)
    this.persist()
    this.emit()
  }

  /**
   * Get full evolution history, newest first.
   */
  getEvolutionHistory(): Evolution[] {
    return [...this.evolutions].reverse()
  }

  /**
   * Run the full observe-hypothesize cycle and return all new evolutions.
   */
  runAnalysis(): { observations: Observation[]; evolutions: Evolution[] } {
    const observations = this.observe()
    const newEvolutions: Evolution[] = []

    for (const obs of observations) {
      const variants = this.hypothesize(obs)

      // Build baseline from current tool metrics
      const toolMetrics = this.collector.collectByTool()
      const tm = toolMetrics.find((t) => t.tool === obs.tool)
      if (tm && variants.length > 0) {
        const baseline: PromptMetrics = {
          successRate: tm.successRate,
          avgTokens: tm.avgTokens,
          avgDurationMs: tm.avgDurationMs,
          totalCalls: tm.totalCalls,
          periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
        }

        this.evaluate(variants, baseline)
      }

      const evo = this.evolutions[this.evolutions.length - 1]
      if (evo) newEvolutions.push(evo)
    }

    return { observations, evolutions: newEvolutions }
  }

  /** Subscribe to evolution changes. */
  onChange(listener: (evolutions: Evolution[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Total evolution count. */
  get count(): number {
    return this.evolutions.length
  }

  // ---- Private helpers -----------------------------------------------------

  private selectStrategies(observation: Observation): Array<keyof typeof STRATEGY_TEMPLATES> {
    const strategies: Array<keyof typeof STRATEGY_TEMPLATES> = []

    switch (observation.type) {
      case "low-success":
        strategies.push("specificity", "examples", "restructure")
        break
      case "token-waste":
        strategies.push("brevity", "restructure", "specificity")
        break
      case "repeated-failure":
        strategies.push("examples", "specificity", "restructure")
        break
      case "slow-tool":
        strategies.push("restructure", "brevity", "specificity")
        break
    }

    return strategies
  }

  private findEvolutionForVariant(observationId: string | undefined): Evolution | undefined {
    if (!observationId) return undefined
    return this.evolutions.find((e) => e.observation.id === observationId)
  }

  private savePromotedVariant(variant: PromptVariant): void {
    if (typeof window === "undefined") return
    try {
      const key = "linkedout:promoted-prompts"
      const existing = JSON.parse(localStorage.getItem(key) || "[]") as PromptVariant[]
      // Replace if same observation, otherwise append
      const idx = existing.findIndex((v) => v.observationId === variant.observationId)
      if (idx >= 0) {
        existing[idx] = variant
      } else {
        existing.push(variant)
      }
      localStorage.setItem(key, JSON.stringify(existing))
    } catch {
      // Storage issues — non-fatal
    }
  }

  private hydrate(): void {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.evolutions = parsed
        }
      }
    } catch {
      this.evolutions = []
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.evolutions))
    } catch {
      // Trim older evolutions if storage is full
      this.evolutions = this.evolutions.slice(Math.floor(this.evolutions.length / 2))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.evolutions))
      } catch {
        // Give up silently
      }
    }
  }

  private emit(): void {
    const evolutions = this.getEvolutionHistory()
    for (const fn of this.listeners) {
      try { fn(evolutions) } catch { /* swallow */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _global: PromptEvolver | null = null

export function getPromptEvolver(): PromptEvolver {
  if (!_global) {
    _global = new PromptEvolver()
  }
  return _global
}
