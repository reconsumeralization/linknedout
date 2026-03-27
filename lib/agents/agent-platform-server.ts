import "server-only"

import {
  buildDerivedAgentEvaluation,
  buildDerivedAgentRunMetrics,
} from "@/lib/agents/agent-platform-derived-metrics"
import { createClient } from "@supabase/supabase-js"
import {
  type AgentApprovalRequestRecord,
  type AgentApprovalStatus,
  type AgentConnectorRecord,
  type AgentDefinitionRecord,
  type AgentEvaluationRecord,
  type AgentEvaluationStatus,
  type AgentScheduleFrequency,
  type AgentScheduleKind,
  type AgentScheduleRecord,
  type AgentSkillEventRecord,
  type AgentSkillTestStatus,
  type AgentShadowToolRecord,
  type AgentPermissionMode,
  type AgentPlatformSnapshot,
  type AgentRunRecord,
  type AgentVersionRecord,
  type AgentDraftInput,
  buildAgentDraftFromPromptLegacy,
  buildAgentDraftFromPromptSmart,
  DEFAULT_AGENT_MODELS,
  DEFAULT_AGENT_TEMPLATES,
} from "@/lib/agents/agent-platform-types"
import { decryptJsonValue, encryptJsonValue, isEmailCredentialEncryptionEnabled } from "@/lib/security/secure-crypto"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"

type Row = Record<string, unknown>
type QueryClient = {
  from: (table: string) => {
    select: (...args: unknown[]) => any
    insert: (...args: unknown[]) => any
    update: (...args: unknown[]) => any
  }
}

const TABLES = {
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
}

const CONNECTOR_HEALTH_DEGRADE_MINUTES = Math.max(
  5,
  Math.min(60 * 24 * 30, asNumber(process.env.AGENT_CONNECTOR_HEALTH_DEGRADE_MINUTES, 180)),
)
const CONNECTOR_HEALTH_DISCONNECT_MINUTES = Math.max(
  CONNECTOR_HEALTH_DEGRADE_MINUTES,
  Math.min(
    60 * 24 * 90,
    asNumber(process.env.AGENT_CONNECTOR_HEALTH_DISCONNECT_MINUTES, 60 * 24 * 7),
  ),
)

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    return value !== 0
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true" || normalized === "1") return true
    if (normalized === "false" || normalized === "0") return false
  }
  return fallback
}

function parseJsonIfPossible(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    const parsed = parseJsonIfPossible(value)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => asString(item))
        .filter(Boolean)
    }

    return value
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function asObject(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row
  }

  if (typeof value === "string") {
    const parsed = parseJsonIfPossible(value)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Row
    }
  }

  return {}
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeAgentStatus(value: string): AgentDefinitionRecord["status"] {
  if (value === "active" || value === "paused" || value === "archived" || value === "draft") {
    return value
  }
  return "draft"
}

function normalizeConnectorStatus(value: string): AgentConnectorRecord["status"] {
  if (value === "connected" || value === "degraded" || value === "not_connected") {
    return value
  }
  return "not_connected"
}

function normalizePermissionMode(value: string): AgentPermissionMode {
  if (
    value === "read_only" ||
    value === "write_with_approval" ||
    value === "scheduled_only" ||
    value === "disabled"
  ) {
    return value
  }
  return "read_only"
}

function normalizeRunStatus(value: string): AgentRunRecord["status"] {
  if (value === "running" || value === "completed" || value === "failed" || value === "paused") {
    return value
  }
  return "completed"
}

function normalizeSkillTestStatus(value: string): AgentSkillTestStatus {
  if (value === "passed" || value === "failed" || value === "pending") {
    return value
  }
  return "pending"
}

function normalizeShadowToolStatus(value: string): AgentShadowToolRecord["status"] {
  if (value === "draft" || value === "active" || value === "paused" || value === "retired") {
    return value
  }
  return "draft"
}

function normalizeScheduleKind(value: string): AgentScheduleKind {
  if (value === "workflow_run" || value === "self_improvement" || value === "evaluation") {
    return value
  }
  return "workflow_run"
}

function normalizeScheduleFrequency(value: string): AgentScheduleFrequency {
  if (value === "hourly" || value === "daily" || value === "weekly" || value === "custom") {
    return value
  }
  return "daily"
}

function normalizeScheduleStatus(value: string): NonNullable<AgentScheduleRecord["lastStatus"]> {
  if (value === "running" || value === "completed" || value === "failed" || value === "skipped") {
    return value
  }
  return "completed"
}

function normalizeEvaluationStatus(value: string): AgentEvaluationStatus {
  if (value === "passed" || value === "failed" || value === "pending") {
    return value
  }
  return "pending"
}

function normalizeApprovalStatus(value: string): AgentApprovalStatus {
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value
  }
  return "pending"
}

function createUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !accessToken) {
    return null
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

async function resolveUser(client: ReturnType<typeof createUserScopedClient>, accessToken: string) {
  if (!client) {
    return null
  }

  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }
  return data.user
}

function mapAgentRow(row: Row): AgentDefinitionRecord {
  return {
    id: asString(row.id),
    name: asString(row.name, "Untitled Agent"),
    purpose: asString(row.purpose, "Automation agent"),
    soul: asString(row.soul_file ?? row.soul, ""),
    skills: asStringArray(row.skills),
    status: normalizeAgentStatus(asString(row.status, "draft")),
    preferredModelId: asString(row.preferred_model_id ?? row.preferredModelId, DEFAULT_AGENT_MODELS[0].id),
    fallbackModelIds: asStringArray(row.fallback_model_ids ?? row.fallbackModelIds),
    connectors: asStringArray(row.connector_ids ?? row.connectors),
    recursiveImprovementEnabled: asBoolean(
      row.recursive_improvement_enabled ?? row.recursiveImprovementEnabled,
      true,
    ),
    tokenBudgetUsdMonthly: asNumber(
      row.token_budget_usd_monthly ?? row.tokenBudgetUsdMonthly,
      500,
    ),
    weeklyEfficiencyGainPct: asNumber(
      row.weekly_efficiency_gain_pct ?? row.weeklyEfficiencyGainPct,
      10,
    ),
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
    lastRunAt: asString(row.last_run_at ?? row.lastRunAt, "") || undefined,
  }
}

function mapVersionRow(row: Row): AgentVersionRecord {
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id ?? row.agentId),
    versionNumber: asNumber(row.version_number ?? row.versionNumber, 1),
    changeNote: asString(row.change_note ?? row.changeNote, "Version update"),
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
  }
}

