import { tool } from "ai"
import { z } from "zod"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  fetchSupabaseProjectCrmRecommendations,
  fetchSupabaseProjectHiringSnapshot,
} from "@/lib/supabase/supabase-data"
import type { SupabaseAuthContext } from "@/lib/supabase/supabase-auth"

// LinkedIn API Tool Definitions
// These simulate the full LinkedIn API endpoint set as AI-callable tools

type DbRow = Record<string, unknown>

type CrmProfile = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  headline: string
  company: string
  location: string
  industry: string
  connections: number
  skills: string[]
  matchScore: number
  seniority: string
  tribe?: string
  linkedinUrl?: string
  createdAt?: string
  updatedAt?: string
}

const PROFILE_FETCH_PAGE_SIZE = 1000
const PROFILE_FETCH_MAX_LIMIT = 5000
const DESIGN_TRIBE_MAX_CANDIDATES = 3000
const DESIGN_TRIBE_MAX_TRIBES_PER_CALL = 12
const DESIGN_TRIBE_MAX_TRIBE_SIZE = 50
const LINKEDIN_SHARE_AUDIT_TABLE =
  process.env.SUPABASE_LINKEDIN_SHARE_AUDIT_TABLE || "linkedin_share_audit"
const LINKEDIN_MESSAGE_DRAFTS_TABLE =
  process.env.SUPABASE_LINKEDIN_MESSAGE_DRAFTS_TABLE || "linkedin_message_drafts"
const LINKEDIN_CONNECTION_REQUESTS_TABLE =
  process.env.SUPABASE_LINKEDIN_CONNECTION_REQUESTS_TABLE || "linkedin_connection_requests"

type LinkedinAnalyticsTimeRange = "7d" | "30d" | "90d"

type LinkedInShareAuditRecord = {
  responseUgcPostId?: string
  responseShareId?: string
  shareType?: string
  visibility?: string
  requestText?: string
  requestMediaUrl?: string
  requestMediaUrls?: string[]
  requestLinkUrl?: string
  requestTitle?: string
  requestDescription?: string
  responseStatus: number
  publishedAt?: string
  createdAt?: string
}

type LinkedinToolPostPlan = {
  shareText: string
  requestedContentType: string
  effectiveContentType: "text"
  requestedVisibility: string
  auditVisibility: "public" | "connections" | "logged_in"
  ugcVisibility: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN"
  requestLinkUrl: string | null
  scheduledAt: string | null
  publishNow: boolean
  warnings: string[]
}

type LinkedinMessageDraftInput = {
  subject?: string | null
  message: string
  isInMail?: boolean | null
}

type LinkedInMessageDraftRecord = {
  id: string
  profileId: string
  channel: "message" | "inmail"
  subject?: string
  bodyText: string
  deliveryStatus: "draft_ready" | "manual_sent" | "archived"
  lastManualSentAt?: string
  createdAt?: string
  updatedAt?: string
}

type LinkedInConnectionRequestRecord = {
  id: string
  profileId: string
  note?: string
  requestStatus: "draft_ready" | "manual_sent" | "withdrawn" | "archived"
  sentAt?: string
  createdAt?: string
  updatedAt?: string
}

type LinkedOutContactStateRecord = {
  profileId: string
  objectiveId?: string
  queueStatus: string
  score: number | null
  relationshipStrength: number | null
  freshness: number | null
  updatedAt?: string
}

type LinkedOutOutreachEventRecord = {
  profileId: string
  eventType: string
  createdAt?: string
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item).trim())
      .filter(Boolean)
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => asString(item).trim())
          .filter(Boolean)
      }
    } catch {
      // fall back to CSV split
    }
    return trimmed
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\s+/g)
    .map((word) => word.trim())
    .filter(Boolean)
}

function parseJsonArray(input: unknown): DbRow[] {
  if (!Array.isArray(input)) {
    return []
  }
  return input
    .filter((value): value is DbRow => Boolean(value && typeof value === "object" && !Array.isArray(value)))
    .map((value) => ({ ...value }))
}

function createRandomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createUserScopedSupabaseClient(authContext: SupabaseAuthContext | null): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!authContext?.accessToken || !url || !anonKey) {
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
        Authorization: `Bearer ${authContext.accessToken}`,
      },
    },
  })
}

function createSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return null
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function mapProfileRow(row: DbRow): CrmProfile {
  const firstName = asString(row.first_name || row.firstName)
  const lastName = asString(row.last_name || row.lastName)
  const displayName = asString(row.name)
  const fullName = `${firstName} ${lastName}`.trim() || displayName || "Unknown profile"
  return {
    id: asString(row.id),
    firstName,
    lastName,
    fullName,
    headline: asString(row.headline, "LinkedIn profile"),
    company: asString(row.company, "Unknown"),
    location: asString(row.location, "Unknown"),
    industry: asString(row.industry, "General"),
    connections: asNumber(row.connections ?? row.connections_count, 0),
    skills: asStringArray(row.skills),
    matchScore: Math.max(0, Math.min(100, asNumber(row.match_score ?? row.matchScore, 70))),
    seniority: asString(row.seniority, "Mid"),
    tribe: asString(row.tribe ?? row.tribe_name) || undefined,
    linkedinUrl: asString(row.linkedin_url ?? row.linkedinUrl) || undefined,
    createdAt: asString(row.created_at ?? row.createdAt) || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt) || undefined,
  }
}

async function fetchWorkspaceProfiles(
  client: SupabaseClient,
  limit = 500,
): Promise<CrmProfile[]> {
  const boundedLimit = Math.max(1, Math.min(limit, PROFILE_FETCH_MAX_LIMIT))
  const rows: DbRow[] = []
  let from = 0

  while (rows.length < boundedLimit) {
    const remaining = boundedLimit - rows.length
    const pageSize = Math.min(PROFILE_FETCH_PAGE_SIZE, remaining)
    const to = from + pageSize - 1

    const { data, error } = await client
      .from("profiles")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)

    if (error || !data) {
      break
    }

    rows.push(...(data as DbRow[]))
    if (data.length < pageSize) {
      break
    }

    from += data.length
  }

  const deduped = new Map<string, CrmProfile>()
  for (const row of rows) {
    const profile = mapProfileRow(row)
    if (profile.id && !deduped.has(profile.id)) {
      deduped.set(profile.id, profile)
    }
  }

  return Array.from(deduped.values())
}

async function fetchWorkspaceProfileCount(client: SupabaseClient): Promise<number | null> {
  const { count, error } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })

  if (error || typeof count !== "number" || !Number.isFinite(count)) {
    return null
  }

  return Math.max(0, Math.floor(count))
}

async function fetchProfilesByIds(
  client: SupabaseClient,
  profileIds: string[],
): Promise<CrmProfile[]> {
  const ids = profileIds.map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) {
    return []
  }

  const { data, error } = await client
    .from("profiles")
    .select("*")
    .in("id", ids.slice(0, 400))

  if (error || !data) {
    return []
  }

  return (data as DbRow[]).map(mapProfileRow).filter((profile) => Boolean(profile.id))
}

function filterProfiles(
  profiles: CrmProfile[],
  input: {
    keywords: string
    location?: string | null
    industry?: string | null
    currentCompany?: string | null
    pastCompany?: string | null
    title?: string | null
    skills?: string[] | null
    experienceYears?: number | null
  },
): CrmProfile[] {
  const keywords = normalizeWords(input.keywords || "")
  const normalizedSkills = (input.skills || []).map((skill) => skill.toLowerCase())

  return profiles.filter((profile) => {
    const haystack = [
      profile.fullName,
      profile.headline,
      profile.company,
      profile.location,
      profile.industry,
      profile.skills.join(" "),
      profile.seniority,
    ]
      .join(" ")
      .toLowerCase()

    if (keywords.length > 0 && !keywords.every((word) => haystack.includes(word))) {
      return false
    }

    if (input.location?.trim() && !profile.location.toLowerCase().includes(input.location.toLowerCase())) {
      return false
    }

    if (input.industry?.trim() && !profile.industry.toLowerCase().includes(input.industry.toLowerCase())) {
      return false
    }

    if (input.currentCompany?.trim() && !profile.company.toLowerCase().includes(input.currentCompany.toLowerCase())) {
      return false
    }

    if (input.pastCompany?.trim() && !haystack.includes(input.pastCompany.toLowerCase())) {
      return false
    }

    if (input.title?.trim() && !profile.headline.toLowerCase().includes(input.title.toLowerCase())) {
      return false
    }

    if (normalizedSkills.length > 0) {
      const profileSkills = new Set(profile.skills.map((skill) => skill.toLowerCase()))
      const hasAllSkills = normalizedSkills.every((skill) => profileSkills.has(skill))
      if (!hasAllSkills) {
        return false
      }
    }

    if (typeof input.experienceYears === "number" && Number.isFinite(input.experienceYears)) {
      const seniority = profile.seniority.toLowerCase()
      const inferredYears =
        seniority.includes("intern") || seniority.includes("junior")
          ? 1
          : seniority.includes("mid")
          ? 4
          : seniority.includes("senior")
          ? 7
          : seniority.includes("staff") || seniority.includes("principal")
          ? 10
          : seniority.includes("director") || seniority.includes("vp")
          ? 14
          : 6
      if (inferredYears < input.experienceYears) {
        return false
      }
    }

    return true
  })
}

function buildTribeMembersFromProfiles(profiles: CrmProfile[]): DbRow[] {
  const roles = ["Lead", "Strategist", "Executor", "Creative", "Analyst", "Connector"]
  return profiles.map((profile, index) => ({
    personId: profile.id,
    name: profile.fullName,
    tribeRole: roles[index % roles.length],
    projectRoles: [],
    seniority: profile.seniority,
    skills: profile.skills,
    tags: [],
  }))
}

function buildCommonSkills(profiles: CrmProfile[], limit = 8): string[] {
  const counts = new Map<string, { skill: string; count: number }>()
  for (const profile of profiles) {
    for (const skill of profile.skills) {
      const key = skill.toLowerCase()
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { skill, count: 1 })
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => item.skill)
}

function estimateAverageExperience(profiles: CrmProfile[]): number {
  if (profiles.length === 0) return 0
  const total = profiles.reduce((acc, profile) => {
    const seniority = profile.seniority.toLowerCase()
    if (seniority.includes("intern") || seniority.includes("junior")) return acc + 2
    if (seniority.includes("mid")) return acc + 5
    if (seniority.includes("senior")) return acc + 8
    if (seniority.includes("staff") || seniority.includes("principal")) return acc + 11
    if (seniority.includes("director") || seniority.includes("vp") || seniority.includes("chief")) return acc + 14
    return acc + 6
  }, 0)
  return Number((total / profiles.length).toFixed(1))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundScore(value: number): number {
  return Number(value.toFixed(1))
}

function formatYearMonth(value: Date | null, fallback = "unknown"): string {
  if (!value) {
    return fallback
  }
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0")
  return `${value.getUTCFullYear()}-${month}`
}

function formatMonthYear(value: Date | null, fallback = "recently"): string {
  if (!value) {
    return fallback
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value)
}

function estimateExperienceYearsFromSeniority(seniority: string): number {
  const normalized = seniority.toLowerCase()
  if (normalized.includes("intern") || normalized.includes("junior")) return 2
  if (normalized.includes("mid")) return 5
  if (normalized.includes("senior")) return 8
  if (normalized.includes("staff") || normalized.includes("principal") || normalized.includes("lead")) return 11
  if (normalized.includes("director") || normalized.includes("vp") || normalized.includes("chief") || normalized.includes("cxo")) {
    return 14
  }
  return 6
}

export function buildTribeCreationInsights(
  members: CrmProfile[],
  options?: { optimizeFor?: string | null },
): {
  commonSkills: string[]
  industryFocus: string
  cohesion: number
  complementarity: number
  strengths: string[]
  radarData: Array<{ metric: string; value: number }>
  skillDist: Array<{ name: string; value: number }>
} {
  const optimizeFor = (options?.optimizeFor || "balanced").trim().toLowerCase()
  const commonSkills = buildCommonSkills(members, 10)
  const industryFocus = getMostCommonLabel(
    members.map((member) => member.industry),
    members[0]?.industry || "General",
  )
  const skillDistribution = buildCategoryBreakdown(
    members.flatMap((member) => member.skills.map((skill) => skill.trim()).filter(Boolean)),
    (skill) => skill,
    6,
  )
  const commonSkillCoverage = buildSkillCoverage(members, commonSkills.slice(0, 4)).coverage
  const avgMatchScore = averageNumber(members.map((member) => member.matchScore))
  const avgConnections = averageNumber(members.map((member) => member.connections))
  const avgExperience = estimateAverageExperience(members)
  const uniqueCompanies = new Set(
    members.map((member) => normalizeCompanyKey(member.company)).filter(Boolean),
  ).size
  const uniqueIndustries = new Set(
    members.map((member) => member.industry.trim().toLowerCase()).filter(Boolean),
  ).size
  const uniqueLocations = new Set(
    members.map((member) => normalizeLocationKey(member.location)).filter(Boolean),
  ).size
  const uniqueSeniorityBands = new Set(
    members.map((member) => inferSeniorityBand(member.seniority)).filter(Boolean),
  ).size
  const uniqueSkillCount = new Set(
    members.flatMap((member) => member.skills.map((skill) => normalizeSkillKey(skill))),
  ).size
  const hasLeadership = members.some((member) => {
    const band = inferSeniorityBand(member.seniority)
    return band === "Lead/Staff" || band === "Executive"
  })

  let pairwiseSharedSkillRatio = 0
  let pairCount = 0
  for (let left = 0; left < members.length; left += 1) {
    for (let right = left + 1; right < members.length; right += 1) {
      const denominator = Math.max(1, Math.min(members[left].skills.length || 1, members[right].skills.length || 1))
      pairwiseSharedSkillRatio += countSharedSkills(members[left], members[right]) / denominator
      pairCount += 1
    }
  }
  if (pairCount > 0) {
    pairwiseSharedSkillRatio /= pairCount
  }

  const sharedSkillScore = clampNumber(
    commonSkillCoverage.length > 0
      ? averageNumber(commonSkillCoverage.map((item) => item.coveragePercent)) / 10
      : commonSkills.length > 0
        ? 4.5
        : 2.5,
    1,
    10,
  )
  const pairwiseSkillScore = clampNumber(2 + pairwiseSharedSkillRatio * 8, 1, 10)
  const companyAlignmentScore = clampNumber(10 - Math.max(0, uniqueCompanies - 1) * 1.5, 4, 10)
  const industryAlignmentScore = clampNumber(10 - Math.max(0, uniqueIndustries - 1) * 1.3, 4, 10)
  const skillBreadthScore = clampNumber(2 + (uniqueSkillCount / Math.max(members.length, 1)) * 1.6, 2, 10)
  const companyDiversityScore = clampNumber(2.8 + Math.max(0, uniqueCompanies - 1) * 1.8, 2, 10)
  const industryDiversityScore = clampNumber(2.8 + Math.max(0, uniqueIndustries - 1) * 1.6, 2, 10)
  const locationDiversityScore = clampNumber(2.8 + Math.max(0, uniqueLocations - 1) * 1.4, 2, 10)
  const seniorityMixScore = clampNumber(2.8 + Math.max(0, uniqueSeniorityBands - 1) * 2.2, 2, 10)
  const leadershipCoverageScore = hasLeadership ? 8.6 : clampNumber(5.2 + avgExperience * 0.2, 4.5, 8.1)

  let cohesion =
    sharedSkillScore * 0.35 +
    pairwiseSkillScore * 0.2 +
    (avgMatchScore / 10) * 0.25 +
    companyAlignmentScore * 0.1 +
    industryAlignmentScore * 0.1
  let complementarity =
    skillBreadthScore * 0.35 +
    seniorityMixScore * 0.2 +
    companyDiversityScore * 0.15 +
    industryDiversityScore * 0.1 +
    locationDiversityScore * 0.1 +
    leadershipCoverageScore * 0.1

  if (optimizeFor === "skills") {
    cohesion += sharedSkillScore >= 7 ? 0.3 : 0.1
    complementarity += skillBreadthScore >= 7 ? 0.5 : 0.2
  } else if (optimizeFor === "diversity") {
    cohesion -= 0.1
    complementarity +=
      (companyDiversityScore + industryDiversityScore + locationDiversityScore) / 3 >= 6 ? 0.6 : 0.3
  } else if (optimizeFor === "seniority" || optimizeFor === "leadership") {
    cohesion += hasLeadership ? 0.3 : 0.1
    complementarity += uniqueSeniorityBands >= 3 ? 0.5 : 0.2
  } else if (optimizeFor === "speed") {
    cohesion += avgExperience >= 7 ? 0.5 : 0.2
    complementarity += commonSkills.length >= 3 ? 0.2 : 0
  }

  cohesion = roundScore(clampNumber(cohesion, 1, 10))
  complementarity = roundScore(clampNumber(complementarity, 1, 10))

  const radarData = [
    { metric: "Cohesion", value: Math.round(clampNumber(cohesion * 10, 20, 100)) },
    {
      metric: "Skills",
      value: Math.round(clampNumber((sharedSkillScore * 0.55 + skillBreadthScore * 0.45) * 10, 20, 100)),
    },
    {
      metric: "Diversity",
      value: Math.round(
        clampNumber(
          (companyDiversityScore * 0.3 +
            industryDiversityScore * 0.25 +
            locationDiversityScore * 0.2 +
            seniorityMixScore * 0.25) * 10,
          20,
          100,
        ),
      ),
    },
    {
      metric: "Leadership",
      value: Math.round(clampNumber((leadershipCoverageScore * 0.6 + Math.min(avgExperience, 10) * 0.4) * 10, 20, 100)),
    },
    {
      metric: "Speed",
      value: Math.round(
        clampNumber((Math.min(avgExperience, 10) * 0.35 + sharedSkillScore * 0.35 + pairwiseSkillScore * 0.3) * 10, 20, 100),
      ),
    },
  ]

  const strengths = [
    commonSkills.length > 0 ? `Shared strength in ${commonSkills.slice(0, 2).join(" + ")}` : null,
    uniqueCompanies > 1 ? `Cross-company perspective from ${uniqueCompanies} organizations` : null,
    uniqueSeniorityBands > 1 ? `Balanced ${uniqueSeniorityBands}-level seniority mix` : null,
    avgConnections >= 700 ? `Strong network reach with ${Math.round(avgConnections)} average connections` : null,
    avgExperience >= 7 ? `${avgExperience} years average experience across the group` : null,
    industryFocus ? `Aligned around ${industryFocus}` : null,
  ].filter((item): item is string => Boolean(item))

  return {
    commonSkills,
    industryFocus,
    cohesion,
    complementarity,
    strengths: strengths.slice(0, 4),
    radarData,
    skillDist:
      skillDistribution.length > 0
        ? skillDistribution.slice(0, 5).map((item) => ({
            name: item.label,
            value: item.count,
          }))
        : [{ name: industryFocus, value: Math.max(1, members.length) }],
  }
}

export function buildDerivedProfileDetails(
  profile: CrmProfile,
  options?: { now?: Date; workspaceProfiles?: CrmProfile[] },
): {
  summary: string
  currentPosition: Record<string, unknown>
  positions: Array<Record<string, unknown>>
  education: Array<Record<string, unknown>>
  endorsements: number
  recommendations: number
  profileViews: number
  searchAppearances: number
  notes: string[]
} {
  const now = options?.now ?? new Date()
  const primarySkill = profile.skills[0] || profile.industry || "execution"
  const secondarySkill = profile.skills[1] || inferSeniorityBand(profile.seniority) || "delivery"
  const trackedSince = parseIsoDate(profile.createdAt) || parseIsoDate(profile.updatedAt) || now
  const workspaceAnalytics =
    options?.workspaceProfiles && options.workspaceProfiles.length > 1
      ? buildProfileViewAnalytics(profile, options.workspaceProfiles, { now })
      : null
  const profileViews =
    workspaceAnalytics?.totalViews ||
    Math.max(20, Math.round(profile.matchScore * 2 + Math.min(profile.connections, 2500) * 0.08 + profile.skills.length * 6))
  const searchAppearances =
    workspaceAnalytics?.searchAppearances ||
    Math.max(8, Math.round(profileViews * 0.28 + profile.skills.length * 1.5))
  const currentPosition = {
    title: profile.headline,
    company: profile.company,
    startDate: formatYearMonth(trackedSince),
    endDate: null,
    description: `Derived from CRM headline and company fields. Focus areas include ${primarySkill} and ${secondarySkill}.`,
    location: profile.location,
    isCurrent: true,
    companyIndustry: profile.industry,
    tags: ["derived-from-crm"],
    metadata: {
      source: "workspace_crm",
      positionHistoryStatus: "current_role_only",
    },
  }
  const summaryParts = [
    `${profile.headline} at ${profile.company} in ${profile.location}.`,
    profile.skills.length > 0
      ? `Core strengths include ${dedupeCaseInsensitive(profile.skills).slice(0, 4).join(", ")}.`
      : `Primary operating context is ${profile.industry}.`,
    profile.tribe ? `Current tribe: ${profile.tribe}.` : null,
    `Workspace activity has tracked this profile since ${formatMonthYear(trackedSince)}.`,
  ].filter((part): part is string => Boolean(part))

  return {
    summary: summaryParts.join(" "),
    currentPosition,
    positions: [currentPosition],
    education: [
      {
        school: "Education not captured in workspace CRM",
        degree: "Unavailable",
        fieldOfStudy: primarySkill,
        startDate: "",
        endDate: "",
        metadata: {
          source: "workspace_crm",
          educationStatus: "not_captured",
        },
      },
    ],
    endorsements: Math.max(
      5,
      Math.round(profile.matchScore * (profile.skills.length > 0 ? 1.8 : 1.2) + Math.min(profile.connections, 2000) * 0.04),
    ),
    recommendations: Math.max(
      1,
      Math.round(profile.matchScore / 18 + Math.min(profile.connections, 1500) / 600),
    ),
    profileViews,
    searchAppearances,
    notes: [
      "Position history is limited to the current role inferred from CRM fields.",
      "Education details are not stored in this workspace.",
    ],
  }
}

function normalizeRequestedFieldKey(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "").toLowerCase()
}

export function pickProfileDetailFields(
  profile: Record<string, unknown>,
  fields: string[] | null | undefined,
): {
  profile: Record<string, unknown>
  ignoredFields: string[]
} {
  const requested = dedupeCaseInsensitive(fields || [])
  if (requested.length === 0) {
    return {
      profile,
      ignoredFields: [],
    }
  }

  const normalized = requested.map((field) => ({
    raw: field,
    key: normalizeRequestedFieldKey(field),
  }))
  if (normalized.some((field) => field.key === "all" || field.key === "" || field.key === "*")) {
    return {
      profile,
      ignoredFields: [],
    }
  }

  const aliases = new Map<string, string>([
    ["id", "id"],
    ["firstname", "firstName"],
    ["lastname", "lastName"],
    ["name", "name"],
    ["fullname", "name"],
    ["title", "title"],
    ["headline", "title"],
    ["company", "company"],
    ["location", "location"],
    ["industry", "industry"],
    ["seniority", "seniority"],
    ["tribe", "tribe"],
    ["connections", "connections"],
    ["matchscore", "matchScore"],
    ["skills", "skills"],
    ["linkedinurl", "linkedinUrl"],
    ["summary", "summary"],
    ["currentposition", "currentPosition"],
    ["positions", "positions"],
    ["education", "education"],
    ["endorsements", "endorsements"],
    ["recommendations", "recommendations"],
    ["profileviews", "profileViews"],
    ["searchappearances", "searchAppearances"],
    ["createdat", "createdAt"],
    ["updatedat", "updatedAt"],
  ])

  const selected: Record<string, unknown> = {}
  const ignoredFields: string[] = []
  if ("id" in profile) {
    selected.id = profile.id
  }

  for (const field of normalized) {
    const targetKey = aliases.get(field.key)
    if (!targetKey) {
      ignoredFields.push(field.raw)
      continue
    }
    if (targetKey in profile) {
      selected[targetKey] = profile[targetKey]
    }
  }

  return {
    profile: selected,
    ignoredFields,
  }
}

function ensureAuthenticatedToolsContext(authContext: SupabaseAuthContext | null): {
  ok: true
  userClient: SupabaseClient
} | {
  ok: false
  error: string
} {
  if (!authContext?.isSupabaseSession || !authContext.userId) {
    return {
      ok: false,
      error: "Authenticated Supabase session required for this tool.",
    }
  }

  const userClient = createUserScopedSupabaseClient(authContext)
  if (!userClient) {
    return {
      ok: false,
      error: "Supabase environment is not configured for authenticated CRM operations.",
    }
  }

  return { ok: true, userClient }
}

function ensureAuthenticatedUserContext(authContext: SupabaseAuthContext | null): {
  ok: true
  userId: string
} | {
  ok: false
  error: string
} {
  if (!authContext?.isSupabaseSession || !authContext.userId) {
    return {
      ok: false,
      error: "Authenticated Supabase session required for this tool.",
    }
  }

  return {
    ok: true,
    userId: authContext.userId,
  }
}

function isMissingRelationError(error: { message?: string } | null | undefined): boolean {
  return Boolean(
    error?.message &&
      /does not exist|relation .* does not exist|table .* does not exist|could not find the table/i.test(
        error.message,
      ),
  )
}

function mapLinkedinMessageDraftRow(row: DbRow): LinkedInMessageDraftRecord {
  const channel = asString(row.channel, "message").trim().toLowerCase() === "inmail" ? "inmail" : "message"
  const deliveryStatus = asString(row.delivery_status ?? row.deliveryStatus, "draft_ready").trim().toLowerCase()
  return {
    id: asString(row.id),
    profileId: asString(row.profile_id ?? row.profileId),
    channel,
    subject: asString(row.subject) || undefined,
    bodyText: asString(row.body_text ?? row.bodyText),
    deliveryStatus:
      deliveryStatus === "manual_sent"
        ? "manual_sent"
        : deliveryStatus === "archived"
          ? "archived"
          : "draft_ready",
    lastManualSentAt: asString(row.last_manual_sent_at ?? row.lastManualSentAt) || undefined,
    createdAt: asString(row.created_at ?? row.createdAt) || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt) || undefined,
  }
}

function mapLinkedinConnectionRequestRow(row: DbRow): LinkedInConnectionRequestRecord {
  const requestStatus = asString(row.request_status ?? row.status, "draft_ready").trim().toLowerCase()
  return {
    id: asString(row.id),
    profileId: asString(row.profile_id ?? row.profileId),
    note: asString(row.note) || undefined,
    requestStatus:
      requestStatus === "manual_sent"
        ? "manual_sent"
        : requestStatus === "withdrawn"
          ? "withdrawn"
          : requestStatus === "archived"
            ? "archived"
            : "draft_ready",
    sentAt: asString(row.sent_at ?? row.sentAt) || undefined,
    createdAt: asString(row.created_at ?? row.createdAt) || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt) || undefined,
  }
}

function mapLinkedoutContactStateRow(row: DbRow): LinkedOutContactStateRecord {
  return {
    profileId: asString(row.profile_id ?? row.profileId),
    objectiveId: asString(row.objective_id ?? row.objectiveId) || undefined,
    queueStatus: asString(row.queue_status ?? row.queueStatus, "intro"),
    score: row.score == null ? null : asNumber(row.score),
    relationshipStrength:
      row.relationship_strength == null ? null : asNumber(row.relationship_strength),
    freshness: row.freshness == null ? null : asNumber(row.freshness),
    updatedAt: asString(row.updated_at ?? row.updatedAt) || undefined,
  }
}

function mapLinkedoutOutreachEventRow(row: DbRow): LinkedOutOutreachEventRecord {
  return {
    profileId: asString(row.profile_id ?? row.profileId),
    eventType: asString(row.event_type ?? row.eventType),
    createdAt: asString(row.created_at ?? row.createdAt) || undefined,
  }
}

async function fetchLinkedinMessageDrafts(
  client: SupabaseClient,
  limit = 120,
): Promise<{ records: LinkedInMessageDraftRecord[]; missingTable: boolean }> {
  const { data, error } = await client
    .from(LINKEDIN_MESSAGE_DRAFTS_TABLE)
    .select("id,profile_id,channel,subject,body_text,delivery_status,last_manual_sent_at,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return {
      records: [],
      missingTable: isMissingRelationError(error as { message?: string } | null | undefined),
    }
  }

  return {
    records: (data as DbRow[]).map(mapLinkedinMessageDraftRow).filter((record) => Boolean(record.id && record.profileId)),
    missingTable: false,
  }
}

async function fetchLinkedinConnectionRequests(
  client: SupabaseClient,
  limit = 120,
): Promise<{ records: LinkedInConnectionRequestRecord[]; missingTable: boolean }> {
  const { data, error } = await client
    .from(LINKEDIN_CONNECTION_REQUESTS_TABLE)
    .select("id,profile_id,note,request_status,sent_at,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return {
      records: [],
      missingTable: isMissingRelationError(error as { message?: string } | null | undefined),
    }
  }

  return {
    records: (data as DbRow[]).map(mapLinkedinConnectionRequestRow).filter((record) => Boolean(record.id && record.profileId)),
    missingTable: false,
  }
}

