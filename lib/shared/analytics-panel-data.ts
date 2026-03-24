import type { ParsedProfile } from "@/lib/csv/csv-parser"
import type { SupabaseProfileView, SupabaseProjectView } from "@/lib/supabase/supabase-data"
import type { Tribe, TribeMember } from "@/lib/shared/types"

type AnalyticsSource = "supabase" | "csv"

type UnifiedProfile = {
  id: string
  firstName: string
  lastName: string
  company: string
  industry: string
  connections: number
  skills: string[]
  matchScore: number
  seniority: string
  tribe?: string
  linkedinUrl?: string
  email?: string
  sources: Set<AnalyticsSource>
}

export type AnalyticsSnapshotSource = "supabase" | "csv" | "combined" | "empty"

export type AnalyticsKpi = {
  key: "profiles" | "tribes" | "projects" | "match"
  label: string
  value: string
  change: string
}

export type AnalyticsSeries = {
  key: string
  label: string
  color: string
}

export type AnalyticsDatum = Record<string, number | string>

export type AnalyticsSkillTableItem = {
  skill: string
  count: number
  coverageLabel: string
  type: "core" | "growing" | "emerging"
}

export type AnalyticsBreakdownDatum = {
  name: string
  value: number
}

export type AnalyticsLabeledDatum = {
  label: string
  count: number
}

export type AnalyticsSnapshot = {
  source: AnalyticsSnapshotSource
  hasData: boolean
  profileCount: number
  kpis: AnalyticsKpi[]
  skillCoverage: {
    data: AnalyticsDatum[]
    series: AnalyticsSeries[]
  }
  projectPortfolio: {
    data: AnalyticsDatum[]
    series: AnalyticsSeries[]
  }
  tribeComparison: {
    data: AnalyticsDatum[]
    series: AnalyticsSeries[]
    description: string
  }
  focusAreas: {
    title: string
    description: string
    data: AnalyticsLabeledDatum[]
  }
  profileSources: AnalyticsBreakdownDatum[]
  topSkills: AnalyticsSkillTableItem[]
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

const SENIORITY_BANDS = ["Entry", "Mid", "Senior", "Lead", "Exec"] as const

const PROJECT_STAGE_SERIES: AnalyticsSeries[] = [
  { key: "planned", label: "Planned", color: CHART_COLORS[0] },
  { key: "active", label: "Active", color: CHART_COLORS[1] },
  { key: "completed", label: "Completed", color: CHART_COLORS[2] },
  { key: "paused", label: "Paused", color: CHART_COLORS[3] },
]

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function normalizeText(value: string | undefined): string {
  return (value || "").trim().toLowerCase()
}

function normalizeSkill(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeSkill(value)).filter(Boolean)))
}

function profileKey(profile: {
  firstName: string
  lastName: string
  company: string
  linkedinUrl?: string
  email?: string
}): string {
  const linkedinUrl = normalizeText(profile.linkedinUrl)
  if (linkedinUrl) {
    return `linkedin:${linkedinUrl}`
  }

  const email = normalizeText(profile.email)
  if (email) {
    return `email:${email}`
  }

  return [
    normalizeText(profile.firstName),
    normalizeText(profile.lastName),
    normalizeText(profile.company),
  ].join("|")
}

