import { parseLinkedInCsv, type ParsedProfile } from "@/lib/csv/csv-parser"
import {
  type SupabaseProfileView,
} from "@/lib/supabase/supabase-data"
import {
  type TribeDesignPreviewEventDetail,
  type TribeDesignPreviewOutput,
  type TribeDesignPreviewTribe,
} from "@/lib/shared/tribe-design-preview-events"
import type { Tribe, TribeRadarDataPoint, TribeRole, TribeSkillDistPoint, TribeMember } from "@/lib/shared/types"

// ─── Constants ───────────────────────────────────────────────────────────────

export const TRIBE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export const ALL_ROLES: TribeRole[] = ["Lead", "Strategist", "Executor", "Creative", "Analyst", "Connector"]

const OPTIMIZE_SKILL_POOLS: Record<string, string[]> = {
  balanced:   ["Strategy", "Communication", "Analysis", "Leadership", "Delivery", "Research"],
  skills:     ["Engineering", "Data", "ML", "Architecture", "DevOps", "Security"],
  diversity:  ["Design", "Marketing", "Finance", "Operations", "Legal", "Research"],
  seniority:  ["Leadership", "Mentoring", "Governance", "Stakeholder Mgmt", "OKRs", "Vision"],
  speed:      ["Agile", "Automation", "CI/CD", "Delivery", "Lean", "Sprints"],
}

export const DESIGN_PREVIEW_ID_PREFIX = "design-preview-"

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function computeSkillDist(members: TribeMember[]): TribeSkillDistPoint[] {
  const freq: Record<string, number> = {}
  for (const m of members) {
    for (const s of m.skills ?? []) {
      freq[s] = (freq[s] ?? 0) + 1
    }
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }))
}

export function computeRoleDistribution(members: TribeMember[]): { role: TribeRole; count: number }[] {
  const counts: Record<TribeRole, number> = {} as Record<TribeRole, number>
  for (const r of ALL_ROLES) counts[r] = 0
  for (const m of members) {
    const r = (m.tribeRole as TribeRole) || "Executor"
    counts[r] = (counts[r] ?? 0) + 1
  }
  return ALL_ROLES.map((role) => ({ role, count: counts[role] })).filter((x) => x.count > 0)
}

export function computeRadarData(
  members: TribeMember[],
  cohesion: number,
  complementarity: number,
): TribeRadarDataPoint[] {
  const roles = members.map(m => m.tribeRole)
  const uniqueRoles = new Set(roles).size
  const diversity = Math.min(100, uniqueRoles * 14 + 20)
  const hasLead = roles.includes("Lead")
  const leadership = Math.min(100, Math.round((hasLead ? cohesion : cohesion * 0.8) * 10))
  const hasSenior = members.some(
    m => m.seniority === "Senior" || m.seniority === "Principal" || m.seniority === "Executive",
  )
  const speed = Math.min(100, Math.round((hasSenior ? complementarity + 0.5 : complementarity) * 9))
  return [
    { metric: "Cohesion",      value: Math.round(cohesion * 10) },
    { metric: "Skills",        value: Math.round(complementarity * 10) },
    { metric: "Diversity",     value: Math.max(15, diversity) },
    { metric: "Leadership",    value: Math.max(20, leadership) },
    { metric: "Speed",         value: Math.max(20, speed) },
  ]
}

export function formatPercent(value: number | undefined, digits = 1): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return `${value.toFixed(digits)}%`
}

type RealtimeToolSuccess<T> = { ok: true; output: T }
type RealtimeToolFailure = { ok?: false; error?: string; details?: unknown }

export type TribeCompositionAnalysisOutput = {
  healthScore?: number
  avgMatchScore?: number
  avgConnections?: number
  avgExperienceYears?: number
  topSkills?: Array<{ skill?: string; count?: number; percentage?: number }>
  requiredSkillCoverage?: Array<{ skill?: string; coveragePercent?: number }>
  gapSkills?: string[]
  recommendedAdds?: Array<{ name?: string; reasons?: string[] }>
  seniorityMix?: Array<{ label?: string; count?: number; percentage?: number }>
  industryMix?: Array<{ label?: string; count?: number; percentage?: number }>
}

function normalizeSkillKey(value: string): string {
  return value.trim().toLowerCase()
}

function clampTribeScore(value: number): number {
  return Number(Math.max(1, Math.min(10, value)).toFixed(1))
}