function mapConnectorRow(row: Row): AgentConnectorRecord {
  const metadata = asObject(row.metadata)
  return {
    id: asString(row.id),
    provider: asString(row.provider, "unknown"),
    status: normalizeConnectorStatus(asString(row.status, "not_connected")),
    permissionMode: normalizePermissionMode(asString(row.permission_mode ?? row.permissionMode, "read_only")),
    scopes: asStringArray(row.scopes),
    approvalRequired: asBoolean(row.approval_required ?? row.approvalRequired, false),
    lastSyncAt: asString(row.last_sync_at ?? row.lastSyncAt, "") || undefined,
    healthCheckedAt:
      asString(metadata.healthCheckedAt ?? metadata.health_checked_at, "") || undefined,
    healthStatusReason:
      asString(metadata.healthStatusReason ?? metadata.health_status_reason, "") || undefined,
    secretRotatedAt:
      asString(metadata.secretRotatedAt ?? metadata.secret_rotated_at, "") || undefined,
    secretKeyVersion:
      asString(metadata.secretKeyVersion ?? metadata.secret_key_version, "") || undefined,
  }
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

function ageMinutesSince(iso: string | undefined): number | null {
  const parsed = parseIsoDate(iso)
  if (!parsed) return null
  const diffMs = Date.now() - parsed.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0
  return Math.floor(diffMs / 60_000)
}

function isEmailProvider(provider: string): boolean {
  return provider === "gmail" || provider === "outlook" || provider === "imap" || provider === "other"
}

function nextKeyVersion(currentValue: string | undefined): string {
  const current = (currentValue || "v1").trim().toLowerCase()
  const match = /^v(\d+)$/.exec(current)
  if (!match) {
    return "v2"
  }
  const next = Number.parseInt(match[1], 10) + 1
  return `v${Math.max(1, next)}`
}

function mapRunRow(row: Row): AgentRunRecord {
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id ?? row.agentId),
    status: normalizeRunStatus(asString(row.status, "completed")),
    startedAt: asString(row.started_at ?? row.startedAt, nowIso()),
    completedAt: asString(row.completed_at ?? row.completedAt, "") || undefined,
    tokenInput: asNumber(row.token_input ?? row.tokenInput, 0),
    tokenOutput: asNumber(row.token_output ?? row.tokenOutput, 0),
    estimatedCostUsd: asNumber(row.estimated_cost_usd ?? row.estimatedCostUsd, 0),
    efficiencyGainPct: asNumber(row.efficiency_gain_pct ?? row.efficiencyGainPct, 0),
    summary: asString(row.summary, ""),
  }
}

function mapSkillEventRow(row: Row): AgentSkillEventRecord {
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id ?? row.agentId),
    source: asString(row.source, "unknown"),
    skill: asString(row.skill, ""),
    note: asString(row.note, "") || undefined,
    testStatus: normalizeSkillTestStatus(asString(row.test_status ?? row.testStatus, "pending")),
    accepted: asBoolean(row.accepted, false),
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
  }
}

function mapShadowToolRow(row: Row): AgentShadowToolRecord {
  return {
    id: asString(row.id),
    name: asString(row.name, "Shadow Tool"),
    description: asString(row.description, ""),
    status: normalizeShadowToolStatus(asString(row.status, "draft")),
    mappedAgentId: asString(row.mapped_agent_id ?? row.mappedAgentId, "") || undefined,
    coveragePct: asNumber(row.coverage_pct ?? row.coveragePct, 0),
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mapScheduleRow(row: Row): AgentScheduleRecord {
  const config = asObject(row.config)
  const threshold = asNumber(config.thresholdPct ?? config.threshold_pct, -1)
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id ?? row.agentId),
    kind: normalizeScheduleKind(asString(row.kind, "workflow_run")),
    frequency: normalizeScheduleFrequency(asString(row.frequency, "daily")),
    intervalMinutes: Math.max(15, asNumber(row.interval_minutes ?? row.intervalMinutes, 1440)),
    enabled: asBoolean(row.enabled, true),
    nextRunAt: asString(row.next_run_at ?? row.nextRunAt, nowIso()),
    lastRunAt: asString(row.last_run_at ?? row.lastRunAt, "") || undefined,
    lastStatus: asString(row.last_status ?? row.lastStatus, "")
      ? normalizeScheduleStatus(asString(row.last_status ?? row.lastStatus, "completed"))
      : undefined,
    config: {
      benchmarkName: asString(config.benchmarkName ?? config.benchmark_name, "") || undefined,
      thresholdPct: threshold >= 0 ? threshold : undefined,
    },
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mapEvaluationRow(row: Row): AgentEvaluationRecord {
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id ?? row.agentId),
    benchmarkName: asString(row.benchmark_name ?? row.benchmarkName, "default_benchmark"),
    scorePct: asNumber(row.score_pct ?? row.scorePct, 0),
    thresholdPct: asNumber(row.threshold_pct ?? row.thresholdPct, 80),
    status: normalizeEvaluationStatus(asString(row.status, "pending")),
    summary: asString(row.summary, ""),
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
  }
}