function mergeProfile(
  current: UnifiedProfile | undefined,
  incoming: Omit<UnifiedProfile, "sources"> & { source: AnalyticsSource },
): UnifiedProfile {
  if (!current) {
    return {
      ...incoming,
      skills: dedupeStrings(incoming.skills),
      sources: new Set([incoming.source]),
    }
  }

  const preferCurrent = current.sources.has("supabase")
  const preferred = preferCurrent ? current : incoming
  const secondary = preferCurrent ? incoming : current

  return {
    id: preferred.id || secondary.id,
    firstName: preferred.firstName || secondary.firstName,
    lastName: preferred.lastName || secondary.lastName,
    company: preferred.company || secondary.company,
    industry: preferred.industry || secondary.industry,
    connections: Math.max(current.connections, incoming.connections),
    skills: dedupeStrings([...current.skills, ...incoming.skills]),
    matchScore:
      current.matchScore > 0 && incoming.matchScore > 0
        ? Math.round((current.matchScore + incoming.matchScore) / 2)
        : Math.max(current.matchScore, incoming.matchScore),
    seniority: preferred.seniority || secondary.seniority,
    tribe: preferred.tribe || secondary.tribe,
    linkedinUrl: preferred.linkedinUrl || secondary.linkedinUrl,
    email: preferred.email || secondary.email,
    sources: new Set([...current.sources, incoming.source]),
  }
}

function seniorityBand(value: string): (typeof SENIORITY_BANDS)[number] {
  const normalized = normalizeText(value)
  if (
    normalized.includes("intern") ||
    normalized.includes("junior") ||
    normalized.includes("associate") ||
    normalized.includes("entry")
  ) {
    return "Entry"
  }
  if (normalized.includes("staff") || normalized.includes("principal") || normalized.includes("manager") || normalized.includes("lead")) {
    return "Lead"
  }
  if (
    normalized.includes("director") ||
    normalized.includes("vp") ||
    normalized.includes("chief") ||
    normalized.includes("cxo") ||
    normalized.includes("head")
  ) {
    return "Exec"
  }
  if (normalized.includes("senior") || normalized.includes("sr")) {
    return "Senior"
  }
  return "Mid"
}

function stageFromStatus(status: string): AnalyticsSeries["key"] {
  const normalized = normalizeText(status)
  if (normalized === "completed") return "completed"
  if (normalized === "active" || normalized === "at-risk") return "active"
  if (normalized === "paused" || normalized === "on-hold" || normalized === "archived" || normalized === "cancelled") {
    return "paused"
  }
  return "planned"
}

function sourceCategory(profile: UnifiedProfile): string {
  if (profile.sources.size > 1) {
    return "Dual-sourced"
  }
  if (profile.sources.has("supabase")) {
    return "Supabase"
  }
  return "CSV upload"
}

function buildUnifiedProfiles(
  supabaseProfiles: SupabaseProfileView[] | null | undefined,
  csvProfiles: ParsedProfile[] | null | undefined,
): UnifiedProfile[] {
  const merged = new Map<string, UnifiedProfile>()

  for (const profile of supabaseProfiles || []) {
    const candidate = {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      company: profile.company,
      industry: profile.industry,
      connections: profile.connections || 0,
      skills: profile.skills || [],
      matchScore: profile.matchScore || 0,
      seniority: profile.seniority || "Mid",
      tribe: profile.tribe,
      linkedinUrl: profile.linkedinUrl,
      email: undefined,
      source: "supabase" as const,
    }
    const key = profileKey(candidate)
    merged.set(key, mergeProfile(merged.get(key), candidate))
  }

  for (const profile of csvProfiles || []) {
    const candidate = {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      company: profile.company,
      industry: profile.industry,
      connections: profile.connections || 0,
      skills: profile.skills || [],
      matchScore: profile.matchScore || 0,
      seniority: profile.seniority || "Mid",
      tribe: profile.tribe,
      linkedinUrl: profile.linkedinUrl,
      email: profile.email,
      source: "csv" as const,
    }
    const key = profileKey(candidate)
    merged.set(key, mergeProfile(merged.get(key), candidate))
  }

  return Array.from(merged.values())
}

