/**
 * Integrations whose INTEGRATION_CATALOG `id` values map to real code paths in this repo.
 * Everything else is registry + DB bookkeeping until wired.
 *
 * Audit hints: `app/api/**`, `lib/shared/resolve-request-keys.ts`, `lib/shared/rate-limit-redis.ts`.
 */
const RUNTIME_WIRED_IDS = new Set<string>([
  "supabase",
  "mongodb",
  "openai",
  "anthropic",
  "google-ai",
  /** `REDIS_URL` + ioredis in `lib/shared/rate-limit-redis.ts` (used by `request-rate-limit.ts`). */
  "redis",
  /** User/env keys resolved in `resolve-request-keys.ts` for model calls. */
  "groq",
  "mistral",
  /** Transactional email via `lib/integrations/execute.ts` + `/api/integrations/execute`. */
  "resend",
  /** Server capture via `lib/integrations/execute.ts` (`analytics:track`). */
  "posthog",
])

export function isIntegrationRuntimeWired(providerId: string): boolean {
  return RUNTIME_WIRED_IDS.has(providerId)
}
