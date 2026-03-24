/**
 * @vitest-environment jsdom
 * Regression: SentinelPanel option 3 — Guard Diagnostics allowlist, Recent alerts mini-panel.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { SentinelPanel } from "@/components/sentinel-panel"

const mockResolveSupabaseAccessToken = vi.fn((): string | null => null)
vi.mock("@/lib/supabase/supabase-client-auth", () => ({
  resolveSupabaseAccessToken: (): string | null => mockResolveSupabaseAccessToken(),
}))

const minimalSnapshot = {
  source: "supabase" as const,
  mode: "shadow" as const,
  policy: { mode: "shadow" as const, vetoEnabled: true, vetoThreshold: 70, alertThreshold: 50 },
  events: [],
  approvals: [],
  threats: [],
  kpis: {
    observationWindowHours: 24,
    sessionsObserved: 0,
    sessionsWithDetection: 0,
    sessionsWithContainment: 0,
    mttdMinutes: null as number | null,
    mttcMinutes: null as number | null,
    meanApprovalResolutionMinutes: null as number | null,
    unresolvedHighRiskEvents: 0,
    openIncidents: 0,
    criticalVerificationRequired: 0,
    criticalVerificationPassed: 0,
    criticalVerificationFailed: 0,
    criticalVerificationPending: 0,
    criticalVerificationMissed: 0,
    taskRealityMismatchCount: 0,
    taskRealityPassRatePercent: null as number | null,
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
}

const sentinelPayload = (recentAlertDispatches: unknown[] = []) => ({
  ok: true,
  data: minimalSnapshot,
  recentAlertDispatches,
})

describe("SentinelPanel regression (option 3)", () => {
  it("renders without throwing and shows SENTINEL and Guard Diagnostics", async () => {
    mockResolveSupabaseAccessToken.mockReturnValue("mock-token")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sentinelPayload()),
      }),
    )

    render(<SentinelPanel />)

    expect(
      await screen.findByText(/SENTINEL Security Control Plane/i, {}, { timeout: 15000 }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: /Guard Diagnostics/i }, { timeout: 15000 }),
    ).toBeInTheDocument()
  }, 15000)

  it("shows Recent alerts mini-panel when recentAlertDispatches has rows", async () => {
    mockResolveSupabaseAccessToken.mockReturnValue("mock-token")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            sentinelPayload([
              {
                alertKey: "kpi-task-reality-mismatch",
                alertType: "kpi",
                lastStatus: "sent",
                lastSentAt: "2025-03-01T12:00:00Z",
                lastAttemptAt: "2025-03-01T12:00:00Z",
                lastError: null,
                updatedAt: "2025-03-01T12:00:00Z",
              },
            ]),
          ),
      }),
    )

    render(<SentinelPanel />)

    await waitFor(() => {
      expect(screen.getByText(/Recent alerts/i)).toBeInTheDocument()
      expect(screen.getByText(/kpi-task-reality-mismatch/i)).toBeInTheDocument()
    }, { timeout: 15000 })
  }, 15000)
})
