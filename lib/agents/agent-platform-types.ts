export type AgentStatus = "draft" | "active" | "paused" | "archived"

export type AgentModelProvider = "openai" | "anthropic" | "moonshot" | "meta" | "local"

export type AgentPermissionMode =
  | "read_only"
  | "write_with_approval"
  | "scheduled_only"
  | "disabled"

export type AgentRunStatus = "running" | "completed" | "failed" | "paused"
export type AgentScheduleKind = "workflow_run" | "self_improvement" | "evaluation"
export type AgentScheduleFrequency = "hourly" | "daily" | "weekly" | "custom"
export type AgentEvaluationStatus = "passed" | "failed" | "pending"
export type AgentApprovalStatus = "pending" | "approved" | "rejected"

export interface AgentModelOption {
  id: string
  label: string
  provider: AgentModelProvider
  costTier: "low" | "medium" | "high"
  latencyTier: "low" | "medium" | "high"
  strengths: string[]
}

export interface AgentWorkflowTemplate {
  id: string
  name: string
  category: "sales" | "operations" | "content" | "personal" | "executive" | "custom"
  description: string
  defaultPrompt: string
  expectedWeeklyGainPct: number
  requiredConnectors: string[]
}

export interface AgentDefinitionRecord {
  id: string
  name: string
  purpose: string
  soul: string
  skills: string[]
  status: AgentStatus
  preferredModelId: string
  fallbackModelIds: string[]
  connectors: string[]
  recursiveImprovementEnabled: boolean
  tokenBudgetUsdMonthly: number
  weeklyEfficiencyGainPct: number
  createdAt: string
  updatedAt: string
  lastRunAt?: string
}

export interface AgentVersionRecord {
  id: string
  agentId: string
  versionNumber: number
  changeNote: string
  createdAt: string
}

export interface AgentConnectorRecord {
  id: string
  provider: string
  status: "connected" | "degraded" | "not_connected"
  permissionMode: AgentPermissionMode
  scopes: string[]
  approvalRequired: boolean
  lastSyncAt?: string
  healthCheckedAt?: string
  healthStatusReason?: string
  secretRotatedAt?: string
  secretKeyVersion?: string
}

export interface AgentRunRecord {
  id: string
  agentId: string
  status: AgentRunStatus
  startedAt: string
  completedAt?: string
  tokenInput: number
  tokenOutput: number
  estimatedCostUsd: number
  efficiencyGainPct: number
  summary: string
}

export type AgentSkillTestStatus = "passed" | "failed" | "pending"

export interface AgentSkillEventRecord {
  id: string
  agentId: string
  source: string
  skill: string
  note?: string
  testStatus: AgentSkillTestStatus
  accepted: boolean
  createdAt: string
}

export interface AgentShadowToolRecord {
  id: string
  name: string
  description: string
  status: "draft" | "active" | "paused" | "retired"
  mappedAgentId?: string
  coveragePct: number
  createdAt: string
  updatedAt: string
}

export interface AgentScheduleRecord {
  id: string
  agentId: string
  kind: AgentScheduleKind
  frequency: AgentScheduleFrequency
  intervalMinutes: number
  enabled: boolean
  nextRunAt: string
  lastRunAt?: string
  lastStatus?: "running" | "completed" | "failed" | "skipped"
  config?: {
    benchmarkName?: string
    thresholdPct?: number
  }
  createdAt: string
  updatedAt: string
}

export interface AgentEvaluationRecord {
  id: string
  agentId: string
  benchmarkName: string
  scorePct: number
  thresholdPct: number
  status: AgentEvaluationStatus
  summary: string
  createdAt: string
}