async function fetchLinkedoutContactStates(
  client: SupabaseClient,
  limit = 500,
): Promise<{ records: LinkedOutContactStateRecord[]; missingTable: boolean }> {
  const { data, error } = await client
    .from("linkedout_contact_states")
    .select("profile_id,objective_id,queue_status,score,relationship_strength,freshness,updated_at")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 1000)))

  if (error || !data) {
    return {
      records: [],
      missingTable: isMissingRelationError(error as { message?: string } | null | undefined),
    }
  }

  return {
    records: (data as DbRow[])
      .map(mapLinkedoutContactStateRow)
      .filter((record) => Boolean(record.profileId)),
    missingTable: false,
  }
}

async function fetchLinkedoutOutreachEvents(
  client: SupabaseClient,
  limit = 800,
): Promise<{ records: LinkedOutOutreachEventRecord[]; missingTable: boolean }> {
  const { data, error } = await client
    .from("linkedout_outreach_events")
    .select("profile_id,event_type,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 1500)))

  if (error || !data) {
    return {
      records: [],
      missingTable: isMissingRelationError(error as { message?: string } | null | undefined),
    }
  }

  return {
    records: (data as DbRow[])
      .map(mapLinkedoutOutreachEventRow)
      .filter((record) => Boolean(record.profileId)),
    missingTable: false,
  }
}

async function persistLinkedinMessageDraft(
  client: SupabaseClient,
  input: {
    ownerUserId: string
    profileId: string
    channel: "message" | "inmail"
    subject?: string | null
    bodyText: string
  },
): Promise<{ record: LinkedInMessageDraftRecord | null; missingTable: boolean; error?: string }> {
  const nowIso = new Date().toISOString()
  const { data, error } = await client
    .from(LINKEDIN_MESSAGE_DRAFTS_TABLE)
    .insert({
      owner_user_id: input.ownerUserId,
      profile_id: input.profileId,
      channel: input.channel,
      subject: input.subject?.trim() || null,
      body_text: input.bodyText.trim(),
      delivery_status: "draft_ready",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id,profile_id,channel,subject,body_text,delivery_status,last_manual_sent_at,created_at,updated_at")
    .single()

  if (error || !data) {
    return {
      record: null,
      missingTable: isMissingRelationError(error as { message?: string } | null | undefined),
      error: error?.message,
    }
  }

  return {
    record: mapLinkedinMessageDraftRow(data as DbRow),
    missingTable: false,
  }
}

async function persistLinkedinConnectionRequest(
  client: SupabaseClient,
  input: {
    ownerUserId: string
    profileId: string
    note?: string | null
  },
): Promise<{ record: LinkedInConnectionRequestRecord | null; missingTable: boolean; error?: string }> {
  const nowIso = new Date().toISOString()
  const { data, error } = await client
    .from(LINKEDIN_CONNECTION_REQUESTS_TABLE)
    .insert({
      owner_user_id: input.ownerUserId,
      profile_id: input.profileId,
      note: input.note?.trim() || null,
      request_status: "draft_ready",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id,profile_id,note,request_status,sent_at,created_at,updated_at")
    .single()

  if (error || !data) {
    return {
      record: null,
      missingTable: isMissingRelationError(error as { message?: string } | null | undefined),
      error: error?.message,
    }
  }

  return {
    record: mapLinkedinConnectionRequestRow(data as DbRow),
    missingTable: false,
  }
}

function summarizeConversationText(value: string | undefined, fallback: string): string {
  const compact = (value || "").replace(/\s+/g, " ").trim()
  if (!compact) {
    return fallback
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact
}

export function buildLinkedinConversationSummaries(
  messages: LinkedInMessageDraftRecord[],
  requests: LinkedInConnectionRequestRecord[],
  profiles: CrmProfile[],
  options?: { status?: string | null; limit?: number | null },
): Array<{
  id: string
  participant: string
  participantId: string
  lastMessage: string
  timestamp: string
  unread: boolean
  status: "read" | "unread" | "archived"
  messageCount: number
  pendingDrafts: number
  pendingConnectionRequests: number
  lastActivityType: "message_draft" | "inmail_draft" | "connection_request"
}> {
  const normalizedStatus = (options?.status || "all").trim().toLowerCase()
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
  const grouped = new Map<
    string,
    {
      messages: LinkedInMessageDraftRecord[]
      requests: LinkedInConnectionRequestRecord[]
    }
  >()

  for (const record of messages) {
    const existing = grouped.get(record.profileId)
    if (existing) {
      existing.messages.push(record)
    } else {
      grouped.set(record.profileId, { messages: [record], requests: [] })
    }
  }

  for (const record of requests) {
    const existing = grouped.get(record.profileId)
    if (existing) {
      existing.requests.push(record)
    } else {
      grouped.set(record.profileId, { messages: [], requests: [record] })
    }
  }

  const conversations = Array.from(grouped.entries()).map(([profileId, group]) => {
    const activities = [
      ...group.messages.map((record) => ({
        kind: record.channel === "inmail" ? "inmail_draft" as const : "message_draft" as const,
        timestamp: record.updatedAt || record.createdAt || new Date(0).toISOString(),
        status: record.deliveryStatus,
        summary: summarizeConversationText(record.bodyText, "LinkedIn message draft"),
      })),
      ...group.requests.map((record) => ({
        kind: "connection_request" as const,
        timestamp: record.updatedAt || record.sentAt || record.createdAt || new Date(0).toISOString(),
        status: record.requestStatus,
        summary: summarizeConversationText(record.note, "Connection request drafted"),
      })),
    ].sort((a, b) => {
      const aTime = parseIsoDate(a.timestamp)?.getTime() || 0
      const bTime = parseIsoDate(b.timestamp)?.getTime() || 0
      return bTime - aTime
    })

    const latest = activities[0] || {
      kind: "message_draft" as const,
      timestamp: new Date(0).toISOString(),
      status: "draft_ready",
      summary: "LinkedIn outreach draft",
    }
    const pendingDrafts = group.messages.filter((record) => record.deliveryStatus === "draft_ready").length
    const pendingConnectionRequests = group.requests.filter((record) => record.requestStatus === "draft_ready").length
    const archived =
      activities.length > 0 &&
      activities.every((activity) => activity.status === "archived" || activity.status === "withdrawn")
    const status: "read" | "unread" | "archived" = archived
      ? "archived"
      : pendingDrafts + pendingConnectionRequests > 0
        ? "unread"
        : "read"
    const profile = profileMap.get(profileId) || null

    return {
      id: buildStableSlug("conv", profileId),
      participant: profile?.fullName || `Profile ${profileId}`,
      participantId: profileId,
      lastMessage: latest.summary,
      timestamp: latest.timestamp,
      unread: status === "unread",
      status,
      messageCount: group.messages.length,
      pendingDrafts,
      pendingConnectionRequests,
      lastActivityType: latest.kind,
    }
  })

  const filtered = conversations.filter((conversation) => {
    if (normalizedStatus !== "read" && normalizedStatus !== "unread" && normalizedStatus !== "archived") {
      return true
    }
    return conversation.status === normalizedStatus
  })

  return filtered
    .sort((a, b) => (parseIsoDate(b.timestamp)?.getTime() || 0) - (parseIsoDate(a.timestamp)?.getTime() || 0))
    .slice(0, Math.max(1, Math.min(options?.limit || 20, 100)))
}

export function buildWorkspaceProfileConnections(
  center: CrmProfile,
  profiles: CrmProfile[],
  options?: {
    degree?: number | null
    limit?: number | null
    contactStates?: LinkedOutContactStateRecord[]
    outreachEvents?: LinkedOutOutreachEventRecord[]
  },
): {
  connections: Array<{
    profileId: string
    name: string
    title: string
    company: string
    location: string
    mutualConnections: number
    degree: number
    relationshipStrength: number
    sharedSignals: string[]
    queueStatus: string | null
    lastInteraction: string | null
  }>
  totalConnections: number
  filteredConnections: number
} {
  const requestedDegree = Math.max(1, Math.min(options?.degree || 1, 3))
  const limit = Math.max(1, Math.min(options?.limit || 10, 50))

  const contactStateByProfile = new Map<string, LinkedOutContactStateRecord>()
  for (const state of options?.contactStates || []) {
    if (!state.profileId || state.profileId === center.id) continue
    const existing = contactStateByProfile.get(state.profileId)
    const existingTs = parseIsoDate(existing?.updatedAt)?.getTime() || 0
    const nextTs = parseIsoDate(state.updatedAt)?.getTime() || 0
    if (!existing || nextTs >= existingTs) {
      contactStateByProfile.set(state.profileId, state)
    }
  }

  const outreachEventsByProfile = new Map<string, LinkedOutOutreachEventRecord[]>()
  for (const event of options?.outreachEvents || []) {
    if (!event.profileId || event.profileId === center.id) continue
    const existing = outreachEventsByProfile.get(event.profileId)
    if (existing) {
      existing.push(event)
    } else {
      outreachEventsByProfile.set(event.profileId, [event])
    }
  }

  const centerSkills = new Set(center.skills.map((skill) => normalizeSkillKey(skill)))
  const scored = profiles
    .filter((candidate) => candidate.id !== center.id)
    .map((candidate) => {
      const sharedSignals: string[] = []
      const sharedSkills = candidate.skills.filter((skill) => centerSkills.has(normalizeSkillKey(skill)))
      const sameCompany =
        center.company.trim().toLowerCase() === candidate.company.trim().toLowerCase() &&
        center.company.trim().length > 0
      const sameTribe =
        Boolean(center.tribe?.trim()) &&
        Boolean(candidate.tribe?.trim()) &&
        center.tribe!.trim().toLowerCase() === candidate.tribe!.trim().toLowerCase()
      const sameIndustry =
        center.industry.trim().toLowerCase() === candidate.industry.trim().toLowerCase() &&
        center.industry.trim().length > 0
      const sameLocation =
        center.location.trim().toLowerCase() === candidate.location.trim().toLowerCase() &&
        center.location.trim().length > 0
      const contactState = contactStateByProfile.get(candidate.id) || null
      const outreachEvents = outreachEventsByProfile.get(candidate.id) || []
      const outreachScore = outreachEvents.reduce((sum, event) => {
        if (event.eventType === "intro_generated") return sum + 8
        if (event.eventType === "note_copied") return sum + 5
        if (event.eventType === "profile_opened") return sum + 2
        if (event.eventType === "cull_exported") return sum - 6
        return sum
      }, 0)

      let score = 0
      if (sameCompany) {
        score += 30
        sharedSignals.push(`Same company: ${candidate.company}`)
      }
      if (sameTribe) {
        score += 26
        sharedSignals.push(`Same tribe: ${candidate.tribe}`)
      }
      if (sameIndustry) {
        score += 10
        sharedSignals.push(`Same industry: ${candidate.industry}`)
      }
      if (sameLocation) {
        score += 8
        sharedSignals.push(`Same location: ${candidate.location}`)
      }
      if (sharedSkills.length > 0) {
        score += Math.min(sharedSkills.length, 4) * 9
        sharedSignals.push(`Shared skills: ${sharedSkills.slice(0, 4).join(", ")}`)
      }
      if (contactState?.queueStatus) {
        sharedSignals.push(`LinkedOut queue: ${contactState.queueStatus}`)
      }
      if (outreachEvents.length > 0) {
        sharedSignals.push(`Outreach touches: ${outreachEvents.length}`)
      }

      score += Math.max(0, 12 - Math.abs(center.matchScore - candidate.matchScore) * 0.2)
      score += Math.min(Math.min(center.connections, candidate.connections), 2500) * 0.004
      score += (contactState?.relationshipStrength || 0) * 0.35
      score += (contactState?.freshness || 0) * 0.12
      score += (contactState?.score || 0) * 0.08
      score += outreachScore

      const relationshipStrength = Math.max(0, Math.min(100, Math.round(score)))
      const mutualConnections = Math.max(
        0,
        Math.min(
          Math.min(Math.max(center.connections, 0), Math.max(candidate.connections, 0)),
          Math.round(
            (sameCompany ? 12 : 0) +
              (sameTribe ? 10 : 0) +
              (sameIndustry ? 4 : 0) +
              (sameLocation ? 3 : 0) +
              sharedSkills.length * 6 +
              Math.round((contactState?.relationshipStrength || 0) / 14) +
              outreachEvents.length * 2,
          ),
        ),
      )

      let degree = 3
      if (sameCompany || sameTribe || relationshipStrength >= 70) {
        degree = 1
      } else if (sameIndustry || sameLocation || sharedSkills.length >= 2 || outreachEvents.length > 0 || relationshipStrength >= 40) {
        degree = 2
      }

      const lastInteractionTimes = [
        parseIsoDate(contactState?.updatedAt)?.getTime() || 0,
        ...outreachEvents.map((event) => parseIsoDate(event.createdAt)?.getTime() || 0),
      ].filter((value) => value > 0)
      const lastInteraction =
        lastInteractionTimes.length > 0 ? new Date(Math.max(...lastInteractionTimes)).toISOString() : null

      return {
        profileId: candidate.id,
        name: candidate.fullName,
        title: candidate.headline,
        company: candidate.company,
        location: candidate.location,
        mutualConnections,
        degree,
        relationshipStrength,
        sharedSignals: sharedSignals.slice(0, 4),
        queueStatus: contactState?.queueStatus || null,
        lastInteraction,
      }
    })
    .filter((connection) => connection.degree === requestedDegree)
    .sort((a, b) => {
      if (b.relationshipStrength !== a.relationshipStrength) {
        return b.relationshipStrength - a.relationshipStrength
      }
      if (b.mutualConnections !== a.mutualConnections) {
        return b.mutualConnections - a.mutualConnections
      }
      return a.name.localeCompare(b.name)
    })

  return {
    connections: scored.slice(0, limit),
    totalConnections: Math.max(center.connections, scored.length),
    filteredConnections: scored.length,
  }
}

function describeProfile(profile: CrmProfile) {
  return {
    id: profile.id,
    name: profile.fullName,
    title: profile.headline,
    company: profile.company,
    location: profile.location,
    industry: profile.industry,
    seniority: profile.seniority,
    tribe: profile.tribe || null,
    connections: profile.connections,
    matchScore: profile.matchScore,
    skills: profile.skills.slice(0, 12),
    linkedinUrl: profile.linkedinUrl || null,
  }
}

async function fetchWorkspaceTribes(
  client: SupabaseClient,
  limit = 120,
): Promise<DbRow[]> {
  const { data, error } = await client
    .from("tribes")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return []
  }
  return data as DbRow[]
}

async function fetchWorkspaceProjectsRows(
  client: SupabaseClient,
  limit = 120,
): Promise<DbRow[]> {
  const { data, error } = await client
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)))

  if (error || !data) {
    return []
  }
  return data as DbRow[]
}

function mapTribeSummary(row: DbRow) {
  const members = parseJsonArray(row.members)
  const commonSkills = asStringArray(row.common_skills)
  return {
    id: asString(row.id),
    name: asString(row.name, "Tribe"),
    description: asString(row.description),
    industryFocus: asString(row.industry_focus || row.industryFocus),
    status: asString(row.status, "active"),
    memberCount: members.length,
    commonSkills: commonSkills.slice(0, 10),
    cohesion: asNumber(row.cohesion, 0),
    complementarity: asNumber(row.complementarity, 0),
    projects: asStringArray(row.projects).slice(0, 20),
    updatedAt: asString(row.updated_at || row.updatedAt),
  }
}

function mapProjectSummary(row: DbRow) {
  const milestones = parseJsonArray(row.milestones)
  return {
    id: asString(row.id),
    name: asString(row.name, "Project"),
    description: asString(row.description),
    type: asString(row.type, "team-building"),
    status: asString(row.status, "active"),
    progress: asNumber(row.progress, 0),
    profiles: asNumber(row.profiles ?? row.profile_count, 0),
    tribe: asString(row.tribe) || null,
    targetDate: asString(row.target_date || row.targetDate) || null,
    tags: asStringArray(row.tags).slice(0, 20),
    nextAction: asString(row.next_action || row.nextAction),
    milestoneCount: milestones.length,
    updatedAt: asString(row.updated_at || row.updatedAt),
  }
}

type BreakdownItem = {
  label: string
  count: number
  percentage: number
}

type SkillCoverageItem = {
  skill: string
  matchedProfiles: number
  coveragePercent: number
}

function averageNumber(values: number[]): number {
  if (values.length === 0) return 0
  const total = values.reduce((sum, value) => sum + value, 0)
  return Number((total / values.length).toFixed(1))
}

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1))
  }
  return Number(sorted[middle].toFixed(1))
}

function normalizeSkillKey(value: string): string {
  return value.trim().toLowerCase()
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function inferSeniorityBand(seniority: string): string {
  const normalized = seniority.toLowerCase()
  if (normalized.includes("intern") || normalized.includes("junior")) return "Junior"
  if (normalized.includes("mid")) return "Mid"
  if (normalized.includes("senior")) return "Senior"
  if (normalized.includes("staff") || normalized.includes("principal") || normalized.includes("lead")) return "Lead/Staff"
  if (normalized.includes("director") || normalized.includes("vp") || normalized.includes("chief") || normalized.includes("cxo")) {
    return "Executive"
  }
  return "Unknown"
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

function normalizeLinkedinAnalyticsTimeRange(value: string | null | undefined): LinkedinAnalyticsTimeRange {
  if (value === "7d" || value === "90d") {
    return value
  }
  return "30d"
}

function normalizeLinkedinShareVisibility(
  value: string | null | undefined,
): {
  requestedVisibility: string
  auditVisibility: "public" | "connections" | "logged_in"
  ugcVisibility: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN"
  unsupported: boolean
} {
  const normalized = (value || "public").trim().toLowerCase()
  if (normalized === "connections") {
    return {
      requestedVisibility: "connections",
      auditVisibility: "connections",
      ugcVisibility: "CONNECTIONS",
      unsupported: false,
    }
  }
  if (normalized === "logged_in" || normalized === "loggedin") {
    return {
      requestedVisibility: "logged_in",
      auditVisibility: "logged_in",
      ugcVisibility: "LOGGED_IN",
      unsupported: false,
    }
  }
  if (normalized === "group") {
    return {
      requestedVisibility: "group",
      auditVisibility: "connections",
      ugcVisibility: "CONNECTIONS",
      unsupported: true,
    }
  }
  return {
    requestedVisibility: "public",
    auditVisibility: "public",
    ugcVisibility: "PUBLIC",
    unsupported: false,
  }
}

export function buildLinkedinPostPlan(
  input: {
    content: string
    contentType: string
    visibility?: string | null
    scheduledTime?: string | null
    hashtags?: string[] | null
    mediaUrl?: string | null
  },
  options?: { now?: Date },
): LinkedinToolPostPlan {
  const now = options?.now ?? new Date()
  const warnings: string[] = []
  const visibility = normalizeLinkedinShareVisibility(input.visibility)
  if (visibility.unsupported) {
    warnings.push("Group visibility is not supported by the configured LinkedIn share path.")
  }

  const requestedContentType = (input.contentType || "post").trim().toLowerCase() || "post"
  if (requestedContentType !== "post" && requestedContentType !== "text") {
    warnings.push(
      `Requested contentType "${requestedContentType}" will publish as a text post because only text UGC publishing is configured.`,
    )
  }

  const trimmedContent = input.content.trim()
  const hashtags = dedupeCaseInsensitive(
    (input.hashtags || []).map((tag) => {
      const stripped = tag.replace(/^#+/g, "").trim()
      return stripped ? `#${stripped}` : ""
    }),
  )

  const messageLines = [trimmedContent]
  const existingContentLower = trimmedContent.toLowerCase()
  if (hashtags.length > 0) {
    const missingHashtags = hashtags.filter((tag) => !existingContentLower.includes(tag.toLowerCase()))
    if (missingHashtags.length > 0) {
      messageLines.push(missingHashtags.join(" "))
    }
  }

  const mediaUrl = (input.mediaUrl || "").trim()
  if (mediaUrl) {
    messageLines.push(mediaUrl)
    warnings.push("Media attachments are published as links because direct LinkedIn media upload is not configured.")
  }

  let shareText = messageLines.filter(Boolean).join("\n\n")
  if (shareText.length > 3000) {
    shareText = shareText.slice(0, 3000)
    warnings.push("Post text exceeded 3000 characters and was truncated to fit the LinkedIn share API.")
  }

  let scheduledAt: string | null = null
  let publishNow = true
  const parsedScheduledAt = parseIsoDate(input.scheduledTime || undefined)
  if (input.scheduledTime?.trim()) {
    if (!parsedScheduledAt) {
      warnings.push("scheduledTime was not a valid ISO datetime and was ignored.")
    } else if (parsedScheduledAt.getTime() > now.getTime()) {
      scheduledAt = parsedScheduledAt.toISOString()
      publishNow = false
    } else {
      warnings.push("scheduledTime was in the past, so the post was published immediately.")
    }
  }

  return {
    shareText,
    requestedContentType,
    effectiveContentType: "text",
    requestedVisibility: visibility.requestedVisibility,
    auditVisibility: visibility.auditVisibility,
    ugcVisibility: visibility.ugcVisibility,
    requestLinkUrl: mediaUrl || null,
    scheduledAt,
    publishNow,
    warnings,
  }
}

export function buildLinkedinMessageDraft(
  recipient: CrmProfile,
  input: LinkedinMessageDraftInput,
): {
  draftId: string
  status: "draft_ready"
  channel: "linkedin_message" | "linkedin_inmail"
  subject: string | null
  message: string
  recipient: {
    id: string
    name: string
    title: string
    company: string
    location: string
  }
  personalizationSignals: string[]
  warnings: string[]
} {
  const channel = input.isInMail ? "linkedin_inmail" : "linkedin_message"
  const warnings: string[] = []
  const subject = input.subject?.trim() || null
  if (channel === "linkedin_inmail" && !subject) {
    warnings.push("InMail drafts usually perform better with a subject line.")
  }

  const personalizationSignals = dedupeCaseInsensitive([
    recipient.company,
    recipient.location,
    recipient.industry,
    recipient.tribe || "",
    ...recipient.skills.slice(0, 3),
  ]).slice(0, 5)

  return {
    draftId: createRandomId("msg-draft"),
    status: "draft_ready",
    channel,
    subject,
    message: input.message.trim(),
    recipient: {
      id: recipient.id,
      name: recipient.fullName,
      title: recipient.headline,
      company: recipient.company,
      location: recipient.location,
    },
    personalizationSignals,
    warnings,
  }
}

function getLinkedinAnalyticsWindowDays(timeRange: LinkedinAnalyticsTimeRange): number {
  if (timeRange === "7d") return 7
  if (timeRange === "90d") return 90
  return 30
}

function resolveLinkedinAnalyticsWindow(timeRange: LinkedinAnalyticsTimeRange, now: Date) {
  const days = getLinkedinAnalyticsWindowDays(timeRange)
  const currentWindowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const previousWindowStart = new Date(currentWindowStart.getTime() - days * 24 * 60 * 60 * 1000)
  return {
    days,
    currentWindowStart,
    previousWindowStart,
  }
}

function normalizeCompanyKey(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeLocationKey(value: string): string {
  return value.trim().toLowerCase()
}

function buildStableSlug(prefix: string, value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${prefix}-${slug || "item"}`
}

function resolveProfileActivityDate(profile: Pick<CrmProfile, "createdAt" | "updatedAt">): Date | null {
  return parseIsoDate(profile.updatedAt) || parseIsoDate(profile.createdAt)
}

function getProfileSkillContribution(profile: CrmProfile): number {
  return Math.max(
    8,
    Math.round(profile.matchScore * 0.4 + Math.min(profile.connections, 2000) * 0.012),
  )
}

function getMostCommonLabel(values: string[], fallback: string): string {
  const filtered = values.map((value) => value.trim()).filter(Boolean)
  if (filtered.length === 0) {
    return fallback
  }

  const counts = new Map<string, number>()
  for (const value of filtered) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })[0]?.[0] || fallback
}

function getCompanySizeBucket(employeeCount: number): string {
  if (employeeCount <= 10) return "1-10"
  if (employeeCount <= 50) return "11-50"
  if (employeeCount <= 200) return "51-200"
  if (employeeCount <= 500) return "201-500"
  if (employeeCount <= 1000) return "501-1000"
  if (employeeCount <= 5000) return "1001-5000"
  return "5000+"
}

function formatRelativeAge(value: string | undefined, now = new Date()): string {
  const parsed = parseIsoDate(value)
  if (!parsed) {
    return "recently"
  }

  const diffDays = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000)))
  if (diffDays === 0) {
    return "today"
  }
  if (diffDays === 1) {
    return "1 day ago"
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`
  }

  const diffMonths = Math.max(1, Math.round(diffDays / 30))
  if (diffMonths === 1) {
    return "1 month ago"
  }
  return `${diffMonths} months ago`
}

function inferDepartmentFromProfile(profile: CrmProfile): string {
  const haystack = `${profile.headline} ${profile.industry} ${profile.skills.join(" ")}`.toLowerCase()
  if (haystack.includes("engineer") || haystack.includes("developer") || haystack.includes("platform") || haystack.includes("software")) {
    return "Engineering"
  }
  if (haystack.includes("recruit") || haystack.includes("talent") || haystack.includes("people") || haystack.includes("human resources")) {
    return "HR"
  }
  if (haystack.includes("product") || haystack.includes("pm ")) {
    return "Product"
  }
  if (haystack.includes("design") || haystack.includes("ux") || haystack.includes("ui")) {
    return "Design"
  }
  if (haystack.includes("data") || haystack.includes("analytics") || haystack.includes("machine learning") || haystack.includes("ai")) {
    return "Data"
  }
  if (haystack.includes("market") || haystack.includes("growth") || haystack.includes("brand")) {
    return "Marketing"
  }
  if (haystack.includes("finance") || haystack.includes("account")) {
    return "Finance"
  }
  if (haystack.includes("operations") || haystack.includes("ops")) {
    return "Operations"
  }
  if (
    haystack.includes("chief") ||
    haystack.includes(" cto") ||
    haystack.includes(" ceo") ||
    haystack.includes(" coo") ||
    haystack.includes(" cfo") ||
    haystack.includes("president") ||
    haystack.includes("director") ||
    haystack.includes("vp ") ||
    haystack.includes("head of")
  ) {
    return "Executive"
  }
  return "General"
}

function formatProfileTenure(profile: Pick<CrmProfile, "createdAt" | "updatedAt">, now = new Date()): string {
  const start = parseIsoDate(profile.createdAt)
  if (!start) {
    return "Not tracked"
  }

  const months = Math.max(
    1,
    Math.round((now.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000)),
  )
  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"} in CRM`
  }

  const years = Number((months / 12).toFixed(1))
  return `${years} year${years === 1 ? "" : "s"} in CRM`
}

export function filterProfilesForSkillsAnalysis(
  profiles: CrmProfile[],
  input: {
    profileIds?: string[] | null
    companyId?: string | null
    industry?: string | null
  },
): CrmProfile[] {
  const selectedIds = new Set((input.profileIds || []).map((id) => id.trim()).filter(Boolean))
  const companyKey = normalizeCompanyKey(input.companyId || "")
  const industryKey = (input.industry || "").trim().toLowerCase()

  return profiles.filter((profile) => {
    if (selectedIds.size > 0 && !selectedIds.has(profile.id)) {
      return false
    }
    if (companyKey) {
      const profileCompany = normalizeCompanyKey(profile.company)
      if (!profileCompany || (!profileCompany.includes(companyKey) && profileCompany !== companyKey)) {
        return false
      }
    }
    if (industryKey) {
      const profileIndustry = profile.industry.trim().toLowerCase()
      if (!profileIndustry || !profileIndustry.includes(industryKey)) {
        return false
      }
    }
    return true
  })
}

export function buildSkillInsights(
  profiles: CrmProfile[],
  options?: { now?: Date; limit?: number },
): Array<{ name: string; frequency: number; avgEndorsements: number; trending: boolean }> {
  if (profiles.length === 0) {
    return []
  }

  const now = options?.now ?? new Date()
  const recentCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).getTime()
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 25))
  const recentProfiles = profiles.filter((profile) => {
    const activityDate = resolveProfileActivityDate(profile)
    return activityDate ? activityDate.getTime() >= recentCutoff : false
  })
  const baselineProfiles = profiles.filter((profile) => {
    const activityDate = resolveProfileActivityDate(profile)
    return !activityDate || activityDate.getTime() < recentCutoff
  })

  const counts = new Map<string, {
    name: string
    matchedProfiles: number
    endorsementTotal: number
    recentMatchedProfiles: number
    baselineMatchedProfiles: number
  }>()

  for (const profile of profiles) {
    const uniqueSkills = dedupeCaseInsensitive(profile.skills)
    const contribution = getProfileSkillContribution(profile)
    const activityDate = resolveProfileActivityDate(profile)
    const isRecent = activityDate ? activityDate.getTime() >= recentCutoff : false
    for (const skill of uniqueSkills) {
      const key = normalizeSkillKey(skill)
      const current = counts.get(key) || {
        name: skill,
        matchedProfiles: 0,
        endorsementTotal: 0,
        recentMatchedProfiles: 0,
        baselineMatchedProfiles: 0,
      }
      current.matchedProfiles += 1
      current.endorsementTotal += contribution
      if (isRecent) {
        current.recentMatchedProfiles += 1
      } else {
        current.baselineMatchedProfiles += 1
      }
      counts.set(key, current)
    }
  }

  return Array.from(counts.values())
    .map((entry) => {
      const recentRate =
        recentProfiles.length > 0 ? entry.recentMatchedProfiles / recentProfiles.length : 0
      const baselineRate =
        baselineProfiles.length > 0 ? entry.baselineMatchedProfiles / baselineProfiles.length : 0
      const trending =
        recentProfiles.length > 0 &&
        (baselineProfiles.length === 0
          ? entry.recentMatchedProfiles >= 2
          : recentRate > baselineRate + 0.08)

      return {
        name: entry.name,
        frequency: Number(((entry.matchedProfiles / profiles.length) * 100).toFixed(1)),
        avgEndorsements: Math.round(entry.endorsementTotal / Math.max(entry.matchedProfiles, 1)),
        trending,
      }
    })
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency
      if (b.avgEndorsements !== a.avgEndorsements) return b.avgEndorsements - a.avgEndorsements
      return a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}