function mapApprovalRow(row: Row): AgentApprovalRequestRecord {
  return {
    id: asString(row.id),
    agentId: asString(row.agent_id ?? row.agentId),
    connectorId: asString(row.connector_id ?? row.connectorId, "") || undefined,
    actionType: asString(row.action_type ?? row.actionType, "unknown_action"),
    payloadSummary: asString(row.payload_summary ?? row.payloadSummary, ""),
    riskLevel: ((): "low" | "medium" | "high" => {
      const value = asString(row.risk_level ?? row.riskLevel, "medium")
      if (value === "low" || value === "high") {
        return value
      }
      return "medium"
    })(),
    status: normalizeApprovalStatus(asString(row.status, "pending")),
    requestedByUserId: asString(row.requested_by_user_id ?? row.requestedByUserId, "") || undefined,
    resolvedByUserId: asString(row.resolved_by_user_id ?? row.resolvedByUserId, "") || undefined,
    resolverNote: asString(row.resolver_note ?? row.resolverNote, "") || undefined,
    requestedAt: asString(row.requested_at ?? row.requestedAt, nowIso()),
    resolvedAt: asString(row.resolved_at ?? row.resolvedAt, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mergeConnectorsFromAgents(
  liveConnectors: AgentConnectorRecord[],
  agents: AgentDefinitionRecord[],
): AgentConnectorRecord[] {
  if (agents.length === 0) {
    return liveConnectors
  }

  const connectorsByProvider = new Map<string, AgentConnectorRecord>()
  for (const connector of liveConnectors) {
    connectorsByProvider.set(connector.provider, connector)
  }

  for (const agent of agents) {
    for (const provider of agent.connectors) {
      if (connectorsByProvider.has(provider)) {
        continue
      }
      connectorsByProvider.set(provider, {
        id: `derived-${provider}`,
        provider,
        status: "not_connected",
        permissionMode: "disabled",
        scopes: [],
        approvalRequired: false,
      })
    }
  }

  return Array.from(connectorsByProvider.values())
}

function computeSnapshotEconomics(
  agents: AgentDefinitionRecord[],
  runs: AgentRunRecord[],
): AgentPlatformSnapshot["economics"] {
  const monthlyBudget = agents.reduce((acc, item) => acc + item.tokenBudgetUsdMonthly, 0)
  const monthlyEstimatedSpend = Math.round(runs.reduce((acc, item) => acc + item.estimatedCostUsd, 0) * 20 * 100) / 100
  const weeklyGain =
    Math.round(
      (agents.reduce((acc, item) => acc + item.weeklyEfficiencyGainPct, 0) / Math.max(agents.length, 1)) * 10,
    ) / 10

  const utilization = Math.round((monthlyEstimatedSpend / Math.max(monthlyBudget, 1)) * 100)
  const projectedCompression = Math.max(6, Math.min(35, Math.round(weeklyGain * 1.2)))
  const computeShare = Math.max(4, Math.min(42, Math.round((monthlyEstimatedSpend / 15_000) * 100)))

  const recommendations: string[] = []
  if (utilization > 90) {
    recommendations.push("Token budget exceeds 90% utilization. Route summarization and extraction to lower-cost models.")
  } else {
    recommendations.push("Keep high-cost models only on decision-critical steps and use cheaper models for prep tasks.")
  }
  if (computeShare > 25) {
    recommendations.push("Compute share is climbing. Batch scheduled workloads and evaluate local/on-prem inference.")
  } else {
    recommendations.push("Current compute share is manageable. Keep alerts at 75/90/100% budget thresholds.")
  }
  recommendations.push("Maintain write-with-approval mode for all customer-facing connectors.")

  return {
    weeklyEfficiencyGainPct: weeklyGain,
    tokenSpendUsdMonthly: monthlyEstimatedSpend,
    tokenBudgetUtilizationPct: utilization,
    projectedOpexCompressionPct: projectedCompression,
    computeSharePct: computeShare,
    recommendations,
  }
}

function computeGovernance(
  agents: AgentDefinitionRecord[],
  connectors: AgentConnectorRecord[],
  versions: AgentVersionRecord[],
  approvals: AgentApprovalRequestRecord[],
): AgentPlatformSnapshot["governance"] {
  const pendingApprovals = approvals.filter((item) => item.status === "pending").length
  const highRiskConnectors = connectors.filter(
    (connector) =>
      connector.permissionMode === "write_with_approval" &&
      connector.status !== "connected",
  ).length
  const rollbackReadyAgents = new Set(versions.map((item) => item.agentId)).size

  const notes = [
    "Mutating actions are owner-scoped and require authenticated Supabase sessions.",
    "Agent versions are snapshot-based to support one-click rollback.",
    "Connector permissions enforce read-only, scheduled-only, or approval-gated writes.",
  ]

  if (agents.some((agent) => agent.recursiveImprovementEnabled)) {
    notes.push("Recursive self-improvement is enabled only for approved sources and versioned skill updates.")
  }

  return {
    pendingApprovals,
    highRiskConnectors,
    rollbackReadyAgents,
    complianceNotes: notes,
  }
}

function parseSnapshotObject(value: unknown): Row | null {
  if (!value) {
    return null
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Row
  }
  if (typeof value === "string") {
    const parsed = parseJsonIfPossible(value)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Row
    }
  }
  return null
}

function toDateOrNow(value: string | undefined): Date {
  if (!value) {
    return new Date()
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return new Date()
  }
  return parsed
}

function getDefaultIntervalMinutes(frequency: AgentScheduleFrequency): number {
  if (frequency === "hourly") return 60
  if (frequency === "weekly") return 60 * 24 * 7
  return 60 * 24
}

function normalizeIntervalMinutes(frequency: AgentScheduleFrequency, value: number): number {
  const parsed = Number.isFinite(value) ? Math.round(value) : 0
  if (parsed > 0) {
    return Math.max(15, Math.min(parsed, 60 * 24 * 30))
  }
  return getDefaultIntervalMinutes(frequency)
}

function computeNextRunIso(
  baseIso: string | undefined,
  frequency: AgentScheduleFrequency,
  intervalMinutes: number,
): string {
  const baseDate = toDateOrNow(baseIso)
  const minutes = normalizeIntervalMinutes(frequency, intervalMinutes)
  return new Date(baseDate.getTime() + minutes * 60_000).toISOString()
}

async function loadAgentMetricContext(
  client: QueryClient,
  ownerUserId: string,
  agentId: string,
): Promise<{
  purpose: string
  skills: string[]
  connectors: string[]
  preferredModelId: string
  weeklyEfficiencyGainPct: number
} | null> {
  const { data, error } = await client
    .from(TABLES.agents)
    .select("*")
    .eq("id", agentId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const agent = mapAgentRow(data as Row)
  return {
    purpose: agent.purpose,
    skills: agent.skills,
    connectors: agent.connectors,
    preferredModelId: agent.preferredModelId,
    weeklyEfficiencyGainPct: agent.weeklyEfficiencyGainPct,
  }
}

function clampThreshold(value: number | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 85
  }
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

async function insertCompletedRun(
  client: QueryClient,
  input: {
    ownerUserId: string
    agentId: string
    templateId?: string | null
    summary: string
  },
): Promise<AgentRunRecord | null> {
  const now = nowIso()
  const agentContext = await loadAgentMetricContext(client, input.ownerUserId, input.agentId)
  const metrics = buildDerivedAgentRunMetrics({
    purpose: agentContext?.purpose || "Automation workflow",
    skills: agentContext?.skills || [],
    connectors: agentContext?.connectors || [],
    preferredModelId: agentContext?.preferredModelId || DEFAULT_AGENT_MODELS[0].id,
    weeklyEfficiencyGainPct: agentContext?.weeklyEfficiencyGainPct ?? 10,
    summary: input.summary,
    templateId: input.templateId || null,
  })

  const { data, error } = await client
    .from(TABLES.runs)
    .insert({
      owner_user_id: input.ownerUserId,
      agent_id: input.agentId,
      template_id: input.templateId || null,
      status: "completed",
      started_at: now,
      completed_at: now,
      token_input: metrics.tokenInput,
      token_output: metrics.tokenOutput,
      estimated_cost_usd: metrics.estimatedCostUsd,
      efficiency_gain_pct: metrics.efficiencyGainPct,
      summary: input.summary,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return null
  }

  await client
    .from(TABLES.agents)
    .update({
      last_run_at: now,
      updated_at: now,
    })
    .eq("id", input.agentId)
    .eq("owner_user_id", input.ownerUserId)

  return mapRunRow(data as Row)
}

async function insertEvaluation(
  client: QueryClient,
  input: {
    ownerUserId: string
    agentId: string
    benchmarkName: string
    thresholdPct?: number
    summaryPrefix?: string
  },
): Promise<AgentEvaluationRecord | null> {
  const thresholdPct = clampThreshold(input.thresholdPct)
  const agentContext = await loadAgentMetricContext(client, input.ownerUserId, input.agentId)
  const derivedEvaluation = buildDerivedAgentEvaluation({
    purpose: agentContext?.purpose || "Automation agent",
    skills: agentContext?.skills || [],
    connectors: agentContext?.connectors || [],
    preferredModelId: agentContext?.preferredModelId || DEFAULT_AGENT_MODELS[0].id,
    weeklyEfficiencyGainPct: agentContext?.weeklyEfficiencyGainPct ?? 10,
    benchmarkName: input.benchmarkName,
    thresholdPct,
  })
  const summary = input.summaryPrefix
    ? `${input.summaryPrefix} ${derivedEvaluation.summary}`
    : derivedEvaluation.summary
  const now = nowIso()

  const { data, error } = await client
    .from(TABLES.evaluations)
    .insert({
      owner_user_id: input.ownerUserId,
      agent_id: input.agentId,
      benchmark_name: input.benchmarkName,
      score_pct: derivedEvaluation.scorePct,
      threshold_pct: thresholdPct,
      status: derivedEvaluation.status,
      summary,
      created_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return null
  }

  return mapEvaluationRow(data as Row)
}

async function getNextVersionNumber(
  client: NonNullable<ReturnType<typeof createUserScopedClient>>,
  agentId: string,
): Promise<number> {
  const { data } = await client
    .from(TABLES.versions)
    .select("version_number")
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false })
    .limit(1)

  const current = data?.[0] ? asNumber((data[0] as Row).version_number, 0) : 0
  return current + 1
}

async function createVersionSnapshot(
  client: NonNullable<ReturnType<typeof createUserScopedClient>>,
  ownerUserId: string,
  agentId: string,
  changeNote: string,
): Promise<AgentVersionRecord | null> {
  const { data: agentRow, error: agentError } = await client
    .from(TABLES.agents)
    .select("*")
    .eq("id", agentId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle()

  if (agentError || !agentRow) {
    return null
  }

  const versionNumber = await getNextVersionNumber(client, agentId)
  const now = nowIso()
  const snapshot = agentRow as Row

  const { data: inserted, error: insertError } = await client
    .from(TABLES.versions)
    .insert({
      owner_user_id: ownerUserId,
      agent_id: agentId,
      version_number: versionNumber,
      change_note: changeNote,
      snapshot,
      created_at: now,
    })
    .select("*")
    .single()

  if (insertError || !inserted) {
    return null
  }

  return mapVersionRow(inserted as Row)
}

export function getAgentControlPlaneTableNames() {
  return { ...TABLES }
}

async function safeSelect(
  client: NonNullable<ReturnType<typeof createUserScopedClient>>,
  table: string,
  orderBy: string,
  limit: number,
): Promise<{ data: Row[]; missingTable: boolean; fatalError: boolean }> {
  const { data, error } = await client.from(table).select("*").order(orderBy, { ascending: false }).limit(limit)

  if (!error) {
    return {
      data: (data || []) as Row[],
      missingTable: false,
      fatalError: false,
    }
  }

  const code = (error as unknown as { code?: string }).code
  if (code === "42P01") {
    return {
      data: [],
      missingTable: true,
      fatalError: false,
    }
  }

  return {
    data: [],
    missingTable: false,
    fatalError: true,
  }
}

function createEmptyAgentPlatformSnapshot(): AgentPlatformSnapshot {
  return {
    source: "supabase",
    agents: [],
    versions: [],
    connectors: [],
    runs: [],
    skillEvents: [],
    shadowTools: [],
    schedules: [],
    evaluations: [],
    approvals: [],
    templates: DEFAULT_AGENT_TEMPLATES,
    models: DEFAULT_AGENT_MODELS,
    economics: computeSnapshotEconomics([], []),
    governance: computeGovernance([], [], [], []),
  }
}

export async function fetchAgentPlatformSnapshot(
  accessToken?: string,
): Promise<AgentPlatformSnapshot> {
  const empty = createEmptyAgentPlatformSnapshot()
  if (!accessToken) {
    return empty
  }

  const client = createUserScopedClient(accessToken)
  if (!client) {
    return empty
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return empty
  }

  try {
    const [
      agentResult,
      versionResult,
      connectorResult,
      runResult,
      skillEventResult,
      shadowToolResult,
      scheduleResult,
      evaluationResult,
      approvalResult,
    ] = await Promise.all([
      safeSelect(client, TABLES.agents, "updated_at", 200),
      safeSelect(client, TABLES.versions, "created_at", 300),
      safeSelect(client, TABLES.connectors, "updated_at", 120),
      safeSelect(client, TABLES.runs, "started_at", 300),
      safeSelect(client, TABLES.skillEvents, "created_at", 300),
      safeSelect(client, TABLES.shadowTools, "updated_at", 200),
      safeSelect(client, TABLES.schedules, "updated_at", 300),
      safeSelect(client, TABLES.evaluations, "created_at", 400),
      safeSelect(client, TABLES.approvals, "updated_at", 400),
    ])

    if (
      agentResult.fatalError ||
      versionResult.fatalError ||
      connectorResult.fatalError ||
      runResult.fatalError ||
      skillEventResult.fatalError ||
      shadowToolResult.fatalError ||
      scheduleResult.fatalError ||
      evaluationResult.fatalError ||
      approvalResult.fatalError
    ) {
      return empty
    }

    const liveAgents = agentResult.data.map((row) => mapAgentRow(row as Row))
    const liveVersions = versionResult.data.map((row) => mapVersionRow(row as Row))
    const liveConnectorsBase = connectorResult.data.map((row) => mapConnectorRow(row as Row))
    const liveRuns = runResult.data.map((row) => mapRunRow(row as Row))
    const liveSkillEvents = skillEventResult.data.map((row) => mapSkillEventRow(row as Row))
    const liveShadowTools = shadowToolResult.data.map((row) => mapShadowToolRow(row as Row))
    const liveSchedules = scheduleResult.data.map((row) => mapScheduleRow(row as Row))
    const liveEvaluations = evaluationResult.data.map((row) => mapEvaluationRow(row as Row))
    const liveApprovals = approvalResult.data.map((row) => mapApprovalRow(row as Row))

    if (
      liveAgents.length === 0 &&
      liveVersions.length === 0 &&
      liveConnectorsBase.length === 0 &&
      liveRuns.length === 0 &&
      liveSkillEvents.length === 0 &&
      liveShadowTools.length === 0 &&
      liveSchedules.length === 0 &&
      liveEvaluations.length === 0 &&
      liveApprovals.length === 0
    ) {
      return empty
    }

    const liveConnectors = mergeConnectorsFromAgents(liveConnectorsBase, liveAgents)

    return {
      source: "supabase",
      agents: liveAgents,
      versions: liveVersions,
      connectors: liveConnectors,
      runs: liveRuns,
      skillEvents: liveSkillEvents,
      shadowTools: liveShadowTools,
      schedules: liveSchedules,
      evaluations: liveEvaluations,
      approvals: liveApprovals,
      templates: DEFAULT_AGENT_TEMPLATES,
      models: DEFAULT_AGENT_MODELS,
      economics: computeSnapshotEconomics(liveAgents, liveRuns),
      governance: computeGovernance(liveAgents, liveConnectors, liveVersions, liveApprovals),
    }
  } catch {
    return empty
  }
}

export async function createAgentFromPrompt(
  accessToken: string,
  input: AgentDraftInput,
): Promise<{ ok: true; agent: AgentDefinitionRecord; version: AgentVersionRecord | null } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const draft = await buildAgentDraftFromPromptSmart(input)
  const now = nowIso()

  const { data, error } = await client
    .from(TABLES.agents)
    .insert({
      owner_user_id: user.id,
      name: draft.name,
      purpose: draft.purpose,
      soul_file: draft.soul,
      skills: draft.skills,
      status: "draft",
      preferred_model_id: draft.preferredModelId,
      fallback_model_ids: draft.fallbackModelIds,
      connector_ids: draft.connectors,
      recursive_improvement_enabled: draft.recursiveImprovementEnabled,
      token_budget_usd_monthly: draft.tokenBudgetUsdMonthly,
      weekly_efficiency_gain_pct: draft.weeklyEfficiencyGainPct,
      config: {
        trainingPrompt: input.prompt,
        createdBy: "natural_language",
      },
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to create agent." }
  }

  const mappedAgent = mapAgentRow(data as Row)
  const version = await createVersionSnapshot(
    client,
    user.id,
    mappedAgent.id,
    "Initial natural-language draft",
  )

  return {
    ok: true,
    agent: mappedAgent,
    version,
  }
}

export async function createAgentVersion(
  accessToken: string,
  input: { agentId: string; changeNote?: string },
): Promise<{ ok: true; version: AgentVersionRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const version = await createVersionSnapshot(
    client,
    user.id,
    input.agentId,
    input.changeNote?.trim() || "Manual version snapshot",
  )

  if (!version) {
    return { ok: false, error: "Could not create version snapshot." }
  }

  return { ok: true, version }
}

export async function rollbackAgentToVersion(
  accessToken: string,
  input: { agentId: string; versionId: string },
): Promise<{ ok: true; agent: AgentDefinitionRecord; version: AgentVersionRecord | null } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const { data: versionRow, error: versionError } = await client
    .from(TABLES.versions)
    .select("*")
    .eq("id", input.versionId)
    .eq("agent_id", input.agentId)
    .eq("owner_user_id", user.id)
    .maybeSingle()

  if (versionError || !versionRow) {
    return { ok: false, error: "Version not found." }
  }

  const snapshot = parseSnapshotObject((versionRow as Row).snapshot)
  if (!snapshot) {
    return { ok: false, error: "Version snapshot is invalid." }
  }

  const now = nowIso()
  const { data: updatedAgent, error: updateError } = await client
    .from(TABLES.agents)
    .update({
      name: asString(snapshot.name),
      purpose: asString(snapshot.purpose),
      soul_file: asString(snapshot.soul_file ?? snapshot.soul),
      skills: asStringArray(snapshot.skills),
      status: normalizeAgentStatus(asString(snapshot.status, "draft")),
      preferred_model_id: asString(snapshot.preferred_model_id ?? snapshot.preferredModelId, DEFAULT_AGENT_MODELS[0].id),
      fallback_model_ids: asStringArray(snapshot.fallback_model_ids ?? snapshot.fallbackModelIds),
      connector_ids: asStringArray(snapshot.connector_ids ?? snapshot.connectors),
      recursive_improvement_enabled: asBoolean(snapshot.recursive_improvement_enabled, true),
      token_budget_usd_monthly: asNumber(snapshot.token_budget_usd_monthly, 500),
      weekly_efficiency_gain_pct: asNumber(snapshot.weekly_efficiency_gain_pct, 10),
      updated_at: now,
    })
    .eq("id", input.agentId)
    .eq("owner_user_id", user.id)
    .select("*")
    .single()

  if (updateError || !updatedAgent) {
    return { ok: false, error: "Failed to rollback agent to selected version." }
  }

  const rolledBackVersion = await createVersionSnapshot(
    client,
    user.id,
    input.agentId,
    `Rollback applied from version ${asNumber((versionRow as Row).version_number, 0)}`,
  )

  return {
    ok: true,
    agent: mapAgentRow(updatedAgent as Row),
    version: rolledBackVersion,
  }
}

export async function updateConnectorPermissions(
  accessToken: string,
  input: {
    connectorId: string
    permissionMode: AgentPermissionMode
    scopes: string[]
  },
): Promise<{ ok: true; connector: AgentConnectorRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const permissionMode = normalizePermissionMode(input.permissionMode)
  const approvalRequired = permissionMode === "write_with_approval"
  const status: AgentConnectorRecord["status"] =
    permissionMode === "disabled" ? "not_connected" : "connected"

  const { data, error } = await client
    .from(TABLES.connectors)
    .update({
      permission_mode: permissionMode,
      scopes: input.scopes,
      approval_required: approvalRequired,
      status,
      updated_at: nowIso(),
    })
    .eq("id", input.connectorId)
    .eq("owner_user_id", user.id)
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to update connector permissions." }
  }

  return { ok: true, connector: mapConnectorRow(data as Row) }
}

export async function runConnectorHealthChecks(
  accessToken: string,
  input?: { provider?: string },
): Promise<
  | {
      ok: true
      checked: number
      updated: number
      degraded: number
      notConnected: number
      connectors: AgentConnectorRecord[]
    }
  | { ok: false; error: string }
> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  let connectorQuery = client.from(TABLES.connectors).select("*").eq("owner_user_id", user.id)
  if (input?.provider?.trim()) {
    connectorQuery = connectorQuery.eq("provider", input.provider.trim().toLowerCase())
  }

  const { data: connectorRows, error: connectorError } = await connectorQuery
  if (connectorError) {
    return { ok: false, error: "Failed to load connectors for health checks." }
  }

  const rows = (connectorRows || []) as Row[]
  if (rows.length === 0) {
    return {
      ok: true,
      checked: 0,
      updated: 0,
      degraded: 0,
      notConnected: 0,
      connectors: [],
    }
  }

  const emailProviders = Array.from(
    new Set(
      rows
        .map((row) => asString(row.provider, "").trim().toLowerCase())
        .filter((provider) => isEmailProvider(provider)),
    ),
  )

  const integrationByProvider = new Map<
    string,
    { status: string; lastSyncedAt: string | undefined; syncError: string | undefined }
  >()

  if (emailProviders.length > 0) {
    const { data: integrationRows } = await client
      .from(TABLES.emailIntegrations)
      .select("provider,status,last_synced_at,sync_error,updated_at")
      .eq("owner_user_id", user.id)
      .in("provider", emailProviders)
      .order("updated_at", { ascending: false })

    for (const row of (integrationRows || []) as Row[]) {
      const provider = asString(row.provider, "").trim().toLowerCase()
      if (!provider || integrationByProvider.has(provider)) {
        continue
      }
      integrationByProvider.set(provider, {
        status: asString(row.status, "pending"),
        lastSyncedAt: asString(row.last_synced_at, "") || undefined,
        syncError: asString(row.sync_error, "") || undefined,
      })
    }
  }

  const now = nowIso()
  const updatedConnectors: AgentConnectorRecord[] = []
  let updated = 0
  let degraded = 0
  let notConnected = 0

  for (const row of rows) {
    const provider = asString(row.provider, "").trim().toLowerCase()
    const permissionMode = normalizePermissionMode(
      asString(row.permission_mode ?? row.permissionMode, "read_only"),
    )
    const currentStatus = normalizeConnectorStatus(asString(row.status, "not_connected"))
    const lastSyncAt = asString(row.last_sync_at ?? row.lastSyncAt, "") || undefined
    const lastSyncAgeMinutes = ageMinutesSince(lastSyncAt)
    const metadata = asObject(row.metadata)

    let targetStatus: AgentConnectorRecord["status"] = currentStatus
    let reason = "Connector health check passed."

    if (permissionMode === "disabled") {
      targetStatus = "not_connected"
      reason = "Connector is disabled by policy."
    } else if (isEmailProvider(provider)) {
      const integration = integrationByProvider.get(provider)
      if (!integration) {
        targetStatus = "degraded"
        reason = "No linked email integration was found for this connector."
      } else if (integration.status === "disconnected") {
        targetStatus = "not_connected"
        reason = "Email integration is disconnected."
      } else if (integration.status === "error") {
        targetStatus = "degraded"
        reason = integration.syncError
          ? `Email integration reported error: ${integration.syncError}`
          : "Email integration reported an error state."
      }
    }

    if (targetStatus === currentStatus && lastSyncAgeMinutes !== null) {
      if (lastSyncAgeMinutes >= CONNECTOR_HEALTH_DISCONNECT_MINUTES) {
        targetStatus = "not_connected"
        reason = `Last sync was ${lastSyncAgeMinutes} minutes ago (disconnect threshold ${CONNECTOR_HEALTH_DISCONNECT_MINUTES}m).`
      } else if (lastSyncAgeMinutes >= CONNECTOR_HEALTH_DEGRADE_MINUTES) {
        targetStatus = "degraded"
        reason = `Last sync was ${lastSyncAgeMinutes} minutes ago (degrade threshold ${CONNECTOR_HEALTH_DEGRADE_MINUTES}m).`
      } else if (currentStatus !== "connected" && permissionMode !== "disabled") {
        targetStatus = "connected"
        reason = "Recent sync confirms connector health."
      }
    }

    const nextMetadata: Row = {
      ...metadata,
      healthCheckedAt: now,
      healthStatusReason: reason,
      healthSyncAgeMinutes: lastSyncAgeMinutes,
    }

    const { data: updatedRow, error } = await client
      .from(TABLES.connectors)
      .update({
        status: targetStatus,
        metadata: nextMetadata,
        updated_at: now,
      })
      .eq("id", asString(row.id))
      .eq("owner_user_id", user.id)
      .select("*")
      .single()

    if (error || !updatedRow) {
      continue
    }

    updated += 1
    if (targetStatus === "degraded") degraded += 1
    if (targetStatus === "not_connected") notConnected += 1
    updatedConnectors.push(mapConnectorRow(updatedRow as Row))
  }

  return {
    ok: true,
    checked: rows.length,
    updated,
    degraded,
    notConnected,
    connectors: updatedConnectors,
  }
}

export async function rotateConnectorSecret(
  accessToken: string,
  input: { connectorId: string },
): Promise<{ ok: true; connector: AgentConnectorRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const { data: connectorRow, error: connectorError } = await client
    .from(TABLES.connectors)
    .select("*")
    .eq("id", input.connectorId)
    .eq("owner_user_id", user.id)
    .maybeSingle()
  if (connectorError || !connectorRow) {
    return { ok: false, error: "Connector not found." }
  }

  const row = connectorRow as Row
  const provider = asString(row.provider, "").trim().toLowerCase()
  const now = nowIso()
  const metadata = asObject(row.metadata)

  if (!isEmailProvider(provider)) {
    const nextMetadata: Row = {
      ...metadata,
      secretRotatedAt: now,
      secretKeyVersion: asString(metadata.secretKeyVersion, "") || "metadata-only",
      secretRotationMode: "metadata-only",
    }
    const { data, error } = await client
      .from(TABLES.connectors)
      .update({
        metadata: nextMetadata,
        updated_at: now,
      })
      .eq("id", input.connectorId)
      .eq("owner_user_id", user.id)
      .select("*")
      .single()
    if (error || !data) {
      return { ok: false, error: "Failed to update connector secret metadata." }
    }
    return { ok: true, connector: mapConnectorRow(data as Row) }
  }

  if (!isEmailCredentialEncryptionEnabled()) {
    return { ok: false, error: "EMAIL_TOKEN_ENCRYPTION_KEY is not configured." }
  }

  const serviceClient = getSupabaseServerClient()
  if (!serviceClient) {
    return { ok: false, error: "Supabase service role is not configured." }
  }

  const { data: integrationRow, error: integrationError } = await serviceClient
    .from(TABLES.emailIntegrations)
    .select("id")
    .eq("owner_user_id", user.id)
    .eq("provider", provider)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (integrationError || !integrationRow) {
    return { ok: false, error: "No linked email integration found for connector." }
  }

  const integrationId = asString((integrationRow as Row).id)
  const { data: secretRow, error: secretError } = await serviceClient
    .from(TABLES.emailSecrets)
    .select("encrypted_credentials,key_version")
    .eq("owner_user_id", user.id)
    .eq("integration_id", integrationId)
    .maybeSingle()
  if (secretError || !secretRow) {
    return { ok: false, error: "No encrypted credentials found for linked integration." }
  }

  const encryptedCredentials = asString((secretRow as Row).encrypted_credentials)
  if (!encryptedCredentials) {
    return { ok: false, error: "Encrypted credentials are missing." }
  }

  let decryptedCredential: unknown
  try {
    decryptedCredential = decryptJsonValue<unknown>(encryptedCredentials)
  } catch {
    return { ok: false, error: "Failed to decrypt existing connector credentials." }
  }

  const nextVersion = nextKeyVersion(asString((secretRow as Row).key_version, "v1"))
  const reEncrypted = encryptJsonValue(decryptedCredential)
  const { error: rotateError } = await serviceClient
    .from(TABLES.emailSecrets)
    .update({
      encrypted_credentials: reEncrypted,
      key_version: nextVersion,
      last_rotated_at: now,
      updated_at: now,
    })
    .eq("owner_user_id", user.id)
    .eq("integration_id", integrationId)
  if (rotateError) {
    return { ok: false, error: "Failed to rotate connector secret." }
  }

  const nextMetadata: Row = {
    ...metadata,
    secretRotatedAt: now,
    secretKeyVersion: nextVersion,
    secretRotationMode: "vault-reencrypt",
  }
  const { data: updatedConnectorRow, error: connectorUpdateError } = await client
    .from(TABLES.connectors)
    .update({
      metadata: nextMetadata,
      updated_at: now,
    })
    .eq("id", input.connectorId)
    .eq("owner_user_id", user.id)
    .select("*")
    .single()
  if (connectorUpdateError || !updatedConnectorRow) {
    return { ok: false, error: "Connector secret rotated but connector metadata update failed." }
  }

  return { ok: true, connector: mapConnectorRow(updatedConnectorRow as Row) }
}

export async function setAgentStatus(
  accessToken: string,
  input: { agentId: string; status: AgentDefinitionRecord["status"] },
): Promise<{ ok: true; agent: AgentDefinitionRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const status = normalizeAgentStatus(input.status)
  const { data, error } = await client
    .from(TABLES.agents)
    .update({
      status,
      updated_at: nowIso(),
    })
    .eq("id", input.agentId)
    .eq("owner_user_id", user.id)
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to update agent status." }
  }

  return { ok: true, agent: mapAgentRow(data as Row) }
}