function averageNumbers(values: number[]): number {
  if (values.length === 0) return 0
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
}

function buildCsvProfileDisplayName(profile: ParsedProfile): string {
  return `${profile.firstName} ${profile.lastName}`.trim() || profile.company || profile.headline || "Profile"
}

function getMostCommonString(values: string[], fallback: string): string {
  const counts = new Map<string, number>()
  values.map((value) => value.trim()).filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1)
  })
  if (counts.size === 0) return fallback
  return Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })[0]?.[0] || fallback
}

export function groupCsvProfilesForTribes(profiles: ParsedProfile[]): Array<{ skill: string; profiles: ParsedProfile[] }> {
  const groups = new Map<string, ParsedProfile[]>()
  profiles.forEach((profile) => {
    const key = profile.skills[0]?.trim() || "General"
    const existing = groups.get(key) || []
    existing.push(profile)
    groups.set(key, existing)
  })
  const groupedEntries = Array.from(groups.entries())
  const mergedEntries = groupedEntries
    .filter(([, members]) => members.length >= 2)
    .map(([skill, members]) => ({ skill, profiles: members }))
  const generalMembers = groupedEntries
    .filter(([, members]) => members.length < 2)
    .flatMap(([, members]) => members)
  if (generalMembers.length > 0) {
    mergedEntries.push({ skill: "General", profiles: generalMembers })
  }
  return mergedEntries.sort((left, right) => {
    if (right.profiles.length !== left.profiles.length) return right.profiles.length - left.profiles.length
    return left.skill.localeCompare(right.skill)
  })
}

function estimateMemberExperienceYears(members: TribeMember[]): number {
  if (members.length === 0) return 0
  const total = members.reduce((sum, member) => {
    const seniority = (member.seniority || "").toLowerCase()
    if (seniority.includes("junior")) return sum + 2
    if (seniority.includes("mid")) return sum + 5
    if (seniority.includes("senior")) return sum + 8
    if (seniority.includes("staff") || seniority.includes("principal") || seniority.includes("lead")) return sum + 11
    if (seniority.includes("vp") || seniority.includes("director") || seniority.includes("chief") || seniority.includes("cxo")) return sum + 14
    return sum + 6
  }, 0)
  return Number((total / members.length).toFixed(1))
}

function buildCsvOptimizeScore(profile: ParsedProfile, optimize: string): number {
  const profileSkills = new Set(profile.skills.map((skill) => normalizeSkillKey(skill)))
  const optimizePool = (OPTIMIZE_SKILL_POOLS[optimize] ?? OPTIMIZE_SKILL_POOLS.balanced).map(normalizeSkillKey)
  const poolMatches = optimizePool.filter((skill) => profileSkills.has(skill)).length
  const seniority = profile.seniority.toLowerCase()
  if (optimize === "skills") return poolMatches * 12 + profile.skills.length * 4
  if (optimize === "diversity") return poolMatches * 10 + (profile.location ? 6 : 0) + (profile.industry ? 6 : 0)
  if (optimize === "seniority") {
    return (
      (seniority.includes("principal") || seniority.includes("staff") || seniority.includes("director") || seniority.includes("vp") ? 24 : 0) +
      (seniority.includes("senior") ? 12 : 0)
    )
  }
  if (optimize === "speed") return poolMatches * 11 + (seniority.includes("lead") || seniority.includes("senior") ? 10 : 0)
  return poolMatches * 8 + profile.skills.length * 2
}

export function mergeDistinctStrings(primary: string[] | undefined, fallback: string[] | undefined, limit = 6): string[] {
  return Array.from(new Set([...(primary ?? []), ...(fallback ?? [])].map((value) => value.trim()).filter(Boolean))).slice(0, limit)
}

