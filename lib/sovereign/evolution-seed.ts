// =============================================================================
// Evolution Seed Data: Demo records for the Singularity Pulse dashboard
// Used when Supabase is not connected to show realistic metrics
// =============================================================================

import type {
  IntelligenceTariffAudit,
  AgentHarnessEvolution,
  TribalAutoResearchCampaign,
  AutoResearchExperiment,
} from "@/lib/shared/types"

const now = new Date().toISOString()
const oneDay = 24 * 60 * 60 * 1000
const daysAgo = (d: number) => new Date(Date.now() - d * oneDay).toISOString()

export function getSeedTariffAudits(): IntelligenceTariffAudit[] {
  return [
    {
      id: "seed-tariff-1",
      userId: "demo-user",
      taskDomain: "contract_review",
      frontierModel: "opus-4.6",
      frontierCostPerTaskUsd: 0.12,
      frontierAccuracyPct: 99.2,
      localModel: "qwen-27b-legal-v3",
      localAccuracyPct: 96.8,
      parityThresholdPct: 95,
      trainingDataSize: 4200,
      fineTuneStatus: "deployed",
      monthlySavingsUsd: 1800,
      isReplacementActive: true,
      createdAt: daysAgo(14),
      updatedAt: daysAgo(2),
    },
    {
      id: "seed-tariff-2",
      userId: "demo-user",
      taskDomain: "code_generation",
      frontierModel: "gpt-5.4",
      frontierCostPerTaskUsd: 0.08,
      frontierAccuracyPct: 97.5,
      localModel: "mistral-24b-code-v2",
      localAccuracyPct: 93.1,
      parityThresholdPct: 95,
      trainingDataSize: 2800,
      fineTuneStatus: "training",
      monthlySavingsUsd: 950,
      isReplacementActive: false,
      createdAt: daysAgo(7),
      updatedAt: daysAgo(1),
    },
    {
      id: "seed-tariff-3",
      userId: "demo-user",
      taskDomain: "data_analysis",
      frontierModel: "opus-4.6",
      frontierCostPerTaskUsd: 0.06,
      frontierAccuracyPct: 98.0,
      localModel: "qwen-27b-analytics-v1",
      localAccuracyPct: 97.2,
      parityThresholdPct: 95,
      trainingDataSize: 5100,
      fineTuneStatus: "deployed",
      monthlySavingsUsd: 720,
      isReplacementActive: true,
      createdAt: daysAgo(21),
      updatedAt: daysAgo(3),
    },
  ]
}

export function getSeedHarnessEvolutions(): AgentHarnessEvolution[] {
  return [
    {
      id: "seed-evo-1",
      agentDefinitionId: "agent-sales-001",
      userId: "demo-user",
      evolutionType: "performance_optimization",
      triggerSource: "benchmark_regression",
      diagnosis: "Response latency increased 40% after last tool connector update",
      proposedFix: "Replace synchronous API calls with batched async pipeline",
      experimentBranch: "evo/sales-agent-async-pipeline",
      beforeMetrics: { avgResponseMs: 2800, errorRate: 0.03 },
      afterMetrics: { avgResponseMs: 1650, errorRate: 0.01 },
      improvementPct: 41,
      status: "merged",
      autoMerged: true,
      createdAt: daysAgo(5),
    },
    {
      id: "seed-evo-2",
      agentDefinitionId: "agent-legal-002",
      userId: "demo-user",
      evolutionType: "error_fix",
      triggerSource: "failure_pattern",
      diagnosis: "Hallucination rate of 8% on contract clause extraction",
      proposedFix: "Add RAG verification step with source citation requirement",
      experimentBranch: "evo/legal-agent-rag-verify",
      beforeMetrics: { hallucinationRate: 0.08, accuracy: 0.91 },
      afterMetrics: { hallucinationRate: 0.02, accuracy: 0.97 },
      improvementPct: 75,
      status: "merged",
      autoMerged: false,
      createdAt: daysAgo(3),
    },
    {
      id: "seed-evo-3",
      agentDefinitionId: "agent-research-003",
      userId: "demo-user",
      evolutionType: "cost_reduction",
      triggerSource: "cost_spike",
      diagnosis: "Research agent consuming 3x token budget due to verbose chain-of-thought",
      proposedFix: "Compress reasoning chain and cache intermediate results",
      experimentBranch: "evo/research-agent-compress",
      beforeMetrics: { tokensPerTask: 12000, costPerTask: 0.15 },
      afterMetrics: { tokensPerTask: 4200, costPerTask: 0.05 },
      improvementPct: 65,
      status: "experimenting",
      autoMerged: false,
      createdAt: daysAgo(1),
    },
    {
      id: "seed-evo-4",
      agentDefinitionId: "agent-security-004",
      userId: "demo-user",
      evolutionType: "capability_expansion",
      triggerSource: "schedule",
      diagnosis: "Security agent lacks OWASP API Top 10 scanning capability",
      proposedFix: "Add OWASP API scanner tool and integrate with MITRE TTP registry",
      experimentBranch: "evo/security-owasp-scanner",
      beforeMetrics: { ttpsCoovered: 142, scanDepth: "surface" },
      afterMetrics: { ttpsCoovered: 187, scanDepth: "deep" },
      improvementPct: 32,
      status: "validated",
      autoMerged: false,
      createdAt: daysAgo(2),
    },
    {
      id: "seed-evo-5",
      agentDefinitionId: "agent-cfo-005",
      userId: "demo-user",
      evolutionType: "performance_optimization",
      triggerSource: "schedule",
      diagnosis: "CFO agent weekly report generation takes 45 minutes",
      proposedFix: "Pre-compute financial snapshots nightly; report assembly becomes aggregation only",
      experimentBranch: undefined,
      beforeMetrics: { reportGenMinutes: 45 },
      afterMetrics: {},
      improvementPct: undefined,
      status: "diagnosed",
      autoMerged: false,
      createdAt: now,
    },
  ]
}

