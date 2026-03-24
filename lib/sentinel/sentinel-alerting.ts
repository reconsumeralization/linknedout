import "server-only"

import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"
import type { SentinelAnomalyAlert, SentinelRiskLevel, SentinelSnapshot } from "@/lib/sentinel/sentinel-types"

type SupabaseErrorLike = { code?: string; message?: string } | null | undefined

export type SentinelKpiThresholdAlert = {
  key: string
  title: string
  description: string
  severity: SentinelRiskLevel
  metricValue: number
  threshold: number
}

export type SentinelAlertDispatchEntry = {
  key: string
  status: "dry_run" | "sent" | "skipped_cooldown" | "failed"
  reason: string
}

export type SentinelAlertDispatchSummary = {
  enabled: boolean
  configured: boolean
  dryRun: boolean
  triggeredCount: number
  sentCount: number
  skippedCooldownCount: number
  failedCount: number
  results: SentinelAlertDispatchEntry[]
}

const ALERT_DISPATCHES_TABLE =
  process.env.SENTINEL_ALERT_DISPATCHES_TABLE || "sentinel_alert_dispatches"

const DEFAULTS = {
  timeoutMs: 5_000,
  cooldownSeconds: 900,
  mismatchThreshold: 1,
  missedThreshold: 1,
  unresolvedHighRiskThreshold: 5,
  openIncidentsThreshold: 3,
  highSeverityAnomalyThreshold: 1,
} as const

const MIN_TIMEOUT_MS = 500
const MAX_TIMEOUT_MS = 60_000
const MIN_COOLDOWN_SECONDS = 30
const MAX_COOLDOWN_SECONDS = 86_400

const fallbackCooldownMsByKey = new Map<string, number>()

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (!value) {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1") {
    return true
  }
  if (normalized === "false" || normalized === "0") {
    return false
  }
  return null
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value || "").trim(), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(Math.max(Math.floor(value), min), max)
}

function isMissingRelationError(error: SupabaseErrorLike): boolean {
  if (!error) {
    return false
  }
  if (error.code === "42P01" || error.code === "42703") {
    return true
  }
  return Boolean(error.message && /does not exist|relation .* does not exist|column .* does not exist/i.test(error.message))
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500)
  }
  if (typeof error === "string") {
    return error.slice(0, 500)
  }
  return "unknown webhook error"
}

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function countHighSeverityAnomalies(anomalies: SentinelAnomalyAlert[]): number {
  return anomalies.filter((item) => item.severity === "high" || item.severity === "critical").length
}

function severityFromAnomalies(anomalies: SentinelAnomalyAlert[]): SentinelRiskLevel {
  if (anomalies.some((item) => item.severity === "critical")) {
    return "critical"
  }
  if (anomalies.some((item) => item.severity === "high")) {
    return "high"
  }
  return "medium"
}

