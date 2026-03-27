import { generateObject, type LanguageModel } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import {
  AgentDefinitionRecord,
  AgentRunRecord,
  AgentEvaluationRecord,
} from "./agent-platform-types"

/**
 * Performance analysis of an agent over a period, identifying failure patterns and inefficiencies.
 */
export interface PerformanceAnalysis {
  agentId: string
  periodStart: string
  periodEnd: string
  totalRuns: number
  successRate: number
  avgCostPerRun: number
  avgTokensPerRun: number
  failurePatterns: {
    pattern: string
    frequency: number
    suggestion: string
  }[]
  costTrend: "increasing" | "decreasing" | "stable"
  recommendations: string[]
}

/**
 * Optimized prompt/soul recommendation based on run history and evaluations.
 */
export interface PromptOptimization {
  agentId: string
  currentSoul: string
  proposedSoul: string
  reasoning: string
  estimatedImprovementPct: number
  confidence: "low" | "medium" | "high"
}

/**
 * Anomaly detection report across runs: cost spikes, token surges, efficiency drops, failure streaks.
 */
export interface AnomalyReport {
  anomalies: {
    type: "cost_spike" | "token_surge" | "efficiency_drop" | "failure_streak"
    severity: "low" | "medium" | "high"
    runId: string
    details: string
    suggestedAction: string
  }[]
  overallHealth: "healthy" | "warning" | "critical"
}

/**
 * Prioritized step-by-step improvement plan for an agent.
 */
export interface ImprovementPlan {
  agentId: string
  priority: {
    action: string
    estimatedImpact: string
    effort: "low" | "medium" | "high"
  }[]
  promptChanges: PromptOptimization | null
  modelRecommendation: string | null
  connectorChanges: string[]
  estimatedOverallImprovementPct: number
}

/**
 * Tribal DNA entry for semantic matching context.
 */
export interface TribalDnaEntry {
  id: string
  category: "pattern" | "principle" | "skill" | "guardrail"
  content: string
  relevanceScore?: number
}

// Zod schemas for structured LLM output
const performanceAnalysisSchema = z.object({
  failurePatterns: z.array(
    z.object({
      pattern: z.string(),
      frequency: z.number(),
      suggestion: z.string(),
    })
  ),
  costTrend: z.enum(["increasing", "decreasing", "stable"]),
  recommendations: z.array(z.string()),
})

const promptOptimizationSchema = z.object({
  proposedSoul: z.string(),
  reasoning: z.string(),
  estimatedImprovementPct: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
})

const improvementPlanSchema = z.object({
  priority: z.array(
    z.object({
      action: z.string(),
      estimatedImpact: z.string(),
      effort: z.enum(["low", "medium", "high"]),
    })
  ),
  modelRecommendation: z.string().nullable(),
  connectorChanges: z.array(z.string()),
  estimatedOverallImprovementPct: z.number(),
})

const tribalDnaRankingSchema = z.object({
  rankings: z.array(
    z.object({
      id: z.string(),
      relevanceScore: z.number(),
    })
  ),
})

/**
 * Analyzes agent run history and evaluations to identify failure patterns, cost inefficiencies, and trends.
 * Uses LLM to extract actionable insights from performance data.
 *
 * @param agentId - ID of the agent to analyze
 * @param runs - Array of historical run records
 * @param evaluations - Array of evaluation records
 * @returns PerformanceAnalysis with failure patterns, cost trends, and recommendations
 * @throws Error if LLM call fails or times out
 *
 * @example
 * const analysis = await analyzeAgentPerformance(
 *   "agent-sales-intel",
 *   runs,
 *   evaluations
 * );
 * console.log(analysis.failurePatterns);
 */
