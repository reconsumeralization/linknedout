/** Possible states for a contact in the outreach queue */
export type QueueStatus = "intro" | "nurture" | "curate" | "archived" | "whitelisted"

/** Types of outreach events that can be tracked */
export type OutreachEventType = "note_copied" | "profile_opened" | "intro_generated" | "cull_exported"

/** Actions that can be taken during contact curation */
export type CurationActionType = "cull" | "whitelist" | "archive" | "restore"

/**
 * Represents an outreach objective with targeting criteria
 */
export interface LinkedOutObjective {
  /** Unique identifier for the objective */
  id: string
  /** ID of the user who owns this objective */
  userId: string
  /** Human-readable label for the objective */
  label: string
  /** Keywords to match against profiles */
  keywords: string[]
  /** Industries to target */
  industries: string[]
  /** Skills to look for in profiles */
  skills: string[]
  /** Prefix text for outreach notes */
  notePrefix: string
  /** Whether this objective is currently active */
  isActive: boolean
  /** ISO timestamp of when the objective was created */
  createdAt: string
  /** ISO timestamp of when the objective was last updated */
  updatedAt: string
}

/**
 * Represents the current state of a contact in the outreach system
 */
export interface LinkedOutContactState {
  /** Unique identifier for the contact state */
  id: string
  /** ID of the user who owns this contact */
  userId: string
  /** LinkedIn profile ID of the contact */
  profileId: string
  /** ID of the associated objective */
  objectiveId: string
  /** Current position in the outreach queue */
  queueStatus: QueueStatus
  /** Overall contact score (0-100), null if not calculated */
  score: number | null
  /** Intent fit score component, null if not calculated */
  intentFit: number | null
  /** Relationship strength score component, null if not calculated */
  relationshipStrength: number | null
  /** Freshness score component, null if not calculated */
  freshness: number | null
  /** ISO timestamp of when the contact state was created */
  createdAt: string
  /** ISO timestamp of when the contact state was last updated */
  updatedAt: string
}

/**
 * Represents a tracked outreach event
 */
export interface LinkedOutOutreachEvent {
  /** Unique identifier for the event */
  id: string
  /** ID of the user who triggered the event */
  userId: string
  /** LinkedIn profile ID associated with the event */
  profileId: string
  /** Type of outreach event */
  eventType: OutreachEventType
  /** ID of the associated objective, null if not applicable */
  objectiveId: string | null
  /** Additional event-specific data */
  payload: Record<string, unknown> | null
  /** ISO timestamp of when the event occurred */
  createdAt: string
}

/**
 * Represents a curation action taken on one or more contacts
 */
export interface LinkedOutCurationAction {
  /** Unique identifier for the curation action */
  id: string
  /** ID of the user who performed the action */
  userId: string
  /** LinkedIn profile IDs affected by this action */
  profileIds: string[]
  /** Type of curation action taken */
  action: CurationActionType
  /** Optional note explaining the action */
  note: string | null
  /** ISO timestamp of when the action was taken */
  createdAt: string
}