function buildSkillCounts(profiles: UnifiedProfile[]): Array<{ skill: string; count: number }> {
  const counts = new Map<string, number>()
  for (const profile of profiles) {
    for (const skill of dedupeStrings(profile.skills)) {
      counts.set(skill, (counts.get(skill) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((left, right) => right.count - left.count || left.skill.localeCompare(right.skill))
}

function sanitizeSeriesKey(prefix: string, value: string, index: number): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return `${prefix}_${normalized || index + 1}`
}

function buildSkillCoverage(profiles: UnifiedProfile[]): AnalyticsSnapshot["skillCoverage"] {
  const topSkills = buildSkillCounts(profiles).slice(0, 4)
  const series = topSkills.map((item, index) => ({
    key: sanitizeSeriesKey("skill", item.skill, index),
    label: item.skill,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))

  const data = SENIORITY_BANDS.map((band) => {
    const row: AnalyticsDatum = { band }
    const bandProfiles = profiles.filter((profile) => seniorityBand(profile.seniority) === band)
    for (const item of series) {
      const label = item.label.toLowerCase()
      row[item.key] = bandProfiles.filter((profile) => profile.skills.some((skill) => skill.toLowerCase() === label)).length
    }
    return row
  })

  return { data, series }
}

function buildProjectPortfolio(projects: SupabaseProjectView[] | null | undefined): AnalyticsSnapshot["projectPortfolio"] {
  const grouped = new Map<string, AnalyticsDatum>()
  for (const project of projects || []) {
    const label = titleCase(project.type || "general")
    const current = grouped.get(label) || { category: label }
    for (const series of PROJECT_STAGE_SERIES) {
      if (typeof current[series.key] !== "number") {
        current[series.key] = 0
      }
    }
    const stageKey = stageFromStatus(project.status || "planned")
    current[stageKey] = Number(current[stageKey] || 0) + 1
    grouped.set(label, current)
  }

  const data = Array.from(grouped.values()).sort((left, right) => String(left.category).localeCompare(String(right.category)))
  return {
    data,
    series: PROJECT_STAGE_SERIES,
  }
}

type DerivedTribe = {
  id: string
  name: string
  memberCount: number
  skillCount: number
  linkedProjectCount: number
  avgExperience: number
}

function memberSkillCount(members: TribeMember[]): number {
  return new Set(
    members
      .flatMap((member) => member.skills || [])
      .map((skill) => normalizeSkill(skill))
      .filter(Boolean),
  ).size
}

function deriveTribes(
  profiles: UnifiedProfile[],
  tribes: Tribe[] | null | undefined,
  projects: SupabaseProjectView[] | null | undefined,
): DerivedTribe[] {
  if (tribes && tribes.length > 0) {
    return tribes.map((tribe) => {
      const linkedProjectCount = (projects || []).filter((project) => {
        const projectTribe = normalizeText(project.tribe)
        return projectTribe && (projectTribe === normalizeText(tribe.name) || projectTribe === normalizeText(tribe.id))
      }).length
      return {
        id: tribe.id,
        name: tribe.name,
        memberCount: tribe.members.length,
        skillCount: Math.max(tribe.commonSkills.length, memberSkillCount(tribe.members)),
        linkedProjectCount: linkedProjectCount || tribe.projects.length,
        avgExperience: tribe.avgExperience || 0,
      }
    })
  }

  const grouped = new Map<string, UnifiedProfile[]>()
  for (const profile of profiles) {
    const tribeName = profile.tribe?.trim()
    if (!tribeName) {
      continue
    }
    if (!grouped.has(tribeName)) {
      grouped.set(tribeName, [])
    }
    grouped.get(tribeName)?.push(profile)
  }

  return Array.from(grouped.entries()).map(([name, members], index) => ({
    id: `derived-tribe-${index + 1}`,
    name,
    memberCount: members.length,
    skillCount: new Set(members.flatMap((member) => member.skills.map((skill) => normalizeSkill(skill)))).size,
    linkedProjectCount: (projects || []).filter((project) => normalizeText(project.tribe) === normalizeText(name)).length,
    avgExperience: 0,
  }))
}

function scaleMetric(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) {
    return 0
  }
  return Math.round((value / maxValue) * 100)
}

function buildTribeComparison(
  profiles: UnifiedProfile[],
  tribes: Tribe[] | null | undefined,
  projects: SupabaseProjectView[] | null | undefined,
): AnalyticsSnapshot["tribeComparison"] {
  const candidates = deriveTribes(profiles, tribes, projects)
    .sort((left, right) => right.memberCount - left.memberCount || right.skillCount - left.skillCount)
    .slice(0, 3)

  const series = candidates.map((tribe, index) => ({
    key: sanitizeSeriesKey("tribe", tribe.name, index),
    label: tribe.name,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }))

  const maxMembers = Math.max(0, ...candidates.map((tribe) => tribe.memberCount))
  const maxSkills = Math.max(0, ...candidates.map((tribe) => tribe.skillCount))
  const maxProjects = Math.max(0, ...candidates.map((tribe) => tribe.linkedProjectCount))
  const maxExperience = Math.max(0, ...candidates.map((tribe) => tribe.avgExperience))

  const metricDefinitions = [
    {
      metric: "Members",
      value: (tribe: DerivedTribe) => scaleMetric(tribe.memberCount, maxMembers),
    },
    {
      metric: "Skills",
      value: (tribe: DerivedTribe) => scaleMetric(tribe.skillCount, maxSkills),
    },
    {
      metric: "Projects",
      value: (tribe: DerivedTribe) => scaleMetric(tribe.linkedProjectCount, maxProjects),
    },
    {
      metric: "Experience",
      value: (tribe: DerivedTribe) => scaleMetric(tribe.avgExperience, maxExperience),
    },
  ]

  const data = metricDefinitions.map((definition) => {
    const row: AnalyticsDatum = { metric: definition.metric }
    for (let index = 0; index < candidates.length; index += 1) {
      row[series[index].key] = definition.value(candidates[index])
    }
    return row
  })

  const description =
    tribes && tribes.length > 0
      ? "Relative member depth, skill breadth, project load, and experience."
      : "Derived from profile assignments and linked project tags."

  return { data, series, description }
}

function buildFocusAreas(
  profiles: UnifiedProfile[],
  projects: SupabaseProjectView[] | null | undefined,
): AnalyticsSnapshot["focusAreas"] {
  const industryCounts = new Map<string, number>()
  for (const profile of profiles) {
    const industry = profile.industry.trim()
    if (!industry) {
      continue
    }
    industryCounts.set(industry, (industryCounts.get(industry) || 0) + 1)
  }

  const industries = Array.from(industryCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5)

  if (industries.length > 0) {
    return {
      title: "Industry Mix",
      description: "Where your current profile network is concentrated.",
      data: industries,
    }
  }

  const projectTypes = new Map<string, number>()
  for (const project of projects || []) {
    const label = titleCase(project.type || "general")
    projectTypes.set(label, (projectTypes.get(label) || 0) + 1)
  }

  return {
    title: "Project Mix",
    description: "Portfolio focus by current project type.",
    data: Array.from(projectTypes.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5),
  }
}

function buildProfileSources(profiles: UnifiedProfile[]): AnalyticsBreakdownDatum[] {
  if (profiles.length === 0) {
    return []
  }

  const counts = new Map<string, number>()
  for (const profile of profiles) {
    const label = sourceCategory(profile)
    counts.set(label, (counts.get(label) || 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      value: Math.round((count / profiles.length) * 100),
    }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
}

function buildTopSkills(
  profiles: UnifiedProfile[],
  projects: SupabaseProjectView[] | null | undefined,
): AnalyticsSkillTableItem[] {
  if (profiles.length === 0) {
    return []
  }

  const demandTerms = new Set(
    (projects || [])
      .filter((project) => stageFromStatus(project.status || "planned") !== "completed")
      .flatMap((project) => [...project.tags, ...(project.aspirations || [])])
      .map((value) => normalizeText(value))
      .filter(Boolean),
  )

  return buildSkillCounts(profiles)
    .slice(0, 7)
    .map(({ skill, count }, index) => {
      const coverage = count / profiles.length
      let type: AnalyticsSkillTableItem["type"] = "emerging"
      if (coverage >= 0.35 || index < 2) {
        type = "core"
      } else if (coverage >= 0.15 || demandTerms.has(normalizeText(skill))) {
        type = "growing"
      }
      return {
        skill,
        count,
        coverageLabel: `${Math.round(coverage * 100)}%`,
        type,
      }
    })
}

function buildKpis(
  profiles: UnifiedProfile[],
  tribes: Tribe[] | null | undefined,
  projects: SupabaseProjectView[] | null | undefined,
): AnalyticsKpi[] {
  const profileCount = profiles.length
  const connections = profiles.reduce((sum, profile) => sum + profile.connections, 0)
  const activeTribes =
    tribes && tribes.length > 0
      ? tribes.filter((tribe) => tribe.status !== "archived").length
      : deriveTribes(profiles, tribes, projects).filter((tribe) => tribe.memberCount > 0).length
  const activeProjects = (projects || []).filter((project) => {
    const stage = stageFromStatus(project.status || "planned")
    return stage === "active" || stage === "planned"
  }).length
  const completedProjects = (projects || []).filter((project) => stageFromStatus(project.status || "planned") === "completed").length
  const profilesInTribes = profiles.filter((profile) => profile.tribe).length
  const avgMatchScore =
    profileCount > 0
      ? (profiles.reduce((sum, profile) => sum + profile.matchScore, 0) / profileCount).toFixed(1)
      : "0.0"
  const highFitProfiles = profiles.filter((profile) => profile.matchScore >= 80).length

  return [
    {
      key: "profiles",
      label: "Profiles Analyzed",
      value: profileCount.toLocaleString(),
      change: connections > 0 ? `${compactNumber(connections)} network reach` : "No connection depth yet",
    },
    {
      key: "tribes",
      label: "Active Tribes",
      value: activeTribes.toLocaleString(),
      change: profilesInTribes > 0 ? `${profilesInTribes} assigned profiles` : "No tribe assignments yet",
    },
    {
      key: "projects",
      label: "Active Projects",
      value: activeProjects.toLocaleString(),
      change: completedProjects > 0 ? `${completedProjects} completed` : "No completed projects yet",
    },
    {
      key: "match",
      label: "Avg Match Score",
      value: avgMatchScore,
      change: highFitProfiles > 0 ? `${highFitProfiles} profiles >= 80` : "No high-fit profiles yet",
    },
  ]
}

export function createAnalyticsSnapshot(input: {
  supabaseProfiles?: SupabaseProfileView[] | null
  csvProfiles?: ParsedProfile[] | null
  tribes?: Tribe[] | null
  projects?: SupabaseProjectView[] | null
}): AnalyticsSnapshot {
  const profiles = buildUnifiedProfiles(input.supabaseProfiles, input.csvProfiles)
  const projects = input.projects || []
  const tribes = input.tribes || []
  const hasData = profiles.length > 0 || projects.length > 0 || tribes.length > 0

  let source: AnalyticsSnapshotSource = "empty"
  if (input.supabaseProfiles && input.supabaseProfiles.length > 0 && input.csvProfiles && input.csvProfiles.length > 0) {
    source = "combined"
  } else if (input.csvProfiles && input.csvProfiles.length > 0) {
    source = "csv"
  } else if (input.supabaseProfiles && input.supabaseProfiles.length > 0) {
    source = "supabase"
  }

  return {
    source,
    hasData,
    profileCount: profiles.length,
    kpis: buildKpis(profiles, input.tribes, input.projects),
    skillCoverage: buildSkillCoverage(profiles),
    projectPortfolio: buildProjectPortfolio(input.projects),
    tribeComparison: buildTribeComparison(profiles, input.tribes, input.projects),
    focusAreas: buildFocusAreas(profiles, input.projects),
    profileSources: buildProfileSources(profiles),
    topSkills: buildTopSkills(profiles, input.projects),
  }
}
