import {
  DEFAULT_AGENT_MODELS,
  DEFAULT_AGENT_TEMPLATES,
  type AgentEvaluationStatus,
  type AgentModelOption,
  type AgentWorkflowTemplate,
} from "@/lib/agents/agent-platform-types"

type AgentMetricContext = {
  purpose: string
  skills: string[]
  connectors: string[]
  preferredModelId: string
  weeklyEfficiencyGainPct: number
}

export type DerivedAgentRunMetricsInput = AgentMetricContext & {
  summary: string
  templateId?: string | null
}

export type DerivedAgentEvaluationInput = AgentMetricContext & {
  benchmarkName: string
  thresholdPct: number
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function countUnique(values: string[]): number {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)).size
}

function getTemplateById(templateId: string | null | undefined): AgentWorkflowTemplate | undefined {
  if (!templateId) {
    return undefined
  }
  return DEFAULT_AGENT_TEMPLATES.find((template) => template.id === templateId)
}

function getModelById(modelId: string): AgentModelOption | undefined {
  return DEFAULT_AGENT_MODELS.find((model) => model.id === modelId)
}

function getModelTokenMultiplier(model: AgentModelOption | undefined): number {
  if (!model) {
    return 1
  }
  if (model.latencyTier === "high") return 1.08
  if (model.latencyTier === "medium") return 1.02
  return 0.96
}

function getModelRates(model: AgentModelOption | undefined): { inputRate: number; outputRate: number } {
  if (!model) {
    return { inputRate: 0.00008, outputRate: 0.00015 }
  }
  if (model.provider === "local") {
    return { inputRate: 0.00002, outputRate: 0.00004 }
  }
  if (model.costTier === "high") {
    return { inputRate: 0.00012, outputRate: 0.00022 }
  }
  if (model.costTier === "medium") {
    return { inputRate: 0.00008, outputRate: 0.00015 }
  }
  return { inputRate: 0.00006, outputRate: 0.0001 }
}

function getBenchmarkDifficultyPenalty(benchmarkName: string): number {
  const normalized = benchmarkName.trim().toLowerCase()
  let penalty = 8
  if (normalized.includes("accuracy")) penalty += 2
  if (normalized.includes("quality")) penalty += 1
  if (normalized.includes("safety") || normalized.includes("approval")) penalty += 4
  if (normalized.includes("latency")) penalty += 3
  if (normalized.includes("cost")) penalty += 2
  if (normalized.includes("weekly")) penalty += 1
  return penalty
}

export function buildDerivedAgentRunMetrics(input: DerivedAgentRunMetricsInput): {
  tokenInput: number
  tokenOutput: number
  estimatedCostUsd: number
  efficiencyGainPct: number
} {
  const template = getTemplateById(input.templateId)
  const model = getModelById(input.preferredModelId)
  const purposeWords = countWords(input.purpose)
  const summaryWords = countWords(input.summary)
  const skillCount = countUnique(input.skills)
  const connectorCount = countUnique([...input.connectors, ...(template?.requiredConnectors ?? [])])
  const templatePromptWords = countWords(template?.defaultPrompt ?? "")

  const tokenInput = Math.round(
    clampNumber(
      (
        1200 +
        purposeWords * 9 +
        summaryWords * 20 +
        skillCount * 170 +
        connectorCount * 230 +
        templatePromptWords * 4
      ) * getModelTokenMultiplier(model),
      1400,
      48_000,
    ),
  )

  const outputRatio = clampNumber(
    0.22 +
      skillCount * 0.012 +
      connectorCount * 0.01 +
      (template?.category === "content" ? 0.08 : template?.category === "executive" ? 0.05 : 0.03),
    0.18,
    0.48,
  )

  const tokenOutput = Math.round(clampNumber(tokenInput * outputRatio, 500, 16_000))
  const rates = getModelRates(model)
  const estimatedCostUsd = Math.round((tokenInput * rates.inputRate + tokenOutput * rates.outputRate) * 100) / 100
  const baselineEfficiency = input.weeklyEfficiencyGainPct > 0 ? input.weeklyEfficiencyGainPct : template?.expectedWeeklyGainPct ?? 10
  const efficiencyGainPct = Math.round(
    clampNumber(
      baselineEfficiency * 0.7 +
        (template?.expectedWeeklyGainPct ?? 0) * 0.2 +
        skillCount * 1.4 +
        connectorCount * 1.1,
      2,
      100,
    ),
  )

  return {
    tokenInput,
    tokenOutput,
    estimatedCostUsd,
    efficiencyGainPct,
  }
}

export function buildDerivedAgentEvaluation(input: DerivedAgentEvaluationInput): {
  scorePct: number
  status: AgentEvaluationStatus
  summary: string
} {
  const model = getModelById(input.preferredModelId)
  const skillCount = countUnique(input.skills)
  const connectorCount = countUnique(input.connectors)
  const purposeWords = countWords(input.purpose)
  const modelBonus = model?.provider === "local" ? 3 : model?.costTier === "high" ? 2 : 1
  const difficultyPenalty = getBenchmarkDifficultyPenalty(input.benchmarkName)

  const scorePct = Math.round(
    clampNumber(
      54 +
        input.weeklyEfficiencyGainPct * 1.6 +
        skillCount * 2.3 +
        connectorCount * 1.8 +
        Math.min(6, purposeWords * 0.25) +
        modelBonus -
        difficultyPenalty,
      0,
      100,
    ),
  )

  const status: AgentEvaluationStatus = scorePct >= input.thresholdPct ? "passed" : "failed"
  const margin = scorePct - input.thresholdPct
  const summary =
    status === "passed"
      ? margin >= 8
        ? "Evaluation benchmark passed with healthy headroom based on the current agent configuration."
        : "Evaluation benchmark passed, but the margin is narrow. Monitor recent prompt and connector changes."
      : "Evaluation benchmark failed against the configured threshold. Review prompt scope, connector coverage, and accepted skills."

  return { scorePct, status, summary }
}
