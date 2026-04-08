import "server-only"

import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { MarketplaceKeyOverrides } from "@/lib/integrations/execute"

/**
 * User-scoped install check on `integration_configs`, then `executeMarketplaceIntegration`,
 * then optional `recordIntegrationUsage` when `usageSupabase` is non-null.
 * Shared by Sovereign and agent `invoke_marketplace_integration`.
 */
export async function runInstalledMarketplaceIntegrationWithUsageLog(opts: {
  userId: string
  accessToken: string
  provider: string
  tool: string
  input: Record<string, unknown>
  agentId: string | null
  logLabel: string
  usageSupabase: SupabaseClient | null
  keyOverrides?: MarketplaceKeyOverrides
}): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const { userId, accessToken, provider, tool, input, agentId, logLabel, usageSupabase, keyOverrides } = opts

  const userSb = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
  const { data: installed, error: installErr } = await userSb
    .from("integration_configs")
    .select("id")
    .eq("provider", provider)
    .maybeSingle()
  if (installErr) {
    return { ok: false, error: installErr.message || "Could not verify marketplace install." }
  }
  if (!installed) {
    return { ok: false, error: "Install this integration in Marketplace before invoking tools." }
  }

  const { executeMarketplaceIntegration } = await import("@/lib/integrations/execute")
  const { recordIntegrationUsage } = await import("@/lib/integrations/integration-usage-log")
  const started = Date.now()
  const result = await executeMarketplaceIntegration({
    providerId: provider,
    tool,
    input,
    ctx: { userId, accessToken },
    keyOverrides,
  })
  const latencyMs = Date.now() - started
  if (usageSupabase) {
    await recordIntegrationUsage(usageSupabase, {
      userId,
      provider,
      toolName: tool,
      agentId,
      ok: result.ok,
      latencyMs,
      errorMessage: result.ok ? null : result.error,
    }, logLabel)
  }
  return result
}
