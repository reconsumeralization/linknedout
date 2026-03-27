/**
 * Recommendation engine — generates actionable suggestions based on
 * profile data, tribe state, and usage patterns.
 */

import type { ParsedProfile } from "@/lib/csv/csv-parser"
import type { Tribe } from "@/lib/shared/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationCategory =
  | "tribe"
  | "profile"
  | "engagement"
  | "project"
  | "content"

export type RecommendationPriority = "high" | "medium" | "low"

export interface Recommendation {
  id: string
  title: string
  description: string
  category: RecommendationCategory
  priority: RecommendationPriority
  actionLabel: string
  /** Serialisable payload so the UI can wire up handlers without closures */
  actionPayload?: Record<string, unknown>
  /** ISO timestamp of when the recommendation was generated */
  createdAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function daysSince(isoDate: string | undefined): number {
  if (!isoDate) return Infinity
  const diff = Date.now() - new Date(isoDate).getTime()
  return Math.floor(diff / 86_400_000)
}

/**
 * Compute a simple Jaccard-like fit score (0-100) between a profile's skills
 * and a tribe's commonSkills list.
 */
function skillFitScore(profileSkills: string[], tribeSkills: string[]): number {
  if (tribeSkills.length === 0 || profileSkills.length === 0) return 0
  const pSet = new Set(profileSkills.map((s) => s.toLowerCase()))
  const tSet = new Set(tribeSkills.map((s) => s.toLowerCase()))
  let intersection = 0
  for (const s of pSet) {
    if (tSet.has(s)) intersection++
  }
  const union = new Set([...pSet, ...tSet]).size
  return Math.round((intersection / union) * 100)
}

// ---------------------------------------------------------------------------
// Rule-based recommendation generators
// ---------------------------------------------------------------------------

/**
 * Suggest unassigned profiles that are a strong fit for an existing tribe.
 */
function tribeFitRecommendations(
  profiles: ParsedProfile[],
  tribes: Tribe[],
): Recommendation[] {
  const recs: Recommendation[] = []
  if (tribes.length === 0 || profiles.length === 0) return recs

  // Build set of already-assigned profile IDs across all tribes
  const assignedIds = new Set<string>()
  for (const t of tribes) {
    for (const m of t.members ?? []) {
      assignedIds.add(m.personId)
    }
  }

  const unassigned = profiles.filter((p) => !assignedIds.has(p.id) && !p.tribe)

  for (const profile of unassigned) {
    for (const tribe of tribes) {
      const score = skillFitScore(profile.skills, tribe.commonSkills)
      if (score >= 60) {
        recs.push({
          id: makeId(),
          title: `Add ${profile.firstName} ${profile.lastName} to ${tribe.name}`,
          description: `${score}% skill fit based on shared competencies: ${tribe.commonSkills.slice(0, 3).join(", ")}.`,
          category: "tribe",
          priority: score >= 80 ? "high" : "medium",
          actionLabel: "Add to Tribe",
          actionPayload: { profileId: profile.id, tribeId: tribe.id },
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  // Keep only the top 5 by score (highest first — sort by the score in the description)
  return recs
    .sort((a, b) => {
      const scoreA = parseInt(a.description) || 0
      const scoreB = parseInt(b.description) || 0
      return scoreB - scoreA
    })
    .slice(0, 5)
}

/**
 * Flag profiles with outdated information (no update in 90+ days).
 */
function staleProfileRecommendations(
  profiles: ParsedProfile[],
): Recommendation[] {
  const stale = profiles.filter((p) => daysSince(p.connectedOn) > 90)
  if (stale.length === 0) return []

  return [
    {
      id: makeId(),
      title: `${stale.length} profile${stale.length > 1 ? "s have" : " has"} outdated info`,
      description: `${stale.length} profile${stale.length > 1 ? "s haven't" : " hasn't"} been updated in over 90 days. Review and refresh to keep your CRM accurate.`,
      category: "profile",
      priority: stale.length >= 10 ? "high" : "medium",
      actionLabel: "Review Profiles",
      actionPayload: {
        profileIds: stale.slice(0, 20).map((p) => p.id),
      },
      createdAt: new Date().toISOString(),
    },
  ]
}

/**
 * Flag tribes that have no leader assigned.
 */
function leaderlessTribes(tribes: Tribe[]): Recommendation[] {
  const leaderless = tribes.filter(
    (t) =>
      !t.leaderId &&
      !t.members?.some(
        (m) =>
          m.tribeRole === "leader" ||
          m.tribeRole === "admin" ||
          m.tribeRole === "owner",
      ),
  )

  return leaderless.map((t) => ({
    id: makeId(),
    title: `${t.name} has no leader assigned`,
    description: `Assign a leader to improve coordination and accountability within the tribe.`,
    category: "tribe",
    priority: "medium" as const,
    actionLabel: "Assign Leader",
    actionPayload: { tribeId: t.id },
    createdAt: new Date().toISOString(),
  }))
}

/**
 * Suggest engagement actions when usage drops (content, tools, etc.).
 * Checks localStorage for last-used timestamps of key features.
 */
function engagementRecommendations(): Recommendation[] {
  const recs: Recommendation[] = []

  if (typeof window === "undefined") return recs

  const features: Array<{
    key: string
    label: string
    thresholdDays: number
  }> = [
    {
      key: "linkedout_last_content_amplifier",
      label: "Content Amplifier",
      thresholdDays: 14,
    },
    {
      key: "linkedout_last_tribe_analysis",
      label: "Tribe Analysis",
      thresholdDays: 21,
    },
    {
      key: "linkedout_last_csv_import",
      label: "CSV Import",
      thresholdDays: 30,
    },
  ]

  for (const feat of features) {
    const lastUsed = localStorage.getItem(feat.key)
    const days = daysSince(lastUsed ?? undefined)
    if (days >= feat.thresholdDays && days !== Infinity) {
      recs.push({
        id: makeId(),
        title: `You haven't used ${feat.label} in ${days} days`,
        description: `Re-engage with ${feat.label} to keep your network insights fresh and actionable.`,
        category: "engagement",
        priority: days >= 30 ? "high" : "low",
        actionLabel: `Open ${feat.label}`,
        actionPayload: { feature: feat.key },
        createdAt: new Date().toISOString(),
      })
    }
  }

  return recs
}

/**
 * Detect tribes with very low member count (< 3) or very high count (> 20).
 */
function tribeSizeRecommendations(tribes: Tribe[]): Recommendation[] {
  const recs: Recommendation[] = []

  for (const t of tribes) {
    const count = t.members?.length ?? t.activeMemberCount ?? 0
    if (count > 0 && count < 3) {
      recs.push({
        id: makeId(),
        title: `${t.name} only has ${count} member${count === 1 ? "" : "s"}`,
        description: `Small tribes lose momentum. Consider merging with a related tribe or recruiting new members.`,
        category: "tribe",
        priority: "low",
        actionLabel: "Grow Tribe",
        actionPayload: { tribeId: t.id },
        createdAt: new Date().toISOString(),
      })
    } else if (count > 20) {
      recs.push({
        id: makeId(),
        title: `${t.name} has ${count} members — consider splitting`,
        description: `Large tribes can lose focus. Split into sub-groups for better coordination.`,
        category: "tribe",
        priority: "low",
        actionLabel: "Review Tribe",
        actionPayload: { tribeId: t.id },
        createdAt: new Date().toISOString(),
      })
    }
  }

  return recs
}

/**
 * Spot skill gaps — skills that appear in profiles but aren't covered by any tribe.
 */
function skillGapRecommendations(
  profiles: ParsedProfile[],
  tribes: Tribe[],
): Recommendation[] {
  if (profiles.length === 0 || tribes.length === 0) return []

  // Count skill frequency across profiles
  const skillCount = new Map<string, number>()
  for (const p of profiles) {
    for (const s of p.skills) {
      const lower = s.toLowerCase()
      skillCount.set(lower, (skillCount.get(lower) ?? 0) + 1)
    }
  }

  // Collect all tribe-covered skills
  const coveredSkills = new Set<string>()
  for (const t of tribes) {
    for (const s of t.commonSkills) {
      coveredSkills.add(s.toLowerCase())
    }
  }

  // Find popular uncovered skills
  const uncovered = [...skillCount.entries()]
    .filter(([skill, count]) => !coveredSkills.has(skill) && count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  if (uncovered.length === 0) return []

  const skillNames = uncovered.map(([s]) => s).join(", ")
  return [
    {
      id: makeId(),
      title: `Uncovered skills: ${skillNames}`,
      description: `${uncovered.length} popular skill${uncovered.length > 1 ? "s are" : " is"} not represented in any tribe. Consider creating a new tribe around ${uncovered[0][0]}.`,
      category: "tribe",
      priority: "medium",
      actionLabel: "Create Tribe",
      actionPayload: {
        suggestedSkills: uncovered.map(([s]) => s),
      },
      createdAt: new Date().toISOString(),
    },
  ]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all recommendation rules and return a prioritised list.
 */
export function getRecommendations(
  profiles: ParsedProfile[],
  tribes: Tribe[],
): Recommendation[] {
  const all: Recommendation[] = [
    ...tribeFitRecommendations(profiles, tribes),
    ...staleProfileRecommendations(profiles),
    ...leaderlessTribes(tribes),
    ...engagementRecommendations(),
    ...tribeSizeRecommendations(tribes),
    ...skillGapRecommendations(profiles, tribes),
  ]

  // Sort by priority: high > medium > low
  const order: Record<RecommendationPriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  }
  all.sort((a, b) => order[a.priority] - order[b.priority])

  return all
}
