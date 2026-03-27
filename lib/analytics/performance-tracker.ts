/**
 * Performance tracker — records page loads, API calls, and user actions
 * in localStorage with FIFO eviction (max 1000 entries).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageLoadEntry {
  type: "page_load"
  panel: string
  durationMs: number
  timestamp: string
}

export interface APICallEntry {
  type: "api_call"
  endpoint: string
  durationMs: number
  success: boolean
  tokensUsed?: number
  timestamp: string
}

export interface UserActionEntry {
  type: "user_action"
  action: string
  panel: string
  metadata?: Record<string, unknown>
  timestamp: string
}

export type PerformanceEntry = PageLoadEntry | APICallEntry | UserActionEntry

export interface PageMetric {
  panel: string
  avgMs: number
  p95Ms: number
  loads: number
}

export interface PerformanceMetrics {
  totalPageLoads: number
  totalAPICalls: number
  totalUserActions: number
  avgPageLoadMs: number
  avgAPICallMs: number
  apiSuccessRate: number
  apiHealthScore: number
  topSlowPages: PageMetric[]
  entriesStored: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "linkedout_perf_entries"
const MAX_ENTRIES = 1000

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

function readEntries(): PerformanceEntry[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeEntries(entries: PerformanceEntry[]): void {
  if (!isBrowser()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage full — evict half and retry once
    try {
      const trimmed = entries.slice(Math.floor(entries.length / 2))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      // Give up silently
    }
  }
}

function appendEntry(entry: PerformanceEntry): void {
  const entries = readEntries()
  entries.push(entry)
  // FIFO eviction
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }
  writeEntries(entries)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a panel/page load duration.
 */
export function trackPageLoad(panel: string, durationMs: number): void {
  appendEntry({
    type: "page_load",
    panel,
    durationMs: Math.round(durationMs),
    timestamp: new Date().toISOString(),
  })
}

/**
 * Record an API call with timing, success status, and optional token usage.
 */
export function trackAPICall(
  endpoint: string,
  durationMs: number,
  success: boolean,
  tokensUsed?: number,
): void {
  appendEntry({
    type: "api_call",
    endpoint,
    durationMs: Math.round(durationMs),
    success,
    tokensUsed,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Record a user action (button click, navigation, form submit, etc.).
 */
export function trackUserAction(
  action: string,
  panel: string,
  metadata?: Record<string, unknown>,
): void {
  appendEntry({
    type: "user_action",
    action,
    panel,
    metadata,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Get the slowest panels by average load time.
 */
export function getTopSlowPages(limit = 5): PageMetric[] {
  const entries = readEntries().filter(
    (e): e is PageLoadEntry => e.type === "page_load",
  )

  const byPanel = new Map<string, number[]>()
  for (const e of entries) {
    const arr = byPanel.get(e.panel) ?? []
    arr.push(e.durationMs)
    byPanel.set(e.panel, arr)
  }

  const metrics: PageMetric[] = []
  for (const [panel, durations] of byPanel) {
    const sorted = durations.slice().sort((a, b) => a - b)
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length
    metrics.push({
      panel,
      avgMs: Math.round(avg),
      p95Ms: Math.round(percentile(sorted, 95)),
      loads: sorted.length,
    })
  }

  return metrics.sort((a, b) => b.avgMs - a.avgMs).slice(0, limit)
}

/**
 * Compute an API health score from 0 (all failing / very slow) to 100 (fast + reliable).
 *
 * Formula: 60% success rate + 40% speed score.
 * Speed score: 100 if avg < 200ms, linearly drops to 0 at 5000ms.
 */
export function getAPIHealthScore(): number {
  const apiEntries = readEntries().filter(
    (e): e is APICallEntry => e.type === "api_call",
  )
  if (apiEntries.length === 0) return 100 // No data = assume healthy

  const successCount = apiEntries.filter((e) => e.success).length
  const successRate = successCount / apiEntries.length

  const avgMs =
    apiEntries.reduce((s, e) => s + e.durationMs, 0) / apiEntries.length
  // Speed score: 100 at <= 200ms, 0 at >= 5000ms, linear between
  const speedScore = Math.max(0, Math.min(100, ((5000 - avgMs) / 4800) * 100))

  return Math.round(successRate * 60 + (speedScore / 100) * 40)
}

/**
 * Return aggregated performance metrics.
 */
export function getMetrics(): PerformanceMetrics {
  const entries = readEntries()
  const pageLoads = entries.filter(
    (e): e is PageLoadEntry => e.type === "page_load",
  )
  const apiCalls = entries.filter(
    (e): e is APICallEntry => e.type === "api_call",
  )
  const userActions = entries.filter(
    (e): e is UserActionEntry => e.type === "user_action",
  )

  const avgPageLoadMs =
    pageLoads.length > 0
      ? Math.round(
          pageLoads.reduce((s, e) => s + e.durationMs, 0) / pageLoads.length,
        )
      : 0

  const avgAPICallMs =
    apiCalls.length > 0
      ? Math.round(
          apiCalls.reduce((s, e) => s + e.durationMs, 0) / apiCalls.length,
        )
      : 0

  const apiSuccessRate =
    apiCalls.length > 0
      ? apiCalls.filter((e) => e.success).length / apiCalls.length
      : 1

  return {
    totalPageLoads: pageLoads.length,
    totalAPICalls: apiCalls.length,
    totalUserActions: userActions.length,
    avgPageLoadMs,
    avgAPICallMs,
    apiSuccessRate: Math.round(apiSuccessRate * 100) / 100,
    apiHealthScore: getAPIHealthScore(),
    topSlowPages: getTopSlowPages(),
    entriesStored: entries.length,
  }
}

/**
 * Clear all stored entries (useful for testing or reset).
 */
export function clearMetrics(): void {
  if (!isBrowser()) return
  localStorage.removeItem(STORAGE_KEY)
}
