"use client"

// ---------------------------------------------------------------------------
// Notion Data Backend — uses user-provided API key + database IDs
// ---------------------------------------------------------------------------
// NOTE: Notion's API requires server-side access (CORS restrictions).
// This backend proxies all operations through /api/notion/proxy.
// The Notion API key and database IDs are sent as headers from localStorage.
// ---------------------------------------------------------------------------

import type { ParsedProfile } from "@/lib/csv/csv-parser"
import type { Tribe } from "@/lib/shared/types"
import type {
  SupabaseProfileView,
  SupabaseProjectView,
  DashboardSnapshot,
  FundraisingSnapshot,
  FundraisingCampaignView,
  FundraisingDonorView,
  FundraisingDonationView,
  FundraisingGoalView,
  FundraisingCampaignStatus,
  FundraisingDonationStatus,
  FundraisingGoalStatus,
  ProjectPositionView,
  ProjectHiringSnapshot,
  PaginatedResult,
  PaginationOptions,
} from "@/lib/supabase/supabase-data"
import type { DataBackend } from "@/lib/shared/data-backend"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST to the Notion proxy API route.
 *  Server-side route resolves credentials from environment variables only. */
async function notionProxy<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch("/api/notion/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...payload }),
    })

    if (!res.ok) {
      console.warn(`[notion] proxy ${action} failed: ${res.status}`)
      return null
    }

    const json = await res.json()
    return (json.data ?? json) as T
  } catch (err) {
    console.warn(`[notion] proxy ${action} error:`, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Backend implementation
// ---------------------------------------------------------------------------

export class NotionBackend implements DataBackend {
  readonly type = "notion" as const
  readonly label = "Notion"

  isConfigured(): boolean {
    return true
  }

  async testConnection(): Promise<boolean> {
    const result = await notionProxy<{ ok: boolean }>("ping")
    return result?.ok === true
  }

  // ---- Read ----

  async fetchProfiles(): Promise<SupabaseProfileView[] | null> {
    return notionProxy<SupabaseProfileView[]>("fetchProfiles")
  }

  async fetchTribes(): Promise<Tribe[] | null> {
    return notionProxy<Tribe[]>("fetchTribes")
  }

  async fetchProjects(): Promise<SupabaseProjectView[] | null> {
    return notionProxy<SupabaseProjectView[]>("fetchProjects")
  }

  async fetchDashboardSnapshot(): Promise<DashboardSnapshot | null> {
    return notionProxy<DashboardSnapshot>("fetchDashboardSnapshot")
  }

  async fetchProjectPositions(projectId: string): Promise<ProjectPositionView[] | null> {
    return notionProxy<ProjectPositionView[]>("fetchProjectPositions", { projectId })
  }

  async fetchProjectHiringSnapshot(projectId: string): Promise<ProjectHiringSnapshot | null> {
    return notionProxy<ProjectHiringSnapshot>("fetchProjectHiringSnapshot", { projectId })
  }

  async fetchFundraisingSnapshot(): Promise<FundraisingSnapshot | null> {
    return notionProxy<FundraisingSnapshot>("fetchFundraisingSnapshot")
  }

  // ---- Paginated ----

  async fetchProfilesPaginated(opts: PaginationOptions = {}): Promise<PaginatedResult<SupabaseProfileView>> {
    const result = await notionProxy<PaginatedResult<SupabaseProfileView>>("fetchProfilesPaginated", { opts })
    return result ?? { data: [], nextCursor: null, hasMore: false }
  }

  async fetchProjectsPaginated(opts: PaginationOptions = {}): Promise<PaginatedResult<SupabaseProjectView>> {
    const result = await notionProxy<PaginatedResult<SupabaseProjectView>>("fetchProjectsPaginated", { opts })
    return result ?? { data: [], nextCursor: null, hasMore: false }
  }

  // ---- Write ----

  async upsertFundraisingCampaign(input: {
    id?: string
    name: string
    description?: string
    goalAmount: number
    currency?: string
    status?: FundraisingCampaignStatus
    startDate?: string
    endDate?: string
  }): Promise<FundraisingCampaignView | null> {
    return notionProxy<FundraisingCampaignView>("upsertFundraisingCampaign", { input })
  }

  async upsertFundraisingDonor(input: {
    id?: string
    campaignId?: string
    name: string
    email?: string
    company?: string
    notes?: string
  }): Promise<FundraisingDonorView | null> {
    return notionProxy<FundraisingDonorView>("upsertFundraisingDonor", { input })
  }

  async upsertFundraisingDonation(input: {
    id?: string
    campaignId: string
    donorId?: string
    amount: number
    currency?: string
    status?: FundraisingDonationStatus
    donatedAt?: string
    note?: string
  }): Promise<FundraisingDonationView | null> {
    return notionProxy<FundraisingDonationView>("upsertFundraisingDonation", { input })
  }

  async upsertFundraisingGoal(input: {
    id?: string
    campaignId: string
    title: string
    description?: string
    targetAmount: number
    currentAmount?: number
    currency?: string
    dueDate?: string
    status?: FundraisingGoalStatus
    sortOrder?: number
  }): Promise<FundraisingGoalView | null> {
    return notionProxy<FundraisingGoalView>("upsertFundraisingGoal", { input })
  }

  async importProfiles(input: {
    accessToken: string
    profiles: ParsedProfile[]
  }): Promise<{
    saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
    counts: { inserted: number; updated: number }
  }> {
    const result = await notionProxy<{
      saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
      counts: { inserted: number; updated: number }
    }>("importProfiles", { accessToken: input.accessToken, profiles: input.profiles })
    return result ?? { saved: [], counts: { inserted: 0, updated: 0 } }
  }

  // ---- Realtime (Notion has no native realtime — return null) ----

  subscribeToProfiles(): (() => void) | null {
    return null
  }
  subscribeToTribes(): (() => void) | null {
    return null
  }
  subscribeToProjects(): (() => void) | null {
    return null
  }
}
