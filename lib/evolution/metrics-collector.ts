/**
 * Metrics Collector — aggregates transparency log data for the prompt evolver.
 *
 * Reads from the TransparencyLogger singleton and computes per-tool success rates,
 * per-persona performance, failure pattern detection, token efficiency, and
 * ranked improvement opportunities.
 */

import {
  getTransparencyLogger,
  type CostSummary,
} from "@/lib/safety/transparency-log"
import type { TransparencyEntry } from "@/lib/safety/love-invariant"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolMetrics {
  tool: string
  totalCalls: number
  successCount: number
  failureCount: number
  blockedCount: number
  successRate: number
  avgTokens: number
  avgDurationMs: number
  totalTokens: number
  totalCostUsd: number
}

export interface PersonaMetrics {
  persona: string
  totalCalls: number
  successRate: number
  avgTokens: number
  avgDurationMs: number
  /** Which tool categories this persona handles best (highest success rate). */
  bestTools: string[]
  /** Which tool categories this persona struggles with. */
  worstTools: string[]
}

export interface FailurePattern {
  id: string
  tool: string
  /** How many times this pattern has occurred. */
  occurrences: number
  /** Common substring in the failure reasoning. */
  signature: string
  /** Representative entries. */
  examples: Pick<TransparencyEntry, "timestamp" | "reasoning">[]
  /** Severity: how much this pattern costs. */
  totalWastedTokens: number
}

export interface TokenEfficiency {
  totalEstimated: number
  totalActual: number
  ratio: number
  /** Tools with the worst (highest) overshoot. */
  worstOffenders: { tool: string; ratio: number; actualTokens: number; estimatedTokens: number }[]
}

export interface Opportunity {
  rank: number
  type: "low-success" | "token-waste" | "repeated-failure" | "slow-tool"
  tool: string
  description: string
  /** Estimated improvement potential as a percentage. */
  impactPct: number
  currentValue: number
  targetValue: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPersona(entry: TransparencyEntry): string {
  const meta = entry.action.meta as Record<string, unknown> | undefined
  if (meta?.persona && typeof meta.persona === "string") return meta.persona
  // Fallback: try to infer from the action id
  const id = entry.action.id
  if (id.includes("coach")) return "coach"
  if (id.includes("analyst")) return "analyst"
  if (id.includes("strategist")) return "strategist"
  return "default"
}

/** Normalize a reasoning string to a short fingerprint for clustering failures. */
function reasoningFingerprint(reasoning: string): string {
  return reasoning
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
}

// ---------------------------------------------------------------------------
// MetricsCollector
// ---------------------------------------------------------------------------

export class MetricsCollector {
  /** Collect success rate, avg tokens, avg duration per tool. */
  collectByTool(): ToolMetrics[] {
    const logger = getTransparencyLogger()
    const entries = logger.getEntries()
    const map = new Map<string, TransparencyEntry[]>()

    for (const e of entries) {
      const tool = e.action.tool
      if (!map.has(tool)) map.set(tool, [])
      map.get(tool)!.push(e)
    }

    const results: ToolMetrics[] = []
    for (const [tool, items] of map) {
      const successCount = items.filter((e) => e.result === "success").length
      const failureCount = items.filter((e) => e.result === "failure").length
      const blockedCount = items.filter((e) => e.result === "blocked").length
      const totalTokens = items.reduce((s, e) => s + e.tokensUsed, 0)
      const totalCostUsd = items.reduce((s, e) => s + e.costUsd, 0)
      const totalDuration = items.reduce((s, e) => s + e.durationMs, 0)

      results.push({
        tool,
        totalCalls: items.length,
        successCount,
        failureCount,
        blockedCount,
        successRate: items.length > 0 ? successCount / items.length : 0,
        avgTokens: items.length > 0 ? totalTokens / items.length : 0,
        avgDurationMs: items.length > 0 ? totalDuration / items.length : 0,
        totalTokens,
        totalCostUsd,
      })
    }

    return results.sort((a, b) => a.successRate - b.successRate)
  }

  /** Collect which persona performs best on which task types. */
  collectByPersona(): PersonaMetrics[] {
    const logger = getTransparencyLogger()
    const entries = logger.getEntries()
    const personaMap = new Map<string, TransparencyEntry[]>()

    for (const e of entries) {
      const persona = extractPersona(e)
      if (!personaMap.has(persona)) personaMap.set(persona, [])
      personaMap.get(persona)!.push(e)
    }

    const results: PersonaMetrics[] = []
    for (const [persona, items] of personaMap) {
      const successCount = items.filter((e) => e.result === "success").length
      const totalTokens = items.reduce((s, e) => s + e.tokensUsed, 0)
      const totalDuration = items.reduce((s, e) => s + e.durationMs, 0)

      // Per-tool breakdown for this persona
      const toolMap = new Map<string, { success: number; total: number }>()
      for (const e of items) {
        const t = e.action.tool
        if (!toolMap.has(t)) toolMap.set(t, { success: 0, total: 0 })
        const rec = toolMap.get(t)!
        rec.total++
        if (e.result === "success") rec.success++
      }

      const toolRates = [...toolMap.entries()]
        .filter(([, v]) => v.total >= 2)
        .map(([tool, v]) => ({ tool, rate: v.success / v.total }))
        .sort((a, b) => b.rate - a.rate)

      results.push({
        persona,
        totalCalls: items.length,
        successRate: items.length > 0 ? successCount / items.length : 0,
        avgTokens: items.length > 0 ? totalTokens / items.length : 0,
        avgDurationMs: items.length > 0 ? totalDuration / items.length : 0,
        bestTools: toolRates.slice(0, 3).map((t) => t.tool),
        worstTools: toolRates.slice(-3).reverse().map((t) => t.tool),
      })
    }

    return results.sort((a, b) => b.successRate - a.successRate)
  }

