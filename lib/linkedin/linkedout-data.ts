import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@supabase/supabase-js"
import type {
  CurationActionType,
  LinkedOutContactState,
  LinkedOutCurationAction,
  LinkedOutObjective,
  LinkedOutOutreachEvent,
  OutreachEventType,
  QueueStatus,
} from "./linkedout-types"

/**
 * Creates and returns a Supabase client instance using environment variables.
 * @returns A SupabaseClient instance or null if environment variables are missing.
 */
function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Objectives ───────────────────────────────────────────────────────────────

/**
 * Fetches all objectives for a given user.
 * @param userId - The ID of the user whose objectives to fetch.
 * @param limit - Maximum number of objectives to return (default: 100, max: 500).
 * @returns An array of LinkedOutObjective objects, ordered by creation date ascending.
 */
export async function fetchObjectives(
  userId: string,
  limit = 100,
): Promise<LinkedOutObjective[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from("linkedout_objectives")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return []
  }
  return data.map(toObjective)
}

/**
 * Creates or updates an objective for a user.
 * @param userId - The ID of the user who owns the objective.
 * @param objective - The objective data to upsert.
 * @returns The created/updated LinkedOutObjective or null on failure.
 */
export async function upsertObjective(
  userId: string,
  objective: Omit<LinkedOutObjective, "userId" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<LinkedOutObjective | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from("linkedout_objectives")
    .upsert(
      {
        user_id: userId,
        label: objective.label,
        keywords: objective.keywords,
        industries: objective.industries,
        skills: objective.skills,
        note_prefix: objective.notePrefix,
        is_active: objective.isActive,
        updated_at: new Date().toISOString(),
        ...(objective.id ? { id: objective.id } : {}),
      },
      { onConflict: "id" },
    )
    .select()
    .single()

  if (error || !data) {
    return null
  }
  return toObjective(data)
}

/**
 * Deletes an objective by its ID.
 * @param id - The unique identifier of the objective to delete.
 */
export async function deleteObjective(id: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.from("linkedout_objectives").delete().eq("id", id)
}

/**
 * Fetches a single objective by its ID.
 * @param id - The unique identifier of the objective.
 * @returns The LinkedOutObjective or null if not found.
 */
export async function fetchObjectiveById(id: string): Promise<LinkedOutObjective | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from("linkedout_objectives")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) {
    return null
  }
  return toObjective(data)
}

/**
 * Fetches only active objectives for a user.
 * @param userId - The ID of the user whose active objectives to fetch.
 * @returns An array of active LinkedOutObjective objects.
 */
export async function fetchActiveObjectives(userId: string): Promise<LinkedOutObjective[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from("linkedout_objectives")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })

  if (error || !data) {
    return []
  }
  return data.map(toObjective)
}

// ─── Contact States ───────────────────────────────────────────────────────────

/**
 * Fetches contact states for a user, optionally filtered by objective and/or queue status.
 * @param userId - The ID of the user whose contact states to fetch.
 * @param options - Optional filters for objectiveId and queueStatus.
 * @param limit - Maximum number of contact states to return (default: 500, max: 1000).
 * @returns An array of LinkedOutContactState objects.
 */
export async function fetchContactStates(
  userId: string,
  options?: { objectiveId?: string; queueStatus?: QueueStatus },
  limit = 500,
): Promise<LinkedOutContactState[]> {
  const sb = getSupabase()
  if (!sb) return []
  let q = sb
    .from("linkedout_contact_states")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 1000)))

  if (options?.objectiveId) q = q.eq("objective_id", options.objectiveId)
  if (options?.queueStatus) q = q.eq("queue_status", options.queueStatus)

  const { data, error } = await q

  if (error || !data) {
    return []
  }
  return data.map(toContactState)
}

/**
 * Fetches contact states by queue status for a user.
 * @param userId - The ID of the user.
 * @param queueStatus - The queue status to filter by.
 * @param limit - Maximum number of results (default: 100).
 * @returns An array of LinkedOutContactState objects with the specified status.
 */
export async function fetchContactStatesByStatus(
  userId: string,
  queueStatus: QueueStatus,
  limit = 100,
): Promise<LinkedOutContactState[]> {
  return fetchContactStates(userId, { queueStatus }, limit)
}

/**
 * Upserts a single contact state.
 * @param userId - The ID of the user who owns the contact state.
 * @param state - The contact state data to upsert.
 * @returns The upserted LinkedOutContactState or null on failure.
 */