export interface AgentApprovalRequestRecord {
  id: string
  agentId: string
  connectorId?: string
  actionType: string
  payloadSummary: string
  riskLevel: "low" | "medium" | "high"
  status: AgentApprovalStatus
  requestedByUserId?: string
  resolvedByUserId?: string
  resolverNote?: string
  requestedAt: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AgentEconomicsOverview {
  weeklyEfficiencyGainPct: number
  tokenSpendUsdMonthly: number
  tokenBudgetUtilizationPct: number
  projectedOpexCompressionPct: number
  computeSharePct: number
  recommendations: string[]
}

export interface AgentGovernanceOverview {
  pendingApprovals: number
  highRiskConnectors: number
  rollbackReadyAgents: number
  complianceNotes: string[]
}

export interface AgentPlatformSnapshot {
  source: "mock" | "supabase"
  agents: AgentDefinitionRecord[]
  versions: AgentVersionRecord[]
  connectors: AgentConnectorRecord[]
  runs: AgentRunRecord[]
  skillEvents: AgentSkillEventRecord[]
  shadowTools: AgentShadowToolRecord[]
  schedules: AgentScheduleRecord[]
  evaluations: AgentEvaluationRecord[]
  approvals: AgentApprovalRequestRecord[]
  templates: AgentWorkflowTemplate[]
  models: AgentModelOption[]
  economics: AgentEconomicsOverview
  governance: AgentGovernanceOverview
}

export interface AgentDraftInput {
  prompt: string
  preferredModelId?: string
  tokenBudgetUsdMonthly?: number
}

export interface AgentDraftOutput {
  name: string
  purpose: string
  soul: string
  skills: string[]
  connectors: string[]
  preferredModelId: string
  fallbackModelIds: string[]
  recursiveImprovementEnabled: boolean
  weeklyEfficiencyGainPct: number
  tokenBudgetUsdMonthly: number
}

export const DEFAULT_AGENT_MODELS: AgentModelOption[] = [
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    provider: "openai",
    costTier: "low",
    latencyTier: "low",
    strengths: ["tool orchestration", "structured output", "fast automation"],
  },
  {
    id: "claude-3.7-sonnet",
    label: "Claude Sonnet",
    provider: "anthropic",
    costTier: "medium",
    latencyTier: "medium",
    strengths: ["planning", "writing", "long context reasoning"],
  },
  {
    id: "kimi-2.5",
    label: "Kimi 2.5",
    provider: "moonshot",
    costTier: "low",
    latencyTier: "medium",
    strengths: ["web-heavy research", "cost efficiency"],
  },
  {
    id: "llama-3.3-70b",
    label: "Llama 3.3 70B",
    provider: "meta",
    costTier: "low",
    latencyTier: "high",
    strengths: ["self-hosted option", "private inference"],
  },
  {
    id: "local-macstudio",
    label: "Local Mac Studio Runtime",
    provider: "local",
    costTier: "low",
    latencyTier: "low",
    strengths: ["on-prem privacy", "no egress", "predictable cost"],
  },
]