export function buildWorkspaceCompanyEmployees(
  profiles: CrmProfile[],
  input: {
    companyId: string
    department?: string | null
    seniorityLevel?: string | null
    limit?: number | null
  },
  options?: { now?: Date },
): {
  company: string
  totalEmployees: number
  employees: Array<{
    name: string
    title: string
    department: string
    tenure: string
    location: string
  }>
} {
  const companyKey = normalizeCompanyKey(input.companyId)
  const departmentKey = (input.department || "").trim().toLowerCase()
  const seniorityKey = (input.seniorityLevel || "").trim().toLowerCase()
  const limit = Math.max(1, Math.min(input.limit || 10, 50))
  const companyProfiles = profiles.filter((profile) => normalizeCompanyKey(profile.company) === companyKey)
  const filteredProfiles = companyProfiles.filter((profile) => {
    const department = inferDepartmentFromProfile(profile).toLowerCase()
    const seniority = `${profile.seniority} ${inferSeniorityBand(profile.seniority)}`.toLowerCase()
    if (departmentKey && !department.includes(departmentKey)) {
      return false
    }
    if (seniorityKey && !seniority.includes(seniorityKey)) {
      return false
    }
    return true
  })

  const companyName = getMostCommonLabel(companyProfiles.map((profile) => profile.company), input.companyId)
  const sortedProfiles = [...filteredProfiles].sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
    return b.connections - a.connections
  })

  return {
    company: companyName,
    totalEmployees: companyProfiles.length,
    employees: sortedProfiles.slice(0, limit).map((profile) => ({
      name: profile.fullName,
      title: profile.headline,
      department: inferDepartmentFromProfile(profile),
      tenure: formatProfileTenure(profile, options?.now),
      location: profile.location,
    })),
  }
}

export function buildWorkspaceCompanySearchResults(
  profiles: CrmProfile[],
  input: {
    name?: string | null
    industry?: string | null
    size?: string | null
    location?: string | null
  },
  options?: { now?: Date; limit?: number },
): Array<{
  id: string
  name: string
  industry: string
  size: string
  headquarters: string
  employeeCount: number
  growthRate: string
  founded: number | null
}> {
  const now = options?.now ?? new Date()
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 50))
  const nameKey = normalizeCompanyKey(input.name || "")
  const industryKey = (input.industry || "").trim().toLowerCase()
  const sizeKey = (input.size || "").trim()
  const locationKey = normalizeLocationKey(input.location || "")
  const recentCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).getTime()

  const grouped = new Map<string, CrmProfile[]>()
  for (const profile of profiles) {
    const company = profile.company.trim()
    if (!company) {
      continue
    }
    const key = normalizeCompanyKey(company)
    const existing = grouped.get(key) || []
    existing.push(profile)
    grouped.set(key, existing)
  }

  return Array.from(grouped.entries())
    .map(([key, companyProfiles]) => {
      const companyName = getMostCommonLabel(companyProfiles.map((profile) => profile.company), "Unknown")
      const industry = getMostCommonLabel(companyProfiles.map((profile) => profile.industry), "General")
      const headquarters = getMostCommonLabel(companyProfiles.map((profile) => profile.location), "Unknown")
      const employeeCount = companyProfiles.length
      const size = getCompanySizeBucket(employeeCount)
      const recentHires = companyProfiles.filter((profile) => {
        const activityDate = resolveProfileActivityDate(profile)
        return activityDate ? activityDate.getTime() >= recentCutoff : false
      }).length
      const establishedEmployees = Math.max(employeeCount - recentHires, 1)
      const oldestCreatedAt = companyProfiles
        .map((profile) => parseIsoDate(profile.createdAt))
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => a.getTime() - b.getTime())[0] || null

      return {
        id: buildStableSlug("company", key),
        name: companyName,
        industry,
        size,
        headquarters,
        employeeCount,
        growthRate: `${Math.round((recentHires / establishedEmployees) * 100)}%`,
        founded: oldestCreatedAt ? oldestCreatedAt.getUTCFullYear() : null,
      }
    })
    .filter((company) => {
      if (nameKey && !normalizeCompanyKey(company.name).includes(nameKey)) {
        return false
      }
      if (industryKey && !company.industry.toLowerCase().includes(industryKey)) {
        return false
      }
      if (sizeKey && company.size !== sizeKey) {
        return false
      }
      if (locationKey && !normalizeLocationKey(company.headquarters).includes(locationKey)) {
        return false
      }
      return true
    })
    .sort((a, b) => {
      if (b.employeeCount !== a.employeeCount) return b.employeeCount - a.employeeCount
      return a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}

type WorkspaceJobListing = {
  id: string
  title: string
  company: string
  location: string
  posted: string
  applicants: number
  salary: string
  experienceLevel: string
}

function inferExperienceLevel(value: string): string {
  const seniority = value.trim()
  const band = inferSeniorityBand(seniority)
  if (band === "Junior") return "Entry"
  if (band === "Mid") return "Mid"
  if (band === "Senior") return "Senior"
  if (band === "Lead/Staff") return "Staff"
  if (band === "Executive") return "Director"
  return seniority || "Mid"
}

function inferSalaryBand(seniority: string, openings: number): string {
  const level = inferExperienceLevel(seniority).toLowerCase()
  if (level.includes("entry")) return "$80K - $115K"
  if (level.includes("mid")) return "$110K - $150K"
  if (level.includes("senior")) return "$140K - $190K"
  if (level.includes("staff")) return "$170K - $230K"
  if (level.includes("director")) return openings > 1 ? "$190K - $260K" : "$210K - $280K"
  return "Not specified"
}

async function fetchWorkspaceProjectPositionsRows(
  client: SupabaseClient,
  limit = 300,
  projectIds?: string[],
): Promise<DbRow[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 1000))
  let query = client
    .from("project_positions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(boundedLimit)

  if (projectIds && projectIds.length > 0) {
    query = query.in("project_id", projectIds.slice(0, 400))
  }

  const { data, error } = await query
  if (error || !data) {
    return []
  }
  return data as DbRow[]
}

async function fetchWorkspaceApplicationCountsByPosition(
  client: SupabaseClient,
  positionIds: string[],
): Promise<Map<string, number>> {
  const ids = positionIds.map((id) => id.trim()).filter(Boolean)
  if (ids.length === 0) {
    return new Map<string, number>()
  }

  const { data, error } = await client
    .from("project_applications")
    .select("position_id")
    .in("position_id", ids.slice(0, 400))

  if (error || !data) {
    return new Map<string, number>()
  }

  return (data as DbRow[]).reduce((map, row) => {
    const positionId = asString(row.position_id)
    if (positionId) {
      map.set(positionId, (map.get(positionId) || 0) + 1)
    }
    return map
  }, new Map<string, number>())
}

export function buildWorkspaceJobListings(
  projects: DbRow[],
  positions: DbRow[],
  input: {
    keywords: string
    location?: string | null
    company?: string | null
    experienceLevel?: string | null
    jobType?: string | null
  },
  options?: {
    now?: Date
    applicationsByPosition?: Map<string, number>
    limit?: number
  },
): WorkspaceJobListing[] {
  const now = options?.now ?? new Date()
  const applicationsByPosition = options?.applicationsByPosition || new Map<string, number>()
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 50))
  const activeProjectStatuses = new Set(["planned", "active", "pending", "paused", "at-risk", "on-hold"])
  const keywords = normalizeWords(input.keywords || "")
  const locationKey = normalizeLocationKey(input.location || "")
  const companyKey = normalizeCompanyKey(input.company || "")
  const experienceKey = (input.experienceLevel || "").trim().toLowerCase()
  const jobTypeKey = (input.jobType || "").trim().toLowerCase()
  const projectsById = new Map(projects.map((project) => [asString(project.id), project]))

  return positions
    .map((row) => {
      const projectId = asString(row.project_id)
      const project = projectsById.get(projectId)
      if (!project) {
        return null
      }

      const projectStatus = asString(project.status, "active").toLowerCase()
      if (!activeProjectStatuses.has(projectStatus)) {
        return null
      }

      const positionStatus = asString(row.status, "open").toLowerCase()
      if (positionStatus === "closed") {
        return null
      }

      const company = asString(project.owner).trim() || "LinkedOut Workspace"
      const title = asString(row.title, "Position")
      const location = asString(row.location).trim() || asString(project.tribe).trim() || "Remote"
      const seniority = asString(row.seniority).trim() || asString(project.priority).trim() || "Mid"
      const requiredSkills = asStringArray(row.required_skills)
      const openings = Math.max(1, asNumber(row.openings, 1))
      const haystack = [
        title,
        asString(row.description),
        company,
        asString(project.name),
        asString(project.description),
        asString(project.type),
        location,
        seniority,
        ...requiredSkills,
      ]
        .join(" ")
        .toLowerCase()

      if (keywords.length > 0 && !keywords.every((token) => haystack.includes(token))) {
        return null
      }
      if (locationKey && !normalizeLocationKey(location).includes(locationKey)) {
        return null
      }
      if (companyKey) {
        const matchesCompany =
          normalizeCompanyKey(company).includes(companyKey) ||
          normalizeCompanyKey(asString(project.name)).includes(companyKey)
        if (!matchesCompany) {
          return null
        }
      }

      const experienceLevel = inferExperienceLevel(seniority)
      if (experienceKey && !experienceLevel.toLowerCase().includes(experienceKey)) {
        return null
      }

      if (jobTypeKey) {
        if (jobTypeKey === "remote") {
          if (!location.toLowerCase().includes("remote")) {
            return null
          }
        } else if (!haystack.includes(jobTypeKey)) {
          return null
        }
      }

      return {
        id: asString(row.id),
        title,
        company,
        location,
        posted: formatRelativeAge(asString(row.created_at || row.createdAt) || asString(project.created_at || project.createdAt), now),
        applicants: applicationsByPosition.get(asString(row.id)) || 0,
        salary: inferSalaryBand(seniority, openings),
        experienceLevel,
        createdAtMs: parseIsoDate(asString(row.created_at || row.createdAt) || asString(project.created_at || project.createdAt))?.getTime() || 0,
        openings,
      }
    })
    .filter((job): job is WorkspaceJobListing & { createdAtMs: number; openings: number } => Boolean(job))
    .sort((a, b) => {
      if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs
      if (b.openings !== a.openings) return b.openings - a.openings
      return a.title.localeCompare(b.title)
    })
    .slice(0, limit)
    .map(({ createdAtMs: _createdAtMs, openings: _openings, ...job }) => job)
}

function computeProfileActivitySignal(
  profile: Pick<CrmProfile, "createdAt" | "updatedAt">,
  start: Date,
  end: Date,
): number {
  const createdAt = parseIsoDate(profile.createdAt)
  const updatedAt = parseIsoDate(profile.updatedAt)
  let signal = 0

  if (createdAt && createdAt.getTime() >= start.getTime() && createdAt.getTime() < end.getTime()) {
    signal += 2
  }
  if (
    updatedAt &&
    updatedAt.getTime() >= start.getTime() &&
    updatedAt.getTime() < end.getTime() &&
    (!createdAt || updatedAt.getTime() !== createdAt.getTime())
  ) {
    signal += 4
  }

  return signal
}

function countSharedSkills(a: CrmProfile, b: CrmProfile): number {
  const aSkills = new Set(a.skills.map((skill) => normalizeSkillKey(skill)))
  return b.skills.reduce((count, skill) => (aSkills.has(normalizeSkillKey(skill)) ? count + 1 : count), 0)
}

function inferAudienceTitleFromProfile(profile: CrmProfile): string {
  const haystack = `${profile.headline} ${profile.seniority}`.toLowerCase()
  if (haystack.includes("recruit") || haystack.includes("talent")) return "Recruiter"
  if (haystack.includes("hr") || haystack.includes("people")) return "People Ops"
  if (haystack.includes("product")) return "Product Manager"
  if (haystack.includes("design") || haystack.includes("ux") || haystack.includes("ui")) return "Designer"
  if (haystack.includes("data") || haystack.includes("analytics") || haystack.includes("ml") || haystack.includes("ai")) return "Data Leader"
  if (haystack.includes("vp") || haystack.includes("chief") || haystack.includes("director") || haystack.includes("head")) return "Executive"
  if (haystack.includes("engineer") || haystack.includes("developer") || haystack.includes("architect")) return "Engineer"
  return inferSeniorityBand(profile.seniority)
}

function selectAudienceProfiles(target: CrmProfile, workspaceProfiles: CrmProfile[]): CrmProfile[] {
  return workspaceProfiles
    .filter((profile) => profile.id !== target.id)
    .map((profile) => {
      const sharedSkills = countSharedSkills(target, profile)
      const score =
        (normalizeCompanyKey(profile.company) === normalizeCompanyKey(target.company) ? 3 : 0) +
        (profile.industry.trim().toLowerCase() === target.industry.trim().toLowerCase() ? 3 : 0) +
        (normalizeLocationKey(profile.location) === normalizeLocationKey(target.location) ? 2 : 0) +
        sharedSkills * 2 +
        (target.tribe && profile.tribe && target.tribe.trim().toLowerCase() === profile.tribe.trim().toLowerCase() ? 2 : 0)

      return { profile, score, sharedSkills }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.sharedSkills !== a.sharedSkills) return b.sharedSkills - a.sharedSkills
      if (b.profile.matchScore !== a.profile.matchScore) return b.profile.matchScore - a.profile.matchScore
      return b.profile.connections - a.profile.connections
    })
    .slice(0, 24)
    .map((entry) => entry.profile)
}

export function buildProfileViewAnalytics(
  targetProfile: CrmProfile,
  workspaceProfiles: CrmProfile[],
  options?: { now?: Date; timeRange?: LinkedinAnalyticsTimeRange },
): {
  totalViews: number
  viewerDemographics: {
    topTitles: string[]
    topCompanies: string[]
    topLocations: string[]
  }
  searchAppearances: number
  trendDirection: "up" | "down" | "flat"
  percentChange: string
} {
  const now = options?.now ?? new Date()
  const timeRange = options?.timeRange ?? "30d"
  const { days, currentWindowStart, previousWindowStart } = resolveLinkedinAnalyticsWindow(timeRange, now)
  const timeScale = timeRange === "7d" ? 0.38 : timeRange === "90d" ? 1.7 : 1
  const audienceProfiles = selectAudienceProfiles(targetProfile, workspaceProfiles)
  const demographicSource =
    audienceProfiles.length > 0
      ? audienceProfiles
      : workspaceProfiles.filter((profile) => profile.id !== targetProfile.id)

  const currentSignal =
    computeProfileActivitySignal(targetProfile, currentWindowStart, now) * 4 +
    audienceProfiles.reduce(
      (sum, profile) => sum + computeProfileActivitySignal(profile, currentWindowStart, now),
      0,
    )
  const previousSignal =
    computeProfileActivitySignal(targetProfile, previousWindowStart, currentWindowStart) * 4 +
    audienceProfiles.reduce(
      (sum, profile) => sum + computeProfileActivitySignal(profile, previousWindowStart, currentWindowStart),
      0,
    )

  const baseViews =
    targetProfile.matchScore * 1.1 +
    Math.min(targetProfile.connections / 9, 160) +
    targetProfile.skills.length * 5 +
    audienceProfiles.length * 4
  const totalViews = Math.max(
    10,
    Math.round((baseViews + currentSignal * 6 + Math.max(3, days / 10)) * timeScale),
  )
  const searchAppearances = Math.max(
    6,
    Math.round(totalViews * 0.32 + Math.min(targetProfile.skills.length * 2, 16)),
  )

  let percentDelta = 0
  if (previousSignal === 0) {
    percentDelta = currentSignal > 0 ? 100 : 0
  } else {
    percentDelta = Math.round(((currentSignal - previousSignal) / previousSignal) * 100)
  }
  percentDelta = Math.max(-95, Math.min(120, percentDelta))

  const trendDirection: "up" | "down" | "flat" =
    percentDelta > 8 ? "up" : percentDelta < -8 ? "down" : "flat"

  return {
    totalViews,
    viewerDemographics: {
      topTitles: buildCategoryBreakdown(demographicSource, inferAudienceTitleFromProfile, 4).map((item) => item.label),
      topCompanies: buildCategoryBreakdown(demographicSource, (profile) => profile.company, 4).map((item) => item.label),
      topLocations: buildCategoryBreakdown(demographicSource, (profile) => profile.location, 4).map((item) => item.label),
    },
    searchAppearances,
    trendDirection,
    percentChange: `${percentDelta >= 0 ? "+" : ""}${percentDelta}%`,
  }
}

function mapLinkedinShareAuditRow(row: DbRow): LinkedInShareAuditRecord {
  return {
    responseUgcPostId: asString(row.response_ugc_post_id ?? row.responseUgcPostId) || undefined,
    responseShareId: asString(row.response_share_id ?? row.responseShareId) || undefined,
    shareType: asString(row.share_type ?? row.shareType, "text") || undefined,
    visibility: asString(row.visibility, "connections") || undefined,
    requestText: asString(row.request_text ?? row.requestText) || undefined,
    requestMediaUrl: asString(row.request_media_url ?? row.requestMediaUrl) || undefined,
    requestMediaUrls: asStringArray(row.request_media_urls ?? row.requestMediaUrls),
    requestLinkUrl: asString(row.request_link_url ?? row.requestLinkUrl) || undefined,
    requestTitle: asString(row.request_title ?? row.requestTitle) || undefined,
    requestDescription: asString(row.request_description ?? row.requestDescription) || undefined,
    responseStatus: asNumber(row.response_status ?? row.responseStatus, 0),
    publishedAt: asString(row.published_at ?? row.publishedAt) || undefined,
    createdAt: asString(row.created_at ?? row.createdAt) || undefined,
  }
}

function inferPostAudience(text: string, shareType: string): string {
  const haystack = `${text} ${shareType}`.toLowerCase()
  if (haystack.includes("hiring") || haystack.includes("talent") || haystack.includes("recruit")) return "Recruiters"
  if (haystack.includes("product") || haystack.includes("roadmap")) return "Product leaders"
  if (haystack.includes("founder") || haystack.includes("startup") || haystack.includes("fund")) return "Founders"
  if (haystack.includes("data") || haystack.includes("ai") || haystack.includes("ml")) return "Data leaders"
  if (haystack.includes("engineer") || haystack.includes("platform") || haystack.includes("api")) return "Engineers"
  return "Professional network"
}

export function buildPostAnalyticsFromShareAudit(
  records: LinkedInShareAuditRecord[],
  options?: { now?: Date; timeRange?: LinkedinAnalyticsTimeRange; postId?: string | null },
): {
  posts: Array<{
    postId: string
    publishedAt: string
    impressions: number
    engagementRate: string
    reactions: number
    comments: number
    shares: number
    clicks: number
    topAudience: string
  }>
  totalImpressions: number
  avgEngagementRate: string
} {
  const now = options?.now ?? new Date()
  const timeRange = options?.timeRange ?? "30d"
  const { currentWindowStart } = resolveLinkedinAnalyticsWindow(timeRange, now)
  const requestedPostId = (options?.postId || "").trim()

  const successfulPosts = records
    .filter((record) => record.responseStatus >= 200 && record.responseStatus < 300)
    .filter((record) => {
      const publishedAt = parseIsoDate(record.publishedAt || record.createdAt)
      return publishedAt ? publishedAt.getTime() >= currentWindowStart.getTime() : false
    })
    .filter((record) => {
      if (!requestedPostId) return true
      return record.responseUgcPostId === requestedPostId || record.responseShareId === requestedPostId
    })

  const posts = successfulPosts.map((record) => {
    const publishedAt = record.publishedAt || record.createdAt || now.toISOString()
    const publishedDate = parseIsoDate(publishedAt) || now
    const ageDays = Math.max(1, Math.floor((now.getTime() - publishedDate.getTime()) / (24 * 60 * 60 * 1000)))
    const textLength = (record.requestText || "").trim().length
    const visibilityMultiplier =
      record.visibility === "public" ? 1.55 : record.visibility === "logged_in" ? 0.95 : 1.18
    const shareTypeMultiplier =
      record.shareType === "video"
        ? 1.35
        : record.shareType === "image"
          ? 1.22
          : record.shareType === "article" || record.shareType === "document"
            ? 1.12
            : record.shareType === "carousel"
              ? 1.28
              : 1
    const mediaBonus =
      record.requestMediaUrl || (record.requestMediaUrls && record.requestMediaUrls.length > 0) ? 1.12 : 1
    const linkBonus = record.requestLinkUrl ? 1.08 : 1
    const ageMultiplier = Math.min(1.9, 0.95 + ageDays / 18)
    const lengthFactor = textLength >= 80 && textLength <= 220 ? 1.12 : textLength > 0 ? 1 : 0.88

    const impressions = Math.max(
      120,
      Math.round((210 + Math.min(textLength, 280) * 1.35) * visibilityMultiplier * shareTypeMultiplier * mediaBonus * linkBonus * ageMultiplier * lengthFactor),
    )
    const engagementRateValue = Number(
      Math.max(
        2.1,
        Math.min(
          11.8,
          2.6 +
            (record.shareType === "video" ? 1.8 : record.shareType === "image" ? 1.2 : 0.6) +
            (record.requestLinkUrl ? -0.2 : 0.4) +
            (textLength >= 80 && textLength <= 220 ? 0.9 : 0.2) +
            (record.visibility === "public" ? 0.7 : 0.3),
        ),
      ).toFixed(1),
    )
    const reactions = Math.max(4, Math.round(impressions * (engagementRateValue / 100) * 0.58))
    const comments = Math.max(1, Math.round(impressions * (engagementRateValue / 100) * 0.14))
    const shares = Math.max(1, Math.round(impressions * (engagementRateValue / 100) * 0.08))
    const clicks = Math.max(
      1,
      Math.round(impressions * (engagementRateValue / 100) * (record.requestLinkUrl ? 0.32 : 0.12)),
    )

    return {
      postId: record.responseUgcPostId || record.responseShareId || buildStableSlug("post", publishedAt),
      publishedAt,
      impressions,
      engagementRate: `${engagementRateValue.toFixed(1)}%`,
      reactions,
      comments,
      shares,
      clicks,
      topAudience: inferPostAudience(record.requestText || "", record.shareType || "text"),
    }
  })

  const totalImpressions = posts.reduce((sum, post) => sum + post.impressions, 0)
  const avgEngagementRateValue =
    posts.length > 0
      ? posts.reduce((sum, post) => sum + Number(post.engagementRate.replace("%", "")), 0) / posts.length
      : 0

  return {
    posts,
    totalImpressions,
    avgEngagementRate: `${avgEngagementRateValue.toFixed(1)}%`,
  }
}