export function getSeedAutoResearchCampaigns(): TribalAutoResearchCampaign[] {
  return [
    {
      id: "seed-campaign-1",
      tribeId: "tribe-ai-core",
      initiatorUserId: "demo-user",
      researchGoal: "Optimize RAG retrieval latency below 200ms for 10K document collections",
      hypothesis: "Hybrid vector + keyword search with pre-computed embeddings can achieve sub-200ms at scale",
      experimentSpec: {
        model: "qwen-27b",
        dataset: "tribal_knowledge_base_10k",
        evalCriteria: "p95_latency_ms < 200 AND recall@10 > 0.92",
        maxRounds: 20,
      },
      participantCount: 47,
      maxParticipants: 100,
      status: "completed",
      winningExperimentId: "seed-exp-2",
      resultsSummary: {
        bestLatencyMs: 142,
        bestRecall: 0.96,
        approach: "HNSW index + BM25 re-ranker with query expansion",
        breakthroughInsight: "Pre-warming the HNSW graph on cold start reduced p99 from 380ms to 165ms",
      },
      totalComputeTokensSpent: 284000,
      breakthroughAchieved: true,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(2),
    },
  ]
}

export function getSeedAutoResearchExperiments(): AutoResearchExperiment[] {
  return [
    {
      id: "seed-exp-1",
      campaignId: "seed-campaign-1",
      participantUserId: "demo-user-2",
      agentSandboxId: "sandbox-exp-1",
      experimentConfig: { approach: "pure_vector", index: "IVF_FLAT", embeddingModel: "e5-large" },
      resultMetrics: { p95LatencyMs: 310, recall10: 0.89, indexBuildTimeSec: 45 },
      score: 72,
      isWinner: false,
      computeTokensUsed: 52000,
      gitCommitHash: "a3f7e21",
      status: "completed",
      createdAt: daysAgo(9),
      completedAt: daysAgo(8),
    },
    {
      id: "seed-exp-2",
      campaignId: "seed-campaign-1",
      participantUserId: "demo-user-3",
      agentSandboxId: "sandbox-exp-2",
      experimentConfig: { approach: "hybrid_hnsw_bm25", index: "HNSW", embeddingModel: "e5-large", reranker: "BM25", preWarm: true },
      resultMetrics: { p95LatencyMs: 142, recall10: 0.96, indexBuildTimeSec: 120 },
      score: 96,
      isWinner: true,
      computeTokensUsed: 78000,
      gitCommitHash: "d9c4b88",
      status: "completed",
      createdAt: daysAgo(9),
      completedAt: daysAgo(6),
    },
    {
      id: "seed-exp-3",
      campaignId: "seed-campaign-1",
      participantUserId: "demo-user-4",
      agentSandboxId: "sandbox-exp-3",
      experimentConfig: { approach: "keyword_only", index: "BM25_Okapi", embeddingModel: "none" },
      resultMetrics: { p95LatencyMs: 85, recall10: 0.71, indexBuildTimeSec: 12 },
      score: 58,
      isWinner: false,
      computeTokensUsed: 31000,
      gitCommitHash: "f1a2c33",
      status: "completed",
      createdAt: daysAgo(9),
      completedAt: daysAgo(7),
    },
    {
      id: "seed-exp-4",
      campaignId: "seed-campaign-1",
      participantUserId: "demo-user-5",
      agentSandboxId: "sandbox-exp-4",
      experimentConfig: { approach: "colbert_late_interaction", index: "ColBERT_v2", embeddingModel: "colbert-v2" },
      resultMetrics: { p95LatencyMs: 225, recall10: 0.94, indexBuildTimeSec: 200 },
      score: 85,
      isWinner: false,
      computeTokensUsed: 123000,
      gitCommitHash: "b7e5a11",
      status: "completed",
      createdAt: daysAgo(9),
      completedAt: daysAgo(5),
    },
  ]
}

/** All seed data in one call */
export function getEvolutionSeedData() {
  return {
    tariffAudits: getSeedTariffAudits(),
    harnessEvolutions: getSeedHarnessEvolutions(),
    autoResearchCampaigns: getSeedAutoResearchCampaigns(),
    autoResearchExperiments: getSeedAutoResearchExperiments(),
  }
}
