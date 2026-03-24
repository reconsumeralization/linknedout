import "server-only"

import { getSupabaseServerClient } from "@/lib/supabase/supabase-server"

type Row = Record<string, unknown>
type VerificationState = "not_required" | "pending" | "passed" | "failed"

export type PendingVerificationRecord = {
  id: string
  toolName: string
  verificationTargetTool: string | null
  verificationSubject: string | null
  verificationState: VerificationState
  verificationDueAt: string | null
  createdAt: string
  isMissed: boolean
}

const AUDIT_TABLE = process.env.SUPABASE_MCP_AUDIT_TABLE || "mcp_tool_audit_events"

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

function normalizeVerificationState(value: unknown): VerificationState {
  const normalized = asString(value, "").trim().toLowerCase()
  if (
    normalized === "not_required" ||
    normalized === "pending" ||
    normalized === "passed" ||
    normalized === "failed"
  ) {
    return normalized
  }
  return "not_required"
}

function toEpochMs(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) {
    return false
  }
  if (error.code === "42703") {
    return true
  }
  return Boolean(error.message && /column .* does not exist/i.test(error.message))
}

export async function findPendingVerifications(input: {
  ownerUserId: string
  sessionId: string
}): Promise<PendingVerificationRecord[]> {
  const client = getSupabaseServerClient()
  if (!client) {
    return []
  }

  const ownerUserId = input.ownerUserId.trim()
  const sessionId = input.sessionId.trim()
  if (!ownerUserId || !sessionId) {
    return []
  }

  try {
    const { data, error } = await client
      .from(AUDIT_TABLE)
      .select(
        "id,tool_name,verification_target_tool,verification_subject,verification_state,verification_due_at,created_at",
      )
      .eq("owner_user_id", ownerUserId)
      .eq("session_id", sessionId)
      .eq("verification_required", true)
      .in("verification_state", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(100)

    if (error) {
      if (isMissingColumnError(error as { code?: string; message?: string })) {
        return []
      }
      return []
    }

    const rows = (data || []) as Row[]
    const now = Date.now()
    return rows.map((row) => {
      const verificationState = normalizeVerificationState(row.verification_state)
      const verificationDueAt = asNullableString(row.verification_due_at)
      const dueAtMs = toEpochMs(verificationDueAt)
      const isMissed =
        verificationState === "pending" && dueAtMs !== null && Number.isFinite(dueAtMs) && dueAtMs < now

      return {
        id: asString(row.id, ""),
        toolName: asString(row.tool_name, "unknown"),
        verificationTargetTool: asNullableString(row.verification_target_tool),
        verificationSubject: asNullableString(row.verification_subject),
        verificationState,
        verificationDueAt,
        createdAt: asString(row.created_at, new Date().toISOString()),
        isMissed,
      }
    })
  } catch {
    return []
  }
}

export async function markVerificationResult(input: {
  ownerUserId: string
  sessionId: string
  targetTool: string
  subject: string | null
  passed: boolean
  checkedAt?: string
}): Promise<{ ok: boolean; updatedCount: number }> {
  const client = getSupabaseServerClient()
  if (!client) {
    return { ok: false, updatedCount: 0 }
  }

  const ownerUserId = input.ownerUserId.trim()
  const sessionId = input.sessionId.trim()
  const targetTool = input.targetTool.trim()
  const checkedAt = input.checkedAt || new Date().toISOString()

  if (!ownerUserId || !sessionId || !targetTool) {
    return { ok: false, updatedCount: 0 }
  }

  try {
    const statesToUpdate: VerificationState[] = input.passed
      ? ["pending", "failed"]
      : ["pending"]

    let query = client
      .from(AUDIT_TABLE)
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("session_id", sessionId)
      .eq("verification_required", true)
      .in("verification_state", statesToUpdate)
      .eq("verification_target_tool", targetTool)
      .order("created_at", { ascending: false })
      .limit(100)

    if (input.subject) {
      query = query.eq("verification_subject", input.subject)
    }

    const { data, error } = await query
    if (error) {
      if (isMissingColumnError(error as { code?: string; message?: string })) {
        return { ok: true, updatedCount: 0 }
      }
      return { ok: false, updatedCount: 0 }
    }

    const rows = (data || []) as Row[]
    if (rows.length === 0) {
      return { ok: true, updatedCount: 0 }
    }

    const ids = rows.map((row) => asString(row.id, "")).filter(Boolean)
    if (ids.length === 0) {
      return { ok: true, updatedCount: 0 }
    }

    const verificationState: VerificationState = input.passed ? "passed" : "failed"
    const { error: updateError } = await client
      .from(AUDIT_TABLE)
      .update({
        verification_state: verificationState,
        verification_checked_at: checkedAt,
      })
      .in("id", ids)

    if (updateError) {
      if (isMissingColumnError(updateError as { code?: string; message?: string })) {
        return { ok: true, updatedCount: 0 }
      }
      return { ok: false, updatedCount: 0 }
    }

    return { ok: true, updatedCount: ids.length }
  } catch {
    return { ok: false, updatedCount: 0 }
  }
}