export async function upsertContactState(
  userId: string,
  state: {
    profileId: string
    objectiveId: string
    queueStatus: QueueStatus
    score?: number | null
    intentFit?: number | null
    relationshipStrength?: number | null
    freshness?: number | null
  },
): Promise<LinkedOutContactState | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from("linkedout_contact_states")
    .upsert(
      {
        user_id: userId,
        profile_id: state.profileId,
        objective_id: state.objectiveId,
        queue_status: state.queueStatus,
        score: state.score ?? null,
        intent_fit: state.intentFit ?? null,
        relationship_strength: state.relationshipStrength ?? null,
        freshness: state.freshness ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,profile_id,objective_id" },
    )
    .select()
    .single()

  if (error || !data) {
    return null
  }
  return toContactState(data)
}

/**
 * Batch upserts multiple contact states in a single operation.
 * @param userId - The ID of the user who owns the contact states.
 * @param states - An array of contact state data to upsert.
 * @returns The number of successfully upserted states.
 */
export async function batchUpsertContactStates(
  userId: string,
  states: Array<{
    profileId: string
    objectiveId: string
    queueStatus: QueueStatus
    score?: number | null
    intentFit?: number | null
    relationshipStrength?: number | null
    freshness?: number | null
  }>,
): Promise<number> {
  const sb = getSupabase()
  if (!sb || states.length === 0) return 0

  const { data, error } = await sb
    .from("linkedout_contact_states")
    .upsert(
      states.map((s) => ({
        user_id: userId,
        profile_id: s.profileId,
        objective_id: s.objectiveId,
        queue_status: s.queueStatus,
        score: s.score ?? null,
        intent_fit: s.intentFit ?? null,
        relationship_strength: s.relationshipStrength ?? null,
        freshness: s.freshness ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,profile_id,objective_id" },
    )
    .select()

  if (error || !data) {
    return 0
  }
  return data.length
}

/**
 * Updates the queue status for a specific contact.
 * @param userId - The ID of the user.
 * @param profileId - The LinkedIn profile ID of the contact.
 * @param objectiveId - The objective ID.
 * @param newStatus - The new queue status to set.
 */
export async function updateContactQueueStatus(
  userId: string,
  profileId: string,
  objectiveId: string,
  newStatus: QueueStatus,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb
    .from("linkedout_contact_states")
    .update({ queue_status: newStatus, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .eq("objective_id", objectiveId)
}

/**
 * Fetches a single contact state by profile ID and objective ID.
 * @param userId - The ID of the user.
 * @param profileId - The LinkedIn profile ID.
 * @param objectiveId - The objective ID.
 * @returns The LinkedOutContactState or null if not found.
 */
export async function fetchContactState(
  userId: string,
  profileId: string,
  objectiveId: string,
): Promise<LinkedOutContactState | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from("linkedout_contact_states")
    .select("*")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .eq("objective_id", objectiveId)
    .single()

  if (error || !data) {
    return null
  }
  return toContactState(data)
}

// ─── Outreach Events ──────────────────────────────────────────────────────────

/**
 * Logs an outreach event for tracking user actions.
 * @param userId - The ID of the user who triggered the event.
 * @param event - The event details including profileId, eventType, and optional payload.
 * @returns The created LinkedOutOutreachEvent or null on failure.
 */
export async function logOutreachEvent(
  userId: string,
  event: {
    profileId: string
    eventType: OutreachEventType
    objectiveId?: string | null
    payload?: Record<string, unknown> | null
  },
): Promise<LinkedOutOutreachEvent | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data, error } = await sb
    .from("linkedout_outreach_events")
    .insert({
      user_id: userId,
      profile_id: event.profileId,
      event_type: event.eventType,
      objective_id: event.objectiveId ?? null,
      payload: event.payload ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    return null
  }
  return toOutreachEvent(data)
}

/**
 * Fetches outreach events for a user with optional filters.
 * @param userId - The ID of the user whose events to fetch.
 * @param options - Optional filters for since date and event type.
 * @param limit - Maximum number of events to return (default: 500, max: 1000).
 * @returns An array of LinkedOutOutreachEvent objects, ordered by creation date descending.
 */
export async function fetchOutreachEvents(
  userId: string,
  options?: { since?: Date; eventType?: OutreachEventType },
  limit = 500,
): Promise<LinkedOutOutreachEvent[]> {
  const sb = getSupabase()
  if (!sb) return []
  let q = sb
    .from("linkedout_outreach_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 1000)))

  if (options?.since) q = q.gte("created_at", options.since.toISOString())
  if (options?.eventType) q = q.eq("event_type", options.eventType)

  const { data, error } = await q

  if (error || !data) {
    return []
  }
  return data.map(toOutreachEvent)
}

/**
 * Fetches outreach events for a specific profile.
 * @param userId - The ID of the user.
 * @param profileId - The LinkedIn profile ID.
 * @param limit - Maximum number of events to return (default: 50).
 * @returns An array of LinkedOutOutreachEvent objects for the profile.
 */
export async function fetchOutreachEventsForProfile(
  userId: string,
  profileId: string,
  limit = 50,
): Promise<LinkedOutOutreachEvent[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from("linkedout_outreach_events")
    .select("*")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return []
  }
  return data.map(toOutreachEvent)
}

/**
 * Counts outreach events by type for a user within an optional time range.
 * @param userId - The ID of the user.
 * @param since - Optional start date for counting.
 * @returns A record mapping event types to their counts.
 */
export async function countOutreachEventsByType(
  userId: string,
  since?: Date,
): Promise<Record<OutreachEventType, number>> {
  const events = await fetchOutreachEvents(userId, { since }, 1000)
  const counts: Record<OutreachEventType, number> = {
    note_copied: 0,
    profile_opened: 0,
    intro_generated: 0,
    cull_exported: 0,
  }
  for (const event of events) {
    counts[event.eventType]++
  }
  return counts
}

// ─── Curation Actions ─────────────────────────────────────────────────────────

/**
 * Logs a curation action taken on one or more contacts.
 * @param userId - The ID of the user who performed the action.
 * @param action - The type of curation action.
 * @param profileIds - An array of LinkedIn profile IDs affected by the action.
 * @param note - Optional note explaining the action.
 * @returns The created LinkedOutCurationAction or null on failure.
 */
export async function logCurationAction(
  userId: string,
  action: CurationActionType,
  profileIds: string[],
  note?: string | null,
): Promise<LinkedOutCurationAction | null> {
  const sb = getSupabase()
  if (!sb || profileIds.length === 0) return null
  const { data, error } = await sb
    .from("linkedout_curation_actions")
    .insert({
      user_id: userId,
      profile_ids: profileIds,
      action,
      note: note ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    return null
  }
  return toCurationAction(data)
}

/**
 * Fetches the curation history for a user.
 * @param userId - The ID of the user whose curation history to fetch.
 * @param limit - Maximum number of actions to return (default: 100, max: 500).
 * @returns An array of LinkedOutCurationAction objects, ordered by creation date descending.
 */
export async function fetchCurationHistory(
  userId: string,
  limit = 100,
): Promise<LinkedOutCurationAction[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from("linkedout_curation_actions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return []
  }
  return data.map(toCurationAction)
}

/**
 * Fetches curation actions filtered by action type.
 * @param userId - The ID of the user.
 * @param action - The curation action type to filter by.
 * @param limit - Maximum number of actions to return (default: 100).
 * @returns An array of LinkedOutCurationAction objects of the specified type.
 */
export async function fetchCurationActionsByType(
  userId: string,
  action: CurationActionType,
  limit = 100,
): Promise<LinkedOutCurationAction[]> {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb
    .from("linkedout_curation_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return []
  }
  return data.map(toCurationAction)
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

/**
 * Maps a database row to a LinkedOutObjective.
 * @param row - The raw database row.
 * @returns A typed LinkedOutObjective object.
 */
function toObjective(row: Record<string, unknown>): LinkedOutObjective {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    label: row.label as string,
    keywords: (row.keywords as string[]) ?? [],
    industries: (row.industries as string[]) ?? [],
    skills: (row.skills as string[]) ?? [],
    notePrefix: (row.note_prefix as string) ?? "",
    isActive: (row.is_active as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Maps a database row to a LinkedOutContactState.
 * @param row - The raw database row.
 * @returns A typed LinkedOutContactState object.
 */
function toContactState(row: Record<string, unknown>): LinkedOutContactState {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    profileId: row.profile_id as string,
    objectiveId: row.objective_id as string,
    queueStatus: row.queue_status as QueueStatus,
    score: row.score as number | null,
    intentFit: row.intent_fit as number | null,
    relationshipStrength: row.relationship_strength as number | null,
    freshness: row.freshness as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Maps a database row to a LinkedOutOutreachEvent.
 * @param row - The raw database row.
 * @returns A typed LinkedOutOutreachEvent object.
 */
function toOutreachEvent(row: Record<string, unknown>): LinkedOutOutreachEvent {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    profileId: row.profile_id as string,
    eventType: row.event_type as OutreachEventType,
    objectiveId: row.objective_id as string | null,
    payload: row.payload as Record<string, unknown> | null,
    createdAt: row.created_at as string,
  }
}

/**
 * Maps a database row to a LinkedOutCurationAction.
 * @param row - The raw database row.
 * @returns A typed LinkedOutCurationAction object.
 */
function toCurationAction(row: Record<string, unknown>): LinkedOutCurationAction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    profileIds: (row.profile_ids as string[]) ?? [],
    action: row.action as CurationActionType,
    note: row.note as string | null,
    createdAt: row.created_at as string,
  }
}
