import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  detectAnomalies,
  analyzeAgentPerformance,
  proposePromptOptimization,
  rankTribalDna,
  generateImprovementPlan,
  AnomalyReport,
  PerformanceAnalysis,
  PromptOptimization,
  ImprovementPlan,
  TribalDnaEntry,
} from "@/lib/agents/meta-agent-reasoning"
import {
  AgentRunRecord,
  AgentEvaluationRecord,
  AgentDefinitionRecord,
} from "@/lib/agents/agent-platform-types"

// Mock the ai module
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}))

import { generateObject } from "ai"

/**
 * Mock data builders
 */

function createMockRun(overrides?: Partial<AgentRunRecord>): AgentRunRecord {
  return {
    id: `run-${Math.random()}`,
    agentId: "agent-test",
    status: "completed",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    tokenInput: 1000,
    tokenOutput: 500,
    estimatedCostUsd: 1.0,
    efficiencyGainPct: 15,
    summary: "Test run",
    ...overrides,
  }
}

function createMockEvaluation(overrides?: Partial<AgentEvaluationRecord>): AgentEvaluationRecord {
  return {
    id: `eval-${Math.random()}`,
    agentId: "agent-test",
    benchmarkName: "test_benchmark",
    scorePct: 85,
    thresholdPct: 80,
    status: "passed",
    summary: "Evaluation passed",
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function createMockAgent(overrides?: Partial<AgentDefinitionRecord>): AgentDefinitionRecord {
  return {
    id: "agent-test",
    name: "Test Agent",
    purpose: "Test agent purpose",
    soul: "Test agent soul",
    skills: ["skill1", "skill2"],
    status: "active",
    preferredModelId: "gpt-4.1-mini",
    fallbackModelIds: ["gpt-3.5-turbo"],
    connectors: ["connector1"],
    recursiveImprovementEnabled: true,
    tokenBudgetUsdMonthly: 500,
    weeklyEfficiencyGainPct: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("meta-agent-reasoning", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("detectAnomalies()", () => {
    it("returns healthy status for empty runs array", () => {
      const result = detectAnomalies([])
      expect(result.overallHealth).toBe("healthy")
      expect(result.anomalies).toHaveLength(0)
    })

    it("returns healthy status for single run", () => {
      const runs = [createMockRun()]
      const result = detectAnomalies(runs)
      expect(result.overallHealth).toBe("healthy")
      expect(result.anomalies).toHaveLength(0)
    })

    it("detects cost spike when run exceeds 2x baseline", () => {
      const baselineCost = 1.0
      const runs = [
        createMockRun({ id: "run-1", estimatedCostUsd: baselineCost }),
        createMockRun({ id: "run-2", estimatedCostUsd: baselineCost }),
        createMockRun({
          id: "run-3",
          estimatedCostUsd: baselineCost * 2.5, // 2.5x threshold
        }),
      ]

      const result = detectAnomalies(runs, 1.5)
      const costAnomalies = result.anomalies.filter((a) => a.type === "cost_spike")
      expect(costAnomalies.length).toBeGreaterThan(0)
      expect(costAnomalies[0].severity).toBe("high")
    })

    it("detects cost spike with medium severity when 1.5x to 2x baseline", () => {
      const baselineCost = 1.0
      const runs = [
        createMockRun({ id: "run-1", estimatedCostUsd: baselineCost }),
        createMockRun({ id: "run-2", estimatedCostUsd: baselineCost }),
        createMockRun({
          id: "run-3",
          estimatedCostUsd: baselineCost * 1.8, // 1.8x threshold
        }),
      ]

      const result = detectAnomalies(runs, 1.5)
      const costAnomalies = result.anomalies.filter((a) => a.type === "cost_spike")
      expect(costAnomalies.length).toBeGreaterThan(0)
      expect(costAnomalies[0].severity).toBe("medium")
    })

    it("detects token surge when tokens exceed threshold", () => {
      const baselineTokens = 1500 // tokenInput + tokenOutput
      const runs = [
        createMockRun({
          id: "run-1",
          tokenInput: 1000,
          tokenOutput: 500,
        }),
        createMockRun({
          id: "run-2",
          tokenInput: 1000,
          tokenOutput: 500,
        }),
        createMockRun({
          id: "run-3",
          tokenInput: 2500, // 2000 total > 1500 * 1.5
          tokenOutput: 1000,
        }),
      ]

      const result = detectAnomalies(runs, 1.5)
      const tokenAnomalies = result.anomalies.filter((a) => a.type === "token_surge")
      expect(tokenAnomalies.length).toBeGreaterThan(0)
    })

    it("detects efficiency drop when efficiency falls below baseline", () => {
      const runs = [
        createMockRun({
          id: "run-1",
          efficiencyGainPct: 20,
        }),
        createMockRun({
          id: "run-2",
          efficiencyGainPct: 18,
        }),
        createMockRun({
          id: "run-3",
          efficiencyGainPct: 5, // Below baseline / threshold
        }),
      ]

      const result = detectAnomalies(runs, 1.5)
      const efficiencyAnomalies = result.anomalies.filter(
        (a) => a.type === "efficiency_drop"
      )
      expect(efficiencyAnomalies.length).toBeGreaterThan(0)
    })

    it("detects failure streak of 3+ consecutive failures", () => {
      const runs = [
        createMockRun({ id: "run-1", status: "completed" }),
        createMockRun({ id: "run-2", status: "completed" }),
        createMockRun({ id: "run-3", status: "failed" }),
        createMockRun({ id: "run-4", status: "failed" }),
        createMockRun({ id: "run-5", status: "failed" }),
      ]

      const result = detectAnomalies(runs)
      const failureAnomalies = result.anomalies.filter(
        (a) => a.type === "failure_streak"
      )
      expect(failureAnomalies.length).toBeGreaterThan(0)
      expect(failureAnomalies[0].details).toContain("3")
    })

    it("assigns high severity for failure streak of 5+ failures", () => {
      const runs = Array.from({ length: 20 }, (_, i) =>
        createMockRun({
          id: `run-${i}`,
          status: i >= 15 ? "failed" : "completed", // 5 failures at end
        })
      )

      const result = detectAnomalies(runs)
      const failureAnomalies = result.anomalies.filter(
        (a) => a.type === "failure_streak"
      )
      expect(failureAnomalies.length).toBeGreaterThan(0)
      expect(failureAnomalies[0].severity).toBe("high")
    })

    it("returns 'critical' health when 2+ high severity anomalies", () => {
      const runs = [
        createMockRun({ id: "run-1", estimatedCostUsd: 1.0 }),
        createMockRun({ id: "run-2", estimatedCostUsd: 1.0 }),
        createMockRun({
          id: "run-3",
          estimatedCostUsd: 3.0, // Cost spike (high)
          tokenInput: 5000, // Token surge (high)
          tokenOutput: 1000,
        }),
      ]

      const result = detectAnomalies(runs, 1.5)
      expect(result.overallHealth).toBe("critical")
    })

    it("returns 'critical' health for failure streak of 5+", () => {
      const runs = Array.from({ length: 20 }, (_, i) =>
        createMockRun({
          id: `run-${i}`,
          status: i >= 15 ? "failed" : "completed",
        })
      )

      const result = detectAnomalies(runs)
      expect(result.overallHealth).toBe("critical")
    })

    it("returns 'warning' health with 1 high severity or 3+ medium", () => {
      const runs = [
        createMockRun({ id: "run-1", estimatedCostUsd: 1.0 }),
        createMockRun({ id: "run-2", estimatedCostUsd: 1.0 }),
        createMockRun({
          id: "run-3",
          estimatedCostUsd: 1.8, // Medium cost spike
        }),
        createMockRun({
          id: "run-4",
          tokenInput: 2000,
          tokenOutput: 800, // Medium token surge
        }),
        createMockRun({
          id: "run-5",
          efficiencyGainPct: 5, // Medium efficiency drop
        }),
      ]

      const result = detectAnomalies(runs, 1.5)
      expect(result.overallHealth).toBe("warning")
    })

    it("limits anomalies to top 15", () => {
      const runs = Array.from({ length: 30 }, (_, i) =>
        createMockRun({
          id: `run-${i}`,
          estimatedCostUsd: i % 2 === 0 ? 10.0 : 1.0, // Alternating spikes
        })
      )

      const result = detectAnomalies(runs, 1.5)
      expect(result.anomalies.length).toBeLessThanOrEqual(15)
    })

    it("includes correct fields in anomaly objects", () => {
      const runs = [
        createMockRun({ id: "run-1", estimatedCostUsd: 1.0 }),
        createMockRun({ id: "run-2", estimatedCostUsd: 1.0 }),
        createMockRun({
          id: "run-3",
          estimatedCostUsd: 3.0,
        }),
      ]

      const result = detectAnomalies(runs, 1.5)
      expect(result.anomalies.length).toBeGreaterThan(0)

      const anomaly = result.anomalies[0]
      expect(anomaly).toHaveProperty("type")
      expect(anomaly).toHaveProperty("severity")
      expect(anomaly).toHaveProperty("runId")
      expect(anomaly).toHaveProperty("details")
      expect(anomaly).toHaveProperty("suggestedAction")
    })
  })

  describe("analyzeAgentPerformance()", () => {
    it("accepts correct input types", async () => {
      const runs = [createMockRun()]
      const evaluations = [createMockEvaluation()]
      const agentId = "agent-test"

      // Mock the LLM response
      const mockResult = {
        object: {
          failurePatterns: [
            {
              pattern: "test pattern",
              frequency: 2,
              suggestion: "test suggestion",
            },
          ],
          costTrend: "stable" as const,
          recommendations: ["recommendation1"],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await analyzeAgentPerformance(agentId, runs, evaluations)

      expect(result).toHaveProperty("agentId")
      expect(result).toHaveProperty("periodStart")
      expect(result).toHaveProperty("periodEnd")
      expect(result).toHaveProperty("totalRuns")
      expect(result).toHaveProperty("successRate")
      expect(result).toHaveProperty("avgCostPerRun")
      expect(result).toHaveProperty("avgTokensPerRun")
      expect(result).toHaveProperty("failurePatterns")
      expect(result).toHaveProperty("costTrend")
      expect(result).toHaveProperty("recommendations")
    })

    it("returns PerformanceAnalysis with correct output structure", async () => {
      const runs = [
        createMockRun({ status: "completed" }),
        createMockRun({ status: "completed" }),
        createMockRun({ status: "failed" }),
      ]
      const evaluations = [createMockEvaluation()]

      const mockResult = {
        object: {
          failurePatterns: [],
          costTrend: "increasing" as const,
          recommendations: [],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await analyzeAgentPerformance("agent-test", runs, evaluations)

      expect(result.agentId).toBe("agent-test")
      expect(result.totalRuns).toBe(3)
      expect(result.successRate).toBeCloseTo(66.7, 1)
      expect(result.avgCostPerRun).toBeGreaterThan(0)
      expect(result.avgTokensPerRun).toBeGreaterThan(0)
    })

    it("calls generateObject with correct schema", async () => {
      const runs = [createMockRun()]
      const evaluations = [createMockEvaluation()]

      const mockResult = {
        object: {
          failurePatterns: [],
          costTrend: "stable" as const,
          recommendations: [],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      await analyzeAgentPerformance("agent-test", runs, evaluations)

      expect(generateObject).toHaveBeenCalled()
      const call = vi.mocked(generateObject).mock.calls[0][0]
      expect(call).toHaveProperty("schema")
      expect(call).toHaveProperty("prompt")
    })

    it("throws error on LLM timeout", async () => {
      const runs = [createMockRun()]
      const evaluations = [createMockEvaluation()]

      vi.mocked(generateObject).mockRejectedValueOnce(new Error("LLM call timeout"))

      await expect(analyzeAgentPerformance("agent-test", runs, evaluations)).rejects.toThrow()
    })

    it("handles empty runs array", async () => {
      const mockResult = {
        object: {
          failurePatterns: [],
          costTrend: "stable" as const,
          recommendations: [],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await analyzeAgentPerformance("agent-test", [], [])

      expect(result.totalRuns).toBe(0)
      expect(result.successRate).toBe(0)
      expect(result.avgCostPerRun).toBe(0)
    })
  })

  describe("proposePromptOptimization()", () => {
    it("accepts correct input types", async () => {
      const agent = createMockAgent()
      const runs = [createMockRun()]
      const evaluations = [createMockEvaluation()]

      const mockResult = {
        object: {
          proposedSoul: "new soul",
          reasoning: "reasoning",
          estimatedImprovementPct: 25,
          confidence: "high" as const,
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await proposePromptOptimization(agent, runs, evaluations)

      expect(result).toHaveProperty("agentId")
      expect(result).toHaveProperty("currentSoul")
      expect(result).toHaveProperty("proposedSoul")
      expect(result).toHaveProperty("reasoning")
      expect(result).toHaveProperty("estimatedImprovementPct")
      expect(result).toHaveProperty("confidence")
    })

    it("returns PromptOptimization with correct structure", async () => {
      const agent = createMockAgent({ id: "agent-123", soul: "current soul" })
      const runs = [
        createMockRun({ status: "completed", efficiencyGainPct: 20 }),
        createMockRun({ status: "failed" }),
      ]
      const evaluations = [createMockEvaluation({ status: "failed" })]

      const mockResult = {
        object: {
          proposedSoul: "improved soul",
          reasoning: "patterns suggest...",
          estimatedImprovementPct: 15,
          confidence: "medium" as const,
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await proposePromptOptimization(agent, runs, evaluations)

      expect(result.agentId).toBe("agent-123")
      expect(result.currentSoul).toBe("current soul")
      expect(result.proposedSoul).toBe("improved soul")
      expect(result.confidence).toMatch(/low|medium|high/)
    })

    it("calls generateObject with correct prompt content", async () => {
      const agent = createMockAgent()
      const runs = [createMockRun()]
      const evaluations = [createMockEvaluation()]

      const mockResult = {
        object: {
          proposedSoul: "new soul",
          reasoning: "reasoning",
          estimatedImprovementPct: 20,
          confidence: "medium" as const,
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      await proposePromptOptimization(agent, runs, evaluations)

      expect(generateObject).toHaveBeenCalled()
      const call = vi.mocked(generateObject).mock.calls[0][0]
      expect(call.prompt).toContain(agent.purpose)
    })

    it("throws error on LLM failure", async () => {
      const agent = createMockAgent()
      const runs = [createMockRun()]
      const evaluations = [createMockEvaluation()]

      vi.mocked(generateObject).mockRejectedValueOnce(new Error("LLM error"))

      await expect(proposePromptOptimization(agent, runs, evaluations)).rejects.toThrow()
    })
  })

  describe("rankTribalDna()", () => {
    it("accepts correct input types", async () => {
      const dnaEntries: TribalDnaEntry[] = [
        {
          id: "dna-1",
          category: "pattern",
          content: "Test pattern",
        },
      ]
      const agentContext = {
        purpose: "Test purpose",
        skills: ["skill1", "skill2"],
        recentFailures: ["failure1"],
      }

      const mockResult = {
        object: {
          rankings: [{ id: "dna-1", relevanceScore: 75 }],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await rankTribalDna(dnaEntries, agentContext)

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(dnaEntries.length)
    })

    it("returns ranked TribalDnaEntry array with relevance scores", async () => {
      const dnaEntries: TribalDnaEntry[] = [
        { id: "dna-1", category: "pattern", content: "Pattern 1" },
        { id: "dna-2", category: "principle", content: "Principle 1" },
      ]
      const agentContext = {
        purpose: "sales research",
        skills: ["research"],
      }

      const mockResult = {
        object: {
          rankings: [
            { id: "dna-1", relevanceScore: 85 },
            { id: "dna-2", relevanceScore: 45 },
          ],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await rankTribalDna(dnaEntries, agentContext)

      expect(result[0].relevanceScore).toBe(85)
      expect(result[1].relevanceScore).toBe(45)
      expect(result[0].relevanceScore!).toBeGreaterThan(result[1].relevanceScore!)
    })

    it("sorts entries by relevance score descending", async () => {
      const dnaEntries: TribalDnaEntry[] = [
        { id: "dna-1", category: "pattern", content: "Pattern 1" },
        { id: "dna-2", category: "principle", content: "Principle 1" },
        { id: "dna-3", category: "skill", content: "Skill 1" },
      ]
      const agentContext = {
        purpose: "test",
        skills: ["test"],
      }

      const mockResult = {
        object: {
          rankings: [
            { id: "dna-1", relevanceScore: 50 },
            { id: "dna-2", relevanceScore: 90 },
            { id: "dna-3", relevanceScore: 60 },
          ],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await rankTribalDna(dnaEntries, agentContext)

      expect(result[0].id).toBe("dna-2") // 90
      expect(result[1].id).toBe("dna-3") // 60
      expect(result[2].id).toBe("dna-1") // 50
    })

    it("falls back to zero scores on LLM error", async () => {
      const dnaEntries: TribalDnaEntry[] = [
        { id: "dna-1", category: "pattern", content: "Pattern 1" },
      ]
      const agentContext = {
        purpose: "test",
        skills: ["test"],
      }

      vi.mocked(generateObject).mockRejectedValueOnce(new Error("LLM error"))

      const result = await rankTribalDna(dnaEntries, agentContext)

      expect(result.length).toBe(1)
      expect(result[0].relevanceScore).toBe(0)
    })

    it("includes optional recentFailures in context", async () => {
      const dnaEntries: TribalDnaEntry[] = [
        { id: "dna-1", category: "guardrail", content: "Test guardrail" },
      ]
      const agentContext = {
        purpose: "test",
        skills: ["test"],
        recentFailures: ["auth error", "timeout"],
      }

      const mockResult = {
        object: {
          rankings: [{ id: "dna-1", relevanceScore: 65 }],
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      await rankTribalDna(dnaEntries, agentContext)

      const call = vi.mocked(generateObject).mock.calls[0][0]
      expect(call.prompt).toContain("auth error")
    })
  })

  describe("generateImprovementPlan()", () => {
    it("accepts correct input types", async () => {
      const agent = createMockAgent()
      const analysis: PerformanceAnalysis = {
        agentId: "agent-test",
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        totalRuns: 10,
        successRate: 85,
        avgCostPerRun: 1.5,
        avgTokensPerRun: 2000,
        failurePatterns: [
          {
            pattern: "timeout",
            frequency: 3,
            suggestion: "increase timeout",
          },
        ],
        costTrend: "stable",
        recommendations: ["test"],
      }

      const mockResult = {
        object: {
          priority: [
            {
              action: "action1",
              estimatedImpact: "high",
              effort: "low" as const,
            },
          ],
          modelRecommendation: null,
          connectorChanges: [],
          estimatedOverallImprovementPct: 20,
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await generateImprovementPlan(agent, analysis)

      expect(result).toHaveProperty("agentId")
      expect(result).toHaveProperty("priority")
      expect(result).toHaveProperty("promptChanges")
      expect(result).toHaveProperty("modelRecommendation")
      expect(result).toHaveProperty("connectorChanges")
      expect(result).toHaveProperty("estimatedOverallImprovementPct")
    })

    it("returns ImprovementPlan with correct structure", async () => {
      const agent = createMockAgent({ id: "agent-456" })
      const analysis: PerformanceAnalysis = {
        agentId: "agent-456",
        periodStart: "2024-01-01T00:00:00Z",
        periodEnd: "2024-01-31T23:59:59Z",
        totalRuns: 50,
        successRate: 78,
        avgCostPerRun: 2.1,
        avgTokensPerRun: 3000,
        failurePatterns: [
          {
            pattern: "rate_limit",
            frequency: 5,
            suggestion: "add backoff logic",
          },
        ],
        costTrend: "increasing",
        recommendations: ["switch to lower cost model"],
      }

      const mockResult = {
        object: {
          priority: [
            {
              action: "implement backoff",
              estimatedImpact: "medium",
              effort: "medium" as const,
            },
            {
              action: "test lower cost model",
              estimatedImpact: "high",
              effort: "low" as const,
            },
          ],
          modelRecommendation: "kimi-2.5",
          connectorChanges: ["reduce api frequency"],
          estimatedOverallImprovementPct: 35,
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await generateImprovementPlan(agent, analysis)

      expect(result.agentId).toBe("agent-456")
      expect(result.priority.length).toBeGreaterThan(0)
      expect(result.priority[0]).toHaveProperty("action")
      expect(result.priority[0]).toHaveProperty("estimatedImpact")
      expect(result.priority[0]).toHaveProperty("effort")
      expect(result.modelRecommendation).toBe("kimi-2.5")
      expect(result.estimatedOverallImprovementPct).toBe(35)
    })

    it("calls generateObject with failure pattern summary", async () => {
      const agent = createMockAgent()
      const analysis: PerformanceAnalysis = {
        agentId: "agent-test",
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        totalRuns: 10,
        successRate: 85,
        avgCostPerRun: 1.5,
        avgTokensPerRun: 2000,
        failurePatterns: [
          {
            pattern: "connection timeout",
            frequency: 4,
            suggestion: "increase timeout value",
          },
        ],
        costTrend: "stable",
        recommendations: [],
      }

      const mockResult = {
        object: {
          priority: [],
          modelRecommendation: null,
          connectorChanges: [],
          estimatedOverallImprovementPct: 10,
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      await generateImprovementPlan(agent, analysis)

      const call = vi.mocked(generateObject).mock.calls[0][0]
      expect(call.prompt).toContain("connection timeout")
    })

    it("throws error on LLM failure", async () => {
      const agent = createMockAgent()
      const analysis: PerformanceAnalysis = {
        agentId: "agent-test",
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        totalRuns: 10,
        successRate: 85,
        avgCostPerRun: 1.5,
        avgTokensPerRun: 2000,
        failurePatterns: [],
        costTrend: "stable",
        recommendations: [],
      }

      vi.mocked(generateObject).mockRejectedValueOnce(new Error("LLM error"))

      await expect(generateImprovementPlan(agent, analysis)).rejects.toThrow()
    })

    it("sets promptChanges to null", async () => {
      const agent = createMockAgent()
      const analysis: PerformanceAnalysis = {
        agentId: "agent-test",
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        totalRuns: 10,
        successRate: 85,
        avgCostPerRun: 1.5,
        avgTokensPerRun: 2000,
        failurePatterns: [],
        costTrend: "stable",
        recommendations: [],
      }

      const mockResult = {
        object: {
          priority: [],
          modelRecommendation: null,
          connectorChanges: [],
          estimatedOverallImprovementPct: 10,
        },
      }

      vi.mocked(generateObject).mockResolvedValueOnce(mockResult as any)

      const result = await generateImprovementPlan(agent, analysis)

      expect(result.promptChanges).toBeNull()
    })
  })
})