export async function analyzeAgentPerformance(
  agentId: string,
  runs: AgentRunRecord[],
  evaluations: AgentEvaluationRecord[]
): Promise<PerformanceAnalysis> {
  const model = process.env.META_AGENT_REASONING_MODEL || "gpt-4.1-mini"

  // Compute basic metrics
  const completedRuns = runs.filter((r) => r.status === "completed")
  const failedRuns = runs.filter((r) => r.status === "failed")
  const successRate =
    runs.length > 0 ? (completedRuns.length / runs.length) * 100 : 0

  const totalTokens = runs.reduce((sum, r) => sum + r.tokenInput + r.tokenOutput, 0)
  const avgTokensPerRun = runs.length > 0 ? totalTokens / runs.length : 0

  const totalCost = runs.reduce((sum, r) => sum + r.estimatedCostUsd, 0)
  const avgCostPerRun = runs.length > 0 ? totalCost / runs.length : 0

  // Determine cost trend
  const lastQuarter = runs.slice(-Math.ceil(runs.length / 4))
  const firstQuarter = runs.slice(0, Math.ceil(runs.length / 4))
  const lastQuarterCost =
    lastQuarter.reduce((sum, r) => sum + r.estimatedCostUsd, 0) /
    Math.max(lastQuarter.length, 1)
  const firstQuarterCost =
    firstQuarter.reduce((sum, r) => sum + r.estimatedCostUsd, 0) /
    Math.max(firstQuarter.length, 1)

  let costTrend: "increasing" | "decreasing" | "stable" = "stable"
  if (lastQuarterCost > firstQuarterCost * 1.1) {
    costTrend = "increasing"
  } else if (lastQuarterCost < firstQuarterCost * 0.9) {
    costTrend = "decreasing"
  }

  const periodStart =
    runs.length > 0 ? runs[0].startedAt : new Date().toISOString()
  const periodEnd =
    runs.length > 0
      ? runs[runs.length - 1].completedAt || runs[runs.length - 1].startedAt
      : new Date().toISOString()

  // Prepare LLM input
  const failureContext = failedRuns
    .slice(0, 10)
    .map((r) => `Run ${r.id}: ${r.summary || "No summary"}`)
    .join("\n")

  const evaluationContext = evaluations
    .slice(0, 5)
    .map((e) => `${e.benchmarkName}: ${e.scorePct}% (threshold: ${e.thresholdPct}%) - ${e.summary}`)
    .join("\n")

  const prompt = `Analyze the following agent performance data and identify failure patterns, cost inefficiencies, and recommendations.

Agent ID: ${agentId}
Total Runs: ${runs.length}
Success Rate: ${successRate.toFixed(1)}%
Failed Runs: ${failedRuns.length}
Avg Cost/Run: $${avgCostPerRun.toFixed(2)}
Avg Tokens/Run: ${Math.round(avgTokensPerRun)}

Recent Failures:
${failureContext || "No failures recorded"}

Recent Evaluations:
${evaluationContext || "No evaluations recorded"}

Identify 3-5 specific failure patterns, cost trends, and actionable recommendations. Return JSON with failurePatterns array, costTrend, and recommendations array.`

  try {
    const result = await Promise.race([
      generateObject({
        model: openai(model) as unknown as LanguageModel,
        schema: performanceAnalysisSchema,
        prompt,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LLM call timeout")), 30000)
      ),
    ])

    return {
      agentId,
      periodStart,
      periodEnd,
      totalRuns: runs.length,
      successRate: Math.round(successRate * 10) / 10,
      avgCostPerRun: Math.round(avgCostPerRun * 100) / 100,
      avgTokensPerRun: Math.round(avgTokensPerRun),
      failurePatterns: result.object.failurePatterns,
      costTrend: result.object.costTrend,
      recommendations: result.object.recommendations,
    }
  } catch (error) {
    console.error(
      `Performance analysis failed for agent ${agentId}:`,
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}

/**
 * Proposes optimizations to an agent's soul/system prompt based on historical performance.
 * Analyzes what worked and what failed to suggest targeted improvements.
 *
 * @param agent - Agent definition record
 * @param runs - Array of historical run records
 * @param evaluations - Array of evaluation records
 * @returns PromptOptimization with proposed soul changes and confidence score
 * @throws Error if LLM call fails or times out
 *
 * @example
 * const optimization = await proposePromptOptimization(
 *   agent,
 *   runs,
 *   evaluations
 * );
 * console.log(`Improvement: ${optimization.estimatedImprovementPct}%`);
 */
export async function proposePromptOptimization(
  agent: AgentDefinitionRecord,
  runs: AgentRunRecord[],
  evaluations: AgentEvaluationRecord[]
): Promise<PromptOptimization> {
  const model = process.env.META_AGENT_REASONING_MODEL || "gpt-4.1-mini"

  const successfulRuns = runs.filter((r) => r.status === "completed" && r.efficiencyGainPct > 10)
  const failedRuns = runs.filter((r) => r.status === "failed" || r.efficiencyGainPct < 5)

  const successSummaries = successfulRuns
    .slice(0, 5)
    .map((r) => r.summary)
    .join(" | ")

  const failureSummaries = failedRuns
    .slice(0, 5)
    .map((r) => r.summary || "Unknown failure")
    .join(" | ")

  const failedEvals = evaluations.filter((e) => e.status === "failed")

  const prompt = `You are an expert at optimizing agent behavior through prompt engineering.

Current Agent Soul:
"${agent.soul}"

Agent Purpose: ${agent.purpose}
Agent Skills: ${agent.skills.join(", ")}

Successful Runs (what worked):
${successSummaries || "No successful runs with high efficiency gains"}

Failed Runs (what didn't work):
${failureSummaries || "No failures recorded"}

Failed Evaluations:
${failedEvals.map((e) => `${e.benchmarkName}: ${e.summary}`).join(" | ") || "No failed evaluations"}

Propose a refined soul/system prompt that:
1. Reinforces patterns from successful runs
2. Addresses failure modes from unsuccessful runs
3. Strengthens weak areas identified in evaluations
4. Remains pragmatic and measurable

Return JSON with proposedSoul, reasoning, estimatedImprovementPct (0-50), and confidence level.`

  try {
    const result = await Promise.race([
      generateObject({
        model: openai(model) as unknown as LanguageModel,
        schema: promptOptimizationSchema,
        prompt,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LLM call timeout")), 30000)
      ),
    ])

    return {
      agentId: agent.id,
      currentSoul: agent.soul,
      proposedSoul: result.object.proposedSoul,
      reasoning: result.object.reasoning,
      estimatedImprovementPct: result.object.estimatedImprovementPct,
      confidence: result.object.confidence,
    }
  } catch (error) {
    console.error(
      `Prompt optimization failed for agent ${agent.id}:`,
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}

/**
 * Ranks tribal DNA entries by semantic relevance to an agent's context.
 * Uses embedding-like scoring to match organizational knowledge to agent needs.
 *
 * @param dnaEntries - Array of tribal DNA entries (patterns, principles, skills)
 * @param agentContext - Agent definition and recent performance context
 * @returns Array of entries ranked by relevance score (0-100)
 *
 * @example
 * const ranked = rankTribalDna(dnaEntries, {
 *   purpose: "sales outreach",
 *   skills: ["web research", "outreach drafting"],
 *   recentFailures: ["low personalization"]
 * });
 */
export async function rankTribalDna(
  dnaEntries: TribalDnaEntry[],
  agentContext: {
    purpose: string
    skills: string[]
    recentFailures?: string[]
  }
): Promise<TribalDnaEntry[]> {
  const model = process.env.META_AGENT_REASONING_MODEL || "gpt-4.1-mini"

  const dnaTexts = dnaEntries.map((e) => `[${e.category}] ${e.content}`).join("\n")

  const prompt = `Score the relevance (0-100) of each tribal DNA entry to this agent context.

Agent Purpose: ${agentContext.purpose}
Agent Skills: ${agentContext.skills.join(", ")}
${agentContext.recentFailures ? `Recent Failures: ${agentContext.recentFailures.join(", ")}` : ""}

Tribal DNA Entries:
${dnaTexts}

Return JSON with rankings array containing {id, relevanceScore}. Higher scores = more relevant.`

  try {
    const result = await Promise.race([
      generateObject({
        model: openai(model) as unknown as LanguageModel,
        schema: tribalDnaRankingSchema,
        prompt,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LLM call timeout")), 30000)
      ),
    ])

    // Merge rankings back into entries
    const rankingMap = new Map(result.object.rankings.map((r) => [r.id, r.relevanceScore]))

    return dnaEntries
      .map((entry) => ({
        ...entry,
        relevanceScore: rankingMap.get(entry.id) ?? 0,
      }))
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
  } catch (error) {
    console.error(
      "Tribal DNA ranking failed:",
      error instanceof Error ? error.message : String(error)
    )
    // Fallback: return entries in original order with zero relevance
    return dnaEntries.map((e) => ({ ...e, relevanceScore: 0 }))
  }
}

/**
 * Detects anomalies in agent runs: cost spikes, token surges, efficiency drops, failure streaks.
 * Pure computation—no LLM needed. Fast and deterministic.
 *
 * @param runs - Array of run records to analyze
 * @param threshold - Optional custom threshold multiplier (default: 1.5 = 50% increase = anomaly)
 * @returns AnomalyReport with detected anomalies and overall health status
 *
 * @example
 * const anomalies = detectAnomalies(runs, 1.5);
 * if (anomalies.overallHealth === "critical") {
 *   // Take action
 * }
 */
export function detectAnomalies(
  runs: AgentRunRecord[],
  threshold: number = 1.5
): AnomalyReport {
  const anomalies: AnomalyReport["anomalies"] = []

  if (runs.length < 2) {
    return { anomalies, overallHealth: "healthy" }
  }

  // Compute baseline metrics (median of first 50% or first 10 runs)
  const baselineSize = Math.max(2, Math.ceil(Math.min(runs.length / 2, 10)))
  const baselineRuns = runs.slice(0, baselineSize)

  const baselineCost =
    baselineRuns.reduce((sum, r) => sum + r.estimatedCostUsd, 0) / baselineSize
  const baselineTokens =
    baselineRuns.reduce((sum, r) => sum + r.tokenInput + r.tokenOutput, 0) /
    baselineSize
  const baselineEfficiency =
    baselineRuns.reduce((sum, r) => sum + r.efficiencyGainPct, 0) / baselineSize

  // Check recent runs for anomalies
  const recentRuns = runs.slice(Math.max(0, runs.length - 20))
  let failureStreak = 0
  let maxFailureStreak = 0

  for (const run of recentRuns) {
    // Cost spike detection
    if (run.estimatedCostUsd > baselineCost * threshold) {
      anomalies.push({
        type: "cost_spike",
        severity:
          run.estimatedCostUsd > baselineCost * threshold * 2 ? "high" : "medium",
        runId: run.id,
        details: `Cost $${run.estimatedCostUsd.toFixed(2)} vs baseline $${baselineCost.toFixed(2)}`,
        suggestedAction:
          "Review input prompt size or model selection for this run.",
      })
    }

    // Token surge detection
    const totalTokens = run.tokenInput + run.tokenOutput
    if (totalTokens > baselineTokens * threshold) {
      anomalies.push({
        type: "token_surge",
        severity: totalTokens > baselineTokens * threshold * 2 ? "high" : "medium",
        runId: run.id,
        details: `${totalTokens} tokens vs baseline ${Math.round(baselineTokens)}`,
        suggestedAction:
          "Check for verbose outputs or unexpectedly large inputs.",
      })
    }

    // Efficiency drop detection
    if (run.efficiencyGainPct < baselineEfficiency / threshold) {
      anomalies.push({
        type: "efficiency_drop",
        severity:
          run.efficiencyGainPct < baselineEfficiency / (threshold * 2)
            ? "high"
            : "medium",
        runId: run.id,
        details: `Efficiency ${run.efficiencyGainPct}% vs baseline ${baselineEfficiency.toFixed(1)}%`,
        suggestedAction: "Check connector health or recent prompt changes.",
      })
    }

    // Failure streak detection
    if (run.status === "failed") {
      failureStreak++
      maxFailureStreak = Math.max(maxFailureStreak, failureStreak)
    } else {
      failureStreak = 0
    }
  }

  if (maxFailureStreak >= 3) {
    const lastFailure = recentRuns.findLast((r) => r.status === "failed")
    if (lastFailure) {
      anomalies.push({
        type: "failure_streak",
        severity: maxFailureStreak >= 5 ? "high" : "medium",
        runId: lastFailure.id,
        details: `${maxFailureStreak} consecutive failures in recent runs`,
        suggestedAction:
          "Investigate root cause: connector issues, invalid inputs, or systemic prompt problem.",
      })
    }
  }

  // Determine overall health
  let overallHealth: "healthy" | "warning" | "critical" = "healthy"
  const highSeverityCount = anomalies.filter((a) => a.severity === "high").length
  const mediumSeverityCount = anomalies.filter((a) => a.severity === "medium").length

  if (highSeverityCount >= 2 || maxFailureStreak >= 5) {
    overallHealth = "critical"
  } else if (highSeverityCount >= 1 || mediumSeverityCount >= 3) {
    overallHealth = "warning"
  }

  return {
    anomalies: anomalies.slice(0, 15), // Limit to top 15 anomalies
    overallHealth,
  }
}

/**
 * Generates a prioritized improvement plan for an agent.
 * Combines performance analysis, prompt optimization, and anomaly detection into a cohesive strategy.
 *
 * @param agent - Agent definition record
 * @param analysis - Performance analysis from analyzeAgentPerformance
 * @returns ImprovementPlan with prioritized actions and estimated overall impact
 * @throws Error if LLM call fails or times out
 *
 * @example
 * const plan = await generateImprovementPlan(agent, analysis);
 * console.log(plan.priority); // [{ action, estimatedImpact, effort }]
 */
export async function generateImprovementPlan(
  agent: AgentDefinitionRecord,
  analysis: PerformanceAnalysis
): Promise<ImprovementPlan> {
  const model = process.env.META_AGENT_REASONING_MODEL || "gpt-4.1-mini"

  const failurePatternSummary = analysis.failurePatterns
    .map((p) => `${p.pattern} (${p.frequency}x): ${p.suggestion}`)
    .join("\n")

  const prompt = `Create a prioritized improvement plan for an agent.

Agent: ${agent.name} (${agent.id})
Purpose: ${agent.purpose}
Current Skills: ${agent.skills.join(", ")}
Current Model: ${agent.preferredModelId}

Performance Summary:
- Success Rate: ${analysis.successRate}%
- Avg Cost/Run: $${analysis.avgCostPerRun}
- Cost Trend: ${analysis.costTrend}
- Total Runs Analyzed: ${analysis.totalRuns}

Key Failure Patterns:
${failurePatternSummary}

Generate a prioritized action plan with 4-6 items. Each action should specify effort level (low/medium/high).
Consider prompt refinement, model switching, connector health, skill additions.

Return JSON with priority array [{action, estimatedImpact, effort}], modelRecommendation (string or null),
and connectorChanges array (list of connector issues to address). Also include estimatedOverallImprovementPct (0-100).`

  try {
    const result = await Promise.race([
      generateObject({
        model: openai(model) as unknown as LanguageModel,
        schema: improvementPlanSchema,
        prompt,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LLM call timeout")), 30000)
      ),
    ])

    return {
      agentId: agent.id,
      priority: result.object.priority,
      promptChanges: null, // Can be populated by proposePromptOptimization if needed
      modelRecommendation: result.object.modelRecommendation,
      connectorChanges: result.object.connectorChanges,
      estimatedOverallImprovementPct:
        result.object.estimatedOverallImprovementPct,
    }
  } catch (error) {
    console.error(
      `Improvement plan generation failed for agent ${agent.id}:`,
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}
