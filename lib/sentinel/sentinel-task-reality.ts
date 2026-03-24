export type TaskRealityVerificationState = "not_required" | "pending" | "passed" | "failed"

export type TaskRealityEvent = {
  verificationRequired: boolean
  verificationState: TaskRealityVerificationState
  verificationDueAt: string | null
}

export type TaskRealityMetrics = {
  criticalVerificationRequired: number
  criticalVerificationPassed: number
  criticalVerificationFailed: number
  criticalVerificationPending: number
  criticalVerificationMissed: number
  taskRealityMismatchCount: number
  taskRealityPassRatePercent: number | null
}

function toEpochMs(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

export function computeTaskRealityMetrics(
  events: TaskRealityEvent[],
  nowMs: number = Date.now(),
): TaskRealityMetrics {
  const verificationEvents = events.filter((event) => event.verificationRequired)
  let criticalVerificationPassed = 0
  let criticalVerificationFailed = 0
  let criticalVerificationPending = 0
  let criticalVerificationMissed = 0

  for (const event of verificationEvents) {
    if (event.verificationState === "passed") {
      criticalVerificationPassed += 1
      continue
    }
    if (event.verificationState === "failed") {
      criticalVerificationFailed += 1
      continue
    }
    if (event.verificationState === "pending") {
      criticalVerificationPending += 1
      const dueAtMs = toEpochMs(event.verificationDueAt)
      if (dueAtMs !== null && dueAtMs < nowMs) {
        criticalVerificationMissed += 1
      }
    }
  }

  const criticalVerificationRequired = verificationEvents.length
  const taskRealityMismatchCount = criticalVerificationFailed + criticalVerificationMissed
  const taskRealityPassRatePercent =
    criticalVerificationRequired > 0
      ? Math.round((criticalVerificationPassed / criticalVerificationRequired) * 1000) / 10
      : null

  return {
    criticalVerificationRequired,
    criticalVerificationPassed,
    criticalVerificationFailed,
    criticalVerificationPending,
    criticalVerificationMissed,
    taskRealityMismatchCount,
    taskRealityPassRatePercent,
  }
}