export function buildCsvAutoGroupedTribe(skill: string, groupedProfiles: ParsedProfile[], index: number): Tribe {
  const members: TribeMember[] = groupedProfiles.map((profile, memberIndex) => ({
    personId: profile.id || `csv-m-${index}-${memberIndex}`,
    name: buildCsvProfileDisplayName(profile),
    tribeRole: ALL_ROLES[memberIndex % ALL_ROLES.length],
    projectRoles: [],
    tags: ["csv-imported"],
    seniority: profile.seniority || "Mid",
    skills: profile.skills.length > 0 ? profile.skills : [skill],
  }))
  const skillDist = computeSkillDist(members)
  const commonSkills = skillDist.map((item) => item.name).slice(0, 8)
  const coveragePercent =
    skill !== "General" && groupedProfiles.length > 0
      ? Number(((groupedProfiles.filter((profile) =>
          profile.skills.some((profileSkill) => normalizeSkillKey(profileSkill) === normalizeSkillKey(skill)),
        ).length / groupedProfiles.length) * 100).toFixed(1))
      : undefined
  const baseTribe: Tribe = {
    id: `csv-tribe-${index}`,
    name: `${skill} Team`,
    description: `Auto-grouped from CSV: profiles with ${skill} skills`,
    members,
    commonSkills: commonSkills.length > 0 ? commonSkills : [skill],
    avgExperience: estimateMemberExperienceYears(members),
    industryFocus: getMostCommonString(groupedProfiles.map((profile) => profile.industry || ""), "Mixed"),
    projects: [],
    cohesion: 0,
    complementarity: 0,
    strengths: [`Auto-grouped around ${skill}`, "CSV-imported team"],
    radarData: [],
    skillDist,
    status: "active",
    requiredSkillCoveragePercent: coveragePercent,
  }
  const analyzedTribe = buildLocalReanalyzedTribe(baseTribe)
  return {
    ...analyzedTribe,
    strengths: [
      `Auto-grouped around ${skill}`,
      `Imported ${groupedProfiles.length} CSV profile${groupedProfiles.length === 1 ? "" : "s"}`,
      ...(analyzedTribe.strengths || []).slice(1, 4),
    ].slice(0, 4),
    requiredSkillCoveragePercent: coveragePercent ?? analyzedTribe.requiredSkillCoveragePercent,
  }
}

export function buildCsvFormTribe(
  csvData: string,
  input: { name: string; description: string; size: number; optimize: string; requiredSkills: string[] },
): Tribe | null {
  const parsedProfiles = parseLinkedInCsv(csvData)
  if (parsedProfiles.length < 2) return null
  const requiredSkills = input.requiredSkills.map((skill) => skill.trim()).filter(Boolean)
  const rankedProfiles = parsedProfiles
    .map((profile) => {
      const skillMatches = requiredSkills.filter((skill) =>
        profile.skills.some((profileSkill) => normalizeSkillKey(profileSkill) === normalizeSkillKey(skill)),
      ).length
      const optimizeScore = buildCsvOptimizeScore(profile, input.optimize)
      return {
        profile,
        score: skillMatches * 70 + optimizeScore + Math.min(profile.connections, 2000) * 0.015 + profile.skills.length * 3,
        skillMatches,
      }
    })
    .sort((left, right) => {
      if (right.skillMatches !== left.skillMatches) return right.skillMatches - left.skillMatches
      if (right.score !== left.score) return right.score - left.score
      return buildCsvProfileDisplayName(left.profile).localeCompare(buildCsvProfileDisplayName(right.profile))
    })
  const selected = rankedProfiles.slice(0, input.size).map((entry) => entry.profile)
  if (selected.length < 2) return null
  const members: TribeMember[] = selected.map((profile, index) => ({
    personId: profile.id,
    name: buildCsvProfileDisplayName(profile),
    tribeRole: ALL_ROLES[index % ALL_ROLES.length],
    projectRoles: [],
    tags: ["csv-formed"],
    seniority: profile.seniority || "Mid",
    skills: profile.skills,
  }))
  const skillDist = computeSkillDist(members)
  const commonSkills =
    requiredSkills.length > 0
      ? mergeDistinctStrings(requiredSkills, skillDist.map((item) => item.name), 8)
      : skillDist.map((item) => item.name).slice(0, 8)
  const coveredRequiredSkills = requiredSkills.filter((skill) =>
    members.some((member) => (member.skills || []).some((memberSkill) => normalizeSkillKey(memberSkill) === normalizeSkillKey(skill))),
  ).length
  const requiredSkillCoveragePercent =
    requiredSkills.length > 0
      ? Number(((coveredRequiredSkills / requiredSkills.length) * 100).toFixed(1))
      : undefined
  const averageSkillCount = members.reduce((sum, member) => sum + (member.skills?.length || 0), 0) / Math.max(1, members.length)
  const uniqueSkillCount = new Set(members.flatMap((member) => (member.skills || []).map((skill) => normalizeSkillKey(skill)))).size
  const cohesion = Number(Math.max(1, Math.min(10, (Math.min(uniqueSkillCount, members.length * 2) / Math.max(1, members.length)) * 1.6 + 4.2)).toFixed(1))
  const complementarity = Number(Math.max(1, Math.min(10, (requiredSkillCoveragePercent ?? Math.min(100, averageSkillCount * 18)) / 10)).toFixed(1))
  const name = input.name.trim() || `${input.description.split(" ").slice(0, 2).join(" ")} Tribe`.trim()
  return {
    id: `csv-manual-${Date.now()}`,
    name: name || "CSV Tribe",
    description: input.description,
    members,
    commonSkills: commonSkills.length > 0 ? commonSkills : [OPTIMIZE_SKILL_POOLS[input.optimize]?.[0] ?? "Strategy"],
    avgExperience: estimateMemberExperienceYears(members),
    industryFocus: selected[0]?.industry || "Mixed",
    projects: [],
    cohesion,
    complementarity,
    strengths: [
      requiredSkills.length > 0
        ? `${coveredRequiredSkills}/${requiredSkills.length} required skills represented`
        : `${uniqueSkillCount} distinct skills represented`,
      `Selected from ${parsedProfiles.length} CSV profiles`,
      commonSkills.length > 0 ? `Strongest coverage in ${commonSkills.slice(0, 2).join(" + ")}` : "Balanced skill coverage",
    ],
    radarData: computeRadarData(members, cohesion, complementarity),
    skillDist,
    status: "forming",
    requiredSkillCoveragePercent,
  }
}

