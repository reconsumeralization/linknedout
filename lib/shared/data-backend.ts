"use client"

// ---------------------------------------------------------------------------
// Data Backend Interface — all backends must implement this contract
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

// ---------------------------------------------------------------------------
// Backend type enum
// ---------------------------------------------------------------------------

export type DataBackendType = "supabase" | "mongodb" | "notion"

const BACKEND_STORAGE_KEY = "linkedout_data_backend"

export function getSelectedBackend(): DataBackendType {
  // Supabase is the only production-ready backend.
  // MongoDB and Notion stubs are retained for future use but not selectable.
  return "supabase"
}

export function setSelectedBackend(backend: DataBackendType): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(BACKEND_STORAGE_KEY, backend)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Interface that every backend must implement
// ---------------------------------------------------------------------------

export interface DataBackend {
  readonly type: DataBackendType
  readonly label: string

  /** Returns true if the backend has enough config to attempt a connection */
  isConfigured(): boolean

  /** Quick connectivity check — resolves true if reachable */
  testConnection(): Promise<boolean>

  // ---- Read operations ----

  fetchProfiles(): Promise<SupabaseProfileView[] | null>
  fetchTribes(): Promise<Tribe[] | null>
  fetchProjects(): Promise<SupabaseProjectView[] | null>
  fetchDashboardSnapshot(): Promise<DashboardSnapshot | null>

  fetchProjectPositions(projectId: string): Promise<ProjectPositionView[] | null>
  fetchProjectHiringSnapshot(projectId: string): Promise<ProjectHiringSnapshot | null>

  fetchFundraisingSnapshot(): Promise<FundraisingSnapshot | null>

  // ---- Paginated reads ----

  fetchProfilesPaginated(opts?: PaginationOptions): Promise<PaginatedResult<SupabaseProfileView>>
  fetchProjectsPaginated(opts?: PaginationOptions): Promise<PaginatedResult<SupabaseProjectView>>

  // ---- Write operations ----

  upsertFundraisingCampaign(input: {
    id?: string
    name: string
    description?: string
    goalAmount: number
    currency?: string
    status?: FundraisingCampaignStatus
    startDate?: string
    endDate?: string
  }): Promise<FundraisingCampaignView | null>

  upsertFundraisingDonor(input: {
    id?: string
    campaignId?: string
    name: string
    email?: string
    company?: string
    notes?: string
  }): Promise<FundraisingDonorView | null>

  upsertFundraisingDonation(input: {
    id?: string
    campaignId: string
    donorId?: string
    amount: number
    currency?: string
    status?: FundraisingDonationStatus
    donatedAt?: string
    note?: string
  }): Promise<FundraisingDonationView | null>

  upsertFundraisingGoal(input: {
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
  }): Promise<FundraisingGoalView | null>

  importProfiles(input: {
    accessToken: string
    profiles: ParsedProfile[]
  }): Promise<{
    saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
    counts: { inserted: number; updated: number }
  }>

  // ---- Realtime subscriptions (optional — return null if unsupported) ----

  subscribeToProfiles(onChange: () => void): (() => void) | null
  subscribeToTribes(onChange: () => void): (() => void) | null
  subscribeToProjects(onChange: () => void): (() => void) | null
}
