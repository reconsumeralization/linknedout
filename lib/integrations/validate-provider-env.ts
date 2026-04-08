import { INTEGRATION_CATALOG } from "@/lib/connectors/integration-catalog"

export type ProviderEnvValidation = {
  providerId: string
  /** All catalog envKeys have non-empty process.env values. */
  configured: boolean
  missingEnvKeys: string[]
  oauth: boolean
  docsUrl: string
  envKeys: string[]
}

/**
 * Server-side check of process.env against catalog `envKeys` for a provider.
 * Does not read client-side user key overrides (those apply in-browser only).
 */
export function validateProviderEnv(providerId: string): ProviderEnvValidation | null {
  const entry = INTEGRATION_CATALOG.find((i) => i.id === providerId)
  if (!entry) return null

  const missingEnvKeys = entry.envKeys.filter((key) => {
    const v = process.env[key]?.trim()
    return !v
  })

  return {
    providerId: entry.id,
    configured: entry.envKeys.length === 0 ? false : missingEnvKeys.length === 0,
    missingEnvKeys,
    oauth: entry.oauth,
    docsUrl: entry.docsUrl,
    envKeys: entry.envKeys,
  }
}
