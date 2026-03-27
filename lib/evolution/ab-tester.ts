/**
 * A/B Tester — simple experiment framework for prompt variants.
 *
 * Creates experiments with a control and up to N variants, assigns traffic
 * via round-robin, records outcomes, and determines winners with a basic
 * statistical confidence check.
 *
 * Persisted in localStorage key "linkedout:ab-experiments".
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantMetrics {
  variant: string
  impressions: number
  successes: number
  failures: number
  successRate: number
  avgTokens: number
  totalTokens: number
}

export interface Experiment {
  name: string
  control: string
  variants: string[]
  /** All variant names including control, in assignment order. */
  allVariants: string[]
  /** Round-robin counter. */
  assignmentIndex: number
  /** Per-variant outcome tracking. */
  metrics: Record<string, VariantMetrics>
  status: "running" | "concluded"
  /** Winning variant (set after conclusion). */
  winner: string | null
  createdAt: string
  concludedAt: string | null
}

export interface ExperimentResults {
  experimentName: string
  status: "running" | "concluded"
  winner: string | null
  /** Simple confidence measure: proportion of total successes from the leading variant. */
  confidence: number
  metrics: VariantMetrics[]
  totalImpressions: number
  /** Minimum impressions per variant before conclusion is reliable. */
  minImpressionsPerVariant: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "linkedout:ab-experiments"
const MIN_IMPRESSIONS_PER_VARIANT = 10

// ---------------------------------------------------------------------------
// ABTester
// ---------------------------------------------------------------------------

export class ABTester {
  private experiments: Map<string, Experiment> = new Map()
  private listeners: Set<(experiments: Experiment[]) => void> = new Set()

  constructor() {
    this.hydrate()
  }

  // ---- Public API ----------------------------------------------------------

  /** Create a new experiment with a control prompt and variant prompts. */
  createExperiment(name: string, control: string, variants: string[]): Experiment {
    if (this.experiments.has(name)) {
      return this.experiments.get(name)!
    }

    const allVariants = [control, ...variants]
    const metrics: Record<string, VariantMetrics> = {}
    for (const v of allVariants) {
      metrics[v] = {
        variant: v,
        impressions: 0,
        successes: 0,
        failures: 0,
        successRate: 0,
        avgTokens: 0,
        totalTokens: 0,
      }
    }

    const experiment: Experiment = {
      name,
      control,
      variants,
      allVariants,
      assignmentIndex: 0,
      metrics,
      status: "running",
      winner: null,
      createdAt: new Date().toISOString(),
      concludedAt: null,
    }

    this.experiments.set(name, experiment)
    this.persist()
    this.emit()
    return experiment
  }

  /** Assign the next variant to use (round-robin across all variants). */
  assignVariant(experimentName: string): string {
    const exp = this.experiments.get(experimentName)
    if (!exp || exp.status === "concluded") {
      return exp?.winner ?? exp?.control ?? ""
    }

    const variant = exp.allVariants[exp.assignmentIndex % exp.allVariants.length]
    exp.assignmentIndex++
    this.persist()
    return variant
  }

  /** Record the outcome of using a variant. */
  recordOutcome(experimentName: string, variant: string, success: boolean, tokens: number): void {
    const exp = this.experiments.get(experimentName)
    if (!exp) return

    const m = exp.metrics[variant]
    if (!m) return

    m.impressions++
    if (success) {
      m.successes++
    } else {
      m.failures++
    }
    m.totalTokens += tokens
    m.successRate = m.impressions > 0 ? m.successes / m.impressions : 0
    m.avgTokens = m.impressions > 0 ? m.totalTokens / m.impressions : 0

    this.persist()
    this.emit()
  }

  /** Get current results for an experiment. */
  getResults(experimentName: string): ExperimentResults | null {
    const exp = this.experiments.get(experimentName)
    if (!exp) return null

    const metrics = exp.allVariants.map((v) => exp.metrics[v])
    const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0)

    // Find leading variant by success rate
    const sorted = [...metrics].sort((a, b) => b.successRate - a.successRate)
    const leader = sorted[0]
    const runner = sorted[1]

    // Simple confidence: based on margin between leader and runner-up,
    // weighted by sample size
    let confidence = 0
    if (leader && runner && leader.impressions >= MIN_IMPRESSIONS_PER_VARIANT) {
      const margin = leader.successRate - runner.successRate
      const sampleWeight = Math.min(1, leader.impressions / (MIN_IMPRESSIONS_PER_VARIANT * 3))
      confidence = Math.min(0.99, margin * sampleWeight * 3)
    }

    return {
      experimentName,
      status: exp.status,
      winner: exp.winner,
      confidence,
      metrics,
      totalImpressions,
      minImpressionsPerVariant: MIN_IMPRESSIONS_PER_VARIANT,
    }
  }

  /** Conclude an experiment and return the winning variant. */
  concludeExperiment(experimentName: string): string {
    const exp = this.experiments.get(experimentName)
    if (!exp) return ""

    const metrics = exp.allVariants.map((v) => exp.metrics[v])
    const sorted = [...metrics].sort((a, b) => b.successRate - a.successRate)

    const winner = sorted[0]?.variant ?? exp.control
    exp.winner = winner
    exp.status = "concluded"
    exp.concludedAt = new Date().toISOString()

    this.persist()
    this.emit()
    return winner
  }

  /** Get all experiments. */
  getAll(): Experiment[] {
    return [...this.experiments.values()]
  }

  /** Get only running experiments. */
  getRunning(): Experiment[] {
    return this.getAll().filter((e) => e.status === "running")
  }

  /** Subscribe to changes. */
  onChange(listener: (experiments: Experiment[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ---- Persistence ---------------------------------------------------------

  private hydrate(): void {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Experiment[]
        if (Array.isArray(parsed)) {
          for (const exp of parsed) {
            this.experiments.set(exp.name, exp)
          }
        }
      }
    } catch {
      this.experiments = new Map()
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return
    try {
      const arr = [...this.experiments.values()]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
    } catch {
      // Non-fatal
    }
  }

  private emit(): void {
    const experiments = this.getAll()
    for (const fn of this.listeners) {
      try { fn(experiments) } catch { /* swallow */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _global: ABTester | null = null

export function getABTester(): ABTester {
  if (!_global) {
    _global = new ABTester()
  }
  return _global
}
