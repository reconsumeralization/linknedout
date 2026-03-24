import { describe, expect, it } from "vitest"

import { computeTaskRealityMetrics } from "@/lib/sentinel/sentinel-task-reality"

describe("sentinel-task-reality metrics", () => {
  it("computes pass/fail/pending/missed and pass rate", () => {
    const now = Date.UTC(2026, 2, 3, 12, 0, 0)
    const metrics = computeTaskRealityMetrics(
      [
        {
          verificationRequired: true,
          verificationState: "passed",
          verificationDueAt: "2026-03-03T11:00:00.000Z",
        },
        {
          verificationRequired: true,
          verificationState: "failed",
          verificationDueAt: "2026-03-03T11:00:00.000Z",
        },
        {
          verificationRequired: true,
          verificationState: "pending",
          verificationDueAt: "2026-03-03T11:59:00.000Z",
        },
        {
          verificationRequired: true,
          verificationState: "pending",
          verificationDueAt: "2026-03-03T12:01:00.000Z",
        },
        {
          verificationRequired: false,
          verificationState: "not_required",
          verificationDueAt: null,
        },
      ],
      now,
    )

    expect(metrics.criticalVerificationRequired).toBe(4)
    expect(metrics.criticalVerificationPassed).toBe(1)
    expect(metrics.criticalVerificationFailed).toBe(1)
    expect(metrics.criticalVerificationPending).toBe(2)
    expect(metrics.criticalVerificationMissed).toBe(1)
    expect(metrics.taskRealityMismatchCount).toBe(2)
    expect(metrics.taskRealityPassRatePercent).toBe(25)
  })

  it("returns null pass rate when no verification obligations exist", () => {
    const metrics = computeTaskRealityMetrics([
      {
        verificationRequired: false,
        verificationState: "not_required",
        verificationDueAt: null,
      },
    ])

    expect(metrics.criticalVerificationRequired).toBe(0)
    expect(metrics.taskRealityPassRatePercent).toBeNull()
  })
})