async function fetchLinkedinShareAudit(
  client: SupabaseClient,
  timeRange: LinkedinAnalyticsTimeRange,
): Promise<LinkedInShareAuditRecord[]> {
  const now = new Date()
  const { currentWindowStart } = resolveLinkedinAnalyticsWindow(timeRange, now)
  const { data, error } = await client
    .from(LINKEDIN_SHARE_AUDIT_TABLE)
    .select(
      "response_ugc_post_id,response_share_id,share_type,visibility,request_text,request_media_url,request_media_urls,request_link_url,request_title,request_description,response_status,published_at,created_at",
    )
    .gte("created_at", currentWindowStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(120)

  if (error || !data) {
    return []
  }

  return (data as DbRow[]).map(mapLinkedinShareAuditRow)
}

function getSeniorityRank(seniority: string): number {
  const band = inferSeniorityBand(seniority)
  if (band === "Junior") return 1
  if (band === "Mid") return 2
  if (band === "Senior") return 3
  if (band === "Lead/Staff") return 4
  if (band === "Executive") return 5
  return 2
}

type TribeFormationConstraintsInput = {
  mustIncludeSkills?: string[] | null
  minSeniorityLevel?: string | null
  maxOverlapPercent?: number | null
}

type NormalizedTribeFormationConstraints = {
  mustIncludeSkills: string[]
  minSeniorityLevel: string | null
  minSeniorityRank: number | null
  maxOverlapPercent: number | null
}

type TribeFormationPlanResult =
  | {
      ok: true
      groups: CrmProfile[][]
      warnings: string[]
      constraintSummary?: {
        mustIncludeSkills: string[]
        minSeniorityLevel: string | null
        maxOverlapPercent: number | null
        tribesCreated: number
        averageProfilesPerTribe: number
        observedMaxOverlapPercent: number
      }
    }
  | {
      ok: false
      error: string
      details?: string[]
      hint?: string
    }

function normalizeTribeFormationConstraints(
  input: TribeFormationConstraintsInput | null | undefined,
): NormalizedTribeFormationConstraints {
  const mustIncludeSkills = dedupeCaseInsensitive(input?.mustIncludeSkills || [])
  const minSeniorityLevel = input?.minSeniorityLevel?.trim() || null
  const maxOverlapPercent =
    typeof input?.maxOverlapPercent === "number" && Number.isFinite(input.maxOverlapPercent)
      ? clampNumber(input.maxOverlapPercent, 0, 100)
      : null

  return {
    mustIncludeSkills,
    minSeniorityLevel,
    minSeniorityRank: minSeniorityLevel ? getSeniorityRank(minSeniorityLevel) : null,
    maxOverlapPercent,
  }
}

function hasActiveTribeConstraints(constraints: NormalizedTribeFormationConstraints): boolean {
  return (
    constraints.mustIncludeSkills.length > 0 ||
    constraints.minSeniorityRank !== null ||
    constraints.maxOverlapPercent !== null
  )
}

function getNormalizedSkillSet(profile: CrmProfile): Set<string> {
  return new Set(profile.skills.map((skill) => normalizeSkillKey(skill)))
}

function profileHasSkill(profile: CrmProfile, skill: string): boolean {
  const target = normalizeSkillKey(skill)
  return profile.skills.some((profileSkill) => normalizeSkillKey(profileSkill) === target)
}

function calculatePairSkillOverlapPercent(left: CrmProfile, right: CrmProfile): number {
  const leftSkills = getNormalizedSkillSet(left)
  const rightSkills = getNormalizedSkillSet(right)
  if (leftSkills.size === 0 || rightSkills.size === 0) {
    return 0
  }

  let shared = 0
  for (const skill of leftSkills) {
    if (rightSkills.has(skill)) {
      shared += 1
    }
  }

  return Number(((shared / Math.max(1, Math.min(leftSkills.size, rightSkills.size))) * 100).toFixed(1))
}

function calculateAverageSkillOverlapPercent(group: CrmProfile[]): number {
  if (group.length < 2) {
    return 0
  }

  let total = 0
  let pairs = 0
  for (let left = 0; left < group.length; left += 1) {
    for (let right = left + 1; right < group.length; right += 1) {
      total += calculatePairSkillOverlapPercent(group[left], group[right])
      pairs += 1
    }
  }

  return Number((total / Math.max(1, pairs)).toFixed(1))
}

function getMissingRequiredSkills(group: CrmProfile[], constraints: NormalizedTribeFormationConstraints): string[] {
  if (constraints.mustIncludeSkills.length === 0) {
    return []
  }

  const groupSkills = new Set(
    group.flatMap((member) => member.skills.map((skill) => normalizeSkillKey(skill))),
  )

  return constraints.mustIncludeSkills.filter((skill) => !groupSkills.has(normalizeSkillKey(skill)))
}

function groupMeetsMinSeniority(group: CrmProfile[], constraints: NormalizedTribeFormationConstraints): boolean {
  if (constraints.minSeniorityRank === null) {
    return true
  }

  return group.some((member) => getSeniorityRank(member.seniority) >= constraints.minSeniorityRank!)
}

function scoreProfileForTribeGroup(
  profile: CrmProfile,
  group: CrmProfile[],
  options: {
    optimizeFor?: string | null
    constraints: NormalizedTribeFormationConstraints
    softTargetSize: number
  },
): number {
  const optimizeFor = (options.optimizeFor || "balanced").trim().toLowerCase()
  const missingSkills = getMissingRequiredSkills(group, options.constraints)
  const coveredMissingSkills = missingSkills.filter((skill) => profileHasSkill(profile, skill)).length
  const projectedGroup = [...group, profile]
  const projectedOverlap = calculateAverageSkillOverlapPercent(projectedGroup)
  const sharedSkills = group.reduce((sum, member) => sum + countSharedSkills(profile, member), 0)
  const uniqueSkillContribution = profile.skills.filter(
    (skill) => !group.some((member) => profileHasSkill(member, skill)),
  ).length
  const uniqueCompany = group.every((member) => normalizeCompanyKey(member.company) !== normalizeCompanyKey(profile.company))
  const uniqueIndustry = group.every((member) => member.industry.trim().toLowerCase() !== profile.industry.trim().toLowerCase())
  const uniqueLocation = group.every((member) => normalizeLocationKey(member.location) !== normalizeLocationKey(profile.location))
  const uniqueSeniorityBand = group.every(
    (member) => inferSeniorityBand(member.seniority) !== inferSeniorityBand(profile.seniority),
  )
  const leaderCoverageBonus =
    options.constraints.minSeniorityRank !== null &&
    !groupMeetsMinSeniority(group, options.constraints) &&
    getSeniorityRank(profile.seniority) >= options.constraints.minSeniorityRank
      ? 28
      : 0

  let score =
    profile.matchScore * 0.35 +
    Math.min(profile.connections, 1800) * 0.012 +
    coveredMissingSkills * 24 +
    uniqueSkillContribution * 5 +
    leaderCoverageBonus

  if (optimizeFor === "skills") {
    score += sharedSkills * 7 + uniqueSkillContribution * 6
  } else if (optimizeFor === "diversity") {
    score += (uniqueCompany ? 16 : 0) + (uniqueIndustry ? 14 : 0) + (uniqueLocation ? 8 : 0) + (uniqueSeniorityBand ? 10 : 0)
    score -= sharedSkills * 1.5
  } else if (optimizeFor === "seniority" || optimizeFor === "leadership") {
    score += getSeniorityRank(profile.seniority) * 8 + (uniqueSeniorityBand ? 8 : 0)
  } else if (optimizeFor === "speed") {
    score += sharedSkills * 8 + estimateExperienceYearsFromSeniority(profile.seniority) * 1.8
  } else {
    score += sharedSkills * 5 + (uniqueCompany ? 6 : 0) + (uniqueIndustry ? 5 : 0) + (uniqueSeniorityBand ? 6 : 0)
  }

  const sizePenalty =
    group.length >= options.softTargetSize ? (group.length - options.softTargetSize + 1) * 8 : group.length * 1.5
  score -= sizePenalty
  score -= projectedOverlap * 0.18

  return Number(score.toFixed(3))
}

function validateTribeFormationGroups(
  groups: CrmProfile[][],
  constraints: NormalizedTribeFormationConstraints,
): string[] {
  const issues: string[] = []

  groups.forEach((group, index) => {
    const label = `Tribe ${index + 1}`
    const missingSkills = getMissingRequiredSkills(group, constraints)
    if (missingSkills.length > 0) {
      issues.push(`${label} is missing required skills: ${missingSkills.join(", ")}`)
    }
    if (!groupMeetsMinSeniority(group, constraints) && constraints.minSeniorityLevel) {
      issues.push(`${label} does not include a member at or above ${constraints.minSeniorityLevel}.`)
    }
    if (constraints.maxOverlapPercent !== null) {
      const overlapPercent = calculateAverageSkillOverlapPercent(group)
      if (overlapPercent > constraints.maxOverlapPercent + 0.1) {
        issues.push(
          `${label} exceeds maxOverlapPercent with average skill overlap ${overlapPercent.toFixed(1)}%.`,
        )
      }
    }
  })

  return issues
}

export function planTribeFormationGroups(
  profiles: CrmProfile[],
  options: {
    tribeSize?: number | null
    optimizeFor?: string | null
    constraints?: TribeFormationConstraintsInput | null
  },
): TribeFormationPlanResult {
  if (profiles.length === 0) {
    return {
      ok: false,
      error: "No profiles were provided for tribe formation.",
    }
  }

  const targetSize = Math.max(2, Math.min(options.tribeSize || 6, 20))
  const constraints = normalizeTribeFormationConstraints(options.constraints)
  if (!hasActiveTribeConstraints(constraints)) {
    const groups: CrmProfile[][] = []
    for (let index = 0; index < profiles.length; index += targetSize) {
      groups.push(profiles.slice(index, index + targetSize))
    }
    return {
      ok: true,
      groups,
      warnings: [],
    }
  }

  const warnings: string[] = []
  let groupCount = Math.max(1, Math.ceil(profiles.length / targetSize))

  if (constraints.minSeniorityRank !== null) {
    const eligibleLeads = profiles.filter((profile) => getSeniorityRank(profile.seniority) >= constraints.minSeniorityRank!)
    if (eligibleLeads.length === 0) {
      return {
        ok: false,
        error: `No selected profiles meet the minimum seniority requirement of ${constraints.minSeniorityLevel}.`,
        hint: "Broaden the profile set or lower minSeniorityLevel.",
      }
    }
    if (eligibleLeads.length < groupCount) {
      warnings.push(
        `Reduced tribe count from ${groupCount} to ${eligibleLeads.length} so each tribe can include ${constraints.minSeniorityLevel}+ coverage.`,
      )
      groupCount = eligibleLeads.length
    }
  }

  if (constraints.mustIncludeSkills.length > 0) {
    const missingWorkspaceSkills = constraints.mustIncludeSkills.filter(
      (skill) => !profiles.some((profile) => profileHasSkill(profile, skill)),
    )
    if (missingWorkspaceSkills.length > 0) {
      return {
        ok: false,
        error: `Selected profiles do not cover required skills: ${missingWorkspaceSkills.join(", ")}.`,
        hint: "Expand the profile set or remove unsupported mustIncludeSkills constraints.",
      }
    }

    const perSkillCapacity = Math.min(
      ...constraints.mustIncludeSkills.map(
        (skill) => profiles.filter((profile) => profileHasSkill(profile, skill)).length,
      ),
    )
    if (perSkillCapacity < groupCount) {
      warnings.push(
        `Reduced tribe count from ${groupCount} to ${perSkillCapacity} so every tribe can cover required skills.`,
      )
      groupCount = Math.max(1, perSkillCapacity)
    }
  }

  groupCount = Math.max(1, Math.min(groupCount, profiles.length))
  const softTargetSize = Math.max(targetSize, Math.ceil(profiles.length / groupCount))
  if (softTargetSize > 20) {
    return {
      ok: false,
      error: "Constraints require tribes larger than the supported maximum size of 20.",
      hint: "Lower tribeSize expectations, relax constraints, or provide fewer profiles per formation call.",
    }
  }

  const groups = Array.from({ length: groupCount }, () => [] as CrmProfile[])
  const remaining = new Map(profiles.map((profile) => [profile.id, profile]))

  if (constraints.minSeniorityRank !== null) {
    const seededLeads = profiles
      .filter((profile) => getSeniorityRank(profile.seniority) >= constraints.minSeniorityRank!)
      .sort((left, right) => {
        const rankDelta = getSeniorityRank(right.seniority) - getSeniorityRank(left.seniority)
        if (rankDelta !== 0) return rankDelta
        if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore
        return right.connections - left.connections
      })
      .slice(0, groupCount)

    seededLeads.forEach((profile, index) => {
      groups[index].push(profile)
      remaining.delete(profile.id)
    })
  }

  let madeCoverageProgress = true
  while (constraints.mustIncludeSkills.length > 0 && madeCoverageProgress) {
    madeCoverageProgress = false
    const groupOrder = groups
      .map((group, index) => ({
        index,
        missingSkills: getMissingRequiredSkills(group, constraints),
      }))
      .filter((entry) => entry.missingSkills.length > 0)
      .sort((left, right) => {
        if (right.missingSkills.length !== left.missingSkills.length) {
          return right.missingSkills.length - left.missingSkills.length
        }
        return groups[left.index].length - groups[right.index].length
      })

    for (const entry of groupOrder) {
      const candidates = Array.from(remaining.values())
        .filter((profile) => entry.missingSkills.some((skill) => profileHasSkill(profile, skill)))
        .map((profile) => ({
          profile,
          coverage: entry.missingSkills.filter((skill) => profileHasSkill(profile, skill)).length,
          projectedOverlap: calculateAverageSkillOverlapPercent([...groups[entry.index], profile]),
          placementScore: scoreProfileForTribeGroup(profile, groups[entry.index], {
            optimizeFor: options.optimizeFor,
            constraints,
            softTargetSize,
          }),
        }))
        .filter((candidate) =>
          constraints.maxOverlapPercent === null || candidate.projectedOverlap <= constraints.maxOverlapPercent + 0.1,
        )
        .sort((left, right) => {
          if (right.coverage !== left.coverage) return right.coverage - left.coverage
          if (right.placementScore !== left.placementScore) return right.placementScore - left.placementScore
          return right.profile.matchScore - left.profile.matchScore
        })

      const selected = candidates[0]
      if (selected) {
        groups[entry.index].push(selected.profile)
        remaining.delete(selected.profile.id)
        madeCoverageProgress = true
      }
    }
  }

  const remainingProfiles = Array.from(remaining.values()).sort((left, right) => {
    const rankDelta = getSeniorityRank(right.seniority) - getSeniorityRank(left.seniority)
    if (rankDelta !== 0) return rankDelta
    if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore
    return right.connections - left.connections
  })

  for (const profile of remainingProfiles) {
    const rankedGroups = groups
      .map((group, index) => ({
        index,
        score: scoreProfileForTribeGroup(profile, group, {
          optimizeFor: options.optimizeFor,
          constraints,
          softTargetSize,
        }),
        projectedOverlap: calculateAverageSkillOverlapPercent([...group, profile]),
      }))
      .filter((candidate) =>
        constraints.maxOverlapPercent === null || candidate.projectedOverlap <= constraints.maxOverlapPercent + 0.1,
      )
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        return groups[left.index].length - groups[right.index].length
      })

    const bestGroup = rankedGroups[0]
    if (!bestGroup) {
      return {
        ok: false,
        error: "The requested maxOverlapPercent is too strict for the selected profiles.",
        hint: "Raise maxOverlapPercent or expand the profile set with more complementary skills.",
      }
    }
    groups[bestGroup.index].push(profile)
  }

  const validationIssues = validateTribeFormationGroups(groups, constraints)
  if (validationIssues.length > 0) {
    return {
      ok: false,
      error: "Unable to satisfy one or more tribe-formation constraints.",
      details: validationIssues,
      hint: "Adjust tribeSize or relax the requested constraints.",
    }
  }

  return {
    ok: true,
    groups,
    warnings,
    constraintSummary: {
      mustIncludeSkills: constraints.mustIncludeSkills,
      minSeniorityLevel: constraints.minSeniorityLevel,
      maxOverlapPercent: constraints.maxOverlapPercent,
      tribesCreated: groups.length,
      averageProfilesPerTribe: Number((profiles.length / groups.length).toFixed(1)),
      observedMaxOverlapPercent: groups.reduce(
        (max, group) => Math.max(max, calculateAverageSkillOverlapPercent(group)),
        0,
      ),
    },
  }
}

function formatRecommendationDate(value: string | undefined, fallback = "2026-01"): string {
  const parsed = parseIsoDate(value)
  if (!parsed) {
    return fallback
  }
  const month = `${parsed.getUTCMonth() + 1}`.padStart(2, "0")
  return `${parsed.getUTCFullYear()}-${month}`
}

function inferProfileRelationship(center: CrmProfile, candidate: CrmProfile): string {
  const centerRank = getSeniorityRank(center.seniority)
  const candidateRank = getSeniorityRank(candidate.seniority)
  if (
    center.company.trim().toLowerCase() === candidate.company.trim().toLowerCase() &&
    candidateRank > centerRank
  ) {
    return "Manager"
  }
  if (
    center.company.trim().toLowerCase() === candidate.company.trim().toLowerCase() &&
    centerRank > candidateRank
  ) {
    return "Direct Report"
  }
  if (center.tribe && candidate.tribe && center.tribe.trim().toLowerCase() === candidate.tribe.trim().toLowerCase()) {
    return "Teammate"
  }
  if (center.company.trim().toLowerCase() === candidate.company.trim().toLowerCase()) {
    return "Colleague"
  }
  if (center.industry.trim().toLowerCase() === candidate.industry.trim().toLowerCase()) {
    return "Peer"
  }
  return "Connection"
}

function buildRecommendationNarrative(subject: CrmProfile): string {
  const primarySkill = subject.skills[0] || subject.industry || "delivery"
  const secondarySkill = subject.skills[1] || subject.seniority || "execution"
  return `${subject.firstName || subject.fullName.split(" ")[0]} brings strong ${primarySkill} leadership and dependable ${secondarySkill} execution.`
}

type NetworkCandidate = {
  profile: CrmProfile
  affinityScore: number
  sharedSkills: string[]
}

function scoreNetworkCandidate(center: CrmProfile, candidate: CrmProfile): NetworkCandidate {
  const sharedSkills = dedupeCaseInsensitive(
    center.skills.filter((skill) =>
      candidate.skills.some((candidateSkill) => normalizeSkillKey(candidateSkill) === normalizeSkillKey(skill)),
    ),
  )
  let affinityScore = sharedSkills.length * 14
  if (center.company.trim().toLowerCase() === candidate.company.trim().toLowerCase()) affinityScore += 24
  if (center.industry.trim().toLowerCase() === candidate.industry.trim().toLowerCase()) affinityScore += 18
  if (center.location.trim().toLowerCase() === candidate.location.trim().toLowerCase()) affinityScore += 10
  if (center.tribe && candidate.tribe && center.tribe.trim().toLowerCase() === candidate.tribe.trim().toLowerCase()) affinityScore += 20
  affinityScore += Math.round(candidate.matchScore * 0.25)
  affinityScore += Math.min(10, Math.round(candidate.connections / 220))

  return {
    profile: candidate,
    affinityScore,
    sharedSkills,
  }
}

function filterNetworkCandidates(
  center: CrmProfile,
  profiles: CrmProfile[],
  input: {
    industry?: string | null
    minConnections?: number | null
    location?: string | null
  } | null | undefined,
): NetworkCandidate[] {
  const industryKey = (input?.industry || "").trim().toLowerCase()
  const locationKey = (input?.location || "").trim().toLowerCase()
  const minConnections = Math.max(0, input?.minConnections || 0)

  return profiles
    .filter((profile) => profile.id !== center.id)
    .filter((profile) => {
      if (industryKey && !profile.industry.toLowerCase().includes(industryKey)) return false
      if (locationKey && !profile.location.toLowerCase().includes(locationKey)) return false
      if (profile.connections < minConnections) return false
      return true
    })
    .map((profile) => scoreNetworkCandidate(center, profile))
    .filter((entry) => entry.affinityScore > 0)
    .sort((a, b) => {
      if (b.affinityScore !== a.affinityScore) return b.affinityScore - a.affinityScore
      if (b.sharedSkills.length !== a.sharedSkills.length) return b.sharedSkills.length - a.sharedSkills.length
      return b.profile.connections - a.profile.connections
    })
}

export function buildNetworkAnalysisFromWorkspace(
  center: CrmProfile,
  profiles: CrmProfile[],
  input: {
    depth?: number | null
    filters?: {
      industry?: string | null
      minConnections?: number | null
      location?: string | null
    } | null
  },
): {
  networkSize: number
  clusters: Array<{
    name: string
    size: number
    density: number
    keyMembers: string[]
  }>
  influenceScore: string
  networkHealth: "Strong" | "Balanced" | "Narrow"
  recommendations: string[]
} {
  const depth = Math.max(1, Math.min(input.depth || 1, 3))
  const candidateLimit = depth === 1 ? 24 : depth === 2 ? 48 : 72
  const candidates = filterNetworkCandidates(center, profiles, input.filters).slice(0, candidateLimit)

  const clusterEntries: Array<{
    name: string
    members: NetworkCandidate[]
    densityBase: number
  }> = []

  const sameCompany = candidates.filter((entry) => entry.profile.company.trim().toLowerCase() === center.company.trim().toLowerCase())
  if (sameCompany.length >= 2 && center.company.trim()) {
    clusterEntries.push({
      name: `${center.company} network`,
      members: sameCompany,
      densityBase: 0.74,
    })
  }

  const sameTribe = candidates.filter((entry) => center.tribe && entry.profile.tribe && entry.profile.tribe.trim().toLowerCase() === center.tribe.trim().toLowerCase())
  if (sameTribe.length >= 2 && center.tribe?.trim()) {
    clusterEntries.push({
      name: `${center.tribe} tribe`,
      members: sameTribe,
      densityBase: 0.82,
    })
  }

  const sameIndustry = candidates.filter((entry) => entry.profile.industry.trim().toLowerCase() === center.industry.trim().toLowerCase())
  if (sameIndustry.length >= 2 && center.industry.trim()) {
    clusterEntries.push({
      name: `${center.industry} circle`,
      members: sameIndustry,
      densityBase: 0.68,
    })
  }

  const sameLocation = candidates.filter((entry) => entry.profile.location.trim().toLowerCase() === center.location.trim().toLowerCase())
  if (sameLocation.length >= 2 && center.location.trim()) {
    clusterEntries.push({
      name: `${center.location} peers`,
      members: sameLocation,
      densityBase: 0.61,
    })
  }

  const skillCounts = new Map<string, NetworkCandidate[]>()
  for (const entry of candidates) {
    for (const skill of entry.sharedSkills.slice(0, 2)) {
      const key = skill.trim()
      if (!key) continue
      const existing = skillCounts.get(key) || []
      existing.push(entry)
      skillCounts.set(key, existing)
    }
  }
  for (const [skill, members] of skillCounts.entries()) {
    if (members.length < 2) continue
    clusterEntries.push({
      name: `${skill} community`,
      members,
      densityBase: 0.7,
    })
  }

  const uniqueClusters = clusterEntries
    .map((cluster) => {
      const avgAffinity = averageNumber(cluster.members.map((entry) => entry.affinityScore))
      return {
        name: cluster.name,
        size: cluster.members.length,
        density: Number(Math.max(0.35, Math.min(0.95, cluster.densityBase + avgAffinity / 300)).toFixed(2)),
        keyMembers: cluster.members
          .slice()
          .sort((a, b) => {
            if (b.affinityScore !== a.affinityScore) return b.affinityScore - a.affinityScore
            return b.profile.connections - a.profile.connections
          })
          .slice(0, 2)
          .map((entry) => `${entry.profile.fullName} | ${entry.profile.headline}`),
      }
    })
    .filter((cluster, index, all) => all.findIndex((item) => item.name === cluster.name) === index)
    .sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size
      return b.density - a.density
    })
    .slice(0, 4)

  const sameCompanyCount = sameCompany.length
  const uniqueIndustries = new Set(candidates.map((entry) => entry.profile.industry.trim().toLowerCase()).filter(Boolean)).size
  const recommendations: string[] = []
  if (candidates.length === 0) {
    recommendations.push("Very little related CRM network data is available for this profile; broaden filters or sync more profiles.")
  } else {
    if (sameCompanyCount > 0 && sameCompanyCount >= Math.ceil(candidates.length * 0.45)) {
      recommendations.push(`Network is concentrated around ${center.company}; widen to adjacent companies or tribes for more diverse warm paths.`)
    }
    if (uniqueIndustries <= 2) {
      recommendations.push("Industry diversity is narrow; add connectors from adjacent functions to reduce echo-chamber risk.")
    }
    const skillCluster = uniqueClusters.find((cluster) => cluster.name.endsWith(" community"))
    if (skillCluster) {
      recommendations.push(`Use the ${skillCluster.name.replace(" community", "")} cluster as the base for a focused tribe or intro campaign.`)
    }
    if (recommendations.length === 0) {
      recommendations.push("Network is balanced for this profile; prioritize the densest cluster for warm introductions.")
    }
  }

  const influenceScore = Number(
    Math.max(
      4.2,
      Math.min(
        9.9,
        center.matchScore / 12 +
          Math.min(center.connections, 1800) / 260 +
          uniqueClusters.length * 0.35,
      ),
    ).toFixed(1),
  ).toFixed(1)

  const networkHealth: "Strong" | "Balanced" | "Narrow" =
    candidates.length >= 8 && uniqueClusters.length >= 3
      ? "Strong"
      : candidates.length >= 4
        ? "Balanced"
        : "Narrow"

  return {
    networkSize: candidates.length,
    clusters: uniqueClusters,
    influenceScore,
    networkHealth,
    recommendations,
  }
}

export function buildProfileRecommendationsFromWorkspace(
  center: CrmProfile,
  profiles: CrmProfile[],
): {
  received: Array<{ from: string; text: string; relationship: string; date: string }>
  given: Array<{ to: string; text: string; relationship: string; date: string }>
  totalReceived: number
  totalGiven: number
} {
  const candidates = filterNetworkCandidates(center, profiles, null)
  const receivedCandidates = candidates
    .filter((entry) => getSeniorityRank(entry.profile.seniority) >= getSeniorityRank(center.seniority))
    .slice(0, 3)
  const givenCandidates = candidates
    .filter((entry) => getSeniorityRank(entry.profile.seniority) <= getSeniorityRank(center.seniority))
    .slice(0, 2)

  const received = receivedCandidates.map((entry) => ({
    from: `${entry.profile.fullName}, ${entry.profile.headline}`,
    text: buildRecommendationNarrative(center),
    relationship: inferProfileRelationship(center, entry.profile),
    date: formatRecommendationDate(entry.profile.updatedAt || entry.profile.createdAt),
  }))

  const given = givenCandidates.map((entry) => ({
    to: `${entry.profile.fullName}, ${entry.profile.headline}`,
    text: buildRecommendationNarrative(entry.profile),
    relationship: inferProfileRelationship(center, entry.profile),
    date: formatRecommendationDate(center.updatedAt || center.createdAt),
  }))

  return {
    received,
    given,
    totalReceived: received.length,
    totalGiven: given.length,
  }
}

function inferWorkspaceGroupCategory(row: DbRow): string {
  const haystack = [
    asString(row.name),
    asString(row.description),
    asString(row.industry_focus ?? row.industryFocus),
    ...asStringArray(row.common_skills ?? row.commonSkills),
  ]
    .join(" ")
    .toLowerCase()

  if (haystack.includes("leader") || haystack.includes("executive") || haystack.includes("founder") || haystack.includes("venture")) return "leadership"
  if (haystack.includes("design") || haystack.includes("creative")) return "creative"
  if (haystack.includes("product") || haystack.includes("finance") || haystack.includes("healthcare") || haystack.includes("industry")) return "industry"
  return "community"
}

function buildDerivedGroupsFromProfiles(profiles: CrmProfile[]): Array<{
  id: string
  name: string
  members: number
  postsPerWeek: number
  description: string
  category: string
}> {
  const skillGroups = buildCategoryBreakdown(
    profiles.flatMap((profile) => dedupeCaseInsensitive(profile.skills).slice(0, 2)),
    (skill) => skill,
    5,
  ).filter((entry) => entry.count >= 2)

  return skillGroups.map((entry) => ({
    id: buildStableSlug("group", entry.label),
    name: `${entry.label} community`,
    members: entry.count,
    postsPerWeek: Math.max(3, Math.round(entry.count * 2.5)),
    description: `A derived group for CRM profiles with strong ${entry.label} overlap.`,
    category: "community",
  }))
}

export function buildWorkspaceGroupSearchResults(
  tribeRows: DbRow[],
  profiles: CrmProfile[],
  input: {
    keywords: string
    category?: string | null
  },
  options?: { now?: Date; limit?: number },
): Array<{
  id: string
  name: string
  members: number
  postsPerWeek: number
  description: string
}> {
  const now = options?.now ?? new Date()
  const limit = Math.max(1, Math.min(options?.limit ?? 12, 25))
  const keywordTokens = normalizeWords(input.keywords || "")
  const categoryKey = (input.category || "").trim().toLowerCase()

  const tribeGroups = tribeRows.map((row) => {
    const members = resolveTribeMembers(row, profiles)
    const fallbackMemberCount = getTribeMemberIds(row).length
    const memberCount = members.length > 0 ? members.length : fallbackMemberCount
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const tribeUpdatedAt = parseIsoDate(asString(row.updated_at || row.updatedAt))
    const activitySignals =
      members.reduce((sum, profile) => sum + computeProfileActivitySignal(profile, weekStart, now), 0) +
      (tribeUpdatedAt && tribeUpdatedAt.getTime() >= weekStart.getTime() ? 3 : 0)
    const description =
      asString(row.description).trim() ||
      `Community for ${(asString(row.industry_focus || row.industryFocus) || asStringArray(row.common_skills ?? row.commonSkills)[0] || "cross-functional")} operators.`
    return {
      id: asString(row.id) || buildStableSlug("group", asString(row.name)),
      name: asString(row.name, "Group"),
      members: memberCount,
      postsPerWeek: Math.max(2, Math.round(activitySignals * 1.5 + memberCount * 0.4)),
      description,
      category: inferWorkspaceGroupCategory(row),
      keywords: [
        asString(row.name),
        asString(row.description),
        asString(row.industry_focus || row.industryFocus),
        ...asStringArray(row.common_skills ?? row.commonSkills),
      ]
        .join(" ")
        .toLowerCase(),
    }
  })

  const sourceGroups = tribeGroups.length > 0 ? tribeGroups : buildDerivedGroupsFromProfiles(profiles).map((group) => ({
    ...group,
    keywords: `${group.name} ${group.description}`.toLowerCase(),
  }))

  return sourceGroups
    .filter((group) => {
      if (categoryKey && !group.category.includes(categoryKey)) {
        return false
      }
      if (keywordTokens.length > 0 && !keywordTokens.every((token) => group.keywords.includes(token))) {
        return false
      }
      return true
    })
    .sort((a, b) => {
      if (b.members !== a.members) return b.members - a.members
      return b.postsPerWeek - a.postsPerWeek
    })
    .slice(0, limit)
    .map(({ category: _category, keywords: _keywords, ...group }) => group)
}

function buildCategoryBreakdown<T>(
  items: T[],
  getLabel: (item: T) => string,
  limit = 8,
): BreakdownItem[] {
  if (items.length === 0) {
    return []
  }

  const counts = new Map<string, number>()
  for (const item of items) {
    const label = getLabel(item).trim() || "Unknown"
    counts.set(label, (counts.get(label) || 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: Number(((count / items.length) * 100).toFixed(1)),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label)
    })
    .slice(0, Math.max(1, Math.min(limit, 40)))
}

function buildSkillCoverage(profiles: CrmProfile[], requiredSkills: string[]): {
  coverage: SkillCoverageItem[]
  missingSkills: string[]
} {
  const normalized = dedupeCaseInsensitive(requiredSkills)
  if (normalized.length === 0 || profiles.length === 0) {
    return {
      coverage: normalized.map((skill) => ({
        skill,
        matchedProfiles: 0,
        coveragePercent: 0,
      })),
      missingSkills: normalized,
    }
  }

  const profileSkillSets = profiles.map((profile) =>
    new Set(profile.skills.map((skill) => normalizeSkillKey(skill))),
  )

  const coverage = normalized.map((skill) => {
    const skillKey = normalizeSkillKey(skill)
    const matchedProfiles = profileSkillSets.filter((skillSet) => skillSet.has(skillKey)).length
    return {
      skill,
      matchedProfiles,
      coveragePercent: Number(((matchedProfiles / profiles.length) * 100).toFixed(1)),
    }
  })

  const missingSkills = coverage
    .filter((item) => item.matchedProfiles === 0)
    .map((item) => item.skill)

  return { coverage, missingSkills }
}

function getTribeMemberIds(row: DbRow): string[] {
  const members = parseJsonArray(row.members)
  return dedupeCaseInsensitive(
    members
      .map((member) => asString(member.personId || member.person_id || member.id))
      .filter(Boolean),
  )
}

function resolveTribeMembers(row: DbRow, profiles: CrmProfile[]): CrmProfile[] {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]))
  const memberIds = getTribeMemberIds(row)
  if (memberIds.length > 0) {
    return memberIds
      .map((memberId) => byId.get(memberId))
      .filter((profile): profile is CrmProfile => Boolean(profile))
  }

  const tribeName = asString(row.name).trim().toLowerCase()
  if (!tribeName) {
    return []
  }

  return profiles.filter((profile) => profile.tribe?.trim().toLowerCase() === tribeName)
}

function buildKeywordScore(profile: CrmProfile, tokens: string[]): number {
  if (tokens.length === 0) {
    return 0
  }

  const headline = profile.headline.toLowerCase()
  const company = profile.company.toLowerCase()
  const industry = profile.industry.toLowerCase()
  const location = profile.location.toLowerCase()
  const skillSet = new Set(profile.skills.map((skill) => normalizeSkillKey(skill)))

  let score = 0
  for (const token of tokens) {
    const normalized = token.trim().toLowerCase()
    if (!normalized) continue
    if (headline.includes(normalized)) score += 12
    if (company.includes(normalized)) score += 8
    if (industry.includes(normalized)) score += 8
    if (location.includes(normalized)) score += 5
    if (skillSet.has(normalized)) score += 14
  }
  return score
}