export function buildLocalReanalyzedTribe(tribe: Tribe): Tribe {
  const members = tribe.members || []
  const skillDist = computeSkillDist(members)
  const roleDist = computeRoleDistribution(members)
  const commonSkills = skillDist.map((item) => item.name).slice(0, 8)
  const uniqueSkillCount = new Set(members.flatMap((member) => (member.skills || []).map((skill) => normalizeSkillKey(skill)))).size
  const averageSkillCoverage =
    skillDist.length > 0 && members.length > 0
      ? averageNumbers(skillDist.slice(0, 4).map((item) => (item.value / members.length) * 100))
      : 0
  const senioritySpread = new Set(members.map((member) => (member.seniority || "Unknown").trim()).filter(Boolean)).size
  const cohesion = clampTribeScore(4.2 + roleDist.length * 0.55 + averageSkillCoverage * 0.03)
  const complementarity = clampTribeScore(4 + senioritySpread * 0.65 + Math.min(4, uniqueSkillCount / Math.max(1, members.length)))
  return {
    ...tribe,
    commonSkills: commonSkills.length > 0 ? commonSkills : tribe.commonSkills,
    avgExperience: estimateMemberExperienceYears(members),
    cohesion,
    complementarity,
    strengths: [
      `Local composition refreshed from ${members.length} member${members.length === 1 ? "" : "s"}`,
      commonSkills.length > 0 ? `Top skills: ${commonSkills.slice(0, 3).join(", ")}` : "No dominant skill pattern detected",
      roleDist.length > 1 ? `${roleDist.length} active role types represented` : "Role mix is concentrated in one lane",
      averageSkillCoverage > 0 ? `${averageSkillCoverage.toFixed(1)}% top-skill coverage` : "Add skills to improve composition visibility",
    ],
    radarData: computeRadarData(members, cohesion, complementarity),
    skillDist,
    requiredSkillCoveragePercent: averageSkillCoverage > 0 ? averageSkillCoverage : tribe.requiredSkillCoveragePercent,
    status: "active",
  }
}

