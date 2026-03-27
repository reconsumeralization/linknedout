import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("EVOLUTION_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "EVOLUTION_RATE_LIMIT_MAX",
  "EVOLUTION_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const FineTuneStatusEnum = z.enum([
  "pending",
  "generating_data",
  "training",
  "evaluating",
  "deployed",
  "failed",
])

const EvolutionTypeEnum = z.enum([
  "performance_optimization",
  "error_fix",
  "capability_expansion",
  "cost_reduction",
])

const EvolutionStatusEnum = z.enum([
  "diagnosed",
  "experimenting",
  "validated",
  "merged",
  "rejected",
])

const CampaignStatusEnum = z.enum([
  "recruiting",
  "running",
  "collecting",
  "analyzing",
  "completed",
  "cancelled",
])

const ExperimentStatusEnum = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
])

const CreateTariffAuditSchema = z.object({
  action: z.literal("create_tariff_audit"),
  taskDomain: z.string().min(1).max(500),
  frontierModel: z.string().min(1).max(200),
  frontierCostPerTaskUsd: z.number().min(0),
  frontierAccuracyPct: z.number().min(0).max(100),
  localModel: z.string().max(200).optional(),
  parityThresholdPct: z.number().min(0).max(100).optional(),
})

const UpdateTariffAuditSchema = z.object({
  action: z.literal("update_tariff_audit"),
  auditId: z.string().min(1).max(120),
  fineTuneStatus: FineTuneStatusEnum.optional(),
  localAccuracyPct: z.number().min(0).max(100).optional(),
  monthlySavingsUsd: z.number().min(0).optional(),
  isReplacementActive: z.boolean().optional(),
  trainingDataSize: z.number().int().min(0).optional(),
})

const ListTariffAuditsSchema = z.object({
  action: z.literal("list_tariff_audits"),
  limit: z.number().int().min(1).max(100).optional(),
})

const CreateHarnessEvolutionSchema = z.object({
  action: z.literal("create_harness_evolution"),
  agentDefinitionId: z.string().min(1).max(120),
  evolutionType: EvolutionTypeEnum,
  triggerSource: z.string().max(200).optional(),
  diagnosis: z.string().min(1).max(10000),
  proposedFix: z.string().min(1).max(10000),
})

const UpdateHarnessEvolutionSchema = z.object({
  action: z.literal("update_harness_evolution"),
  evolutionId: z.string().min(1).max(120),
  status: EvolutionStatusEnum.optional(),
  afterMetrics: z.record(z.unknown()).optional(),
  improvementPct: z.number().optional(),
  autoMerged: z.boolean().optional(),
  experimentBranch: z.string().max(500).optional(),
})

const ListHarnessEvolutionsSchema = z.object({
  action: z.literal("list_harness_evolutions"),
  agentDefinitionId: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const LaunchAutoResearchSchema = z.object({
  action: z.literal("launch_auto_research"),
  tribeId: z.string().min(1).max(200),
  researchGoal: z.string().min(1).max(5000),
  hypothesis: z.string().max(5000).optional(),
  experimentSpec: z.record(z.unknown()).optional(),
  maxParticipants: z.number().int().min(1).max(10000).optional(),
})

const JoinAutoResearchSchema = z.object({
  action: z.literal("join_auto_research"),
  campaignId: z.string().min(1).max(120),
  experimentConfig: z.record(z.unknown()).optional(),
})

const SubmitExperimentResultSchema = z.object({
  action: z.literal("submit_experiment_result"),
  experimentId: z.string().min(1).max(120),
  resultMetrics: z.record(z.unknown()),
  score: z.number(),
  gitCommitHash: z.string().max(200).optional(),
})

const ResolveCampaignSchema = z.object({
  action: z.literal("resolve_campaign"),
  campaignId: z.string().min(1).max(120),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateTariffAuditSchema,
  UpdateTariffAuditSchema,
  ListTariffAuditsSchema,
  CreateHarnessEvolutionSchema,
  UpdateHarnessEvolutionSchema,
  ListHarnessEvolutionsSchema,
  LaunchAutoResearchSchema,
  JoinAutoResearchSchema,
  SubmitExperimentResultSchema,
  ResolveCampaignSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `evolution:${clientAddress}`,
    max: RATE_LIMIT_CONFIG.max,
    windowMs: RATE_LIMIT_CONFIG.windowMs,
  })
}

function jsonResponse(
  payload: unknown,
  status: number,
  rateLimit: RateLimitResult,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...COMMON_HEADERS,
      ...createRateLimitHeaders(rateLimit),
    },
  })
}

function createSupabaseClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  )
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(req: Request): Promise<Response> {
  const rateLimit = await getRateLimit(req)
  if (!rateLimit.allowed) {
    return jsonResponse(
      {
        ok: false,
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      429,
      rateLimit,
    )
  }

  const parsedBody = await parseJsonBodyWithLimit(req, MAX_BODY_BYTES)
  if (!parsedBody.ok) {
    return jsonResponse({ ok: false, error: parsedBody.error }, parsedBody.status, rateLimit)
  }

  const parsed = PostRequestSchema.safeParse(parsedBody.value)
  if (!parsed.success) {
    return jsonResponse(
      {
        ok: false,
        error: "Invalid request payload.",
        details: parsed.error.flatten(),
      },
      400,
      rateLimit,
    )
  }

  const input: PostRequest = parsed.data
  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for this action." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const accessToken = authResult.auth.accessToken
  const userId = authResult.auth.userId
  const supabase = createSupabaseClient(accessToken)

  /* ---- create_tariff_audit ---- */
  if (input.action === "create_tariff_audit") {
    const { data, error } = await supabase
      .from("intelligence_tariff_audits")
      .insert({
        user_id: userId,
        task_domain: input.taskDomain,
        frontier_model: input.frontierModel,
        frontier_cost_per_task_usd: input.frontierCostPerTaskUsd,
        frontier_accuracy_pct: input.frontierAccuracyPct,
        local_model: input.localModel ?? null,
        parity_threshold_pct: input.parityThresholdPct ?? 95,
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audit: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_tariff_audit ---- */
  if (input.action === "update_tariff_audit") {
    const updates: Record<string, unknown> = {}
    if (input.fineTuneStatus !== undefined) updates.fine_tune_status = input.fineTuneStatus
    if (input.localAccuracyPct !== undefined) updates.local_accuracy_pct = input.localAccuracyPct
    if (input.monthlySavingsUsd !== undefined) updates.monthly_savings_usd = input.monthlySavingsUsd
    if (input.isReplacementActive !== undefined) updates.is_replacement_active = input.isReplacementActive
    if (input.trainingDataSize !== undefined) updates.training_data_size = input.trainingDataSize

    const { data, error } = await supabase
      .from("intelligence_tariff_audits")
      .update(updates)
      .eq("id", input.auditId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audit: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_tariff_audits ---- */
  if (input.action === "list_tariff_audits") {
    const limit = input.limit ?? 20

    const { data, error } = await supabase
      .from("intelligence_tariff_audits")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, audits: data },
      200,
      rateLimit,
    )
  }

  /* ---- create_harness_evolution ---- */
  if (input.action === "create_harness_evolution") {
    const { data, error } = await supabase
      .from("agent_harness_evolutions")
      .insert({
        agent_definition_id: input.agentDefinitionId,
        user_id: userId,
        evolution_type: input.evolutionType,
        trigger_source: input.triggerSource ?? null,
        diagnosis: input.diagnosis,
        proposed_fix: input.proposedFix,
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, evolution: data },
      200,
      rateLimit,
    )
  }

  /* ---- update_harness_evolution ---- */
  if (input.action === "update_harness_evolution") {
    const updates: Record<string, unknown> = {}
    if (input.status !== undefined) updates.status = input.status
    if (input.afterMetrics !== undefined) updates.after_metrics = input.afterMetrics
    if (input.improvementPct !== undefined) updates.improvement_pct = input.improvementPct
    if (input.autoMerged !== undefined) updates.auto_merged = input.autoMerged
    if (input.experimentBranch !== undefined) updates.experiment_branch = input.experimentBranch

    const { data, error } = await supabase
      .from("agent_harness_evolutions")
      .update(updates)
      .eq("id", input.evolutionId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, evolution: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_harness_evolutions ---- */
  if (input.action === "list_harness_evolutions") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("agent_harness_evolutions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.agentDefinitionId) {
      query = query.eq("agent_definition_id", input.agentDefinitionId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, evolutions: data },
      200,
      rateLimit,
    )
  }

  /* ---- launch_auto_research ---- */
  if (input.action === "launch_auto_research") {
    const { data, error } = await supabase
      .from("tribal_auto_research_campaigns")
      .insert({
        tribe_id: input.tribeId,
        initiator_user_id: userId,
        research_goal: input.researchGoal,
        hypothesis: input.hypothesis ?? null,
        experiment_spec: input.experimentSpec ?? {},
        max_participants: input.maxParticipants ?? 100,
      })
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, campaign: data },
      200,
      rateLimit,
    )
  }

  /* ---- join_auto_research ---- */
  if (input.action === "join_auto_research") {
    const { data: experiment, error: expError } = await supabase
      .from("auto_research_experiments")
      .insert({
        campaign_id: input.campaignId,
        participant_user_id: userId,
        experiment_config: input.experimentConfig ?? {},
      })
      .select()
      .single()

    if (expError) {
      return jsonResponse({ ok: false, error: expError.message }, 400, rateLimit)
    }

    // Increment participant_count on the campaign
    const { data: campaign } = await supabase
      .from("tribal_auto_research_campaigns")
      .select("participant_count")
      .eq("id", input.campaignId)
      .single()

    if (campaign) {
      await supabase
        .from("tribal_auto_research_campaigns")
        .update({ participant_count: (campaign.participant_count ?? 0) + 1 })
        .eq("id", input.campaignId)
    }

    return jsonResponse(
      { ok: true, action: input.action, experiment },
      200,
      rateLimit,
    )
  }

  /* ---- submit_experiment_result ---- */
  if (input.action === "submit_experiment_result") {
    const { data, error } = await supabase
      .from("auto_research_experiments")
      .update({
        result_metrics: input.resultMetrics,
        score: input.score,
        git_commit_hash: input.gitCommitHash ?? null,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.experimentId)
      .eq("participant_user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("[API]", error.message); return jsonResponse({ ok: false, error: "Operation failed" }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, experiment: data },
      200,
      rateLimit,
    )
  }

  /* ---- resolve_campaign ---- */
  // Last branch in the discriminated union
  // Find the highest-scoring completed experiment
  const { data: topExperiment, error: topError } = await supabase
    .from("auto_research_experiments")
    .select("*")
    .eq("campaign_id", input.campaignId)
    .eq("status", "completed")
    .order("score", { ascending: false })
    .limit(1)
    .single()

  if (topError) {
    return jsonResponse({ ok: false, error: topError.message }, 400, rateLimit)
  }

  // Mark the winning experiment
  await supabase
    .from("auto_research_experiments")
    .update({ is_winner: true })
    .eq("id", topExperiment.id)

  // Update campaign to completed with the winner
  const { data: campaign, error: campError } = await supabase
    .from("tribal_auto_research_campaigns")
    .update({
      status: "completed",
      winning_experiment_id: topExperiment.id,
      results_summary: topExperiment.result_metrics,
    })
    .eq("id", input.campaignId)
    .eq("initiator_user_id", userId)
    .select()
    .single()

  if (campError) {
    return jsonResponse({ ok: false, error: campError.message }, 400, rateLimit)
  }

  return jsonResponse(
    { ok: true, action: input.action, campaign, winningExperiment: topExperiment },
    200,
    rateLimit,
  )
}
