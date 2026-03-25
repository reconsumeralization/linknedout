"use client"

// ---------------------------------------------------------------------------
// Sponsor integration keys — stored per-service in localStorage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "linkedout_integration_keys"

/** Each sponsor can have one or more keyed credentials */
export interface IntegrationCredential {
  apiKey?: string
  clientId?: string
  clientSecret?: string
  webhookUrl?: string
  /** ISO timestamp of when the key was saved */
  savedAt: string
  /** Last successful validation */
  validatedAt?: string
}

export type IntegrationKeysMap = Record<string, IntegrationCredential>

/** Sponsor-specific field definitions for the UI */
export interface IntegrationFieldDef {
  field: keyof Omit<IntegrationCredential, "savedAt" | "validatedAt">
  label: string
  placeholder: string
  sensitive: boolean
}

/** Which fields each sponsor needs */
export const SPONSOR_FIELDS: Record<string, IntegrationFieldDef[]> = {
  // Finance
  Ramp: [{ field: "apiKey", label: "API Key", placeholder: "ramp_...", sensitive: true }],
  Gusto: [{ field: "apiKey", label: "API Token", placeholder: "gus_...", sensitive: true }],
  Plaid: [
    { field: "clientId", label: "Client ID", placeholder: "your-client-id", sensitive: false },
    { field: "clientSecret", label: "Secret", placeholder: "your-secret", sensitive: true },
  ],
  Phantom: [{ field: "apiKey", label: "Wallet Address", placeholder: "0x...", sensitive: false }],

  // Security
  CrowdStrike: [{ field: "apiKey", label: "API Key", placeholder: "cs-...", sensitive: true }],
  Vanta: [{ field: "apiKey", label: "API Token", placeholder: "vnt_...", sensitive: true }],
  Okta: [
    { field: "clientId", label: "Org URL", placeholder: "https://your-org.okta.com", sensitive: false },
    { field: "apiKey", label: "API Token", placeholder: "00...", sensitive: true },
  ],

  // Infrastructure
  Railway: [{ field: "apiKey", label: "API Token", placeholder: "railway_...", sensitive: true }],
  MongoDB: [{ field: "apiKey", label: "Connection String", placeholder: "mongodb+srv://...", sensitive: true }],
  Turbopuffer: [{ field: "apiKey", label: "API Key", placeholder: "tp_...", sensitive: true }],
  Lambda: [{ field: "apiKey", label: "API Key", placeholder: "lambda_...", sensitive: true }],
  Sentry: [{ field: "apiKey", label: "DSN", placeholder: "https://...@sentry.io/...", sensitive: true }],
  Graphite: [{ field: "apiKey", label: "API Token", placeholder: "gt_...", sensitive: true }],
  Linear: [{ field: "apiKey", label: "API Key", placeholder: "lin_api_...", sensitive: true }],

  // AI
  Gemini: [{ field: "apiKey", label: "API Key", placeholder: "AI...", sensitive: true }],
  Labelbox: [{ field: "apiKey", label: "API Key", placeholder: "lb_...", sensitive: true }],

  // Design & Media
  Figma: [{ field: "apiKey", label: "Personal Access Token", placeholder: "figd_...", sensitive: true }],
  ElevenLabs: [{ field: "apiKey", label: "API Key", placeholder: "el_...", sensitive: true }],
  Restream: [{ field: "apiKey", label: "API Token", placeholder: "rst_...", sensitive: true }],

  // Markets & Commerce
  Kalshi: [
    { field: "apiKey", label: "API Key", placeholder: "kalshi_...", sensitive: true },
    { field: "clientSecret", label: "API Secret", placeholder: "secret_...", sensitive: true },
  ],
  Public: [{ field: "apiKey", label: "API Token", placeholder: "pub_...", sensitive: true }],
  Shopify: [{ field: "apiKey", label: "Access Token", placeholder: "shpat_...", sensitive: true }],
}

/** Read all integration keys from localStorage */
export function getIntegrationKeys(): IntegrationKeysMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as IntegrationKeysMap
  } catch {
    return {}
  }
}

/** Get keys for a specific sponsor */
export function getIntegrationKey(sponsorName: string): IntegrationCredential | null {
  const all = getIntegrationKeys()
  return all[sponsorName] ?? null
}

/** Save keys for a specific sponsor */
export function setIntegrationKey(sponsorName: string, cred: Omit<IntegrationCredential, "savedAt">): void {
  if (typeof window === "undefined") return
  try {
    const all = getIntegrationKeys()
    all[sponsorName] = { ...cred, savedAt: new Date().toISOString() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

/** Remove keys for a specific sponsor */
export function removeIntegrationKey(sponsorName: string): void {
  if (typeof window === "undefined") return
  try {
    const all = getIntegrationKeys()
    delete all[sponsorName]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

/** Clear all integration keys */
export function clearAllIntegrationKeys(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Check if a sponsor is connected (has saved keys) */
export function isSponsorConnected(sponsorName: string): boolean {
  const cred = getIntegrationKey(sponsorName)
  if (!cred) return false
  return Boolean(cred.apiKey || cred.clientId)
}

/** Count how many sponsors are connected */
export function countConnectedSponsors(): number {
  const all = getIntegrationKeys()
  return Object.keys(all).filter((name) => isSponsorConnected(name)).length
}

/** Build headers for a specific sponsor's API calls */
export function getSponsorHeaders(sponsorName: string): Record<string, string> {
  const cred = getIntegrationKey(sponsorName)
  if (!cred) return {}
  const headers: Record<string, string> = {}
  if (cred.apiKey) headers[`x-integration-${sponsorName.toLowerCase()}-key`] = cred.apiKey
  if (cred.clientId) headers[`x-integration-${sponsorName.toLowerCase()}-client-id`] = cred.clientId
  if (cred.clientSecret) headers[`x-integration-${sponsorName.toLowerCase()}-secret`] = cred.clientSecret
  return headers
}
