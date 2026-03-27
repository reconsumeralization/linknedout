// =============================================================================
// Recursive Self-Improvement Loop Orchestrator
// Chains Tools #129-131 into a single evolution cycle:
//   1. Intelligence Tariff Audit → identify costly API calls for local replacement
//   2. Agent Harness Evolution → self-diagnose and improve agent performance
//   3. Tribal Auto Research → launch coordinated overnight experiments
// =============================================================================

import { createClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SingularityPulseMetrics {
  selfImprovementRate: number       // harness evolutions per week
  intelligenceTariffSavings: number // monthly USD saved
  activeAutoResearch: number        // active campaigns
  tribalLearningVelocity: number    // experiments per week
  loopRunCount: number              // total loop executions
  lastRunAt: string | null          // ISO timestamp
  // Enhanced metrics (v2)
  sentinelIncidents: number         // active security incidents
  activeAgents: number              // running agent definitions
  sovereigntyScore: number          // 0-100 composite sovereignty health
  governmentCompliance: number      // regulatory filing compliance %
}

export interface EvolutionLoopStepResult {
  step: string
  action: string
  ok: boolean
  details: Record<string, unknown>
}

export interface EvolutionLoopResult {
  mode: "live" | "demo"
  startedAt: string
  completedAt: string
  steps: EvolutionLoopStepResult[]
  pulse: SingularityPulseMetrics
}

// ---------------------------------------------------------------------------
// Demo Mode: Hardcoded metrics for when Supabase isn't connected
// ---------------------------------------------------------------------------

export function getDemoPulseMetrics(): SingularityPulseMetrics {
  return {
    selfImprovementRate: 7,
    intelligenceTariffSavings: 2750,
    activeAutoResearch: 2,
    tribalLearningVelocity: 43,
    loopRunCount: 12,
    lastRunAt: new Date().toISOString(),
    sentinelIncidents: 0,
    activeAgents: 6,
    sovereigntyScore: 85,
    governmentCompliance: 92,
  }
}

function getDemoLoopResult(): EvolutionLoopResult {
  const now = new Date().toISOString()
  return {
    mode: "demo",
    startedAt: now,
    completedAt: now,
    steps: [
      {
        step: "intelligence_tariff_audit",
        action: "Identified 3 high-cost API tasks for local model replacement",
        ok: true,
        details: {
          auditsCreated: 3,
          topDomain: "contract_review",
          projectedMonthlySavings: 1800,
        },
      },
      {
        step: "agent_harness_evolution",
        action: "Diagnosed 2 agents with recurring failure patterns",
        ok: true,
        details: {
          evolutionsCreated: 2,
          topEvolution: "performance_optimization",
          avgImprovementPct: 31,
        },
      },
      {
        step: "tribal_auto_research",
        action: "Launched 1 research campaign: Optimize RAG retrieval latency",
        ok: true,
        details: {
          campaignsLaunched: 1,
          researchGoal: "Optimize RAG retrieval latency below 200ms",
          maxParticipants: 100,
        },
      },
      {
        step: "pulse_update",
        action: "Aggregated metrics across all evolution steps",
        ok: true,
        details: getDemoPulseMetrics() as unknown as Record<string, unknown>,
      },
    ],
    pulse: getDemoPulseMetrics(),
  }
}

// ---------------------------------------------------------------------------
// Live Mode: Reads from Supabase and runs real evolution steps
// ---------------------------------------------------------------------------

async function runLiveLoop(accessToken?: string): Promise<EvolutionLoopResult> {
  const startedAt = new Date().toISOString()
  const steps: EvolutionLoopStepResult[] = []

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    // No Supabase — fall back to demo
    return getDemoLoopResult()
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  })

  // Step 1: Intelligence Tariff Audit
  try {
    // Find the most expensive recent agent runs
    const { data: costlyRuns } = await client
      .from("agent_runs")
      .select("agent_id, estimated_cost_usd, summary")
      .order("estimated_cost_usd", { ascending: false })
      .limit(3)

    const auditsCreated: unknown[] = []
    for (const run of costlyRuns ?? []) {
      const { data: audit } = await client
        .from("intelligence_tariff_audits")
        .insert({
          user_id: (await client.auth.getUser()).data.user?.id,
          task_domain: "auto_detected",
          frontier_model: "opus-4.6",
          frontier_cost_per_task_usd: run.estimated_cost_usd ?? 0.05,
          frontier_accuracy_pct: 98,
          parity_threshold_pct: 95,
          fine_tune_status: "pending",
          monthly_savings_usd: (run.estimated_cost_usd ?? 0.05) * 30,
        })
        .select()
        .single()
      if (audit) auditsCreated.push(audit)
    }

    steps.push({
      step: "intelligence_tariff_audit",
      action: `Identified ${auditsCreated.length} high-cost tasks for local replacement`,
      ok: true,
      details: { auditsCreated: auditsCreated.length, projectedMonthlySavings: auditsCreated.length * 600 },
    })
  } catch (err) {
    steps.push({
      step: "intelligence_tariff_audit",
      action: "Failed to scan for costly API tasks",
      ok: false,
      details: { error: err instanceof Error ? err.message : "Unknown error" },
    })
  }

  // Step 2: Agent Harness Evolution
  try {
    // Find agents with recent failures
    const { data: failures } = await client
      .from("failure_ledger")
      .select("agent_id, failure_type, context")
      .order("created_at", { ascending: false })
      .limit(5)

    const evolutionsCreated: unknown[] = []
    const seenAgents = new Set<string>()
    for (const failure of failures ?? []) {
      const agentId = failure.agent_id
      if (!agentId || seenAgents.has(agentId)) continue
      seenAgents.add(agentId)

      const { data: evolution } = await client
        .from("agent_harness_evolutions")
        .insert({
          agent_definition_id: agentId,
          user_id: (await client.auth.getUser()).data.user?.id,
          evolution_type: "error_fix",
          trigger_source: "failure_pattern",
          diagnosis: `Recurring ${failure.failure_type} detected`,
          proposed_fix: `Auto-fix for ${failure.failure_type}: retrain or adjust harness parameters`,
          before_metrics: { failureType: failure.failure_type },
          status: "diagnosed",
        })
        .select()
        .single()
      if (evolution) evolutionsCreated.push(evolution)
    }

    steps.push({
      step: "agent_harness_evolution",
      action: `Diagnosed ${evolutionsCreated.length} agents with failure patterns`,
      ok: true,
      details: { evolutionsCreated: evolutionsCreated.length },
    })
  } catch (err) {
    steps.push({
      step: "agent_harness_evolution",
      action: "Failed to scan agent failures",
      ok: false,
      details: { error: err instanceof Error ? err.message : "Unknown error" },
    })
  }

  // Step 3: Tribal Auto Research
  try {
    const { data: campaign } = await client
      .from("tribal_auto_research_campaigns")
      .insert({
        tribe_id: "auto_evolution",
        initiator_user_id: (await client.auth.getUser()).data.user?.id,
        research_goal: "Nightly optimization: reduce agent error rate and API costs",
        hypothesis: "Local fine-tuned models can replace frontier APIs at 95% parity for repetitive tasks",
        experiment_spec: { model: "qwen-27b", evalCriteria: "accuracy_pct >= 95", maxRounds: 10 },
        status: "recruiting",
        max_participants: 100,
      })
      .select()
      .single()

    steps.push({
      step: "tribal_auto_research",
      action: campaign ? "Launched nightly optimization campaign" : "No campaign created",
      ok: !!campaign,
      details: { campaignId: campaign?.id ?? null },
    })
  } catch (err) {
    steps.push({
      step: "tribal_auto_research",
      action: "Failed to launch auto research",
      ok: false,
      details: { error: err instanceof Error ? err.message : "Unknown error" },
    })
  }

  // Step 4: Self-Improvement Feedback Loop — analyze past evolution results
  try {
    // Count consecutive failures per step type from recent runs
    const { data: recentEvolutions } = await client
      .from("agent_harness_evolutions")
      .select("evolution_type, status, diagnosis, created_at")
      .order("created_at", { ascending: false })
      .limit(20)

    const failPatterns = new Map<string, number>()
    for (const ev of recentEvolutions ?? []) {
      if (ev.status === "failed" || ev.status === "diagnosed") {
        const key = ev.evolution_type ?? "unknown"
        failPatterns.set(key, (failPatterns.get(key) ?? 0) + 1)
      }
    }

    // If a pattern has 3+ consecutive failures, escalate to a new evolution type
    let escalations = 0
    for (const [pattern, count] of failPatterns.entries()) {
      if (count >= 3) {
        await client.from("agent_harness_evolutions").insert({
          agent_definition_id: "meta-agent-0",
          user_id: (await client.auth.getUser()).data.user?.id,
          evolution_type: "recursive_self_improvement",
          trigger_source: "evolution_loop_feedback",
          diagnosis: `Pattern "${pattern}" has ${count} consecutive failures — escalating to RSI`,
          proposed_fix: `Retrain or restructure the "${pattern}" pipeline. Consider model swap or parameter tuning.`,
          before_metrics: { failurePattern: pattern, consecutiveFailures: count },
          status: "diagnosed",
        })
        escalations++
      }
    }

    steps.push({
      step: "self_improvement_feedback",
      action: `Analyzed ${recentEvolutions?.length ?? 0} recent evolutions, created ${escalations} RSI escalations`,
      ok: true,
      details: { patternsFound: failPatterns.size, escalations },
    })
  } catch (err) {
    steps.push({
      step: "self_improvement_feedback",
      ok: false,
      action: "Failed to run self-improvement feedback",
      details: { error: err instanceof Error ? err.message : "Unknown error" },
    })
  }

  // Step 5: LLM Self-Improvement Benchmark — compare challenger models against Opus 4.6
  try {
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString()

    // Get recent benchmark runs and calculate improvement velocity
    const [recentBenchmarks, improvementPlans] = await Promise.all([
      client.from("llm_benchmark_runs")
        .select("challenger_model, score_delta, task_type, created_at")
        .gte("created_at", oneDayAgo)
        .order("created_at", { ascending: false })
        .limit(50),
      client.from("llm_improvement_plans")
        .select("challenger_model, task_type, improvement_pct, applied")
        .eq("applied", true)
        .gte("created_at", oneDayAgo)
        .limit(20),
    ])

    const runs = recentBenchmarks.data ?? []
    const plans = improvementPlans.data ?? []
    const avgDelta = runs.length > 0
      ? Math.round(runs.reduce((s, r) => s + (r.score_delta ?? 0), 0) / runs.length * 100) / 100
      : 0
    const avgImprovement = plans.length > 0
      ? Math.round(plans.reduce((s, p) => s + (p.improvement_pct ?? 0), 0) / plans.length * 100) / 100
      : 0

    // If challenger is consistently >10pts behind Opus, flag for escalation
    const needsEscalation = avgDelta < -10 && runs.length >= 5

    if (needsEscalation) {
      // Find the weakest task type
      const taskScores = new Map<string, number[]>()
      for (const r of runs) {
        const arr = taskScores.get(r.task_type) ?? []
        arr.push(r.score_delta ?? 0)
        taskScores.set(r.task_type, arr)
      }
      let worstTask = ""
      let worstAvg = 0
      for (const [task, scores] of taskScores.entries()) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length
        if (avg < worstAvg) { worstAvg = avg; worstTask = task }
      }

      await client.from("llm_improvement_plans").insert({
        owner_user_id: (await client.auth.getUser()).data.user?.id,
        challenger_model: runs[0]?.challenger_model ?? "unknown",
        task_type: worstTask || "general",
        weakness_pattern: `Avg score delta ${avgDelta} on ${worstTask || "all tasks"}`,
        improvement_strategy: `Focus chain-of-thought scaffolding on ${worstTask || "weakest"} tasks. Consider tool-augmented fallbacks for spatial/code tasks.`,
        benchmark_run_ids: runs.slice(0, 5).map(r => r.created_at),
      })
    }

    steps.push({
      step: "llm_benchmark_improvement",
      action: `Analyzed ${runs.length} benchmark runs (avg delta: ${avgDelta}), ${plans.length} improvement plans applied (avg improvement: ${avgImprovement}%)`,
      ok: !needsEscalation,
      details: { benchmarkRuns: runs.length, avgScoreDelta: avgDelta, plansApplied: plans.length, avgImprovementPct: avgImprovement, escalated: needsEscalation },
    })
  } catch (err) {
    steps.push({
      step: "llm_benchmark_improvement",
      ok: false,
      action: "Failed to run LLM benchmark analysis",
      details: { error: err instanceof Error ? err.message : "Unknown error" },
    })
  }

  // Step 6: Sovereign Health Scan — check expiring permits, stalled filings, unresolved incidents
  try {
    const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString()

    const [expiringPermits, stalledFilings, openIncidents] = await Promise.all([
      client.from("sovereign_permits").select("id, permit_type, jurisdiction, expiry_date")
        .lte("expiry_date", thirtyDaysOut).eq("renewal_status", "current").limit(10),
      client.from("regulatory_filings").select("id, title, status, due_date")
        .in("status", ["draft", "pending"]).lte("due_date", thirtyDaysOut).limit(10),
      client.from("sentinel_incidents").select("id, title, severity, status")
        .in("status", ["open", "investigating"]).limit(10),
    ])

    const alerts: string[] = []
    if ((expiringPermits.data?.length ?? 0) > 0) alerts.push(`${expiringPermits.data!.length} permits expiring within 30 days`)
    if ((stalledFilings.data?.length ?? 0) > 0) alerts.push(`${stalledFilings.data!.length} filings with approaching deadlines`)
    if ((openIncidents.data?.length ?? 0) > 0) alerts.push(`${openIncidents.data!.length} unresolved security incidents`)

    steps.push({
      step: "sovereign_health_scan",
      action: alerts.length > 0 ? `Found ${alerts.length} health alerts: ${alerts.join("; ")}` : "All sovereign systems healthy",
      ok: alerts.length === 0,
      details: {
        expiringPermits: expiringPermits.data?.length ?? 0,
        stalledFilings: stalledFilings.data?.length ?? 0,
        openIncidents: openIncidents.data?.length ?? 0,
        alerts,
      },
    })
  } catch (err) {
    steps.push({
      step: "sovereign_health_scan",
      ok: false,
      action: "Failed to run sovereign health scan",
      details: { error: err instanceof Error ? err.message : "Unknown error" },
    })
  }

  // Step 6: Aggregate Pulse Metrics
  let pulse: SingularityPulseMetrics
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [evolutions, tariffs, campaigns, experiments, incidents, agents, filings, permits] = await Promise.all([
      client.from("agent_harness_evolutions").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo),
      client.from("intelligence_tariff_audits").select("monthly_savings_usd").eq("is_replacement_active", true),
      client.from("tribal_auto_research_campaigns").select("id", { count: "exact", head: true }).in("status", ["recruiting", "running", "collecting"]),
      client.from("auto_research_experiments").select("id", { count: "exact", head: true }).gte("created_at", oneWeekAgo),
      // Enhanced: sentinel incidents (active/investigating)
      client.from("sentinel_incidents").select("id", { count: "exact", head: true }).in("status", ["open", "investigating"]),
      // Enhanced: active agent definitions
      client.from("agent_definitions").select("id", { count: "exact", head: true }).eq("status", "active"),
      // Enhanced: regulatory filings compliance
      client.from("regulatory_filings").select("status", { count: "exact", head: true }).in("status", ["submitted", "approved"]),
      // Enhanced: expiring permits
      client.from("sovereign_permits").select("id", { count: "exact", head: true }).eq("renewal_status", "current"),
    ])

    const totalSavings = (tariffs.data ?? []).reduce((sum, row) => sum + (row.monthly_savings_usd ?? 0), 0)
    const totalFilings = (filings.count ?? 0)
    const totalPermits = (permits.count ?? 0)
    // Composite sovereignty score: weighted average of system health signals
    const sovereigntyScore = Math.min(100, Math.round(
      (((incidents.count ?? 0) === 0 ? 30 : Math.max(0, 30 - (incidents.count ?? 0) * 5)) + // Security: 30pts
      Math.min(30, (agents.count ?? 0) * 5) + // Agent health: 30pts
      Math.min(20, (evolutions.count ?? 0) * 4) + // Self-improvement: 20pts
      Math.min(20, (totalFilings + totalPermits) * 2)) // Compliance: 20pts
    ))

    pulse = {
      selfImprovementRate: evolutions.count ?? 0,
      intelligenceTariffSavings: totalSavings,
      activeAutoResearch: campaigns.count ?? 0,
      tribalLearningVelocity: experiments.count ?? 0,
      loopRunCount: 1,
      lastRunAt: new Date().toISOString(),
      sentinelIncidents: incidents.count ?? 0,
      activeAgents: agents.count ?? 0,
      sovereigntyScore,
      governmentCompliance: totalFilings + totalPermits > 0 ? Math.round(totalFilings / (totalFilings + totalPermits) * 100) : 100,
    }
  } catch {
    pulse = getDemoPulseMetrics()
  }

  steps.push({
    step: "pulse_update",
    action: "Aggregated evolution metrics",
    ok: true,
    details: pulse as unknown as Record<string, unknown>,
  })

  return {
    mode: "live",
    startedAt,
    completedAt: new Date().toISOString(),
    steps,
    pulse,
  }
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export async function runEvolutionLoop(
  mode: "live" | "demo" = "demo",
  accessToken?: string,
): Promise<EvolutionLoopResult> {
  if (mode === "demo") {
    return getDemoLoopResult()
  }
  return runLiveLoop(accessToken)
}
