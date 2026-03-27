"use client"

// ---------------------------------------------------------------------------
// Backend Factory — returns the correct DataBackend based on user selection
// ---------------------------------------------------------------------------
// NOTE: MongoDB and Notion backends exist as stubs for future use.
// Supabase is the only production-ready backend and is always the default.
// ---------------------------------------------------------------------------

import type { DataBackend, DataBackendType } from "@/lib/shared/data-backend"
import { getSelectedBackend } from "@/lib/shared/data-backend"
import { SupabaseBackend } from "@/lib/shared/supabase-backend"

// Lazy imports for non-primary backends (kept for future use)
async function loadMongoDBBackend() {
  const { MongoDBBackend } = await import("@/lib/mongodb/mongodb-client")
  return new MongoDBBackend()
}
async function loadNotionBackend() {
  const { NotionBackend } = await import("@/lib/notion/notion-client")
  return new NotionBackend()
}

// Singleton cache — one instance per type
const cache = new Map<DataBackendType, DataBackend>()

/**
 * Get the DataBackend instance for the user's selected backend type.
 * Always defaults to Supabase — MongoDB and Notion are not yet production-ready.
 */
export function getDataBackend(overrideType?: DataBackendType): DataBackend {
  // Force Supabase for now — MongoDB/Notion are stubs kept for future use
  const type: DataBackendType = "supabase"
  void overrideType // reserved for future multi-backend support
  void getSelectedBackend // kept for future use

  const cached = cache.get(type)
  if (cached) return cached

  const backend: DataBackend = new SupabaseBackend()

  cache.set(type, backend)
  return backend
}

/** Clear the cache (useful when user changes keys or backend selection) */
export function resetBackendCache(): void {
  cache.clear()
}

/** Get all available backend types with their labels */
export const BACKEND_OPTIONS: Array<{ type: DataBackendType; label: string; description: string; available: boolean }> = [
  { type: "supabase", label: "Supabase", description: "PostgreSQL + Auth + Realtime (recommended)", available: true },
  { type: "mongodb", label: "MongoDB", description: "Coming soon — not yet configured", available: false },
  { type: "notion", label: "Notion", description: "Coming soon — not yet configured", available: false },
]
