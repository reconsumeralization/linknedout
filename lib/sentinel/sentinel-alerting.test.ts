import { afterEach, describe, expect, it, vi } from "vitest"

import {
  evaluateSentinelKpiAlerts,
  getRecentAlertDispatchesForOwner,
  resolveSentinelAlertingConfig,
} from "@/lib/sentinel/sentinel-alerting"
import type { SentinelSnapshot } from "@/lib/sentinel/sentinel-types"

const ORIGINAL_ENV = { ...process.env }

function createSnapshot(overrides?: Partial<SentinelSnapshot>): SentinelSnapshot {
  return {
    source: "supabase",
    mode: "shadow",
    policy: {
      mode: "shadow",
      vetoEnabled: true,
      vetoThreshold: 70,
      alertThreshold: 50,
    },
    events: [],
    approvals: [],
    threats: [],
    kpis: {
      observationWindowHours: 24,
      sessionsObserved: 10,
      sessionsWithDetection: 2,
      sessionsWithContainment: 1,
      mttdMinutes: 1.2,
      mttcMinutes: 2.3,
      meanApprovalResolutionMinutes: 3.4,
      unresolvedHighRiskEvents: 0,
      openIncidents: 0,
      criticalVerificationRequired: 3,
      criticalVerificationPassed: 3,
      criticalVerificationFailed: 0,
      criticalVerificationPending: 0,
      criticalVerificationMissed: 0,
      taskRealityMismatchCount: 0,
      taskRealityPassRatePercent: 100,
    },
    anomalies: [],
    incidents: [],
    stats: {
      totalEvents: 0,
      blockedCount: 0,
      vetoedCount: 0,
      injectionCount: 0,
      credentialAccessCount: 0,
      highRiskCount: 0,
      criticalRiskCount: 0,
      vetoRatePercent: 0,
      threatCategoryCounts: {
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
      },
    },
    ...overrides,
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("evaluateSentinelKpiAlerts", () => {
  it("returns no alerts when KPIs are below all thresholds", () => {
    const snapshot = createSnapshot()
    const alerts = evaluateSentinelKpiAlerts(snapshot)
    expect(alerts).toHaveLength(0)
  })

  it("returns alerts for threshold breaches", () => {
    const snapshot = createSnapshot({
      kpis: {
        ...createSnapshot().kpis,
        taskRealityMismatchCount: 1,
        criticalVerificationMissed: 2,
        unresolvedHighRiskEvents: 5,
        openIncidents: 3,
      },
      anomalies: [
        {
          id: "anomaly-1",
          category: "tool_abuse",
          severity: "high",
          title: "Spike",
          description: "blocked spike",
          metricValue: 8,
          threshold: 4,
          windowMinutes: 15,
          lastObservedAt: new Date().toISOString(),
          recommendedAction: "triage",
        },
      ],
    })

    const keys = evaluateSentinelKpiAlerts(snapshot).map((item) => item.key).sort()
    expect(keys).toEqual([
      "kpi-critical-verification-missed",
      "kpi-high-severity-anomaly",
      "kpi-open-incidents",
      "kpi-task-reality-mismatch",
      "kpi-unresolved-high-risk-events",
    ])
  })
})

describe("resolveSentinelAlertingConfig", () => {
  it("uses secure defaults when env is missing", () => {
    delete process.env.SENTINEL_ALERT_WEBHOOK_ENABLED
    delete process.env.SENTINEL_ALERT_WEBHOOK_URL

    const config = resolveSentinelAlertingConfig()
    expect(config.enabled).toBe(false)
    expect(config.webhookConfigured).toBe(false)
    expect(config.cooldownSeconds).toBe(900)
    expect(config.mismatchThreshold).toBe(1)
  })

  it("parses threshold overrides from env", () => {
    process.env.SENTINEL_ALERT_WEBHOOK_ENABLED = "true"
    process.env.SENTINEL_ALERT_WEBHOOK_URL = "https://alerts.example.com/sentinel"
    process.env.SENTINEL_ALERT_WEBHOOK_COOLDOWN_SECONDS = "1200"
    process.env.SENTINEL_ALERT_KPI_TASK_REALITY_MISMATCH_THRESHOLD = "3"
    process.env.SENTINEL_ALERT_KPI_UNRESOLVED_HIGH_RISK_EVENTS_THRESHOLD = "8"

    const config = resolveSentinelAlertingConfig()
    expect(config.enabled).toBe(true)
    expect(config.webhookConfigured).toBe(true)
    expect(config.cooldownSeconds).toBe(1200)
    expect(config.mismatchThreshold).toBe(3)
    expect(config.unresolvedHighRiskThreshold).toBe(8)
  })
})

describe("getRecentAlertDispatchesForOwner", () => {
  it("returns empty array when Supabase client is null (e.g. unconfigured)", async () => {
    const result = await getRecentAlertDispatchesForOwner("user-1")
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([])
  })

  it("returns array of RecentAlertDispatchRow shape (contract for GET /api/sentinel)", async () => {
    const result = await getRecentAlertDispatchesForOwner("user-1", 5)
    expect(Array.isArray(result)).toBe(true)
    result.forEach((row) => {
      expect(row).toHaveProperty("alertKey", expect.any(String))
      expect(row).toHaveProperty("alertType", expect.any(String))
      expect(row).toHaveProperty("lastStatus", expect.any(String))
      expect(row).toHaveProperty("lastSentAt")
      expect(row).toHaveProperty("lastAttemptAt")
      expect(row).toHaveProperty("lastError")
      expect(row).toHaveProperty("updatedAt")
    })
  })
})
