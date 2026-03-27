import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import {
  analyzeAgentPerformance,
  proposePromptOptimization,
  detectAnomalies,
  generateImprovementPlan,
} from "@/lib/agents/meta-agent-reasoning"
import { fetchAgentPlatformSnapshot } from "@/lib/agents/agent-platform-server"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("META_AGENT_MAX_BODY_BYTES", 64_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "META_AGENT_RATE_LIMIT_MAX",
  "META_AGENT_RATE_LIMIT_WINDOW_MS",
  { max: 60, windowMs: 60_000 },
)

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                       */
/* ------------------------------------------------------------------ */

const MutationTypeEnum = z.enum([
  "optimization",
  "refactor",
  "distillation",
  "security_hardening",
  "alignment_shift",
])

const MetricNameEnum = z.enum([
  "latency_ms",
  "token_count",
  "energy_kwh",
  "error_rate",
  "accuracy_pct",
])

const MutationSourceEnum = z.enum([
  "meta_agent",
  "tribal_sync",
  "manual",
  "auto_research",
])

const DimensionEnum = z.enum([
  "energy_priority",
  "security_priority",
  "speed_priority",
  "cost_priority",
  "creativity_priority",
  "ethics_weight",
  "risk_tolerance",
  "photonic_bias",
  "lunar_bias",
  "tribal_density",
])

const CalibratedFromEnum = z.enum([
  "veto",
  "approval",
  "explicit_direction",
  "behavioral_inference",
])

const InitializeAgentZeroSchema = z.object({
  action: z.literal("initialize_agent_zero"),
  evolutionDirection: z.string().max(2000).optional(),
})

const LogEvolutionSchema = z.object({
  action: z.literal("log_evolution"),
  agentId: z.string().max(120).optional(),
  toolName: z.string().min(1).max(500),
  mutationType: MutationTypeEnum,
  beforeState: z.record(z.unknown()),
  afterState: z.record(z.unknown()),
  improvementPct: z.number().optional(),
  autoApplied: z.boolean().optional(),
})

