import "server-only"

import type {
  NetworkFilters,
  FriendLink,
  FriendGrowthPoint,
  FriendNode,
  GroupHeatCell,
  GroupActivityPoint,
  GroupNode,
  GroupOverlap,
  InsightIndustry,
  InsightLocation,
  JobCalendarCell,
  DayPeriod,
  JobFunnelLink,
  JobFunnelNode,
  JobScatterPoint,
  NetworkInsightsDataset,
  TribeBubble,
  WeekDay,
} from "@/lib/network/network-insights-data"
import { createClient } from "@supabase/supabase-js"
import {
  fetchSupabaseProfiles,
  fetchSupabaseProjects,
  fetchSupabaseTribes,
  getSupabaseTableNames,
  type SupabaseProfileView,
  type SupabaseProjectView,
} from "@/lib/supabase/supabase-data"

function emptyNetworkInsightsDataset(): NetworkInsightsDataset {
  return {
    friendNodes: [],
    friendLinks: [],
    friendGrowth: [],
    tribeBubbles: [],
    groups: [],
    groupOverlaps: [],
    groupActivity: [],
    groupHeatmap: [],
    jobFunnelNodes: [],
    jobFunnelLinks: [],
    jobScatter: [],
    jobCalendar: [],
  }
}

type NetworkInsightTribeSource = {
  id: string
  name: string
  members: unknown[]
  industryFocus?: string
  createdAt?: string
  updatedAt?: string
}

type TimestampedRecord = {
  createdAt?: string
  updatedAt?: string
}

type NetworkInsightsTimeRange = NetworkFilters["timeRange"]

const HEATMAP_DAYS: WeekDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const HEATMAP_PERIODS: DayPeriod[] = ["Morning", "Afternoon", "Evening"]

function parseTimestamp(value: string | undefined): Date | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

function timeRangeToWindowDays(timeRange: NetworkInsightsTimeRange): number {
  if (timeRange === "30d") return 30
  if (timeRange === "180d") return 180
  return 90
}

function resolveTimeWindow(
  timeRange: NetworkInsightsTimeRange,
  now: Date,
): { windowStart: Date; cutoffTime: number } {
  const windowDays = timeRangeToWindowDays(timeRange)
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  return {
    windowStart,
    cutoffTime: windowStart.getTime(),
  }
}

function buildMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })
}

function getWeekDay(date: Date): WeekDay {
  const day = date.getUTCDay()
  return HEATMAP_DAYS[(day + 6) % 7] || "Mon"
}

function getDayPeriod(date: Date): DayPeriod {
  const hour = date.getUTCHours()
  if (hour < 12) {
    return "Morning"
  }
  if (hour < 18) {
    return "Afternoon"
  }
  return "Evening"
}