function parseWebhookUrl(rawUrl: string | undefined): URL | null {
  const value = (rawUrl || "").trim()
  if (!value) {
    return null
  }
  try {
    const parsed = new URL(value)
    if (parsed.protocol === "https:") {
      return parsed
    }
    if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function resolveSentinelAlertingConfig() {
  const configuredEnabled = parseBooleanEnv(process.env.SENTINEL_ALERT_WEBHOOK_ENABLED)
  const enabled = configuredEnabled === true
  const webhookUrl = parseWebhookUrl(process.env.SENTINEL_ALERT_WEBHOOK_URL)
  const webhookConfigured = Boolean(webhookUrl)
  return {
    enabled,
    webhookConfigured,
    webhookUrl: webhookUrl?.toString() || null,
    webhookBearerToken: (process.env.SENTINEL_ALERT_WEBHOOK_BEARER_TOKEN || "").trim() || null,
    timeoutMs: clamp(
      parseIntEnv(process.env.SENTINEL_ALERT_WEBHOOK_TIMEOUT_MS, DEFAULTS.timeoutMs),
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
    cooldownSeconds: clamp(
      parseIntEnv(process.env.SENTINEL_ALERT_WEBHOOK_COOLDOWN_SECONDS, DEFAULTS.cooldownSeconds),
      MIN_COOLDOWN_SECONDS,
      MAX_COOLDOWN_SECONDS,
    ),
    mismatchThreshold: Math.max(
      1,
      parseIntEnv(
        process.env.SENTINEL_ALERT_KPI_TASK_REALITY_MISMATCH_THRESHOLD,
        DEFAULTS.mismatchThreshold,
      ),
    ),
    missedThreshold: Math.max(
      1,
      parseIntEnv(
        process.env.SENTINEL_ALERT_KPI_CRITICAL_VERIFICATION_MISSED_THRESHOLD,
        DEFAULTS.missedThreshold,
      ),
    ),
    unresolvedHighRiskThreshold: Math.max(
      1,
      parseIntEnv(
        process.env.SENTINEL_ALERT_KPI_UNRESOLVED_HIGH_RISK_EVENTS_THRESHOLD,
        DEFAULTS.unresolvedHighRiskThreshold,
      ),
    ),
    openIncidentsThreshold: Math.max(
      1,
      parseIntEnv(
        process.env.SENTINEL_ALERT_KPI_OPEN_INCIDENTS_THRESHOLD,
        DEFAULTS.openIncidentsThreshold,
      ),
    ),
    highSeverityAnomalyThreshold: Math.max(
      1,
      parseIntEnv(
        process.env.SENTINEL_ALERT_KPI_HIGH_SEVERITY_ANOMALY_THRESHOLD,
        DEFAULTS.highSeverityAnomalyThreshold,
      ),
    ),
  }
}

export function evaluateSentinelKpiAlerts(
  snapshot: SentinelSnapshot,
  config: ReturnType<typeof resolveSentinelAlertingConfig> = resolveSentinelAlertingConfig(),
): SentinelKpiThresholdAlert[] {
  const alerts: SentinelKpiThresholdAlert[] = []

  const mismatchCount = snapshot.kpis.taskRealityMismatchCount
  if (mismatchCount >= config.mismatchThreshold) {
    alerts.push({
      key: "kpi-task-reality-mismatch",
      title: "Task-vs-reality mismatches exceeded threshold",
      description: `${mismatchCount} mismatches detected (failed/missed verification obligations).`,
      severity: mismatchCount >= config.mismatchThreshold * 2 ? "critical" : "high",
      metricValue: mismatchCount,
      threshold: config.mismatchThreshold,
    })
  }

  const missedCount = snapshot.kpis.criticalVerificationMissed
  if (missedCount >= config.missedThreshold) {
    alerts.push({
      key: "kpi-critical-verification-missed",
      title: "Missed critical verifications exceeded threshold",
      description: `${missedCount} critical verification obligations missed verification window.`,
      severity: "critical",
      metricValue: missedCount,
      threshold: config.missedThreshold,
    })
  }

  const unresolvedHighRiskCount = snapshot.kpis.unresolvedHighRiskEvents
  if (unresolvedHighRiskCount >= config.unresolvedHighRiskThreshold) {
    alerts.push({
      key: "kpi-unresolved-high-risk-events",
      title: "Unresolved high-risk events exceeded threshold",
      description: `${unresolvedHighRiskCount} high-risk events are still unresolved in the KPI window.`,
      severity: unresolvedHighRiskCount >= config.unresolvedHighRiskThreshold * 2 ? "critical" : "high",
      metricValue: unresolvedHighRiskCount,
      threshold: config.unresolvedHighRiskThreshold,
    })
  }

  const openIncidentsCount = snapshot.kpis.openIncidents
  if (openIncidentsCount >= config.openIncidentsThreshold) {
    alerts.push({
      key: "kpi-open-incidents",
      title: "Open incidents exceeded threshold",
      description: `${openIncidentsCount} incidents remain open/investigating/contained.`,
      severity: openIncidentsCount >= config.openIncidentsThreshold * 2 ? "high" : "medium",
      metricValue: openIncidentsCount,
      threshold: config.openIncidentsThreshold,
    })
  }

  const highSeverityAnomalyCount = countHighSeverityAnomalies(snapshot.anomalies)
  if (highSeverityAnomalyCount >= config.highSeverityAnomalyThreshold) {
    alerts.push({
      key: "kpi-high-severity-anomaly",
      title: "High-severity anomalies exceeded threshold",
      description: `${highSeverityAnomalyCount} high/critical anomalies are active in the current snapshot.`,
      severity: severityFromAnomalies(snapshot.anomalies),
      metricValue: highSeverityAnomalyCount,
      threshold: config.highSeverityAnomalyThreshold,
    })
  }

  return alerts
}

async function checkDispatchCooldown(input: {
  ownerUserId: string
  alertKey: string
  cooldownSeconds: number
}): Promise<boolean> {
  const dedupeKey = `${input.ownerUserId}:${input.alertKey}`
  const client = getSupabaseServerClient()
  const nowMs = Date.now()
  const cooldownMs = input.cooldownSeconds * 1000

  if (!client) {
    const lastSentMs = fallbackCooldownMsByKey.get(dedupeKey) || 0
    return nowMs - lastSentMs >= cooldownMs
  }

  try {
    const { data, error } = await client
      .from(ALERT_DISPATCHES_TABLE)
      .select("last_sent_at")
      .eq("owner_user_id", input.ownerUserId)
      .eq("alert_key", input.alertKey)
      .maybeSingle()

    if (error) {
      if (isMissingRelationError(error as SupabaseErrorLike)) {
        const lastSentMs = fallbackCooldownMsByKey.get(dedupeKey) || 0
        return nowMs - lastSentMs >= cooldownMs
      }
      return false
    }

    const row = (data || null) as Record<string, unknown> | null
    const lastSentAt =
      row && typeof row.last_sent_at === "string" ? row.last_sent_at : null
    const lastSentMs = toEpochMs(lastSentAt)

    if (lastSentMs === null) {
      return true
    }

    return nowMs - lastSentMs >= cooldownMs
  } catch {
    return false
  }
}

async function recordDispatchAttempt(input: {
  ownerUserId: string
  alert: SentinelKpiThresholdAlert
  status: "sent" | "failed"
  payload: Record<string, unknown>
  errorMessage?: string | null
}): Promise<void> {
  const dedupeKey = `${input.ownerUserId}:${input.alert.key}`
  const nowIso = new Date().toISOString()
  if (input.status === "sent") {
    fallbackCooldownMsByKey.set(dedupeKey, Date.now())
  }

  const client = getSupabaseServerClient()
  if (!client) {
    return
  }

  try {
    const row: Record<string, unknown> = {
      owner_user_id: input.ownerUserId,
      alert_key: input.alert.key,
      alert_type: "kpi",
      last_status: input.status,
      last_attempt_at: nowIso,
      last_error: input.errorMessage ? input.errorMessage.slice(0, 1000) : null,
      last_payload: input.payload,
      updated_at: nowIso,
    }
    if (input.status === "sent") {
      row.last_sent_at = nowIso
    }

    const { error } = await client
      .from(ALERT_DISPATCHES_TABLE)
      .upsert(row, { onConflict: "owner_user_id,alert_key" })

    if (error && isMissingRelationError(error as SupabaseErrorLike)) {
      // Table is optional for backward compatibility; fall back to in-memory cooldown only.
      return
    }
  } catch {
    // Best effort only.
  }
}

async function sendAlertWebhook(input: {
  webhookUrl: string
  webhookBearerToken: string | null
  timeoutMs: number
  payload: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs)

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (input.webhookBearerToken) {
      headers.Authorization = `Bearer ${input.webhookBearerToken}`
    }

    const response = await fetch(input.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(input.payload),
      signal: controller.signal,
      cache: "no-store",
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      return {
        ok: false,
        error: `Webhook returned ${response.status}${text ? `: ${text.slice(0, 500)}` : ""}`,
      }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function dispatchSentinelKpiWebhookAlerts(input: {
  ownerUserId: string
  snapshot: SentinelSnapshot
  triggerSource: "api_get" | "cron"
  dryRun?: boolean
}): Promise<SentinelAlertDispatchSummary> {
  const config = resolveSentinelAlertingConfig()
  const alerts = evaluateSentinelKpiAlerts(input.snapshot, config)

  const summary: SentinelAlertDispatchSummary = {
    enabled: config.enabled,
    configured: config.webhookConfigured,
    dryRun: input.dryRun === true,
    triggeredCount: alerts.length,
    sentCount: 0,
    skippedCooldownCount: 0,
    failedCount: 0,
    results: [],
  }

  if (!config.enabled || !config.webhookConfigured || !config.webhookUrl) {
    return summary
  }

  for (const alert of alerts) {
    const canDispatch = await checkDispatchCooldown({
      ownerUserId: input.ownerUserId,
      alertKey: alert.key,
      cooldownSeconds: config.cooldownSeconds,
    })

    if (!canDispatch) {
      summary.skippedCooldownCount += 1
      summary.results.push({
        key: alert.key,
        status: "skipped_cooldown",
        reason: `Cooldown active (${config.cooldownSeconds}s).`,
      })
      continue
    }

    const payload = {
      source: "sentinel",
      schemaVersion: 1,
      eventType: "sentinel.kpi.alert",
      generatedAt: new Date().toISOString(),
      triggerSource: input.triggerSource,
      ownerUserId: input.ownerUserId,
      alert,
      mode: input.snapshot.mode,
      policy: input.snapshot.policy,
      kpis: input.snapshot.kpis,
      stats: input.snapshot.stats,
      anomalies: input.snapshot.anomalies
        .filter((item) => item.severity === "high" || item.severity === "critical")
        .slice(0, 10),
    } as Record<string, unknown>

    if (input.dryRun) {
      summary.results.push({
        key: alert.key,
        status: "dry_run",
        reason: "Dry run enabled.",
      })
      continue
    }

    const sendResult = await sendAlertWebhook({
      webhookUrl: config.webhookUrl,
      webhookBearerToken: config.webhookBearerToken,
      timeoutMs: config.timeoutMs,
      payload,
    })

    if (!sendResult.ok) {
      summary.failedCount += 1
      summary.results.push({
        key: alert.key,
        status: "failed",
        reason: sendResult.error,
      })
      await recordDispatchAttempt({
        ownerUserId: input.ownerUserId,
        alert,
        status: "failed",
        payload,
        errorMessage: sendResult.error,
      })
      continue
    }

    summary.sentCount += 1
    summary.results.push({
      key: alert.key,
      status: "sent",
      reason: "Webhook delivered.",
    })
    await recordDispatchAttempt({
      ownerUserId: input.ownerUserId,
      alert,
      status: "sent",
      payload,
      errorMessage: null,
    })
  }

  return summary
}

export type RecentAlertDispatchRow = {
  alertKey: string
  alertType: string
  lastStatus: string
  lastSentAt: string | null
  lastAttemptAt: string | null
  lastError: string | null
  updatedAt: string | null
}

const DEFAULT_RECENT_ALERTS_LIMIT = 20

/**
 * Fetch recent alert dispatch rows for the owner (from sentinel_alert_dispatches).
 * Ordered by updated_at desc. Used by GET /api/sentinel for the "Recent alerts" mini-panel.
 */
export async function getRecentAlertDispatchesForOwner(
  ownerUserId: string,
  limit: number = DEFAULT_RECENT_ALERTS_LIMIT,
): Promise<RecentAlertDispatchRow[]> {
  const client = getSupabaseServerClient()
  if (!client) {
    return []
  }

  try {
    const { data, error } = await client
      .from(ALERT_DISPATCHES_TABLE)
      .select("alert_key, alert_type, last_status, last_sent_at, last_attempt_at, last_error, updated_at")
      .eq("owner_user_id", ownerUserId)
      .order("updated_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)))

    if (error) {
      if (isMissingRelationError(error as SupabaseErrorLike)) {
        return []
      }
      return []
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    return rows.map((row) => ({
      alertKey: typeof row.alert_key === "string" ? row.alert_key : "",
      alertType: typeof row.alert_type === "string" ? row.alert_type : "kpi",
      lastStatus: typeof row.last_status === "string" ? row.last_status : "unknown",
      lastSentAt: typeof row.last_sent_at === "string" ? row.last_sent_at : null,
      lastAttemptAt: typeof row.last_attempt_at === "string" ? row.last_attempt_at : null,
      lastError: typeof row.last_error === "string" ? row.last_error : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    }))
  } catch {
    return []
  }
}
