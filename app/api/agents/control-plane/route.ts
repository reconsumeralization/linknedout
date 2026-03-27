import {
  appendAgentSkillEvent,
  createApprovalRequest,
  createShadowTool,
  createAgentFromPrompt,
  createAgentVersion,
  fetchAgentPlatformSnapshot,
  rotateConnectorSecret,
  runAgentWorkflow,
  runConnectorHealthChecks,
  runAgentEvaluation,
  resolveApprovalRequest,
  rollbackAgentToVersion,
  setAgentStatus,
  upsertAgentSchedule,
  updateConnectorPermissions,
} from "@/lib/agents/agent-platform-server"
import { executeAgent, type AgentExecutionResult } from "@/lib/agents/agent-runtime"
import { getMessagesForAgent, publishAgentMessage } from "@/lib/agents/agent-messaging"
import { analyzeAgentPerformance, proposePromptOptimization, detectAnomalies } from "@/lib/agents/meta-agent-reasoning"
import { evaluateOptimizedGuard, getGuardCacheStats } from "@/lib/security/llm-guard-optimized"
import { requireSupabaseAuth } from "@/lib/auth/require-auth"
import { getMaxBodyBytesFromEnv, parseJsonBodyWithLimit } from "@/lib/shared/request-body"
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientAddressFromRequest,
  parseRateLimitConfigFromEnv,
  type RateLimitResult,
} from "@/lib/shared/request-rate-limit"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = getMaxBodyBytesFromEnv("AGENT_CONTROL_PLANE_MAX_BODY_BYTES", 96_000)
const RATE_LIMIT_CONFIG = parseRateLimitConfigFromEnv(
  "AGENT_CONTROL_PLANE_RATE_LIMIT_MAX",
  "AGENT_CONTROL_PLANE_RATE_LIMIT_WINDOW_MS",
  { max: 90, windowMs: 60_000 },
)

const PermissionModeSchema = z.enum([
  "read_only",
  "write_with_approval",
  "scheduled_only",
  "disabled",
])

const CreateAgentSchema = z.object({
  action: z.literal("create_agent_from_prompt"),
  prompt: z.string().min(8).max(4000),
  preferredModelId: z.string().min(2).max(120).optional(),
  tokenBudgetUsdMonthly: z.number().min(50).max(20_000).optional(),
})

const CreateVersionSchema = z.object({
  action: z.literal("create_version"),
  agentId: z.string().min(2).max(120),
  changeNote: z.string().max(240).optional(),
})

const RollbackSchema = z.object({
  action: z.literal("rollback_agent"),
  agentId: z.string().min(2).max(120),
  versionId: z.string().min(2).max(120),
})

const UpdateConnectorSchema = z.object({
  action: z.literal("update_connector_permissions"),
  connectorId: z.string().min(2).max(120),
  permissionMode: PermissionModeSchema,
  scopes: z.array(z.string().min(1).max(120)).max(30),
})

const RunConnectorHealthChecksSchema = z.object({
  action: z.literal("run_connector_health_checks"),
  provider: z.string().min(2).max(120).optional(),
})

const RotateConnectorSecretSchema = z.object({
  action: z.literal("rotate_connector_secret"),
  connectorId: z.string().min(2).max(120),
})

const SetAgentStatusSchema = z.object({
  action: z.literal("set_agent_status"),
  agentId: z.string().min(2).max(120),
  status: z.enum(["draft", "active", "paused", "archived"]),
})

const RunAgentWorkflowSchema = z.object({
  action: z.literal("run_agent_workflow"),
  agentId: z.string().min(2).max(120),
  templateId: z.string().min(1).max(120).optional(),
  summary: z.string().max(2000).optional(),
})

