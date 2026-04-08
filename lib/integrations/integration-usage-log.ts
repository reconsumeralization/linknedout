import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

export type RecordIntegrationUsageInput = {
  userId: string
  provider: string
  toolName: string
  agentId?: string | null
  ok: boolean
  latencyMs: number
  errorMessage?: string | null
}

/** Service-role or admin client; `user_id` is set explicitly for RLS-safe auditing. */
export async function recordIntegrationUsage(
  sb: SupabaseClient,
  input: RecordIntegrationUsageInput,
  logLabel = "[integration_usage_log]",
): Promise<void> {
  const errMsg = input.ok ? null : String(input.errorMessage ?? "error").slice(0, 4000)
  const { error } = await sb.from("integration_usage_log").insert({
    user_id: input.userId,
    provider: input.provider,
    tool_name: input.toolName,
    agent_id: input.agentId ?? null,
    status: input.ok ? "success" : "error",
    latency_ms: input.latencyMs,
    tokens_used: null,
    cost_usd: null,
    error_message: errMsg,
  })
  if (error) console.error(logLabel, error.message)
}
