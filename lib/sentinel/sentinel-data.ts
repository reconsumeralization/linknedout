import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import { getVetoGateConfig, SENTINEL_THREAT_SIGNATURES } from "@/lib/sentinel/sentinel-engine"
import { computeTaskRealityMetrics } from "@/lib/sentinel/sentinel-task-reality"
import type {
  SentinelActivityEvent,
  SentinelAnomalyAlert,
  SentinelApprovalItem,
  SentinelIncident,
  SentinelIncidentSeverity,
  SentinelIncidentStatus,
  SentinelResilienceKpis,
  SentinelRiskLevel,
  SentinelSnapshot,
  SentinelThreatCategoryCounts,
  SentinelTransport,
  ThreatSignature,
} from "@/lib/sentinel/sentinel-types"

type Row = Record<string, unknown>
type SupabaseErrorLike = { code?: string; message?: string } | null

const AUDIT_TABLE = process.env.SUPABASE_MCP_AUDIT_TABLE || "mcp_tool_audit_events"
const APPROVALS_TABLE = process.env.SENTINEL_APPROVALS_TABLE || "sentinel_veto_approvals"
const THREAT_DISMISSALS_TABLE =
  process.env.SENTINEL_THREAT_DISMISSALS_TABLE || "sentinel_threat_dismissals"
const INCIDENTS_TABLE = process.env.SENTINEL_INCIDENTS_TABLE || "sentinel_incidents"
const KPI_OBSERVATION_WINDOW_HOURS = Number(
  process.env.SENTINEL_KPI_OBSERVATION_HOURS || "24",
)
const APPROVAL_DEDUPE_WINDOW_MINUTES = Number(
  process.env.SENTINEL_APPROVAL_DEDUPE_WINDOW_MINUTES || "10",
)
const APPROVAL_EXECUTION_WINDOW_MINUTES = Number(
  process.env.SENTINEL_APPROVAL_EXECUTION_WINDOW_MINUTES || "120",
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

function asNullableString(value: unknown): string | null {
  const normalized = asString(value, "").trim()
  return normalized ? normalized : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase()
    if (lower === "true" || lower === "1") return true
    if (lower === "false" || lower === "0") return false
  }
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function asNullableInteger(value: unknown): number | null {
  const parsed = asNullableNumber(value)
  if (parsed === null) {
    return null
  }
  return Math.max(0, Math.floor(parsed))
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item, "")).filter(Boolean)
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((item) => asString(item, "")).filter(Boolean)
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

function sanitizeSmallStringArray(
  values: string[] | undefined,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(values)) {
    return []
  }
  const result: string[] = []
  for (const value of values) {
    const normalized = String(value || "")
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, maxLength)
    if (!normalized) {
      continue
    }
    result.push(normalized)
    if (result.length >= maxItems) {
      break
    }
  }
  return result
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString()
}

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function isMissingRelationError(error: SupabaseErrorLike): boolean {
  if (!error) {
    return false
  }
  if (error.code === "42P01" || error.code === "42703") {
    return true
  }
  if (typeof error.message === "string" && /does not exist|relation .* does not exist/i.test(error.message)) {
    return true
  }
  return false
}

function toRiskLevel(score: number): SentinelRiskLevel {
  if (score >= 80) return "critical"
  if (score >= 60) return "high"
  if (score >= 35) return "medium"
  return "low"
}

function normalizeTransport(value: unknown): SentinelTransport {
  const transport = asString(value, "realtime-tools")
  if (transport === "mcp" || transport === "realtime-tools" || transport === "chat") {
    return transport
  }
  return "realtime-tools"
}

function normalizeStatus(value: unknown): SentinelActivityEvent["status"] {
  const status = asString(value, "allowed")
  if (status === "blocked" || status === "failed" || status === "vetoed" || status === "allowed") {
    return status
  }
  return "allowed"
}

function normalizeCriticalWorkflowClass(
  value: unknown,
): SentinelActivityEvent["criticalWorkflowClass"] {
  const workflowClass = asString(value, "none")
  if (workflowClass === "none" || workflowClass === "destructive" || workflowClass === "egress") {
    return workflowClass
  }
  return "none"
}

function normalizeVerificationState(value: unknown): SentinelActivityEvent["verificationState"] {
  const state = asString(value, "not_required")
  if (state === "not_required" || state === "pending" || state === "passed" || state === "failed") {
    return state
  }
  return "not_required"
}

function normalizeApprovalStatus(value: unknown): SentinelApprovalItem["status"] {
  const status = asString(value, "pending")
  if (status === "pending" || status === "approved" || status === "rejected" || status === "expired") {
    return status
  }
  return "pending"
}

function normalizeIncidentSeverity(value: unknown): SentinelIncidentSeverity {
  const severity = asString(value, "medium")
  if (severity === "low" || severity === "medium" || severity === "high" || severity === "critical") {
    return severity
  }
  return "medium"
}

function normalizeIncidentStatus(value: unknown): SentinelIncidentStatus {
  const status = asString(value, "open")
  if (status === "open" || status === "investigating" || status === "contained" || status === "resolved") {
    return status
  }
  return "open"
}

function normalizeObservationHours(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 24
  }
  return Math.min(Math.max(Math.floor(value), 1), 168)
}

function normalizeMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(value), 1), 1440)
}