const AppendSkillEventSchema = z.object({
  action: z.literal("append_skill_event"),
  agentId: z.string().min(2).max(120),
  source: z.string().min(2).max(180),
  skill: z.string().min(2).max(180),
  note: z.string().max(1000).optional(),
  testStatus: z.enum(["passed", "failed", "pending"]).optional(),
  accepted: z.boolean().optional(),
})

const CreateShadowToolSchema = z.object({
  action: z.literal("create_shadow_tool"),
  name: z.string().min(2).max(180),
  description: z.string().max(3000).default(""),
  mappedAgentId: z.string().min(2).max(120).optional(),
  coveragePct: z.number().min(0).max(100),
  status: z.enum(["draft", "active", "paused", "retired"]).optional(),
})

const UpsertScheduleSchema = z.object({
  action: z.literal("upsert_schedule"),
  agentId: z.string().min(2).max(120),
  kind: z.enum(["workflow_run", "self_improvement", "evaluation"]),
  frequency: z.enum(["hourly", "daily", "weekly", "custom"]),
  intervalMinutes: z.number().min(15).max(43_200).optional(),
  enabled: z.boolean(),
  nextRunAt: z.string().datetime().optional(),
  benchmarkName: z.string().min(2).max(180).optional(),
  thresholdPct: z.number().min(0).max(100).optional(),
})

const RunEvaluationSchema = z.object({
  action: z.literal("run_evaluation"),
  agentId: z.string().min(2).max(120),
  benchmarkName: z.string().min(2).max(180),
  thresholdPct: z.number().min(0).max(100).optional(),
})

const CreateApprovalRequestSchema = z.object({
  action: z.literal("create_approval_request"),
  agentId: z.string().min(2).max(120),
  connectorId: z.string().min(2).max(120).optional(),
  actionType: z.string().min(2).max(180),
  payloadSummary: z.string().min(2).max(2000),
  riskLevel: z.enum(["low", "medium", "high"]),
})

const ResolveApprovalRequestSchema = z.object({
  action: z.literal("resolve_approval_request"),
  approvalId: z.string().min(2).max(120),
  decision: z.enum(["approved", "rejected"]),
  resolverNote: z.string().max(1000).optional(),
})

const ExecuteAgentSchema = z.object({
  action: z.literal("execute_agent"),
  agentId: z.string().min(2).max(120),
  input: z.string().max(8000).optional(),
})