export async function runAgentWorkflow(
  accessToken: string,
  input: { agentId: string; templateId?: string; summary?: string },
): Promise<{ ok: true; run: AgentRunRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const run = await insertCompletedRun(client as QueryClient, {
    ownerUserId: user.id,
    agentId: input.agentId,
    templateId: input.templateId || null,
    summary: input.summary || "Manual workflow run executed from control plane.",
  })
  if (!run) {
    return { ok: false, error: "Failed to create run record." }
  }

  return { ok: true, run }
}

export async function appendAgentSkillEvent(
  accessToken: string,
  input: {
    agentId: string
    source: string
    skill: string
    note?: string
    testStatus?: AgentSkillTestStatus
    accepted?: boolean
  },
): Promise<{ ok: true; event: AgentSkillEventRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const now = nowIso()
  const status = normalizeSkillTestStatus(input.testStatus || "pending")
  const accepted = Boolean(input.accepted)

  const { data, error } = await client
    .from(TABLES.skillEvents)
    .insert({
      owner_user_id: user.id,
      agent_id: input.agentId,
      source: input.source.trim(),
      skill: input.skill.trim(),
      note: input.note?.trim() || null,
      test_status: status,
      accepted,
      created_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to append skill event." }
  }

  if (accepted) {
    const { data: agentRow } = await client
      .from(TABLES.agents)
      .select("skills")
      .eq("id", input.agentId)
      .eq("owner_user_id", user.id)
      .maybeSingle()

    const existingSkills = asStringArray((agentRow as Row | undefined)?.skills)
    const nextSkills = Array.from(new Set([...existingSkills, input.skill.trim()]))

    await client
      .from(TABLES.agents)
      .update({
        skills: nextSkills,
        updated_at: nowIso(),
      })
      .eq("id", input.agentId)
      .eq("owner_user_id", user.id)
  }

  return { ok: true, event: mapSkillEventRow(data as Row) }
}

export async function createShadowTool(
  accessToken: string,
  input: {
    name: string
    description: string
    mappedAgentId?: string
    coveragePct: number
    status?: AgentShadowToolRecord["status"]
  },
): Promise<{ ok: true; shadowTool: AgentShadowToolRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const now = nowIso()
  const { data, error } = await client
    .from(TABLES.shadowTools)
    .insert({
      owner_user_id: user.id,
      name: input.name.trim(),
      description: input.description.trim(),
      status: normalizeShadowToolStatus(input.status || "draft"),
      mapped_agent_id: input.mappedAgentId || null,
      coverage_pct: Math.max(0, Math.min(100, Math.round(input.coveragePct))),
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to create shadow tool." }
  }

  return { ok: true, shadowTool: mapShadowToolRow(data as Row) }
}

export async function createApprovalRequest(
  accessToken: string,
  input: {
    agentId: string
    connectorId?: string
    actionType: string
    payloadSummary: string
    riskLevel: "low" | "medium" | "high"
  },
): Promise<{ ok: true; approval: AgentApprovalRequestRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const { data: agentRow, error: agentError } = await client
    .from(TABLES.agents)
    .select("id")
    .eq("id", input.agentId)
    .eq("owner_user_id", user.id)
    .maybeSingle()
  if (agentError || !agentRow) {
    return { ok: false, error: "Agent not found for approval request." }
  }

  const riskLevel = input.riskLevel === "low" || input.riskLevel === "high" ? input.riskLevel : "medium"
  const now = nowIso()
  const { data, error } = await client
    .from(TABLES.approvals)
    .insert({
      owner_user_id: user.id,
      agent_id: input.agentId,
      connector_id: input.connectorId || null,
      action_type: input.actionType.trim(),
      payload_summary: input.payloadSummary.trim(),
      risk_level: riskLevel,
      status: "pending",
      requested_by_user_id: user.id,
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to create approval request." }
  }

  return { ok: true, approval: mapApprovalRow(data as Row) }
}

export async function resolveApprovalRequest(
  accessToken: string,
  input: {
    approvalId: string
    decision: "approved" | "rejected"
    resolverNote?: string
  },
): Promise<{ ok: true; approval: AgentApprovalRequestRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const decision = input.decision === "approved" ? "approved" : "rejected"
  const now = nowIso()
  const { data, error } = await client
    .from(TABLES.approvals)
    .update({
      status: decision,
      resolved_by_user_id: user.id,
      resolver_note: input.resolverNote?.trim() || null,
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", input.approvalId)
    .eq("owner_user_id", user.id)
    .eq("status", "pending")
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to resolve approval request." }
  }

  return { ok: true, approval: mapApprovalRow(data as Row) }
}

export async function upsertAgentSchedule(
  accessToken: string,
  input: {
    agentId: string
    kind: AgentScheduleKind
    frequency: AgentScheduleFrequency
    intervalMinutes?: number
    enabled: boolean
    nextRunAt?: string
    benchmarkName?: string
    thresholdPct?: number
  },
): Promise<{ ok: true; schedule: AgentScheduleRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const { data: agentRow, error: agentError } = await client
    .from(TABLES.agents)
    .select("id")
    .eq("id", input.agentId)
    .eq("owner_user_id", user.id)
    .maybeSingle()

  if (agentError || !agentRow) {
    return { ok: false, error: "Agent not found for schedule update." }
  }

  const kind = normalizeScheduleKind(input.kind)
  const frequency = normalizeScheduleFrequency(input.frequency)
  const intervalMinutes = normalizeIntervalMinutes(
    frequency,
    input.intervalMinutes ?? getDefaultIntervalMinutes(frequency),
  )
  const nextRunAt = input.nextRunAt
    ? toDateOrNow(input.nextRunAt).toISOString()
    : computeNextRunIso(nowIso(), frequency, intervalMinutes)
  const now = nowIso()
  const config = {
    benchmarkName: input.benchmarkName || null,
    thresholdPct: kind === "evaluation" ? clampThreshold(input.thresholdPct) : null,
  }

  const { data: existing } = await client
    .from(TABLES.schedules)
    .select("*")
    .eq("owner_user_id", user.id)
    .eq("agent_id", input.agentId)
    .eq("kind", kind)
    .maybeSingle()

  if (existing) {
    const { data, error } = await client
      .from(TABLES.schedules)
      .update({
        frequency,
        interval_minutes: intervalMinutes,
        enabled: input.enabled,
        next_run_at: nextRunAt,
        config,
        updated_at: now,
      })
      .eq("id", asString((existing as Row).id))
      .eq("owner_user_id", user.id)
      .select("*")
      .single()

    if (error || !data) {
      return { ok: false, error: "Failed to update schedule." }
    }
    return { ok: true, schedule: mapScheduleRow(data as Row) }
  }

  const { data, error } = await client
    .from(TABLES.schedules)
    .insert({
      owner_user_id: user.id,
      agent_id: input.agentId,
      kind,
      frequency,
      interval_minutes: intervalMinutes,
      enabled: input.enabled,
      next_run_at: nextRunAt,
      config,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to create schedule." }
  }

  return { ok: true, schedule: mapScheduleRow(data as Row) }
}

export async function runAgentEvaluation(
  accessToken: string,
  input: {
    agentId: string
    benchmarkName: string
    thresholdPct?: number
  },
): Promise<{ ok: true; evaluation: AgentEvaluationRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return { ok: false, error: "Supabase client configuration is missing." }
  }

  const user = await resolveUser(client, accessToken)
  if (!user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const { data: agentRow, error: agentError } = await client
    .from(TABLES.agents)
    .select("id")
    .eq("id", input.agentId)
    .eq("owner_user_id", user.id)
    .maybeSingle()
  if (agentError || !agentRow) {
    return { ok: false, error: "Agent not found for evaluation." }
  }

  const evaluation = await insertEvaluation(client as QueryClient, {
    ownerUserId: user.id,
    agentId: input.agentId,
    benchmarkName: input.benchmarkName.trim(),
    thresholdPct: input.thresholdPct,
    summaryPrefix: "Manual evaluation run.",
  })

  if (!evaluation) {
    return { ok: false, error: "Failed to create evaluation." }
  }

  return { ok: true, evaluation }
}

export async function runDueAgentSchedules(input?: {
  maxSchedules?: number
  dryRun?: boolean
}): Promise<
  | {
      ok: true
      due: number
      processed: number
      completed: number
      failed: number
      skipped: number
      dryRun: boolean
      details: Array<{
        scheduleId: string
        agentId: string
        kind: AgentScheduleKind
        status: "completed" | "failed" | "skipped"
        message: string
      }>
    }
  | { ok: false; error: string }
> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { ok: false, error: "Supabase service role is not configured." }
  }

  const configuredLimit = asNumber(process.env.AGENT_CONTROL_PLANE_CRON_MAX_SCHEDULES, 40)
  const maxSchedules = Math.max(1, Math.min(200, Math.round(input?.maxSchedules || configuredLimit)))
  const dryRun = Boolean(input?.dryRun)
  const now = nowIso()

  const { data: dueRows, error } = await client
    .from(TABLES.schedules)
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(maxSchedules)

  if (error) {
    const code = (error as { code?: string }).code
    if (code === "42P01") {
      return {
        ok: true,
        due: 0,
        processed: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        dryRun,
        details: [],
      }
    }
    return { ok: false, error: "Failed to fetch due schedules." }
  }

  const rows = (dueRows || []) as Row[]
  const details: Array<{
    scheduleId: string
    agentId: string
    kind: AgentScheduleKind
    status: "completed" | "failed" | "skipped"
    message: string
  }> = []

  let completed = 0
  let failed = 0
  let skipped = 0
  const claimTimeoutMinutes = Math.max(
    1,
    Math.min(240, asNumber(process.env.AGENT_CONTROL_PLANE_CRON_CLAIM_TIMEOUT_MINUTES, 15)),
  )
  const claimStaleBefore = new Date(Date.now() - claimTimeoutMinutes * 60_000).toISOString()

  for (const row of rows) {
    const schedule = mapScheduleRow(row)
    const ownerUserId = asString(row.owner_user_id)
    if (!ownerUserId) {
      details.push({
        scheduleId: schedule.id,
        agentId: schedule.agentId,
        kind: schedule.kind,
        status: "skipped",
        message: "Schedule skipped because owner context is missing.",
      })
      skipped += 1
      continue
    }

    if (dryRun) {
      details.push({
        scheduleId: schedule.id,
        agentId: schedule.agentId,
        kind: schedule.kind,
        status: "completed",
        message: "Dry-run only; no database mutation executed.",
      })
      completed += 1
      continue
    }

    const { data: claimedRow, error: claimError } = await client
      .from(TABLES.schedules)
      .update({
        last_run_at: now,
        last_status: "running",
        updated_at: now,
      })
      .eq("id", schedule.id)
      .eq("owner_user_id", ownerUserId)
      .eq("enabled", true)
      .lte("next_run_at", now)
      .or(`last_status.is.null,last_status.neq.running,last_run_at.lt.${claimStaleBefore}`)
      .select("*")
      .maybeSingle()

    if (claimError || !claimedRow) {
      details.push({
        scheduleId: schedule.id,
        agentId: schedule.agentId,
        kind: schedule.kind,
        status: "skipped",
        message: "Schedule already claimed by another worker or no longer due.",
      })
      skipped += 1
      continue
    }

    const claimedSchedule = mapScheduleRow(claimedRow as Row)
    const nextRunAt = computeNextRunIso(now, claimedSchedule.frequency, claimedSchedule.intervalMinutes)

    const { data: agentRow } = await client
      .from(TABLES.agents)
      .select("id, owner_user_id, status, name")
      .eq("id", claimedSchedule.agentId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle()

    if (!agentRow || normalizeAgentStatus(asString((agentRow as Row).status, "draft")) !== "active") {
      await client
        .from(TABLES.schedules)
        .update({
          last_run_at: now,
          last_status: "skipped",
          next_run_at: nextRunAt,
          updated_at: now,
        })
        .eq("id", claimedSchedule.id)
        .eq("owner_user_id", ownerUserId)
        .eq("last_status", "running")

      details.push({
        scheduleId: claimedSchedule.id,
        agentId: claimedSchedule.agentId,
        kind: claimedSchedule.kind,
        status: "skipped",
        message: "Schedule skipped because the agent is missing or not active.",
      })
      skipped += 1
      continue
    }

    try {
      if (claimedSchedule.kind === "workflow_run") {
        const run = await insertCompletedRun(client as QueryClient, {
          ownerUserId,
          agentId: claimedSchedule.agentId,
          templateId: null,
          summary: `Scheduled workflow run executed by cron (${claimedSchedule.id}).`,
        })
        if (!run) {
          throw new Error("Unable to create scheduled run.")
        }
      } else if (claimedSchedule.kind === "self_improvement") {
        const skillLabel = `scheduled-skill-${new Date().toISOString().slice(0, 10)}`
        const { error: skillError } = await client
          .from(TABLES.skillEvents)
          .insert({
            owner_user_id: ownerUserId,
            agent_id: claimedSchedule.agentId,
            source: "scheduled-source-scan",
            skill: skillLabel,
            note: "Automatically captured from approved scheduled scan sources.",
            test_status: "pending",
            accepted: false,
            created_at: now,
          })
        if (skillError) {
          throw new Error("Unable to append scheduled skill event.")
        }
      } else {
        const config = asObject((claimedRow as Row).config)
        const benchmarkName =
          asString(config.benchmarkName ?? config.benchmark_name, "") || "scheduled_quality_benchmark"
        const thresholdPct = asNumber(config.thresholdPct ?? config.threshold_pct, 85)
        const evaluation = await insertEvaluation(client as QueryClient, {
          ownerUserId,
          agentId: claimedSchedule.agentId,
          benchmarkName,
          thresholdPct,
          summaryPrefix: "Scheduled evaluation run.",
        })
        if (!evaluation) {
          throw new Error("Unable to create scheduled evaluation.")
        }
      }

      await client
        .from(TABLES.schedules)
        .update({
          last_run_at: now,
          last_status: "completed",
          next_run_at: nextRunAt,
          updated_at: now,
        })
        .eq("id", claimedSchedule.id)
        .eq("owner_user_id", ownerUserId)
        .eq("last_status", "running")

      details.push({
        scheduleId: claimedSchedule.id,
        agentId: claimedSchedule.agentId,
        kind: claimedSchedule.kind,
        status: "completed",
        message: "Scheduled task executed successfully.",
      })
      completed += 1
    } catch (runError) {
      await client
        .from(TABLES.schedules)
        .update({
          last_run_at: now,
          last_status: "failed",
          next_run_at: nextRunAt,
          updated_at: now,
        })
        .eq("id", claimedSchedule.id)
        .eq("owner_user_id", ownerUserId)
        .eq("last_status", "running")

      details.push({
        scheduleId: claimedSchedule.id,
        agentId: claimedSchedule.agentId,
        kind: claimedSchedule.kind,
        status: "failed",
        message: runError instanceof Error ? runError.message : "Scheduled execution failed.",
      })
      failed += 1
    }
  }

  return {
    ok: true,
    due: rows.length,
    processed: rows.length,
    completed,
    failed,
    skipped,
    dryRun,
    details,
  }
}