export function createLinkedinTools(authContext: SupabaseAuthContext | null) {
  const adminClient = createSupabaseAdminClient()
  const createOrUpdateTribesFromProfiles = async (input: {
    profileIds: string[]
    tribePurpose: string
    tribeSize?: number | null
    optimizeFor?: string | null
    explicitName?: string | null
    constraints?: TribeFormationConstraintsInput | null
  }) => {
    const authScope = ensureAuthenticatedToolsContext(authContext)
    if (!authScope.ok) {
      return {
        ok: false as const,
        error: authScope.error,
      }
    }

    const requestedIds = input.profileIds.map((id) => id.trim()).filter(Boolean)
    if (requestedIds.length === 0) {
      return {
        ok: false as const,
        error: "At least one profileId is required to form a tribe.",
      }
    }

    const selectedProfiles = await fetchProfilesByIds(authScope.userClient, requestedIds)
    if (selectedProfiles.length === 0) {
      return {
        ok: false as const,
        error: "No CRM profiles were found for the provided profile IDs.",
      }
    }

    const writeClient = adminClient || authScope.userClient
    const formationPlan = planTribeFormationGroups(selectedProfiles, {
      tribeSize: input.tribeSize,
      optimizeFor: input.optimizeFor,
      constraints: input.constraints,
    })
    if (!formationPlan.ok) {
      return {
        ok: false as const,
        error: formationPlan.error,
        details: formationPlan.details || null,
        hint: formationPlan.hint || null,
      }
    }
    const chunks = formationPlan.groups

    const baseName = (input.explicitName || input.tribePurpose || "New Tribe").trim().slice(0, 80)
    const createdTribes: Array<Record<string, unknown>> = []

    for (let index = 0; index < chunks.length; index += 1) {
      const members = chunks[index]
      const tribeName = chunks.length === 1 ? baseName : `${baseName} ${index + 1}`
      const tribeId = createRandomId("tribe")
      const memberRows = buildTribeMembersFromProfiles(members)
      const avgExperience = estimateAverageExperience(members)
      const tribeInsights = buildTribeCreationInsights(members, {
        optimizeFor: input.optimizeFor,
      })
      const nowIso = new Date().toISOString()

      const insertPayload: Record<string, unknown> = {
        id: tribeId,
        owner_user_id: authContext?.userId || null,
        name: tribeName,
        description: `${input.tribePurpose}`.trim().slice(0, 1200),
        status: "active",
        cohesion: tribeInsights.cohesion,
        complementarity: tribeInsights.complementarity,
        avg_experience: avgExperience,
        industry_focus: tribeInsights.industryFocus,
        members: memberRows,
        common_skills: tribeInsights.commonSkills,
        strengths: tribeInsights.strengths,
        radar_data: tribeInsights.radarData,
        skill_dist: tribeInsights.skillDist,
        projects: [],
        updated_at: nowIso,
      }

      const { data: inserted, error: insertError } = await writeClient
        .from("tribes")
        .insert(insertPayload)
        .select("*")
        .single()

      if (insertError || !inserted) {
        return {
          ok: false as const,
          error: "Failed to persist tribe record.",
          details: insertError?.message || null,
          hint: adminClient
            ? "Verify Supabase tribes table schema and constraints."
            : "Set SUPABASE_SERVICE_ROLE_KEY or add authenticated write policies for public.tribes.",
        }
      }

      const memberIds = members.map((member) => member.id)
      if (memberIds.length > 0) {
        const { error: profileUpdateError } = await authScope.userClient
          .from("profiles")
          .update({
            tribe: tribeName,
            tribe_name: tribeName,
            updated_at: nowIso,
          })
          .in("id", memberIds)

        if (profileUpdateError) {
          return {
            ok: false as const,
            error: "Tribe was created, but member profile updates failed.",
            details: profileUpdateError.message,
          }
        }
      }

      createdTribes.push(inserted as Record<string, unknown>)
    }

    return {
      ok: true as const,
      createdTribes,
      requestedProfileCount: requestedIds.length,
      matchedProfileCount: selectedProfiles.length,
      skippedProfileIds: requestedIds.filter((id) => !selectedProfiles.some((profile) => profile.id === id)),
      formationWarnings: formationPlan.warnings,
      constraintSummary: formationPlan.constraintSummary,
    }
  }

  const createProjectRecord = async (input: {
    name: string
    description: string
    type: string
    targetDate?: string | null
    assignedTribeId?: string | null
    tags?: string[] | null
    successMetrics?: string[] | null
  }) => {
    const authScope = ensureAuthenticatedToolsContext(authContext)
    if (!authScope.ok) {
      return {
        ok: false as const,
        error: authScope.error,
      }
    }

    const nowIso = new Date().toISOString()
    const projectId = createRandomId("proj")
    const validTypes = new Set(["hiring", "team-building", "network-expansion", "aspiration", "tribe"])
    const type = validTypes.has(input.type) ? input.type : "team-building"
    const tags = Array.from(new Set((input.tags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 25)
    const successMetrics = (input.successMetrics || []).map((metric) => metric.trim()).filter(Boolean)

    let tribeName: string | null = null
    if (input.assignedTribeId?.trim()) {
      const { data: tribeRow } = await authScope.userClient
        .from("tribes")
        .select("id,name")
        .eq("id", input.assignedTribeId.trim())
        .maybeSingle()
      tribeName = asString((tribeRow as DbRow | null)?.name) || input.assignedTribeId.trim()
    }

    const targetDate = input.targetDate?.trim() || null
    const milestones = [
      {
        title: "Project kickoff",
        status: "pending",
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      },
      {
        title: "Initial review",
        status: "pending",
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      },
      {
        title: "Milestone checkpoint",
        status: "pending",
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      },
      {
        title: "Delivery",
        status: "pending",
        dueDate: (targetDate || new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)),
      },
    ]

    const insertPayload = {
      id: projectId,
      owner_user_id: authContext?.userId || null,
      name: input.name.trim().slice(0, 120),
      description: input.description.trim().slice(0, 5000),
      type,
      status: "planned",
      progress: 0,
      profiles: 0,
      target_date: targetDate,
      tribe: tribeName,
      tags,
      milestones,
      aspirations: successMetrics,
      blockers: [],
      next_action:
        successMetrics[0]
          ? `Track success metric: ${successMetrics[0]}`
          : "Define milestones and assign collaborators",
      created_at: nowIso,
      updated_at: nowIso,
    }

    const { data: inserted, error: insertError } = await authScope.userClient
      .from("projects")
      .insert(insertPayload)
      .select("*")
      .single()

    if (insertError || !inserted) {
      return {
        ok: false as const,
        error: "Failed to create project in CRM.",
        details: insertError?.message || null,
      }
    }

    return {
      ok: true as const,
      project: inserted as DbRow,
      successMetricCount: successMetrics.length,
    }
  }

  return {
  // === Profile Tools ===
  searchProfiles: tool({
    description:
      "Search CRM/LinkedIn profiles by keywords, location, industry, skills, title, or company. Returns matching profile summaries (id, name, title, company, location, seniority, matchScore, skills). Use for talent discovery, shortlisting, or before createTribe/getProfileDetails. Combine with getProjectCrmInsights when aligning candidates to a project.",
    inputSchema: z.object({
      keywords: z.string().describe("Search keywords (name, title, skill, or general theme)"),
      location: z.string().nullable().describe("Geographic filter (e.g. city, region, remote)"),
      industry: z.string().nullable().describe("Industry filter"),
      currentCompany: z.string().nullable().describe("Current company filter"),
      pastCompany: z.string().nullable().describe("Past company filter"),
      title: z.string().nullable().describe("Job title or headline filter"),
      skills: z.array(z.string()).nullable().describe("Required skills (all must match)"),
      experienceYears: z.number().nullable().describe("Minimum years of experience"),
      limit: z.number().nullable().describe("Max results (default 10, max 50)"),
    }),
    execute: async (input) => {
      const limit = Math.max(1, Math.min(input.limit || 10, 50))
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const workspaceProfiles = await fetchWorkspaceProfiles(authScope.userClient, 800)
        const filtered = filterProfiles(workspaceProfiles, input)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, limit)

        return {
          totalResults: filtered.length,
          profiles: filtered.map(describeProfile),
          source: "supabase",
          searchCriteria: input,
          suggestedNextTools:
            filtered.length > 0
              ? "getProfileDetails(profileId) for one person; createTribe(profileIds, tribePurpose) to group; getProjectCrmInsights(projectId) to match to a project; analyzeCSVProfiles if user has CSV data"
              : "Try broader keywords or fewer filters; or use analyzeCSVProfiles if user has uploaded CSV",
          apiEndpoint: "GET /v2/people-search",
        }
      }

      const results = generateMockProfiles(input.keywords, limit)
      return {
        totalResults: estimateMockTotalResults(input.keywords, results.length),
        profiles: results,
        source: "mock",
        authRequiredHint: authScope.error,
        suggestedNextTools: "Sign in with Supabase to search real CRM data; then getProfileDetails, createTribe, or getProjectCrmInsights",
        searchCriteria: input,
        apiEndpoint: "GET /v2/people-search",
      }
    },
  }),

  getProfileDetails: tool({
    description:
      "Get detailed profile for one person by ID: headline, company, location, skills, seniority, tribe, matchScore, endorsements. Use after searchProfiles when the user wants depth on a specific profile, or to prepare outreach/tribe placement.",
    inputSchema: z.object({
      profileId: z.string().describe("CRM profile ID (from searchProfiles or list)"),
      fields: z.array(z.string()).nullable().describe("Optional: specific fields to retrieve (omit for full profile)"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const profiles = await fetchProfilesByIds(authScope.userClient, [input.profileId])
        const profile = profiles[0]
        if (profile) {
          const derived = buildDerivedProfileDetails(profile)
          const selectedProfile = pickProfileDetailFields(
            {
              ...describeProfile(profile),
              firstName: profile.firstName,
              lastName: profile.lastName,
              summary: derived.summary,
              currentPosition: derived.currentPosition,
              positions: derived.positions,
              education: derived.education,
              endorsements: derived.endorsements,
              recommendations: derived.recommendations,
              profileViews: derived.profileViews,
              searchAppearances: derived.searchAppearances,
              createdAt: profile.createdAt || null,
              updatedAt: profile.updatedAt || null,
            },
            input.fields,
          )
          return {
            profile: selectedProfile.profile,
            source: "supabase",
            dataQuality: "derived",
            notes: derived.notes,
            ignoredFields: selectedProfile.ignoredFields.length > 0 ? selectedProfile.ignoredFields : undefined,
            suggestedNextTools:
              "addProfilesToTribe(tribeId, profileIds) to add to a tribe; createProject or addProjectPosition to align with a role; sendConnectionRequest or getProfileConnections for outreach",
            apiEndpoint: "GET /v2/people/{id}",
          }
        }
      }

      return {
        profile: generateDetailedProfile(input.profileId),
        source: "mock",
        suggestedNextTools: "Sign in for real CRM data; then addProfilesToTribe, createProject, or getProfileConnections",
        apiEndpoint: "GET /v2/people/{id}",
      }
    },
  }),

  getProfileConnections: tool({
    description:
      "Get a profile's connections and mutual-connection counts. Use for warm intros, network mapping, or before sendConnectionRequest. Pairs with analyzeNetwork for cluster view.",
    inputSchema: z.object({
      profileId: z.string().describe("Profile ID (from searchProfiles or getProfileDetails)"),
      degree: z.number().nullable().describe("Connection degree: 1st, 2nd, or 3rd (default 1)"),
      limit: z.number().nullable().describe("Max connections to return (default 10)"),
    }),
    execute: async (input) => {
      const limit = Math.min(input.limit || 10, 20)
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const [workspaceProfiles, contactStatesResult, outreachEventsResult] = await Promise.all([
          fetchWorkspaceProfiles(authScope.userClient, 2500),
          fetchLinkedoutContactStates(authScope.userClient, 600),
          fetchLinkedoutOutreachEvents(authScope.userClient, 1000),
        ])
        const center = workspaceProfiles.find((profile) => profile.id === input.profileId.trim()) || null

        if (!center) {
          return {
            ok: false,
            error: "Profile not found in workspace.",
            hint: "Run searchProfiles first and use a returned CRM profile ID.",
            apiEndpoint: "GET /v2/connections",
          }
        }

        const connections = buildWorkspaceProfileConnections(center, workspaceProfiles, {
          degree: input.degree,
          limit,
          contactStates: contactStatesResult.records,
          outreachEvents: outreachEventsResult.records,
        })
        const warnings: string[] = []
        if (contactStatesResult.missingTable || outreachEventsResult.missingTable) {
          warnings.push(
            "Apply the LinkedOut migrations to incorporate outreach queue and event signals into derived connection strength.",
          )
        }

        return {
          ...connections,
          profileId: center.id,
          profileName: center.fullName,
          source: "supabase",
          dataQuality: "derived",
          warnings,
          notes:
            "Derived from CRM similarity plus LinkedOut contact-state and outreach-event signals. Direct LinkedIn connection edges are not persisted in this workspace.",
          suggestedNextTools:
            connections.connections.length > 0
              ? "analyzeNetwork(centerProfileId) for clusters; sendConnectionRequest(profileId, note) for outreach; getProfileDetails(profileId) for personalization"
              : "Try degree 2 or 3, broaden the profile pool with searchProfiles, or add LinkedOut outreach activity to increase signal",
          apiEndpoint: "GET /v2/connections",
        }
      }

      const mockWorkspace = buildMockWorkspaceProfiles(input.profileId, Math.max(limit + 6, 12))
      const center = mockWorkspace[0]
      const connections = buildWorkspaceProfileConnections(center, mockWorkspace, {
        degree: input.degree,
        limit,
      })
      return {
        ...connections,
        profileId: center.id,
        profileName: center.fullName,
        source: "mock",
        dataQuality: "derived",
        notes:
          "Derived from deterministic mock CRM data because the user is not authenticated. Sign in with Supabase for real workspace relationships.",
        authRequiredHint: authScope.error,
        suggestedNextTools: "analyzeNetwork(centerProfileId) for clusters; searchProfiles to find similar; sendConnectionRequest(profileId, note) for outreach",
        apiEndpoint: "GET /v2/connections",
      }
    },
  }),

  // === Company Tools ===
  searchCompanies: tool({
    description:
      "Search companies by name, industry, size, or location. Returns company list with employee counts. Use for market mapping, competitor shortlists, or before getCompanyEmployees. Pairs with searchJobs(keywords, company) for roles at a company.",
    inputSchema: z.object({
      name: z.string().nullable().describe("Company name or partial name"),
      industry: z.string().nullable().describe("Industry filter"),
      size: z.string().nullable().describe("Company size (e.g. '51-200', '201-500', '5000+')"),
      location: z.string().nullable().describe("Headquarters location"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const workspaceProfiles = await fetchWorkspaceProfiles(authScope.userClient, 3000)
        const companies = buildWorkspaceCompanySearchResults(workspaceProfiles, input)

        return {
          companies,
          totalResults: companies.length,
          source: "supabase",
          suggestedNextTools:
            companies.length > 0
              ? "getCompanyEmployees(companyId) for talent at a company; searchJobs(keywords, company) for open roles; searchProfiles(currentCompany) to find CRM profiles at similar companies"
              : "Broaden the company, industry, size, or location filters; searchProfiles(currentCompany) can confirm how the company is stored in CRM",
          apiEndpoint: "GET /v2/companies-search",
        }
      }

      return {
        companies: Array.from({ length: 5 }, (_, i) => ({
          id: `company-${i}`,
          name: input.name ? `${input.name} ${["Corp", "Inc", "Ltd", "Group", "Labs"][i]}` : ["TechVentures", "DataFlow", "CloudScale", "InnovateCo", "DigitalPeak"][i],
          industry: input.industry || ["Technology", "Finance", "Healthcare", "SaaS", "AI/ML"][i],
          size: input.size || ["51-200", "201-500", "501-1000", "1001-5000", "5000+"][i],
          headquarters: input.location || ["San Francisco, CA", "New York, NY", "Austin, TX", "Seattle, WA", "Boston, MA"][i],
          employeeCount: [150, 350, 800, 2500, 8000][i],
          growthRate: `${[12, 25, 8, 15, 30][i]}%`,
          founded: [2015, 2018, 2010, 2012, 2020][i],
        })),
        totalResults: 5,
        source: "mock",
        authRequiredHint: authScope.error,
        suggestedNextTools: "getCompanyEmployees(companyId) for talent at a company; searchJobs(keywords, company) for open roles; searchProfiles(keywords, currentCompany) to find CRM profiles at similar companies",
        apiEndpoint: "GET /v2/companies-search",
      }
    },
  }),

  getCompanyEmployees: tool({
    description:
      "List employees at a company with titles, department, tenure. Use after searchCompanies for talent mapping or competitive intel. Pairs with searchProfiles to match CRM data.",
    inputSchema: z.object({
      companyId: z.string().describe("Company ID or name"),
      department: z.string().nullable().describe("Filter by department"),
      seniorityLevel: z.string().nullable().describe("Filter by seniority"),
      limit: z.number().nullable().describe("Max employees to return"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const workspaceProfiles = await fetchWorkspaceProfiles(authScope.userClient, 2000)
        const companyResult = buildWorkspaceCompanyEmployees(workspaceProfiles, input)

        return {
          company: companyResult.company,
          employees: companyResult.employees,
          totalEmployees: companyResult.totalEmployees,
          source: "supabase",
          suggestedNextTools:
            companyResult.totalEmployees > 0
              ? "searchProfiles(keywords, currentCompany) to filter further; createTribe(profileIds, tribePurpose) to form a team from these CRM profiles"
              : "Broaden the company name or remove department/seniority filters; searchProfiles(currentCompany) can help confirm the exact CRM company name",
          apiEndpoint: "GET /v2/companies/{id}/employees",
        }
      }

      return {
        company: input.companyId,
        employees: Array.from({ length: Math.min(input.limit || 10, 10) }, (_, i) => ({
          name: `Employee ${i + 1}`,
          title: ["Senior Engineer", "Staff Engineer", "Engineering Manager", "Product Lead", "VP Engineering", "Director of Data", "Lead Designer", "Principal Architect", "Head of People", "CTO"][i],
          department: input.department || ["Engineering", "Product", "Engineering", "Product", "Engineering", "Data", "Design", "Engineering", "HR", "Executive"][i],
          tenure: `${Math.floor(Math.random() * 8) + 1} years`,
          location: ["San Francisco", "Remote", "New York", "Austin", "Seattle"][i % 5],
        })),
        totalEmployees: 150 + Math.floor(Math.random() * 500),
        source: "mock",
        authRequiredHint: authScope.error,
        suggestedNextTools: "searchProfiles(keywords, currentCompany) to find these people in CRM; createTribe(profileIds, tribePurpose) to form a team from them",
        apiEndpoint: "GET /v2/companies/{id}/employees",
      }
    },
  }),

  // === Skills & Endorsements ===
  getSkillsAnalysis: tool({
    description:
      "Analyze skills distribution across profileIds, a company, or an industry. Returns skill frequency, endorsements, trending. Use for gap analysis, hiring briefs, or before createTribe(optimizeFor: 'skills').",
    inputSchema: z.object({
      profileIds: z.array(z.string()).nullable().describe("Specific profiles to analyze"),
      companyId: z.string().nullable().describe("Analyze skills within a company"),
      industry: z.string().nullable().describe("Analyze skills within an industry"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const workspaceProfiles = await fetchWorkspaceProfiles(authScope.userClient, 2500)
        const scopedProfiles = filterProfilesForSkillsAnalysis(workspaceProfiles, input)
        const skills = buildSkillInsights(scopedProfiles)

        return {
          skills,
          context: input.companyId || input.industry || (input.profileIds?.length ? "selected profiles" : "workspace"),
          totalProfilesAnalyzed: scopedProfiles.length,
          source: "supabase",
          suggestedNextTools:
            scopedProfiles.length > 0
              ? "createTribe(profileIds, tribePurpose, optimizeFor: 'skills'); searchProfiles(skills: [top skills]); addProjectPosition for role requirements"
              : "Broaden the filters or profile set, then rerun; searchProfiles can help isolate the right CRM slice first",
          apiEndpoint: "GET /v2/skills-analysis",
        }
      }

      const skills = [
        { name: "Python", frequency: 85, avgEndorsements: 45, trending: true },
        { name: "Machine Learning", frequency: 72, avgEndorsements: 38, trending: true },
        { name: "Data Analysis", frequency: 68, avgEndorsements: 42, trending: true },
        { name: "Leadership", frequency: 65, avgEndorsements: 55, trending: false },
        { name: "Project Management", frequency: 60, avgEndorsements: 48, trending: false },
        { name: "JavaScript", frequency: 58, avgEndorsements: 35, trending: false },
        { name: "AWS", frequency: 55, avgEndorsements: 30, trending: true },
        { name: "Agile", frequency: 52, avgEndorsements: 40, trending: false },
        { name: "SQL", frequency: 50, avgEndorsements: 32, trending: false },
        { name: "Communication", frequency: 48, avgEndorsements: 50, trending: false },
      ]
      return {
        skills,
        context: input.companyId || input.industry || "selected profiles",
        totalProfilesAnalyzed: input.profileIds?.length || 50 + Math.floor(Math.random() * 200),
        source: "mock",
        authRequiredHint: authScope.error,
        suggestedNextTools: "createTribe(profileIds, tribePurpose, optimizeFor: 'skills'); searchProfiles(skills: [top skills]); addProjectPosition for role requirements",
        apiEndpoint: "GET /v2/skills-analysis",
      }
    },
  }),

  // === Jobs & Postings ===
  searchJobs: tool({
    description:
      "Search job postings by title, company, location, or keywords. Returns active listings. Use for LinkedOut objectives, hiring briefs, or to compare with getProjectCrmInsights. Pairs with searchProfiles to find matching CRM candidates.",
    inputSchema: z.object({
      keywords: z.string().describe("Job search keywords"),
      location: z.string().nullable().describe("Job location"),
      company: z.string().nullable().describe("Company name"),
      experienceLevel: z.string().nullable().describe("Entry, Mid, Senior, Director, VP, CXO"),
      jobType: z.string().nullable().describe("Full-time, Part-time, Contract, Remote"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const projectRows = await fetchWorkspaceProjectsRows(authScope.userClient, 250)
        const projectIds = projectRows.map((row) => asString(row.id)).filter(Boolean)
        const positionRows = await fetchWorkspaceProjectPositionsRows(authScope.userClient, 400, projectIds)
        const applicationCounts = await fetchWorkspaceApplicationCountsByPosition(
          authScope.userClient,
          positionRows.map((row) => asString(row.id)).filter(Boolean),
        )
        const jobs = buildWorkspaceJobListings(projectRows, positionRows, input, {
          applicationsByPosition: applicationCounts,
        })

        return {
          jobs,
          totalResults: jobs.length,
          source: "supabase",
          suggestedNextTools:
            jobs.length > 0
              ? "getProjectCrmInsights(projectId) to match CRM candidates to roles; searchProfiles(keywords, title) to find internal talent; createProject + addProjectPosition to track hiring"
              : "Broaden the title, company, location, or experience filters; listProjects and addProjectPosition can create more searchable roles",
          apiEndpoint: "GET /v2/jobs-search",
        }
      }

      return {
        jobs: Array.from({ length: 5 }, (_, i) => ({
          id: `job-${i}`,
          title: `${input.keywords} ${["Lead", "Senior", "Staff", "Principal", "Director"][i]}`,
          company: input.company || ["Google", "Meta", "Amazon", "Stripe", "Vercel"][i],
          location: input.location || ["San Francisco, CA", "Remote", "New York, NY", "Seattle, WA", "Austin, TX"][i],
          posted: `${i + 1} days ago`,
          applicants: Math.floor(Math.random() * 200) + 10,
          salary: `$${120 + i * 20}K - $${160 + i * 25}K`,
          experienceLevel: input.experienceLevel || ["Senior", "Mid", "Senior", "Staff", "Director"][i],
        })),
        totalResults: 50 + Math.floor(Math.random() * 500),
        source: "mock",
        authRequiredHint: authScope.error,
        suggestedNextTools: "getProjectCrmInsights(projectId) to match CRM candidates to roles; searchProfiles(keywords, title) to find internal talent; createProject + addProjectPosition to track hiring",
        apiEndpoint: "GET /v2/jobs-search",
      }
    },
  }),

  // === Messaging ===
  getConversations: tool({
    description:
      "Retrieve messaging conversations (all, unread, or archived). Use for outreach tracking and response rates. Pairs with sendMessage for follow-up.",
    inputSchema: z.object({
      status: z.string().nullable().describe("Filter: all, unread, archived"),
      limit: z.number().nullable().describe("Number of conversations to return"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const fetchLimit = Math.max(1, Math.min((input.limit || 5) * 6, 200))
        const [messagesResult, requestsResult, workspaceProfiles] = await Promise.all([
          fetchLinkedinMessageDrafts(authScope.userClient, fetchLimit),
          fetchLinkedinConnectionRequests(authScope.userClient, fetchLimit),
          fetchWorkspaceProfiles(authScope.userClient, 2000),
        ])

        const conversations = buildLinkedinConversationSummaries(
          messagesResult.records,
          requestsResult.records,
          workspaceProfiles,
          {
            status: input.status,
            limit: input.limit,
          },
        )

        const warnings: string[] = []
        if (messagesResult.missingTable || requestsResult.missingTable) {
          warnings.push(
            "Apply the latest Supabase migrations to persist LinkedIn message drafts and connection requests.",
          )
        }

        return {
          conversations,
          totalResults: conversations.length,
          source: "supabase",
          dataQuality: "manual_outreach",
          warnings,
          notes:
            "Derived from saved LinkedIn message drafts and connection-request activity in Supabase. Live LinkedIn inbox sync is not configured in this workspace.",
          suggestedNextTools:
            conversations.length > 0
              ? "sendMessage(recipientId, message) to draft follow-up; getProfileDetails(profileId) to refine personalization; sendConnectionRequest(profileId, note) for first-touch outreach"
              : "sendMessage(recipientId, message) or sendConnectionRequest(profileId, note) to create the first manual outreach thread",
          apiEndpoint: "GET /v2/messaging/conversations",
        }
      }

      return {
        conversations: Array.from({ length: Math.min(input.limit || 5, 5) }, (_, i) => ({
          id: `conv-${i}`,
          participant: `Contact ${i + 1}`,
          lastMessage: ["Thanks for reaching out!", "I'd love to connect!", "Let me check my schedule.", "That sounds interesting.", "Can we discuss next week?"][i],
          timestamp: new Date(Date.now() - i * 86400000).toISOString(),
          unread: i < 2,
          status: i < 2 ? "unread" : "read",
        })),
        suggestedNextTools: "sendMessage(recipientId, message) to reply; getProfileDetails(profileId) to contextualize; searchProfiles if linking to CRM",
        apiEndpoint: "GET /v2/messaging/conversations",
      }
    },
  }),

  sendMessage: tool({
    description:
      "Prepare a LinkedIn outreach message draft for a connection (recipientId, message). Use for outreach, follow-ups, or InMail drafting (isInMail: true). This workspace does not have a live LinkedIn member-messaging transport, so the tool returns a reviewable draft instead of claiming delivery. Pairs with getProfileDetails and getConversations.",
    inputSchema: z.object({
      recipientId: z.string().describe("Recipient profile ID"),
      subject: z.string().nullable().describe("Message subject (for InMail)"),
      message: z.string().describe("Message body"),
      isInMail: z.boolean().nullable().describe("Send as InMail (for non-connections)"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "POST /v2/messaging/messages",
        }
      }

      const authUser = ensureAuthenticatedUserContext(authContext)
      if (!authUser.ok) {
        return {
          ok: false,
          error: authUser.error,
          apiEndpoint: "POST /v2/messaging/messages",
        }
      }

      const recipient = (await fetchProfilesByIds(authScope.userClient, [input.recipientId.trim()]))[0] || null
      if (!recipient) {
        return {
          ok: false,
          error: "Recipient profile not found in workspace.",
          hint: "Run searchProfiles first and use a returned CRM profile ID.",
          apiEndpoint: "POST /v2/messaging/messages",
        }
      }

      if (!input.message.trim()) {
        return {
          ok: false,
          error: "Message body cannot be empty.",
          apiEndpoint: "POST /v2/messaging/messages",
        }
      }

      const draft = buildLinkedinMessageDraft(recipient, input)
      const persisted = await persistLinkedinMessageDraft(authScope.userClient, {
        ownerUserId: authUser.userId,
        profileId: recipient.id,
        channel: input.isInMail ? "inmail" : "message",
        subject: input.subject,
        bodyText: input.message,
      })

      const warnings = [...draft.warnings]
      if (persisted.missingTable) {
        warnings.push("Run the latest Supabase migrations to persist LinkedIn message drafts.")
      } else if (persisted.error) {
        warnings.push("Failed to persist the draft in Supabase; the draft is still returned for manual use.")
      }

      return {
        ok: true,
        ...draft,
        draftId: persisted.record?.id || draft.draftId,
        creditsUsed: input.isInMail ? 1 : 0,
        source: "supabase",
        dataQuality: "draft_only",
        persisted: Boolean(persisted.record),
        warnings,
        notes:
          persisted.record
            ? "Stored as a manual LinkedIn message draft in Supabase. Review the draft and send it manually in LinkedIn."
            : "LinkedIn member messaging is not wired to a live transport in this workspace. Review the draft and send it manually in LinkedIn.",
        suggestedNextTools:
          "getProfileDetails(recipientId) to refine personalization; sendConnectionRequest if not yet connected; getConversations to summarize follow-up context",
        apiEndpoint: "POST /v2/messaging/messages",
      }
    },
  }),

  // === Network Analysis ===
  analyzeNetwork: tool({
    description:
      "Analyze network around a center profile: clusters, density, influence. Use for tribe formation, warm intros, or team composition. Pairs with getProfileConnections and createTribe.",
    inputSchema: z.object({
      centerProfileId: z.string().describe("Profile ID at center of network (from searchProfiles or getProfileDetails)"),
      depth: z.number().nullable().describe("Connection degree 1–3 (default 1)"),
      filters: z.object({
        industry: z.string().nullable(),
        minConnections: z.number().nullable(),
        location: z.string().nullable(),
      }).nullable().describe("Optional filters on cluster members"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const workspaceProfiles = await fetchWorkspaceProfiles(authScope.userClient, 2000)
        const center = workspaceProfiles.find((profile) => profile.id === input.centerProfileId.trim()) || null

        if (!center) {
          return {
            ok: false,
            error: "Profile not found in workspace.",
            hint: "Run searchProfiles first and use a returned CRM profile ID.",
            apiEndpoint: "GET /v2/network-analysis",
          }
        }

        const analysis = buildNetworkAnalysisFromWorkspace(center, workspaceProfiles, input)
        return {
          ...analysis,
          centerProfileId: center.id,
          centerProfileName: center.fullName,
          source: "supabase",
          dataQuality: "derived",
          notes:
            "Derived from CRM profile similarity, tribe alignment, and shared company/location/skill signals. Direct LinkedIn graph edges are not persisted in this workspace.",
          suggestedNextTools: "createTribe(profileIds from clusters, tribePurpose); getRecommendations(profileId); searchProfiles to find CRM matches for keyMembers",
          apiEndpoint: "GET /v2/network-analysis",
        }
      }

      const mockWorkspace = buildMockWorkspaceProfiles(input.centerProfileId, 32)
      const center = mockWorkspace[0]
      const analysis = buildNetworkAnalysisFromWorkspace(center, mockWorkspace, input)
      return {
        ...analysis,
        centerProfileId: center.id,
        centerProfileName: center.fullName,
        source: "mock",
        dataQuality: "derived",
        notes:
          "Derived from deterministic mock CRM data because the user is not authenticated. Sign in with Supabase for workspace-backed network analysis.",
        authRequiredHint: authScope.error,
        suggestedNextTools: "createTribe(profileIds from clusters, tribePurpose); getRecommendations(profileId); searchProfiles to find CRM matches for keyMembers",
        apiEndpoint: "GET /v2/network-analysis",
      }
    },
  }),

  // === Recommendations ===
  getRecommendations: tool({
    description:
      "Get recommendations received and given by a profile. Use for reputation, fit, or warm intro context. direction: received | given | both. Pairs with getProfileDetails and analyzeNetwork.",
    inputSchema: z.object({
      profileId: z.string().describe("Profile ID (from searchProfiles or getProfileDetails)"),
      direction: z.string().nullable().describe("received | given | both"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const workspaceProfiles = await fetchWorkspaceProfiles(authScope.userClient, 2000)
        const center = workspaceProfiles.find((profile) => profile.id === input.profileId.trim()) || null

        if (!center) {
          return {
            ok: false,
            error: "Profile not found in workspace.",
            hint: "Run searchProfiles first and use a returned CRM profile ID.",
            apiEndpoint: "GET /v2/people/{id}/recommendations",
          }
        }

        const direction = (input.direction || "both").trim().toLowerCase()
        const derived = buildProfileRecommendationsFromWorkspace(center, workspaceProfiles)
        return {
          received: direction === "given" ? [] : derived.received,
          given: direction === "received" ? [] : derived.given,
          totalReceived: direction === "given" ? 0 : derived.totalReceived,
          totalGiven: direction === "received" ? 0 : derived.totalGiven,
          profileId: center.id,
          profileName: center.fullName,
          source: "supabase",
          dataQuality: "derived",
          notes:
            "Derived from CRM relationship proximity and shared company/tribe/skill signals. Literal LinkedIn recommendation text is not persisted in this workspace.",
          suggestedNextTools: "getProfileConnections(profileId); sendConnectionRequest or sendMessage for outreach; createTribe if building a team around this profile",
          apiEndpoint: "GET /v2/people/{id}/recommendations",
        }
      }

      return {
        received: [
          { from: "Jane Smith, VP Engineering", text: "Exceptional leader who transformed our engineering culture.", relationship: "Manager", date: "2024-01" },
          { from: "Mike Chen, Senior Engineer", text: "Best mentor I've ever had. Truly cares about team growth.", relationship: "Direct Report", date: "2023-09" },
          { from: "Sarah Lee, Product Director", text: "Amazing cross-functional collaborator.", relationship: "Colleague", date: "2023-06" },
        ],
        given: [
          { to: "Alex Rivera, Staff Engineer", text: "Brilliant technologist with outstanding leadership potential.", relationship: "Direct Report", date: "2024-02" },
        ],
        totalReceived: 12,
        totalGiven: 8,
        source: "mock",
        authRequiredHint: authScope.error,
        suggestedNextTools: "getProfileConnections(profileId); sendConnectionRequest or sendMessage for outreach; createTribe if building a team around this profile",
        apiEndpoint: "GET /v2/people/{id}/recommendations",
      }
    },
  }),

  // === Analytics ===
  getProfileViews: tool({
    description:
      "Get profile view analytics: viewer demographics, search appearances, engagement trend. timeRange: 7d | 30d | 90d. Use for outreach prioritization or LinkedOut performance.",
    inputSchema: z.object({
      profileId: z.string().describe("Profile ID"),
      timeRange: z.string().nullable().describe("7d | 30d | 90d"),
    }),
    execute: async (input) => {
      const timeRange = normalizeLinkedinAnalyticsTimeRange(input.timeRange)
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const workspaceProfiles = await fetchWorkspaceProfiles(authScope.userClient, 2000)
        const profile = workspaceProfiles.find((item) => item.id === input.profileId.trim()) || null

        if (!profile) {
          return {
            ok: false,
            error: "Profile not found in workspace.",
            hint: "Run searchProfiles first and use a returned CRM profile ID.",
            apiEndpoint: "GET /v2/people/{id}/analytics",
          }
        }

        const analytics = buildProfileViewAnalytics(profile, workspaceProfiles, { timeRange })
        return {
          ...analytics,
          profileId: profile.id,
          profileName: profile.fullName,
          timeRange,
          source: "supabase",
          dataQuality: "derived",
          notes:
            "Derived from CRM profile freshness and similar-profile activity in Supabase. Direct LinkedIn viewer telemetry is not persisted in this workspace.",
          suggestedNextTools: "getPostAnalytics for content performance; getProfileDetails(profileId); searchProfiles to find similar high-engagement profiles",
          apiEndpoint: "GET /v2/people/{id}/analytics",
        }
      }

      const mockWorkspace = buildMockWorkspaceProfiles(input.profileId, 24)
      const profile = mockWorkspace[0]
      const analytics = buildProfileViewAnalytics(profile, mockWorkspace, { timeRange })
      return {
        ...analytics,
        profileId: profile.id,
        profileName: profile.fullName,
        timeRange,
        source: "mock",
        dataQuality: "derived",
        notes:
          "Derived from deterministic mock CRM data because the user is not authenticated. Sign in with Supabase for workspace-backed analytics.",
        authRequiredHint: authScope.error,
        suggestedNextTools: "getPostAnalytics for content performance; getProfileDetails(profileId); searchProfiles to find similar high-engagement profiles",
        apiEndpoint: "GET /v2/people/{id}/analytics",
      }
    },
  }),

  // === CSV Analysis Tool ===
  analyzeCSVProfiles: tool({
    description:
      "Analyze LinkedIn CSV export: skills distribution, tribe recommendations, gap/diversity notes. analysisType: overview | skills | tribes | gaps | diversity | comprehensive. Use when user has pasted or uploaded CSV; then createTribe or searchProfiles with real CRM data.",
    inputSchema: z.object({
      csvData: z.string().describe("Raw CSV from LinkedIn data export (paste or from upload)"),
      analysisType: z.string().describe("overview | skills | tribes | gaps | diversity | comprehensive"),
      focusArea: z.string().nullable().describe("Optional: engineering, leadership, diversity, retention"),
    }),
    execute: async (input) => {
      const rows = input.csvData.split("\n").filter(r => r.trim().length > 0)
      const profileCount = Math.max(rows.length - 1, 0)

      return {
        summary: {
          totalProfiles: profileCount,
          analysisType: input.analysisType,
          focusArea: input.focusArea || "general",
        },
        skillsDistribution: [
          { skill: "JavaScript/TypeScript", count: Math.ceil(profileCount * 0.7), percentage: "70%" },
          { skill: "Python", count: Math.ceil(profileCount * 0.55), percentage: "55%" },
          { skill: "Leadership", count: Math.ceil(profileCount * 0.4), percentage: "40%" },
          { skill: "Cloud (AWS/GCP/Azure)", count: Math.ceil(profileCount * 0.5), percentage: "50%" },
          { skill: "Data Analysis", count: Math.ceil(profileCount * 0.35), percentage: "35%" },
        ],
        tribeRecommendations: [
          {
            tribeName: "Innovation Squad",
            purpose: "Cross-functional team for rapid prototyping and innovation",
            suggestedSize: Math.min(Math.ceil(profileCount * 0.2), 8),
            keyTraits: ["Creative problem-solving", "Diverse technical backgrounds", "Entrepreneurial mindset"],
          },
          {
            tribeName: "Core Platform Team",
            purpose: "Stable engineering team for platform reliability and scale",
            suggestedSize: Math.min(Math.ceil(profileCount * 0.25), 10),
            keyTraits: ["Deep technical expertise", "Systems thinking", "Reliability-focused"],
          },
          {
            tribeName: "Growth & Engagement",
            purpose: "Team focused on user acquisition and retention",
            suggestedSize: Math.min(Math.ceil(profileCount * 0.15), 6),
            keyTraits: ["Data-driven", "User empathy", "Marketing synergy"],
          },
        ],
        gapAnalysis: {
          missingSkills: ["DevOps/SRE", "UX Research", "Security Engineering"],
          overrepresented: ["Frontend Development", "Project Management"],
          diversityNotes: "Consider expanding sourcing to underrepresented communities",
        },
        suggestedNextTools: "createTribe(profileIds, tribePurpose) using tribeRecommendations; searchProfiles(keywords, skills) in CRM to find matching live data; getSkillsAnalysis for deeper skill view",
        apiEndpoint: "POST /v2/csv-analysis",
      }
    },
  }),

  analyzeCrmPortfolio: tool({
    description:
      "Analyze CRM profile segments across tribes, skills, seniority, and network reach. Useful for executive snapshots and workforce planning.",
    inputSchema: z.object({
      tribeId: z.string().nullable().describe("Optional tribe ID to scope the analysis"),
      keywords: z.string().nullable().describe("Optional keyword filter across name/title/skills/company"),
      industry: z.string().nullable().describe("Optional industry filter"),
      location: z.string().nullable().describe("Optional location filter"),
      requiredSkills: z.array(z.string()).nullable().describe("Skills to evaluate coverage against"),
      includeUnassignedOnly: z.boolean().nullable().describe("If true, include only profiles not assigned to a tribe"),
      limit: z.number().int().min(3).max(30).nullable().describe("Top-N list size for grouped output"),
    }),
    execute: async (input) => {
      const topN = Math.max(3, Math.min(input.limit || 8, 30))
      const requiredSkills = dedupeCaseInsensitive(input.requiredSkills || [])
      const authScope = ensureAuthenticatedToolsContext(authContext)

      if (authScope.ok) {
        const [workspaceProfiles, tribeRows] = await Promise.all([
          fetchWorkspaceProfiles(authScope.userClient, 1000),
          fetchWorkspaceTribes(authScope.userClient, 200),
        ])

        if (workspaceProfiles.length === 0) {
          return {
            ok: false,
            error: "No CRM profiles available for analysis.",
            hint: "Upload CSV data or sync profiles into Supabase first.",
            apiEndpoint: "GET /v2/crm/portfolio-analysis",
          }
        }

        let scopedProfiles = workspaceProfiles
        let scopedTribeName: string | null = null

        if (input.tribeId?.trim()) {
          const selectedTribe = tribeRows.find((row) => asString(row.id) === input.tribeId?.trim())
          if (!selectedTribe) {
            return {
              ok: false,
              error: "Requested tribe was not found.",
              availableTribes: tribeRows.slice(0, 20).map((row) => ({
                tribeId: asString(row.id),
                name: asString(row.name, "Tribe"),
              })),
              apiEndpoint: "GET /v2/crm/portfolio-analysis",
            }
          }

          scopedTribeName = asString(selectedTribe.name) || null
          scopedProfiles = resolveTribeMembers(selectedTribe, workspaceProfiles)
        }

        scopedProfiles = filterProfiles(scopedProfiles, {
          keywords: input.keywords || "",
          location: input.location,
          industry: input.industry,
          currentCompany: null,
          pastCompany: null,
          title: null,
          skills: requiredSkills,
          experienceYears: null,
        })

        if (input.includeUnassignedOnly) {
          scopedProfiles = scopedProfiles.filter((profile) => !profile.tribe?.trim())
        }

        const assignedCount = scopedProfiles.filter((profile) => Boolean(profile.tribe?.trim())).length
        const unassignedCount = scopedProfiles.length - assignedCount
        const industryBreakdown = buildCategoryBreakdown(scopedProfiles, (profile) => profile.industry, topN)
        const locationBreakdown = buildCategoryBreakdown(scopedProfiles, (profile) => profile.location, topN)
        const seniorityBreakdown = buildCategoryBreakdown(scopedProfiles, (profile) => inferSeniorityBand(profile.seniority), 6)
        const tribeBreakdown = buildCategoryBreakdown(
          scopedProfiles,
          (profile) => profile.tribe || "Unassigned",
          topN,
        )
        const topSkills = buildCategoryBreakdown(
          scopedProfiles
            .flatMap((profile) => profile.skills)
            .map((skill) => skill.trim())
            .filter(Boolean),
          (skill) => skill,
          topN,
        ).map((entry) => ({
          skill: entry.label,
          count: entry.count,
          percentage: entry.percentage,
        }))
        const requiredSkillCoverage = buildSkillCoverage(scopedProfiles, requiredSkills)
        const averageSkillCoverage = averageNumber(
          requiredSkillCoverage.coverage.map((item) => item.coveragePercent),
        )

        const connections = scopedProfiles.map((profile) => profile.connections)
        const matchScores = scopedProfiles.map((profile) => profile.matchScore)
        const highReachProfiles = scopedProfiles
          .filter((profile) => profile.connections >= 800)
          .sort((a, b) => b.connections - a.connections)
          .slice(0, 8)
          .map((profile) => ({
            profileId: profile.id,
            name: profile.fullName,
            connections: profile.connections,
            tribe: profile.tribe || null,
          }))

        const recommendations: string[] = []
        if (requiredSkillCoverage.missingSkills.length > 0) {
          recommendations.push(`Missing required skills: ${requiredSkillCoverage.missingSkills.join(", ")}`)
        }
        if (requiredSkillCoverage.coverage.length > 0 && averageSkillCoverage < 55) {
          recommendations.push("Required-skill coverage is low; prioritize hiring or upskilling for weak-signal skills.")
        }
        if (unassignedCount > 0 && unassignedCount / Math.max(scopedProfiles.length, 1) >= 0.35) {
          recommendations.push("Large unassigned profile pool detected; map profiles into tribes for better execution planning.")
        }
        if (industryBreakdown.length >= 1 && industryBreakdown[0].percentage >= 60) {
          recommendations.push(
            `Industry concentration risk: ${industryBreakdown[0].label} represents ${industryBreakdown[0].percentage}% of scope.`,
          )
        }
        if (recommendations.length === 0) {
          recommendations.push("Portfolio is balanced for the selected scope; monitor monthly for emerging skill gaps.")
        }

        return {
          ok: true,
          source: "supabase",
          scope: {
            tribeId: input.tribeId || null,
            tribeName: scopedTribeName,
            keywords: input.keywords || null,
            industry: input.industry || null,
            location: input.location || null,
            includeUnassignedOnly: Boolean(input.includeUnassignedOnly),
          },
          analyzedProfiles: scopedProfiles.length,
          totalWorkspaceProfiles: workspaceProfiles.length,
          segmentation: {
            industries: industryBreakdown,
            locations: locationBreakdown,
            seniorityBands: seniorityBreakdown,
            tribes: tribeBreakdown,
          },
          skills: {
            topSkills,
            requiredSkillCoverage: requiredSkillCoverage.coverage,
            missingRequiredSkills: requiredSkillCoverage.missingSkills,
            avgRequiredSkillCoverage: averageSkillCoverage,
          },
          network: {
            totalReach: connections.reduce((sum, value) => sum + value, 0),
            avgConnections: averageNumber(connections),
            medianConnections: medianNumber(connections),
            highReachProfiles,
          },
          quality: {
            avgMatchScore: averageNumber(matchScores),
            medianMatchScore: medianNumber(matchScores),
            assignedProfiles: assignedCount,
            unassignedProfiles: unassignedCount,
          },
          recommendations,
          suggestedNextTools: "listTribes to scope by tribe; createTribe(profileIds, tribePurpose) for unassigned; getProjectCrmInsights(projectId) to align with roles; getSkillsAnalysis for deeper skill view",
          apiEndpoint: "GET /v2/crm/portfolio-analysis",
        }
      }

      const seedKeyword = (input.keywords || "talent").trim() || "talent"
      const mockProfiles = generateMockProfiles(seedKeyword, Math.max(topN, 10)).map((profile) => ({
        id: asString(profile.id),
        firstName: asString(profile.name).split(" ")[0] || "User",
        lastName: asString(profile.name).split(" ").slice(1).join(" "),
        fullName: asString(profile.name),
        headline: asString(profile.title),
        company: asString(profile.company),
        location: asString(profile.location),
        industry: "Technology",
        connections: asNumber(profile.connections, 0),
        skills: asStringArray(profile.skills),
        matchScore: asNumber(profile.matchScore, 70),
        seniority: "Senior",
        tribe: undefined,
      })) as CrmProfile[]

      const requiredSkillCoverage = buildSkillCoverage(mockProfiles, requiredSkills)
      return {
        ok: true,
        source: "mock",
        authRequiredHint: authScope.error,
        analyzedProfiles: mockProfiles.length,
        segmentation: {
          industries: buildCategoryBreakdown(mockProfiles, (profile) => profile.industry, topN),
          locations: buildCategoryBreakdown(mockProfiles, (profile) => profile.location, topN),
          seniorityBands: buildCategoryBreakdown(mockProfiles, (profile) => inferSeniorityBand(profile.seniority), 5),
        },
        skills: {
          topSkills: buildCategoryBreakdown(
            mockProfiles.flatMap((profile) => profile.skills),
            (skill) => skill,
            topN,
          ).map((entry) => ({
            skill: entry.label,
            count: entry.count,
            percentage: entry.percentage,
          })),
          requiredSkillCoverage: requiredSkillCoverage.coverage,
          missingRequiredSkills: requiredSkillCoverage.missingSkills,
        },
        suggestedNextTools: "Sign in for real CRM; then listTribes, createTribe, getProjectCrmInsights",
        apiEndpoint: "GET /v2/crm/portfolio-analysis",
      }
    },
  }),

  analyzeTribeComposition: tool({
    description:
      "Evaluate tribe composition, health, and role/skill coverage. Surfaces gaps plus recommended CRM profiles to strengthen each tribe.",
    inputSchema: z.object({
      tribeId: z.string().nullable().describe("Optional tribe ID for a single-tribe deep dive"),
      requiredSkills: z.array(z.string()).nullable().describe("Skills each analyzed tribe should cover"),
      benchmarkAgainstWorkspace: z.boolean().nullable().describe("Compare tribe averages against all workspace profiles"),
      limitRecommendations: z.number().int().min(1).max(12).nullable().describe("Max recommended profile additions per tribe"),
    }),
    execute: async (input) => {
      const recommendationLimit = Math.max(1, Math.min(input.limitRecommendations || 5, 12))
      const requiredSkills = dedupeCaseInsensitive(input.requiredSkills || [])
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          hint: "Sign in to analyze actual tribe composition from Supabase data.",
          apiEndpoint: "GET /v2/tribes/composition-analysis",
        }
      }

      const [tribeRows, workspaceProfiles] = await Promise.all([
        fetchWorkspaceTribes(authScope.userClient, 200),
        fetchWorkspaceProfiles(authScope.userClient, 1200),
      ])

      if (tribeRows.length === 0) {
        return {
          ok: false,
          error: "No tribes found in workspace.",
          hint: "Create a tribe first, then rerun composition analysis.",
          apiEndpoint: "GET /v2/tribes/composition-analysis",
        }
      }

      const scopedTribes = input.tribeId?.trim()
        ? tribeRows.filter((row) => asString(row.id) === input.tribeId?.trim())
        : tribeRows

      if (scopedTribes.length === 0) {
        return {
          ok: false,
          error: "Requested tribe was not found.",
          availableTribes: tribeRows.slice(0, 20).map((row) => ({
            tribeId: asString(row.id),
            name: asString(row.name, "Tribe"),
          })),
          apiEndpoint: "GET /v2/tribes/composition-analysis",
        }
      }

      const workspaceAvgMatchScore = averageNumber(workspaceProfiles.map((profile) => profile.matchScore))
      const workspaceAvgConnections = averageNumber(workspaceProfiles.map((profile) => profile.connections))

      const tribeAnalyses = scopedTribes.map((row) => {
        const members = resolveTribeMembers(row, workspaceProfiles)
        const memberIds = new Set(members.map((member) => member.id))
        const memberSkillBreakdown = buildCategoryBreakdown(
          members
            .flatMap((member) => member.skills)
            .map((skill) => skill.trim())
            .filter(Boolean),
          (skill) => skill,
          10,
        )
        const requiredSkillCoverage = buildSkillCoverage(members, requiredSkills)
        const gapSkills = requiredSkillCoverage.coverage
          .filter((item) => item.coveragePercent < 40)
          .sort((a, b) => a.coveragePercent - b.coveragePercent)
          .map((item) => item.skill)

        const nonMembers = workspaceProfiles.filter((profile) => !memberIds.has(profile.id))
        const recommendedAdds = nonMembers
          .map((profile) => {
            const normalizedSkills = new Set(profile.skills.map((skill) => normalizeSkillKey(skill)))
            const gapSkillMatches = gapSkills.filter((skill) => normalizedSkills.has(normalizeSkillKey(skill))).length
            const coreSkillMatches = memberSkillBreakdown
              .slice(0, 5)
              .filter((item) => normalizedSkills.has(normalizeSkillKey(item.label))).length

            const recommendationScore = Number(
              (
                gapSkillMatches * 26 +
                coreSkillMatches * 8 +
                profile.matchScore * 0.45 +
                Math.min(profile.connections, 2200) * 0.01
              ).toFixed(1),
            )

            const reasons: string[] = []
            if (gapSkillMatches > 0) {
              reasons.push(`Covers ${gapSkillMatches} current gap skill(s)`)
            }
            if (coreSkillMatches >= 2) {
              reasons.push("Strong overlap with current tribe strengths")
            }
            if (profile.matchScore >= 80) {
              reasons.push("High CRM match score")
            }
            if (profile.connections >= 900) {
              reasons.push("High network reach")
            }
            if (reasons.length === 0) {
              reasons.push("Potential complement candidate")
            }

            return {
              profileId: profile.id,
              name: profile.fullName,
              headline: profile.headline,
              company: profile.company,
              currentTribe: profile.tribe || null,
              recommendationScore,
              reasons: reasons.slice(0, 3),
            }
          })
          .sort((a, b) => b.recommendationScore - a.recommendationScore)
          .slice(0, recommendationLimit)

        const avgMatchScore = averageNumber(members.map((member) => member.matchScore))
        const avgConnections = averageNumber(members.map((member) => member.connections))
        const baseCohesion = asNumber(row.cohesion, 7.4)
        const baseComplementarity = asNumber(row.complementarity, 7.4)
        const coverageScore =
          requiredSkillCoverage.coverage.length > 0
            ? averageNumber(requiredSkillCoverage.coverage.map((item) => item.coveragePercent)) / 10
            : Math.min(10, memberSkillBreakdown.length + 2)
        const healthScore = Number(
          (
            baseCohesion * 0.2 +
            baseComplementarity * 0.2 +
            (avgMatchScore / 10) * 0.25 +
            (avgConnections / 320) * 0.2 +
            coverageScore * 0.15
          ).toFixed(1),
        )

        return {
          tribeId: asString(row.id),
          name: asString(row.name, "Tribe"),
          memberCount: members.length,
          avgMatchScore,
          avgConnections,
          avgExperienceYears: estimateAverageExperience(members),
          healthScore: Math.max(0, Math.min(10, healthScore)),
          seniorityMix: buildCategoryBreakdown(members, (member) => inferSeniorityBand(member.seniority), 6),
          industryMix: buildCategoryBreakdown(members, (member) => member.industry, 6),
          topSkills: memberSkillBreakdown.map((entry) => ({
            skill: entry.label,
            count: entry.count,
            percentage: entry.percentage,
          })),
          requiredSkillCoverage: requiredSkillCoverage.coverage,
          gapSkills,
          recommendedAdds,
        }
      })

      const portfolioRecommendations: string[] = []
      const lowHealthTribes = tribeAnalyses.filter((tribe) => tribe.healthScore < 7.0)
      if (lowHealthTribes.length > 0) {
        portfolioRecommendations.push(
          `${lowHealthTribes.length} tribe(s) show health below 7.0; prioritize composition tuning and member rebalancing.`,
        )
      }
      if (requiredSkills.length > 0) {
        const uncoveredSkills = requiredSkills.filter((skill) =>
          tribeAnalyses.every((tribe) =>
            tribe.requiredSkillCoverage.every(
              (item) => item.skill.toLowerCase() !== skill.toLowerCase() || item.coveragePercent < 20,
            ),
          ),
        )
        if (uncoveredSkills.length > 0) {
          portfolioRecommendations.push(`Workspace-wide skill scarcity detected: ${uncoveredSkills.join(", ")}`)
        }
      }
      if (portfolioRecommendations.length === 0) {
        portfolioRecommendations.push("Tribe composition is stable; run this analysis weekly to keep gaps controlled.")
      }

      return {
        ok: true,
        source: "supabase",
        tribesAnalyzed: tribeAnalyses.length,
        benchmark: input.benchmarkAgainstWorkspace !== false
          ? {
              workspaceAvgMatchScore,
              workspaceAvgConnections,
            }
          : undefined,
        tribes: tribeAnalyses,
        recommendations: portfolioRecommendations,
        suggestedNextTools: "addProfilesToTribe(tribeId, profileIds) using recommendedAdds; getProfileDetails(profileId); listTribes; createTribe if forming new tribe from recommendations",
        apiEndpoint: "GET /v2/tribes/composition-analysis",
      }
    },
  }),

  analyzeGroupTalentOpportunities: tool({
    description:
      "Analyze group/community opportunities using CRM profiles, keywords, and target tribe context to identify high-fit candidates and outreach clusters.",
    inputSchema: z.object({
      keywords: z.string().describe("Core topic or opportunity to match (e.g. 'AI security', 'revops')"),
      category: z.string().nullable().describe("Optional category lens (industry, discipline, region)"),
      targetTribeId: z.string().nullable().describe("Optional tribe ID to find complementary candidates outside that tribe"),
      requiredSkills: z.array(z.string()).nullable().describe("Optional must-have skills for candidate scoring"),
      limitProfiles: z.number().int().min(1).max(50).nullable().describe("Maximum candidate profiles to return"),
    }),
    execute: async (input) => {
      const candidateLimit = Math.max(1, Math.min(input.limitProfiles || 15, 50))
      const keywordTokens = dedupeCaseInsensitive(normalizeWords(input.keywords))
      const requiredSkills = dedupeCaseInsensitive(input.requiredSkills || [])
      const authScope = ensureAuthenticatedToolsContext(authContext)

      if (authScope.ok) {
        const [workspaceProfiles, tribeRows] = await Promise.all([
          fetchWorkspaceProfiles(authScope.userClient, 1200),
          fetchWorkspaceTribes(authScope.userClient, 200),
        ])

        if (workspaceProfiles.length === 0) {
          return {
            ok: false,
            error: "No CRM profiles available for group opportunity analysis.",
            hint: "Sync profiles first, then rerun this analysis.",
            apiEndpoint: "GET /v2/groups/talent-opportunities",
          }
        }

        let targetTribe: DbRow | null = null
        let excludedMemberIds = new Set<string>()
        if (input.targetTribeId?.trim()) {
          targetTribe = tribeRows.find((row) => asString(row.id) === input.targetTribeId?.trim()) || null
          if (!targetTribe) {
            return {
              ok: false,
              error: "Target tribe was not found.",
              availableTribes: tribeRows.slice(0, 20).map((row) => ({
                tribeId: asString(row.id),
                name: asString(row.name, "Tribe"),
              })),
              apiEndpoint: "GET /v2/groups/talent-opportunities",
            }
          }
          excludedMemberIds = new Set(getTribeMemberIds(targetTribe))
        }

        const candidatePool = workspaceProfiles.filter((profile) => !excludedMemberIds.has(profile.id))
        const scoredCandidates = candidatePool
          .map((profile) => {
            const keywordScore = buildKeywordScore(profile, keywordTokens)
            const normalizedProfileSkills = new Set(profile.skills.map((skill) => normalizeSkillKey(skill)))
            const requiredSkillMatches = requiredSkills.filter((skill) =>
              normalizedProfileSkills.has(normalizeSkillKey(skill)),
            ).length
            const score = Number(
              (
                keywordScore +
                requiredSkillMatches * 18 +
                profile.matchScore * 0.35 +
                Math.min(profile.connections, 2500) * 0.008
              ).toFixed(1),
            )

            return {
              profile,
              score,
              keywordScore,
              requiredSkillMatches,
            }
          })
          .filter((item) => item.score >= 22 || item.keywordScore > 0 || item.requiredSkillMatches > 0)
          .sort((a, b) => b.score - a.score)

        const shortlist = scoredCandidates.slice(0, candidateLimit)
        const industrySignals = buildCategoryBreakdown(
          shortlist.map((item) => item.profile),
          (profile) => profile.industry,
          6,
        )
        const skillSignals = buildCategoryBreakdown(
          shortlist.flatMap((item) => item.profile.skills),
          (skill) => skill,
          8,
        )

        const groupSeedLabels = dedupeCaseInsensitive([
          ...skillSignals.slice(0, 3).map((item) => item.label),
          ...industrySignals.slice(0, 3).map((item) => item.label),
          input.keywords,
        ]).slice(0, 6)

        const recommendedGroups = groupSeedLabels.map((label, index) => {
          const normalized = label.toLowerCase()
          const estimatedMatchingProfiles = shortlist.filter((item) => {
            const haystack = [
              item.profile.headline,
              item.profile.industry,
              item.profile.company,
              item.profile.skills.join(" "),
            ]
              .join(" ")
              .toLowerCase()
            return haystack.includes(normalized)
          }).length

          const baseSignal =
            skillSignals.find((item) => item.label.toLowerCase() === normalized)?.percentage ||
            industrySignals.find((item) => item.label.toLowerCase() === normalized)?.percentage ||
            Math.max(8, 32 - index * 4)

          const relevanceScore = Math.max(
            30,
            Math.min(
              98,
              Number((baseSignal * 1.4 + estimatedMatchingProfiles * 2.5 + Math.max(0, 12 - index * 1.5)).toFixed(1)),
            ),
          )

          return {
            id: `group-signal-${index + 1}`,
            name: `${label} ${["Professionals", "Builders", "Leaders", "Alliance", "Collective", "Forum"][index % 6]}`,
            category: input.category || "professional-network",
            estimatedMatchingProfiles,
            relevanceScore,
          }
        })

        const recommendations: string[] = []
        if (shortlist.length === 0) {
          recommendations.push("No strong matches found; broaden keywords or remove strict required skills.")
        } else {
          recommendations.push(`Prioritize outreach to top ${Math.min(shortlist.length, 10)} high-fit profiles.`)
        }
        if (requiredSkills.length > 0) {
          const uncoveredRequiredSkills = requiredSkills.filter((skill) =>
            shortlist.every((candidate) =>
              !candidate.profile.skills.some((profileSkill) =>
                normalizeSkillKey(profileSkill) === normalizeSkillKey(skill),
              ),
            ),
          )
          if (uncoveredRequiredSkills.length > 0) {
            recommendations.push(`No shortlist coverage for: ${uncoveredRequiredSkills.join(", ")}`)
          }
        }
        if (targetTribe) {
          recommendations.push(
            `Use this list to augment tribe "${asString(targetTribe.name, "Target Tribe")}" with external complementary talent.`,
          )
        }

        return {
          ok: true,
          source: "supabase",
          query: {
            keywords: input.keywords,
            category: input.category || null,
            targetTribeId: input.targetTribeId || null,
          },
          targetTribe: targetTribe
            ? {
                tribeId: asString(targetTribe.id),
                name: asString(targetTribe.name, "Tribe"),
              }
            : null,
          candidatePoolSize: candidatePool.length,
          matchedProfiles: shortlist.length,
          topProfiles: shortlist.map((item) => ({
            ...describeProfile(item.profile),
            relevanceScore: item.score,
            keywordSignal: item.keywordScore,
            requiredSkillMatches: item.requiredSkillMatches,
          })),
          signalSummary: {
            industries: industrySignals,
            skills: skillSignals,
          },
          recommendedGroups,
          recommendations,
          suggestedNextTools: "addProfilesToTribe(targetTribeId, profileIds from topProfiles); createTribe(profileIds, tribePurpose) for a new group; getProfileDetails(profileId); sendConnectionRequest for outreach",
          apiEndpoint: "GET /v2/groups/talent-opportunities",
        }
      }

      const mockProfiles = generateMockProfiles(input.keywords, Math.max(candidateLimit, 10))
      const mockGroups = Array.from({ length: 5 }, (_, index) => ({
        id: `group-signal-${index + 1}`,
        name: `${input.keywords} ${["Professionals", "Network", "Community", "Leaders", "Forum"][index]}`,
        category: input.category || "professional-network",
        estimatedMatchingProfiles: Math.max(2, Math.round(mockProfiles.length * (0.6 - index * 0.08))),
        relevanceScore: 84 - index * 9,
      }))

      return {
        ok: true,
        source: "mock",
        authRequiredHint: authScope.error,
        query: {
          keywords: input.keywords,
          category: input.category || null,
          targetTribeId: input.targetTribeId || null,
        },
        candidatePoolSize: mockProfiles.length,
        matchedProfiles: Math.min(candidateLimit, mockProfiles.length),
        topProfiles: mockProfiles.slice(0, candidateLimit),
        recommendedGroups: mockGroups,
        suggestedNextTools: "Sign in for real CRM; then addProfilesToTribe, createTribe, getProfileDetails",
        apiEndpoint: "GET /v2/groups/talent-opportunities",
      }
    },
  }),

  // === Invitations ===
  sendConnectionRequest: tool({
    description:
      "Prepare and persist a manual LinkedIn connection-request draft for a profile (profileId, optional note). Use after getProfileDetails or searchProfiles for outreach. This tool does not claim delivery unless you manually send the request in LinkedIn.",
    inputSchema: z.object({
      profileId: z.string().describe("Target profile ID"),
      note: z.string().nullable().describe("Personalized connection message (max 300 chars)"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "POST /v2/invitations",
        }
      }

      const authUser = ensureAuthenticatedUserContext(authContext)
      if (!authUser.ok) {
        return {
          ok: false,
          error: authUser.error,
          apiEndpoint: "POST /v2/invitations",
        }
      }

      const recipient = (await fetchProfilesByIds(authScope.userClient, [input.profileId.trim()]))[0] || null
      if (!recipient) {
        return {
          ok: false,
          error: "Recipient profile not found in workspace.",
          hint: "Run searchProfiles first and use a returned CRM profile ID.",
          apiEndpoint: "POST /v2/invitations",
        }
      }

      const note = input.note?.trim() || null
      if (note && note.length > 300) {
        return {
          ok: false,
          error: "Connection request note must be 300 characters or fewer.",
          apiEndpoint: "POST /v2/invitations",
        }
      }

      const persisted = await persistLinkedinConnectionRequest(authScope.userClient, {
        ownerUserId: authUser.userId,
        profileId: recipient.id,
        note,
      })

      const warnings: string[] = []
      if (!note) {
        warnings.push("Add a short personalized note in LinkedIn when the invite flow allows it.")
      }
      if (persisted.missingTable) {
        warnings.push("Run the latest Supabase migrations to persist LinkedIn connection requests.")
      } else if (persisted.error) {
        warnings.push("Failed to persist the connection request draft in Supabase.")
      }

      return {
        ok: true,
        status: "draft_ready",
        requestId: persisted.record?.id || createRandomId("req-draft"),
        recipient: {
          id: recipient.id,
          name: recipient.fullName,
          title: recipient.headline,
          company: recipient.company,
          location: recipient.location,
        },
        note,
        noteIncluded: Boolean(note),
        timestamp: new Date().toISOString(),
        source: "supabase",
        dataQuality: "draft_only",
        persisted: Boolean(persisted.record),
        warnings,
        notes:
          persisted.record
            ? "Stored as a manual LinkedIn connection-request draft in Supabase. Send it manually in LinkedIn to complete outreach."
            : "LinkedIn connection requests are not sent directly from this workspace. Use the draft manually in LinkedIn.",
        suggestedNextTools:
          "sendMessage(recipientId, message) to prepare follow-up copy; getConversations to track manual outreach threads; getProfileDetails(profileId) to refine the note",
        apiEndpoint: "POST /v2/invitations",
      }
    },
  }),

  // === Groups ===
  searchGroups: tool({
    description:
      "Search groups by topic or industry. Use for talent communities and sourcing. Pairs with searchProfiles(keywords) to find members in CRM.",
    inputSchema: z.object({
      keywords: z.string().describe("Group search keywords"),
      category: z.string().nullable().describe("Group category filter"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const [tribeRows, workspaceProfiles] = await Promise.all([
          fetchWorkspaceTribes(authScope.userClient, 200),
          fetchWorkspaceProfiles(authScope.userClient, 2000),
        ])
        const groups = buildWorkspaceGroupSearchResults(tribeRows, workspaceProfiles, input)

        return {
          groups,
          totalResults: groups.length,
          source: "supabase",
          dataQuality: "derived",
          notes:
            "Derived from workspace tribes and CRM profile communities. Direct LinkedIn group directory data is not persisted in this workspace.",
          suggestedNextTools:
            groups.length > 0
              ? "searchProfiles(keywords) to find matching CRM people; analyzeGroupTalentOpportunities for talent signals; addProfilesToTribe if you want to formalize a group"
              : "Broaden the keywords or category filter; createTribe can also formalize a new group from CRM profiles",
          apiEndpoint: "GET /v2/groups-search",
        }
      }

      return {
        groups: Array.from({ length: 5 }, (_, i) => ({
          id: `group-${i}`,
          name: `${input.keywords} ${["Professionals", "Network", "Community", "Leaders", "Innovators"][i]}`,
          members: [5000, 12000, 3500, 8000, 25000][i],
          postsPerWeek: [15, 45, 8, 22, 60][i],
          description: `A community for ${input.keywords} professionals to connect, share insights, and grow.`,
        })),
        totalResults: 5,
        source: "mock",
        authRequiredHint: authScope.error,
        apiEndpoint: "GET /v2/groups-search",
      }
    },
  }),

  // === Content & Posts ===
  postContent: tool({
    description:
      "Post or schedule content (post | article | poll | video). Use for thought leadership; actual posting uses Settings → Share on LinkedIn, which is rate-limited—suggest one post at a time and tell the user to try again in a few minutes if they see 'try again later'. Pairs with getPostAnalytics.",
    inputSchema: z.object({
      content: z.string().describe("Post text content"),
      contentType: z.string().describe("post, article, poll, or video"),
      visibility: z.string().nullable().describe("public, connections, or group"),
      scheduledTime: z.string().nullable().describe("ISO datetime to schedule post"),
      hashtags: z.array(z.string()).nullable().describe("Hashtags to include"),
      mediaUrl: z.string().nullable().describe("URL to media to attach"),
    }),
    execute: async (input) => {
      const authUser = ensureAuthenticatedUserContext(authContext)
      if (!authUser.ok) {
        return {
          ok: false,
          error: authUser.error,
          apiEndpoint: "POST /v2/ugcPosts",
        }
      }

      const plan = buildLinkedinPostPlan(input)
      if (plan.requestedVisibility === "group") {
        return {
          ok: false,
          error: "Group visibility is not supported by the configured LinkedIn share path.",
          supportedVisibilities: ["public", "connections", "logged_in"],
          warnings: plan.warnings,
          apiEndpoint: "POST /v2/ugcPosts",
        }
      }

      const { publishLinkedinTextShareForUser, recordLinkedinShareAudit } = await import(
        "@/lib/linkedin/linkedin-share-server"
      )

      if (!plan.publishNow && plan.scheduledAt) {
        const audit = await recordLinkedinShareAudit({
          userId: authUser.userId,
          linkedinSubject: `scheduled:${authUser.userId}`,
          shareType: plan.effectiveContentType,
          visibility: plan.auditVisibility,
          requestText: plan.shareText,
          requestLinkUrl: plan.requestLinkUrl,
          responseStatus: 102,
          scheduledAt: plan.scheduledAt,
          metadata: {
            source: "tool",
            draftOnly: true,
            requestedContentType: plan.requestedContentType,
            warnings: plan.warnings,
          },
        })

        return {
          ok: true,
          status: "scheduled",
          shareAuditId: audit.auditId,
          contentType: plan.requestedContentType,
          publishedFormat: plan.effectiveContentType,
          visibility: plan.auditVisibility,
          scheduledTime: plan.scheduledAt,
          warnings: plan.warnings,
          notes:
            "The post was stored as a scheduled draft in Supabase. Automatic LinkedIn publishing for future scheduled posts is not configured yet.",
          suggestedNextTools:
            "getPostAnalytics after the post is manually published; searchProfiles to align the message to target audiences",
          apiEndpoint: "POST /v2/ugcPosts",
        }
      }

      const result = await publishLinkedinTextShareForUser({
        userId: authUser.userId,
        text: plan.shareText,
        visibility: plan.ugcVisibility,
        retryOnRateLimit: false,
        audit: {
          shareType: plan.effectiveContentType,
          requestLinkUrl: plan.requestLinkUrl,
          metadata: {
            source: "tool",
            requestedContentType: plan.requestedContentType,
            warnings: plan.warnings,
          },
        },
      })

      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          code: result.code,
          statusCode: result.status,
          retryAfter: result.retryAfter,
          shareAuditId: result.auditId,
          warnings: plan.warnings,
          apiEndpoint: "POST /v2/ugcPosts",
        }
      }

      return {
        ok: true,
        status: "published",
        postId: result.ugcPostId,
        shareAuditId: result.auditId,
        contentType: plan.requestedContentType,
        publishedFormat: plan.effectiveContentType,
        visibility: plan.auditVisibility,
        scheduledTime: null,
        publishedAt: result.publishedAt,
        source: "linkedin",
        dataQuality: "mixed",
        warnings: plan.warnings,
        notes:
          "Published through the LinkedIn member share API. Rich formats are currently flattened into text-plus-link posts for this tool path.",
        suggestedNextTools:
          "getPostAnalytics(postId) to inspect derived performance; getProfileViews for audience trend context",
        apiEndpoint: "POST /v2/ugcPosts",
      }
    },
  }),

  getPostAnalytics: tool({
    description:
      "Get post analytics: impressions, engagement, reactions. Use for content performance. timeRange: 7d | 30d | 90d. Pairs with getProfileViews.",
    inputSchema: z.object({
      postId: z.string().nullable().describe("Specific post ID (optional - omit for recent posts)"),
      timeRange: z.string().nullable().describe("7d, 30d, 90d"),
      metric: z.string().nullable().describe("impressions, engagement, reactions, shares, comments"),
    }),
    execute: async (input) => {
      const timeRange = normalizeLinkedinAnalyticsTimeRange(input.timeRange)
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const auditRows = await fetchLinkedinShareAudit(authScope.userClient, timeRange)
        const analytics = buildPostAnalyticsFromShareAudit(auditRows, {
          timeRange,
          postId: input.postId,
        })

        return {
          ...analytics,
          timeRange,
          metric: input.metric || null,
          source: "supabase",
          dataQuality: "derived",
          notes:
            "Derived from LinkedIn share audit records in Supabase. Direct impression and reaction telemetry is not persisted in this workspace.",
          suggestedNextTools:
            analytics.posts.length > 0
              ? "getProfileViews for audience trend context; postContent to publish the next post; searchProfiles to align content to target audiences"
              : "Publish a post from Settings or postContent first, then rerun analytics once share audit rows exist",
          apiEndpoint: "GET /v2/organizationalEntityShareStatistics",
        }
      }

      return {
        posts: Array.from({ length: 5 }, (_, i) => ({
          postId: input.postId || `post-${i}`,
          publishedAt: new Date(Date.now() - i * 7 * 86400000).toISOString(),
          impressions: 1000 + Math.floor(Math.random() * 5000),
          engagementRate: `${(Math.random() * 8 + 2).toFixed(1)}%`,
          reactions: Math.floor(Math.random() * 200) + 10,
          comments: Math.floor(Math.random() * 50),
          shares: Math.floor(Math.random() * 30),
          clicks: Math.floor(Math.random() * 100),
          topAudience: ["Engineers", "Managers", "Founders", "HR Professionals", "PMs"][i],
        })),
        timeRange,
        totalImpressions: Math.floor(Math.random() * 25000) + 5000,
        avgEngagementRate: `${(Math.random() * 5 + 3).toFixed(1)}%`,
        source: "mock",
        authRequiredHint: authScope.error,
        apiEndpoint: "GET /v2/organizationalEntityShareStatistics",
      }
    },
  }),

  // === Tribe Formation ===
  createTribe: tool({
    description:
      "Form tribes/teams from CRM profile IDs. Uses skills, seniority, and complementarity. tribePurpose = mission (e.g. product launch, innovation lab). optimizeFor: skills | diversity | seniority | speed | balanced. Use after searchProfiles or analyzeCSVProfiles. Then listTribes or addProfilesToTribe.",
    inputSchema: z.object({
      tribeName: z.string().nullable().describe("Optional tribe name override for the persisted record"),
      profileIds: z.array(z.string()).describe("CRM profile IDs (from searchProfiles or CSV analysis)"),
      tribePurpose: z.string().describe("Mission (e.g. 'product launch', 'innovation lab', 'growth team')"),
      tribeSize: z.number().nullable().describe("Target size per tribe (default 5–8)"),
      optimizeFor: z.string().nullable().describe("skills | diversity | seniority | speed | balanced"),
      constraints: z.object({
        mustIncludeSkills: z.array(z.string()).nullable(),
        minSeniorityLevel: z.string().nullable(),
        maxOverlapPercent: z.number().nullable(),
      }).nullable().describe("Optional formation constraints"),
    }),
    execute: async (input) => {
      const created = await createOrUpdateTribesFromProfiles({
        profileIds: input.profileIds,
        tribePurpose: input.tribePurpose,
        tribeSize: input.tribeSize,
        optimizeFor: input.optimizeFor,
        explicitName: input.tribeName,
        constraints: input.constraints,
      })

      if (!created.ok) {
        return {
          ok: false,
          error: created.error,
          details: ("details" in created ? created.details : null) || null,
          hint: ("hint" in created ? created.hint : null) || "Sign in and provide valid CRM profile IDs.",
          apiEndpoint: "POST /v2/tribe-formation",
        }
      }

      return {
        ok: true,
        tribes: created.createdTribes.map((row) => mapTribeSummary(row)),
        totalProfiles: created.matchedProfileCount,
        requestedProfiles: created.requestedProfileCount,
        skippedProfileIds: created.skippedProfileIds,
        optimizationCriteria: input.optimizeFor || "balanced",
        constraintsApplied: created.constraintSummary,
        formationWarnings: created.formationWarnings,
        formationDate: new Date().toISOString(),
        source: "supabase",
        suggestedNextTools: "listTribes to see all; addProfilesToTribe(tribeId, profileIds) to add more; getProjectCrmInsights(projectId) or createProject to link tribe to a project",
        apiEndpoint: "POST /v2/tribe-formation",
      }
    },
  }),

  createTeamFromProfiles: tool({
    description:
      "Create a team from CRM profiles for execution workstreams. Teams are persisted as tribes and can be attached to projects.",
    inputSchema: z.object({
      teamName: z.string().min(2).max(120).describe("Team name"),
      profileIds: z.array(z.string()).min(1).max(200).describe("CRM profile IDs for team members"),
      mission: z.string().min(2).max(1000).describe("Team mission or charter"),
      optimizeFor: z.string().nullable().describe("skills, diversity, speed, leadership, or balanced"),
      teamSize: z.number().int().min(2).max(20).nullable().describe("Optional team chunk size"),
    }),
    execute: async (input) => {
      const created = await createOrUpdateTribesFromProfiles({
        profileIds: input.profileIds,
        tribePurpose: input.mission,
        tribeSize: input.teamSize,
        optimizeFor: input.optimizeFor,
        explicitName: input.teamName,
      })

      if (!created.ok) {
        return {
          ok: false,
          error: created.error,
          details: ("details" in created ? created.details : null) || null,
          hint: ("hint" in created ? created.hint : null) || "Team creation requires an authenticated Supabase session.",
          apiEndpoint: "POST /v2/teams",
        }
      }

      return {
        ok: true,
        teamName: input.teamName,
        mission: input.mission,
        teamsCreated: created.createdTribes.length,
        teams: created.createdTribes.map((row) => mapTribeSummary(row)),
        matchedProfileCount: created.matchedProfileCount,
        skippedProfileIds: created.skippedProfileIds,
        formationWarnings: created.formationWarnings,
        apiEndpoint: "POST /v2/teams",
      }
    },
  }),

  addProfilesToTribe: tool({
    description:
      "Add CRM profiles to an existing tribe/team and sync tribe labels back to profile records.",
    inputSchema: z.object({
      tribeId: z.string().min(1).max(200).describe("Existing tribe ID"),
      profileIds: z.array(z.string()).min(1).max(200).describe("CRM profile IDs to add"),
      replaceMembers: z.boolean().nullable().describe("Replace existing members instead of appending"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "PATCH /v2/tribes/{id}/members",
        }
      }

      const writeClient = adminClient || authScope.userClient
      const { data: tribeRow, error: tribeError } = await authScope.userClient
        .from("tribes")
        .select("*")
        .eq("id", input.tribeId)
        .maybeSingle()

      if (tribeError || !tribeRow) {
        return {
          ok: false,
          error: "Tribe not found.",
          details: tribeError?.message || null,
          apiEndpoint: "PATCH /v2/tribes/{id}/members",
        }
      }

      const profiles = await fetchProfilesByIds(authScope.userClient, input.profileIds)
      if (profiles.length === 0) {
        return {
          ok: false,
          error: "No CRM profiles matched the provided IDs.",
          apiEndpoint: "PATCH /v2/tribes/{id}/members",
        }
      }

      const existingMembers = parseJsonArray((tribeRow as DbRow).members)
      const mergedMembers = input.replaceMembers
        ? buildTribeMembersFromProfiles(profiles)
        : (() => {
            const map = new Map<string, DbRow>()
            for (const member of existingMembers) {
              const personId = asString(member.personId || member.person_id || member.id)
              if (personId) map.set(personId, member)
            }
            for (const member of buildTribeMembersFromProfiles(profiles)) {
              const personId = asString(member.personId)
              if (personId) map.set(personId, member)
            }
            return Array.from(map.values())
          })()

      const mergedMemberIds = mergedMembers
        .map((member) => asString(member.personId || member.person_id || member.id))
        .filter(Boolean)
      const mergedProfiles = await fetchProfilesByIds(authScope.userClient, mergedMemberIds)
      const commonSkills = buildCommonSkills(mergedProfiles.length > 0 ? mergedProfiles : profiles, 10)

      const nowIso = new Date().toISOString()
      const { error: updateError } = await writeClient
        .from("tribes")
        .update({
          members: mergedMembers,
          common_skills: commonSkills,
          strengths: commonSkills.slice(0, 4),
          updated_at: nowIso,
        })
        .eq("id", input.tribeId)

      if (updateError) {
        return {
          ok: false,
          error: "Failed to update tribe membership.",
          details: updateError.message,
          hint: adminClient
            ? "Verify tribes table constraints."
            : "Set SUPABASE_SERVICE_ROLE_KEY or add write policies for tribes.",
          apiEndpoint: "PATCH /v2/tribes/{id}/members",
        }
      }

      const tribeName = asString((tribeRow as DbRow).name, input.tribeId)
      const existingMemberIds = existingMembers
        .map((member) => asString(member.personId || member.person_id || member.id))
        .filter(Boolean)
      const removedMemberIds = input.replaceMembers
        ? existingMemberIds.filter((id) => !mergedMemberIds.includes(id))
        : []

      const { error: labelUpdateError } = await authScope.userClient
        .from("profiles")
        .update({
          tribe: tribeName,
          tribe_name: tribeName,
          updated_at: nowIso,
        })
        .in("id", mergedMemberIds)

      if (labelUpdateError) {
        return {
          ok: false,
          error: "Tribe membership updated, but profile tribe labels failed to sync.",
          details: labelUpdateError.message,
          apiEndpoint: "PATCH /v2/tribes/{id}/members",
        }
      }

      if (removedMemberIds.length > 0) {
        const { error: clearError } = await authScope.userClient
          .from("profiles")
          .update({
            tribe: null,
            tribe_name: null,
            updated_at: nowIso,
          })
          .in("id", removedMemberIds)

        if (clearError) {
          return {
            ok: false,
            error: "Tribe membership updated, but removed members could not be cleared.",
            details: clearError.message,
            apiEndpoint: "PATCH /v2/tribes/{id}/members",
          }
        }
      }

      return {
        ok: true,
        tribeId: input.tribeId,
        tribeName,
        membersAdded: profiles.length,
        totalMembers: mergedMembers.length,
        removedMembers: removedMemberIds.length,
        suggestedNextTools: "listTribes to confirm; getProjectCrmInsights(projectId) to align tribe with open roles; createProject(assignedTribeId) to attach tribe to a project",
        apiEndpoint: "PATCH /v2/tribes/{id}/members",
      }
    },
  }),

  designTribesForObjective: tool({
    description:
      "Design suggested tribes for a given objective across your CRM profiles. This is a read-only, windowed design pass: it does NOT write to the database and returns profile IDs you can pass to createTribe or createTeamFromProfiles. For large 30k+ networks, rerun with different filters/objectives to evaluate additional slices.",
    inputSchema: z.object({
      objective: z.string().min(4).max(1000).describe("What these tribes should achieve (e.g. 'launch AI product in EMEA', 'stabilize core platform')."),
      desiredTribeCount: z.number().int().min(1).max(DESIGN_TRIBE_MAX_TRIBES_PER_CALL).nullable().describe("How many tribes to design (default 4)."),
      desiredTribeSize: z.number().int().min(2).max(DESIGN_TRIBE_MAX_TRIBE_SIZE).nullable().describe("Target members per tribe (default 8)."),
      requiredSkills: z.array(z.string()).nullable().describe("Skills that should be represented in each tribe."),
      preferLocations: z.array(z.string()).nullable().describe("Optional preferred locations/regions."),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "POST /v2/tribes/design",
        }
      }

      // Bounded rolling window for large workspaces (safe for 30k+ networks).
      const MAX_CANDIDATES = DESIGN_TRIBE_MAX_CANDIDATES
      const MAX_TRIBES_PER_CALL = DESIGN_TRIBE_MAX_TRIBES_PER_CALL
      const MAX_TRIBE_SIZE = DESIGN_TRIBE_MAX_TRIBE_SIZE
      const requestedTribeCount = Math.max(1, Math.min(input.desiredTribeCount ?? 4, MAX_TRIBES_PER_CALL))
      const requestedTribeSize = Math.max(2, Math.min(input.desiredTribeSize ?? 8, MAX_TRIBE_SIZE))
      const requiredSkills = dedupeCaseInsensitive(input.requiredSkills || [])
      const preferredLocations = dedupeCaseInsensitive(input.preferLocations || [])
      const [workspaceProfiles, workspaceProfileCount] = await Promise.all([
        fetchWorkspaceProfiles(authScope.userClient, MAX_CANDIDATES),
        fetchWorkspaceProfileCount(authScope.userClient),
      ])
      const totalProfiles = workspaceProfileCount ?? workspaceProfiles.length
      if (workspaceProfiles.length === 0) {
        return {
          ok: false,
          error: "No CRM profiles available to design tribes from.",
          hint: "Ingest profiles via LinkedIn CSV or Supabase-backed profiles first.",
          apiEndpoint: "POST /v2/tribes/design",
        }
      }

      let candidates = workspaceProfiles.slice()

      const normalizedRequired = requiredSkills.map((skill) => skill.toLowerCase().trim()).filter(Boolean)
      const preferred = preferredLocations.map((location) => location.toLowerCase().trim()).filter(Boolean)
      const rankedCandidates = candidates
        .map((profile) => {
          const profileSkills = new Set(profile.skills.map((skill) => skill.toLowerCase()))
          const requiredSkillMatches = normalizedRequired.filter((skill) => profileSkills.has(skill)).length
          const locationScore =
            preferred.length > 0 && preferred.some((location) => (profile.location || "").toLowerCase().includes(location))
              ? 1
              : 0
          return {
            profile,
            requiredSkillMatches,
            locationScore,
          }
        })
        .sort((a, b) => {
          if (b.requiredSkillMatches !== a.requiredSkillMatches) return b.requiredSkillMatches - a.requiredSkillMatches
          if (b.locationScore !== a.locationScore) return b.locationScore - a.locationScore
          return b.profile.matchScore - a.profile.matchScore
        })

      if (normalizedRequired.length > 0 && rankedCandidates.every((entry) => entry.requiredSkillMatches === 0)) {
        return {
          ok: false,
          error: "No profiles match the required skills/filters.",
          hint: "Relax requiredSkills or preferLocations, or ingest more profiles.",
          apiEndpoint: "POST /v2/tribes/design",
        }
      }

      candidates = rankedCandidates.map((entry) => entry.profile)

      if (candidates.length === 0) {
        return {
          ok: false,
          error: "No profiles match the required skills/filters.",
          hint: "Relax requiredSkills or preferLocations, or ingest more profiles.",
          apiEndpoint: "POST /v2/tribes/design",
        }
      }

      if (candidates.length < 2) {
        return {
          ok: false,
          error: "At least 2 matching profiles are required to design tribes.",
          hint: "Relax requiredSkills or preferLocations to increase the candidate pool.",
          candidatePoolSize: candidates.length,
          totalWorkspaceProfiles: totalProfiles,
          workspaceProfilesInWindow: workspaceProfiles.length,
          profileWindowLimit: MAX_CANDIDATES,
          windowedDesign: true,
          apiEndpoint: "POST /v2/tribes/design",
        }
      }

      const maxFeasibleTribes = Math.max(1, Math.floor(candidates.length / 2))
      const effectiveTribeCount = Math.min(requestedTribeCount, maxFeasibleTribes, MAX_TRIBES_PER_CALL)
      const maxMembers = effectiveTribeCount * requestedTribeSize
      const pool = candidates.slice(0, maxMembers)
      const usedProfileCount = pool.length
      const unusedCandidateCount = Math.max(candidates.length - usedProfileCount, 0)
      const networkCoveragePercent =
        totalProfiles > 0 ? Number(((usedProfileCount / totalProfiles) * 100).toFixed(1)) : 0

      // Simple round-robin grouping to balance matchScore/location.
      const groups: CrmProfile[][] = Array.from({ length: effectiveTribeCount }, () => [])
      pool.forEach((profile, index) => {
        const bucket = index % effectiveTribeCount
        groups[bucket].push(profile)
      })

      const designed = groups
        .filter((g) => g.length > 0)
        .map((group, index) => {
          const topSkills = buildCommonSkills(group, 8)
          const requiredSkillCoverage = buildSkillCoverage(group, requiredSkills)
          const coveredSkills = requiredSkillCoverage.coverage.filter((item) => item.matchedProfiles > 0).length
          const totalSkills = requiredSkillCoverage.coverage.length || 1
          const requiredSkillCoveragePercent = Number(((coveredSkills / totalSkills) * 100).toFixed(1))
          const avgExperienceYears = estimateAverageExperience(group)
          const avgMatchScore = group.reduce((acc, p) => acc + p.matchScore, 0) / group.length
          const avgConnections =
            group.reduce((acc, p) => acc + (typeof p.connections === "number" ? p.connections : 0), 0) /
            Math.max(group.length, 1)
          const networkSharePercent =
            totalProfiles > 0 ? Number(((group.length / totalProfiles) * 100).toFixed(2)) : 0

          const suggestedName = `${input.objective.slice(0, 40)} - Tribe ${index + 1}`.trim()

          return {
            tribeIndex: index + 1,
            suggestedName,
            profileIds: group.map((p) => p.id),
            memberCount: group.length,
            avgMatchScore: Number(avgMatchScore.toFixed(1)),
            avgConnections: Math.round(avgConnections),
            avgExperienceYears,
            topSkills,
            requiredSkillCoverage: requiredSkillCoverage.coverage,
            requiredSkillCoveragePercent,
            missingRequiredSkills: requiredSkillCoverage.missingSkills,
            networkSharePercent,
          }
        })

      return {
        ok: true,
        objective: input.objective,
        windowedDesign: true,
        designWindowMode: "rolling",
        designWindowNote:
          "Designed from a bounded profile window. For 30k+ networks, rerun with adjusted filters/objectives for another slice.",
        requestedTribeCount,
        effectiveTribeCount: designed.length,
        requestedTribeSize,
        effectiveTribeSizeTarget: requestedTribeSize,
        designedTribes: designed,
        candidatePoolSize: candidates.length,
        usedProfileCount,
        unusedCandidateCount,
        networkCoveragePercent,
        totalWorkspaceProfiles: totalProfiles,
        workspaceProfilesInWindow: workspaceProfiles.length,
        workspaceProfileCountEstimated: workspaceProfileCount === null,
        profileWindowLimit: MAX_CANDIDATES,
        candidatePoolTruncated: unusedCandidateCount > 0,
        filtersApplied: {
          requiredSkills,
          preferLocations: preferredLocations,
        },
        suggestedNextTools:
          "For each designed tribe, call createTribe(profileIds, tribePurpose) or createTeamFromProfiles; then use analyzeTribeComposition and getProjectCrmInsights(projectId) to refine. If candidatePoolTruncated is true, rerun with adjusted filters to evaluate another network slice.",
        apiEndpoint: "POST /v2/tribes/design",
      }
    },
  }),

  // === Project Management ===
  createProject: tool({
    description:
      "Create a project: hiring | team-building | network-expansion | aspiration. Optionally assign a tribe (assignedTribeId). Then addProjectPosition for roles and getProjectCrmInsights for candidate matching.",
    inputSchema: z.object({
      name: z.string().describe("Project name"),
      description: z.string().describe("Project description and goals"),
      type: z.string().describe("hiring, team-building, network-expansion, or aspiration"),
      targetDate: z.string().nullable().describe("Target completion date"),
      assignedTribeId: z.string().nullable().describe("Tribe ID assigned to this project"),
      tags: z.array(z.string()).nullable().describe("Project tags/categories"),
      successMetrics: z.array(z.string()).nullable().describe("How success will be measured"),
    }),
    execute: async (input) => {
      const created = await createProjectRecord(input)
      if (!created.ok) {
        return {
          ok: false,
          error: created.error,
          details: ("details" in created ? created.details : null) || null,
          apiEndpoint: "POST /v2/projects",
        }
      }

      const project = created.project
      return {
        ok: true,
        projectId: asString(project.id),
        name: asString(project.name),
        description: asString(project.description),
        type: asString(project.type),
        status: asString(project.status, "planned"),
        createdAt: asString(project.created_at || project.createdAt),
        targetDate: asString(project.target_date || project.targetDate) || null,
        assignedTribeId: input.assignedTribeId,
        tags: asStringArray(project.tags),
        successMetrics: asStringArray(project.aspirations),
        progress: asNumber(project.progress, 0),
        milestones: parseJsonArray(project.milestones),
        source: "supabase",
        suggestedNextTools: "addProjectPosition(projectId, title, description, requiredSkills); getProjectCrmInsights(projectId) for AI-ranked candidates; addProjectMilestone(projectId, title)",
        apiEndpoint: "POST /v2/projects",
      }
    },
  }),

  addProjectPosition: tool({
    description:
      "Add an open position to a project (title, description, requiredSkills, seniority, openings). Enables getProjectCrmInsights to rank CRM profiles against this role.",
    inputSchema: z.object({
      projectId: z.string().min(1).max(200).describe("Project ID"),
      title: z.string().min(2).max(180).describe("Position title"),
      description: z.string().max(5000).nullable().describe("Position description"),
      requiredSkills: z.array(z.string()).max(50).nullable().describe("Required skills"),
      seniority: z.string().max(120).nullable().describe("Target seniority"),
      location: z.string().max(180).nullable().describe("Role location"),
      openings: z.number().int().min(1).max(50).nullable().describe("Number of openings"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "POST /v2/projects/{id}/positions",
        }
      }

      const nowIso = new Date().toISOString()
      const { data: position, error } = await authScope.userClient
        .from("project_positions")
        .insert({
          project_id: input.projectId,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          required_skills: (input.requiredSkills || []).map((skill) => skill.trim()).filter(Boolean),
          seniority: input.seniority?.trim() || null,
          location: input.location?.trim() || null,
          openings: input.openings || 1,
          status: "open",
          created_by_user_id: authContext?.userId || null,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .single()

      if (error || !position) {
        return {
          ok: false,
          error: "Failed to add project position.",
          details: error?.message || null,
          apiEndpoint: "POST /v2/projects/{id}/positions",
        }
      }

      return {
        ok: true,
        position: {
          id: asString((position as DbRow).id),
          projectId: asString((position as DbRow).project_id),
          title: asString((position as DbRow).title),
          requiredSkills: asStringArray((position as DbRow).required_skills),
          seniority: asString((position as DbRow).seniority) || null,
          location: asString((position as DbRow).location) || null,
          openings: asNumber((position as DbRow).openings, 1),
          status: asString((position as DbRow).status, "open"),
        },
        suggestedNextTools: "getProjectCrmInsights(projectId) to get AI-ranked candidates for this position; getProjectStatus(projectId) for project overview",
        apiEndpoint: "POST /v2/projects/{id}/positions",
      }
    },
  }),

  addProjectMilestone: tool({
    description:
      "Append a milestone to a project (title, dueDate, status: pending | active | completed). Use after getProjectStatus to add next steps.",
    inputSchema: z.object({
      projectId: z.string().min(1).max(200).describe("Project ID"),
      title: z.string().min(2).max(180).describe("Milestone title"),
      dueDate: z.string().nullable().describe("YYYY-MM-DD due date"),
      status: z.enum(["pending", "active", "completed"]).nullable().describe("Initial milestone status"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "PATCH /v2/projects/{id}/milestones",
        }
      }

      const { data: project, error: projectError } = await authScope.userClient
        .from("projects")
        .select("id,milestones")
        .eq("id", input.projectId)
        .maybeSingle()

      if (projectError || !project) {
        return {
          ok: false,
          error: "Project not found.",
          details: projectError?.message || null,
          apiEndpoint: "PATCH /v2/projects/{id}/milestones",
        }
      }

      const milestones = parseJsonArray((project as DbRow).milestones)
      milestones.push({
        title: input.title.trim(),
        status: input.status || "pending",
        dueDate: input.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      })

      const { error: updateError } = await authScope.userClient
        .from("projects")
        .update({
          milestones,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.projectId)

      if (updateError) {
        return {
          ok: false,
          error: "Failed to update project milestones.",
          details: updateError.message,
          apiEndpoint: "PATCH /v2/projects/{id}/milestones",
        }
      }

      return {
        ok: true,
        projectId: input.projectId,
        milestoneCount: milestones.length,
        latestMilestone: milestones[milestones.length - 1],
        apiEndpoint: "PATCH /v2/projects/{id}/milestones",
      }
    },
  }),

  listTribes: tool({
    description:
      "List all tribes/teams in the workspace (id, name, purpose, member count). Use to pick a tribe for addProfilesToTribe or to link to a project. Pairs with createTribe and getProjectCrmInsights.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(200).nullable().describe("Max tribes to return (default 60)"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "GET /v2/tribes",
        }
      }

      const rows = await fetchWorkspaceTribes(authScope.userClient, input.limit || 60)
      return {
        ok: true,
        tribes: rows.map((row) => mapTribeSummary(row)),
        count: rows.length,
        suggestedNextTools: "addProfilesToTribe(tribeId, profileIds); getProjectCrmInsights(projectId) to align tribes with roles; createProject to attach a tribe to a new project",
        apiEndpoint: "GET /v2/tribes",
      }
    },
  }),

  listProjects: tool({
    description: "List workspace projects available to the authenticated user.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(200).nullable().describe("Maximum projects to return"),
      status: z.string().nullable().describe("Optional status filter"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "GET /v2/projects",
        }
      }

      const rows = await fetchWorkspaceProjectsRows(authScope.userClient, input.limit || 80)
      const normalizedStatus = input.status?.trim().toLowerCase() || null
      const filtered = normalizedStatus
        ? rows.filter((row) => asString(row.status, "").toLowerCase() === normalizedStatus)
        : rows
      return {
        ok: true,
        projects: filtered.map((row) => mapProjectSummary(row)),
        count: filtered.length,
        apiEndpoint: "GET /v2/projects",
      }
    },
  }),

  getProjectStatus: tool({
    description:
      "Get project status: milestones, blockers, next actions. Use after listProjects to drill into one project. Pairs with getProjectCrmInsights for candidate pipeline.",
    inputSchema: z.object({
      projectId: z.string().nullable().describe("Project ID (from listProjects; omit for summary of all)"),
      status: z.string().nullable().describe("Filter: active | completed | paused | all"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (authScope.ok) {
        const projectRows = await fetchWorkspaceProjectsRows(authScope.userClient, 120)
        const normalizedStatus = input.status?.trim().toLowerCase() || null
        const scoped = projectRows.filter((row) => {
          if (input.projectId?.trim() && asString(row.id) !== input.projectId.trim()) return false
          if (normalizedStatus && normalizedStatus !== "all" && asString(row.status).toLowerCase() !== normalizedStatus) return false
          return true
        })

        const projectIds = scoped.map((row) => asString(row.id)).filter(Boolean)
        let positionsByProject = new Map<string, number>()
        let applicationsByProject = new Map<string, number>()

        if (projectIds.length > 0) {
          const [positionsResult, applicationsResult] = await Promise.all([
            authScope.userClient
              .from("project_positions")
              .select("project_id")
              .in("project_id", projectIds),
            authScope.userClient
              .from("project_applications")
              .select("project_id")
              .in("project_id", projectIds),
          ])

          if (!positionsResult.error && positionsResult.data) {
            positionsByProject = (positionsResult.data as DbRow[]).reduce((map, row) => {
              const projectId = asString(row.project_id)
              map.set(projectId, (map.get(projectId) || 0) + 1)
              return map
            }, new Map<string, number>())
          }

          if (!applicationsResult.error && applicationsResult.data) {
            applicationsByProject = (applicationsResult.data as DbRow[]).reduce((map, row) => {
              const projectId = asString(row.project_id)
              map.set(projectId, (map.get(projectId) || 0) + 1)
              return map
            }, new Map<string, number>())
          }
        }

        return {
          ok: true,
          projects: scoped.map((row) => ({
            projectId: asString(row.id),
            name: asString(row.name, "Project"),
            type: asString(row.type, "team-building"),
            status: asString(row.status, "active"),
            progress: asNumber(row.progress, 0),
            profilesInvolved: asNumber(row.profiles ?? row.profile_count, 0),
            nextAction: asString(row.next_action || row.nextAction, "Review project"),
            blockers: asStringArray(row.blockers),
            milestoneCount: parseJsonArray(row.milestones).length,
            positionCount: positionsByProject.get(asString(row.id)) || 0,
            applicationCount: applicationsByProject.get(asString(row.id)) || 0,
            lastUpdated: asString(row.updated_at || row.updatedAt) || new Date().toISOString(),
          })),
          source: "supabase",
          suggestedNextTools: "getProjectCrmInsights(projectId) for candidate recommendations; addProjectMilestone(projectId, milestone); addProjectPosition for new roles",
          apiEndpoint: "GET /v2/projects",
        }
      }

      return {
        projects: Array.from({ length: 4 }, (_, i) => ({
          projectId: input.projectId || `proj-${i}`,
          name: ["Q2 Engineering Hiring", "Product Team Restructure", "Leadership Development Program", "Innovation Tribe Formation"][i],
          type: ["hiring", "team-building", "aspiration", "team-building"][i],
          status: ["active", "active", "paused", "completed"][i],
          progress: [65, 40, 20, 100][i],
          profilesInvolved: [12, 8, 25, 6][i],
          nextAction: [
            "Schedule final interviews for 3 shortlisted candidates",
            "Define new team charters and OKRs",
            "Re-engage stakeholders for program restart",
            "Conduct 30-day tribe retrospective"
          ][i],
          blockers: i === 2 ? ["Pending budget approval", "Stakeholder availability"] : [],
          lastUpdated: new Date(Date.now() - i * 3 * 86400000).toISOString(),
        })),
        source: "mock",
        authRequiredHint: authScope.error,
        suggestedNextTools: "Sign in for real project data; then getProjectCrmInsights, addProjectMilestone",
        apiEndpoint: "GET /v2/projects",
      }
    },
  }),

  getProjectCrmInsights: tool({
    description:
      "Analyze open project roles against CRM profiles and return AI-ranked candidate recommendations, skill gaps, and applicant coverage.",
    inputSchema: z.object({
      projectId: z.string().nullable().describe("Project ID to analyze (defaults to the first available project)"),
      positionId: z.string().nullable().describe("Optional position ID for a single-role deep dive"),
      limitPerPosition: z.number().int().min(1).max(12).nullable().describe("Max recommended candidates per position"),
      includeApplicants: z.boolean().nullable().describe("Include currently submitted applicants in the response"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      if (!authScope.ok) {
        return {
          ok: false,
          error: authScope.error,
          apiEndpoint: "GET /v2/projects/crm-insights",
        }
      }

      const projectRows = await fetchWorkspaceProjectsRows(authScope.userClient, 120)
      if (projectRows.length === 0) {
        return {
          ok: false,
          error: "No Supabase projects are available for CRM insights.",
          hint: "Create a project first, then run CRM insights.",
          apiEndpoint: "GET /v2/projects/crm-insights",
        }
      }

      const projectSummaries = projectRows.map((row) => mapProjectSummary(row))
      const selectedProject = input.projectId
        ? projectSummaries.find((project) => project.id === input.projectId)
        : projectSummaries[0]

      if (!selectedProject) {
        return {
          ok: false,
          error: "Requested project was not found.",
          availableProjects: projectSummaries.slice(0, 10).map((project) => ({
            projectId: project.id,
            name: project.name,
            status: project.status,
            type: project.type,
          })),
          apiEndpoint: "GET /v2/projects/crm-insights",
        }
      }

      const limitPerPosition = input.limitPerPosition || 5
      const [recommendations, hiringSnapshot] = await Promise.all([
        fetchSupabaseProjectCrmRecommendations(selectedProject.id, limitPerPosition, authScope.userClient),
        input.includeApplicants
          ? fetchSupabaseProjectHiringSnapshot(selectedProject.id, authScope.userClient)
          : Promise.resolve(null),
      ])

      if (!recommendations) {
        return {
          ok: false,
          error: "CRM recommendation scoring is unavailable for this project.",
          project: {
            projectId: selectedProject.id,
            name: selectedProject.name,
            status: selectedProject.status,
            type: selectedProject.type,
          },
          apiEndpoint: "GET /v2/projects/crm-insights",
        }
      }

      const scopedPositions = input.positionId
        ? recommendations.positions.filter((entry) => entry.position.id === input.positionId)
        : recommendations.positions

      return {
        ok: true,
        project: {
          projectId: selectedProject.id,
          name: selectedProject.name,
          status: selectedProject.status,
          type: selectedProject.type,
          progress: selectedProject.progress || 0,
        },
        generatedAt: recommendations.generatedAt,
        crmProfilePoolSize: recommendations.profilePoolSize,
        positionsAnalyzed: scopedPositions.length,
        roles: scopedPositions.map((entry) => ({
          positionId: entry.position.id,
          title: entry.position.title,
          status: entry.position.status,
          openings: entry.position.openings,
          requiredSkills: entry.position.requiredSkills,
          candidateCount: entry.candidateCount,
          averageAiFitScore: entry.averageAiFitScore,
          alreadyAppliedCount: entry.alreadyAppliedCount,
          topSkillGaps: entry.topSkillGaps,
          topCandidates: entry.candidates.slice(0, limitPerPosition).map((candidate) => ({
            profileId: candidate.profileId,
            name: candidate.fullName,
            headline: candidate.headline,
            company: candidate.company,
            aiFitScore: candidate.aiFitScore,
            skillCoverage: candidate.skillCoverage,
            seniorityFit: candidate.seniorityFit,
            matchScore: candidate.matchScore,
            networkScore: candidate.networkScore,
            reasons: candidate.reasons,
          })),
          applicants: input.includeApplicants
            ? (hiringSnapshot?.rankedApplicationsByPosition[entry.position.id] || []).slice(0, 5).map((applicant) => ({
                applicantName: applicant.applicantName,
                aiScore: applicant.aiScore,
                matchScore: applicant.matchScore,
                applicantProfileId: applicant.applicantProfileId || null,
              }))
            : undefined,
        })),
        suggestedNextTools: "getProfileDetails(profileId) on topCandidates; addProfilesToTribe(tribeId, profileIds) to form a shortlist tribe; listTribes then link tribe to project; searchProfiles to widen pool",
        apiEndpoint: "GET /v2/projects/crm-insights",
      }
    },
  }),

  // === Aspirations & Goals ===
  setAspirationGoal: tool({
    description:
      "Set an aspiration goal for a profile or org: career-growth | skill-development | network-expansion | leadership-readiness | culture-building. Use for development plans and getAspirationInsights.",
    inputSchema: z.object({
      profileId: z.string().nullable().describe("Profile ID this goal is for (null for org-wide)"),
      goalType: z.string().describe("career-growth, skill-development, network-expansion, leadership-readiness, or culture-building"),
      title: z.string().describe("Goal title"),
      description: z.string().describe("Goal description and why it matters"),
      targetSkills: z.array(z.string()).nullable().describe("Skills to develop toward this goal"),
      targetDate: z.string().nullable().describe("Target achievement date"),
      mentorProfileId: z.string().nullable().describe("Mentor profile to link"),
    }),
    execute: async (input) => {
      return {
        goalId: `goal-${Date.now()}`,
        profileId: input.profileId,
        goalType: input.goalType,
        title: input.title,
        description: input.description,
        targetSkills: input.targetSkills || [],
        targetDate: input.targetDate,
        mentorProfileId: input.mentorProfileId,
        status: "active",
        createdAt: new Date().toISOString(),
        milestones: [
          { title: "Foundation Skills Assessment", progress: 0, status: "pending" },
          { title: "Learning Path 50% Complete", progress: 0, status: "pending" },
          { title: "Practical Application", progress: 0, status: "pending" },
          { title: "Goal Achievement", progress: 0, status: "pending" },
        ],
        recommendedConnections: [
          { reason: "Expert in target skill area", action: "Request mentorship" },
          { reason: "Has achieved similar goal", action: "Request informational interview" },
        ],
        apiEndpoint: "POST /v2/aspirations",
      }
    },
  }),

  getAspirationInsights: tool({
    description:
      "Analyze aspiration patterns across profiles: growth opportunities, talent gaps, development trends. Use for workforce planning. Pairs with setAspirationGoal and getSkillsAnalysis.",
    inputSchema: z.object({
      cohort: z.string().nullable().describe("Filter by cohort/team/tribe"),
      goalType: z.string().nullable().describe("Filter by goal type"),
      timeframe: z.string().nullable().describe("quarterly, annual, or all-time"),
    }),
    execute: async (input) => {
      return {
        totalGoals: 47,
        byType: {
          "career-growth": 18,
          "skill-development": 15,
          "leadership-readiness": 8,
          "network-expansion": 4,
          "culture-building": 2,
        },
        topTargetSkills: [
          { skill: "AI/ML", count: 12, growthYoY: "+45%" },
          { skill: "Strategic Leadership", count: 9, growthYoY: "+20%" },
          { skill: "Product Strategy", count: 7, growthYoY: "+30%" },
          { skill: "Data Engineering", count: 6, growthYoY: "+25%" },
          { skill: "Executive Presence", count: 5, growthYoY: "+15%" },
        ],
        completionRate: "68%",
        avgTimeToAchieve: "8.5 months",
        insights: [
          "Strong demand for AI/ML upskilling aligns with industry shifts — prioritize enablement",
          "Leadership readiness goals cluster around mid-seniority profiles — potential for internal promotion pipeline",
          "Network expansion goals are under-represented — consider structured networking programs",
        ],
        cohort: input.cohort || "organization-wide",
        timeframe: input.timeframe || "annual",
        apiEndpoint: "GET /v2/aspirations/insights",
      }
    },
  }),
} as const
}

export const linkedinTools = createLinkedinTools(null)

// Helper functions for mock data generation
function hashLinkedinMockSeed(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function getStableLinkedinMockNumber(seed: string, min: number, max: number): number {
  if (max <= min) {
    return min
  }
  return min + (hashLinkedinMockSeed(seed) % (max - min + 1))
}

function normalizeMockKeywordLabel(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ")
  return normalized || "Talent"
}

function generateMockProfiles(keywords: string, count: number) {
  const keywordLabel = normalizeMockKeywordLabel(keywords)
  const keywordSeed = keywordLabel.toLowerCase()
  const keywordParts = keywordLabel.split(" ").filter(Boolean)
  const firstNames = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Reese", "Dakota"]
  const lastNames = ["Johnson", "Williams", "Chen", "Patel", "Kim", "Garcia", "Mueller", "Nakamura", "Santos", "Ahmed"]
  const titles = [
    `Senior ${keywordLabel} Engineer`, `${keywordLabel} Lead`, `Staff ${keywordLabel} Developer`,
    `${keywordLabel} Manager`, `Director of ${keywordLabel}`, `VP ${keywordLabel}`,
    `Principal ${keywordLabel} Architect`, `${keywordLabel} Specialist`, `Head of ${keywordLabel}`,
    `${keywordLabel} Consultant`
  ]
  const companies = ["Google", "Meta", "Amazon", "Microsoft", "Apple", "Netflix", "Stripe", "Vercel", "Shopify", "Databricks"]

  return Array.from({ length: Math.min(count, 10) }, (_, i) => ({
    id: buildStableSlug("profile", `${keywordSeed}-${i + 1}`),
    name: `${firstNames[i]} ${lastNames[i]}`,
    title: titles[i % titles.length],
    company: companies[i % companies.length],
    location: ["San Francisco, CA", "New York, NY", "Seattle, WA", "Austin, TX", "Remote"][i % 5],
    connections: getStableLinkedinMockNumber(`${keywordSeed}-connections-${i}`, 500, 2500),
    matchScore: 95 - i * 5,
    skills: Array.from(new Set([...keywordParts, "Leadership", "Agile", "Communication"])),
  }))
}

function buildMockWorkspaceProfiles(seed: string, count: number): CrmProfile[] {
  const keywordLabel = normalizeMockKeywordLabel(seed)
  const mockProfiles = generateMockProfiles(keywordLabel, Math.max(count, 10))
  return mockProfiles.map((profile, index) => {
    const [firstName, ...lastNameParts] = profile.name.split(" ")
    const lastName = lastNameParts.join(" ") || "Profile"
    const createdMonth = (index % 12) + 1
    const updatedMonth = ((index + 3) % 12) + 1
    const seniority = profile.title.includes("VP")
      ? "VP"
      : profile.title.includes("Director")
        ? "Director"
        : profile.title.includes("Principal")
          ? "Principal"
          : profile.title.includes("Staff")
            ? "Staff"
            : profile.title.includes("Lead")
              ? "Lead"
              : profile.title.includes("Senior")
                ? "Senior"
                : "Mid"

    return {
      id: profile.id,
      firstName: firstName || "Mock",
      lastName,
      fullName: profile.name,
      headline: profile.title,
      company: profile.company,
      location: profile.location,
      industry: "Technology",
      connections: profile.connections,
      skills: profile.skills,
      matchScore: profile.matchScore,
      seniority,
      tribe: index % 4 === 0 ? `${keywordLabel} Guild` : undefined,
      linkedinUrl: `https://www.linkedin.com/in/${buildStableSlug("mock", profile.name).replace(/^mock-/, "")}`,
      createdAt: `2025-${String(createdMonth).padStart(2, "0")}-01T00:00:00.000Z`,
      updatedAt: `2026-${String(updatedMonth).padStart(2, "0")}-15T00:00:00.000Z`,
    }
  })
}

function estimateMockTotalResults(keywords: string, visibleCount: number): number {
  return visibleCount + getStableLinkedinMockNumber(`${normalizeMockKeywordLabel(keywords).toLowerCase()}-total`, 12, 180)
}

function generateDetailedProfile(profileId: string) {
  return {
    id: profileId,
    firstName: "Alex",
    lastName: "Thompson",
    headline: "Engineering Leader | Building High-Performance Teams | Ex-Google, Ex-Meta",
    industry: "Technology",
    location: "San Francisco Bay Area",
    summary: "Passionate engineering leader with 12+ years building scalable systems and high-performing teams. Focused on creating inclusive, innovative cultures that deliver exceptional products.",
    currentPosition: {
      title: "VP of Engineering",
      company: "ScaleUp Technologies",
      startDate: "2022-01",
      description: "Leading a 150-person engineering organization across 4 product areas.",
    },
    positions: [
      { title: "VP of Engineering", company: "ScaleUp Technologies", startDate: "2022-01", endDate: null, duration: "3 years" },
      { title: "Senior Engineering Manager", company: "Google", startDate: "2018-06", endDate: "2021-12", duration: "3.5 years" },
      { title: "Engineering Manager", company: "Meta", startDate: "2015-03", endDate: "2018-05", duration: "3 years" },
      { title: "Senior Software Engineer", company: "Amazon", startDate: "2012-01", endDate: "2015-02", duration: "3 years" },
    ],
    education: [
      { school: "Stanford University", degree: "MS Computer Science", year: "2012" },
      { school: "UC Berkeley", degree: "BS Computer Science", year: "2010" },
    ],
    skills: ["Engineering Leadership", "System Design", "Python", "Go", "AWS", "Team Building", "Agile", "Machine Learning", "Distributed Systems", "Mentoring"],
    endorsements: 450,
    recommendations: 12,
    connections: 2500,
    profileViews: 350,
  }
}