const ListEvolutionsSchema = z.object({
  action: z.literal("list_evolutions"),
  mutationType: MutationTypeEnum.optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const RecordMutationSchema = z.object({
  action: z.literal("record_mutation"),
  toolName: z.string().min(1).max(500),
  metricName: MetricNameEnum,
  beforeValue: z.number(),
  afterValue: z.number(),
  mutationSource: MutationSourceEnum.optional(),
})

const ListMutationsSchema = z.object({
  action: z.literal("list_mutations"),
  toolName: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const SubmitTribalDnaSchema = z.object({
  action: z.literal("submit_tribal_dna"),
  campaignId: z.string().max(120).optional(),
  commitHash: z.string().max(200).optional(),
  optimizationDomain: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  improvementPct: z.number().optional(),
})

const AdoptTribalDnaSchema = z.object({
  action: z.literal("adopt_tribal_dna"),
  dnaId: z.string().min(1).max(120),
})

const CalibrateAlignmentSchema = z.object({
  action: z.literal("calibrate_alignment"),
  dimension: DimensionEnum,
  weight: z.number().min(0).max(1),
  calibratedFrom: CalibratedFromEnum,
})

const GetAlignmentVectorSchema = z.object({
  action: z.literal("get_alignment_vector"),
})

const GetEvolutionSummarySchema = z.object({
  action: z.literal("get_evolution_summary"),
})

const AnalyzePerformanceSchema = z.object({
  action: z.literal("analyze_performance"),
  agentId: z.string().min(1).max(120),
})

const ProposeOptimizationSchema = z.object({
  action: z.literal("propose_optimization"),
  agentId: z.string().min(1).max(120),
})

const DetectAnomaliesSchema = z.object({
  action: z.literal("detect_anomalies"),
  agentId: z.string().min(1).max(120),
  threshold: z.number().min(0).max(100).optional(),
})

const GenerateImprovementPlanSchema = z.object({
  action: z.literal("generate_improvement_plan"),
  agentId: z.string().min(1).max(120),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  InitializeAgentZeroSchema,
  LogEvolutionSchema,
  ListEvolutionsSchema,
  RecordMutationSchema,
  ListMutationsSchema,
  SubmitTribalDnaSchema,
  AdoptTribalDnaSchema,
  CalibrateAlignmentSchema,
  GetAlignmentVectorSchema,
  GetEvolutionSummarySchema,
  AnalyzePerformanceSchema,
  ProposeOptimizationSchema,
  DetectAnomaliesSchema,
  GenerateImprovementPlanSchema,
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
    key: `meta-agent:${clientAddress}`,
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

  /* ---- initialize_agent_zero ---- */
  if (input.action === "initialize_agent_zero") {
    const { data, error } = await supabase
      .from("evolution_logs")
      .insert({
        user_id: userId,
        tool_name: "agent_zero_init",
        mutation_type: "optimization",
        before_state: {},
        after_state: input.evolutionDirection
          ? { direction: input.evolutionDirection }
          : {},
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, evolution: data },
      200,
      rateLimit,
    )
  }

  /* ---- log_evolution ---- */
  if (input.action === "log_evolution") {
    const { data, error } = await supabase
      .from("evolution_logs")
      .insert({
        user_id: userId,
        agent_id: input.agentId ?? null,
        tool_name: input.toolName,
        mutation_type: input.mutationType,
        before_state: input.beforeState,
        after_state: input.afterState,
        improvement_pct: input.improvementPct ?? null,
        auto_applied: input.autoApplied ?? false,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, evolution: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_evolutions ---- */
  if (input.action === "list_evolutions") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("evolution_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.mutationType) {
      query = query.eq("mutation_type", input.mutationType)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, evolutions: data },
      200,
      rateLimit,
    )
  }

  /* ---- record_mutation ---- */
  if (input.action === "record_mutation") {
    const improvementPct =
      input.beforeValue !== 0
        ? ((input.beforeValue - input.afterValue) / Math.abs(input.beforeValue)) * 100
        : 0

    const { data, error } = await supabase
      .from("performance_mutations")
      .insert({
        user_id: userId,
        tool_name: input.toolName,
        metric_name: input.metricName,
        before_value: input.beforeValue,
        after_value: input.afterValue,
        improvement_pct: improvementPct,
        mutation_source: input.mutationSource ?? "meta_agent",
        applied_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, mutation: data },
      200,
      rateLimit,
    )
  }

  /* ---- list_mutations ---- */
  if (input.action === "list_mutations") {
    const limit = input.limit ?? 20

    let query = supabase
      .from("performance_mutations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (input.toolName) {
      query = query.eq("tool_name", input.toolName)
    }

    const { data, error } = await query

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, mutations: data },
      200,
      rateLimit,
    )
  }

  /* ---- submit_tribal_dna ---- */
  if (input.action === "submit_tribal_dna") {
    const { data, error } = await supabase
      .from("tribal_dna_registry")
      .insert({
        contributor_user_id: userId,
        campaign_id: input.campaignId ?? null,
        commit_hash: input.commitHash ?? null,
        optimization_domain: input.optimizationDomain,
        description: input.description,
        improvement_pct: input.improvementPct ?? null,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, dna: data },
      200,
      rateLimit,
    )
  }

  /* ---- adopt_tribal_dna ---- */
  if (input.action === "adopt_tribal_dna") {
    // Fetch current adoption_count
    const { data: existing, error: fetchError } = await supabase
      .from("tribal_dna_registry")
      .select("adoption_count")
      .eq("id", input.dnaId)
      .single()

    if (fetchError) {
      return jsonResponse({ ok: false, error: fetchError.message }, 400, rateLimit)
    }

    const { data, error } = await supabase
      .from("tribal_dna_registry")
      .update({
        status: "adopted",
        adoption_count: (existing.adoption_count ?? 0) + 1,
      })
      .eq("id", input.dnaId)
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, dna: data },
      200,
      rateLimit,
    )
  }

  /* ---- calibrate_alignment ---- */
  if (input.action === "calibrate_alignment") {
    // Try update first (upsert pattern)
    const { data: existing } = await supabase
      .from("chairman_alignment_vectors")
      .select("id, calibration_count")
      .eq("user_id", userId)
      .eq("dimension", input.dimension)
      .single()

    if (existing) {
      const { data, error } = await supabase
        .from("chairman_alignment_vectors")
        .update({
          weight: input.weight,
          last_calibrated_from: input.calibratedFrom,
          calibration_count: (existing.calibration_count ?? 0) + 1,
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) {
        return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
      }

      return jsonResponse(
        { ok: true, action: input.action, vector: data },
        200,
        rateLimit,
      )
    }

    const { data, error } = await supabase
      .from("chairman_alignment_vectors")
      .insert({
        user_id: userId,
        dimension: input.dimension,
        weight: input.weight,
        last_calibrated_from: input.calibratedFrom,
        calibration_count: 1,
      })
      .select()
      .single()

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    return jsonResponse(
      { ok: true, action: input.action, vector: data },
      200,
      rateLimit,
    )
  }

  /* ---- get_alignment_vector ---- */
  if (input.action === "get_alignment_vector") {
    const { data, error } = await supabase
      .from("chairman_alignment_vectors")
      .select("dimension, weight")
      .eq("user_id", userId)

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, rateLimit)
    }

    const vectorMap: Record<string, number> = {}
    for (const row of data ?? []) {
      vectorMap[row.dimension] = row.weight
    }

    return jsonResponse(
      { ok: true, action: input.action, vector: vectorMap },
      200,
      rateLimit,
    )
  }

  /* ---- analyze_performance ---- */
  if (input.action === "analyze_performance") {
    const snapshot = await fetchAgentPlatformSnapshot(accessToken)
    const agent = snapshot.agents.find(a => a.id === input.agentId)
    if (!agent) {
      return jsonResponse({ ok: false, error: "Agent not found." }, 404, rateLimit)
    }
    const runs = snapshot.runs.filter(r => r.agentId === input.agentId)
    const evals = snapshot.evaluations.filter(e => e.agentId === input.agentId)
    const analysis = await analyzeAgentPerformance(input.agentId, runs, evals)
    return jsonResponse({ ok: true, action: input.action, analysis }, 200, rateLimit)
  }

  /* ---- propose_optimization ---- */
  if (input.action === "propose_optimization") {
    const snapshot = await fetchAgentPlatformSnapshot(accessToken)
    const agent = snapshot.agents.find(a => a.id === input.agentId)
    if (!agent) {
      return jsonResponse({ ok: false, error: "Agent not found." }, 404, rateLimit)
    }
    const runs = snapshot.runs.filter(r => r.agentId === input.agentId)
    const evals = snapshot.evaluations.filter(e => e.agentId === input.agentId)
    const optimization = await proposePromptOptimization(agent, runs, evals)
    return jsonResponse({ ok: true, action: input.action, optimization }, 200, rateLimit)
  }

  /* ---- detect_anomalies ---- */
  if (input.action === "detect_anomalies") {
    const snapshot = await fetchAgentPlatformSnapshot(accessToken)
    const agent = snapshot.agents.find(a => a.id === input.agentId)
    if (!agent) {
      return jsonResponse({ ok: false, error: "Agent not found." }, 404, rateLimit)
    }
    const runs = snapshot.runs.filter(r => r.agentId === input.agentId)
    const evals = snapshot.evaluations.filter(e => e.agentId === input.agentId)
    const anomalies = detectAnomalies(runs, input.threshold)
    return jsonResponse({ ok: true, action: input.action, anomalies }, 200, rateLimit)
  }

  /* ---- generate_improvement_plan ---- */
  if (input.action === "generate_improvement_plan") {
    const snapshot = await fetchAgentPlatformSnapshot(accessToken)
    const agent = snapshot.agents.find(a => a.id === input.agentId)
    if (!agent) {
      return jsonResponse({ ok: false, error: "Agent not found." }, 404, rateLimit)
    }
    const runs = snapshot.runs.filter(r => r.agentId === input.agentId)
    const evals = snapshot.evaluations.filter(e => e.agentId === input.agentId)
    const analysis = await analyzeAgentPerformance(input.agentId, runs, evals)
    const plan = await generateImprovementPlan(agent, analysis)
    return jsonResponse({ ok: true, action: input.action, plan }, 200, rateLimit)
  }

  /* ---- get_evolution_summary ---- */
  // Last branch in the discriminated union
  const { data: evolutions, error: evoError } = await supabase
    .from("evolution_logs")
    .select("*")
    .eq("user_id", userId)

  if (evoError) {
    return jsonResponse({ ok: false, error: evoError.message }, 400, rateLimit)
  }

  const totalEvolutions = evolutions?.length ?? 0
  const improvements = (evolutions ?? [])
    .map((e) => e.improvement_pct)
    .filter((v): v is number => v != null)
  const avgImprovement =
    improvements.length > 0
      ? improvements.reduce((a, b) => a + b, 0) / improvements.length
      : 0
  const totalEnergySaved = (evolutions ?? [])
    .map((e) => e.energy_delta_kwh)
    .filter((v): v is number => v != null)
    .reduce((a, b) => a + b, 0)
  const totalTokensSaved = (evolutions ?? [])
    .map((e) => e.token_delta)
    .filter((v): v is number => v != null)
    .reduce((a, b) => a + b, 0)

  // Top mutated tools
  const toolCounts: Record<string, number> = {}
  for (const e of evolutions ?? []) {
    if (e.tool_name) {
      toolCounts[e.tool_name] = (toolCounts[e.tool_name] ?? 0) + 1
    }
  }
  const topMutatedTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tool, count]) => ({ tool, count }))

  return jsonResponse(
    {
      ok: true,
      action: input.action,
      summary: {
        totalEvolutions,
        avgImprovementPct: Math.round(avgImprovement * 100) / 100,
        totalEnergySavedKwh: totalEnergySaved,
        totalTokensSaved,
        topMutatedTools,
      },
    },
    200,
    rateLimit,
  )
}
