"use client"

import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { CrmTalentNav } from "@/components/crm-talent-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ActiveView } from "@/app/page"
import { parseLinkedInCsv, type ParsedProfile } from "@/lib/csv/csv-parser"
import {
  fetchSupabaseProfiles,
  fetchSupabaseProjects,
  fetchSupabaseTribes,
  subscribeToProfiles,
  subscribeToTribes,
  type SupabaseProfileView,
} from "@/lib/supabase/supabase-data"
import {
  addTribeDesignPreviewEventListener,
  type TribeDesignPreviewEventDetail,
  type TribeDesignPreviewOutput,
  type TribeDesignPreviewTribe,
} from "@/lib/shared/tribe-design-preview-events"
import type { Tribe, TribeRadarDataPoint, TribeRole, TribeSkillDistPoint, TribesPanelProps, TribeMember } from "@/lib/shared/types"
import { cn } from "@/lib/shared/utils"
import {
  Brain,
  ChevronRight,
  FileUp,
  FolderKanban,
  Layers,
  Pencil,
  Plus,
  Shuffle,
  Sparkles,
  Star,
  Target,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

// ─── Constants ───────────────────────────────────────────────────────────────

const TRIBE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const roleColors: Record<TribeRole, string> = {
  Lead: "bg-primary/15 text-primary",
  Strategist: "bg-accent/15 text-accent",
  Executor: "bg-chart-3/15 text-chart-3",
  Creative: "bg-chart-5/15 text-chart-5",
  Analyst: "bg-chart-4/15 text-chart-4",
  Connector: "bg-chart-2/15 text-chart-2",
}

const ALL_ROLES: TribeRole[] = ["Lead", "Strategist", "Executor", "Creative", "Analyst", "Connector"]

const OPTIMIZE_SKILL_POOLS: Record<string, string[]> = {
  balanced:   ["Strategy", "Communication", "Analysis", "Leadership", "Delivery", "Research"],
  skills:     ["Engineering", "Data", "ML", "Architecture", "DevOps", "Security"],
  diversity:  ["Design", "Marketing", "Finance", "Operations", "Legal", "Research"],
  seniority:  ["Leadership", "Mentoring", "Governance", "Stakeholder Mgmt", "OKRs", "Vision"],
  speed:      ["Agile", "Automation", "CI/CD", "Delivery", "Lean", "Sprints"],
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function computeSkillDist(members: TribeMember[]): TribeSkillDistPoint[] {
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

function computeRoleDistribution(members: TribeMember[]): { role: TribeRole; count: number }[] {
  const counts: Record<TribeRole, number> = {} as Record<TribeRole, number>
  for (const r of ALL_ROLES) counts[r] = 0
  for (const m of members) {
    const r = (m.tribeRole as TribeRole) || "Executor"
    counts[r] = (counts[r] ?? 0) + 1
  }
  return ALL_ROLES.map((role) => ({ role, count: counts[role] })).filter((x) => x.count > 0)
}

function computeRadarData(
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

function formatPercent(value: number | undefined, digits = 1): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return `${value.toFixed(digits)}%`
}

type RealtimeToolSuccess<T> = {
  ok: true
  output: T
}

type RealtimeToolFailure = {
  ok?: false
  error?: string
  details?: unknown
}

type TribeCompositionAnalysisOutput = {
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
  if (values.length === 0) {
    return 0
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
}

function buildCsvProfileDisplayName(profile: ParsedProfile): string {
  return `${profile.firstName} ${profile.lastName}`.trim() || profile.company || profile.headline || "Profile"
}

function getMostCommonString(values: string[], fallback: string): string {
  const counts = new Map<string, number>()
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      counts.set(value, (counts.get(value) || 0) + 1)
    })

  if (counts.size === 0) {
    return fallback
  }

  return Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return left[0].localeCompare(right[0])
    })[0]?.[0] || fallback
}

function groupCsvProfilesForTribes(profiles: ParsedProfile[]): Array<{ skill: string; profiles: ParsedProfile[] }> {
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
    if (right.profiles.length !== left.profiles.length) {
      return right.profiles.length - left.profiles.length
    }
    return left.skill.localeCompare(right.skill)
  })
}