function averageMinutes(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function filterEventsByWindow(events: SentinelActivityEvent[], hours: number): SentinelActivityEvent[] {
  const startMs = Date.now() - hours * 60 * 60_000
  return events.filter((event) => {
    const ts = toEpochMs(event.createdAt)
    return ts !== null && ts >= startMs
  })
}

function buildResilienceKpis(
  events: SentinelActivityEvent[],
  approvals: SentinelApprovalItem[],
  incidents: SentinelIncident[],
): SentinelResilienceKpis {
  const config = getVetoGateConfig()
  const observationWindowHours = normalizeObservationHours(KPI_OBSERVATION_WINDOW_HOURS)
  const windowEvents = filterEventsByWindow(events, observationWindowHours)

  const sessions = new Map<string, SentinelActivityEvent[]>()
  for (const event of windowEvents) {
    const sessionKey = event.sessionId || `event:${event.id}`
    const bucket = sessions.get(sessionKey) || []
    bucket.push(event)
    sessions.set(sessionKey, bucket)
  }

  let sessionsWithDetection = 0
  let sessionsWithContainment = 0
  const mttdSamples: number[] = []
  const mttcSamples: number[] = []

  for (const sessionEvents of sessions.values()) {
    sessionEvents.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const startedAt = toEpochMs(sessionEvents[0]?.createdAt)
    if (startedAt === null) {
      continue
    }

    const detectedEvent = sessionEvents.find(
      (event) =>
        event.injectionMatches.length > 0 ||
        event.credentialAccessDetected ||
        event.riskScore >= config.alertThreshold ||
        event.status === "failed" ||
        event.status === "blocked" ||
        event.status === "vetoed",
    )
    if (!detectedEvent) {
      continue
    }
    const detectedAt = toEpochMs(detectedEvent.createdAt)
    if (detectedAt === null) {
      continue
    }

    sessionsWithDetection += 1
    mttdSamples.push(Math.max(0, (detectedAt - startedAt) / 60_000))

    const containedEvent = sessionEvents.find((event) => event.status === "blocked" || event.status === "vetoed")
    const containedAt = containedEvent ? toEpochMs(containedEvent.createdAt) : null
    if (containedAt === null) {
      continue
    }
    sessionsWithContainment += 1
    mttcSamples.push(Math.max(0, (containedAt - detectedAt) / 60_000))
  }

  const approvalResolutionSamples = approvals
    .filter((approval) => Boolean(approval.resolvedAt))
    .map((approval) => {
      const start = toEpochMs(approval.requestedAt)
      const end = toEpochMs(approval.resolvedAt)
      if (start === null || end === null) {
        return null
      }
      return Math.max(0, (end - start) / 60_000)
    })
    .filter((value): value is number => value !== null)

  const unresolvedHighRiskEvents = windowEvents.filter(
    (event) =>
      event.riskScore >= 60 &&
      event.status !== "blocked" &&
      event.status !== "vetoed",
  ).length

  const openIncidents = incidents.filter((incident) => incident.status !== "resolved").length
  const taskReality = computeTaskRealityMetrics(windowEvents)

  return {
    observationWindowHours,
    sessionsObserved: sessions.size,
    sessionsWithDetection,
    sessionsWithContainment,
    mttdMinutes: averageMinutes(mttdSamples),
    mttcMinutes: averageMinutes(mttcSamples),
    meanApprovalResolutionMinutes: averageMinutes(approvalResolutionSamples),
    unresolvedHighRiskEvents,
    openIncidents,
    criticalVerificationRequired: taskReality.criticalVerificationRequired,
    criticalVerificationPassed: taskReality.criticalVerificationPassed,
    criticalVerificationFailed: taskReality.criticalVerificationFailed,
    criticalVerificationPending: taskReality.criticalVerificationPending,
    criticalVerificationMissed: taskReality.criticalVerificationMissed,
    taskRealityMismatchCount: taskReality.taskRealityMismatchCount,
    taskRealityPassRatePercent: taskReality.taskRealityPassRatePercent,
  }
}

function buildAnomalyAlerts(
  events: SentinelActivityEvent[],
  incidents: SentinelIncident[],
): SentinelAnomalyAlert[] {
  const alerts: SentinelAnomalyAlert[] = []
  const now = Date.now()

  const countMatches = (
    predicate: (event: SentinelActivityEvent) => boolean,
    startMs: number,
    endMs: number,
  ): { count: number; lastSeenAt: string | null } => {
    let count = 0
    let lastSeenAt: string | null = null
    for (const event of events) {
      const ts = toEpochMs(event.createdAt)
      if (ts === null || ts < startMs || ts >= endMs || !predicate(event)) {
        continue
      }
      count += 1
      if (!lastSeenAt || ts > (toEpochMs(lastSeenAt) || 0)) {
        lastSeenAt = event.createdAt
      }
    }
    return { count, lastSeenAt }
  }

  const last15Start = now - 15 * 60_000
  const prev60Start = now - 75 * 60_000
  const prev60End = last15Start

  const blockedPredicate = (event: SentinelActivityEvent) =>
    event.status === "blocked" || event.status === "vetoed"
  const blockedRecent = countMatches(blockedPredicate, last15Start, now)
  const blockedBaseline = countMatches(blockedPredicate, prev60Start, prev60End)
  const blockedExpected = blockedBaseline.count / 4
  const blockedThreshold = Math.max(4, Math.ceil(Math.max(1, blockedExpected) * 2))
  if (blockedRecent.count >= blockedThreshold) {
    alerts.push({
      id: "anomaly-blocked-tool-spike",
      category: "tool_abuse",
      severity: blockedRecent.count >= blockedThreshold * 2 ? "critical" : "high",
      title: "Blocked/vetoed tool-call spike",
      description: `${blockedRecent.count} blocked or vetoed tool calls in the last 15 minutes.`,
      metricValue: blockedRecent.count,
      threshold: blockedThreshold,
      windowMinutes: 15,
      lastObservedAt: blockedRecent.lastSeenAt,
      recommendedAction: "Inspect affected sessions and open/triage incidents with business impact tags.",
    })
  }

  const oauthPredicate = (event: SentinelActivityEvent) =>
    /oauth/i.test(event.toolName) &&
    (event.status === "failed" || event.status === "blocked" || event.status === "vetoed")
  const oauthRecent = countMatches(oauthPredicate, now - 30 * 60_000, now)
  const oauthBaseline = countMatches(oauthPredicate, now - 150 * 60_000, now - 30 * 60_000)
  const oauthExpected = oauthBaseline.count / 4
  const oauthThreshold = Math.max(3, Math.ceil(Math.max(1, oauthExpected) * 2))
  if (oauthRecent.count >= oauthThreshold) {
    alerts.push({
      id: "anomaly-oauth-failure-spike",
      category: "oauth",
      severity: oauthRecent.count >= oauthThreshold * 2 ? "high" : "medium",
      title: "OAuth failure spike",
      description: `${oauthRecent.count} OAuth-related failures/blocks in the last 30 minutes.`,
      metricValue: oauthRecent.count,
      threshold: oauthThreshold,
      windowMinutes: 30,
      lastObservedAt: oauthRecent.lastSeenAt,
      recommendedAction: "Check provider outage status, callback integrity, and token exchange errors.",
    })
  }

  const rateLimitPredicate = (event: SentinelActivityEvent) =>
    /rate[\s_-]?limit|429/i.test(`${event.blockedReason || ""} ${event.errorMessage || ""}`)
  const rateLimitRecent = countMatches(rateLimitPredicate, last15Start, now)
  const rateLimitBaseline = countMatches(rateLimitPredicate, prev60Start, prev60End)
  const rateLimitExpected = rateLimitBaseline.count / 4
  const rateLimitThreshold = Math.max(3, Math.ceil(Math.max(1, rateLimitExpected) * 2))
  if (rateLimitRecent.count >= rateLimitThreshold) {
    alerts.push({
      id: "anomaly-rate-limit-spike",
      category: "rate_limit",
      severity: rateLimitRecent.count >= rateLimitThreshold * 2 ? "high" : "medium",
      title: "Rate-limit rejection spike",
      description: `${rateLimitRecent.count} rate-limit linked failures in the last 15 minutes.`,
      metricValue: rateLimitRecent.count,
      threshold: rateLimitThreshold,
      windowMinutes: 15,
      lastObservedAt: rateLimitRecent.lastSeenAt,
      recommendedAction: "Investigate abusive clients and tighten endpoint-specific quotas.",
    })
  }

  const staleHighImpact = incidents.filter((incident) => {
    const detectedAtMs = toEpochMs(incident.detectedAt)
    if (detectedAtMs === null) {
      return false
    }
    const staleForMinutes = (now - detectedAtMs) / 60_000
    return (
      (incident.status === "open" || incident.status === "investigating") &&
      (incident.severity === "high" || incident.severity === "critical") &&
      staleForMinutes >= 60
    )
  })

  if (staleHighImpact.length > 0) {
    const latest = staleHighImpact
      .map((incident) => incident.updatedAt || incident.detectedAt)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null

    alerts.push({
      id: "anomaly-stale-high-impact-incidents",
      category: "incident",
      severity: "high",
      title: "High-impact incidents remain uncontained",
      description: `${staleHighImpact.length} high/critical incidents have remained open or investigating for over 60 minutes.`,
      metricValue: staleHighImpact.length,
      threshold: 1,
      windowMinutes: 60,
      lastObservedAt: latest,
      recommendedAction: "Escalate incident command and record containment ETA and business impact immediately.",
    })
  }

  return alerts
}

function createUserScopedClient(accessToken: string): SupabaseClient | null {
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

function toActivityEvent(row: Row): SentinelActivityEvent {
  const riskScore = asNumber(row.risk_score, 0)
  const actorId = asNullableString(row.owner_user_id) || "anonymous"

  return {
    id: asString(row.id, ""),
    toolName: asString(row.tool_name, "unknown"),
    transport: normalizeTransport(row.transport),
    status: normalizeStatus(row.status),
    riskScore,
    riskLevel: toRiskLevel(riskScore),
    injectionMatches: parseStringArray(row.injection_matches),
    credentialAccessDetected: asBoolean(row.credential_access_detected),
    actorId,
    sessionId: asNullableString(row.session_id),
    argHash: asNullableString(row.arg_hash),
    manifestId: asNullableString(row.manifest_id),
    manifestHash: asNullableString(row.manifest_hash),
    parentHash: asNullableString(row.parent_hash),
    vetoed: asBoolean(row.vetoed),
    createdAt: asString(row.created_at, new Date().toISOString()),
    argPreview: asNullableString(row.arg_preview),
    blockedReason: asNullableString(row.blocked_reason),
    errorMessage: asNullableString(row.error_message),
    criticalWorkflowClass: normalizeCriticalWorkflowClass(row.critical_workflow_class),
    verificationRequired: asBoolean(row.verification_required),
    verificationState: normalizeVerificationState(row.verification_state),
    verificationTargetTool: asNullableString(row.verification_target_tool),
    verificationSubject: asNullableString(row.verification_subject),
    verificationDueAt: asNullableString(row.verification_due_at),
    verificationCheckedAt: asNullableString(row.verification_checked_at),
    egressPayloadBytes: asNullableInteger(row.egress_payload_bytes),
    egressAttachmentCount: asNullableInteger(row.egress_attachment_count),
    egressThreadMessageCount: asNullableInteger(row.egress_thread_message_count),
    egressShapeApprovalRequired: asBoolean(row.egress_shape_approval_required),
  }
}

function toApprovalItem(row: Row): SentinelApprovalItem {
  const riskScore = asNumber(row.risk_score, 0)
  return {
    id: asString(row.id, ""),
    toolName: asString(row.tool_name, "unknown"),
    transport: normalizeTransport(row.transport),
    actorId: asNullableString(row.actor_id) || "anonymous",
    riskScore,
    riskLevel: toRiskLevel(riskScore),
    argPreview: asNullableString(row.arg_preview),
    manifestId: asNullableString(row.manifest_id),
    status: normalizeApprovalStatus(row.status),
    requestedAt: asString(row.requested_at, new Date().toISOString()),
    resolvedAt: asNullableString(row.resolved_at),
    resolverNote: asNullableString(row.resolver_note),
  }
}

function toIncidentItem(row: Row): SentinelIncident {
  return {
    id: asString(row.id, ""),
    sourceEventId: asNullableString(row.source_event_id),
    title: asString(row.title, "Untitled incident"),
    summary: asNullableString(row.summary),
    severity: normalizeIncidentSeverity(row.severity),
    status: normalizeIncidentStatus(row.status),
    detectedAt: asString(row.detected_at, new Date().toISOString()),
    containmentStartedAt: asNullableString(row.containment_started_at),
    containedAt: asNullableString(row.contained_at),
    resolvedAt: asNullableString(row.resolved_at),
    impactedRoutes: parseStringArray(row.impacted_routes),
    impactedFeatures: parseStringArray(row.impacted_features),
    impactedUsersEstimate: asNullableInteger(row.impacted_users_estimate),
    estimatedRevenueImpactUsd: asNullableNumber(row.estimated_revenue_impact_usd),
    blastRadius: asNullableString(row.blast_radius),
    tags: parseStringArray(row.tags),
    createdAt: asString(row.created_at, new Date().toISOString()),
    updatedAt: asString(row.updated_at, new Date().toISOString()),
  }
}

function deriveThreats(
  events: SentinelActivityEvent[],
  dismissedByThreatId?: Map<string, string | null>,
): ThreatSignature[] {
  const hitsById = new Map<string, { hitCount: number; lastSeenAt: string | null }>()

  for (const event of events) {
    for (const match of event.injectionMatches) {
      const signature = SENTINEL_THREAT_SIGNATURES.find(
        (entry) => match.includes(entry.id) || match.includes(entry.pattern.source),
      )
      if (!signature) continue
      const current = hitsById.get(signature.id) || { hitCount: 0, lastSeenAt: null }
      hitsById.set(signature.id, {
        hitCount: current.hitCount + 1,
        lastSeenAt: current.lastSeenAt || event.createdAt,
      })
    }
  }

  return SENTINEL_THREAT_SIGNATURES.map((signature) => ({
    id: signature.id,
    name: signature.name,
    patternSource: signature.pattern.source,
    hitCount: hitsById.get(signature.id)?.hitCount || 0,
    lastSeenAt: hitsById.get(signature.id)?.lastSeenAt || null,
    severity: signature.severity,
    category: signature.category,
    dismissed: (dismissedByThreatId?.has(signature.id) ?? false),
    dismissedAt: dismissedByThreatId?.get(signature.id) || null,
  }))
}

function emptyThreatCategoryCounts(): SentinelThreatCategoryCounts {
  return {
    instruction_override: 0,
    policy_bypass: 0,
    prompt_exfiltration: 0,
    credential_exfiltration: 0,
    role_impersonation: 0,
    ssrf: 0,
    shell_injection: 0,
    encoded_payload: 0,
    obfuscation: 0,
    other: 0,
  }
}

function buildThreatCategoryCounts(events: SentinelActivityEvent[]): SentinelThreatCategoryCounts {
  const counts = emptyThreatCategoryCounts()

  for (const event of events) {
    for (const match of event.injectionMatches) {
      const signature = SENTINEL_THREAT_SIGNATURES.find(
        (entry) => match.includes(entry.id) || match.includes(entry.pattern.source),
      )
      if (!signature) {
        counts.other += 1
        continue
      }
      counts[signature.category] += 1
    }
  }

  return counts
}

function buildSnapshotStats(events: SentinelActivityEvent[]): SentinelSnapshot["stats"] {
  const totalEvents = events.length
  const blockedCount = events.filter((item) => item.status === "blocked").length
  const vetoedCount = events.filter((item) => item.status === "vetoed" || item.vetoed).length
  const injectionCount = events.filter((item) => item.injectionMatches.length > 0).length
  const credentialAccessCount = events.filter((item) => item.credentialAccessDetected).length
  const highRiskCount = events.filter((item) => item.riskScore >= 60).length
  const criticalRiskCount = events.filter(
    (item) => item.riskScore >= 80 || item.riskLevel === "critical",
  ).length
  const vetoRatePercent =
    totalEvents > 0 ? Math.round((vetoedCount / totalEvents) * 1000) / 10 : 0

  return {
    totalEvents,
    blockedCount,
    vetoedCount,
    injectionCount,
    credentialAccessCount,
    highRiskCount,
    criticalRiskCount,
    vetoRatePercent,
    threatCategoryCounts: buildThreatCategoryCounts(events),
  }
}

function createEmptySnapshot(): SentinelSnapshot {
  const config = getVetoGateConfig()
  const emptyEvents: SentinelActivityEvent[] = []
  const emptyApprovals: SentinelApprovalItem[] = []
  const emptyIncidents: SentinelIncident[] = []
  return {
    source: "supabase",
    mode: config.mode,
    policy: {
      mode: config.mode,
      vetoEnabled: config.enabled,
      vetoThreshold: config.vetoThreshold,
      alertThreshold: config.alertThreshold,
    },
    events: emptyEvents,
    approvals: emptyApprovals,
    threats: deriveThreats(emptyEvents),
    kpis: buildResilienceKpis(emptyEvents, emptyApprovals, emptyIncidents),
    anomalies: [],
    incidents: emptyIncidents,
    stats: buildSnapshotStats(emptyEvents),
  }
}

async function resolveSentinelSnapshotForOwnerWithClient(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<SentinelSnapshot> {
  try {
    const { data: eventRows, error: eventsError } = await client
      .from(AUDIT_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(300)

    if (eventsError) {
      return createEmptySnapshot()
    }

    const { data: approvalRows } = await client
      .from(APPROVALS_TABLE)
      .select("*")
      .eq("owner_user_id", ownerUserId)
      .order("requested_at", { ascending: false })
      .limit(120)

    const { data: dismissalRows } = await client
      .from(THREAT_DISMISSALS_TABLE)
      .select("threat_id, dismissed_at")
      .eq("owner_user_id", ownerUserId)
      .order("dismissed_at", { ascending: false })
      .limit(120)

    let incidentRows: Row[] = []
    try {
      const incidentsResponse = await client
        .from(INCIDENTS_TABLE)
        .select("*")
        .eq("owner_user_id", ownerUserId)
        .order("detected_at", { ascending: false })
        .limit(120)
      if (!incidentsResponse.error) {
        incidentRows = (incidentsResponse.data || []) as Row[]
      } else if (!isMissingRelationError(incidentsResponse.error as SupabaseErrorLike)) {
        incidentRows = []
      }
    } catch {
      incidentRows = []
    }

    const events = ((eventRows || []) as Row[]).map(toActivityEvent)
    const approvals = ((approvalRows || []) as Row[]).map(toApprovalItem)
    const incidents = incidentRows.map(toIncidentItem)

    const dismissedByThreatId = new Map<string, string | null>()
    for (const row of (dismissalRows || []) as Row[]) {
      const threatId = asString(row.threat_id, "").trim()
      if (!threatId) {
        continue
      }
      dismissedByThreatId.set(threatId, asNullableString(row.dismissed_at))
    }

    const threats = deriveThreats(events, dismissedByThreatId)
    const config = getVetoGateConfig()

    return {
      source: "supabase",
      mode: config.mode,
      policy: {
        mode: config.mode,
        vetoEnabled: config.enabled,
        vetoThreshold: config.vetoThreshold,
        alertThreshold: config.alertThreshold,
      },
      events,
      approvals,
      threats,
      kpis: buildResilienceKpis(events, approvals, incidents),
      anomalies: buildAnomalyAlerts(events, incidents),
      incidents,
      stats: buildSnapshotStats(events),
    }
  } catch {
    return createEmptySnapshot()
  }
}

export async function resolveManifestParentHashForExecution(input: {
  ownerUserId?: string
  sessionId?: string | null
}): Promise<string | null> {
  const client = getSupabaseServerClient()
  if (!client) {
    return null
  }

  const sessionId = input.sessionId?.trim() || null
  const ownerUserId = input.ownerUserId?.trim() || null

  if (!sessionId && !ownerUserId) {
    return null
  }

  try {
    let query = client
      .from(AUDIT_TABLE)
      .select("manifest_hash, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .not("manifest_hash", "is", null)

    if (sessionId) {
      query = query.eq("session_id", sessionId)
    } else if (ownerUserId) {
      query = query.eq("owner_user_id", ownerUserId).is("session_id", null)
    }

    if (ownerUserId) {
      query = query.eq("owner_user_id", ownerUserId)
    }

    const { data, error } = await query
    if (error) {
      return null
    }

    const row = (data?.[0] || null) as Row | null
    return row ? asNullableString(row.manifest_hash) : null
  } catch {
    return null
  }
}

export async function createSentinelVetoApproval(input: {
  ownerUserId?: string
  sessionId?: string | null
  toolName: string
  transport: SentinelTransport
  actorId: string
  riskScore: number
  riskLevel: SentinelRiskLevel
  argPreview?: string
  manifestId?: string | null
  reason?: string
}): Promise<string | null> {
  const client = getSupabaseServerClient()
  if (!client) {
    return null
  }

  const now = new Date().toISOString()
  const argPreview = (input.argPreview || "").slice(0, 4000)
  const dedupeWindowMinutes = normalizeMinutes(APPROVAL_DEDUPE_WINDOW_MINUTES, 10)
  const dedupeStart = new Date(Date.now() - dedupeWindowMinutes * 60_000).toISOString()

  try {
    let dedupeQuery = client
      .from(APPROVALS_TABLE)
      .select("id, requested_at")
      .eq("status", "pending")
      .eq("tool_name", input.toolName)
      .eq("transport", input.transport)
      .eq("arg_preview", argPreview)
      .gte("requested_at", dedupeStart)
      .order("requested_at", { ascending: false })
      .limit(1)

    if (input.ownerUserId) {
      dedupeQuery = dedupeQuery.eq("owner_user_id", input.ownerUserId)
    } else {
      dedupeQuery = dedupeQuery.is("owner_user_id", null)
    }

    if (input.sessionId) {
      dedupeQuery = dedupeQuery.eq("session_id", input.sessionId)
    } else {
      dedupeQuery = dedupeQuery.is("session_id", null)
    }

    const dedupeResult = await dedupeQuery
    const dedupeRow = (dedupeResult.data?.[0] || null) as Row | null
    if (dedupeRow) {
      const approvalId = asNullableString(dedupeRow.id)
      if (approvalId) {
        return approvalId
      }
    }

    const insertResult = await client.from(APPROVALS_TABLE).insert({
      owner_user_id: input.ownerUserId || null,
      session_id: input.sessionId || null,
      tool_name: input.toolName,
      transport: input.transport,
      actor_id: input.actorId,
      risk_score: Math.max(0, Math.min(100, Math.floor(input.riskScore))),
      risk_level: input.riskLevel,
      arg_preview: argPreview,
      manifest_id: input.manifestId || null,
      status: "pending",
      resolver_note: input.reason ? String(input.reason).slice(0, 1000) : null,
      requested_at: now,
      created_at: now,
      updated_at: now,
    }).select("id").single()

    if (insertResult.error || !insertResult.data) {
      return null
    }
    return asNullableString((insertResult.data as Row).id)
  } catch {
    // best effort only
    return null
  }
}

export async function consumeSentinelVetoApprovalForExecution(input: {
  approvalId: string
  ownerUserId?: string
  toolName: string
  transport: SentinelTransport
  sessionId?: string | null
  argPreview?: string | null
}): Promise<
  | { ok: true; approvalId: string }
  | {
      ok: false
      code:
        | "approval_not_found"
        | "approval_pending"
        | "approval_rejected"
        | "approval_expired"
        | "approval_mismatch"
        | "approval_unavailable"
      error: string
    }
> {
  const client = getSupabaseServerClient()
  if (!client) {
    return {
      ok: false,
      code: "approval_unavailable",
      error: "Approval service is unavailable.",
    }
  }

  const approvalId = input.approvalId.trim()
  if (!approvalId) {
    return {
      ok: false,
      code: "approval_not_found",
      error: "Approval ID is required.",
    }
  }

  let row: Row | null = null
  try {
    const { data, error } = await client
      .from(APPROVALS_TABLE)
      .select("*")
      .eq("id", approvalId)
      .limit(1)
      .maybeSingle()
    if (error) {
      return {
        ok: false,
        code: "approval_unavailable",
        error: "Failed to validate approval.",
      }
    }
    row = (data || null) as Row | null
  } catch {
    return {
      ok: false,
      code: "approval_unavailable",
      error: "Failed to validate approval.",
    }
  }

  if (!row) {
    return {
      ok: false,
      code: "approval_not_found",
      error: "Approval request not found.",
    }
  }

  const ownerUserId = asNullableString(row.owner_user_id)
  if ((input.ownerUserId || "").trim() && ownerUserId !== input.ownerUserId) {
    return {
      ok: false,
      code: "approval_mismatch",
      error: "Approval does not match the authenticated owner.",
    }
  }

  const expectedToolName = input.toolName.trim().toLowerCase()
  const approvalToolName = asString(row.tool_name, "").trim().toLowerCase()
  if (!expectedToolName || !approvalToolName || approvalToolName !== expectedToolName) {
    return {
      ok: false,
      code: "approval_mismatch",
      error: "Approval does not match the requested tool.",
    }
  }

  const approvalTransport = normalizeTransport(row.transport)
  if (approvalTransport !== input.transport) {
    return {
      ok: false,
      code: "approval_mismatch",
      error: "Approval transport mismatch.",
    }
  }

  const approvalSessionId = asNullableString(row.session_id)
  const requestedSessionId = asNullableString(input.sessionId)
  if (approvalSessionId && approvalSessionId !== requestedSessionId) {
    return {
      ok: false,
      code: "approval_mismatch",
      error: "Approval session mismatch.",
    }
  }

  const approvalArgPreview = asNullableString(row.arg_preview)
  const requestedArgPreview = asNullableString(input.argPreview)
  if (approvalArgPreview && approvalArgPreview !== requestedArgPreview) {
    return {
      ok: false,
      code: "approval_mismatch",
      error: "Approval arguments do not match this execution request.",
    }
  }

  const status = normalizeApprovalStatus(row.status)
  if (status === "pending") {
    return {
      ok: false,
      code: "approval_pending",
      error: "Approval is still pending human review.",
    }
  }
  if (status === "rejected") {
    return {
      ok: false,
      code: "approval_rejected",
      error: "Approval was rejected.",
    }
  }
  if (status === "expired") {
    return {
      ok: false,
      code: "approval_expired",
      error: "Approval is expired.",
    }
  }

  const executionWindowMinutes = normalizeMinutes(APPROVAL_EXECUTION_WINDOW_MINUTES, 120)
  const approvedAt = asNullableString(row.resolved_at) || asNullableString(row.requested_at)
  const approvedAtMs = toEpochMs(approvedAt)
  const isFresh =
    approvedAtMs !== null && Date.now() - approvedAtMs <= executionWindowMinutes * 60_000
  if (!isFresh) {
    try {
      await client
        .from(APPROVALS_TABLE)
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", approvalId)
        .eq("status", "approved")
    } catch {
      // best effort only
    }
    return {
      ok: false,
      code: "approval_expired",
      error: "Approval is older than the allowed execution window.",
    }
  }

  try {
    const now = new Date().toISOString()
    const currentNote = asNullableString(row.resolver_note)
    const executionNote = `consumed_for_execution:${now}`
    const combinedNote = currentNote
      ? `${currentNote} | ${executionNote}`.slice(0, 1000)
      : executionNote

    const consumed = await client
      .from(APPROVALS_TABLE)
      .update({
        status: "expired",
        updated_at: now,
        resolver_note: combinedNote,
      })
      .eq("id", approvalId)
      .eq("status", "approved")
      .select("id")
      .maybeSingle()

    if (consumed.error) {
      return {
        ok: false,
        code: "approval_unavailable",
        error: "Failed to consume approval for execution.",
      }
    }
    if (!consumed.data) {
      return {
        ok: false,
        code: "approval_expired",
        error: "Approval has already been consumed.",
      }
    }

    return {
      ok: true,
      approvalId: asString((consumed.data as Row).id, approvalId),
    }
  } catch {
    return {
      ok: false,
      code: "approval_unavailable",
      error: "Failed to consume approval for execution.",
    }
  }
}

export async function resolveSentinelSnapshotForOwner(input: {
  accessToken: string
  ownerUserId: string
}): Promise<SentinelSnapshot> {
  const userClient = createUserScopedClient(input.accessToken)
  if (!userClient) {
    return createEmptySnapshot()
  }

  return resolveSentinelSnapshotForOwnerWithClient(userClient, input.ownerUserId)
}

function normalizeActiveOwnerLookbackHours(value: number | undefined): number {
  if (!Number.isFinite(value) || (value || 0) <= 0) {
    return 24
  }
  return Math.min(Math.max(Math.floor(value as number), 1), 168)
}

function normalizeActiveOwnerLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || (value || 0) <= 0) {
    return 100
  }
  return Math.min(Math.max(Math.floor(value as number), 1), 500)
}

export async function listSentinelActiveOwnerIds(input?: {
  lookbackHours?: number
  maxOwners?: number
}): Promise<string[]> {
  const client = getSupabaseServerClient()
  if (!client) {
    return []
  }

  const lookbackHours = normalizeActiveOwnerLookbackHours(input?.lookbackHours)
  const maxOwners = normalizeActiveOwnerLimit(input?.maxOwners)
  const lookbackStart = new Date(Date.now() - lookbackHours * 60 * 60_000).toISOString()
  const scanLimit = Math.min(maxOwners * 20, 5_000)

  try {
    const { data, error } = await client
      .from(AUDIT_TABLE)
      .select("owner_user_id,created_at")
      .not("owner_user_id", "is", null)
      .gte("created_at", lookbackStart)
      .order("created_at", { ascending: false })
      .limit(scanLimit)

    if (error) {
      return []
    }

    const uniqueOwnerIds: string[] = []
    const seen = new Set<string>()
    for (const row of (data || []) as Row[]) {
      const ownerUserId = asNullableString(row.owner_user_id)
      if (!ownerUserId || seen.has(ownerUserId)) {
        continue
      }
      seen.add(ownerUserId)
      uniqueOwnerIds.push(ownerUserId)
      if (uniqueOwnerIds.length >= maxOwners) {
        break
      }
    }

    return uniqueOwnerIds
  } catch {
    return []
  }
}

export async function resolveSentinelSnapshotForOwnerService(input: {
  ownerUserId: string
}): Promise<SentinelSnapshot> {
  const client = getSupabaseServerClient()
  if (!client) {
    return createEmptySnapshot()
  }
  return resolveSentinelSnapshotForOwnerWithClient(client, input.ownerUserId)
}

export async function dismissSentinelThreatForOwner(input: {
  accessToken: string
  ownerUserId: string
  threatId: string
}): Promise<boolean> {
  const userClient = createUserScopedClient(input.accessToken)
  if (!userClient) {
    return false
  }

  const threatId = input.threatId.trim()
  if (!threatId) {
    return false
  }

  try {
    const now = new Date().toISOString()
    const { error } = await userClient.from(THREAT_DISMISSALS_TABLE).upsert(
      {
        owner_user_id: input.ownerUserId,
        threat_id: threatId,
        dismissed_at: now,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "owner_user_id,threat_id" },
    )
    return !error
  } catch {
    return false
  }
}

export async function resolveSentinelVetoDecision(input: {
  accessToken: string
  ownerUserId: string
  approvalId: string
  decision: "approved" | "rejected"
  resolverNote?: string
}): Promise<boolean> {
  const userClient = createUserScopedClient(input.accessToken)
  if (!userClient) {
    return false
  }

  try {
    const now = new Date().toISOString()
    const { error } = await userClient
      .from(APPROVALS_TABLE)
      .update({
        status: input.decision,
        resolved_at: now,
        updated_at: now,
        resolver_note: input.resolverNote?.slice(0, 1000) || null,
      })
      .eq("id", input.approvalId)
      .eq("owner_user_id", input.ownerUserId)
      .eq("status", "pending")

    return !error
  } catch {
    return false
  }
}

export async function createSentinelIncidentForOwner(input: {
  accessToken: string
  ownerUserId: string
  incident: {
    title: string
    summary?: string
    severity: SentinelIncidentSeverity
    sourceEventId?: string
    impactedRoutes?: string[]
    impactedFeatures?: string[]
    impactedUsersEstimate?: number
    estimatedRevenueImpactUsd?: number
    blastRadius?: string
    tags?: string[]
    detectedAt?: string
    containmentStartedAt?: string
    containedAt?: string
    resolvedAt?: string
  }
}): Promise<SentinelIncident | null> {
  const userClient = createUserScopedClient(input.accessToken)
  if (!userClient) {
    return null
  }

  const now = new Date().toISOString()
  const title = input.incident.title.trim().slice(0, 160)
  if (!title) {
    return null
  }

  const payload = {
    owner_user_id: input.ownerUserId,
    source_event_id: asNullableString(input.incident.sourceEventId),
    title,
    summary: asNullableString(input.incident.summary)?.slice(0, 3000) || null,
    severity: normalizeIncidentSeverity(input.incident.severity),
    status: "open" as SentinelIncidentStatus,
    detected_at: normalizeIsoDate(input.incident.detectedAt) || now,
    containment_started_at: normalizeIsoDate(input.incident.containmentStartedAt),
    contained_at: normalizeIsoDate(input.incident.containedAt),
    resolved_at: normalizeIsoDate(input.incident.resolvedAt),
    impacted_routes: sanitizeSmallStringArray(input.incident.impactedRoutes, 40, 200),
    impacted_features: sanitizeSmallStringArray(input.incident.impactedFeatures, 40, 200),
    impacted_users_estimate:
      typeof input.incident.impactedUsersEstimate === "number"
        ? Math.max(0, Math.floor(input.incident.impactedUsersEstimate))
        : null,
    estimated_revenue_impact_usd:
      typeof input.incident.estimatedRevenueImpactUsd === "number"
        ? Math.max(0, input.incident.estimatedRevenueImpactUsd)
        : null,
    blast_radius: asNullableString(input.incident.blastRadius)?.slice(0, 500) || null,
    tags: sanitizeSmallStringArray(input.incident.tags, 40, 80),
    created_at: now,
    updated_at: now,
  }

  try {
    const { data, error } = await userClient
      .from(INCIDENTS_TABLE)
      .insert(payload)
      .select("*")
      .single()
    if (error || !data) {
      return null
    }
    return toIncidentItem(data as Row)
  } catch {
    return null
  }
}

export async function updateSentinelIncidentForOwner(input: {
  accessToken: string
  ownerUserId: string
  incidentId: string
  patch: {
    status?: SentinelIncidentStatus
    title?: string
    summary?: string
    severity?: SentinelIncidentSeverity
    impactedRoutes?: string[]
    impactedFeatures?: string[]
    impactedUsersEstimate?: number
    estimatedRevenueImpactUsd?: number
    blastRadius?: string
    tags?: string[]
    detectedAt?: string
    containmentStartedAt?: string
    containedAt?: string
    resolvedAt?: string
  }
}): Promise<SentinelIncident | null> {
  const userClient = createUserScopedClient(input.accessToken)
  if (!userClient) {
    return null
  }

  const incidentId = input.incidentId.trim()
  if (!incidentId) {
    return null
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (typeof input.patch.status === "string") {
    updatePayload.status = normalizeIncidentStatus(input.patch.status)
  }
  if (typeof input.patch.title === "string") {
    updatePayload.title = input.patch.title.trim().slice(0, 160)
  }
  if (typeof input.patch.summary === "string") {
    updatePayload.summary = asNullableString(input.patch.summary)?.slice(0, 3000) || null
  }
  if (typeof input.patch.severity === "string") {
    updatePayload.severity = normalizeIncidentSeverity(input.patch.severity)
  }
  if (Array.isArray(input.patch.impactedRoutes)) {
    updatePayload.impacted_routes = sanitizeSmallStringArray(input.patch.impactedRoutes, 40, 200)
  }
  if (Array.isArray(input.patch.impactedFeatures)) {
    updatePayload.impacted_features = sanitizeSmallStringArray(input.patch.impactedFeatures, 40, 200)
  }
  if (typeof input.patch.impactedUsersEstimate === "number") {
    updatePayload.impacted_users_estimate = Math.max(0, Math.floor(input.patch.impactedUsersEstimate))
  }
  if (typeof input.patch.estimatedRevenueImpactUsd === "number") {
    updatePayload.estimated_revenue_impact_usd = Math.max(0, input.patch.estimatedRevenueImpactUsd)
  }
  if (typeof input.patch.blastRadius === "string") {
    updatePayload.blast_radius = asNullableString(input.patch.blastRadius)?.slice(0, 500) || null
  }
  if (Array.isArray(input.patch.tags)) {
    updatePayload.tags = sanitizeSmallStringArray(input.patch.tags, 40, 80)
  }

  if (typeof input.patch.detectedAt === "string") {
    updatePayload.detected_at = normalizeIsoDate(input.patch.detectedAt)
  }
  if (typeof input.patch.containmentStartedAt === "string") {
    updatePayload.containment_started_at = normalizeIsoDate(input.patch.containmentStartedAt)
  }
  if (typeof input.patch.containedAt === "string") {
    updatePayload.contained_at = normalizeIsoDate(input.patch.containedAt)
  }
  if (typeof input.patch.resolvedAt === "string") {
    updatePayload.resolved_at = normalizeIsoDate(input.patch.resolvedAt)
  }

  if (input.patch.status === "contained" && !updatePayload.contained_at) {
    updatePayload.contained_at = new Date().toISOString()
  }
  if (input.patch.status === "resolved" && !updatePayload.resolved_at) {
    updatePayload.resolved_at = new Date().toISOString()
  }

  try {
    const { data, error } = await userClient
      .from(INCIDENTS_TABLE)
      .update(updatePayload)
      .eq("id", incidentId)
      .eq("owner_user_id", input.ownerUserId)
      .select("*")
      .single()
    if (error || !data) {
      return null
    }
    return toIncidentItem(data as Row)
  } catch {
    return null
  }
}