export function buildFriendGrowthFromProfiles(
  profiles: Array<Pick<SupabaseProfileView, "createdAt" | "updatedAt">>,
  options?: { now?: Date; monthCount?: number; timeRange?: NetworkInsightsTimeRange },
): FriendGrowthPoint[] {
  const now = options?.now ?? new Date()
  const timeRange = options?.timeRange ?? "90d"
  const window = resolveTimeWindow(timeRange, now)
  const monthBuckets: Array<{ key: string; month: string }> = []
  const cursor = new Date(Date.UTC(window.windowStart.getUTCFullYear(), window.windowStart.getUTCMonth(), 1))
  const endMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  while (cursor.getTime() <= endMonth.getTime()) {
    monthBuckets.push({
      key: buildMonthKey(cursor),
      month: formatMonthLabel(cursor),
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  if (monthBuckets.length < 2) {
    const previousMonth = new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() - 1, 1))
    monthBuckets.unshift({
      key: buildMonthKey(previousMonth),
      month: formatMonthLabel(previousMonth),
    })
  }

  const monthCount = Math.max(2, Math.min(options?.monthCount ?? monthBuckets.length, 12))
  const trimmedBuckets = monthBuckets.slice(-monthCount)
  const counts = new Map(trimmedBuckets.map((bucket) => [bucket.key, 0]))
  for (const profile of profiles) {
    const timestamp = parseTimestamp(profile.createdAt || profile.updatedAt)
    if (!timestamp) {
      continue
    }
    if (timestamp.getTime() < window.cutoffTime) {
      continue
    }
    const bucketKey = buildMonthKey(timestamp)
    if (!counts.has(bucketKey)) {
      continue
    }
    counts.set(bucketKey, (counts.get(bucketKey) || 0) + 1)
  }

  return trimmedBuckets.map((bucket) => ({
    month: bucket.month,
    friendsAdded: counts.get(bucket.key) || 0,
  }))
}

function uniqueRecordTimestamps(record: TimestampedRecord): string[] {
  return Array.from(new Set([record.createdAt, record.updatedAt].filter((value): value is string => Boolean(value))))
}

export function buildGroupHeatmapFromActivity(
  records: TimestampedRecord[],
  options?: { now?: Date; timeRange?: NetworkInsightsTimeRange },
): GroupHeatCell[] {
  const now = options?.now ?? new Date()
  const timeRange = options?.timeRange ?? "90d"
  const window = resolveTimeWindow(timeRange, now)
  const counts = new Map<string, number>()
  for (const day of HEATMAP_DAYS) {
    for (const period of HEATMAP_PERIODS) {
      counts.set(`${day}-${period}`, 0)
    }
  }

  for (const record of records) {
    for (const timestamp of uniqueRecordTimestamps(record)) {
      const parsed = parseTimestamp(timestamp)
      if (!parsed) {
        continue
      }
      if (parsed.getTime() < window.cutoffTime) {
        continue
      }
      const key = `${getWeekDay(parsed)}-${getDayPeriod(parsed)}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }

  const maxCount = Math.max(...counts.values(), 0)
  return HEATMAP_DAYS.flatMap((day) =>
    HEATMAP_PERIODS.map((period) => {
      const count = counts.get(`${day}-${period}`) || 0
      return {
        day,
        period,
        score: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0,
      }
    }),
  )
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash
}

function mapIndustry(raw: string): InsightIndustry {
  const value = raw.toLowerCase()
  if (value.includes("engineer") || value.includes("software") || value.includes("technology")) return "Engineering"
  if (value.includes("data") || value.includes("ai") || value.includes("ml")) return "Data"
  if (value.includes("product")) return "Product"
  if (value.includes("design") || value.includes("ux")) return "Design"
  if (value.includes("market") || value.includes("growth")) return "Marketing"
  if (value.includes("operation") || value.includes("people")) return "Operations"
  if (value.includes("finance")) return "Finance"
  return "Engineering"
}

function mapLocation(raw: string): InsightLocation {
  const value = raw.toLowerCase()
  if (value.includes("san francisco") || value.includes("bay area")) return "San Francisco"
  if (value.includes("new york") || value.includes("nyc")) return "New York"
  if (value.includes("austin")) return "Austin"
  if (value.includes("seattle")) return "Seattle"
  if (value.includes("chicago")) return "Chicago"
  if (value.includes("remote")) return "Remote"
  return "Remote"
}

function communityFromIndustry(industry: InsightIndustry): FriendNode["community"] {
  if (industry === "Engineering" || industry === "Data") return "Core"
  if (industry === "Product" || industry === "Marketing") return "Growth"
  if (industry === "Operations" || industry === "Finance") return "Ops"
  return "Creative"
}

function buildFriendNodesFromProfiles(profiles: SupabaseProfileView[]): FriendNode[] {
  return profiles.slice(0, 28).map((profile, index) => {
    const fullName = `${profile.firstName} ${profile.lastName}`.trim() || `Profile ${index + 1}`
    const industry = mapIndustry(profile.industry)
    const seed = hashString(profile.id || `${fullName}-${index}`)
    return {
      id: profile.id || `profile-${index + 1}`,
      label: fullName,
      role: profile.headline || profile.seniority || "Professional",
      industry,
      location: mapLocation(profile.location),
      mutualConnections: Math.max(8, Math.min(55, Math.round(profile.connections / 30) || 12)),
      community: communityFromIndustry(industry),
      recommended: profile.matchScore >= 84,
      x: 10 + (seed % 80),
      y: 12 + ((seed >> 5) % 76),
    }
  })
}

function buildFriendLinksFromNodes(nodes: FriendNode[]): FriendLink[] {
  const links: FriendLink[] = []
  for (let i = 0; i < nodes.length; i += 1) {
    const current = nodes[i]
    const next = nodes[(i + 1) % nodes.length]
    links.push({
      source: current.id,
      target: next.id,
      strength: 58 + ((hashString(current.id + next.id) % 32)),
      pending: (i + 1) % 7 === 0,
    })

    for (let j = i + 1; j < nodes.length; j += 1) {
      const candidate = nodes[j]
      if (candidate.community !== current.community) {
        continue
      }
      if ((hashString(current.id + candidate.id) % 100) < 18) {
        links.push({
          source: current.id,
          target: candidate.id,
          strength: 62 + (hashString(candidate.id + current.id) % 30),
        })
      }
      if (links.length > 60) {
        return links
      }
    }
  }
  return links
}

function buildTribeBubblesFromTribes(
  tribes: NetworkInsightTribeSource[],
): TribeBubble[] {
  return tribes.slice(0, 12).map((tribe, index) => {
    const category: TribeBubble["category"] =
      index % 4 === 0 ? "Tech" : index % 4 === 1 ? "Business" : index % 4 === 2 ? "Creative" : "Community"
    const memberCount = Math.max(80, (tribe.members?.length || 0) * 120)
    const seed = hashString(tribe.id)
    return {
      id: tribe.id,
      name: tribe.name || `Tribe ${index + 1}`,
      category,
      members: memberCount,
      growthPct: 8 + (seed % 20),
      activityScore: 58 + (seed % 37),
      x: 12 + ((seed >> 2) % 76),
      y: 14 + ((seed >> 8) % 72),
    }
  })
}

function buildGroupsFromTribes(tribes: TribeBubble[]): GroupNode[] {
  return tribes.slice(0, 6).map((tribe, index) => ({
    id: `group-${tribe.id}`,
    name: tribe.name,
    category: index % 4 === 0 ? "Leadership" : index % 4 === 1 ? "Functional" : index % 4 === 2 ? "Industry" : "Local",
    members: Math.max(900, Math.round(tribe.members * 0.58)),
    engagementScore: Math.max(45, Math.min(95, tribe.activityScore - 3 + (index % 3) * 5)),
  }))
}

function buildGroupOverlaps(groups: GroupNode[]): GroupOverlap[] {
  const overlaps: GroupOverlap[] = []
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      if ((i + j) % 2 !== 0) {
        continue
      }
      const shared = Math.max(65, Math.round(Math.min(groups[i].members, groups[j].members) * 0.08))
      overlaps.push({
        source: groups[i].id,
        target: groups[j].id,
        sharedMembers: shared,
        topSharedFriends: ["Top Connector 1", "Top Connector 2"],
      })
    }
  }
  return overlaps.slice(0, 10)
}

function buildEstimatedGroupActivity(groups: GroupNode[]): GroupActivityPoint[] {
  return groups.map((group, index) => ({
    group: group.name.slice(0, 12),
    posts: Math.max(40, Math.round(group.engagementScore * 1.3)),
    comments: Math.max(90, Math.round(group.engagementScore * 2.9)),
    joins: 18 + index * 5,
  }))
}

function normalizeAssociationKey(value: string | undefined): string {
  return (value || "").trim().toLowerCase()
}

function countRecentRecordSignals(
  record: TimestampedRecord,
  window: { cutoffTime: number },
): { created: number; updated: number; total: number } {
  const createdAt = parseTimestamp(record.createdAt)
  const updatedAt = parseTimestamp(record.updatedAt)

  const created =
    createdAt && createdAt.getTime() >= window.cutoffTime
      ? 1
      : 0
  const updated =
    updatedAt &&
    updatedAt.getTime() >= window.cutoffTime &&
    (!createdAt || updatedAt.getTime() !== createdAt.getTime())
      ? 1
      : 0

  return {
    created,
    updated,
    total: created + updated,
  }
}

export function buildGroupActivityFromWorkspace(
  groups: GroupNode[],
  input: {
    tribes: Array<{
      name: string
      createdAt?: string
      updatedAt?: string
    }>
    profiles: Array<{
      tribe?: string
      createdAt?: string
      updatedAt?: string
    }>
    projects: Array<{
      tribe?: string
      createdAt?: string
      updatedAt?: string
    }>
  },
  options?: { now?: Date; timeRange?: NetworkInsightsTimeRange },
): GroupActivityPoint[] {
  const now = options?.now ?? new Date()
  const timeRange = options?.timeRange ?? "90d"
  const window = resolveTimeWindow(timeRange, now)

  const tribesByKey = new Map<string, typeof input.tribes>()
  for (const tribe of input.tribes) {
    const key = normalizeAssociationKey(tribe.name)
    if (!key) {
      continue
    }
    const current = tribesByKey.get(key) || []
    current.push(tribe)
    tribesByKey.set(key, current)
  }

  const profilesByKey = new Map<string, typeof input.profiles>()
  for (const profile of input.profiles) {
    const key = normalizeAssociationKey(profile.tribe)
    if (!key) {
      continue
    }
    const current = profilesByKey.get(key) || []
    current.push(profile)
    profilesByKey.set(key, current)
  }

  const projectsByKey = new Map<string, typeof input.projects>()
  for (const project of input.projects) {
    const key = normalizeAssociationKey(project.tribe)
    if (!key) {
      continue
    }
    const current = projectsByKey.get(key) || []
    current.push(project)
    projectsByKey.set(key, current)
  }

  const points = groups.map((group) => {
    const key = normalizeAssociationKey(group.name)
    const relatedTribes = tribesByKey.get(key) || []
    const relatedProfiles = profilesByKey.get(key) || []
    const relatedProjects = projectsByKey.get(key) || []

    const posts = relatedProjects.reduce(
      (total, project) => total + countRecentRecordSignals(project, window).total,
      0,
    )
    const comments =
      relatedProfiles.reduce(
        (total, profile) => total + countRecentRecordSignals(profile, window).updated,
        0,
      ) +
      relatedTribes.reduce(
        (total, tribe) => total + countRecentRecordSignals(tribe, window).updated,
        0,
      )
    const joins =
      relatedProfiles.reduce(
        (total, profile) => total + countRecentRecordSignals(profile, window).created,
        0,
      ) +
      relatedTribes.reduce(
        (total, tribe) => total + countRecentRecordSignals(tribe, window).created,
        0,
      )

    return {
      group: group.name.slice(0, 12),
      posts,
      comments,
      joins,
    }
  })

  return points.some((point) => point.posts > 0 || point.comments > 0 || point.joins > 0)
    ? points
    : buildEstimatedGroupActivity(groups)
}

function buildJobScatterFromProjects(projects: SupabaseProjectView[]): JobScatterPoint[] {
  return projects.slice(0, 18).map((project, index) => ({
    id: project.id,
    title: project.name,
    industry: index % 2 === 0 ? "Engineering" : index % 3 === 0 ? "Product" : "Data",
    experienceYears: 3 + (index % 10),
    salaryK: 120 + ((project.progress || 0) % 120),
    matchScore: Math.max(62, Math.min(98, 60 + project.progress / 2)),
  }))
}

function buildJobFunnel(projects: SupabaseProjectView[]): { nodes: JobFunnelNode[]; links: JobFunnelLink[] } {
  const active = projects.filter((project) => project.status === "active").length
  const completed = projects.filter((project) => project.status === "completed").length
  const planned = projects.filter((project) => project.status === "planned").length

  const totalApplications = Math.max(80, active * 48 + planned * 22 + completed * 16)
  const screened = Math.max(45, Math.round(totalApplications * 0.62))
  const interviewed = Math.max(24, Math.round(screened * 0.57))
  const offered = Math.max(10, Math.round(interviewed * 0.52))
  const accepted = Math.max(6, Math.round(offered * 0.66))
  const declined = Math.max(2, offered - accepted)
  const rejected = Math.max(14, totalApplications - screened + interviewed - offered)

  return {
    nodes: [
      { name: "LinkedOut" },
      { name: "Email Sync" },
      { name: "Referrals" },
      { name: "Screening" },
      { name: "Interview" },
      { name: "Offer" },
      { name: "Accepted" },
      { name: "Declined" },
      { name: "Rejected" },
    ],
    links: [
      { source: 0, target: 3, value: Math.round(totalApplications * 0.54) },
      { source: 1, target: 3, value: Math.round(totalApplications * 0.28) },
      { source: 2, target: 3, value: Math.round(totalApplications * 0.18) },
      { source: 3, target: 4, value: interviewed },
      { source: 3, target: 8, value: rejected },
      { source: 4, target: 5, value: offered },
      { source: 4, target: 8, value: Math.max(4, interviewed - offered) },
      { source: 5, target: 6, value: accepted },
      { source: 5, target: 7, value: declined },
    ],
  }
}

function formatDayLabel(date: Date): string {
  return date.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

export function buildJobCalendarFromProjects(
  projects: Array<Pick<SupabaseProjectView, "createdAt" | "updatedAt">>,
  options?: { now?: Date; timeRange?: NetworkInsightsTimeRange; cellCount?: number },
): JobCalendarCell[] {
  const now = options?.now ?? new Date()
  const timeRange = options?.timeRange ?? "90d"
  const cellCount = Math.max(2, Math.min(options?.cellCount ?? 14, 28))
  const window = resolveTimeWindow(timeRange, now)
  const spanMs = Math.max(1, now.getTime() - window.windowStart.getTime())
  const bucketMs = Math.max(1, Math.ceil(spanMs / cellCount))
  const counts = Array.from({ length: cellCount }, () => 0)
  const labels = Array.from({ length: cellCount }, (_, index) =>
    formatDayLabel(new Date(window.windowStart.getTime() + index * bucketMs)),
  )

  for (const project of projects) {
    for (const timestamp of uniqueRecordTimestamps(project)) {
      const parsed = parseTimestamp(timestamp)
      if (!parsed || parsed.getTime() < window.cutoffTime) {
        continue
      }

      const bucketIndex = Math.min(
        cellCount - 1,
        Math.floor((parsed.getTime() - window.windowStart.getTime()) / bucketMs),
      )
      counts[bucketIndex] += 1
    }
  }

  const maxCount = Math.max(...counts, 0)
  return labels.map((date, index) => ({
    date,
    intensity: maxCount > 0 ? Math.round((counts[index] / maxCount) * 100) : 0,
  }))
}

function buildLiveNetworkInsightsDataset(input: {
  profiles: SupabaseProfileView[]
  tribes: NetworkInsightTribeSource[]
  projects: SupabaseProjectView[]
  timeRange?: NetworkInsightsTimeRange
}): NetworkInsightsDataset {
  const timeRange = input.timeRange ?? "90d"
  const friendNodes = input.profiles.length > 0 ? buildFriendNodesFromProfiles(input.profiles) : []
  const friendLinks = friendNodes.length > 0 ? buildFriendLinksFromNodes(friendNodes) : []
  const friendGrowth =
    input.profiles.length > 0 ? buildFriendGrowthFromProfiles(input.profiles, { timeRange }) : []
  const tribeData = input.tribes.length > 0 ? buildTribeBubblesFromTribes(input.tribes) : []
  const groupData = tribeData.length > 0 ? buildGroupsFromTribes(tribeData) : []
  const overlaps = groupData.length > 0 ? buildGroupOverlaps(groupData) : []
  const groupActivityData =
    groupData.length > 0
      ? buildGroupActivityFromWorkspace(groupData, {
          tribes: input.tribes,
          profiles: input.profiles,
          projects: input.projects,
        }, { timeRange })
      : []
  const groupHeatmap =
    input.profiles.length > 0 || input.tribes.length > 0 || input.projects.length > 0
      ? buildGroupHeatmapFromActivity([
          ...input.profiles,
          ...input.tribes,
          ...input.projects,
        ], { timeRange })
      : []
  const jobScatter = input.projects.length > 0 ? buildJobScatterFromProjects(input.projects) : []
  const jobFunnel = input.projects.length > 0 ? buildJobFunnel(input.projects) : {
    nodes: [],
    links: [],
  }
  const jobCalendar =
    input.projects.length > 0 ? buildJobCalendarFromProjects(input.projects, { timeRange }) : []

  return {
    friendNodes,
    friendLinks,
    friendGrowth,
    tribeBubbles: tribeData,
    groups: groupData,
    groupOverlaps: overlaps,
    groupActivity: groupActivityData,
    groupHeatmap,
    jobFunnelNodes: jobFunnel.nodes,
    jobFunnelLinks: jobFunnel.links,
    jobScatter,
    jobCalendar,
  }
}

function createUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !accessToken) {
    return null
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim()
  if (!trimmed) {
    return { firstName: "", lastName: "" }
  }
  const parts = trimmed.split(/\s+/g)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  }
}

async function fetchUserScopedProfiles(accessToken: string): Promise<SupabaseProfileView[] | null> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return null
  }
  const tables = getSupabaseTableNames()
  const { data, error } = await client.from(tables.profiles).select("*").limit(240)
  if (error || !data) {
    return null
  }

  return (data as Array<Record<string, unknown>>).map((row, index) => {
    const displayName = asString(row.name, "")
    const split = splitName(displayName)
    return {
      id: asString(row.id, `profile-${index + 1}`),
      firstName: asString(row.first_name ?? row.firstName, split.firstName || `Profile${index + 1}`),
      lastName: asString(row.last_name ?? row.lastName, split.lastName),
      headline: asString(row.headline, "Network profile"),
      company: asString(row.company, "Unknown"),
      location: asString(row.location, "Remote"),
      industry: asString(row.industry, "Engineering"),
      connections: asNumber(row.connections, 0),
      skills: asStringArray(row.skills),
      matchScore: asNumber(row.match_score ?? row.matchScore, 72),
      seniority: asString(row.seniority, "Senior"),
      tribe: asString(row.tribe ?? row.tribe_name, "") || undefined,
      linkedinUrl: asString(row.linkedin_url ?? row.linkedinUrl, "") || undefined,
      createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
      updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
    }
  })
}

async function fetchUserScopedTribes(accessToken: string): Promise<NetworkInsightTribeSource[] | null> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return null
  }
  const tables = getSupabaseTableNames()
  const { data, error } = await client.from(tables.tribes).select("*").limit(120)
  if (error || !data) {
    return null
  }

  return (data as Array<Record<string, unknown>>).map((row, index) => ({
    id: asString(row.id, `tribe-${index + 1}`),
    name: asString(row.name, `Tribe ${index + 1}`),
    members: Array.isArray(row.members) ? row.members : [],
    industryFocus: asString(row.industry_focus ?? row.industryFocus, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }))
}

async function fetchUserScopedProjects(accessToken: string): Promise<SupabaseProjectView[] | null> {
  const client = createUserScopedClient(accessToken)
  if (!client) {
    return null
  }
  const tables = getSupabaseTableNames()
  const { data, error } = await client.from(tables.projects).select("*").limit(200)
  if (error || !data) {
    return null
  }

  return (data as Array<Record<string, unknown>>).map((row, index) => ({
    id: asString(row.id, `project-${index + 1}`),
    name: asString(row.name, `Project ${index + 1}`),
    description: asString(row.description, ""),
    type: "team-building",
    status: asString(row.status, "active") as SupabaseProjectView["status"],
    progress: asNumber(row.progress, 0),
    profiles: asNumber(row.profiles ?? row.profile_count, 0),
    tribe: asString(row.tribe, "") || undefined,
    targetDate: asString(row.target_date ?? row.targetDate, "") || undefined,
    tags: asStringArray(row.tags),
    milestones: [],
    nextAction: asString(row.next_action ?? row.nextAction, "Review"),
    aspirations: asStringArray(row.aspirations),
    blockers: asStringArray(row.blockers),
    priority: undefined,
    owner: undefined,
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }))
}

export async function getNetworkInsightsFromSupabase(
  options?: { timeRange?: NetworkInsightsTimeRange },
): Promise<{
  dataset: NetworkInsightsDataset
  live: boolean
}> {
  const timeRange = options?.timeRange ?? "90d"
  const empty = emptyNetworkInsightsDataset()
  const [profiles, tribes, projects] = await Promise.all([
    fetchSupabaseProfiles(),
    fetchSupabaseTribes(),
    fetchSupabaseProjects(),
  ])

  const hasLiveProfiles = Boolean(profiles && profiles.length > 0)
  const hasLiveTribes = Boolean(tribes && tribes.length > 0)
  const hasLiveProjects = Boolean(projects && projects.length > 0)
  const live = hasLiveProfiles || hasLiveTribes || hasLiveProjects

  if (!live) {
    return { dataset: empty, live: false }
  }

  return {
    live,
    dataset: buildLiveNetworkInsightsDataset({
      profiles: hasLiveProfiles ? (profiles || []) as SupabaseProfileView[] : [],
      tribes: hasLiveTribes ? (tribes || []) as NetworkInsightTribeSource[] : [],
      projects: hasLiveProjects ? (projects || []) as SupabaseProjectView[] : [],
      timeRange,
    }),
  }
}

export async function getNetworkInsightsWithAccessToken(
  accessToken?: string,
  options?: { allowServiceFallback?: boolean; timeRange?: NetworkInsightsTimeRange },
): Promise<{ dataset: NetworkInsightsDataset; live: boolean }> {
  const allowServiceFallback = options?.allowServiceFallback === true
  const timeRange = options?.timeRange ?? "90d"
  const empty = emptyNetworkInsightsDataset()

  if (!accessToken) {
    if (allowServiceFallback) {
      return getNetworkInsightsFromSupabase({ timeRange })
    }
    return {
      dataset: empty,
      live: false,
    }
  }
  const [tokenProfiles, tokenTribes, tokenProjects] = await Promise.all([
    fetchUserScopedProfiles(accessToken),
    fetchUserScopedTribes(accessToken),
    fetchUserScopedProjects(accessToken),
  ])

  const hasLiveProfiles = Boolean(tokenProfiles && tokenProfiles.length > 0)
  const hasLiveTribes = Boolean(tokenTribes && tokenTribes.length > 0)
  const hasLiveProjects = Boolean(tokenProjects && tokenProjects.length > 0)
  const live = hasLiveProfiles || hasLiveTribes || hasLiveProjects

  if (!live) {
    if (allowServiceFallback) {
      return getNetworkInsightsFromSupabase({ timeRange })
    }
    return {
      dataset: empty,
      live: false,
    }
  }

  return {
    live,
    dataset: buildLiveNetworkInsightsDataset({
      profiles: hasLiveProfiles ? tokenProfiles || [] : [],
      tribes: hasLiveTribes ? tokenTribes || [] : [],
      projects: hasLiveProjects ? tokenProjects || [] : [],
      timeRange,
    }),
  }
}
