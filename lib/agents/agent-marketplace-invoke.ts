import "server-only"

import { createClient } from "@supabase/supabase-js"

export type AgentMarketplaceInvokeContext = {
  userId: string
  accessToken: string
  agentId?: string
}

function serviceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key)
}

/**
 * Install check (user JWT) + marketplace runner + usage log (service role when configured).
 * Used by `invoke_marketplace_integration` in `agent-runtime`.
 */
export async function invokeMarketplaceIntegrationFromAgent(
  ctx: AgentMarketplaceInvokeContext,
  input: { provider: string; tool: string; params?: Record<string, unknown> },
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const { runInstalledMarketplaceIntegrationWithUsageLog } = await import(
    "@/lib/integrations/run-installed-marketplace-with-usage-log"
  )
  return runInstalledMarketplaceIntegrationWithUsageLog({
    userId: ctx.userId,
    accessToken: ctx.accessToken,
    provider: input.provider,
    tool: input.tool,
    input: (input.params ?? {}) as Record<string, unknown>,
    agentId: ctx.agentId ?? null,
    logLabel: "[agent-runtime] integration usage log",
    usageSupabase: serviceRoleClient(),
  })
}