export function buildPersistedReanalyzedTribe(tribe: Tribe, analysis: TribeCompositionAnalysisOutput): Tribe {
  const averageCoverage = averageNumbers(
    (analysis.requiredSkillCoverage || [])
      .map((item) => (typeof item.coveragePercent === "number" ? item.coveragePercent : 0))
      .filter((value) => Number.isFinite(value)),
  )
  const topSkills = (analysis.topSkills || [])
    .map((item) => ({ skill: item.skill?.trim() || "", count: typeof item.count === "number" ? item.count : undefined, percentage: typeof item.percentage === "number" ? item.percentage : undefined }))
    .filter((item) => item.skill)
  const diversitySignal = Math.min(4, (analysis.seniorityMix?.length || 0) * 0.75 + (analysis.industryMix?.length || 0) * 0.35)
  const healthScore = typeof analysis.healthScore === "number" ? analysis.healthScore : tribe.cohesion || 7
  const avgMatchScore = typeof analysis.avgMatchScore === "number" ? analysis.avgMatchScore : (tribe.cohesion || 7) * 10
  const cohesion = clampTribeScore((avgMatchScore / 10) * 0.65 + healthScore * 0.35)
  const complementarity = clampTribeScore((averageCoverage > 0 ? averageCoverage / 10 : healthScore) * 0.55 + diversitySignal)
  const nextSkillDist =
    topSkills.length > 0
      ? topSkills.slice(0, 6).map((item) => ({
          name: item.skill,
          value: item.count || Math.max(1, Math.round(((item.percentage || 0) / 100) * Math.max(1, tribe.members.length))),
        }))
      : computeSkillDist(tribe.members)
  const nextCommonSkills = topSkills.length > 0 ? topSkills.map((item) => item.skill).slice(0, 8) : tribe.commonSkills
  const nextStrengths = [
    `${healthScore.toFixed(1)}/10 composition health`,
    typeof analysis.avgMatchScore === "number" ? `Avg CRM match score ${analysis.avgMatchScore.toFixed(1)}` : null,
    nextCommonSkills.length > 0 ? `Top skills: ${nextCommonSkills.slice(0, 3).join(", ")}` : null,
    analysis.gapSkills && analysis.gapSkills.length > 0
      ? `Coverage gaps: ${analysis.gapSkills.slice(0, 2).join(", ")}`
      : averageCoverage > 0 ? `${averageCoverage.toFixed(1)}% core-skill coverage` : null,
    analysis.recommendedAdds && analysis.recommendedAdds[0]?.name
      ? `Top add: ${analysis.recommendedAdds[0].name}${analysis.recommendedAdds[0].reasons?.[0] ? ` - ${analysis.recommendedAdds[0].reasons?.[0]}` : ""}`
      : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 4)
  return {
    ...tribe,
    commonSkills: nextCommonSkills,
    avgExperience: typeof analysis.avgExperienceYears === "number" ? analysis.avgExperienceYears : tribe.avgExperience,
    cohesion,
    complementarity,
    strengths: nextStrengths.length > 0 ? nextStrengths : tribe.strengths,
    radarData: computeRadarData(tribe.members, cohesion, complementarity),
    skillDist: nextSkillDist,
    requiredSkillCoveragePercent: averageCoverage > 0 ? averageCoverage : tribe.requiredSkillCoveragePercent,
    status: "active",
  }
}

function formatRealtimeToolError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const error = "error" in payload ? payload.error : null
    if (typeof error === "string" && error.trim()) return error
    const details = "details" in payload ? payload.details : null
    if (Array.isArray(details) && details.length > 0) {
      const firstDetail = details.find((detail) => typeof detail === "string")
      if (typeof firstDetail === "string" && firstDetail.trim()) return firstDetail
    }
  }
  return fallback
}

export async function executeRealtimeToolRequest<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/realtime/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  })
  const payload = (await response.json()) as RealtimeToolSuccess<T> | RealtimeToolFailure
  if (!response.ok || !payload.ok || !("output" in payload)) {
    throw new Error(formatRealtimeToolError(payload, `Failed to execute ${name}.`))
  }
  return payload.output
}

function sanitizeDesignPreviewId(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, "-")
}

function buildProfileDisplayName(profile: SupabaseProfileView): string {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim()
  return fullName || profile.company || profile.headline || "Profile"
}

export function hydrateDesignPreviewMember(
  member: TribeMember,
  fallbackSkills: string[],
  profilesById: Map<string, SupabaseProfileView>,
): TribeMember {
  const profile = profilesById.get(member.personId)
  if (!profile) return member
  return {
    ...member,
    name: buildProfileDisplayName(profile),
    seniority: profile.seniority || member.seniority || "Unknown",
    skills: mergeDistinctStrings(profile.skills, member.skills?.length ? member.skills : fallbackSkills),
    tags: mergeDistinctStrings(member.tags, ["design-preview"]),
  }
}