const GetAgentMessagesSchema = z.object({
  action: z.literal("get_agent_messages"),
  agentId: z.string().min(2).max(120),
  topic: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const AnalyzeAgentSchema = z.object({
  action: z.literal("analyze_agent"),
  agentId: z.string().min(2).max(120),
})

const GetGuardStatsSchema = z.object({
  action: z.literal("get_guard_stats"),
})

const PostRequestSchema = z.discriminatedUnion("action", [
  CreateAgentSchema,
  CreateVersionSchema,
  RollbackSchema,
  UpdateConnectorSchema,
  RunConnectorHealthChecksSchema,
  RotateConnectorSecretSchema,
  SetAgentStatusSchema,
  RunAgentWorkflowSchema,
  AppendSkillEventSchema,
  CreateShadowToolSchema,
  UpsertScheduleSchema,
  RunEvaluationSchema,
  CreateApprovalRequestSchema,
  ResolveApprovalRequestSchema,
  ExecuteAgentSchema,
  GetAgentMessagesSchema,
  AnalyzeAgentSchema,
  GetGuardStatsSchema,
])

type PostRequest = z.infer<typeof PostRequestSchema>

const COMMON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
}

async function getRateLimit(req: Request): Promise<RateLimitResult> {
  const clientAddress = getClientAddressFromRequest(req)
  return checkRateLimit({
    key: `agent-control-plane:${clientAddress}`,
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

export async function GET(req: Request): Promise<Response> {
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

  const authResult = await requireSupabaseAuth(req, {
    errorBody: { ok: false, error: "A valid Supabase bearer token is required for this action." },
  })
  if (!authResult.auth) {
    return new Response(authResult.response.body, {
      status: authResult.response.status,
      headers: { ...Object.fromEntries(authResult.response.headers), ...createRateLimitHeaders(rateLimit) },
    })
  }
  const snapshot = await fetchAgentPlatformSnapshot(authResult.auth.accessToken)

  return jsonResponse(
    {
      ok: true,
      data: snapshot,
      authenticated: true,
      tables: {
        agents: process.env.SUPABASE_AGENT_DEFINITIONS_TABLE || "agent_definitions",
        versions: process.env.SUPABASE_AGENT_VERSIONS_TABLE || "agent_versions",
        connectors: process.env.SUPABASE_AGENT_CONNECTORS_TABLE || "agent_tool_connectors",
        runs: process.env.SUPABASE_AGENT_RUNS_TABLE || "agent_runs",
        skillEvents: process.env.SUPABASE_AGENT_SKILL_EVENTS_TABLE || "agent_skill_events",
        shadowTools: process.env.SUPABASE_AGENT_SHADOW_TOOLS_TABLE || "agent_shadow_tools",
        schedules: process.env.SUPABASE_AGENT_SCHEDULES_TABLE || "agent_schedules",
        evaluations: process.env.SUPABASE_AGENT_EVALUATIONS_TABLE || "agent_evaluations",
        approvals: process.env.SUPABASE_AGENT_APPROVALS_TABLE || "agent_approval_requests",
        emailIntegrations: process.env.SUPABASE_EMAIL_INTEGRATIONS_TABLE || "email_integrations",
        emailSecrets: process.env.SUPABASE_EMAIL_SECRETS_TABLE || "email_integration_secrets",
      },
    },
    200,
    rateLimit,
  )
}

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

  if (input.action === "create_agent_from_prompt") {
    const result = await createAgentFromPrompt(accessToken, {
      prompt: input.prompt,
      preferredModelId: input.preferredModelId,
      tokenBudgetUsdMonthly: input.tokenBudgetUsdMonthly,
    })

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        agent: result.agent,
        version: result.version,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "create_version") {
    const result = await createAgentVersion(accessToken, {
      agentId: input.agentId,
      changeNote: input.changeNote,
    })

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        version: result.version,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "rollback_agent") {
    const result = await rollbackAgentToVersion(accessToken, {
      agentId: input.agentId,
      versionId: input.versionId,
    })

    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        agent: result.agent,
        version: result.version,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "set_agent_status") {
    const result = await setAgentStatus(accessToken, {
      agentId: input.agentId,
      status: input.status,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        agent: result.agent,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "run_connector_health_checks") {
    const result = await runConnectorHealthChecks(accessToken, {
      provider: input.provider,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        checked: result.checked,
        updated: result.updated,
        degraded: result.degraded,
        notConnected: result.notConnected,
        connectors: result.connectors,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "rotate_connector_secret") {
    const result = await rotateConnectorSecret(accessToken, {
      connectorId: input.connectorId,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        connector: result.connector,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "run_agent_workflow") {
    const result = await runAgentWorkflow(accessToken, {
      agentId: input.agentId,
      templateId: input.templateId,
      summary: input.summary,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        run: result.run,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "append_skill_event") {
    const result = await appendAgentSkillEvent(accessToken, {
      agentId: input.agentId,
      source: input.source,
      skill: input.skill,
      note: input.note,
      testStatus: input.testStatus,
      accepted: input.accepted,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        event: result.event,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "create_shadow_tool") {
    const result = await createShadowTool(accessToken, {
      name: input.name,
      description: input.description,
      mappedAgentId: input.mappedAgentId,
      coveragePct: input.coveragePct,
      status: input.status,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        shadowTool: result.shadowTool,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "upsert_schedule") {
    const result = await upsertAgentSchedule(accessToken, {
      agentId: input.agentId,
      kind: input.kind,
      frequency: input.frequency,
      intervalMinutes: input.intervalMinutes,
      enabled: input.enabled,
      nextRunAt: input.nextRunAt,
      benchmarkName: input.benchmarkName,
      thresholdPct: input.thresholdPct,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        schedule: result.schedule,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "run_evaluation") {
    const result = await runAgentEvaluation(accessToken, {
      agentId: input.agentId,
      benchmarkName: input.benchmarkName,
      thresholdPct: input.thresholdPct,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        evaluation: result.evaluation,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "create_approval_request") {
    const result = await createApprovalRequest(accessToken, {
      agentId: input.agentId,
      connectorId: input.connectorId,
      actionType: input.actionType,
      payloadSummary: input.payloadSummary,
      riskLevel: input.riskLevel,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        approval: result.approval,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "resolve_approval_request") {
    const result = await resolveApprovalRequest(accessToken, {
      approvalId: input.approvalId,
      decision: input.decision,
      resolverNote: input.resolverNote,
    })
    if (!result.ok) {
      return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
    }
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        approval: result.approval,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "execute_agent") {
    const snapshot = await fetchAgentPlatformSnapshot(accessToken)
    const agent = snapshot.agents.find((a) => a.id === input.agentId)
    if (!agent) {
      return jsonResponse({ ok: false, error: "Agent not found." }, 404, rateLimit)
    }
    const connectors = snapshot.connectors.filter((c) =>
      agent.connectors?.includes(c.id)
    )
    const result = await executeAgent(agent, connectors, { task: input.input })

    if (result.success) {
      await publishAgentMessage({
        topic: `agent.${agent.id}.run.completed`,
        payload: { runId: result.runId, summary: result.summary },
        fromAgentId: agent.id ?? "unknown",
        toAgentId: "runtime-orchestrator",
        priority: "normal",
      })
    } else {
      await publishAgentMessage({
        topic: `agent.${agent.id}.run.failed`,
        payload: { runId: result.runId, error: result.error },
        fromAgentId: agent.id ?? "unknown",
        toAgentId: "runtime-orchestrator",
        priority: "high",
      })
    }

    return jsonResponse(
      {
        ok: result.success,
        action: input.action,
        result,
      },
      result.success ? 200 : 400,
      rateLimit,
    )
  }

  if (input.action === "get_agent_messages") {
    const result = await getMessagesForAgent(input.agentId, {
      topic: input.topic,
      limit: input.limit,
    })
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        messages: result,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "analyze_agent") {
    const snapshot = await fetchAgentPlatformSnapshot(accessToken)
    const agent = snapshot.agents.find((a) => a.id === input.agentId)
    if (!agent) {
      return jsonResponse({ ok: false, error: "Agent not found." }, 404, rateLimit)
    }

    const agentRuns = snapshot.runs.filter((r) => r.agentId === input.agentId)
    const agentEvaluations = snapshot.evaluations.filter((e) => e.agentId === input.agentId)

    const performance = await analyzeAgentPerformance(input.agentId, agentRuns, agentEvaluations)
    const anomalies = detectAnomalies(agentRuns)
    const optimization = await proposePromptOptimization(agent, agentRuns, agentEvaluations)

    return jsonResponse(
      {
        ok: true,
        action: input.action,
        performance,
        anomalies,
        optimization,
      },
      200,
      rateLimit,
    )
  }

  if (input.action === "get_guard_stats") {
    const stats = await getGuardCacheStats()
    return jsonResponse(
      {
        ok: true,
        action: input.action,
        stats,
      },
      200,
      rateLimit,
    )
  }

  const result = await updateConnectorPermissions(accessToken, {
    connectorId: input.connectorId,
    permissionMode: input.permissionMode,
    scopes: input.scopes,
  })

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 400, rateLimit)
  }

  return jsonResponse(
    {
      ok: true,
      action: input.action,
      connector: result.connector,
    },
    200,
    rateLimit,
  )
}
