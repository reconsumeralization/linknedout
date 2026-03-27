"use client"

// ---------------------------------------------------------------------------
// MongoDB Data Backend — uses user-provided connection string via Data API
// ---------------------------------------------------------------------------
// NOTE: MongoDB cannot be accessed directly from the browser. This backend
// proxies all operations through a lightweight API route (/api/mongodb/proxy).
// The connection string is sent as a header from localStorage keys.
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

/** POST to the MongoDB proxy API route.
 *  Connection string is sent in the body (not headers) to avoid logging by proxies/CDNs. */
async function mongoProxy<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch("/api/mongodb/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...payload }),
    })

    if (!res.ok) {
      console.warn(`[mongodb] proxy ${action} failed: ${res.status}`)
      return null
    }

    const json = await res.json()
    return (json.data ?? json) as T
  } catch (err) {
    console.warn(`[mongodb] proxy ${action} error:`, err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Backend implementation
// ---------------------------------------------------------------------------

export class MongoDBBackend implements DataBackend {
  readonly type = "mongodb" as const
  readonly label = "MongoDB"

  isConfigured(): boolean {
    return true
  }

  async testConnection(): Promise<boolean> {
    const result = await mongoProxy<{ ok: boolean }>("ping")
    return result?.ok === true
  }

  // ---- Read ----

  async fetchProfiles(): Promise<SupabaseProfileView[] | null> {
    return mongoProxy<SupabaseProfileView[]>("fetchProfiles")
  }

  async fetchTribes(): Promise<Tribe[] | null> {
    return mongoProxy<Tribe[]>("fetchTribes")
  }

  async fetchProjects(): Promise<SupabaseProjectView[] | null> {
    return mongoProxy<SupabaseProjectView[]>("fetchProjects")
  }

  async fetchDashboardSnapshot(): Promise<DashboardSnapshot | null> {
    return mongoProxy<DashboardSnapshot>("fetchDashboardSnapshot")
  }

  async fetchProjectPositions(projectId: string): Promise<ProjectPositionView[] | null> {
    return mongoProxy<ProjectPositionView[]>("fetchProjectPositions", { projectId })
  }

  async fetchProjectHiringSnapshot(projectId: string): Promise<ProjectHiringSnapshot | null> {
    return mongoProxy<ProjectHiringSnapshot>("fetchProjectHiringSnapshot", { projectId })
  }

  async fetchFundraisingSnapshot(): Promise<FundraisingSnapshot | null> {
    return mongoProxy<FundraisingSnapshot>("fetchFundraisingSnapshot")
  }

  // ---- Paginated ----

  async fetchProfilesPaginated(opts: PaginationOptions = {}): Promise<PaginatedResult<SupabaseProfileView>> {
    const result = await mongoProxy<PaginatedResult<SupabaseProfileView>>("fetchProfilesPaginated", { opts })
    return result ?? { data: [], nextCursor: null, hasMore: false }
  }

  async fetchProjectsPaginated(opts: PaginationOptions = {}): Promise<PaginatedResult<SupabaseProjectView>> {
    const result = await mongoProxy<PaginatedResult<SupabaseProjectView>>("fetchProjectsPaginated", { opts })
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
    return mongoProxy<FundraisingCampaignView>("upsertFundraisingCampaign", { input })
  }

  async upsertFundraisingDonor(input: {
    id?: string
    campaignId?: string
    name: string
    email?: string
    company?: string
    notes?: string
  }): Promise<FundraisingDonorView | null> {
    return mongoProxy<FundraisingDonorView>("upsertFundraisingDonor", { input })
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
    return mongoProxy<FundraisingDonationView>("upsertFundraisingDonation", { input })
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
    return mongoProxy<FundraisingGoalView>("upsertFundraisingGoal", { input })
  }

  async importProfiles(input: {
    accessToken: string
    profiles: ParsedProfile[]
  }): Promise<{
    saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
    counts: { inserted: number; updated: number }
  }> {
    const result = await mongoProxy<{
      saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
      counts: { inserted: number; updated: number }
    }>("importProfiles", { accessToken: input.accessToken, profiles: input.profiles })
    return result ?? { saved: [], counts: { inserted: 0, updated: 0 } }
  }

  // ---- Realtime (not natively supported — return null) ----

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