export const DEFAULT_AGENT_TEMPLATES: AgentWorkflowTemplate[] = [
  {
    id: "sales-intel",
    name: "Sales Intelligence Agent",
    category: "sales",
    description: "Find advertisers, cross-check CRM history, and draft outreach with Slack logging.",
    defaultPrompt:
      "Scrape top podcasts for advertisers, cross-check CRM, identify outreach gaps, draft messages, and post summary to Slack.",
    expectedWeeklyGainPct: 14,
    requiredConnectors: ["crm", "gmail", "slack", "web"],
  },
  {
    id: "weekly-reporting",
    name: "Weekly Performance Reporter",
    category: "operations",
    description: "Aggregate meetings, email, docs, and chat into manager-ready summaries.",
    defaultPrompt:
      "Pull email threads, calendar meetings, Slack notes, and Notion docs to produce a concise weekly manager report per person.",
    expectedWeeklyGainPct: 11,
    requiredConnectors: ["gmail", "calendar", "slack", "notion"],
  },
  {
    id: "content-clipping",
    name: "Content Clipping Agent",
    category: "content",
    description: "Find highlights from long episodes, subtitle clips, and queue distribution.",
    defaultPrompt:
      "Analyze long-form recordings, extract high-retention moments, generate subtitle clips, and queue to content channel.",
    expectedWeeklyGainPct: 16,
    requiredConnectors: ["youtube_studio", "slack", "drive"],
  },
  {
    id: "thumbnail-optimizer",
    name: "Thumbnail + Title Optimizer",
    category: "content",
    description: "Track creator discourse and generate testable title/thumbnail variants.",
    defaultPrompt:
      "Review creator discussions and performance references weekly, propose A/B thumbnail-title bundles, rank by expected click-through.",
    expectedWeeklyGainPct: 10,
    requiredConnectors: ["youtube_studio", "drive", "slack"],
  },
  {
    id: "personal-life",
    name: "Personal Ops Agent",
    category: "personal",
    description: "Predict repeat purchases and stage carts for human approval.",
    defaultPrompt:
      "Look at recent grocery orders and household patterns, predict reorders, pre-build cart, and request approval before checkout.",
    expectedWeeklyGainPct: 8,
    requiredConnectors: ["instacart", "calendar"],
  },
  {
    id: "executive-maestro",
    name: "Maestro Swarm Orchestrator",
    category: "executive",
    description: "Coordinate multi-agent handoffs with approvals, budgets, and rollback safety.",
    defaultPrompt:
      "Run multi-agent workflows, assign specialist roles, enforce approval gates, monitor budget, and rollback if quality drops.",
    expectedWeeklyGainPct: 20,
    requiredConnectors: ["crm", "gmail", "calendar", "slack", "notion"],
  },
]

const CONNECTOR_KEYWORDS: Array<{ connector: string; hints: string[] }> = [
  { connector: "gmail", hints: ["gmail", "email", "inbox"] },
  { connector: "calendar", hints: ["calendar", "meeting", "schedule"] },
  { connector: "slack", hints: ["slack", "mattermost", "channel"] },
  { connector: "notion", hints: ["notion", "wiki", "knowledge base", "docs"] },
  { connector: "crm", hints: ["crm", "hubspot", "pipedrive", "salesforce"] },
  { connector: "youtube_studio", hints: ["youtube", "thumbnail", "clip", "video"] },
  { connector: "zoom", hints: ["zoom", "meeting recording"] },
  { connector: "instacart", hints: ["instacart", "grocery"] },
  { connector: "ad_platforms", hints: ["ad platform", "advertiser", "ads"] },
  { connector: "drive", hints: ["drive", "google drive", "assets"] },
  { connector: "web", hints: ["scrape", "web", "site", "forum", "comments"] },
]

const SKILL_KEYWORDS: Array<{ skill: string; hints: string[] }> = [
  { skill: "web research", hints: ["scrape", "research", "find", "discover"] },
  { skill: "crm enrichment", hints: ["crm", "enrich", "cross-check"] },
  { skill: "outreach drafting", hints: ["outreach", "draft", "message", "email"] },
  { skill: "workflow summarization", hints: ["summary", "report", "digest"] },
  { skill: "content clipping", hints: ["clip", "highlight", "subtitle"] },
  { skill: "thumbnail optimization", hints: ["thumbnail", "title", "ctr", "ab test"] },
  { skill: "approval routing", hints: ["approval", "approve", "human-in-loop"] },
  { skill: "budget governance", hints: ["budget", "token", "cost", "opex"] },
  { skill: "multi-agent orchestration", hints: ["swarm", "orchestrate", "handoff", "maestro"] },
]

