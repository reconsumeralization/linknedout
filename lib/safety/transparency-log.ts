/**
 * Transparency Log — full audit trail for every AI action in LinkedOut.
 *
 * Stores entries in localStorage (client-side) with a configurable max size.
 * Provides cost summaries, filtering, and JSON export for user review.
 */

import type {
  AIAction,
  TransparencyEntry,
  TransparencyReport,
} from "./love-invariant"
import { getTransparencyReport } from "./love-invariant"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostSummary {
  totalTokens: number
  totalCostUsd: number
  byTool: Record<string, { tokens: number; costUsd: number; count: number }>
  byResult: Record<string, { tokens: number; costUsd: number; count: number }>
}

export interface LogActionInput {
  action: AIAction
  result: "success" | "failure" | "blocked"
  tokensUsed: number
  costUsd: number
  durationMs: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "linkedout:transparency-log"
const DEFAULT_MAX_ENTRIES = 500

// ---------------------------------------------------------------------------
// TransparencyLogger
// ---------------------------------------------------------------------------

export class TransparencyLogger {
  private entries: TransparencyEntry[] = []
  private maxEntries: number
  private listeners: Set<(entries: TransparencyEntry[]) => void> = new Set()

  constructor(opts?: { maxEntries?: number; hydrate?: boolean }) {
    this.maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES
    if (opts?.hydrate !== false) {
      this.hydrate()
    }
  }

  // ---- Public API ----------------------------------------------------------

  /** Log a completed (or blocked) AI action. */
  logAction(input: LogActionInput): TransparencyEntry {
    const entry: TransparencyEntry = {
      timestamp: new Date().toISOString(),
      action: input.action,
      result: input.result,
      tokensUsed: input.tokensUsed,
      costUsd: input.costUsd,
      durationMs: input.durationMs,
      reasoning: input.action.reasoning ?? "",
    }

    this.entries.push(entry)

    // Trim oldest entries if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries)
    }

    this.persist()
    this.emit()
    return entry
  }

  /** Get a full transparency report. */
  getReport(): TransparencyReport {
    return getTransparencyReport(this.entries)
  }

  /** Get a cost summary broken down by tool and result. */
  getCostSummary(): CostSummary {
    const byTool: CostSummary["byTool"] = {}
    const byResult: CostSummary["byResult"] = {}
    let totalTokens = 0
    let totalCostUsd = 0

    for (const e of this.entries) {
      totalTokens += e.tokensUsed
      totalCostUsd += e.costUsd

      const tool = e.action.tool
      if (!byTool[tool]) byTool[tool] = { tokens: 0, costUsd: 0, count: 0 }
      byTool[tool].tokens += e.tokensUsed
      byTool[tool].costUsd += e.costUsd
      byTool[tool].count += 1

      const result = e.result
      if (!byResult[result]) byResult[result] = { tokens: 0, costUsd: 0, count: 0 }
      byResult[result].tokens += e.tokensUsed
      byResult[result].costUsd += e.costUsd
      byResult[result].count += 1
    }

    return { totalTokens, totalCostUsd, byTool, byResult }
  }

  /** Get all entries (newest first). */
  getEntries(): TransparencyEntry[] {
    return [...this.entries].reverse()
  }

  /** Get the N most recent entries. */
  getRecent(n: number): TransparencyEntry[] {
    return this.getEntries().slice(0, n)
  }

  /** Total entry count. */
  get count(): number {
    return this.entries.length
  }

  /** Clear all entries (with user confirmation expected at the UI layer). */
  clear(): void {
    this.entries = []
    this.persist()
    this.emit()
  }

  /** Export the full log as a JSON string (for download). */
  exportJson(): string {
    return JSON.stringify(this.getReport(), null, 2)
  }

  /** Subscribe to changes. Returns unsubscribe function. */
  onChange(listener: (entries: TransparencyEntry[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ---- Persistence ---------------------------------------------------------

  private hydrate(): void {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.entries = parsed
        }
      }
    } catch {
      // Corrupted storage — start fresh
      this.entries = []
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries))
    } catch {
      // Storage full — trim and retry
      this.entries = this.entries.slice(Math.floor(this.entries.length / 2))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries))
      } catch {
        // Give up silently — the in-memory log is still available
      }
    }
  }

  private emit(): void {
    const entries = this.getEntries()
    for (const fn of this.listeners) {
      try { fn(entries) } catch { /* swallow */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _global: TransparencyLogger | null = null

export function getTransparencyLogger(opts?: { maxEntries?: number }): TransparencyLogger {
  if (!_global) {
    _global = new TransparencyLogger(opts)
  }
  return _global
}

export function resetGlobalTransparencyLogger(): void {
  _global?.clear()
  _global = null
}