function buildDesignPreviewMembers(
  sourceId: string,
  tribeIndex: number,
  designedTribe: TribeDesignPreviewTribe,
  profilesById: Map<string, SupabaseProfileView>,
): TribeMember[] {
  const fallbackCount = Math.max(0, designedTribe.memberCount)
  const count = Math.max(fallbackCount, designedTribe.profileIds.length)
  const fallbackSkills = designedTribe.topSkills.slice(0, 3)
  return Array.from({ length: count }, (_, i): TribeMember => {
    const profileId = designedTribe.profileIds[i] || `${DESIGN_PREVIEW_ID_PREFIX}${sourceId}-${tribeIndex}-member-${i + 1}`
    const baseMember: TribeMember = {
      personId: profileId,
      name: `Profile ${profileId.length > 10 ? `${profileId.slice(0, 10)}...` : profileId}`,
      tribeRole: ALL_ROLES[i % ALL_ROLES.length],
      projectRoles: [],
      tags: ["design-preview"],
      seniority: "Unknown",
      skills: fallbackSkills,
    }
    return hydrateDesignPreviewMember(baseMember, fallbackSkills, profilesById)
  })
}

export function mapDesignPreviewToTribe(
  detail: TribeDesignPreviewEventDetail,
  designedTribe: TribeDesignPreviewTribe,
  index: number,
  profilesById: Map<string, SupabaseProfileView>,
): Tribe {
  const safeSourceId = sanitizeDesignPreviewId(detail.sourceId)
  const tribeIndex = Math.max(1, designedTribe.tribeIndex || index + 1)
  const members = buildDesignPreviewMembers(safeSourceId, tribeIndex, designedTribe, profilesById)
  const avgMatchScore = typeof designedTribe.avgMatchScore === "number" ? designedTribe.avgMatchScore : 70
  const requiredCoverage = typeof designedTribe.requiredSkillCoveragePercent === "number" ? designedTribe.requiredSkillCoveragePercent : undefined
  const cohesion = Number(Math.max(1, Math.min(10, avgMatchScore / 10)).toFixed(1))
  const complementarity = Number(Math.max(1, Math.min(10, (requiredCoverage ?? avgMatchScore) / 10)).toFixed(1))
  const output: TribeDesignPreviewOutput = detail.output
  const objective = output.objective || "AI tribe design objective"
  const strengths = [
    typeof designedTribe.avgMatchScore === "number" ? `Avg match score ${designedTribe.avgMatchScore.toFixed(1)}` : null,
    typeof designedTribe.avgConnections === "number" ? `Avg network reach ${Math.round(designedTribe.avgConnections)}` : null,
    typeof designedTribe.requiredSkillCoveragePercent === "number" ? `${designedTribe.requiredSkillCoveragePercent.toFixed(1)}% required skills covered` : null,
  ].filter((item): item is string => Boolean(item))
  return {
    id: `${DESIGN_PREVIEW_ID_PREFIX}${safeSourceId}-${tribeIndex}`,
    name: designedTribe.suggestedName || `${objective} - Tribe ${tribeIndex}`,
    description: `Design preview for objective: ${objective}`,
    members,
    commonSkills: designedTribe.topSkills.slice(0, 8),
    avgExperience: typeof designedTribe.avgExperienceYears === "number" ? designedTribe.avgExperienceYears : 0,
    industryFocus: "Design preview",
    projects: [],
    cohesion,
    complementarity,
    strengths: strengths.length > 0 ? strengths : ["AI-designed preview tribe"],
    radarData: computeRadarData(members, cohesion, complementarity),
    skillDist: computeSkillDist(members),
    status: "forming",
    requiredSkillCoveragePercent: designedTribe.requiredSkillCoveragePercent,
    networkSharePercent: designedTribe.networkSharePercent,
    designWindowUsedProfileCount: typeof output.usedProfileCount === "number" ? output.usedProfileCount : undefined,
    designWindowTotalProfiles: typeof output.totalWorkspaceProfiles === "number" ? output.totalWorkspaceProfiles : undefined,
    designWindowLimit: typeof output.profileWindowLimit === "number" ? output.profileWindowLimit : undefined,
    designWindowCoveragePercent: typeof output.networkCoveragePercent === "number" ? output.networkCoveragePercent : undefined,
    designWindowTruncated: typeof output.candidatePoolTruncated === "boolean" ? output.candidatePoolTruncated : undefined,
  }
}