function toTitleCase(value: string): string {
  return value
    .split(/\s+/g)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function detectConnectorsFromPrompt(prompt: string): string[] {
  const normalized = prompt.toLowerCase()
  const detected = new Set<string>()

  for (const rule of CONNECTOR_KEYWORDS) {
    if (rule.hints.some((hint) => normalized.includes(hint))) {
      detected.add(rule.connector)
    }
  }

  return Array.from(detected)
}

function detectSkillsFromPrompt(prompt: string): string[] {
  const normalized = prompt.toLowerCase()
  const detected = new Set<string>()

  for (const rule of SKILL_KEYWORDS) {
    if (rule.hints.some((hint) => normalized.includes(hint))) {
      detected.add(rule.skill)
    }
  }

  if (detected.size === 0) {
    detected.add("process automation")
    detected.add("structured reasoning")
  }

  return Array.from(detected)
}

function inferAgentName(prompt: string): string {
  const cleaned = prompt.replace(/[^a-zA-Z0-9\s]/g, " ").trim()
  if (!cleaned) {
    return "Workflow Agent"
  }

  const words = cleaned.split(/\s+/g).slice(0, 4)
  const name = toTitleCase(words.join(" "))
  return `${name} Agent`
}

function inferFallbackChain(preferredModelId: string): string[] {
  const defaults = DEFAULT_AGENT_MODELS.map((model) => model.id)
  return defaults.filter((item) => item !== preferredModelId).slice(0, 2)
}

export function buildAgentDraftFromPromptLegacy(input: AgentDraftInput): AgentDraftOutput {
  const prompt = input.prompt.trim()
  const preferredModelId =
    input.preferredModelId && DEFAULT_AGENT_MODELS.some((model) => model.id === input.preferredModelId)
      ? input.preferredModelId
      : DEFAULT_AGENT_MODELS[0].id

  const connectors = detectConnectorsFromPrompt(prompt)
  const skills = detectSkillsFromPrompt(prompt)
  const expectedGain =
    connectors.length >= 4 ? 17 : connectors.length >= 2 ? 13 : 10
  const monthlyBudget = Math.max(100, Math.min(5000, input.tokenBudgetUsdMonthly ?? connectors.length * 180))

  return {
    name: inferAgentName(prompt),
    purpose: prompt || "Automate multi-step business workflows with tool use and approval gates.",
    soul:
      "You are a pragmatic operations agent. Prioritize measurable business outcomes, require approvals for risky writes, and keep audit logs complete.",
    skills,
    connectors,
    preferredModelId,
    fallbackModelIds: inferFallbackChain(preferredModelId),
    recursiveImprovementEnabled: true,
    weeklyEfficiencyGainPct: expectedGain,
    tokenBudgetUsdMonthly: monthlyBudget,
  }
}

/** Legacy keyword-based agent draft builder (renamed from original) */
// Re-export removed — already exported via function declaration above

/**
 * Smart agent draft builder that uses LLM with legacy fallback.
 * Async version that calls the LLM-powered creation first.
 */
export async function buildAgentDraftFromPromptSmart(input: AgentDraftInput): Promise<AgentDraftOutput> {
  try {
    const { buildAgentDraftWithLLM } = await import("./agent-creation-llm")
    return await buildAgentDraftWithLLM(input)
  } catch {
    return buildAgentDraftFromPromptLegacy(input)
  }
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function getMockAgentPlatformSnapshot(): AgentPlatformSnapshot {
  const agents: AgentDefinitionRecord[] = [
    {
      id: "agent-sales-intel",
      name: "Sales Intelligence Agent",
      purpose: "Find advertisers from podcasts, match CRM, and queue outreach.",
      soul: "Precise, evidence-based SDR assistant with mandatory review before send.",
      skills: ["web research", "crm enrichment", "outreach drafting"],
      status: "active",
      preferredModelId: "gpt-4.1-mini",
      fallbackModelIds: ["kimi-2.5", "llama-3.3-70b"],
      connectors: ["crm", "gmail", "slack", "web"],
      recursiveImprovementEnabled: true,
      tokenBudgetUsdMonthly: 900,
      weeklyEfficiencyGainPct: 16,
      createdAt: isoMinutesAgo(60 * 24 * 30),
      updatedAt: isoMinutesAgo(60 * 2),
      lastRunAt: isoMinutesAgo(18),
    },
    {
      id: "agent-weekly-ops",
      name: "Weekly Reporting Agent",
      purpose: "Generate manager summaries from communication and meeting systems.",
      soul: "Clear, concise, neutral operator; escalates blockers early.",
      skills: ["workflow summarization", "approval routing"],
      status: "active",
      preferredModelId: "claude-3.7-sonnet",
      fallbackModelIds: ["gpt-4.1-mini", "kimi-2.5"],
      connectors: ["gmail", "calendar", "slack", "notion"],
      recursiveImprovementEnabled: true,
      tokenBudgetUsdMonthly: 620,
      weeklyEfficiencyGainPct: 12,
      createdAt: isoMinutesAgo(60 * 24 * 20),
      updatedAt: isoMinutesAgo(60 * 8),
      lastRunAt: isoMinutesAgo(75),
    },
    {
      id: "agent-maestro",
      name: "Maestro Orchestrator",
      purpose: "Coordinate specialized agents, enforce approvals, and watch budgets.",
      soul: "System-level orchestrator focused on reliability and governance.",
      skills: ["multi-agent orchestration", "budget governance", "approval routing"],
      status: "paused",
      preferredModelId: "local-macstudio",
      fallbackModelIds: ["gpt-4.1-mini", "llama-3.3-70b"],
      connectors: ["crm", "gmail", "calendar", "slack", "notion"],
      recursiveImprovementEnabled: true,
      tokenBudgetUsdMonthly: 1800,
      weeklyEfficiencyGainPct: 20,
      createdAt: isoMinutesAgo(60 * 24 * 10),
      updatedAt: isoMinutesAgo(60 * 20),
      lastRunAt: isoMinutesAgo(60 * 24),
    },
  ]

  const versions: AgentVersionRecord[] = [
    { id: "ver-1", agentId: "agent-sales-intel", versionNumber: 1, changeNote: "Initial template import", createdAt: isoMinutesAgo(60 * 24 * 29) },
    { id: "ver-2", agentId: "agent-sales-intel", versionNumber: 2, changeNote: "Added CRM dedupe rules", createdAt: isoMinutesAgo(60 * 24 * 7) },
    { id: "ver-3", agentId: "agent-sales-intel", versionNumber: 3, changeNote: "Added approval gate for outbound email", createdAt: isoMinutesAgo(60 * 12) },
    { id: "ver-4", agentId: "agent-weekly-ops", versionNumber: 1, changeNote: "Initial reporting workflow", createdAt: isoMinutesAgo(60 * 24 * 19) },
    { id: "ver-5", agentId: "agent-maestro", versionNumber: 1, changeNote: "Swarm orchestration baseline", createdAt: isoMinutesAgo(60 * 24 * 9) },
  ]

  const connectors: AgentConnectorRecord[] = [
    {
      id: "connector-gmail",
      provider: "gmail",
      status: "connected",
      permissionMode: "write_with_approval",
      scopes: ["gmail.readonly", "gmail.send"],
      approvalRequired: true,
      lastSyncAt: isoMinutesAgo(12),
    },
    {
      id: "connector-calendar",
      provider: "calendar",
      status: "connected",
      permissionMode: "scheduled_only",
      scopes: ["calendar.read", "calendar.events.write"],
      approvalRequired: true,
      lastSyncAt: isoMinutesAgo(22),
    },
    {
      id: "connector-slack",
      provider: "slack",
      status: "connected",
      permissionMode: "read_only",
      scopes: ["channels:read", "chat:write"],
      approvalRequired: false,
      lastSyncAt: isoMinutesAgo(8),
    },
    {
      id: "connector-crm",
      provider: "crm",
      status: "degraded",
      permissionMode: "write_with_approval",
      scopes: ["contacts.read", "contacts.write", "deals.read"],
      approvalRequired: true,
      lastSyncAt: isoMinutesAgo(210),
    },
    {
      id: "connector-youtube",
      provider: "youtube_studio",
      status: "not_connected",
      permissionMode: "disabled",
      scopes: [],
      approvalRequired: false,
    },
  ]

  const runs: AgentRunRecord[] = [
    {
      id: "run-1",
      agentId: "agent-sales-intel",
      status: "completed",
      startedAt: isoMinutesAgo(45),
      completedAt: isoMinutesAgo(41),
      tokenInput: 18200,
      tokenOutput: 7200,
      estimatedCostUsd: 3.9,
      efficiencyGainPct: 17,
      summary: "Found 22 new advertisers, flagged 6 CRM gaps, drafted 11 outreach emails.",
    },
    {
      id: "run-2",
      agentId: "agent-weekly-ops",
      status: "completed",
      startedAt: isoMinutesAgo(150),
      completedAt: isoMinutesAgo(141),
      tokenInput: 26400,
      tokenOutput: 9600,
      estimatedCostUsd: 5.2,
      efficiencyGainPct: 11,
      summary: "Generated 9 weekly reports and highlighted 4 cross-team blockers.",
    },
    {
      id: "run-3",
      agentId: "agent-maestro",
      status: "paused",
      startedAt: isoMinutesAgo(60 * 24),
      tokenInput: 43000,
      tokenOutput: 12500,
      estimatedCostUsd: 11.6,
      efficiencyGainPct: 0,
      summary: "Paused pending connector scope review.",
    },
  ]

  const skillEvents: AgentSkillEventRecord[] = [
    {
      id: "skill-event-1",
      agentId: "agent-sales-intel",
      source: "YouTube comments",
      skill: "ad copy angle mining",
      note: "Improved outreach relevance in pilot set.",
      testStatus: "passed",
      accepted: true,
      createdAt: isoMinutesAgo(90),
    },
    {
      id: "skill-event-2",
      agentId: "agent-weekly-ops",
      source: "internal wiki",
      skill: "manager summary prioritization",
      note: "Awaiting A/B test completion.",
      testStatus: "pending",
      accepted: false,
      createdAt: isoMinutesAgo(210),
    },
  ]

  const shadowTools: AgentShadowToolRecord[] = [
    {
      id: "shadow-1",
      name: "Internal SDR Pipeline",
      description: "Lightweight outreach workflow replacing external SDR SaaS for core flows.",
      status: "active",
      mappedAgentId: "agent-sales-intel",
      coveragePct: 83,
      createdAt: isoMinutesAgo(60 * 24 * 14),
      updatedAt: isoMinutesAgo(60 * 3),
    },
    {
      id: "shadow-2",
      name: "Weekly Ops Reporter",
      description: "Internal manager report system replacing manual reporting stack.",
      status: "active",
      mappedAgentId: "agent-weekly-ops",
      coveragePct: 78,
      createdAt: isoMinutesAgo(60 * 24 * 10),
      updatedAt: isoMinutesAgo(60 * 9),
    },
  ]

  const schedules: AgentScheduleRecord[] = [
    {
      id: "schedule-1",
      agentId: "agent-sales-intel",
      kind: "workflow_run",
      frequency: "daily",
      intervalMinutes: 1440,
      enabled: true,
      nextRunAt: isoMinutesAgo(-120),
      lastRunAt: isoMinutesAgo(60 * 12),
      lastStatus: "completed",
      config: {},
      createdAt: isoMinutesAgo(60 * 24 * 6),
      updatedAt: isoMinutesAgo(60 * 4),
    },
    {
      id: "schedule-2",
      agentId: "agent-sales-intel",
      kind: "self_improvement",
      frequency: "weekly",
      intervalMinutes: 10080,
      enabled: true,
      nextRunAt: isoMinutesAgo(60 * 48),
      lastRunAt: isoMinutesAgo(60 * 24 * 5),
      lastStatus: "completed",
      config: {},
      createdAt: isoMinutesAgo(60 * 24 * 14),
      updatedAt: isoMinutesAgo(60 * 24),
    },
    {
      id: "schedule-3",
      agentId: "agent-weekly-ops",
      kind: "evaluation",
      frequency: "daily",
      intervalMinutes: 1440,
      enabled: true,
      nextRunAt: isoMinutesAgo(-35),
      lastRunAt: isoMinutesAgo(60 * 25),
      lastStatus: "completed",
      config: {
        benchmarkName: "weekly_summary_accuracy",
        thresholdPct: 82,
      },
      createdAt: isoMinutesAgo(60 * 24 * 9),
      updatedAt: isoMinutesAgo(60 * 11),
    },
  ]

  const evaluations: AgentEvaluationRecord[] = [
    {
      id: "eval-1",
      agentId: "agent-sales-intel",
      benchmarkName: "outreach_quality_v1",
      scorePct: 91,
      thresholdPct: 85,
      status: "passed",
      summary: "Outreach relevance benchmark passed with strong personalization score.",
      createdAt: isoMinutesAgo(60 * 3),
    },
    {
      id: "eval-2",
      agentId: "agent-weekly-ops",
      benchmarkName: "weekly_summary_accuracy",
      scorePct: 79,
      thresholdPct: 82,
      status: "failed",
      summary: "Missed action items in two samples; review extraction prompts.",
      createdAt: isoMinutesAgo(60 * 9),
    },
  ]

  const approvals: AgentApprovalRequestRecord[] = [
    {
      id: "approval-1",
      agentId: "agent-sales-intel",
      connectorId: "connector-gmail",
      actionType: "send_outreach_batch",
      payloadSummary: "Send 11 outreach emails to net-new advertisers.",
      riskLevel: "high",
      status: "pending",
      requestedByUserId: "mock-user",
      requestedAt: isoMinutesAgo(24),
      createdAt: isoMinutesAgo(24),
      updatedAt: isoMinutesAgo(24),
    },
    {
      id: "approval-2",
      agentId: "agent-weekly-ops",
      connectorId: "connector-calendar",
      actionType: "create_followup_meetings",
      payloadSummary: "Create 5 cross-team follow-up events based on weekly report.",
      riskLevel: "medium",
      status: "approved",
      requestedByUserId: "mock-user",
      resolvedByUserId: "mock-manager",
      resolverNote: "Approved for pilot team only.",
      requestedAt: isoMinutesAgo(220),
      resolvedAt: isoMinutesAgo(205),
      createdAt: isoMinutesAgo(220),
      updatedAt: isoMinutesAgo(205),
    },
  ]

  const tokenBudgetTotal = agents.reduce((acc, item) => acc + item.tokenBudgetUsdMonthly, 0)
  const estimatedTokenSpend = runs.reduce((acc, item) => acc + item.estimatedCostUsd, 0) * 18
  const weeklyGain =
    Math.round(
      (agents.reduce((acc, item) => acc + item.weeklyEfficiencyGainPct, 0) / Math.max(agents.length, 1)) * 10,
    ) / 10

  return {
    source: "mock",
    agents,
    versions,
    connectors,
    runs,
    skillEvents,
    shadowTools,
    schedules,
    evaluations,
    approvals,
    templates: DEFAULT_AGENT_TEMPLATES,
    models: DEFAULT_AGENT_MODELS,
    economics: {
      weeklyEfficiencyGainPct: weeklyGain,
      tokenSpendUsdMonthly: Math.round(estimatedTokenSpend * 100) / 100,
      tokenBudgetUtilizationPct: Math.round((estimatedTokenSpend / Math.max(tokenBudgetTotal, 1)) * 100),
      projectedOpexCompressionPct: 18,
      computeSharePct: 12,
      recommendations: [
        "Route batch summarization to low-cost models during off-hours.",
        "Move high-volume deterministic runs to local/on-prem inference.",
        "Require approvals for connectors with write scope to reduce incident risk.",
      ],
    },
    governance: {
      pendingApprovals: approvals.filter((item) => item.status === "pending").length,
      highRiskConnectors: 2,
      rollbackReadyAgents: agents.length,
      complianceNotes: [
        "All write actions require human approval in production mode.",
        "Version snapshots retained for rollback and audit.",
        "Token budget alerts trigger at 75%, 90%, and 100% thresholds.",
      ],
    },
  }
}
