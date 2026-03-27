"use client"

// ---------------------------------------------------------------------------
// Supabase Backend — wraps existing supabase-data.ts functions as a DataBackend
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
import { getSupabaseClient } from "@/lib/supabase/supabase"
import {
  fetchSupabaseProfiles,
  fetchSupabaseTribes,
  fetchSupabaseProjects,
  fetchSupabaseDashboardSnapshot,
  fetchSupabaseProjectPositions,
  fetchSupabaseProjectHiringSnapshot,
  fetchFundraisingSnapshot as fetchFundraising,
  fetchProfilesPaginated as fetchProfilesPag,
  fetchProjectsPaginated as fetchProjectsPag,
  upsertFundraisingCampaign as upsertCampaign,
  upsertFundraisingDonor as upsertDonor,
  upsertFundraisingDonation as upsertDonation,
  upsertFundraisingGoal as upsertGoal,
  importProfilesToSupabase,
  subscribeToProfiles as subProfiles,
  subscribeToTribes as subTribes,
  subscribeToProjects as subProjects,
} from "@/lib/supabase/supabase-data"
import { hasUserSupabase } from "@/lib/shared/user-keys"
import { hasSupabasePublicEnv } from "@/lib/supabase/supabase"

export class SupabaseBackend implements DataBackend {
  readonly type = "supabase" as const
  readonly label = "Supabase"

  isConfigured(): boolean {
    return hasSupabasePublicEnv() || hasUserSupabase()
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = getSupabaseClient()
      if (!client) return false
      const { error } = await client.auth.getSession()
      return !error
    } catch {
      return false
    }
  }

  // ---- Read ----

  fetchProfiles(): Promise<SupabaseProfileView[] | null> {
    return fetchSupabaseProfiles()
  }

  fetchTribes(): Promise<Tribe[] | null> {
    return fetchSupabaseTribes()
  }

  fetchProjects(): Promise<SupabaseProjectView[] | null> {
    return fetchSupabaseProjects()
  }

  fetchDashboardSnapshot(): Promise<DashboardSnapshot | null> {
    return fetchSupabaseDashboardSnapshot()
  }

  fetchProjectPositions(projectId: string): Promise<ProjectPositionView[] | null> {
    return fetchSupabaseProjectPositions(projectId)
  }

  fetchProjectHiringSnapshot(projectId: string): Promise<ProjectHiringSnapshot | null> {
    return fetchSupabaseProjectHiringSnapshot(projectId)
  }

  fetchFundraisingSnapshot(): Promise<FundraisingSnapshot | null> {
    return fetchFundraising()
  }

  // ---- Paginated ----

  fetchProfilesPaginated(opts?: PaginationOptions): Promise<PaginatedResult<SupabaseProfileView>> {
    return fetchProfilesPag(opts)
  }

  fetchProjectsPaginated(opts?: PaginationOptions): Promise<PaginatedResult<SupabaseProjectView>> {
    return fetchProjectsPag(opts)
  }

  // ---- Write ----

  upsertFundraisingCampaign(input: {
    id?: string
    name: string
    description?: string
    goalAmount: number
    currency?: string
    status?: FundraisingCampaignStatus
    startDate?: string
    endDate?: string
  }): Promise<FundraisingCampaignView | null> {
    return upsertCampaign(input)
  }

  upsertFundraisingDonor(input: {
    id?: string
    campaignId?: string
    name: string
    email?: string
    company?: string
    notes?: string
  }): Promise<FundraisingDonorView | null> {
    return upsertDonor(input)
  }

  upsertFundraisingDonation(input: {
    id?: string
    campaignId: string
    donorId?: string
    amount: number
    currency?: string
    status?: FundraisingDonationStatus
    donatedAt?: string
    note?: string
  }): Promise<FundraisingDonationView | null> {
    return upsertDonation(input)
  }

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
  }): Promise<FundraisingGoalView | null> {
    return upsertGoal(input)
  }

  importProfiles(input: {
    accessToken: string
    profiles: ParsedProfile[]
  }): Promise<{
    saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
    counts: { inserted: number; updated: number }
  }> {
    return importProfilesToSupabase(input)
  }

  // ---- Realtime ----

  subscribeToProfiles(onChange: () => void): (() => void) | null {
    return subProfiles(onChange)
  }

  subscribeToTribes(onChange: () => void): (() => void) | null {
    return subTribes(onChange)
  }

  subscribeToProjects(onChange: () => void): (() => void) | null {
    return subProjects(onChange)
  }
}