function buildCsvAutoGroupedTribe(
  skill: string,
  groupedProfiles: ParsedProfile[],
  index: number,
): Tribe {
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
      ? Number(
          (
            (groupedProfiles.filter((profile) =>
              profile.skills.some((profileSkill) => normalizeSkillKey(profileSkill) === normalizeSkillKey(skill)),
            ).length /
              groupedProfiles.length) *
            100
          ).toFixed(1),
        )
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

function estimateMemberExperienceYears(members: TribeMember[]): number {
  if (members.length === 0) {
    return 0
  }

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

  if (optimize === "skills") {
    return poolMatches * 12 + profile.skills.length * 4
  }
  if (optimize === "diversity") {
    return poolMatches * 10 + (profile.location ? 6 : 0) + (profile.industry ? 6 : 0)
  }
  if (optimize === "seniority") {
    return (
      (seniority.includes("principal") || seniority.includes("staff") || seniority.includes("director") || seniority.includes("vp") ? 24 : 0) +
      (seniority.includes("senior") ? 12 : 0)
    )
  }
  if (optimize === "speed") {
    return poolMatches * 11 + (seniority.includes("lead") || seniority.includes("senior") ? 10 : 0)
  }
  return poolMatches * 8 + profile.skills.length * 2
}

function buildCsvFormTribe(
  csvData: string,
  input: {
    name: string
    description: string
    size: number
    optimize: string
    requiredSkills: string[]
  },
): Tribe | null {
  const parsedProfiles = parseLinkedInCsv(csvData)
  if (parsedProfiles.length < 2) {
    return null
  }

  const requiredSkills = input.requiredSkills.map((skill) => skill.trim()).filter(Boolean)
  const rankedProfiles = parsedProfiles
    .map((profile) => {
      const skillMatches = requiredSkills.filter((skill) =>
        profile.skills.some((profileSkill) => normalizeSkillKey(profileSkill) === normalizeSkillKey(skill)),
      ).length
      const optimizeScore = buildCsvOptimizeScore(profile, input.optimize)
      return {
        profile,
        score:
          skillMatches * 70 +
          optimizeScore +
          Math.min(profile.connections, 2000) * 0.015 +
          profile.skills.length * 3,
        skillMatches,
      }
    })
    .sort((left, right) => {
      if (right.skillMatches !== left.skillMatches) return right.skillMatches - left.skillMatches
      if (right.score !== left.score) return right.score - left.score
      return buildCsvProfileDisplayName(left.profile).localeCompare(buildCsvProfileDisplayName(right.profile))
    })

  const selected = rankedProfiles.slice(0, input.size).map((entry) => entry.profile)
  if (selected.length < 2) {
    return null
  }

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
  const averageSkillCount =
    members.reduce((sum, member) => sum + (member.skills?.length || 0), 0) / Math.max(1, members.length)
  const uniqueSkillCount = new Set(
    members.flatMap((member) => (member.skills || []).map((skill) => normalizeSkillKey(skill))),
  ).size
  const cohesion = Number(
    Math.max(
      1,
      Math.min(10, (Math.min(uniqueSkillCount, members.length * 2) / Math.max(1, members.length)) * 1.6 + 4.2),
    ).toFixed(1),
  )
  const complementarity = Number(
    Math.max(
      1,
      Math.min(
        10,
        (requiredSkillCoveragePercent ?? Math.min(100, averageSkillCount * 18)) / 10,
      ),
    ).toFixed(1),
  )
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

function buildLocalReanalyzedTribe(tribe: Tribe): Tribe {
  const members = tribe.members || []
  const skillDist = computeSkillDist(members)
  const roleDist = computeRoleDistribution(members)
  const commonSkills = skillDist.map((item) => item.name).slice(0, 8)
  const uniqueSkillCount = new Set(
    members.flatMap((member) => (member.skills || []).map((skill) => normalizeSkillKey(skill))),
  ).size
  const averageSkillCoverage =
    skillDist.length > 0 && members.length > 0
      ? averageNumbers(skillDist.slice(0, 4).map((item) => (item.value / members.length) * 100))
      : 0
  const senioritySpread = new Set(
    members.map((member) => (member.seniority || "Unknown").trim()).filter(Boolean),
  ).size
  const cohesion = clampTribeScore(4.2 + roleDist.length * 0.55 + averageSkillCoverage * 0.03)
  const complementarity = clampTribeScore(
    4 + senioritySpread * 0.65 + Math.min(4, uniqueSkillCount / Math.max(1, members.length)),
  )

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

function buildPersistedReanalyzedTribe(
  tribe: Tribe,
  analysis: TribeCompositionAnalysisOutput,
): Tribe {
  const averageCoverage = averageNumbers(
    (analysis.requiredSkillCoverage || [])
      .map((item) => (typeof item.coveragePercent === "number" ? item.coveragePercent : 0))
      .filter((value) => Number.isFinite(value)),
  )
  const topSkills = (analysis.topSkills || [])
    .map((item) => ({
      skill: item.skill?.trim() || "",
      count: typeof item.count === "number" ? item.count : undefined,
      percentage: typeof item.percentage === "number" ? item.percentage : undefined,
    }))
    .filter((item) => item.skill)
  const diversitySignal =
    Math.min(4, (analysis.seniorityMix?.length || 0) * 0.75 + (analysis.industryMix?.length || 0) * 0.35)
  const healthScore = typeof analysis.healthScore === "number" ? analysis.healthScore : tribe.cohesion || 7
  const avgMatchScore = typeof analysis.avgMatchScore === "number" ? analysis.avgMatchScore : (tribe.cohesion || 7) * 10
  const cohesion = clampTribeScore((avgMatchScore / 10) * 0.65 + healthScore * 0.35)
  const complementarity = clampTribeScore(
    (averageCoverage > 0 ? averageCoverage / 10 : healthScore) * 0.55 + diversitySignal,
  )
  const nextSkillDist =
    topSkills.length > 0
      ? topSkills.slice(0, 6).map((item) => ({
          name: item.skill,
          value:
            item.count ||
            Math.max(1, Math.round(((item.percentage || 0) / 100) * Math.max(1, tribe.members.length))),
        }))
      : computeSkillDist(tribe.members)
  const nextCommonSkills = topSkills.length > 0 ? topSkills.map((item) => item.skill).slice(0, 8) : tribe.commonSkills
  const nextStrengths = [
    `${healthScore.toFixed(1)}/10 composition health`,
    typeof analysis.avgMatchScore === "number" ? `Avg CRM match score ${analysis.avgMatchScore.toFixed(1)}` : null,
    nextCommonSkills.length > 0 ? `Top skills: ${nextCommonSkills.slice(0, 3).join(", ")}` : null,
    analysis.gapSkills && analysis.gapSkills.length > 0
      ? `Coverage gaps: ${analysis.gapSkills.slice(0, 2).join(", ")}`
      : averageCoverage > 0
        ? `${averageCoverage.toFixed(1)}% core-skill coverage`
        : null,
    analysis.recommendedAdds && analysis.recommendedAdds[0]?.name
      ? `Top add: ${analysis.recommendedAdds[0].name}${analysis.recommendedAdds[0].reasons?.[0] ? ` - ${analysis.recommendedAdds[0].reasons?.[0]}` : ""}`
      : null,
  ].filter((item): item is string => Boolean(item)).slice(0, 4)

  return {
    ...tribe,
    commonSkills: nextCommonSkills,
    avgExperience:
      typeof analysis.avgExperienceYears === "number" ? analysis.avgExperienceYears : tribe.avgExperience,
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
    if (typeof error === "string" && error.trim()) {
      return error
    }
    const details = "details" in payload ? payload.details : null
    if (Array.isArray(details) && details.length > 0) {
      const firstDetail = details.find((detail) => typeof detail === "string")
      if (typeof firstDetail === "string" && firstDetail.trim()) {
        return firstDetail
      }
    }
  }
  return fallback
}

async function executeRealtimeToolRequest<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/realtime/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      arguments: args,
    }),
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

function mergeDistinctStrings(primary: string[] | undefined, fallback: string[] | undefined, limit = 6): string[] {
  return Array.from(
    new Set([...(primary ?? []), ...(fallback ?? [])].map((value) => value.trim()).filter(Boolean)),
  ).slice(0, limit)
}

function hydrateDesignPreviewMember(
  member: TribeMember,
  fallbackSkills: string[],
  profilesById: Map<string, SupabaseProfileView>,
): TribeMember {
  const profile = profilesById.get(member.personId)
  if (!profile) {
    return member
  }

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
    const profileId =
      designedTribe.profileIds[i] || `${DESIGN_PREVIEW_ID_PREFIX}${sourceId}-${tribeIndex}-member-${i + 1}`
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

function mapDesignPreviewToTribe(
  detail: TribeDesignPreviewEventDetail,
  designedTribe: TribeDesignPreviewTribe,
  index: number,
  profilesById: Map<string, SupabaseProfileView>,
): Tribe {
  const safeSourceId = sanitizeDesignPreviewId(detail.sourceId)
  const tribeIndex = Math.max(1, designedTribe.tribeIndex || index + 1)
  const members = buildDesignPreviewMembers(safeSourceId, tribeIndex, designedTribe, profilesById)
  const avgMatchScore = typeof designedTribe.avgMatchScore === "number" ? designedTribe.avgMatchScore : 70
  const requiredCoverage =
    typeof designedTribe.requiredSkillCoveragePercent === "number"
      ? designedTribe.requiredSkillCoveragePercent
      : undefined
  const cohesion = Number(Math.max(1, Math.min(10, avgMatchScore / 10)).toFixed(1))
  const complementarity = Number(
    Math.max(1, Math.min(10, (requiredCoverage ?? avgMatchScore) / 10)).toFixed(1),
  )
  const output: TribeDesignPreviewOutput = detail.output
  const objective = output.objective || "AI tribe design objective"

  const strengths = [
    typeof designedTribe.avgMatchScore === "number"
      ? `Avg match score ${designedTribe.avgMatchScore.toFixed(1)}`
      : null,
    typeof designedTribe.avgConnections === "number"
      ? `Avg network reach ${Math.round(designedTribe.avgConnections)}`
      : null,
    typeof designedTribe.requiredSkillCoveragePercent === "number"
      ? `${designedTribe.requiredSkillCoveragePercent.toFixed(1)}% required skills covered`
      : null,
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
    designWindowUsedProfileCount:
      typeof output.usedProfileCount === "number" ? output.usedProfileCount : undefined,
    designWindowTotalProfiles:
      typeof output.totalWorkspaceProfiles === "number" ? output.totalWorkspaceProfiles : undefined,
    designWindowLimit: typeof output.profileWindowLimit === "number" ? output.profileWindowLimit : undefined,
    designWindowCoveragePercent:
      typeof output.networkCoveragePercent === "number" ? output.networkCoveragePercent : undefined,
    designWindowTruncated:
      typeof output.candidatePoolTruncated === "boolean" ? output.candidatePoolTruncated : undefined,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const LINKEDOUT_FILTER_TRIBE_KEY = "linkedout_filter_tribe"
const DESIGN_PREVIEW_ID_PREFIX = "design-preview-"

export function TribesPanel({ csvData, onNavigate, onPageContextChange }: TribesPanelProps) {
  const [selectedTribeId, setSelectedTribeId] = useState<string>("")
  const [tribes, setTribes] = useState<Tribe[]>([])
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false)
  const [dataSource, setDataSource] = useState<"csv" | "supabase">("supabase")
  const [projectNames, setProjectNames] = useState<string[]>([])

  // ── CSV Auto-Group ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!csvData) return
    const profiles = parseLinkedInCsv(csvData)
    if (profiles.length === 0) return
    const groupedProfiles = groupCsvProfilesForTribes(profiles)
    const csvTribes: Tribe[] = groupedProfiles.map((group, idx) =>
      buildCsvAutoGroupedTribe(group.skill, group.profiles, idx),
    )
    if (csvTribes.length > 0) {
      setTribes(csvTribes)
      setSelectedTribeId(csvTribes[0].id)
      setDataSource("csv")
    }
  }, [csvData])

  // ── Dialog state: Form New Tribe ──────────────────────────────────────────
  const [newTribeOpen, setNewTribeOpen] = useState(false)
  const [newTribeName, setNewTribeName] = useState("")
  const [newTribeDesc, setNewTribeDesc] = useState("")
  const [newTribeSize, setNewTribeSize] = useState("5")
  const [newTribeOptimize, setNewTribeOptimize] = useState("balanced")
  const [newTribeSkills, setNewTribeSkills] = useState("")
  const [isFormingTribe, setIsFormingTribe] = useState(false)
  const [newTribeError, setNewTribeError] = useState<string | null>(null)
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null)

  // ── Dialog state: Assign Project ──────────────────────────────────────────
  const [assignProjectOpen, setAssignProjectOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState("")

  // ── Dialog state: Add Member ──────────────────────────────────────────────
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberName, setAddMemberName] = useState("")
  const [addMemberRole, setAddMemberRole] = useState<TribeRole>("Executor")
  const [addMemberSeniority, setAddMemberSeniority] = useState("Mid")
  const [addMemberSkills, setAddMemberSkills] = useState("")

  // ── Inline rename ─────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const handledDesignPreviewSourceIdsRef = useRef<Set<string>>(new Set())
  const designPreviewProfilesByIdRef = useRef<Map<string, SupabaseProfileView>>(new Map())

  // ── Re-analyze ────────────────────────────────────────────────────────────
  const [isReanalyzing, setIsReanalyzing] = useState(false)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const hydrateDesignPreviewTribe = useCallback(
    (tribe: Tribe, profilesById: Map<string, SupabaseProfileView>): Tribe => {
      if (!tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX) || tribe.members.length === 0) {
        return tribe
      }

      let changed = false
      const fallbackSkills = tribe.commonSkills.slice(0, 3)
      const nextMembers = tribe.members.map((member) => {
        const nextMember = hydrateDesignPreviewMember(member, fallbackSkills, profilesById)
        if (
          nextMember !== member &&
          (
            nextMember.name !== member.name ||
            nextMember.seniority !== member.seniority ||
            (nextMember.skills ?? []).join("|") !== (member.skills ?? []).join("|")
          )
        ) {
          changed = true
        }
        return nextMember
      })

      if (!changed) {
        return tribe
      }

      return {
        ...tribe,
        members: nextMembers,
        radarData: computeRadarData(nextMembers, tribe.cohesion ?? 7, tribe.complementarity ?? 7),
        skillDist: computeSkillDist(nextMembers),
      }
    },
    [],
  )

  useEffect(() => {
    const unsubscribe = addTribeDesignPreviewEventListener((detail) => {
      const handled = handledDesignPreviewSourceIdsRef.current
      if (handled.has(detail.sourceId)) {
        return
      }
      handled.add(detail.sourceId)
      const previews = detail.output.designedTribes.map((designedTribe, index) =>
        mapDesignPreviewToTribe(detail, designedTribe, index, designPreviewProfilesByIdRef.current),
      )
      if (previews.length === 0) {
        return
      }
      setTribes((current) => {
        const persisted = current.filter((tribe) => !tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX))
        return [...previews, ...persisted]
      })
      setSelectedTribeId(previews[0].id)
    })
    return () => unsubscribe()
  }, [])

  const handleFormTribe = useCallback(async () => {
    if (!newTribeDesc.trim() && !newTribeName.trim()) return
    setIsFormingTribe(true)
    setNewTribeError(null)
    const size = Math.max(2, Math.min(15, parseInt(newTribeSize, 10) || 5))
    const requiredSkills = newTribeSkills.split(",").map(s => s.trim()).filter(Boolean)
    const objective = newTribeDesc.trim() || newTribeName.trim()
    const tribeName = newTribeName.trim()
    let shouldResetDialog = false

    try {
      if (csvData) {
        const csvTribe = buildCsvFormTribe(csvData, {
          name: tribeName,
          description: objective,
          size,
          optimize: newTribeOptimize,
          requiredSkills,
        })
        if (!csvTribe) {
          throw new Error("At least two CSV profiles are required to form a local tribe.")
        }
        setTribes((prev) => [...prev, csvTribe])
        setSelectedTribeId(csvTribe.id)
        setDataSource("csv")
        shouldResetDialog = true
        return
      }

      const designed = await executeRealtimeToolRequest<{
        designedTribes?: Array<{ profileIds?: string[] }>
      }>("designTribesForObjective", {
        objective,
        desiredTribeCount: 1,
        desiredTribeSize: size,
        requiredSkills: requiredSkills.length > 0 ? requiredSkills : null,
      })
      const designedProfileIds = designed.designedTribes?.[0]?.profileIds?.filter(Boolean) || []
      if (designedProfileIds.length < 2) {
        throw new Error("AI could not assemble a viable tribe from the current CRM profiles.")
      }

      const created = await executeRealtimeToolRequest<{
        tribes?: Array<{ id?: string }>
      }>("createTribe", {
        tribeName: tribeName || null,
        profileIds: designedProfileIds,
        tribePurpose: objective,
        tribeSize: size,
        optimizeFor: newTribeOptimize,
        constraints: requiredSkills.length > 0 ? { mustIncludeSkills: requiredSkills } : null,
      })
      const createdTribeId = created.tribes?.[0]?.id || ""
      const [profiles, supabaseTribes] = await Promise.all([fetchSupabaseProfiles(), fetchSupabaseTribes()])
      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
      designPreviewProfilesByIdRef.current = profilesById
      setTribes((current) => {
        const previews = current
          .filter((tribe) => tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX))
          .map((tribe) => hydrateDesignPreviewTribe(tribe, profilesById))
        return [...(supabaseTribes || []), ...previews]
      })
      setDataSource("supabase")
      if (createdTribeId) {
        setSelectedTribeId(createdTribeId)
      }
      shouldResetDialog = true
    } catch (error) {
      setNewTribeError(error instanceof Error ? error.message : "Failed to form tribe.")
    } finally {
      setIsFormingTribe(false)
      if (shouldResetDialog) {
        setNewTribeName("")
        setNewTribeDesc("")
        setNewTribeSize("5")
        setNewTribeOptimize("balanced")
        setNewTribeSkills("")
        setNewTribeError(null)
        setNewTribeOpen(false)
      }
    }
  }, [csvData, hydrateDesignPreviewTribe, newTribeDesc, newTribeName, newTribeSize, newTribeOptimize, newTribeSkills])

  const handleReanalyze = useCallback(async () => {
    const activeTribe = tribes.find((tribe) => tribe.id === selectedTribeId) || null
    if (!activeTribe) {
      return
    }

    setIsReanalyzing(true)
    setReanalyzeError(null)
    try {
      const isLocalOnlyTribe =
        dataSource === "csv" ||
        activeTribe.id.startsWith("csv-") ||
        activeTribe.id.startsWith("csv-manual-") ||
        activeTribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX)

      if (isLocalOnlyTribe) {
        setTribes((prev) => prev.map((tribe) => (
          tribe.id === selectedTribeId ? buildLocalReanalyzedTribe(tribe) : tribe
        )))
        return
      }

      const requiredSkills = activeTribe.commonSkills.slice(0, 6)
      const analysis = await executeRealtimeToolRequest<{
        tribes?: TribeCompositionAnalysisOutput[]
      }>("analyzeTribeComposition", {
        tribeId: activeTribe.id,
        requiredSkills: requiredSkills.length > 0 ? requiredSkills : null,
        benchmarkAgainstWorkspace: true,
        limitRecommendations: 3,
      })
      const composition = analysis.tribes?.[0]
      if (!composition) {
        throw new Error("AI could not return tribe composition analysis.")
      }

      setTribes((prev) => prev.map((tribe) => (
        tribe.id === selectedTribeId ? buildPersistedReanalyzedTribe(tribe, composition) : tribe
      )))
    } catch (error) {
      setReanalyzeError(error instanceof Error ? error.message : "Failed to re-analyze tribe.")
    } finally {
      setIsReanalyzing(false)
    }
  }, [dataSource, selectedTribeId, tribes])

  const handleAssignProject = useCallback(() => {
    if (!selectedProject) return
    setTribes(prev => prev.map(t =>
      t.id === selectedTribeId
        ? {
            ...t,
            projects: [
              ...(Array.isArray(t.projects)
                ? t.projects.map(item => (typeof item === "string" ? item : item.id))
                : []),
              selectedProject,
            ],
          }
        : t,
    ))
    setAssignProjectOpen(false)
  }, [selectedProject, selectedTribeId])

  const handleAddMember = useCallback(() => {
    if (!addMemberName.trim()) return
    const skills = addMemberSkills.split(",").map(s => s.trim()).filter(Boolean)
    const newMember: TribeMember = {
      personId: `m-${Date.now()}`,
      name: addMemberName.trim(),
      tribeRole: addMemberRole,
      projectRoles: [],
      tags: [],
      seniority: addMemberSeniority,
      skills,
    }
    setTribes(prev => prev.map(t => {
      if (t.id !== selectedTribeId) return t
      const members = [...t.members, newMember]
      return { ...t, members, skillDist: computeSkillDist(members) }
    }))
    setAddMemberOpen(false)
    setAddMemberName("")
    setAddMemberRole("Executor")
    setAddMemberSeniority("Mid")
    setAddMemberSkills("")
  }, [addMemberName, addMemberRole, addMemberSeniority, addMemberSkills, selectedTribeId])

  const handleRemoveMember = useCallback((personId: string) => {
    setTribes(prev => prev.map(t => {
      if (t.id !== selectedTribeId) return t
      const members = t.members.filter(m => m.personId !== personId)
      return { ...t, members, skillDist: computeSkillDist(members) }
    }))
  }, [selectedTribeId])

  const handleChangeMemberRole = useCallback((personId: string, role: TribeRole) => {
    setTribes(prev => prev.map(t => {
      if (t.id !== selectedTribeId) return t
      return { ...t, members: t.members.map(m => m.personId === personId ? { ...m, tribeRole: role } : m) }
    }))
  }, [selectedTribeId])

  const handleDeleteTribe = useCallback((tribeId: string) => {
    setTribes(prev => {
      const next = prev.filter(t => t.id !== tribeId)
      if (selectedTribeId === tribeId) setSelectedTribeId(next[0]?.id ?? "")
      return next
    })
  }, [selectedTribeId])

  const handleStartRename = useCallback(() => {
    const tribe = tribes.find(t => t.id === selectedTribeId)
    if (!tribe) return
    setEditNameValue(tribe.name)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [tribes, selectedTribeId])

  const handleSubmitRename = useCallback(() => {
    if (editNameValue.trim()) {
      setTribes(prev => prev.map(t =>
        t.id === selectedTribeId ? { ...t, name: editNameValue.trim() } : t,
      ))
    }
    setEditingName(false)
  }, [editNameValue, selectedTribeId])

  // ── Supabase data loading ─────────────────────────────────────────────────

  const loadSupabaseProfiles = useCallback(async () => {
    const profiles = await fetchSupabaseProfiles()
    const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
    designPreviewProfilesByIdRef.current = profilesById
    setTribes((current) => current.map((tribe) => hydrateDesignPreviewTribe(tribe, profilesById)))
  }, [hydrateDesignPreviewTribe])

  const loadSupabaseTribes = useCallback(async () => {
    if (csvData) {
      return
    }
    setIsLoadingSupabase(true)
    try {
      const supabaseTribes = await fetchSupabaseTribes()
      setTribes((current) => {
        const previews = current.filter((tribe) => tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX))
        return [...(supabaseTribes || []), ...previews]
      })
      setDataSource("supabase")
    } finally {
      setIsLoadingSupabase(false)
    }
  }, [csvData])

  const loadSupabaseProjects = useCallback(async () => {
    const projects = await fetchSupabaseProjects()
    const names = (projects || []).map(p => p.name.trim()).filter(Boolean)
    setProjectNames(names)
    if (!selectedProject && names[0]) setSelectedProject(names[0])
  }, [selectedProject])

  useEffect(() => {
    void loadSupabaseProfiles()
    const unsubscribe = subscribeToProfiles(() => { void loadSupabaseProfiles() })
    return () => { unsubscribe?.() }
  }, [loadSupabaseProfiles])

  useEffect(() => {
    if (!csvData) {
      void loadSupabaseTribes()
    }
    void loadSupabaseProjects()
    const unsubscribe = csvData ? null : subscribeToTribes(() => { void loadSupabaseTribes() })
    return () => { unsubscribe?.() }
  }, [csvData, loadSupabaseProjects, loadSupabaseTribes])

  useEffect(() => {
    if (tribes.length > 0 && !tribes.some(t => t.id === selectedTribeId)) {
      setSelectedTribeId(tribes[0].id)
    }
  }, [selectedTribeId, tribes])

  useEffect(() => {
    setReanalyzeError(null)
  }, [selectedTribeId])

  const selectedTribe = tribes.find(t => t.id === selectedTribeId) ?? tribes[0]
  const selectedTribeSkillCoverage = formatPercent(selectedTribe?.requiredSkillCoveragePercent, 1)
  const selectedTribeNetworkShare = formatPercent(selectedTribe?.networkSharePercent, 2)
  const selectedTribeWindowCoverage = formatPercent(selectedTribe?.designWindowCoveragePercent, 1)
  const selectedTribeHasWindowSummary =
    Boolean(
      selectedTribe &&
      typeof selectedTribe.designWindowUsedProfileCount === "number" &&
      typeof selectedTribe.designWindowTotalProfiles === "number",
    )

  useEffect(() => {
    if (!onPageContextChange) return
    if (selectedTribe) {
      onPageContextChange({
        tribeId: selectedTribe.id,
        tribeName: selectedTribe.name,
        memberCount: selectedTribe.members.length,
      })
    } else {
      onPageContextChange({})
    }
  }, [onPageContextChange, selectedTribe?.id, selectedTribe?.name, selectedTribe?.members.length])

  // ─── Dialogs (always rendered) ────────────────────────────────────────────

  const FormTribeDialog = (
    <Dialog
      open={newTribeOpen}
      onOpenChange={(open) => {
        setNewTribeOpen(open)
        if (!open) {
          setNewTribeError(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Form New Tribe with AI
          </DialogTitle>
          <DialogDescription>
            Configure your tribe. AI will generate an optimal team composition.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Tribe Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={newTribeName}
              onChange={e => setNewTribeName(e.target.value)}
              placeholder="e.g. Fintech Catalyst Crew"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Purpose / Description <span className="text-destructive">*</span></Label>
            <Textarea
              value={newTribeDesc}
              onChange={e => setNewTribeDesc(e.target.value)}
              placeholder="e.g. A cross-functional team for a fintech product launch with strong engineering and design..."
              className="text-xs min-h-[72px] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Team Size</Label>
              <Select value={newTribeSize} onValueChange={setNewTribeSize}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["3", "4", "5", "6", "7", "8", "10", "12"].map(n => (
                    <SelectItem key={n} value={n} className="text-xs">{n} members</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Optimize For</Label>
              <Select value={newTribeOptimize} onValueChange={setNewTribeOptimize}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { value: "balanced", label: "Balanced" },
                    { value: "skills", label: "Skills Depth" },
                    { value: "diversity", label: "Diversity" },
                    { value: "seniority", label: "Seniority" },
                    { value: "speed", label: "Speed" },
                  ].map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Required Skills <span className="text-muted-foreground">(comma-separated)</span></Label>
            <Input
              value={newTribeSkills}
              onChange={e => setNewTribeSkills(e.target.value)}
              placeholder="e.g. React, Node.js, Product Management"
              className="h-8 text-xs"
            />
          </div>
          {newTribeError ? (
            <p role="alert" className="text-xs text-destructive">
              {newTribeError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewTribeError(null)
              setNewTribeOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => void handleFormTribe()}
            disabled={(!newTribeDesc.trim() && !newTribeName.trim()) || isFormingTribe}
          >
            <Sparkles className="w-3 h-3" />
            {isFormingTribe ? "Forming..." : "Form Tribe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const AssignProjectDialog = (
    <Dialog open={assignProjectOpen} onOpenChange={setAssignProjectOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Project</DialogTitle>
          <DialogDescription>Link a project to {selectedTribe?.name}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Project</Label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectNames.map(p => (
                  <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setAssignProjectOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleAssignProject} disabled={!selectedProject}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const AddMemberDialog = (
    <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Add Member
          </DialogTitle>
          <DialogDescription>Add a new member to {selectedTribe?.name}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
            <Input
              value={addMemberName}
              onChange={e => setAddMemberName(e.target.value)}
              placeholder="e.g. Alex Chen"
              className="h-8 text-xs"
              onKeyDown={e => e.key === "Enter" && void handleAddMember()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={addMemberRole} onValueChange={v => setAddMemberRole(v as TribeRole)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Seniority</Label>
              <Select value={addMemberSeniority} onValueChange={setAddMemberSeniority}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Junior", "Mid", "Senior", "Principal", "Executive"].map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Skills <span className="text-muted-foreground">(comma-separated)</span></Label>
            <Input
              value={addMemberSkills}
              onChange={e => setAddMemberSkills(e.target.value)}
              placeholder="e.g. React, TypeScript, Design"
              className="h-8 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => void handleAddMember()} disabled={!addMemberName.trim()}>
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // ─── Empty State ──────────────────────────────────────────────────────────

  if (tribes.length === 0 && !isLoadingSupabase) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-6 text-center p-8 max-w-md mx-auto">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
            <Layers className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">No tribes yet</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Upload a LinkedIn CSV to auto-group your network by skills, or use AI to form your first tribe. Tribes connect to Profiles CRM and Projects.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button
              size="default"
              className="gap-2 shadow-sm"
              onClick={() => {
                setNewTribeError(null)
                setNewTribeOpen(true)
              }}
            >
              <Sparkles className="w-4 h-4" />
              Form First Tribe
            </Button>
            {onNavigate && (
              <>
                <Button size="default" variant="outline" className="gap-2" onClick={() => onNavigate("profiles" as ActiveView)}>
                  <Users className="w-4 h-4" />
                  Pull from Profiles CRM
                </Button>
                <Button size="default" variant="outline" className="gap-2" onClick={() => onNavigate("projects" as ActiveView)}>
                  <FolderKanban className="w-4 h-4" />
                  Link to Projects
                </Button>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <FileUp className="w-3.5 h-3.5" />
            Upload a CSV in Dashboard or AI Assistant to auto-create tribes by skill clusters.
          </p>
        </div>
        {FormTribeDialog}
      </>
    )
  }

  // ─── Main Layout ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BrandedPanelHeader
        title="Tribe Builder"
        description="Build dream teams"
        icon={Layers}
        right={onNavigate ? <CrmTalentNav activeView="tribes" onNavigate={onNavigate} /> : undefined}
        compact
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Tribe List Sidebar ───────────────────────────────────────────── */}
      <div className="w-64 shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground">{tribes.length} formed</p>
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase">
                {dataSource}
              </Badge>
            </div>
            {onNavigate ? <CrmTalentNav activeView="tribes" onNavigate={onNavigate} className="mt-2" /> : null}
            {isLoadingSupabase && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Syncing...</p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              setNewTribeError(null)
              setNewTribeOpen(true)
            }}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tribes.map((tribe, i) => {
            const requiredCoverageLabel = formatPercent(tribe.requiredSkillCoveragePercent, 1)
            const networkShareLabel = formatPercent(tribe.networkSharePercent, 2)
            const hasWindowUsage =
              typeof tribe.designWindowUsedProfileCount === "number" &&
              typeof tribe.designWindowTotalProfiles === "number"
            const hasHealthStrip = Boolean(requiredCoverageLabel || networkShareLabel || hasWindowUsage)

            return (
              <div key={tribe.id} className="group relative">
                <button
                  onClick={() => setSelectedTribeId(tribe.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border transition-all",
                    selectedTribeId === tribe.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent bg-transparent hover:bg-secondary",
                  )}
                  type="button"
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                      style={{ background: TRIBE_COLORS[i % TRIBE_COLORS.length] }}
                    >
                      {tribe.name[0]}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-foreground truncate">{tribe.name}</span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-4 px-1.5 text-[9px] shrink-0",
                            tribe.status === "active"
                              ? "bg-accent/15 text-accent"
                              : "bg-chart-3/15 text-chart-3",
                          )}
                        >
                          {tribe.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug truncate">
                        {tribe.description}
                      </p>
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                        <Users className="w-2.5 h-2.5" />
                        <span>{tribe.members.length} members</span>
                        {typeof tribe.cohesion === "number" ? (
                          <span className="ml-1 text-accent font-medium">* {tribe.cohesion}</span>
                        ) : null}
                      </div>
                      {hasHealthStrip ? (
                        <div className="mt-1 text-[10px] text-muted-foreground flex flex-wrap items-center gap-1">
                          {requiredCoverageLabel ? (
                            <span
                              className={cn(
                                typeof tribe.requiredSkillCoveragePercent === "number" &&
                                  tribe.requiredSkillCoveragePercent < 50
                                  ? "text-chart-4"
                                  : "text-accent",
                              )}
                            >
                              {requiredCoverageLabel} required skills covered
                            </span>
                          ) : null}
                          {requiredCoverageLabel && networkShareLabel ? <span>|</span> : null}
                          {networkShareLabel ? <span>{networkShareLabel} of network window</span> : null}
                          {(requiredCoverageLabel || networkShareLabel) && hasWindowUsage ? <span>|</span> : null}
                          {hasWindowUsage ? (
                            <span>
                              window {tribe.designWindowUsedProfileCount}/{tribe.designWindowTotalProfiles}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
                {/* Delete tribe on hover */}
                <button
                  type="button"
                  onClick={() => handleDeleteTribe(tribe.id)}
                  className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all"
                  title="Delete tribe"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}

          <button
            className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary"
            type="button"
            onClick={() => setNewTribeOpen(true)}
          >
            <Shuffle className="w-4 h-4" />
            <span className="text-xs">Form new tribe with AI</span>
          </button>
        </div>
      </div>

      {/* ── Tribe Detail Panel ───────────────────────────────────────────── */}
      {selectedTribe && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary shrink-0" />
                  {editingName ? (
                    <Input
                      ref={nameInputRef}
                      value={editNameValue}
                      onChange={e => setEditNameValue(e.target.value)}
                      onBlur={handleSubmitRename}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleSubmitRename()
                        if (e.key === "Escape") setEditingName(false)
                      }}
                      className="h-7 text-lg font-bold px-2 py-0 border-primary/40"
                    />
                  ) : (
                    <h1 className="text-xl font-bold text-foreground leading-tight">{selectedTribe.name}</h1>
                  )}
                  <button
                    type="button"
                    onClick={editingName ? handleSubmitRename : handleStartRename}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Rename tribe"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 ml-7">{selectedTribe.description}</p>
                {reanalyzeError ? (
                  <p role="alert" className="ml-7 mt-2 text-xs text-destructive">
                    {reanalyzeError}
                  </p>
                ) : null}
                {selectedTribeHasWindowSummary ? (
                  <div
                    className={cn(
                      "ml-7 mt-2 rounded-md border px-2.5 py-2 text-[11px]",
                      selectedTribe.designWindowTruncated
                        ? "border-chart-4/40 bg-chart-4/10 text-chart-4"
                        : "border-accent/30 bg-accent/10 text-foreground",
                    )}
                  >
                    <div className="font-medium">
                      Window usage: {selectedTribe.designWindowUsedProfileCount} / {selectedTribe.designWindowTotalProfiles} profiles
                    </div>
                    {typeof selectedTribe.designWindowLimit === "number" ? (
                      <div className="text-muted-foreground">Window limit: {selectedTribe.designWindowLimit}</div>
                    ) : null}
                    {selectedTribeWindowCoverage ? (
                      <div className="text-muted-foreground">Workspace coverage: {selectedTribeWindowCoverage}</div>
                    ) : null}
                    {selectedTribe.designWindowTruncated ? (
                      <div className="mt-1 font-medium">Top window used; rerun with different filters for another slice.</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => void handleReanalyze()}
                  disabled={isReanalyzing}
                >
                  <Brain className="w-3.5 h-3.5" />
                  {isReanalyzing ? "Analyzing..." : "Re-analyze"}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setAssignProjectOpen(true)}
                >
                  <Target className="w-3.5 h-3.5" />
                  Assign Project
                </Button>
              </div>
            </div>

            {/* Score Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: "Members",         value: `${selectedTribe.members.length}`,           icon: Users, color: "text-chart-3" },
                {
                  label: "Skill Coverage",
                  value: selectedTribeSkillCoverage ?? "n/a",
                  icon: Brain,
                  color:
                    typeof selectedTribe.requiredSkillCoveragePercent === "number" &&
                    selectedTribe.requiredSkillCoveragePercent < 50
                      ? "text-chart-4"
                      : "text-accent",
                },
                { label: "Network Share",   value: selectedTribeNetworkShare ?? "n/a",          icon: Layers, color: "text-primary" },
                {
                  label: "Cohesion",
                  value: typeof selectedTribe.cohesion === "number" ? selectedTribe.cohesion : "n/a",
                  icon: Star,
                  color: "text-primary",
                  suffix: typeof selectedTribe.cohesion === "number" ? "/10" : "",
                },
                {
                  label: "Complementarity",
                  value: typeof selectedTribe.complementarity === "number" ? selectedTribe.complementarity : "n/a",
                  icon: Zap,
                  color: "text-accent",
                  suffix: typeof selectedTribe.complementarity === "number" ? "/10" : "",
                },
              ].map(s => {
                const Icon = s.icon
                return (
                  <Card key={s.label} className="bg-card border-border">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
                        <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                      </div>
                      <div className={`text-xl font-bold ${s.color}`}>
                        {`${s.value}${s.suffix ?? ""}`}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-3 gap-4">
              {/* Health Radar */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Health Radar
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <ResponsiveContainer width="100%" height={160}>
                    <RadarChart data={selectedTribe.radarData}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                      <Radar
                        name="Score"
                        dataKey="value"
                        stroke="var(--primary)"
                        fill="var(--primary)"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Skill Distribution */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Skill Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {(selectedTribe.skillDist?.length ?? 0) > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={120}>
                        <PieChart>
                          <Pie
                            data={selectedTribe.skillDist}
                            cx="50%"
                            cy="50%"
                            innerRadius={28}
                            outerRadius={50}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {(selectedTribe.skillDist ?? []).map((_, idx) => (
                              <Cell key={idx} fill={TRIBE_COLORS[idx % TRIBE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              fontSize: "11px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                        {(selectedTribe.skillDist ?? []).map((d, idx) => (
                          <div key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: TRIBE_COLORS[idx % TRIBE_COLORS.length] }} />
                            {d.name}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-[140px] flex items-center justify-center text-[11px] text-muted-foreground">
                      Add members to see skills
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Key Strengths */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Key Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {(selectedTribe.strengths ?? []).map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />
                      <span className="text-xs text-foreground leading-snug">{s}</span>
                    </div>
                  ))}
                  <div className="pt-2 space-y-1.5">
                    {[
                      { label: "Cohesion",   value: Math.round((selectedTribe.cohesion ?? 0) * 10) },
                      { label: "Skills fit", value: Math.round((selectedTribe.complementarity ?? 0) * 10) },
                    ].map(m => (
                      <div key={m.label} className="space-y-0.5">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{m.label}</span>
                          <span>{m.value}%</span>
                        </div>
                        <Progress value={m.value} className="h-1" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Where members are: Role distribution */}
            {selectedTribe.members.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Member distribution
                  </CardTitle>
                  <CardDescription className="text-[11px] mt-0.5">
                    Roles and seniority in this tribe
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex flex-wrap gap-3">
                    {computeRoleDistribution(selectedTribe.members).map(({ role, count }) => (
                      <div
                        key={role}
                        className={cn(
                          "rounded-lg border px-3 py-2 flex items-center gap-2",
                          roleColors[role],
                        )}
                      >
                        <span className="text-xs font-medium">{role}</span>
                        <Badge variant="secondary" className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px]">
                          {count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {["Junior", "Mid", "Senior", "Principal", "Executive"].map((sen) => {
                      const n = selectedTribe.members.filter((m) => m.seniority === sen).length
                      if (n === 0) return null
                      return (
                        <span key={sen} className="flex items-center gap-1">
                          <span className="font-medium text-foreground">{n}</span> {sen}
                        </span>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Members Table */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-semibold">Team Members</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {selectedTribe.members.length} profile{selectedTribe.members.length !== 1 ? "s" : ""} in this tribe
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {onNavigate && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7"
                      onClick={() => {
                        try {
                          sessionStorage.setItem(LINKEDOUT_FILTER_TRIBE_KEY, selectedTribe.name)
                        } catch (e) {
                          if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
                            console.warn("[tribes] sessionStorage.setItem failed:", e)
                          }
                        }
                        onNavigate("profiles" as ActiveView)
                      }}
                    >
                      <Users className="w-3.5 h-3.5" />
                      View in Profiles CRM
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-7"
                    onClick={() => setAddMemberOpen(true)}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {selectedTribe.members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                    <Users className="w-8 h-8 text-muted-foreground/40" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">No members yet</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">Add members manually or re-analyze to populate.</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setAddMemberOpen(true)}>
                      <UserPlus className="w-3 h-3" />
                      Add First Member
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {selectedTribe.members.map((member, i) => (
                      <div
                        key={member.personId || i}
                        className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ background: TRIBE_COLORS[i % TRIBE_COLORS.length] }}
                          >
                            {member.name
                              ? member.name.split(" ").map(n => n[0]).join("").slice(0, 2)
                              : "?"}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-foreground">{member.name}</div>
                            <div className="text-xs text-muted-foreground">{member.seniority}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Skill badges */}
                          <div className="flex flex-wrap gap-1 justify-end max-w-[180px]">
                            {(member.skills ?? []).slice(0, 3).map(skill => (
                              <Badge key={skill} variant="secondary" className="text-[10px] h-4 px-1.5">
                                {skill}
                              </Badge>
                            ))}
                          </div>

                          {/* Role select */}
                          <Select
                            value={member.tribeRole as TribeRole}
                            onValueChange={v => handleChangeMemberRole(member.personId, v as TribeRole)}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-5 px-1.5 text-[10px] border-0 shadow-none w-auto gap-1 font-medium rounded-full",
                                roleColors[member.tribeRole as TribeRole] ?? "bg-muted text-muted-foreground",
                              )}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_ROLES.map(r => (
                                <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Remove member */}
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.personId)}
                            className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all"
                            title="Remove member"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Assigned Projects */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Assigned Projects</CardTitle>
                {onNavigate && (selectedTribe.projects?.length ?? 0) > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-xs h-7"
                    onClick={() => onNavigate("projects" as ActiveView)}
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                    Open in Projects
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0 pb-2">
                {(selectedTribe.projects?.length ?? 0) > 0 ? (
                  <div className="divide-y divide-border">
                    {(selectedTribe.projects ?? []).map((project, i) => {
                      const name = typeof project === "string" ? project : project.id
                      return (
                        <button
                          key={i}
                          type="button"
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                          onClick={() => onNavigate?.("projects" as ActiveView)}
                        >
                          <div className="flex items-center gap-2">
                            <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium">{name}</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-muted-foreground mb-3">No projects linked yet</p>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setAssignProjectOpen(true)}>
                      <Target className="w-3.5 h-3.5" />
                      Assign Project
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      )}
      </div>

      {/* Dialogs */}
      {FormTribeDialog}
      {AssignProjectDialog}
      {AddMemberDialog}
    </div>
  )
}

