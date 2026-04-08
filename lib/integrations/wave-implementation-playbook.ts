/**
 * Repeatable checklist when wiring a new catalog provider (no separate doc file).
 * Use with `IntegrationEntry.docsUrl` for vendor-specific details.
 */
export const WAVE_IMPLEMENTATION_STEPS = [
  "Confirm auth model: API key vs OAuth vs session; note rate limits and PII.",
  "Add minimal server handler in `lib/integrations/execute.ts` or a dedicated proxy route.",
  "Map catalog `agentTools[]` to real tool ids or clear placeholders in `integration-catalog.ts`.",
  "Register `id` in `MARKETPLACE_EXECUTE_PROVIDERS` and `RUNTIME_WIRED_IDS` when live.",
  "Add non-destructive probe in `integration-health.ts` when a safe endpoint exists.",
  "Add Vitest with mocked `fetch` or DB; log outcomes with `recordIntegrationUsage` (execute route, agent runtime, Sovereign).",
] as const
