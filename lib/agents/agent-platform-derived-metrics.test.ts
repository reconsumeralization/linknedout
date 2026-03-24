import { describe, expect, it } from "vitest"
import {
  buildDerivedAgentEvaluation,
  buildDerivedAgentRunMetrics,
} from "@/lib/agents/agent-platform-derived-metrics"

describe("agent platform derived metrics", () => {
  it("builds stable run metrics from agent configuration", () => {
    const richInput = {
      purpose: "Analyze CRM activity, enrich accounts, and produce outreach recommendations.",
      skills: ["Research", "Summarization", "CRM", "Outreach"],
      connectors: ["gmail", "slack", "crm"],
      preferredModelId: "claude-3.7-sonnet",
      weeklyEfficiencyGainPct: 18,
      summary: "Manual workflow run executed after reviewing advertiser expansion opportunities and CRM gaps.",
      templateId: "sales-intel",
    }

    const leanInput = {
      purpose: "Summarize notes.",
      skills: ["Summarization"],
      connectors: [],
      preferredModelId: "gpt-4.1-mini",
      weeklyEfficiencyGainPct: 6,
      summary: "Manual run.",
      templateId: null,
    }

    const first = buildDerivedAgentRunMetrics(richInput)
    const second = buildDerivedAgentRunMetrics(richInput)
    const lean = buildDerivedAgentRunMetrics(leanInput)

    expect(second).toEqual(first)
    expect(first.tokenInput).toBeGreaterThan(lean.tokenInput)
    expect(first.tokenOutput).toBeGreaterThan(lean.tokenOutput)
    expect(first.estimatedCostUsd).toBeGreaterThan(lean.estimatedCostUsd)
    expect(first.efficiencyGainPct).toBeGreaterThan(lean.efficiencyGainPct)
  })

  it("builds stable evaluation results from agent coverage", () => {
    const strongInput = {
      purpose: "Review weekly pipeline coverage and recommend next actions for the revenue team.",
      skills: ["CRM", "Research", "Planning", "Outreach"],
      connectors: ["gmail", "crm", "slack"],
      preferredModelId: "gpt-4.1-mini",
      weeklyEfficiencyGainPct: 18,
      benchmarkName: "pipeline_accuracy_benchmark",
      thresholdPct: 85,
    }

    const weakInput = {
      purpose: "Summarize notes.",
      skills: ["Summarization"],
      connectors: [],
      preferredModelId: "gpt-4.1-mini",
      weeklyEfficiencyGainPct: 4,
      benchmarkName: "weekly_summary_accuracy_safety",
      thresholdPct: 82,
    }

    const strong = buildDerivedAgentEvaluation(strongInput)
    const strongRepeat = buildDerivedAgentEvaluation(strongInput)
    const weak = buildDerivedAgentEvaluation(weakInput)

    expect(strongRepeat).toEqual(strong)
    expect(strong.status).toBe("passed")
    expect(weak.status).toBe("failed")
    expect(strong.scorePct).toBeGreaterThan(weak.scorePct)
    expect(strong.summary).toMatch(/passed/i)
    expect(weak.summary).toMatch(/failed/i)
  })
})