  /** Detect recurring failure signatures (same tool failing on similar inputs). */
  getFailurePatterns(): FailurePattern[] {
    const logger = getTransparencyLogger()
    const entries = logger.getEntries().filter((e) => e.result === "failure")

    // Cluster by tool + reasoning fingerprint
    const clusters = new Map<string, TransparencyEntry[]>()
    for (const e of entries) {
      const key = `${e.action.tool}::${reasoningFingerprint(e.reasoning)}`
      if (!clusters.has(key)) clusters.set(key, [])
      clusters.get(key)!.push(e)
    }

    const patterns: FailurePattern[] = []
    for (const [key, items] of clusters) {
      if (items.length < 2) continue // Only report repeated failures
      const [tool] = key.split("::")
      patterns.push({
        id: key,
        tool,
        occurrences: items.length,
        signature: reasoningFingerprint(items[0].reasoning),
        examples: items.slice(0, 3).map((e) => ({
          timestamp: e.timestamp,
          reasoning: e.reasoning,
        })),
        totalWastedTokens: items.reduce((s, e) => s + e.tokensUsed, 0),
      })
    }

    return patterns.sort((a, b) => b.occurrences - a.occurrences)
  }

  /** Compute actual vs estimated token usage ratio. */
  getTokenEfficiency(): TokenEfficiency {
    const logger = getTransparencyLogger()
    const entries = logger.getEntries()

    let totalEstimated = 0
    let totalActual = 0
    const byTool = new Map<string, { estimated: number; actual: number }>()

    for (const e of entries) {
      const est = e.action.estimatedTokens
      const act = e.tokensUsed
      totalEstimated += est
      totalActual += act

      const t = e.action.tool
      if (!byTool.has(t)) byTool.set(t, { estimated: 0, actual: 0 })
      const rec = byTool.get(t)!
      rec.estimated += est
      rec.actual += act
    }

    const worstOffenders = [...byTool.entries()]
      .filter(([, v]) => v.estimated > 0)
      .map(([tool, v]) => ({
        tool,
        ratio: v.actual / v.estimated,
        actualTokens: v.actual,
        estimatedTokens: v.estimated,
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 5)

    return {
      totalEstimated,
      totalActual,
      ratio: totalEstimated > 0 ? totalActual / totalEstimated : 1,
      worstOffenders,
    }
  }

  /** Ranked list of what to improve, combining all signals. */
  getImprovementOpportunities(): Opportunity[] {
    const toolMetrics = this.collectByTool()
    const failurePatterns = this.getFailurePatterns()
    const tokenEfficiency = this.getTokenEfficiency()
    const opportunities: Opportunity[] = []
    let rank = 0

    // 1. Low success rate tools (<70%)
    for (const tm of toolMetrics) {
      if (tm.totalCalls >= 3 && tm.successRate < 0.7) {
        rank++
        opportunities.push({
          rank,
          type: "low-success",
          tool: tm.tool,
          description: `"${tm.tool}" has a ${(tm.successRate * 100).toFixed(0)}% success rate across ${tm.totalCalls} calls. Consider adding more specific instructions or examples.`,
          impactPct: Math.round((0.7 - tm.successRate) * 100),
          currentValue: tm.successRate,
          targetValue: 0.85,
        })
      }
    }

    // 2. Repeated failure patterns
    for (const fp of failurePatterns) {
      rank++
      opportunities.push({
        rank,
        type: "repeated-failure",
        tool: fp.tool,
        description: `"${fp.tool}" fails repeatedly with pattern "${fp.signature}" (${fp.occurrences}x, ${fp.totalWastedTokens} wasted tokens).`,
        impactPct: Math.min(50, fp.occurrences * 10),
        currentValue: fp.occurrences,
        targetValue: 0,
      })
    }

    // 3. Token waste (tools using >2x estimated)
    for (const off of tokenEfficiency.worstOffenders) {
      if (off.ratio > 2) {
        rank++
        opportunities.push({
          rank,
          type: "token-waste",
          tool: off.tool,
          description: `"${off.tool}" uses ${off.ratio.toFixed(1)}x estimated tokens (${off.actualTokens} actual vs ${off.estimatedTokens} estimated). Tighten prompts.`,
          impactPct: Math.round(Math.min(60, (off.ratio - 1) * 20)),
          currentValue: off.ratio,
          targetValue: 1.2,
        })
      }
    }

    // 4. Slow tools (>5s average)
    for (const tm of toolMetrics) {
      if (tm.totalCalls >= 3 && tm.avgDurationMs > 5000) {
        rank++
        opportunities.push({
          rank,
          type: "slow-tool",
          tool: tm.tool,
          description: `"${tm.tool}" averages ${(tm.avgDurationMs / 1000).toFixed(1)}s per call. Consider caching or simplifying.`,
          impactPct: Math.round(Math.min(30, (tm.avgDurationMs / 1000 - 5) * 5)),
          currentValue: tm.avgDurationMs,
          targetValue: 3000,
        })
      }
    }

    // Sort by impact
    return opportunities.sort((a, b) => b.impactPct - a.impactPct).map((o, i) => ({ ...o, rank: i + 1 }))
  }
}
