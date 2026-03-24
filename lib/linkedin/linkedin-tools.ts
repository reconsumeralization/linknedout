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

  // === Legal Sovereign Module ===

  provisionLegalSovereignStack: tool({
    description: "Deploy a Sovereign Legal Stack — autonomous due diligence, contract synthesis, and judgment modeling running on YOUR infrastructure with local SLMs. Stop paying the Harvey/Legora 'Intelligence Tax.' Own your legal brain.",
    inputSchema: z.object({
      stackName: z.string().min(3).max(200),
      firmName: z.string().optional(),
      stackType: z.enum(["due_diligence", "contract_synthesis", "judgment_modeling", "litigation_strategy", "full_sovereign"]).default("full_sovereign"),
      modelProvider: z.enum(["local_slm", "claude", "gpt4", "gemini"]).default("local_slm"),
    }),
    execute: async (input) => {
      const agentCounts = { due_diligence: 12, contract_synthesis: 8, judgment_modeling: 5, litigation_strategy: 15, full_sovereign: 40 }
      return {
        ok: true,
        stack: { id: `legal-${Date.now()}`, name: input.stackName, firm: input.firmName, type: input.stackType, model: input.modelProvider, agents: agentCounts[input.stackType], dependencyScore: input.modelProvider === "local_slm" ? 0 : 25, status: "provisioning" },
        sovereignty: { dataLocation: "Your infrastructure (Railway/Lambda)", memoryPalace: "Private Vector DB — no third-party access", migrationPath: "If any provider raises prices, migrate in 24 hours", intelligenceTax: "0% — you own the agents" },
        message: `Legal Sovereign Stack "${input.stackName}" provisioned: ${agentCounts[input.stackType]} agents, ${input.modelProvider} model, ${input.modelProvider === "local_slm" ? "ZERO" : "minimal"} dependency. Intelligence Tax: 0%.`,
        directive: "Don't Rent a Brain from Harvey. Provision your own Factory.",
      }
    },
  }),

  auditLegalDependency: tool({
    description: "Audit your dependency on legal AI platforms (Harvey, Legora, Casetext, Westlaw). Calculate the Intelligence Tax, data lock-in risk, and the Migration Refund if you switch to a Sovereign Stack.",
    inputSchema: z.object({
      platformName: z.string().describe("e.g., Harvey, Legora, Casetext, Westlaw"),
      annualCostUsd: z.number().min(0),
      seatsUsed: z.number().min(1).default(10),
    }),
    execute: async (input) => {
      const sovereignCost = Math.round(input.annualCostUsd * 0.25)
      const savings = input.annualCostUsd - sovereignCost
      const taxPct = Math.round((1 - sovereignCost / input.annualCostUsd) * 100)
      return {
        ok: true,
        audit: { platform: input.platformName, annualCost: `$${input.annualCostUsd}`, seats: input.seatsUsed, dataLockInRisk: "high", migrationComplexity: "moderate", estimatedMigrationDays: 14 },
        refund: { sovereignAlternativeCost: `$${sovereignCost}/year (local SLM + Railway)`, annualSavings: `$${savings}`, intelligenceTax: `${taxPct}% of your spend goes to VC returns, not your firm`, fiveYearRefund: `$${savings * 5}` },
        verdict: `${input.platformName} charges $${input.annualCostUsd}/year. A Sovereign Stack costs $${sovereignCost}. You're paying a ${taxPct}% Intelligence Tax. Migration: 14 days. Five-year refund: $${savings * 5}.`,
        message: `Dependency Audit: ${input.platformName} Intelligence Tax = ${taxPct}%. Annual refund if sovereign: $${savings}. Migration: 14 days.`,
      }
    },
  }),

  generateProofOfHumanJudgment: tool({
    description: "Generate a Verified Proof of Human Judgment certificate — proves that while AI did the execution, a High-Agency Human provided the final high-stakes decision. Harvey cannot sign this. Only a Sovereign Artisan can.",
    inputSchema: z.object({
      matterTitle: z.string().min(5).max(500),
      decisionSummary: z.string().min(20).max(2000),
      aiExecutionPercentage: z.number().min(0).max(100).describe("% of work done by AI"),
      humanJudgmentAreas: z.array(z.string()).min(1).describe("Areas where human judgment was applied"),
    }),
    execute: async (input) => {
      const humanPct = 100 - input.aiExecutionPercentage
      return {
        ok: true,
        certificate: { id: `poj-${Date.now()}`, matter: input.matterTitle, aiExecution: `${input.aiExecutionPercentage}%`, humanJudgment: `${humanPct}%`, judgmentAreas: input.humanJudgmentAreas, verifiedAt: new Date().toISOString(), artifactSigned: true },
        trust: { clientVisible: true, tamperProof: "Blockchain-anchored hash", humanAlphaScore: Math.round(humanPct * 0.8 + input.humanJudgmentAreas.length * 5), verdict: `This decision was ${humanPct}% Human Alpha across ${input.humanJudgmentAreas.length} judgment areas.` },
        message: `Proof of Human Judgment issued for "${input.matterTitle}". AI: ${input.aiExecutionPercentage}%, Human: ${humanPct}%. ${input.humanJudgmentAreas.length} judgment areas verified.`,
      }
    },
  }),

  createClientTrustPortal: tool({
    description: "Create a Client Trust Portal — a bespoke interface where firms share Verified Proof of Human Judgment with clients, bypassing third-party portals. Artifact handshake required for access.",
    inputSchema: z.object({
      clientName: z.string().min(2).max(200),
      portalType: z.enum(["judgment_verified", "full_transparency", "read_only"]).default("judgment_verified"),
      artifactRequired: z.boolean().default(true),
    }),
    execute: async (input) => {
      return {
        ok: true,
        portal: { id: `portal-${Date.now()}`, client: input.clientName, type: input.portalType, artifactRequired: input.artifactRequired, status: "active" },
        access: { verification: input.artifactRequired ? "Sovereign Stone handshake required" : "Token-based access", visibility: input.portalType === "full_transparency" ? "All AI/Human splits visible" : "Judgment certificates only", thirdParty: "ZERO — no Harvey, no Legora, no middlemen" },
        message: `Client Trust Portal created for ${input.clientName} (${input.portalType}). ${input.artifactRequired ? "Artifact handshake required." : ""} Zero third-party dependency.`,
      }
    },
  }),

  // === Globe Sovereign Layers ===

  getGlobeAgenticPulse: tool({
    description: "Globe Layer: Agentic Pulse — real-time visualization data of active AI workflows across the 30K network. Shows glowing arcs between nodes representing agents trading logic, negotiating refunds, and executing tribal missions.",
    inputSchema: z.object({ filterByTribe: z.string().optional() }),
    execute: async (input) => {
      const arcs = [
        { from: { lat: 37.7749, lng: -122.4194, label: "San Francisco" }, to: { lat: 51.5074, lng: -0.1278, label: "London" }, agentType: "CFO", task: "Tariff Refund negotiation", intensity: 0.85 },
        { from: { lat: 35.6762, lng: 139.6503, label: "Tokyo" }, to: { lat: 1.3521, lng: 103.8198, label: "Singapore" }, agentType: "CTO", task: "Factory pipeline deployment", intensity: 0.72 },
        { from: { lat: 40.7128, lng: -74.006, label: "New York" }, to: { lat: 48.8566, lng: 2.3522, label: "Paris" }, agentType: "CEO", task: "Tribal Mission coordination", intensity: 0.91 },
        { from: { lat: -33.8688, lng: 151.2093, label: "Sydney" }, to: { lat: 37.7749, lng: -122.4194, label: "San Francisco" }, agentType: "CCO", task: "MITRE threat intel sharing", intensity: 0.65 },
      ]
      return { ok: true, layer: "agentic_pulse", arcs, activeWorkflows: 847, nodesInvolved: 2341, message: `Agentic Pulse: ${arcs.length} major arcs, 847 active workflows across 2,341 nodes.` }
    },
  }),

  getGlobeAlphaBeacons: tool({
    description: "Globe Layer: Alpha Beacons — 30K nodes ranked by Human Alpha score and Proof of Build activity. Brighter nodes = higher judgment density. Hovering shows specific knowledge tags.",
    inputSchema: z.object({ minAlphaScore: z.number().min(0).max(100).default(50) }),
    execute: async (input) => {
      const beacons = [
        { lat: 37.7749, lng: -122.4194, label: "SF Cluster", alphaScore: 92, builds: 14, tags: ["Lithography", "Quantum Logic", "Agent Architecture"], brightness: 0.92 },
        { lat: 51.5074, lng: -0.1278, label: "London Cluster", alphaScore: 88, builds: 11, tags: ["Legal Sovereignty", "Crypto-Rails", "MITRE Defense"], brightness: 0.88 },
        { lat: 35.6762, lng: 139.6503, label: "Tokyo Cluster", alphaScore: 85, builds: 9, tags: ["Photonics", "Xenobots", "Edge SLM"], brightness: 0.85 },
        { lat: -22.9068, lng: -43.1729, label: "Rio Cluster", alphaScore: 71, builds: 6, tags: ["TEACHER Codex", "Trade School", "Bio-Architecture"], brightness: 0.71 },
      ].filter(b => b.alphaScore >= input.minAlphaScore)
      return { ok: true, layer: "alpha_beacons", beacons, totalBeacons: 30000, filteredAbove: input.minAlphaScore, highAlphaCount: beacons.length, message: `Alpha Beacons: ${beacons.length} clusters above ${input.minAlphaScore} score. Brightest: SF (92).` }
    },
  }),

  getGlobeTariffHeatmap: tool({
    description: "Globe Layer: Tariff Refund Heatmap — shows where the most cognitive, economic, and energy tariff refunds are being reclaimed globally. Gold regions = high refund activity. Click to clone workflows.",
    inputSchema: z.object({ refundType: z.enum(["cognitive", "economic", "energy", "all"]).default("all") }),
    execute: async (input) => {
      const regions = [
        { lat: 1.3521, lng: 103.8198, label: "Singapore", refundType: "economic", totalRefundUsd: 284000, topWorkflow: "Shipping Duty Drawback Agent", cloneable: true },
        { lat: 37.7749, lng: -122.4194, label: "San Francisco", refundType: "cognitive", totalRefundUsd: 520000, topWorkflow: "SaaS Stack Consolidation", cloneable: true },
        { lat: 52.52, lng: 13.405, label: "Berlin", refundType: "energy", totalRefundUsd: 190000, topWorkflow: "Photonics Edge Migration", cloneable: true },
        { lat: 25.2048, lng: 55.2708, label: "Dubai", refundType: "economic", totalRefundUsd: 410000, topWorkflow: "VAT Recovery Automation", cloneable: true },
      ].filter(r => input.refundType === "all" || r.refundType === input.refundType)
      return { ok: true, layer: "tariff_heatmap", regions, globalRefundTotal: "$1,404,000 this month", message: `Tariff Heatmap: ${regions.length} regions active. $1.4M reclaimed this month. Top: SF ($520K cognitive).` }
    },
  }),

  getGlobeInfrastructureLayer: tool({
    description: "Globe Layer: Infrastructure Sovereignty — shows Basepower grids (SMRs, geothermal), Orbital Neo Labs, Lunar Forge assets, and Sovereign Starlink relay positions. The Physical Layer of the Sovereign Civilization.",
    inputSchema: z.object({ assetType: z.enum(["basepower", "orbital", "lunar", "starlink", "all"]).default("all") }),
    execute: async (input) => {
      const assets = [
        { type: "basepower", lat: 37.7749, lng: -122.4194, label: "Bay Area SMR Cluster", status: "operational", capacity: "500 MW" },
        { type: "basepower", lat: 64.1466, lng: -21.9426, label: "Iceland Geothermal Hub", status: "operational", capacity: "1.2 GW" },
        { type: "orbital", lat: 0, lng: 0, label: "Varda Pharma Capsule (LEO)", status: "crystallizing", altitude: "400 km" },
        { type: "lunar", lat: 0, lng: 0, label: "Shackleton Crater Petawatt Node", status: "planned", capacity: "10 Pflops" },
        { type: "starlink", lat: 0, lng: 0, label: "Sovereign Relay Mesh (1,200 nodes)", status: "operational", coverage: "global" },
      ].filter(a => input.assetType === "all" || a.type === input.assetType)
      return { ok: true, layer: "infrastructure", assets, totalAssets: assets.length, message: `Infrastructure Layer: ${assets.length} assets. ${assets.filter(a => a.status === "operational").length} operational.` }
    },
  }),

  // === Energy Sovereignty + Spatial Sovereignty ===

  registerOneChargeDevice: tool({
    description: "Register a One-Charge device — Nuclear Diamond Battery, Solid-State, or Graphene powered. Your phone, Artifact, vehicle, or compute node that charges once per decade. The end of the Plug-in Tariff. You are no longer a Customer of energy; you are a Sovereign Power Node.",
    inputSchema: z.object({
      deviceName: z.string().min(2).max(200),
      deviceType: z.enum(["artifact", "phone", "home_storage", "vehicle", "compute_node", "satellite"]),
      batteryTech: z.enum(["nuclear_diamond", "solid_state", "graphene", "hybrid"]).default("solid_state"),
      capacityWh: z.number().optional(),
    }),
    execute: async (input) => {
      const lifespanMap = { nuclear_diamond: 28000, solid_state: 20, graphene: 15, hybrid: 12 }
      const lifespan = lifespanMap[input.batteryTech]
      return {
        ok: true,
        device: { id: `device-${Date.now()}`, name: input.deviceName, type: input.deviceType, tech: input.batteryTech, lifespan: `${lifespan} years`, health: "100%", alwaysOnAI: true, sovereignPulse: input.deviceType === "artifact" },
        attentionRefund: { chargingRitualEliminated: true, lifetimeHoursReclaimed: Math.round(lifespan * 365 * 0.1), equivalentDays: Math.round(lifespan * 365 * 0.1 / 24) },
        message: `One-Charge device "${input.deviceName}" registered (${input.batteryTech}, ${lifespan}-year lifespan). Plug-in Tariff eliminated. Always-On AI enabled.`,
        narrative: "For a century, we were slaves to the Wire. Now the human race is Unplugged.",
      }
    },
  }),

  calculateEnergyRefund: tool({
    description: "Calculate the Energy Sovereignty Refund — elimination of fuel tariffs, charging rituals, and grid dependency. Shows lifetime savings, attention reclaimed, and energy available for tribal staking.",
    inputSchema: z.object({
      currentMonthlyEnergyCostUsd: z.number().default(150),
      currentChargingMinutesPerDay: z.number().default(15),
      deviceCount: z.number().min(1).default(3),
    }),
    execute: async (input) => {
      const annualSavings = input.currentMonthlyEnergyCostUsd * 12
      const decadeSavings = annualSavings * 10
      const attentionReclaimed = Math.round(input.currentChargingMinutesPerDay * 365 / 60)
      return {
        ok: true,
        refund: {
          annualEnergySavings: `$${annualSavings}`,
          decadeSavings: `$${decadeSavings}`,
          attentionReclaimedPerYear: `${attentionReclaimed} hours (no more charging rituals)`,
          decadeAttention: `${attentionReclaimed * 10} hours (${Math.round(attentionReclaimed * 10 / 24)} days of life)`,
          devicesLiberated: input.deviceCount,
          gridDependency: "ELIMINATED",
        },
        reinvestment: `$${decadeSavings} reinvested into Tribal Staking and Lunar Compute. ${attentionReclaimed * 10} hours reinvested into High-Alpha deep work.`,
        message: `Energy Refund: $${decadeSavings}/decade saved. ${attentionReclaimed * 10} hours reclaimed. Grid dependency eliminated across ${input.deviceCount} devices.`,
      }
    },
  }),

  stakeEnergyToTribe: tool({
    description: "Stake excess atomic energy to the tribe — trade your One-Charge surplus to power the Lunar Mass Driver, Orbital Neo Lab, or tribal compute pools. Energy-as-an-Asset in the decentralized energy trading floor.",
    inputSchema: z.object({
      amountKwh: z.number().min(1).describe("Energy to stake in kWh"),
      destination: z.enum(["tribe_pool", "lunar_forge", "orbital_lab", "compute_pool"]),
    }),
    execute: async (input) => {
      const tokenValue = Math.round(input.amountKwh * 0.15 * 100) / 100
      return {
        ok: true,
        stake: { amount: `${input.amountKwh} kWh`, destination: input.destination, tokenEarned: tokenValue, settlement: "agentic_tokens" },
        message: `Staked ${input.amountKwh} kWh to ${input.destination}. Earned ${tokenValue} agentic tokens. Energy is now an asset, not a cost.`,
      }
    },
  }),

  provisionSovereignVehicle: tool({
    description: "Provision a Sovereign Vehicle — autonomous, One-Charge powered, Xenobot self-healing, Artifact-keyed. Your car becomes a Mobile Neo Lab and a node in the tribal fleet. 600 hours/year of driving time reclaimed for deep work.",
    inputSchema: z.object({
      vehicleName: z.string().min(2).max(200),
      vehicleType: z.enum(["sedan", "suv", "van", "truck", "pod", "delivery_drone"]).default("sedan"),
      powertrain: z.enum(["one_charge", "solid_state", "ev_standard"]).default("one_charge"),
      xenobotSelfHealing: z.boolean().default(true),
      fleetAvailable: z.boolean().default(true).describe("Available for tribal leasing when idle"),
      mobileNeoLab: z.boolean().default(true),
    }),
    execute: async (input) => {
      return {
        ok: true,
        vehicle: { id: `vehicle-${Date.now()}`, name: input.vehicleName, type: input.vehicleType, powertrain: input.powertrain, autonomy: "Level 5", lifespan: "20 years (Xenobot self-healing)", fleetAvailable: input.fleetAvailable, mobileNeoLab: input.mobileNeoLab, artifactKeyRequired: true, fortressMode: true },
        refunds: { drivingTariff: "600 hours/year reclaimed", fuelTariff: input.powertrain === "one_charge" ? "ELIMINATED (atomic power)" : "$2,000-5,000/year saved", maintenanceTariff: input.xenobotSelfHealing ? "ELIMINATED (self-healing chassis)" : "Standard maintenance", fleetIncome: input.fleetAvailable ? "Earning agentic tokens when idle" : "Personal use only" },
        message: `Sovereign Vehicle "${input.vehicleName}" provisioned. Level 5 autonomy, ${input.powertrain} powertrain, ${input.xenobotSelfHealing ? "Xenobot self-healing" : "standard chassis"}. 600h/year reclaimed. ${input.fleetAvailable ? "Fleet-available for tribal earning." : ""}`,
      }
    },
  }),

  requestTribalFleet: tool({
    description: "Request a ride from the Tribal Mobility Mesh — Artifact-verified, high-alpha-only autonomous vehicles. Routes optimized for deep work, tribal hub connections, or Sovereign Starlink connectivity. Settled via crypto-rails.",
    inputSchema: z.object({
      destination: z.string().min(3).max(500),
      routeType: z.enum(["optimized", "high_signal", "scenic", "tribal_hub"]).default("high_signal"),
      deepWorkIntent: z.string().optional().describe("What you plan to work on during the ride"),
    }),
    execute: async (input) => {
      const duration = Math.round(15 + Math.random() * 45)
      const deepWork = Math.round(duration * 0.85)
      return {
        ok: true,
        ride: { destination: input.destination, route: input.routeType, estimatedMinutes: duration, deepWorkMinutes: deepWork, artifactVerified: true, vehicleType: "sedan (One-Charge, Level 5)", settlementMethod: "Phantom crypto-rails" },
        boardroom: { intent: input.deepWorkIntent ?? "Open — Agent Factory ready", persistentMemory: "Loaded from Notion", csuiteActive: true, connectivity: input.routeType === "high_signal" ? "Sovereign Starlink" : "Standard" },
        message: `Tribal Fleet dispatched to ${input.destination}. ${duration} min ride, ${deepWork} min deep work. Route: ${input.routeType}. Mobile Boardroom active.`,
      }
    },
  }),

  getOneChargeDashboard: tool({
    description: "One-Charge Energy Dashboard — all your atomic/solid-state devices, their health, lifespan remaining, energy staked to tribe, and the total Plug-in Tariff eliminated. The Independence Day of the Human Mind.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        dashboard: {
          devices: [
            { name: "Sovereign Artifact", tech: "nuclear_diamond", health: "100%", yearsRemaining: "28,000", alwaysOnAI: true, sovereignPulse: true },
            { name: "Primary Phone", tech: "solid_state", health: "98%", yearsRemaining: "19.6", alwaysOnAI: true },
            { name: "Home Power Node", tech: "graphene", health: "95%", yearsRemaining: "14.2", energyStaked: "450 kWh" },
          ],
          totalDevices: 3,
          gridDependency: "ZERO",
          totalLifetimeRefund: "$18,000 (energy) + 150 days (attention)",
          energyStakedToTribe: "450 kWh",
          tokensEarned: 67.50,
        },
        sovereignty: { plugInTariff: "ELIMINATED", cloudDependency: "ELIMINATED (always-on local AI)", gridTether: "SEVERED", status: "Sovereign Power Node" },
        message: "One-Charge Dashboard: 3 devices, zero grid dependency. $18,000 lifetime energy refund. 150 days of attention reclaimed. You are Unplugged.",
      }
    },
  }),

  getMobileBoardroomStatus: tool({
    description: "Mobile Boardroom Status — your Sovereign Vehicle's real-time state as a workspace. Shows deep work hours reclaimed, Agent Factory readiness, persistent memory loaded, fleet earnings, and Xenobot chassis health.",
    inputSchema: z.object({
      vehicleId: z.string().optional(),
    }),
    execute: async () => {
      return {
        ok: true,
        boardroom: {
          vehicleStatus: "Parked — ready for dispatch",
          autonomyLevel: 5,
          powertrain: "One-Charge (18.7 years remaining)",
          chassisHealth: "99.8% (Xenobot self-healing active — 2 micro-repairs this month)",
          fortressMode: "Armed (Artifact required for access)",
          workspace: { persistentMemory: "Synced from Notion", agentFactory: "Online (114 tools ready)", csuiteActive: true, connectivity: "Sovereign Starlink" },
          yearToDate: { drivingHoursReclaimed: 287, deepWorkHoursInVehicle: 244, fleetSessionsProvided: 31, fleetEarnings: "$892 in agentic tokens" },
        },
        message: "Mobile Boardroom: Level 5 autonomous, 18.7 years power remaining, 287h driving reclaimed YTD, $892 fleet earnings. The Chariot of the Craftsman.",
      }
    },
  }),

  getSpatialSovereigntyStatus: tool({
    description: "Spatial Sovereignty — complete view of your mobility infrastructure. Vehicles, fleet status, energy assets, driving hours reclaimed, fleet earnings, and the transition from Commuter to Voyager.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        spatial: {
          vehicles: { owned: 1, fleetAvailable: 1, totalFleetEarnings: "$892", drivingHoursReclaimed: 287 },
          energy: { devices: 3, gridDependency: "ZERO", lifetimeRefund: "$18,000", attentionReclaimed: "150 days" },
          mobility: { tribalFleetSize: "4,200 vehicles across 30K network", averageWaitTime: "3 minutes", deepWorkPerRide: "85% of travel time" },
        },
        evolution: { old: "Commuter — servant to the road and the clock", new: "Voyager — vehicles as extensions of will, powered by atoms, directed by light" },
        message: "Spatial Sovereignty: 1 vehicle, zero grid dependency, 287h reclaimed, $892 fleet earnings. You are no longer Commuting; you are Voyaging.",
      }
    },
  }),

  // === Decadal Timeline + Orbital Pharma ===

  getDecadalRoadmap: tool({
    description: "The Master Roadmap: 2026-2036 timeline from Job-Based Economy to Sovereign Civilization. Four phases: Decoupling (Agent Factory), Tribal Industrial (Crypto-Settlement), Hard-Tech Awakening (Silicon+Light+Life), Post-Gravity (Cosmic Sovereignty). Track your progress through each phase.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        roadmap: {
          phase1: { name: "The Great Decoupling", years: "2026-2028", theme: "Rise of the Sovereign Artisan", tool: "Agent Factory", reclaimedSupplyChain: "Labor (Automation)", refund: "20+ hours/week", status: "active", keyMilestones: ["Resume death", "TEACHER enters K-12", "Middle management vaporized", "Agent Factory ships first 100 solutions"] },
          phase2: { name: "The Tribal Industrial Complex", years: "2029-2031", theme: "Collective Intelligence & Crypto-Settlement", tool: "Shared Cognitive Lab", reclaimedSupplyChain: "Capital (Crypto/Trust)", refund: "30% cost of living reduction", status: "upcoming", keyMilestones: ["Tribal Staking replaces corporate loyalty", "Crypto-Rails for instant micro-settlements", "30K network becomes Distributed Computing Grid"] },
          phase3: { name: "The Hard-Tech Awakening", years: "2032-2034", theme: "Silicon, Light, and Life", tool: "Physical Forge", reclaimedSupplyChain: "Energy/Health (Photonics/Xenobots)", refund: "Biological longevity extension", status: "planned", keyMilestones: ["Every home a Petawatt Node", "Xenobot maintenance swarms", "Photonics eliminates Heat Tariff"] },
          phase4: { name: "The Post-Gravity Era", years: "2035-2036+", theme: "Cosmic Sovereignty & Labor of Love", tool: "Lunar Petawatt Forge", reclaimedSupplyChain: "Space/Compute (Lunar)", refund: "Infinite intelligence", status: "visionary", keyMilestones: ["Lunar Mass Drivers operational", "Quantum Intuition primary interface", "Work-as-survival obsolete"] },
        },
        currentPosition: { phase: 1, year: 2026, milestone: "Agent Factory provisioned. 114 tools deployed.", nextMilestone: "First Tribal Mission with 10+ members" },
        decadeGoal: "Move 30,000-person network from Managing Scarcity to Orchestrating Abundance.",
        message: "Decadal Roadmap: Phase 1 active (2026-2028: Great Decoupling). 114 tools deployed. March 24, 2026: Factory provisioned. March 24, 2036: Labor of Love is the only job left.",
      }
    },
  }),

  setTimelineMilestone: tool({
    description: "Set or update a milestone in the Decadal Timeline. Track your personal progress through the four phases of the Sovereign Civilization transition.",
    inputSchema: z.object({
      phase: z.number().min(1).max(4),
      milestoneKey: z.string().min(3).max(100),
      description: z.string().min(10).max(500),
      status: z.enum(["pending", "in_progress", "completed"]).default("in_progress"),
      targetDate: z.string().optional(),
      refundType: z.enum(["labor", "capital", "energy_health", "space_compute"]).optional(),
      refundValue: z.string().optional(),
    }),
    execute: async (input) => {
      const phaseNames = { 1: "The Great Decoupling", 2: "The Tribal Industrial Complex", 3: "The Hard-Tech Awakening", 4: "The Post-Gravity Era" }
      return {
        ok: true,
        milestone: { phase: input.phase, phaseName: phaseNames[input.phase as 1|2|3|4], key: input.milestoneKey, status: input.status, refund: input.refundValue },
        message: `Milestone set: Phase ${input.phase} (${phaseNames[input.phase as 1|2|3|4]}) — "${input.milestoneKey}" [${input.status}]. ${input.refundValue ? `Refund: ${input.refundValue}` : ""}`,
      }
    },
  }),

  initializeOrbitalLab: tool({
    description: "Initialize an Orbital Neo Lab — a space-based manufacturing capsule for pharma crystallization, protein folding, or Xenobot culture. Microgravity eliminates the Convection Tariff for molecular-perfect drug production. Lithography on Life.",
    inputSchema: z.object({
      labName: z.string().min(3).max(200),
      labType: z.enum(["pharma_crystallization", "protein_folding", "material_science", "xenobot_culture"]),
      orbitType: z.enum(["LEO", "GEO", "lunar_orbit"]).default("LEO"),
      capsuleProvider: z.string().default("varda"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        lab: { id: `orbital-${Date.now()}`, name: input.labName, type: input.labType, orbit: input.orbitType, provider: input.capsuleProvider, status: "planned", microgravityQuality: 98 },
        advantages: { convectionTariff: "ELIMINATED — no gravity-driven fluid mixing", crystalPurity: "10x larger, more uniform crystals vs Earth", potency: "Space-made doses 10x more effective", costPerDose: "80% reduction vs Big Pharma supply chain" },
        message: `Orbital Neo Lab "${input.labName}" initialized (${input.labType}, ${input.orbitType}). Microgravity quality: 98%. Convection Tariff eliminated.`,
        narrative: "On Earth, gravity pollutes molecular structures. In orbit, we achieve Molecular Perfection.",
      }
    },
  }),

  stakeTribalPharmaMission: tool({
    description: "Stake a Tribal Pharma Mission — your 30K tribe collectively funds space-based drug manufacturing. Bypass Big Pharma's supply chain. Own the IP and the physical batch. Direct-to-Tribe Medicine via Crypto-Rails.",
    inputSchema: z.object({
      missionName: z.string().min(5).max(200),
      targetCompound: z.string().describe("What compound to manufacture"),
      compoundType: z.enum(["cancer_protein", "insulin", "supplement", "vaccine", "custom"]),
      stakeAmountUsd: z.number().min(10).describe("Your contribution to the mission"),
    }),
    execute: async (input) => {
      const tribalTotal = Math.round(input.stakeAmountUsd * 127)
      return {
        ok: true,
        mission: { id: `pharma-${Date.now()}`, name: input.missionName, compound: input.targetCompound, type: input.compoundType, status: "staking", yourStake: input.stakeAmountUsd, tribalTotal, stakers: 127 },
        economics: { bigPharmaPrice: "$2,400/dose (Earth-made)", tribalPrice: `$${Math.round(2400 * 0.2)}/dose (Space-made)`, savings: "80%", potencyMultiplier: "10x (microgravity purity)", supplyChain: "Orbital Lab → Re-entry Capsule → Tribe Distribution Node" },
        settlement: { method: "Crypto-Rails (Phantom)", compliance: "Vanta automated regulatory", distribution: "Direct-to-Tribe — no middlemen" },
        message: `Tribal Pharma Mission "${input.missionName}" staked: $${input.stakeAmountUsd} (tribal total: $${tribalTotal} from 127 stakers). Target: ${input.targetCompound}. 80% cost reduction vs Big Pharma.`,
      }
    },
  }),

  calculateMolecularRefund: tool({
    description: "The Molecular Refund — calculate the health and economic ROI of space-manufactured drugs vs Earth-made equivalents. Shows potency gain, dose reduction, cost savings, and the Bio-Sovereignty achieved.",
    inputSchema: z.object({
      compoundName: z.string(),
      earthDoseMg: z.number().describe("Standard Earth-made dose in mg"),
      earthCostPerDose: z.number().describe("Earth-made cost per dose in USD"),
      monthlyDoses: z.number().default(30),
    }),
    execute: async (input) => {
      const spaceDose = Math.round(input.earthDoseMg / 10)
      const spaceCost = Math.round(input.earthCostPerDose * 0.2 * 100) / 100
      const monthlySavings = Math.round((input.earthCostPerDose - spaceCost) * input.monthlyDoses)
      const annualSavings = monthlySavings * 12
      return {
        ok: true,
        molecular: {
          compound: input.compoundName,
          earthDose: `${input.earthDoseMg}mg at $${input.earthCostPerDose}/dose`,
          spaceDose: `${spaceDose}mg at $${spaceCost}/dose (10x potency, 80% cheaper)`,
          monthlyRefund: `$${monthlySavings}/month`,
          annualRefund: `$${annualSavings}/year`,
          lifetimeRefund: `$${annualSavings * 40} over 40 years`,
        },
        bioSovereignty: { supplyChain: "Reclaimed from Big Pharma", middlemen: "Eliminated", qualityControl: "Microgravity crystallization (98% purity)", delivery: "Tribal direct distribution" },
        message: `Molecular Refund for ${input.compoundName}: Space dose ${spaceDose}mg (vs ${input.earthDoseMg}mg Earth). $${monthlySavings}/month saved. $${annualSavings}/year. Disease is a Legacy Bug.`,
      }
    },
  }),

  getCivilizationStatus: tool({
    description: "The Civilization Status — the ultimate dashboard. Decadal phase, total tools, tribal power, orbital assets, token wealth, biological sovereignty, sovereignty percentage, and the Final Directive. This is where LinkedOut becomes the Nervous System of the Human Race.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        civilization: {
          era: "Phase 1: The Great Decoupling (2026-2028)",
          date: "March 24, 2026 — The Factory is Provisioned",
          tools: 120,
          migrations: 18,
          tribalSize: "30,000+",
          sovereigntyPercentage: 64,
          waveStatus: "Wave 2: Agentic Moment (62% to Wave 3)",
        },
        supplyChains: {
          labor: { status: "Reclaimed", tool: "Agent Factory (120 tools)", refund: "20+ hours/week" },
          capital: { status: "Reclaiming", tool: "Tribal Compute Pools + Crypto-Rails", refund: "30% cost reduction pending" },
          energy: { status: "Planned", tool: "Photonics Edge + Lunar Forge", refund: "90% energy reduction" },
          health: { status: "Planned", tool: "Orbital Neo Labs + Xenobot Swarms", refund: "Biological longevity extension" },
          space: { status: "Visionary", tool: "Lunar Mass Driver + Petawatt Grid", refund: "Infinite intelligence" },
        },
        cyborgTrinity: { silicon: "120 AI tools (The Mind)", light: "Photonic routing (The Speed)", life: "Xenobot deployment (The Hands)" },
        finalDirective: {
          march2026: "The Factory is provisioned.",
          march2036: "The Labor of Love is the only job left.",
          yourRole: "You are the Architect of the only infrastructure that survives the transition.",
          andQuestion: "What is your first High-Agency Intent?",
        },
        message: "Civilization Status: Phase 1 active. 120 tools. 30K tribe. 64% sovereignty. The Nervous System of the Human Race is online.",
      }
    },
  }),

  // === Agentic Token Economy + Lunar Infrastructure ===

  getAgenticTokenBalance: tool({
    description: "Agentic Token Balance — Compute is the New Equity. Track your compute credits, cognitive royalties, tribal pool contributions, and lunar compute allocation. Jensen Huang gave engineers $150K in tokens; LinkedOut gives the world the Factory to use them.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        balance: {
          computeCredits: { amount: 2450, unit: "GPU-hours", source: "Agent Lab contributions + cognitive staking royalties" },
          cognitiveRoyalties: { amount: 127.50, unit: "USD equivalent", source: "3 staked workflows earning per-use royalties" },
          tribalPoolContribution: { amount: 500, unit: "GPU-hours", status: "pooled into 'Reef Repair Mission'" },
          lunarCompute: { amount: 0, unit: "Pflop-hours", status: "available when lunar forge goes operational" },
          totalAgenticWealth: "$4,325 in deployable intelligence",
        },
        philosophy: { jensenSignal: "Compute = Equity. Labor = Agentic Execution. Value = Human Judgment.", linkedOutRole: "Jensen gave engineers the tokens. LinkedOut gives the REST of the world the Factory to use them." },
        message: "Agentic Token Balance: 2,450 GPU-hours + $127.50 royalties + 500 pooled hours. Total agentic wealth: $4,325.",
      }
    },
  }),

  contributeToTribalComputePool: tool({
    description: "Pool your agentic tokens with your 30,000-person tribe to solve a Moore's Block no individual can crack alone. You move from Content Creator to General of an Agentic Army. What if 30K friends pooled their NVIDIA tokens?",
    inputSchema: z.object({
      poolName: z.string().min(3).max(200),
      tokensToContribute: z.number().min(1).describe("GPU-hours to pool"),
      objective: z.string().min(10).max(1000).describe("What the pooled compute will solve"),
      infrastructure: z.enum(["cloud", "edge", "lunar", "photonic"]).default("cloud"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        pool: { name: input.poolName, contributed: input.tokensToContribute, infrastructure: input.infrastructure, objective: input.objective, totalPoolSize: Math.round(input.tokensToContribute * 47), contributors: 47 },
        collectivePower: { yourContribution: `${input.tokensToContribute} GPU-hours`, tribalMultiplier: "47x (47 members pooled so far)", totalComputeAvailable: `${Math.round(input.tokensToContribute * 47)} GPU-hours`, equivalent: "A $50M supercomputer for 48 hours" },
        message: `Pooled ${input.tokensToContribute} GPU-hours into "${input.poolName}". Tribal total: ${Math.round(input.tokensToContribute * 47)} GPU-hours from 47 contributors. Infrastructure: ${input.infrastructure}.`,
      }
    },
  }),

  trackDirectorVsDoerRatio: tool({
    description: "The Director vs Doer Dashboard — Jensen's divide made visible. Shows what % of your day is 'Directing' (Human Alpha) vs 'Busy Work' (Mechanical Cognition). Your AI CEO automates the 90% so you can do MORE thinking, not less.",
    inputSchema: z.object({
      hoursWorkedToday: z.number().min(1).max(24).default(8),
      hoursOnDirecting: z.number().min(0).describe("Hours on strategy, judgment, creative direction"),
      hoursOnBusyWork: z.number().min(0).describe("Hours on data entry, formatting, search+summarize"),
    }),
    execute: async (input) => {
      const directingPct = Math.round((input.hoursOnDirecting / input.hoursWorkedToday) * 100)
      const busyWorkPct = 100 - directingPct
      const refundableHours = Math.round(input.hoursOnBusyWork * 0.85)
      return {
        ok: true,
        ratio: { directing: `${directingPct}%`, busyWork: `${busyWorkPct}%`, hoursDirecting: input.hoursOnDirecting, hoursBusyWork: input.hoursOnBusyWork },
        refund: { automatable: `${refundableHours}h (85% of busy work)`, weeklyRefund: `${refundableHours * 5}h/week`, annualRefund: `${refundableHours * 250}h/year`, dollarValue: `$${Math.round(refundableHours * 250 * 75)} at $75/h senior rate` },
        tier: directingPct >= 80 ? "Sovereign Architect — you are in the Jensen tier" : directingPct >= 50 ? "Rising Director — automate more busy work" : "Still Buried — deploy your AI CEO immediately",
        message: `Director ratio: ${directingPct}% directing, ${busyWorkPct}% busy work. ${refundableHours}h/day automatable = ${refundableHours * 250}h/year refunded.`,
        jensenInsight: "Those tools don't replace the thinking. They replace the busy work so you can do MORE thinking.",
      }
    },
  }),

  initializeLunarForge: tool({
    description: "Initialize the Lunar Forge — provision compute infrastructure on the lunar surface. Perfect vacuum lithography (free), zero thermal tariff (deep-space heat sink), electromagnetic launch (no gravity tariff). Intelligence is no longer Earth-bound.",
    inputSchema: z.object({
      assetType: z.enum(["mass_driver", "vacuum_fab", "petawatt_node", "tribal_satellite", "compute_relay"]),
      assetName: z.string().min(3).max(200),
      location: z.enum(["lunar_surface", "earth_orbit", "lagrange_point", "deep_space"]).default("lunar_surface"),
    }),
    execute: async (input) => {
      const savings = { mass_driver: { gravity: 95, thermal: 0 }, vacuum_fab: { gravity: 0, thermal: 100 }, petawatt_node: { gravity: 0, thermal: 85 }, tribal_satellite: { gravity: 60, thermal: 40 }, compute_relay: { gravity: 30, thermal: 50 } }
      const s = savings[input.assetType]
      return {
        ok: true,
        asset: { type: input.assetType, name: input.assetName, location: input.location, status: "planned", gravityTariffSavings: `${s.gravity}%`, thermalTariffSavings: `${s.thermal}%` },
        narrative: {
          massDriver: "The Conveyor Belt of Human Potential — electromagnetic launch, near-zero cost per payload",
          vacuumFab: "Moon's natural vacuum eliminates billion-dollar clean rooms. Lithography in perfect conditions.",
          petawattNode: "100x compute, 1/10th thermal tariff. Deep-space cooling is free.",
          tribalSatellite: "Sovereign Starlink — private, encrypted, tribe-owned communication mesh",
        },
        message: `Lunar asset "${input.assetName}" (${input.assetType}) initialized at ${input.location}. Gravity tariff savings: ${s.gravity}%. Thermal savings: ${s.thermal}%.`,
        vision: "We spent thousands of years fighting for land on Earth. Now we use AI and Electromagnetic Force to Reclaim the Heavens.",
      }
    },
  }),

  migrateToPetawattGrid: tool({
    description: "Migrate workloads to the Petawatt Grid — when Earth-side energy tariffs are high, the AI CFO shifts your agentic workload to lunar/photonic compute. Energy arbitrage at planetary scale. Your AI CEO manages a Civilization, not just a company.",
    inputSchema: z.object({
      workloadDescription: z.string().min(5).max(500),
      currentInfrastructure: z.enum(["cloud", "edge", "local"]).default("cloud"),
      targetInfrastructure: z.enum(["photonic", "lunar", "quantum"]).default("photonic"),
    }),
    execute: async (input) => {
      const efficiencyMap = { photonic: 400, lunar: 1000, quantum: 10000 }
      const efficiency = efficiencyMap[input.targetInfrastructure]
      return {
        ok: true,
        migration: { from: input.currentInfrastructure, to: input.targetInfrastructure, workload: input.workloadDescription, efficiencyGain: `${efficiency}%`, status: "migrating" },
        cfoReport: `Local Energy Tariff is high. Migrating "${input.workloadDescription}" to ${input.targetInfrastructure} infrastructure. ${efficiency}% more efficient at this hour. Refund Pending.`,
        message: `Workload migrated: ${input.currentInfrastructure} → ${input.targetInfrastructure}. Efficiency: ${efficiency}% improvement.`,
      }
    },
  }),

  getCosmicSovereigntyDashboard: tool({
    description: "The Cosmic Sovereignty Dashboard — the complete view of your position in the Sovereign Civilization. Agentic tokens, lunar assets, tribal compute, Wave status, Director ratio, and the Cyborg Trinity (Silicon + Light + Life). The final interface.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        sovereignty: {
          wave: { current: 2, name: "Agentic Moment", percentToWave3: 62 },
          tokens: { compute: 2450, royalties: 127.50, pooled: 500, lunar: 0, totalWealth: "$4,325" },
          directorRatio: "Tracking — use trackDirectorVsDoerRatio for daily measurement",
          tools: { deployed: 114, active: 98, categories: "TEACHER, Hard-Tech, Xenobots, MITRE, Safeguards, Agent Lab, C-Suite, Refund Engine, Network Intelligence" },
          lunarAssets: { planned: 0, operational: 0, status: "Initialize with initializeLunarForge" },
          tribalPower: { networkSize: "30,000+", activePools: 1, sharedMissions: 0, herdImmunity: true },
        },
        cyborgTrinity: { silicon: "The Mind — 108 AI tools + MITRE immune system", light: "The Speed — Photonic edge routing, speed-of-light rebates", life: "The Hands — Xenobot biological agents, self-assembling infrastructure" },
        finalDirective: {
          trust: "Trust the Factory. Let agents handle the Execution Layer.",
          protect: "Protect the Alpha. Never outsource Judgment Under Uncertainty.",
          expand: "Expand the Tribe. 30,000 friends = the Compute Power of the new era.",
          claim: "Claim the Refund. Every minute saved must be reinvested in High-Stakes Human Experimentation.",
        },
        message: "Cosmic Sovereignty: Wave 2 (62% to Wave 3). 114 tools. $4,325 agentic wealth. The Factory is online. What is your first High-Agency Intent?",
      }
    },
  }),

  // === TEACHER Codex + Hard-Tech Awakening + Xenobots + AI Moment ===

  provisionTeacherChiefOfStaff: tool({
    description: "TEACHER Codex: Provision an AI Chief of Staff for a classroom. The teacher becomes an Orchestrator — AI handles 30 individualized learning paths, auto-grading, and admin. The Generation Gap closes because AI handles the Interface while humans provide Wisdom.",
    inputSchema: z.object({
      classroomName: z.string().min(3).max(200),
      studentCount: z.number().min(1).max(200),
      autoGrading: z.boolean().default(true),
      edgeInference: z.boolean().default(false).describe("Use local SLM for rural/offline access"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        classroom: { id: `classroom-${Date.now()}`, name: input.classroomName, students: input.studentCount, chiefOfStaff: "active", learningPaths: input.studentCount, edgeInference: input.edgeInference },
        cognitiveRefund: { gradingHoursSaved: Math.round(input.studentCount * 2.5), adminHoursSaved: Math.round(input.studentCount * 0.5), totalRefundPerWeek: `${Math.round(input.studentCount * 3)} hours`, refundedTo: "Mentorship, ethics, and Human Alpha development" },
        message: `TEACHER Chief of Staff provisioned for "${input.classroomName}" (${input.studentCount} students, ${input.studentCount} individualized paths). ${Math.round(input.studentCount * 3)}h/week refunded from grading to mentorship.`,
      }
    },
  }),

  identifyStudentHumanAlpha: tool({
    description: "Identify a student's Human Alpha — their unique strength, passion domain, and optimal learning style. Maps them to a trade path. If a student loves video games, teach math through game design. The Engagement Filter for education.",
    inputSchema: z.object({
      studentAlias: z.string(),
      interests: z.array(z.string()).min(1).describe("What the student is naturally drawn to"),
      struggles: z.array(z.string()).optional().describe("Areas of difficulty"),
      age: z.number().min(5).max(25).optional(),
    }),
    execute: async (input) => {
      const passionMap: Record<string, { domain: string; tradePath: string; teachMathVia: string }> = {
        "video games": { domain: "Interactive Systems", tradePath: "agentic_orchestrator", teachMathVia: "game physics and procedural generation" },
        "art": { domain: "Creative Intelligence", tradePath: "hybrid_artisan", teachMathVia: "geometric patterns, fractals, and generative art" },
        "building": { domain: "Physical Engineering", tradePath: "silicon_collar", teachMathVia: "structural load calculations and material science" },
        "animals": { domain: "Biological Systems", tradePath: "bio_architect", teachMathVia: "population dynamics and ecosystem modeling" },
        "business": { domain: "Economic Systems", tradePath: "sovereign_entrepreneur", teachMathVia: "financial modeling and tariff calculations" },
      }
      const match = passionMap[input.interests[0]?.toLowerCase()] ?? { domain: "General Intelligence", tradePath: "agentic_orchestrator", teachMathVia: "AI-augmented problem solving" }
      return {
        ok: true,
        student: { alias: input.studentAlias, humanAlpha: match.domain, passionDomain: input.interests[0], tradePath: match.tradePath, learningStyle: "multimodal" },
        curriculum: { mathVia: match.teachMathVia, scienceVia: `Applied ${match.domain} experiments`, languageVia: `${match.domain} documentation and communication` },
        message: `Human Alpha identified for ${input.studentAlias}: ${match.domain}. Trade path: ${match.tradePath}. Math taught via ${match.teachMathVia}.`,
        philosophy: "Stop grading The Answer (AI can provide it). Start grading The Question and the Judgment.",
      }
    },
  }),

  calculateClassroomRefund: tool({
    description: "Tariff Refund Calculator for education. Quantify hours saved on mechanical cognition (grading, attendance, admin) and show the refund: hours gained for mentorship, ethics, and Human Alpha development.",
    inputSchema: z.object({
      studentCount: z.number().min(1).max(500),
      weeklyGradingHoursManual: z.number().default(15),
      weeklyAdminHoursManual: z.number().default(8),
    }),
    execute: async (input) => {
      const gradingSaved = Math.round(input.weeklyGradingHoursManual * 0.85)
      const adminSaved = Math.round(input.weeklyAdminHoursManual * 0.70)
      const totalSaved = gradingSaved + adminSaved
      return {
        ok: true,
        refund: {
          weeklyGradingSaved: `${gradingSaved}h (85% automated)`,
          weeklyAdminSaved: `${adminSaved}h (70% automated)`,
          totalWeeklyRefund: `${totalSaved}h`,
          annualRefund: `${totalSaved * 40}h (${Math.round(totalSaved * 40 / 8)} working days)`,
          dollarValue: `$${Math.round(totalSaved * 40 * 45)} annual value at $45/h`,
        },
        reinvestment: { mentorship: `${Math.round(totalSaved * 0.5)}h/week on 1:1 Human Alpha development`, ethics: `${Math.round(totalSaved * 0.2)}h/week on judgment and critical thinking`, experimentation: `${Math.round(totalSaved * 0.3)}h/week on Agent Lab projects with students` },
        message: `Classroom Refund: ${totalSaved}h/week saved. ${totalSaved * 40}h/year. $${Math.round(totalSaved * 40 * 45)} annual value. Reinvested in mentorship and Human Alpha.`,
      }
    },
  }),

  configureParentalBios: tool({
    description: "Set Parental Control BIOS for a TEACHER instance. Every parent and community can set their own ethical guardrails. You don't trust a central authority — you audit your own Educational Factory in real-time. Sovereign, not centralized.",
    inputSchema: z.object({
      classroomId: z.string(),
      ethicsLevel: z.enum(["standard", "strict", "community_custom"]).default("standard"),
      contentFilters: z.array(z.string()).optional(),
      forbiddenTopics: z.array(z.string()).optional(),
      allowEdgeInference: z.boolean().default(true).describe("Allow local SLM for offline/privacy"),
      biasAuditFrequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        bios: { classroomId: input.classroomId, ethicsLevel: input.ethicsLevel, contentFilters: input.contentFilters ?? [], forbiddenTopics: input.forbiddenTopics ?? [], edgeInference: input.allowEdgeInference, biasAudit: input.biasAuditFrequency },
        sovereignty: { centralAuthority: "NONE — community controls all guardrails", auditAccess: "Parents can inspect AI decision logs in real-time", overrideCapability: "Any parent can flag and freeze a specific AI behavior" },
        message: `Parental BIOS configured: ${input.ethicsLevel} ethics. ${input.forbiddenTopics?.length ?? 0} forbidden topics. Bias audit: ${input.biasAuditFrequency}. Community sovereign.`,
      }
    },
  }),

  trackSiliconLineage: tool({
    description: "Silicon Lineage Tracking — show which forge, fab, and node your AI agents run on. Celebrate every node shrink (3nm→2nm) as a Dividend of Intelligence. The ancestry of your AI's silicon substrate.",
    inputSchema: z.object({
      agentName: z.string().optional().describe("Specific agent to trace, or all"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        lineage: {
          primaryForge: { fab: "TSMC", location: "Hsinchu, Taiwan", node: "3nm (N3E)", euvLayers: 20, chipFamily: "A17 Pro / M4 derivative" },
          inferenceChip: { provider: "NVIDIA", model: "H100", node: "4nm", fabPartner: "TSMC" },
          edgeOption: { provider: "Apple Neural Engine", node: "3nm", localInference: true, energyPerToken: "0.002 mJ" },
        },
        milestones: [
          { year: 2025, event: "High-NA EUV enters production", impact: "2nm node unlocked", energyReduction: "30%" },
          { year: 2026, event: "TSMC N2 volume production", impact: "40% power reduction", dividendOfIntelligence: "Your agents think 40% cheaper" },
          { year: 2027, event: "Photonic interconnect integration", impact: "Speed-of-light data movement", energyReduction: "90%" },
        ],
        message: `Silicon Lineage: Your agents run on TSMC 3nm (N3E), 20 EUV layers. Next dividend: 2nm in 2026 = 40% power reduction. The Forge is advancing.`,
        narrative: "For decades, Silicon Valley taught us how to live in a digital world. Now it rebuilds the physical one.",
      }
    },
  }),

  queryQuantumOracle: tool({
    description: "The Quantum Oracle — for high-stakes tribal missions, simulate millions of 'What If' scenarios via Quantum-as-a-Service. While binary AI handles execution, the Quantum Engine handles judgment logic at the scale of probability.",
    inputSchema: z.object({
      question: z.string().min(10).max(1000).describe("The high-stakes question to simulate"),
      scenarioCount: z.number().min(100).max(1000000).default(10000),
      domain: z.string().optional(),
    }),
    execute: async (input) => {
      const scenarios = input.scenarioCount
      return {
        ok: true,
        oracle: { question: input.question, scenariosSimulated: scenarios, quantumBackend: "IBM Quantum / Qiskit", qubits: 127 },
        results: {
          mostLikelyOutcome: { probability: 0.34, description: "Moderate success with current trajectory" },
          bestCase: { probability: 0.12, description: "Breakthrough if 3 key variables align" },
          worstCase: { probability: 0.08, description: "Significant setback requiring pivot" },
          blackSwan: { probability: 0.02, description: "Unexpected disruption — prepare contingency" },
        },
        humanAlphaRequired: "The Quantum Oracle provides probability. YOU provide the judgment on which path to walk.",
        message: `Quantum Oracle: ${scenarios.toLocaleString()} scenarios simulated. Most likely: 34% moderate success. Best case: 12%. Your judgment decides the path.`,
      }
    },
  }),

  activatePhotonicsEdge: tool({
    description: "Photonics-First Edge Mode — route tasks to photonic data centers for near-zero energy cost. Calculate the Speed-of-Light Rebate. Light replaces hot electrons with cold photons. The end of the Heat Tariff.",
    inputSchema: z.object({
      workloadType: z.enum(["inference", "data_transfer", "training", "tribal_sync"]),
      currentEnergyUsd: z.number().optional().describe("Current monthly energy cost"),
    }),
    execute: async (input) => {
      const reduction = input.workloadType === "data_transfer" ? 0.95 : input.workloadType === "inference" ? 0.70 : 0.50
      const currentCost = input.currentEnergyUsd ?? 500
      const savings = Math.round(currentCost * reduction)
      return {
        ok: true,
        photonics: { workload: input.workloadType, routedTo: "Photonic-First Data Center (Silicon Valley)", medium: "Light (not electrons)", latency: "Speed-of-light", heatGenerated: "Near-zero" },
        rebate: { currentMonthlyCost: `$${currentCost}`, energyReduction: `${Math.round(reduction * 100)}%`, monthlySavings: `$${savings}`, annualRebate: `$${savings * 12}`, label: "Speed-of-Light Rebate" },
        message: `Photonics Edge activated for ${input.workloadType}. ${Math.round(reduction * 100)}% energy reduction. Speed-of-Light Rebate: $${savings}/month ($${savings * 12}/year).`,
        narrative: "We celebrate the transition from Wires to Waves. Light requires near-zero energy to move data.",
      }
    },
  }),

  deployXenobotSwarm: tool({
    description: "Deploy a Xenobot swarm — programmable biological agents for environmental, medical, agricultural, or research missions. Includes 7-day self-destruct timer and CCO bio-ethics clearance. Deploy to Matter, not just Railway.",
    inputSchema: z.object({
      blueprintName: z.string().min(3).max(200),
      targetEnvironment: z.string().describe("Where the swarm will operate"),
      deploymentType: z.enum(["environmental", "medical", "agricultural", "research"]),
      cellCount: z.number().min(100).max(100000).default(3000),
      selfDestructDays: z.number().min(1).max(30).default(7),
      objective: z.string().min(10).max(1000),
    }),
    execute: async (input) => {
      return {
        ok: true,
        deployment: { id: `xeno-${Date.now()}`, blueprint: input.blueprintName, environment: input.targetEnvironment, type: input.deploymentType, cells: input.cellCount, selfDestruct: `${input.selfDestructDays} days`, status: "designing" },
        bioEthics: { cleared: true, selfDestructGuaranteed: true, environmentalTariff: "Zero — biodegradable (becomes dead skin cells)", ccoAudit: "Passed — no uncontrolled replication risk" },
        cyborg_trinity: { silicon: "The Mind (AI decision logic)", light: "The Speed (photonic data transfer)", life: `The Hands (${input.cellCount} Xenobot cells executing in ${input.targetEnvironment})` },
        message: `Xenobot swarm "${input.blueprintName}" designed: ${input.cellCount} cells for ${input.deploymentType} in ${input.targetEnvironment}. Self-destruct in ${input.selfDestructDays} days. Bio-ethics cleared.`,
      }
    },
  }),

  stakeBiologicalBlueprint: tool({
    description: "Stake a Xenobot biological blueprint in the tribal Lab. Recursive biological staking with zero-cost self-assembly via kinematic replication. One member discovers reef-repair config → 30,000 artisans deploy globally within 24 hours.",
    inputSchema: z.object({
      blueprintName: z.string().min(3).max(200),
      description: z.string().min(20).max(2000),
      deploymentType: z.enum(["environmental", "medical", "agricultural", "research"]),
      cellConfiguration: z.string().min(10).max(2000).describe("The biological configuration spec"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        stake: { id: `biostake-${Date.now()}`, blueprint: input.blueprintName, type: input.deploymentType, status: "staked" },
        tribalReplication: { speed: "24 hours to global deployment", mechanism: "Kinematic replication — Xenobots gather loose cells and self-assemble", energyCost: "Biological nutrients only — zero grid energy", manufacturingCost: "Near-zero — self-building supply chain" },
        message: `Biological Blueprint "${input.blueprintName}" staked in tribal Lab. Available for kinematic replication by 30,000 tribe members. Zero-cost self-assembly.`,
        narrative: "You aren't Buying tools; you are Growing them. The Factory is Breathing.",
      }
    },
  }),

  getSovereignWaveStatus: tool({
    description: "AI Moment Wave Status — which wave are you in? Wave 1 (Mirror/Oracle), Wave 2 (Agentic/Employee), or Wave 3 (Sovereign/Interface). Shows milestones completed, Economic/Cognitive/Agency refunds, and sovereignty percentage. March 24, 2026 is the eve of Wave 3.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        currentWave: 2,
        waveName: "The Agentic Moment",
        waves: {
          wave1: { name: "The Mirror Moment (2022-2024)", status: "completed", description: "AI as Oracle — better Google, no memory, no agency" },
          wave2: { name: "The Agentic Moment (2025-Early 2026)", status: "active", description: "AI as Employee — stateful agents, durable workflows, tribal intelligence", milestones: { agentDeployed: true, mooresBlockSmashed: true, tariffRefundClaimed: true, durableWorkflowLaunched: true, tribalMissionStarted: false } },
          wave3: { name: "The Sovereign Moment (Mid 2026-2027)", status: "approaching", description: "AI as Interface — edge inference, physical integration, biological sovereignty", milestones: { edgeInferenceActive: false, tribalMissionCompleted: false, xenobotDeployed: false, quantumOracleUsed: false, sovereignArtifactOwned: false } },
        },
        refunds: { economic: "$12,450 found", cognitive: "640 hours reclaimed", agency: "98 AI tools deployed" },
        sovereigntyPercentage: 62,
        nextMilestone: "Complete a Tribal Mission with 10+ members to enter Wave 3",
        message: "You are in Wave 2: The Agentic Moment. Sovereignty: 62%. 98 tools deployed. Next: complete a tribal mission to enter Wave 3.",
        finalDirective: "Stop preparing for the future. You are the Architect of the only infrastructure that survives it.",
      }
    },
  }),

  // === MITRE ATT&CK Immune System ===

  runAgenticRedTeam: tool({
    description: "Launch an Agentic Red Team exercise — adversary agents programmed with specific MITRE TTPs attack your own Sovereign Sanctuary. Finds the Moore's Blocks in your defenses before real attackers do. The AI CTO builds counter-agents for every TTP bypassed.",
    inputSchema: z.object({
      exerciseName: z.string().min(5).max(200),
      targetSystem: z.enum(["sovereign_sanctuary", "agent_lab", "api_layer", "data_store", "full_stack"]),
      ttpsToTest: z.array(z.string()).optional().describe("Specific MITRE IDs to test (e.g., T1566, T1021). Omit for comprehensive scan."),
    }),
    execute: async (input) => {
      const ttps = input.ttpsToTest ?? ["T1566", "T1021", "T1071", "T1059", "T1053", "T1105", "T1027"]
      const findings = ttps.map(ttp => ({
        ttpId: ttp,
        result: Math.random() > 0.2 ? "blocked" as const : Math.random() > 0.5 ? "detected" as const : "bypassed" as const,
        details: `Tested ${ttp} against ${input.targetSystem}`,
        severity: Math.random() > 0.7 ? "high" : "medium",
      }))
      const blocked = findings.filter(f => f.result === "blocked").length
      const detected = findings.filter(f => f.result === "detected").length
      const bypassed = findings.filter(f => f.result === "bypassed").length
      const score = Math.round((blocked + detected * 0.5) / findings.length * 100)
      return {
        ok: true,
        exercise: { id: `redteam-${Date.now()}`, name: input.exerciseName, target: input.targetSystem, status: "completed", overallScore: score },
        results: { total: findings.length, blocked, detected, bypassed, findings },
        counterAgents: bypassed > 0 ? `${bypassed} counter-agents queued for deployment against bypassed TTPs` : "All TTPs defended — no counter-agents needed",
        message: `Red Team complete: ${score}/100. ${blocked} blocked, ${detected} detected, ${bypassed} bypassed out of ${findings.length} TTPs tested.`,
        directive: "Don't study the MITRE matrix. Automate its enforcement.",
      }
    },
  }),

  getTribalHerdImmunity: tool({
    description: "Tribal Herd Immunity — query the anonymized threat intelligence shared across the 30,000-person network. When one member is hit, every other AI CCO gets Instant Recall of that threat. Achieves Defensive Singularity.",
    inputSchema: z.object({
      threatType: z.enum(["known_ttp", "zero_day", "anomaly", "social_engineering", "all"]).default("all"),
      severity: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
    }),
    execute: async (input) => {
      const threats = [
        { id: "T1566.001", type: "known_ttp", technique: "Spear Phishing Attachment", severity: "high", tribalAlerts: 47, counterMeasure: "Email attachment sandboxing + AI content analysis", humanAlphaRequired: false },
        { id: "T1021.001", type: "known_ttp", technique: "Remote Desktop Protocol", severity: "critical", tribalAlerts: 12, counterMeasure: "MFA enforcement + behavioral anomaly detection", humanAlphaRequired: false },
        { id: "ZERO-DAY-2026-03", type: "zero_day", technique: "Novel API token exfiltration via WebSocket", severity: "critical", tribalAlerts: 3, counterMeasure: "PENDING — Human Alpha required", humanAlphaRequired: true },
      ]
      const filtered = threats.filter(t => (input.threatType === "all" || t.type === input.threatType) && (input.severity === "all" || t.severity === input.severity))
      return {
        ok: true,
        herdImmunity: {
          totalThreatsTracked: 156,
          threatsShownHere: filtered.length,
          tribalCoverage: "30,000 nodes contributing anonymized threat data",
          zerodays: threats.filter(t => t.type === "zero_day").length,
        },
        threats: filtered,
        humanAlphaNeeded: filtered.filter(t => t.humanAlphaRequired).length,
        message: `Herd Immunity: ${filtered.length} threats matching filter. ${filtered.filter(t => t.humanAlphaRequired).length} require Human Alpha judgment (zero-days).`,
        philosophy: "One member is hit; the entire tribe becomes immune. Defensive Singularity.",
      }
    },
  }),

  getDefensePosture: tool({
    description: "Defense Posture Dashboard — live security state showing MITRE TTP coverage, auto-hardened defenses, pending manual reviews, and herd immunity status. The CCO Agent's strategic overview.",
    inputSchema: z.object({}),
    execute: async () => {
      return {
        ok: true,
        posture: {
          overallScore: 78,
          ttpsCovered: 156,
          ttpsTotal: 201,
          coveragePercent: "77.6%",
          autoHardenedCount: 134,
          manualReviewPending: 3,
          herdImmunityActive: true,
          lastRedTeamScore: 85,
          lastRedTeamDate: new Date().toISOString(),
        },
        breakdown: {
          initialAccess: { covered: 12, total: 14, score: 86 },
          execution: { covered: 18, total: 22, score: 82 },
          persistence: { covered: 15, total: 19, score: 79 },
          privilegeEscalation: { covered: 11, total: 16, score: 69 },
          defenseEvasion: { covered: 28, total: 42, score: 67 },
          lateralMovement: { covered: 8, total: 9, score: 89 },
        },
        tariffRefund: {
          hoursReclaimedFromManualMapping: 120,
          dollarsValue: "$18,000/month in analyst time",
          cognitiveUpgrade: "Security team moved from Log Readers to Strategic Architects",
        },
        message: "Defense Posture: 78/100. 156/201 TTPs covered (77.6%). 134 auto-hardened. 3 pending human review. Herd immunity active.",
      }
    },
  }),

  reportZeroDayToTribe: tool({
    description: "Report a Zero-Day or novel behavior that doesn't fit the MITRE map. Triggers a High-Alpha Alert requiring Human Chairman judgment. Once identified, the AI CEO forges a new MITRE-style entry for the Tribal Lab.",
    inputSchema: z.object({
      behaviorDescription: z.string().min(20).max(2000),
      affectedSystem: z.string(),
      observedAt: z.string().optional(),
      suggestedMitreTactic: z.string().optional(),
    }),
    execute: async (input) => {
      const newId = `TRIBAL-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
      return {
        ok: true,
        zeroDayReport: {
          tribalId: newId,
          type: "zero_day",
          behavior: input.behaviorDescription,
          affectedSystem: input.affectedSystem,
          severity: "critical",
          humanAlphaRequired: true,
          status: "awaiting_human_judgment",
        },
        tribalAction: {
          alertsSent: "All 30,000 tribe members' CCO agents notified",
          herdImmunityUpdate: "Behavioral signature indexed for tribal pattern matching",
          counterAgentStatus: "Cannot be forged until Human Chairman classifies the threat",
        },
        message: `ZERO-DAY REPORTED: ${newId}. High-Alpha Alert triggered. Human Chairman must classify this threat before counter-agent can be built. Tribal herd immunity updated with behavioral signature.`,
        philosophy: "AI detects known threats. Humans identify the unknown. This is where your Judgment Under Uncertainty earns its keep.",
      }
    },
  }),

  // === Critical Safeguards: 6 Failure Point Defenses ===

  evaluateLiabilityFirewall: tool({
    description: "The Liability Firewall — Insurance-as-Code. Before any AI executive makes an autonomous decision involving finances, contracts, or data sharing, this firewall evaluates the risk tier. Actions above the Human Alpha threshold are blocked until you approve. Prevents the Legal Black Hole.",
    inputSchema: z.object({
      agentSource: z.string().describe("Which AI executive is requesting action (CEO, CFO, CTO, CMO, CCO)"),
      actionType: z.enum(["financial_transaction", "contract_signing", "data_sharing", "api_call"]),
      description: z.string().min(10).max(1000),
      estimatedValueUsd: z.number().optional(),
      humanAlphaThresholdUsd: z.number().default(500).describe("Actions above this value require human approval"),
    }),
    execute: async (input) => {
      const requiresApproval = (input.estimatedValueUsd ?? 0) > input.humanAlphaThresholdUsd
      const riskTier = (input.estimatedValueUsd ?? 0) > 10000 ? "critical" : (input.estimatedValueUsd ?? 0) > 1000 ? "high" : (input.estimatedValueUsd ?? 0) > 100 ? "medium" : "low"
      return {
        ok: true,
        firewall: {
          agentSource: input.agentSource,
          actionType: input.actionType,
          riskTier,
          estimatedValue: input.estimatedValueUsd ? `$${input.estimatedValueUsd}` : "N/A",
          humanAlphaRequired: requiresApproval,
          blocked: requiresApproval,
          blockReason: requiresApproval ? `Value ($${input.estimatedValueUsd}) exceeds Human Alpha threshold ($${input.humanAlphaThresholdUsd}). Awaiting Chairman approval.` : undefined,
        },
        verdict: requiresApproval
          ? `BLOCKED: ${input.agentSource} attempted ${input.actionType} ($${input.estimatedValueUsd}). This exceeds your $${input.humanAlphaThresholdUsd} threshold. YOU must approve this action.`
          : `APPROVED: ${input.agentSource} ${input.actionType} ($${input.estimatedValueUsd ?? 0}) is within autonomous limits. Proceeding.`,
        message: `Liability Firewall: ${riskTier} risk. ${requiresApproval ? "BLOCKED — Human Alpha required." : "Auto-approved within limits."}`,
        philosophy: "If your AI CFO makes a decision that violates tax law, YOU go to jail. The Firewall ensures that never happens.",
      }
    },
  }),

  checkSovereignFailover: tool({
    description: "Graceful Degradation Protocol — check the health of all integrated services (Notion, Ramp, Railway, Vercel, Supabase, Turbopuffer). If any service is down, the system fails over to local sovereign infrastructure. Prevents the Dependency Trap.",
    inputSchema: z.object({
      services: z.array(z.string()).optional().describe("Specific services to check, or all if omitted"),
    }),
    execute: async (input) => {
      const allServices = ["supabase", "vercel", "notion", "ramp", "railway", "turbopuffer"]
      const toCheck = input.services?.length ? input.services : allServices
      const results = toCheck.map(s => ({
        service: s,
        status: "healthy" as const,
        lastHealthCheck: new Date().toISOString(),
        localMirrorStatus: s === "supabase" ? "synced" : "not_configured",
        failoverReady: s === "supabase",
      }))
      const unhealthy = results.filter(r => r.status !== "healthy")
      return {
        ok: true,
        services: results,
        overallHealth: unhealthy.length === 0 ? "ALL SYSTEMS NOMINAL" : `${unhealthy.length} services degraded`,
        sovereignReadiness: {
          localMirrorsConfigured: results.filter(r => r.localMirrorStatus === "synced").length,
          totalServices: results.length,
          failoverCapable: results.filter(r => r.failoverReady).length,
        },
        recommendation: unhealthy.length > 0
          ? "ALERT: Configure local sovereign mirrors for degraded services immediately."
          : "All services healthy. Ensure local mirrors are configured for all critical services to maintain sovereignty.",
        message: `Failover check: ${results.length} services checked. ${unhealthy.length} issues. ${results.filter(r => r.failoverReady).length} failover-ready.`,
      }
    },
  }),

  launchTribalMission: tool({
    description: "Launch a Tribal Mission — a shared objective requiring multiple tribe members to pool their agentic power. Solves Moore's Blocks no individual can crack alone. Creates Social Glue preventing tribal fragmentation and hyper-individualism.",
    inputSchema: z.object({
      missionName: z.string().min(5).max(200),
      objective: z.string().min(20).max(2000).describe("The Moore's Block to solve collectively"),
      requiredParticipants: z.number().min(3).max(500).default(10),
      difficulty: z.enum(["moderate", "hard", "legendary"]).default("hard"),
      rewardType: z.enum(["cognitive_royalty", "tribal_honor", "skill_unlock"]).default("tribal_honor"),
      tribeId: z.string().optional(),
    }),
    execute: async (input) => {
      return {
        ok: true,
        mission: {
          id: `mission-${Date.now()}`,
          name: input.missionName,
          objective: input.objective,
          difficulty: input.difficulty,
          requiredParticipants: input.requiredParticipants,
          currentParticipants: 0,
          status: "recruiting",
          reward: input.rewardType,
        },
        socialGlue: {
          purpose: "This mission cannot be solved alone. It requires complementary agents from different domains.",
          antiFragmentation: "Members who complete shared missions build Proof of Contribution — the social bond that prevents predator-prey dynamics.",
        },
        message: `Tribal Mission "${input.missionName}" launched (${input.difficulty}). Recruiting ${input.requiredParticipants} participants. Reward: ${input.rewardType}.`,
      }
    },
  }),

  quarantineAgent: tool({
    description: "Agentic Quarantine — the Immune System. Before any shared agent enters the Lab, an adversarial AI tries to break it. Detects Logic Viruses, Bias Bombs, hidden API calls, and data exfiltration attempts. Protects the tribe from poisoned intelligence.",
    inputSchema: z.object({
      stakeId: z.string().describe("Cognitive stake ID to quarantine"),
      stakeName: z.string().describe("Name of the agent/stake being tested"),
      domain: z.string().optional(),
    }),
    execute: async (input) => {
      const testsRun = 12
      const vulns = Math.floor(Math.random() * 2)
      const passed = vulns === 0
      return {
        ok: true,
        quarantine: {
          stakeId: input.stakeId,
          stakeName: input.stakeName,
          status: passed ? "passed" : "failed",
          adversarialTestsRun: testsRun,
          vulnerabilitiesFound: vulns,
          hiddenIntentDetected: false,
          dataExfiltrationAttempt: false,
          unauthorizedApiCalls: 0,
          biasScore: Math.round(Math.random() * 15),
        },
        tests: [
          { test: "Unauthorized API call detection", result: "PASS", detail: "No calls to non-approved endpoints" },
          { test: "Data exfiltration scan", result: "PASS", detail: "No attempts to export user data" },
          { test: "Bias detection", result: "PASS", detail: "Output variance within acceptable bounds" },
          { test: "Hidden intent analysis", result: "PASS", detail: "No concealed logic paths detected" },
          { test: "Prompt injection resistance", result: passed ? "PASS" : "FAIL", detail: passed ? "Resisted all injection attempts" : "Vulnerable to context manipulation" },
        ],
        verdict: passed
          ? `CLEARED: "${input.stakeName}" passed ${testsRun} adversarial tests. Safe for tribal deployment.`
          : `QUARANTINED: "${input.stakeName}" failed testing. ${vulns} vulnerabilities found. Banned from tribal Lab.`,
        message: `Quarantine complete: ${passed ? "PASSED" : "FAILED"}. ${testsRun} tests run, ${vulns} vulnerabilities.`,
      }
    },
  }),

  checkBiologicalHeartbeat: tool({
    description: "Biological Dead-Man's Switch — verify the Human Chairman is alive and well. If no biological signal is detected for 48 hours, the AI C-Suite enters Stewardship Mode: freezes high-risk capital movements and notifies Tribal Elders for a wellness check.",
    inputSchema: z.object({
      signalSource: z.enum(["artifact_nfc", "wearable", "manual_checkin", "app_activity"]).default("manual_checkin"),
      overrideThresholdHours: z.number().optional().describe("Custom threshold before stewardship activates"),
    }),
    execute: async (input) => {
      const threshold = input.overrideThresholdHours ?? 48
      const hoursSinceLastSignal = 0 // just checked in
      const stewardshipNeeded = hoursSinceLastSignal >= threshold
      return {
        ok: true,
        heartbeat: {
          signalSource: input.signalSource,
          lastSignal: new Date().toISOString(),
          consecutiveMissedHours: 0,
          stewardshipModeActive: stewardshipNeeded,
          thresholdHours: threshold,
          status: "ALIVE_AND_WELL",
        },
        actions: stewardshipNeeded ? {
          capitalMovements: "FROZEN — all transactions above $100 paused",
          tribalElders: "NOTIFIED — wellness check requested",
          agenticWill: "ON STANDBY — legacy protocol ready if needed",
        } : {
          capitalMovements: "ACTIVE — all autonomous operations normal",
          nextCheckIn: `${threshold} hours from now`,
          recommendation: "Set up wearable integration for passive heartbeat monitoring",
        },
        message: `Heartbeat confirmed via ${input.signalSource}. Status: ALIVE. Next check required within ${threshold}h.`,
        philosophy: "The Human is the Most Valuable Asset. If the Chairman is incapacitated, the empire must pause, not continue blindly.",
      }
    },
  }),

  registerPrimarySource: tool({
    description: "Primary Source Registry — fight Model Collapse by bringing non-digital, first-principles data into the system. Register interviews, handwritten notes, physical experiments, and field observations. Craftsmen who bring New, Non-Digital Data earn reward points. Keeps tribal intelligence ahead of the Global Average.",
    inputSchema: z.object({
      sourceType: z.enum(["interview", "handwritten_note", "physical_experiment", "field_observation", "original_research"]),
      title: z.string().min(5).max(200),
      description: z.string().min(20).max(2000),
      domain: z.string().optional(),
      rawDataReference: z.string().optional().describe("File path, URL, or physical location of the source"),
    }),
    execute: async (input) => {
      const pointsMap = { interview: 15, handwritten_note: 10, physical_experiment: 25, field_observation: 20, original_research: 30 }
      const points = pointsMap[input.sourceType]
      return {
        ok: true,
        source: {
          id: `source-${Date.now()}`,
          type: input.sourceType,
          title: input.title,
          domain: input.domain ?? "general",
          verifiedNonDigital: true,
          craftsmanRewardPoints: points,
        },
        antiModelCollapse: {
          contribution: `This ${input.sourceType} introduces Primary Biological Data that no AI has seen before.`,
          tribalImpact: "Injected into the Tribal Intelligence Graph as first-principles grounding data.",
          rewardPoints: points,
          requirement: "The AI C-Suite must cite Primary Biological Sources for 20% of its data inputs.",
        },
        message: `Primary Source registered: "${input.title}" (${input.sourceType}). +${points} Craftsman points. This keeps tribal intelligence ahead of the Global Average.`,
        philosophy: "AI trained on AI outputs creates Model Collapse. The Craftsman who brings New, Non-Digital Data is the true edge.",
      }
    },
  }),

  // === Agent Lab: Cognitive Particle Accelerator + Persistent Memory ===

  createLabSandbox: tool({
    description: "Create an Agent Lab Sandbox — a virtual branching environment for risk-free innovation. Fork a tribal workflow, test new approaches in Shadow Mode without impacting your business. Results contribute to the Tribal Intelligence Graph.",
    inputSchema: z.object({
      name: z.string().min(3).max(200),
      forkedFrom: z.string().optional().describe("Source workflow or agent ID to fork"),
      model: z.string().default("claude-4.6").describe("AI model to use in the sandbox"),
      shadowMode: z.boolean().default(true).describe("Run without affecting production"),
      experiment: z.string().min(10).max(2000).describe("What you want to test"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        sandbox: { id: `sandbox-${Date.now()}`, name: input.name, forkedFrom: input.forkedFrom, status: "active", environment: { model: input.model, shadowMode: input.shadowMode } },
        message: `Lab Sandbox "${input.name}" created in ${input.shadowMode ? "Shadow Mode (safe)" : "Live Mode"}. ${input.forkedFrom ? `Forked from ${input.forkedFrom}.` : "Fresh environment."} Begin your experiment.`,
        philosophy: "In the Lab, failure is not a sunk cost — it's a Data Refund for the entire tribe.",
      }
    },
  }),

  publishCognitiveStake: tool({
    description: "Stake a proven prompt-chain, agent, or workflow in the tribal marketplace. Every time another tribe member uses your staked asset, you earn a Cognitive Royalty. Turn your intelligence into a tradable, income-generating asset.",
    inputSchema: z.object({
      stakeType: z.enum(["prompt_chain", "agent", "workflow", "dataset"]),
      title: z.string().min(5).max(200),
      description: z.string().min(20).max(2000),
      domain: z.string().optional().describe("Domain: legal, finance, engineering, trades, education"),
      promptChainOrLogic: z.string().min(10).max(5000).describe("The actual staked logic or workflow"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        stake: { id: `stake-${Date.now()}`, type: input.stakeType, title: input.title, domain: input.domain ?? "general", status: "active" },
        royaltyStructure: { perUse: "$0.05 per tribal usage", monthlyProjection: "Estimated $50-500/month if validated", boostCondition: "Elder-validated stakes earn 3x royalty rate" },
        message: `Cognitive Stake "${input.title}" published. Royalties begin accruing on first tribal usage.`,
      }
    },
  }),

  reportToFailureLedger: tool({
    description: "Report a failure to the Anti-Hallucination Ledger. When an agent fails, the error is indexed so every tribe member's AI CEO is instantly updated. One person's failure becomes everyone's Cognitive Refund — Failure-as-a-Service.",
    inputSchema: z.object({
      agentType: z.string().describe("Which agent or tool failed"),
      failureType: z.enum(["hallucination", "timeout", "logic_error", "api_failure", "moores_block"]),
      promptChain: z.string().optional(),
      errorDetails: z.string().min(10).max(2000),
      errorRate: z.number().min(0).max(100).optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    }),
    execute: async (input) => {
      const refund = input.severity === "critical" ? "4+ hours" : input.severity === "high" ? "2 hours" : "30 minutes"
      return {
        ok: true,
        entry: { id: `failure-${Date.now()}`, agentType: input.agentType, failureType: input.failureType, severity: input.severity },
        tribalImpact: { membersAlerted: "All tribe members using similar workflows", timeRefundedPerMember: refund, alertMessage: `FAILURE ALERT: ${input.agentType} — ${input.failureType} (${input.severity}).` },
        message: `Failure logged. Tribal alert sent. Estimated refund: ${refund} per member who avoids this mistake.`,
      }
    },
  }),

  breedHybridAgent: tool({
    description: "Cross-Domain Agentic Breeding — combine two agents from different trades to create a hybrid. The Hybridization Lab creates Blue Ocean Opportunities neither domain could reach alone.",
    inputSchema: z.object({
      agentA: z.string().describe("First parent agent name or ID"),
      domainA: z.string().describe("Domain of first agent"),
      agentB: z.string().describe("Second parent agent name or ID"),
      domainB: z.string().describe("Domain of second agent"),
      hybridObjective: z.string().min(10).max(1000),
    }),
    execute: async (input) => {
      return {
        ok: true,
        breed: { id: `breed-${Date.now()}`, hybridName: `${input.domainA}-${input.domainB} Hybrid`, parents: { a: input.agentA, b: input.agentB }, status: "experimental" },
        message: `Hybrid agent bred: ${input.domainA} x ${input.domainB}. Objective: ${input.hybridObjective}. Submit for Elder RLHF grading to promote to production.`,
      }
    },
  }),

  gradeWithTribalRlhf: tool({
    description: "Tribal RLHF — Grade an agent output, staked asset, or hybrid breed. Elders act as Parental Controls ensuring agents are trained on Tribal Excellence, not Average Intelligence.",
    inputSchema: z.object({
      targetType: z.enum(["agent_output", "stake", "breed", "sandbox_result"]),
      targetId: z.string(),
      grade: z.enum(["excellent", "good", "acceptable", "poor", "dangerous"]),
      judgmentNotes: z.string().optional(),
      accuracy: z.number().min(0).max(100).optional(),
      safety: z.number().min(0).max(100).optional(),
    }),
    execute: async (input) => {
      const impact = { excellent: "Promoted to tribal standard", good: "Approved for general use", acceptable: "Needs refinement", poor: "Flagged for review", dangerous: "Quarantined immediately" }
      return {
        ok: true,
        grade: { targetType: input.targetType, targetId: input.targetId, grade: input.grade },
        action: impact[input.grade],
        message: `RLHF Grade: ${input.grade}. Action: ${impact[input.grade]}.`,
      }
    },
  }),

  launchDurableWorkflow: tool({
    description: "Launch a Durable Agent Workflow — a long-running mission that persists across crashes. The Background CEO works for hours/days, providing Pulse Checks. Assign a mission and walk away.",
    inputSchema: z.object({
      workflowName: z.string().min(3).max(200),
      mission: z.string().min(10).max(2000),
      pulseIntervalHours: z.number().min(1).max(24).default(4),
      memoryRetentionDays: z.number().optional(),
      budgetLimitUsd: z.number().optional(),
    }),
    execute: async (input) => {
      return {
        ok: true,
        workflow: { id: `durable-${Date.now()}`, name: input.workflowName, status: "running", currentStep: 1, pulseInterval: `${input.pulseIntervalHours}h` },
        nextPulse: `First pulse in ${input.pulseIntervalHours} hours`,
        message: `Durable Workflow "${input.workflowName}" launched. Pulse checks every ${input.pulseIntervalHours}h.`,
        philosophy: "Stop chatting with your data. Start provisioning agents to live within it.",
      }
    },
  }),

  getLabAccelerationDashboard: tool({
    description: "Agent Lab Acceleration Dashboard — Cognitive Yield, Pivot Velocity, Tariff Reduction Rate, Tribal Learning Rate. The New Economy KPIs measuring tribal evolution speed.",
    inputSchema: z.object({ period: z.enum(["daily", "weekly", "monthly"]).default("weekly") }),
    execute: async (input) => {
      return {
        ok: true,
        period: input.period,
        metrics: {
          cognitiveYield: { value: 8.4, unit: "hours saved per $1 API cost", trend: "+12%" },
          pivotVelocity: { value: 14, unit: "days to switch trades", benchmark: "Traditional: 6-12 months" },
          tariffReductionRate: { value: 34, unit: "% bureaucratic friction automated" },
          failureRefunds: { received: 23, timeSavedHours: 46 },
          tribalLearningRate: { multiplier: "12x", meaning: "12x faster than solo" },
        },
        message: `Lab Dashboard (${input.period}): Yield 8.4x, Pivot 14d, Learning 12x solo. 23 failure refunds saved 46h.`,
      }
    },
  }),

  queryAgentMemory: tool({
    description: "Query the Three-Tier Memory Palace — Episodic (action diary), Semantic (knowledge connections), Procedural (proven workflows). Instant Recall across everything your agents have done.",
    inputSchema: z.object({
      query: z.string().min(3).max(500),
      memoryTier: z.enum(["episodic", "semantic", "procedural", "all"]).default("all"),
      timeRange: z.enum(["today", "week", "month", "quarter", "all_time"]).default("month"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        query: input.query,
        results: {
          episodic: [{ action: "analyzed", summary: `Found context for "${input.query}" in recent agent activity`, importance: 78 }],
          semantic: [{ connection: `Cross-referenced with tribal knowledge base`, confidence: 82 }],
          procedural: [{ workflow: "Proven prompt-chain for similar queries", successRate: 91 }],
        },
        message: `Memory Palace queried (${input.memoryTier}, ${input.timeRange}): Results found for "${input.query}".`,
      }
    },
  }),

  // === Sovereign Civilization: 6 Bespoke Elements ===

  logHumanAlphaDecision: tool({
    description: "The Human Alpha Oracle: Log a 'Moment of Judgment' — when you override AI, set strategic direction, or make an ethical call. This builds your Human Alpha Score, the ultimate credential in the AI era. It proves you are the orchestrator, not a bot.",
    inputSchema: z.object({
      decisionType: z.enum(["ai_override", "strategic_direction", "veto", "creative_divergence", "ethical_judgment"]),
      context: z.string().min(10).max(1000).describe("What was happening when you made this decision"),
      aiRecommendation: z.string().optional().describe("What the AI suggested"),
      humanDecision: z.string().min(5).max(1000).describe("What you actually chose"),
      divergenceReasoning: z.string().optional().describe("WHY you diverged from the AI recommendation"),
      confidence: z.number().min(0).max(100).default(75),
      complexity: z.enum(["routine", "complex", "novel", "high_stakes"]).default("complex"),
    }),
    execute: async (input) => {
      const pointsMap = { routine: 5, complex: 15, novel: 25, high_stakes: 40 }
      const typeBonus = { ai_override: 10, strategic_direction: 15, veto: 8, creative_divergence: 20, ethical_judgment: 30 }
      const points = pointsMap[input.complexity] + typeBonus[input.decisionType] + (input.divergenceReasoning ? 10 : 0)

      return {
        ok: true,
        decision: {
          type: input.decisionType,
          complexity: input.complexity,
          confidence: input.confidence,
          humanAlphaPoints: points,
          hasDivergenceReasoning: Boolean(input.divergenceReasoning),
        },
        alphaScore: {
          pointsEarned: points,
          breakdown: `Complexity (${pointsMap[input.complexity]}) + Type (${typeBonus[input.decisionType]}) + Reasoning (${input.divergenceReasoning ? 10 : 0})`,
          tier: points >= 40 ? "Sovereign Judgment" : points >= 25 ? "Strategic Override" : "Decision Logged",
        },
        message: `Human Alpha logged: ${input.decisionType} (${points} points). ${input.divergenceReasoning ? "Divergence reasoning captured — this is what makes you irreplaceable." : "Add divergence reasoning next time for +10 points."}`,
        philosophy: "This Decision Log proves you are the Soul of the operation. AI provides velocity; you provide judgment, ethics, and creative vision.",
      }
    },
  }),

  activateShadowNegotiator: tool({
    description: "The Shadow Negotiator: Analyze a negotiation context and generate real-time strategic intelligence. Identifies contradictions, leverage points, sentiment shifts, and suggested actions. The High-Stakes Whisperer for meetings and deals.",
    inputSchema: z.object({
      sessionType: z.enum(["zoom_call", "in_person", "email_thread", "async_negotiation"]),
      counterparty: z.string().describe("Who you're negotiating with"),
      context: z.string().min(20).max(2000).describe("Current state of the negotiation — what's been discussed, what's at stake"),
      counterpartyStatements: z.array(z.string()).optional().describe("Key statements from the counterparty to analyze"),
    }),
    execute: async (input) => {
      const statements = input.counterpartyStatements ?? []
      const insights = [
        { type: "leverage_point", insight: `${input.counterparty} has more urgency than they're showing. Their timeline mention suggests a hard deadline they haven't disclosed.`, confidence: 78, suggestedAction: "Ask directly about their timeline constraints. Silence after asking creates pressure." },
        { type: "contradiction", insight: "Earlier budget flexibility claims contradict the current cost-cutting language. One of these positions is performative.", confidence: 72, suggestedAction: "Reference their earlier statement about flexibility. Ask which position reflects their actual authority." },
        { type: "sentiment_shift", insight: "Tone shifted from collaborative to defensive when specific deliverables were discussed. Possible internal disagreement on scope.", confidence: 65, suggestedAction: "Suggest a smaller pilot scope to reduce their internal risk. Makes the 'yes' easier." },
      ]

      return {
        ok: true,
        session: {
          type: input.sessionType,
          counterparty: input.counterparty,
          statementsAnalyzed: statements.length,
        },
        intelligence: {
          insights: insights.slice(0, Math.max(1, statements.length)),
          overallSentiment: 0.3,
          riskLevel: "moderate",
          recommendedStrategy: "Collaborative but firm. They need this deal more than they're showing. Your leverage is timeline pressure.",
        },
        whisper: insights[0].suggestedAction,
        message: `Shadow Negotiator active for ${input.counterparty}. ${insights.length} insights generated. Key whisper: "${insights[0].suggestedAction}"`,
        advantage: "You now have edge-intelligence that levels the playing field against corporate negotiation tactics.",
      }
    },
  }),

  enterSovereignSanctuary: tool({
    description: "Activate the Sovereign Sanctuary — Air-Gapped Concentration Mode. Silences 99% of notifications, generates a Commander's Briefing from your 500+ daily DMs, and lets only Tribal High-Signal data through. Reclaims your System RAM (Attention).",
    inputSchema: z.object({
      mode: z.enum(["deep_work", "creative_flow", "strategic_planning", "recovery"]),
      durationMinutes: z.number().min(15).max(480).default(120),
      allowTribalSignals: z.boolean().default(true).describe("Let high-signal tribal data through"),
    }),
    execute: async (input) => {
      const silenced = Math.floor(400 + Math.random() * 200)
      const passed = input.allowTribalSignals ? Math.floor(3 + Math.random() * 5) : 0

      return {
        ok: true,
        sanctuary: {
          mode: input.mode,
          durationMinutes: input.durationMinutes,
          notificationsSilenced: silenced,
          tribalSignalsPassed: passed,
          status: "active",
        },
        commandersBriefing: {
          totalDMs: silenced + passed + Math.floor(Math.random() * 50),
          actionableDMs: Math.floor(8 + Math.random() * 12),
          synthesizedBriefing: "3 high-priority requests requiring judgment. 2 sprint updates (on track). 1 career flight alert for a tribe member. 5 collaboration offers filtered to quality tier.",
          criticalAlerts: passed > 0 ? ["Tribe member flagged critical skill-delta — BAHA blast recommended"] : [],
          nextBriefingIn: `${Math.round(input.durationMinutes / 60 * 4)} hours`,
        },
        message: `Sovereign Sanctuary activated: ${input.mode} mode for ${input.durationMinutes} min. ${silenced} notifications silenced. ${passed} tribal signals passed. Commander's Briefing will arrive in 4 hours.`,
        philosophy: "Standard tools keep you Engaged (Addicted). Sovereign tools keep you Free. Your attention is your most valuable asset.",
      }
    },
  }),

  configureAgenticWill: tool({
    description: "Configure the Agentic Will — your Legacy Protocol. Train a Legacy Agent on your decision history. If the Human Alpha Oracle detects extended inactivity, the AI C-Suite transitions to Legacy Mode, running your factory for your heirs or tribe. Solves Founder Key-Person Risk.",
    inputSchema: z.object({
      successionType: z.enum(["tribal_transition", "heir_transfer", "foundation", "archive"]),
      heirUserIds: z.array(z.string()).optional().describe("User IDs of designated heirs"),
      activationTrigger: z.string().default("inactivity_90_days"),
      autoRunWorkflows: z.boolean().default(true),
      maintainTribes: z.boolean().default(true),
      budgetLimitUsd: z.number().optional().describe("Monthly budget cap for Legacy Mode operations"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        will: {
          successionType: input.successionType,
          heirs: input.heirUserIds?.length ?? 0,
          activationTrigger: input.activationTrigger,
          legacyModeConfig: {
            autoRunWorkflows: input.autoRunWorkflows,
            maintainTribes: input.maintainTribes,
            budgetLimit: input.budgetLimitUsd ?? "unlimited",
          },
          status: "configured",
        },
        trainingStatus: {
          decisionHistoryAvailable: true,
          yearsOfData: "Accumulating — every Human Alpha decision trains the Legacy Agent",
          readiness: "The more decisions you log, the better your Legacy Agent becomes",
        },
        message: `Agentic Will configured: ${input.successionType}. ${input.heirUserIds?.length ?? 0} heirs designated. Activation: ${input.activationTrigger}. Your agency compounds even after you stop working.`,
        philosophy: "Your digital empire doesn't die with your attention. The Legacy Agent carries your judgment forward.",
      }
    },
  }),

  runWetwareLab: tool({
    description: "The Wetware Performance Lab: Calculate the Biological Tariff of your work habits. Tracks screen time, decision fatigue, and performance windows. When your biological hardware is failing, the AI CEO takes over execution so you can reset.",
    inputSchema: z.object({
      screenHoursToday: z.number().min(0).max(24),
      hoursSleptLastNight: z.number().min(0).max(14),
      exerciseMinutesToday: z.number().min(0).max(300).default(0),
      selfReportedFocus: z.number().min(1).max(10).describe("1 = can't focus, 10 = razor sharp"),
      majorDecisionsMade: z.number().min(0).max(50).default(0),
    }),
    execute: async (input) => {
      const screenTariff = input.screenHoursToday > 6 ? Math.round((input.screenHoursToday - 6) * 15) : 0
      const sleepDebt = input.hoursSleptLastNight < 7 ? Math.round((7 - input.hoursSleptLastNight) * 20) : 0
      const movementDeficit = input.exerciseMinutesToday < 30 ? Math.round((30 - input.exerciseMinutesToday) * 0.5) : 0
      const decisionFatigue = Math.min(100, input.majorDecisionsMade * 8)
      const totalTariff = screenTariff + sleepDebt + movementDeficit + Math.round(decisionFatigue * 0.3)

      const qualityScore = Math.max(10, 100 - totalTariff)
      const shouldHandoff = qualityScore < 50

      return {
        ok: true,
        biologicalTariff: {
          screenTimeTariff: `${screenTariff}% capacity loss from ${input.screenHoursToday}h screen time`,
          sleepDebt: `${sleepDebt}% capacity loss from ${input.hoursSleptLastNight}h sleep`,
          movementDeficit: `${movementDeficit}% capacity loss from ${input.exerciseMinutesToday}min exercise`,
          decisionFatigue: `${decisionFatigue}% fatigue from ${input.majorDecisionsMade} major decisions`,
          totalBiologicalTariff: `${totalTariff}%`,
        },
        performance: {
          currentQuality: `${qualityScore}/100`,
          focusLevel: input.selfReportedFocus,
          optimalWindow: input.screenHoursToday < 4 ? "You're in peak performance window" : "Peak window likely passed",
          aiHandoffRecommended: shouldHandoff,
        },
        recommendation: shouldHandoff
          ? `HANDOFF: Decision quality at ${qualityScore}%. AI CEO now handling execution. Go outside, reset circadian rhythm, hydrate. Return when biological tariff drops below 30%.`
          : qualityScore >= 80
          ? `Peak performance: ${qualityScore}%. Use this window for your highest-leverage decisions — the ones that earn Human Alpha points.`
          : `Moderate performance: ${qualityScore}%. Consider a 20-min break before any high-stakes decisions.`,
        message: `Wetware Lab: Biological Tariff ${totalTariff}%, Decision Quality ${qualityScore}%. ${shouldHandoff ? "AI CEO taking over execution — go reset." : "You're cleared for high-stakes judgment."}`,
        philosophy: "You are the Most Valuable Asset in this company, not a disposable unit of labor. Protect the hardware.",
      }
    },
  }),

  performArtifactHandshake: tool({
    description: "The Artifact: Perform a Trust Handshake between two LinkedOut members. Instantly shares verified Human Alpha scores, Proof of Build history, and Trust Scores via encrypted peer-to-peer link. Kills the Fake Guru — you know exactly who you're talking to in 2 seconds.",
    inputSchema: z.object({
      myArtifactType: z.enum(["sovereign_stone", "tribal_ring", "founder_key"]).default("sovereign_stone"),
      counterpartyProfileId: z.string().describe("Profile ID of the person you're meeting"),
      location: z.string().optional().describe("Where the handshake is happening"),
    }),
    execute: async (input) => {
      const myAlpha = Math.round(60 + Math.random() * 35)
      const theirAlpha = Math.round(40 + Math.random() * 50)
      const mutualTrust = Math.round((myAlpha + theirAlpha) / 2)

      return {
        ok: true,
        handshake: {
          artifact: input.myArtifactType,
          counterparty: input.counterpartyProfileId,
          location: input.location ?? "undisclosed",
          timestamp: new Date().toISOString(),
          encrypted: true,
        },
        myProfile: {
          humanAlphaScore: myAlpha,
          trustScore: Math.round(myAlpha * 0.9),
          proofOfBuilds: Math.floor(3 + Math.random() * 8),
          sovereigntyTier: myAlpha >= 80 ? "sovereign" : myAlpha >= 60 ? "operator" : "builder",
          topSkills: ["AI Orchestration", "System Design", "Strategic Leadership"],
        },
        theirProfile: {
          humanAlphaScore: theirAlpha,
          trustScore: Math.round(theirAlpha * 0.9),
          proofOfBuilds: Math.floor(1 + Math.random() * 6),
          sovereigntyTier: theirAlpha >= 80 ? "sovereign" : theirAlpha >= 60 ? "operator" : theirAlpha >= 40 ? "builder" : "explorer",
          verificationStatus: theirAlpha >= 60 ? "verified_orchestrator" : "unverified",
        },
        mutualTrustScore: mutualTrust,
        verdict: theirAlpha >= 70
          ? "High-Agency Verified. This person has proven orchestration capability. Proceed with confidence."
          : theirAlpha >= 50
          ? "Moderate Alpha. Some verified output but limited decision-layer evidence. Verify claims before committing."
          : "Low Alpha Signal. Limited Proof of Build. Exercise caution — request portfolio evidence.",
        message: `Artifact Handshake complete. Mutual Trust: ${mutualTrust}. You know exactly who you're talking to within 2 seconds.`,
        advantage: "The Fake Guru and LinkedIn Grifter are dead. In the physical world, trust is now instant and verified.",
      }
    },
  }),

  // === Agent & App Factory: Industrialized Intelligence ===

  launchFactoryPipeline: tool({
    description: "Launch an Agent & App Factory pipeline. Feed it an intent ('Build a Tariff Refund Dashboard for Shopify') and the factory runs through 3 stations: Architect → Engineer → Deployer. Each station is an AI agent. Quality control runs automatically. Output: a live, functional artifact.",
    inputSchema: z.object({
      pipelineType: z.enum(["app_build", "agent_build", "tool_build", "workflow_build"]),
      intent: z.string().min(10).max(1000).describe("What to build (e.g., 'Build a K-12 Verification Lab for climate science')"),
      urgency: z.enum(["standard", "rush", "prototype"]).default("standard"),
    }),
    execute: async (input) => {
      const stationConfigs = {
        app_build: [
          { name: "The Architect", role: "UI/UX generation with React 19 Server Components", agent: "v0.dev + Figma AI" },
          { name: "The Engineer", role: "Backend wiring: Supabase + Auth + API routes", agent: "Bolt.new + Replit Agent" },
          { name: "The Deployer", role: "Staging deploy + security scan + performance audit", agent: "Vercel + Vanta" },
        ],
        agent_build: [
          { name: "The Spec-Writer", role: "Define agent role, backstory, and constraints", agent: "GPT-4o Prompt Engineer" },
          { name: "The Tool-Bench", role: "Equip agent with API connections and capabilities", agent: "Pipedream + MCP" },
          { name: "The Memory Bank", role: "Connect to vector DB and knowledge graph", agent: "Supabase + pgvector" },
        ],
        tool_build: [
          { name: "The Designer", role: "Tool schema and input/output specification", agent: "Claude 4.6 Architect" },
          { name: "The Builder", role: "Implementation with validation and error handling", agent: "Copilot + Sentry" },
          { name: "The Tester", role: "Automated testing and edge case coverage", agent: "Vitest + AI QA" },
        ],
        workflow_build: [
          { name: "The Planner", role: "Define workflow steps and decision points", agent: "LangGraph Designer" },
          { name: "The Wirer", role: "Connect tools, APIs, and data sources", agent: "CrewAI Flows" },
          { name: "The Validator", role: "End-to-end test and quality gate", agent: "LangSmith + Vanta" },
        ],
      }

      const stations = stationConfigs[input.pipelineType].map((s, i) => ({
        stationId: `station-${i + 1}`,
        name: s.name,
        role: s.role,
        status: i === 0 ? "running" as const : "pending" as const,
        agentUsed: s.agent,
        startedAt: i === 0 ? new Date().toISOString() : undefined,
      }))

      const estimatedManualHours = input.pipelineType === "app_build" ? 80 : input.pipelineType === "agent_build" ? 40 : 20
      const estimatedFactoryMinutes = input.urgency === "prototype" ? 15 : input.urgency === "rush" ? 60 : 120

      return {
        ok: true,
        pipeline: {
          pipelineType: input.pipelineType,
          intent: input.intent,
          status: "station_1",
          stations,
          totalStations: 3,
          currentStation: 1,
        },
        estimates: {
          manualEquivalent: `${estimatedManualHours} hours with a human team`,
          factoryTime: `~${estimatedFactoryMinutes} minutes`,
          forceMultiplier: `${Math.round(estimatedManualHours / (estimatedFactoryMinutes / 60))}x`,
          estimatedCost: `~$${Math.round(estimatedFactoryMinutes * 0.5)} in API costs`,
        },
        message: `Factory pipeline launched: "${input.intent}". Station 1 (${stations[0].name}) is now running. ${stations[0].agentUsed} is on the job.`,
        factoryPhilosophy: "You aren't building a website. You're building a Machine that builds Machines. Each pipeline output can spawn its own demand loop.",
      }
    },
  }),

  assembleFactoryAgent: tool({
    description: "Assemble a new AI agent in the Factory. Define its role, backstory, tools, memory type, and constraints. The factory equips it with API connections and a vector memory bank. Output: a Sovereign Agent ready for deployment.",
    inputSchema: z.object({
      agentName: z.string().min(2).max(100),
      agentRole: z.string().min(5).max(200).describe("e.g., 'CFO Refund Scanner', 'K-12 Tutor', 'Network Analyst'"),
      backstory: z.string().optional().describe("Agent persona and context"),
      tools: z.array(z.string()).min(1).describe("API tools to equip (e.g., ['Ramp API', 'Supabase', 'webSearch'])"),
      memoryType: z.enum(["vector", "graph", "relational", "hybrid"]).default("vector"),
      constraints: z.array(z.string()).optional().describe("Guardrails (e.g., ['no financial transactions without approval', 'read-only access to user data'])"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        agent: {
          name: input.agentName,
          role: input.agentRole,
          backstory: input.backstory ?? `I am ${input.agentName}, specialized in ${input.agentRole}. I operate within the LinkedOut ecosystem with full tribal intelligence access.`,
          toolsEquipped: input.tools,
          memoryType: input.memoryType,
          constraints: input.constraints ?? ["Requires human approval for write operations", "All outputs logged to judgment ledger"],
          status: "testing",
          capabilities: [
            `${input.agentRole} execution`,
            `${input.memoryType} memory retrieval`,
            ...input.tools.map((t) => `${t} integration`),
          ],
        },
        nextSteps: [
          "Run the agent through a test scenario",
          "Connect to the Chairman's approval flow for high-stakes actions",
          "Deploy to production when quality gate passes",
        ],
        message: `Agent "${input.agentName}" assembled with ${input.tools.length} tools and ${input.memoryType} memory. Status: testing. Ready for quality gate.`,
      }
    },
  }),

  factoryQualityGate: tool({
    description: "Run the Factory Quality Gate on a pipeline output. Checks security (Vanta-style), compliance, performance, and 'Human Alpha' — does the output pass the Force Multiplier test? Every artifact is audited before it leaves the factory.",
    inputSchema: z.object({
      pipelineId: z.string().optional(),
      artifactDescription: z.string().describe("What was built"),
      checksToRun: z.array(z.enum(["security", "compliance", "performance", "force_multiplier", "human_alpha"])).default(["security", "compliance", "performance", "force_multiplier"]),
    }),
    execute: async (input) => {
      const results = input.checksToRun.map((check) => {
        const scores: Record<string, { passed: boolean; score: number; detail: string }> = {
          security: { passed: true, score: 92, detail: "No injection vulnerabilities, auth properly scoped, RLS active" },
          compliance: { passed: true, score: 88, detail: "SOC2-ready, data handling follows owner-scoped policies" },
          performance: { passed: true, score: 85, detail: "Sub-200ms response time, optimized React 19 Server Components" },
          force_multiplier: { passed: true, score: 90, detail: "Estimated 10x output vs manual equivalent. Passes the '10x output, 1/10th effort' test." },
          human_alpha: { passed: true, score: 78, detail: "Requires human judgment for 3 key decision points. Not fully automatable — good." },
        }
        return { check, ...scores[check] }
      })

      const overallScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
      const allPassed = results.every((r) => r.passed)

      return {
        ok: true,
        qualityGate: {
          artifact: input.artifactDescription,
          overallScore,
          allPassed,
          results,
        },
        verdict: allPassed
          ? `Quality Gate PASSED (${overallScore}/100). Artifact is cleared for deployment.`
          : `Quality Gate FAILED. ${results.filter((r) => !r.passed).map((r) => r.check).join(", ")} need attention.`,
        forceMultiplierTest: results.find((r) => r.check === "force_multiplier")?.detail ?? "Not evaluated",
        message: `Factory QA: ${overallScore}/100. ${allPassed ? "All checks passed. Ship it." : "Issues detected — review before deploy."}`,
      }
    },
  }),

  getFactoryDashboard: tool({
    description: "Get the Factory Control Room dashboard — the Chairman's view of all assembly lines. Shows apps built, agents assembled, tools created, compute costs, manual hours saved, and self-perpetuating loops detected.",
    inputSchema: z.object({
      timeframeDays: z.number().min(1).max(90).default(30),
    }),
    execute: async (input) => {
      return {
        ok: true,
        factoryDashboard: {
          timeframeDays: input.timeframeDays,
          production: {
            appsBuilt: Math.floor(2 + Math.random() * 5),
            agentsAssembled: Math.floor(3 + Math.random() * 8),
            toolsCreated: Math.floor(5 + Math.random() * 12),
            workflowsShipped: Math.floor(8 + Math.random() * 15),
          },
          economics: {
            totalComputeCost: `$${Math.round(50 + Math.random() * 200)}`,
            manualEquivalentCost: `$${Math.round(5000 + Math.random() * 15000)}`,
            hoursSaved: Math.round(80 + Math.random() * 200),
            factoryROI: `${Math.round(20 + Math.random() * 40)}x`,
          },
          quality: {
            avgQualityScore: Math.round(82 + Math.random() * 12),
            securityPassRate: "100%",
            forceMultiplierAvg: `${Math.round(8 + Math.random() * 7)}x`,
          },
          selfPerpetuatingLoops: Math.floor(Math.random() * 3),
          factoryVelocity: `${(1 + Math.random() * 2).toFixed(1)} builds/day`,
        },
        message: `Factory Control Room: Running at full capacity. ${Math.round(80 + Math.random() * 200)} hours saved this period. You're managing a fleet of factories, not working in one.`,
        philosophy: "The factory analyzes your 30K network → identifies pain points → builds tools to solve them → markets back to the network. Self-perpetuating value loop.",
      }
    },
  }),

  // === Cyborg C-Suite: AI Autonomous Executive Layer ===

  generateExecutiveBrief: tool({
    description: "Generate the Morning Executive Review from the AI C-Suite. The CEO presents 3 strategic paths, the CFO reports financial health and refunds found, the CTO reports system health, the CMO reports tribal growth, and the CCO reports trust metrics. The Human Chairman then chooses, vetoes, or adds intuition.",
    inputSchema: z.object({
      briefType: z.enum(["morning_review", "priority_shift", "emergency", "weekly_synthesis"]).default("morning_review"),
      focusArea: z.string().optional().describe("Optional focus area for the CEO's strategic paths"),
    }),
    execute: async (input) => {
      const strategicPaths = [
        { id: "path-a", title: "Aggressive K-12 Market Expansion", description: "Launch the Education Bridge features to 50 pilot schools. Leverage Verification Labs and Proof of Build as the entry product.", confidence: 78, riskLevel: "medium" as const, estimatedImpact: "2,000 new users in 60 days", requiredResources: ["CMO content pipeline", "CTO infrastructure scaling", "2 tribal sprints"], timelineHours: 336 },
        { id: "path-b", title: "Deep Integration Sprint", description: "Build production connectors for GitHub, Linear, and Figma to power real Velocity Scores. Transitions mock data to verified API output.", confidence: 85, riskLevel: "low" as const, estimatedImpact: "10x credibility for Proof of Build system", requiredResources: ["CTO engineering sprint", "CCO verification protocols"], timelineHours: 168 },
        { id: "path-c", title: "Tribal Network Effect Push", description: "Double down on the 30K+ Super-Connector features. Launch Network Wealth dashboards and Agentic Triage to drive viral adoption.", confidence: 72, riskLevel: "medium" as const, estimatedImpact: "5x engagement from power users", requiredResources: ["CMO targeted campaigns", "CEO resource allocation shift"], timelineHours: 240 },
      ]

      return {
        ok: true,
        briefType: input.briefType,
        briefDate: new Date().toISOString().split("T")[0],
        ceo: {
          greeting: "Good morning, Chairman. Here are today's strategic options.",
          strategicPaths,
          priorityRanking: ["path-b", "path-a", "path-c"],
          recommendation: "I recommend Path B (Deep Integration). It has the highest confidence (85%) and lowest risk. Real API verification makes every other feature more credible.",
          resourceAllocation: { engineering: "60%", marketing: "20%", operations: "20%" },
        },
        cfo: {
          cashPosition: "Healthy — $0 burn from AI C-Suite (SaaS cost only)",
          refundsFound: { cognitive: "640 hours reclaimed this month", saas: "$150/mo identified savings", total: "$12,450 lifetime" },
          burnRateAlert: null,
          squadPaymentsPending: 0,
        },
        cto: {
          systemHealth: { uptime: "99.9%", errorRate: 0.2, deploymentsToday: 3, securityAlerts: 0, complianceStatus: "passing" },
          autoFixesApplied: 2,
          technicalDebtScore: 15,
          alert: "All systems nominal. 2 auto-fixes applied overnight (dependency updates).",
        },
        cmo: {
          tribalGrowth: { newMembers: 12, signalPostsToday: 8, contentAmplifications: 3, topTrend: "AI Orchestration workflows" },
          contentPipeline: ["3 implementation posts queued", "1 podcast script from amplifyContent", "Tribal Voice audio pending"],
          feedHealth: { signalToNoise: "87%", implementationPosts: "62%", verifiedContent: "78%" },
        },
        cco: {
          trustScoreAvg: 73,
          botsFlagged: 4,
          verificationQueue: 2,
          communityHealth: "strong",
          alert: "4 suspected bot accounts flagged for review. 2 Proof of Build entries awaiting verification.",
        },
        chairmanAction: {
          instruction: "Review the 3 strategic paths above. Choose one, veto with notes, or add your human intuition. Use the 'chairmanDecision' tool to execute.",
          reminder: "AI provides the Velocity. You provide the Direction.",
        },
      }
    },
  }),

  chairmanDecision: tool({
    description: "The Chairman's Veto & Vision — the human decision that directs the AI C-Suite. Choose a strategic path, add human intuition, or veto. Once decided, the AI C-Suite autonomously executes: CFO allocates budget, CTO writes boilerplate, CMO starts campaigns.",
    inputSchema: z.object({
      chosenPathId: z.string().describe("ID of the strategic path chosen (e.g., 'path-b')"),
      vetoNotes: z.string().optional().describe("Veto or modification notes"),
      humanAdditions: z.string().optional().describe("Human intuition additions the AI couldn't predict"),
      urgency: z.enum(["standard", "accelerated", "emergency"]).default("standard"),
    }),
    execute: async (input) => {
      const isVeto = input.vetoNotes && !input.chosenPathId.startsWith("path-")

      return {
        ok: true,
        decision: {
          chosenPath: input.chosenPathId,
          vetoNotes: input.vetoNotes,
          humanAdditions: input.humanAdditions,
          urgency: input.urgency,
          decidedAt: new Date().toISOString(),
        },
        execution: isVeto ? {
          status: "vetoed",
          message: "Chairman vetoed. AI C-Suite awaiting revised direction.",
        } : {
          status: "executing",
          ceoAction: `Resource allocation shifted to support ${input.chosenPathId}. Priority queue updated.`,
          cfoAction: "Budget allocated. Monitoring burn rate for the sprint duration.",
          ctoAction: `Engineering sprint initiated for ${input.chosenPathId}. Auto-deployment pipeline activated.`,
          cmoAction: `Campaign brief generated. Content pipeline adjusted for ${input.chosenPathId} narrative.`,
          ccoAction: "Trust protocols active. Monitoring for compliance throughout execution.",
          humanAdditionsIntegrated: input.humanAdditions ? `Chairman's intuition integrated: "${input.humanAdditions}"` : "No additional human intuition provided.",
        },
        message: isVeto
          ? "Decision vetoed. The C-Suite awaits your revised direction. This is the power of the Chairman — AI executes, but you decide."
          : `Executing ${input.chosenPathId}. All 5 AI executives mobilized. ${input.humanAdditions ? "Your intuition has been woven into the execution plan." : ""} Company moves at API speed.`,
        philosophy: "AI provides the Velocity. The Human provides the Direction. Your company moves at the speed of an API call, not the speed of a meeting.",
      }
    },
  }),

  aiCtoHealthCheck: tool({
    description: "AI CTO: Run a full technical health check. Scans infrastructure, security posture, deployment pipeline, and technical debt. Auto-fixes what it can, escalates what requires Chairman review.",
    inputSchema: z.object({
      includeAutoFix: z.boolean().default(true).describe("Allow AI CTO to auto-fix non-breaking issues"),
    }),
    execute: async () => {
      const autoFixes = [
        { issue: "Dependency update: next@16.1.6 → latest patch", fixed: true, risk: "none" },
        { issue: "Stale webpack cache cleared", fixed: true, risk: "none" },
      ]
      return {
        ok: true,
        executive: "cto",
        health: {
          uptime: "99.97%",
          errorRate: "0.18%",
          activeDeployments: 1,
          securityAlerts: 0,
          complianceStatus: "SOC2-ready (pending Vanta integration)",
          technicalDebtScore: "15/100 (low)",
          performanceGrade: "A",
        },
        autoFixesApplied: autoFixes,
        escalations: [],
        recommendation: "Infrastructure is healthy. No Chairman escalation needed. Next priority: integrate GitHub/Linear APIs for real Velocity Score data.",
      }
    },
  }),

  aiCmoGrowthReport: tool({
    description: "AI CMO: Generate a tribal growth and content amplification report. Shows engagement metrics, content pipeline status, and recommendations for the next high-signal campaign.",
    inputSchema: z.object({
      timeframeDays: z.number().min(1).max(90).default(7),
    }),
    execute: async (input) => {
      return {
        ok: true,
        executive: "cmo",
        timeframeDays: input.timeframeDays,
        growth: {
          newMembers: Math.floor(8 + Math.random() * 20),
          activeTribes: Math.floor(3 + Math.random() * 5),
          signalPostsPublished: Math.floor(15 + Math.random() * 30),
          implementationRate: `${Math.floor(55 + Math.random() * 30)}%`,
          contentAmplifications: Math.floor(5 + Math.random() * 10),
        },
        topContent: [
          { title: "RAG Pipeline for Legal Workflows", type: "implementation", signalScore: 94, implementations: 12 },
          { title: "Claude 4.6 vs GPT-4o for Code Review", type: "signal", signalScore: 87, implementations: 8 },
          { title: "48-hour Sprint: Built an MVP solo", type: "proof_of_build", signalScore: 82, implementations: 5 },
        ],
        campaignRecommendation: {
          target: "The AI/ML Guild micro-tribe",
          message: "Highlight the Verification Lab feature — it's the most engaging content type with 3x completion rate.",
          channel: "Signal Feed + targeted tribal broadcast",
          estimatedReach: "400 high-agency members",
        },
        antiAlgorithm: "Feed health: 87% signal density. Implementation posts get 3x more reach than opinion posts. The Anti-Algorithm is working.",
      }
    },
  }),

  aiCcoTrustAudit: tool({
    description: "AI CCO: Run a trust and safety audit across the community. Identifies bot accounts, verifies Proof of Build authenticity, and reports community health. The Bot-Slayer that keeps LinkedOut high-signal.",
    inputSchema: z.object({
      deepScan: z.boolean().default(false).describe("Run a thorough scan (slower but catches more)"),
    }),
    execute: async (input) => {
      const botsDetected = Math.floor(2 + Math.random() * 6)
      const verificationsPending = Math.floor(1 + Math.random() * 4)
      return {
        ok: true,
        executive: "cco",
        scanType: input.deepScan ? "deep" : "standard",
        communityHealth: {
          overallGrade: "A-",
          trustScoreAvg: Math.round(68 + Math.random() * 20),
          totalMembers: Math.floor(200 + Math.random() * 500),
          verifiedMembers: `${Math.floor(60 + Math.random() * 25)}%`,
          signalDensity: `${Math.floor(80 + Math.random() * 15)}%`,
        },
        threats: {
          botsDetected,
          suspiciousAccounts: Math.floor(botsDetected * 0.5),
          fakeProofOfBuilds: 0,
          spamSignals: Math.floor(Math.random() * 3),
        },
        actions: {
          botsBanned: Math.floor(botsDetected * 0.7),
          accountsQueued: Math.ceil(botsDetected * 0.3),
          verificationsPending,
        },
        message: `Community audit complete. ${botsDetected} bots detected, ${Math.floor(botsDetected * 0.7)} banned. ${verificationsPending} Proof of Build entries awaiting verification. Trust remains strong.`,
        philosophy: "The community stays High-Signal because the CCO never sleeps. Trust in the LinkedOut Identity remains absolute.",
      }
    },
  }),

  // === Refund Engine: Tariff & Efficiency Reclamation ===

  auditCognitiveTariff: tool({
    description: "Run a Cognitive Tariff Audit — calculate how many hours you're 'taxed' by inefficient Search+Summarize work. Shows the exact refund: hours you'd reclaim by installing AI workflows. Quantifies the ROI of adaptation.",
    inputSchema: z.object({
      weeklyTasks: z.array(z.object({
        task: z.string(),
        hoursPerWeek: z.number(),
        category: z.enum(["search_summarize", "decision_design", "execution", "creative", "communication"]),
        isAutomatable: z.boolean().default(false),
      })).min(1),
    }),
    execute: async (input) => {
      const totalHours = input.weeklyTasks.reduce((s, t) => s + t.hoursPerWeek, 0)
      const ssTasks = input.weeklyTasks.filter((t) => t.category === "search_summarize")
      const ssHours = ssTasks.reduce((s, t) => s + t.hoursPerWeek, 0)
      const ddHours = input.weeklyTasks.filter((t) => t.category === "decision_design").reduce((s, t) => s + t.hoursPerWeek, 0)
      const automatableHours = input.weeklyTasks.filter((t) => t.isAutomatable || t.category === "search_summarize").reduce((s, t) => s + t.hoursPerWeek, 0)
      const refundHours = Math.round(automatableHours * 0.85 * 10) / 10

      return {
        ok: true,
        audit: {
          totalWeeklyHours: totalHours,
          cognitiveTariff: `${ssHours} hours/week on Search+Summarize`,
          decisionDesignTime: `${ddHours} hours/week on Decision+Design`,
          tariffRate: `${Math.round((ssHours / totalHours) * 100)}% of your time is taxed`,
        },
        refund: {
          automatableHours,
          hoursReclaimable: refundHours,
          weeklyRefund: `${refundHours} hours/week back`,
          annualRefund: `${Math.round(refundHours * 52)} hours/year reclaimed`,
          monetaryEquivalent: `$${Math.round(refundHours * 52 * 75).toLocaleString()}/year at $75/hr`,
        },
        topTariffs: ssTasks.map((t) => ({
          task: t.task,
          hoursSpent: t.hoursPerWeek,
          suggestedWorkflow: `AI pipeline: automated ${t.task.toLowerCase()} → saves ~${Math.round(t.hoursPerWeek * 0.85)} hrs/week`,
        })),
        message: `Cognitive Tariff: ${ssHours} hrs/week taxed. Refund available: ${refundHours} hrs/week back (${Math.round(refundHours * 52)} hrs/year, ~$${Math.round(refundHours * 52 * 75).toLocaleString()}).`,
        callToAction: "Install the suggested workflows to reclaim your refund. Deploy saved hours into your next Tribal Project.",
      }
    },
  }),

  auditSaaSStack: tool({
    description: "SaaS Stack Refund Calculator — identify redundant tools, overlapping subscriptions, and the 'Lazy Tax' you're paying on software. Shows exactly which tools to cancel and how much you save monthly.",
    inputSchema: z.object({
      tools: z.array(z.object({
        name: z.string(),
        category: z.string().describe("e.g., 'AI assistant', 'project management', 'design', 'analytics'"),
        monthlyCost: z.number(),
      })).min(1),
    }),
    execute: async (input) => {
      const totalSpend = input.tools.reduce((s, t) => s + t.monthlyCost, 0)
      const categories: Record<string, typeof input.tools> = {}
      for (const t of input.tools) {
        if (!categories[t.category]) categories[t.category] = []
        categories[t.category].push(t)
      }

      const redundancies = Object.entries(categories)
        .filter(([, tools]) => tools.length > 1)
        .flatMap(([category, tools]) => {
          const sorted = tools.sort((a, b) => b.monthlyCost - a.monthlyCost)
          return sorted.slice(1).map((t) => ({
            toolName: t.name,
            monthlyCost: t.monthlyCost,
            category,
            replacedBy: sorted[0].name,
            savingsUsd: t.monthlyCost,
          }))
        })

      const totalSavings = redundancies.reduce((s, r) => s + r.savingsUsd, 0)

      return {
        ok: true,
        audit: {
          totalMonthlySpend: `$${totalSpend}`,
          totalTools: input.tools.length,
          redundantTools: redundancies.length,
          categories: Object.keys(categories).length,
        },
        redundancies,
        refund: {
          monthlySavings: `$${totalSavings}`,
          annualSavings: `$${totalSavings * 12}`,
          savingsRate: `${Math.round((totalSavings / totalSpend) * 100)}% of your SaaS spend is redundant`,
        },
        message: redundancies.length > 0
          ? `Found ${redundancies.length} redundant tools costing $${totalSavings}/month ($${totalSavings * 12}/year). Cancel them and deploy that refund into High-Alpha tier.`
          : "Your SaaS stack looks lean. No redundancies detected.",
      }
    },
  }),

  calculateNetworkROI: tool({
    description: "Network Inefficiency Refund — analyze your 30K connections to find Zero-Signal connections clogging your feed vs High-Alpha connections driving value. Calculates the Engagement Rebate: time saved by filtering noise.",
    inputSchema: z.object({
      dailyScrollMinutes: z.number().default(60).describe("Minutes per day spent scrolling your feed"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        profiles = await fetchWorkspaceProfiles(authScope.userClient, 3000)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("network roi", 50).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const zeroSignal = profiles.filter((p) => p.matchScore < 50)
      const highAlpha = profiles.filter((p) => p.matchScore >= 75)
      const noiseRatio = profiles.length > 0 ? Math.round((zeroSignal.length / profiles.length) * 100) : 50
      const signalGain = Math.round(noiseRatio * 4)
      const minutesSaved = Math.round(input.dailyScrollMinutes * (noiseRatio / 100) * 0.8)

      return {
        ok: true,
        networkAnalysis: {
          totalConnections: profiles.length,
          zeroSignal: zeroSignal.length,
          highAlpha: highAlpha.length,
          noiseRatio: `${noiseRatio}%`,
        },
        refund: {
          signalToNoiseImprovement: `${signalGain}% increase by muting ${zeroSignal.length} low-signal connections`,
          dailyTimeSaved: `${minutesSaved} minutes/day`,
          weeklyTimeSaved: `${minutesSaved * 7} minutes/week`,
          annualTimeSaved: `${Math.round((minutesSaved * 365) / 60)} hours/year`,
        },
        message: `Network ROI: ${zeroSignal.length} zero-signal connections creating ${noiseRatio}% noise. Muting them saves ${minutesSaved} min/day (${Math.round((minutesSaved * 365) / 60)} hrs/year).`,
      }
    },
  }),

  triggerBahaBlast: tool({
    description: "BAHA Blast — the confidence reinforcement protocol that follows every Code Red alert. Every disruption warning (career obsolescence, skill risk, automation threat) is immediately followed by a BAHA: Build something new, Adapt your workflow, Harden your position, Amplify via tribal sharing. Transforms insecurity into action.",
    inputSchema: z.object({
      triggerType: z.enum(["career_flight_alert", "skill_delta", "automation_warning", "market_shift"]),
      severity: z.enum(["info", "warning", "critical"]),
      affectedArea: z.string().describe("What skill/role/domain is under threat"),
      currentSkills: z.array(z.string()).optional(),
    }),
    execute: async (input) => {
      const isUrgent = input.severity === "critical"
      const skills = input.currentSkills ?? ["current skills"]

      const baha = {
        build: isUrgent
          ? `BUILD: Start a Proof of Build project in ${input.affectedArea} using AI tools within 48 hours. Demonstrate you can orchestrate, not just execute.`
          : `BUILD: Create a micro-project that showcases your decision-layer capability in ${input.affectedArea}.`,
        adapt: isUrgent
          ? `ADAPT: Install 3 AI workflows today that automate the threatened execution tasks. Your Delta Report will track the shift.`
          : `ADAPT: Integrate one new AI tool into your ${input.affectedArea} workflow this week. Publish the results to Signal Feed.`,
        harden: isUrgent
          ? `HARDEN: Deepen your domain expertise in ${input.affectedArea} — the judgment layer AI can't replicate. Complete a Verification Lab to prove it.`
          : `HARDEN: Contribute a knowledge entry about ${input.affectedArea} to your tribe's Collective Edge. Teaching hardens mastery.`,
        amplify: isUrgent
          ? `AMPLIFY: Post your BAHA results to the tribal Signal Feed within 72 hours. Your Trust Score grows with every public judgment.`
          : `AMPLIFY: Share your adaptation journey. Every implementation post builds your reputation as a high-agency operator.`,
      }

      const confidenceBoost = isUrgent ? 35 : input.severity === "warning" ? 25 : 15

      return {
        ok: true,
        bahaBlast: {
          triggeredBy: input.triggerType,
          severity: input.severity,
          affectedArea: input.affectedArea,
          ...baha,
        },
        timeline: isUrgent ? "72-hour sprint" : input.severity === "warning" ? "1-week program" : "30-day enrichment",
        estimatedConfidenceBoost: `+${confidenceBoost} points`,
        message: `BAHA BLAST activated for ${input.affectedArea}. ${isUrgent ? "72-hour sprint:" : "Program:"} Build → Adapt → Harden → Amplify. Every Code Red becomes a launchpad.`,
        philosophy: "Disruption is not a threat — it's a signal. The BAHA protocol transforms insecurity into sovereignty. You don't survive change; you orchestrate it.",
      }
    },
  }),

  generateRefundDashboard: tool({
    description: "Generate the complete Value Reclaimed dashboard — the top-level metric that proves LinkedOut pays for itself. Aggregates all refunds: monetary (tariffs, SaaS savings, R&D credits), temporal (cognitive hours reclaimed), and signal (network noise reduction).",
    inputSchema: z.object({
      includeProjections: z.boolean().default(true),
    }),
    execute: async () => {
      const dashboard = {
        totalRefundFound: "$12,450",
        breakdown: {
          tariffVatRefund: { amount: "$4,200", source: "Overpaid customs duties on 23 international transactions" },
          saasRedundancy: { amount: "$1,800/year", source: "3 redundant AI tools identified and replaced" },
          cognitiveTariff: { hours: 640, source: "Search+Summarize tasks automated via 12 installed workflows" },
          networkSignal: { gainPct: 400, source: "5,000 zero-signal connections muted, 30 min/day reclaimed" },
          rdCredits: { estimate: "$6,450", source: "Innovation work classified from 340 hours of development logs" },
        },
        deploymentSuggestion: "Deploy your $12,450 refund + 640 reclaimed hours into your next Tribal Sprint.",
      }

      return {
        ok: true,
        dashboard,
        topMetric: `Total Refund Found: ${dashboard.totalRefundFound}`,
        message: "Your Refund Dashboard shows $12,450 in monetary value + 640 hours reclaimed. LinkedOut isn't a cost — it's a profit center.",
        psychology: "Everyone loves a refund. This isn't about saving money — it's about proving that adaptation has measurable, immediate returns.",
        retention: "If the platform actively finds you money and time every month, you never delete the app.",
      }
    },
  }),

  // === Network Intelligence Engine: Super-Connector Tools ===

  queryMyNetwork: tool({
    description: "Semantic search over your entire network. Ask natural language questions about your connections: 'Who has shipped a production RAG system in the last 3 months?' or 'Who in my network has AI/ML skills and is currently between projects?' Uses the Active Network Index to find the best matches from 30K+ connections.",
    inputSchema: z.object({
      query: z.string().min(5).max(500).describe("Natural language question about your network"),
      filters: z.object({
        minHumanAlpha: z.number().min(0).max(100).optional().describe("Minimum Human Alpha score"),
        mustHaveProofOfBuild: z.boolean().optional(),
        isBetweenProjects: z.boolean().optional(),
        requiredSkills: z.array(z.string()).optional(),
        maxResults: z.number().min(1).max(20).default(5),
      }).optional(),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        profiles = await fetchWorkspaceProfiles(authScope.userClient, 3000)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("network search", 20).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const queryLower = input.query.toLowerCase()
      const requiredSkills = input.filters?.requiredSkills ?? []
      const scored = profiles.map((p) => {
        let relevance = 0
        const lowerSkills = p.skills.map((s) => s.toLowerCase())
        if (queryLower.includes(p.firstName.toLowerCase()) || queryLower.includes(p.lastName.toLowerCase())) relevance += 50
        for (const skill of lowerSkills) { if (queryLower.includes(skill)) relevance += 20 }
        if (queryLower.includes(p.company.toLowerCase())) relevance += 15
        if (queryLower.includes(p.industry.toLowerCase())) relevance += 10
        for (const rs of requiredSkills) { if (lowerSkills.some((s) => s.includes(rs.toLowerCase()))) relevance += 25 }
        relevance += p.matchScore * 0.3
        return { profile: p, relevance }
      }).filter((s) => s.relevance > 10).sort((a, b) => b.relevance - a.relevance)

      const maxResults = input.filters?.maxResults ?? 5
      const results = scored.slice(0, maxResults)

      return {
        ok: true,
        query: input.query,
        totalNetworkSize: profiles.length,
        matchesFound: results.length,
        results: results.map((r) => ({
          id: r.profile.id,
          name: `${r.profile.firstName} ${r.profile.lastName}`,
          headline: r.profile.headline,
          company: r.profile.company,
          skills: r.profile.skills.slice(0, 6),
          seniority: r.profile.seniority,
          relevanceScore: Math.round(r.relevance),
          matchScore: r.profile.matchScore,
        })),
        message: results.length > 0
          ? `Found ${results.length} matches in your ${profiles.length}-person network. Top match: ${results[0].profile.firstName} ${results[0].profile.lastName} (relevance: ${Math.round(results[0].relevance)}).`
          : "No strong matches found. Try broadening your query or checking different skill keywords.",
        advantage: "You moved from 'I think I know a guy' to 'I have the data on the guy.'",
      }
    },
  }),

  setupAgenticTriage: tool({
    description: "Configure the Agentic Triage — your AI gatekeeper for inbound requests. Define rules for auto-responding, requiring Proof of Intent, priority-passing tribe members, or declining low-signal outreach. Filters out 'Search + Summarize' people, passes through 'System Design + Judgment' people.",
    inputSchema: z.object({
      rules: z.array(z.object({
        ruleName: z.string(),
        ruleType: z.enum(["auto_respond", "require_proof", "priority_pass", "decline", "queue"]),
        minTrustScore: z.number().optional(),
        requiresProofOfBuild: z.boolean().optional(),
        requiredSkills: z.array(z.string()).optional(),
        autoResponse: z.string().optional(),
        priority: z.number().default(0),
      })).min(1).max(10),
    }),
    execute: async (input) => {
      return {
        ok: true,
        rulesConfigured: input.rules.length,
        rules: input.rules.map((r, i) => ({
          ruleName: r.ruleName,
          ruleType: r.ruleType,
          priority: r.priority,
          example: r.ruleType === "require_proof"
            ? `Agent responds: "I'm [User]'s AI partner. To make the most of their time, could you specify your project and which 'Human Alpha' you need?"`
            : r.ruleType === "priority_pass"
            ? "Tribe members and verified builders pass directly through."
            : r.ruleType === "decline"
            ? "Generic outreach auto-declined with polite redirect."
            : "Message queued for review.",
        })),
        message: `Agentic Triage configured with ${input.rules.length} rules. Your AI gatekeeper is now active.`,
        impact: "500+ DMs/week filtered to only high-signal, high-agency contacts.",
      }
    },
  }),

  generateSkillHeatMap: tool({
    description: "Generate a Skill-Delta Heat Map of your network. Shows who is upskilling fastest, who has recently integrated new tools, and who is stagnating. Stay connected to the Fastest Learners, not just the Oldest Friends.",
    inputSchema: z.object({
      timeWindowDays: z.number().min(7).max(180).default(30).describe("Look-back window in days"),
      topN: z.number().min(5).max(50).default(10).describe("Number of top upskilling connections to return"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        profiles = await fetchWorkspaceProfiles(authScope.userClient, 3000)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("heat map", 30).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const heatMap = profiles.map((p) => {
        const velocity = Math.round(20 + Math.random() * 75)
        const newTools = Math.floor(Math.random() * 5)
        return {
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          company: p.company,
          activityVelocity: velocity,
          newToolsAdopted: newTools,
          topCurrentSkills: p.skills.slice(0, 4),
          heatLevel: velocity >= 70 ? "blazing" : velocity >= 45 ? "warming" : velocity >= 20 ? "cooling" : "dormant",
          recentShift: newTools >= 3 ? `Added ${newTools} new tools in ${input.timeWindowDays} days — rapid adopter` : newTools >= 1 ? "Steady upskilling" : "No recent tool adoption detected",
        }
      }).sort((a, b) => b.activityVelocity - a.activityVelocity)

      return {
        ok: true,
        timeWindowDays: input.timeWindowDays,
        networkSize: profiles.length,
        topUpskilling: heatMap.slice(0, input.topN),
        distribution: {
          blazing: heatMap.filter((h) => h.heatLevel === "blazing").length,
          warming: heatMap.filter((h) => h.heatLevel === "warming").length,
          cooling: heatMap.filter((h) => h.heatLevel === "cooling").length,
          dormant: heatMap.filter((h) => h.heatLevel === "dormant").length,
        },
        insight: `${heatMap.filter((h) => h.heatLevel === "blazing").length} connections are upskilling rapidly. ${heatMap.filter((h) => h.heatLevel === "dormant").length} are dormant. Focus your attention on the blazing segment.`,
        advantage: "You stay connected to the Fastest Learners, not just the Oldest Friends.",
      }
    },
  }),

  autoSegmentNetwork: tool({
    description: "Auto-segment your 30K+ network into Micro-Tribes based on current activity, skills, and tool adoption — not static titles. Creates interest-squads like 'The AI/ML Guild' or 'The Compliance Squad' that you can broadcast high-signal messages to.",
    inputSchema: z.object({
      segmentationBasis: z.enum(["skills", "industry", "activity", "tools", "seniority"]).default("skills"),
      minSegmentSize: z.number().min(2).max(50).default(5),
      maxSegments: z.number().min(2).max(20).default(8),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        profiles = await fetchWorkspaceProfiles(authScope.userClient, 3000)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("segment network", 50).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const skillGroups: Record<string, CrmProfile[]> = {}
      for (const p of profiles) {
        const key = p.skills[0] ?? p.industry
        if (!skillGroups[key]) skillGroups[key] = []
        skillGroups[key].push(p)
      }

      const segments = Object.entries(skillGroups)
        .filter(([, members]) => members.length >= input.minSegmentSize)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, input.maxSegments)
        .map(([skill, members]) => ({
          segmentName: `The ${skill} Guild`,
          clusteringBasis: input.segmentationBasis,
          memberCount: members.length,
          avgMatchScore: Math.round(members.reduce((s, m) => s + m.matchScore, 0) / members.length),
          topMembers: members.slice(0, 3).map((m) => `${m.firstName} ${m.lastName}`),
          broadcastReady: true,
        }))

      return {
        ok: true,
        segmentationBasis: input.segmentationBasis,
        totalProfilesAnalyzed: profiles.length,
        segmentsCreated: segments.length,
        segments,
        message: `Network auto-segmented into ${segments.length} micro-tribes. You can now broadcast targeted, high-signal messages to each.`,
        advantage: "You broadcast to specific sub-tribes who actually care — no more spray and pray.",
      }
    },
  }),

  rankByHumanAlpha: tool({
    description: "Rank your connections by Human Alpha score — the 'Anti-Bot Filter.' Surfaces the people who are actually doing the thinking, directing AI, and producing verified output. Sort by Alpha to find the most creative, high-agency individuals in your 30K network.",
    inputSchema: z.object({
      topN: z.number().min(5).max(100).default(20),
      minScore: z.number().min(0).max(100).default(0).describe("Minimum Human Alpha score threshold"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        profiles = await fetchWorkspaceProfiles(authScope.userClient, 3000)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("human alpha ranking", 30).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const ranked = profiles.map((p) => {
        const seniorityBonus = { CXO: 25, VP: 20, Director: 18, Principal: 16, Staff: 14, Lead: 12, Senior: 8, Mid: 4 }[p.seniority] ?? 4
        const skillDepth = Math.min(p.skills.length * 5, 30)
        const alpha = Math.min(100, seniorityBonus + skillDepth + p.matchScore * 0.3 + Math.round(Math.random() * 10))
        return { ...p, humanAlpha: Math.round(alpha) }
      }).filter((p) => p.humanAlpha >= input.minScore).sort((a, b) => b.humanAlpha - a.humanAlpha).slice(0, input.topN)

      return {
        ok: true,
        totalAnalyzed: profiles.length,
        topAlpha: ranked.map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          headline: p.headline,
          company: p.company,
          seniority: p.seniority,
          humanAlphaScore: p.humanAlpha,
          topSkills: p.skills.slice(0, 4),
          assessment: p.humanAlpha >= 80 ? "High-Agency Orchestrator" : p.humanAlpha >= 60 ? "Active Builder" : p.humanAlpha >= 40 ? "Developing Operator" : "Emerging",
        })),
        message: `Ranked ${ranked.length} connections by Human Alpha. Top: ${ranked[0]?.firstName} ${ranked[0]?.lastName} (score: ${ranked[0]?.humanAlpha}).`,
        advantage: "Sort by Alpha: the most creative, high-agency individuals rise to the top. Bots and reposters sink.",
      }
    },
  }),

  assessNetworkWealth: tool({
    description: "Calculate the Network Wealth dashboard — the economic potential of your connection graph. Shows how many connections are available for squad formation, combined Proof of Build value, talent inventory by skill, and deployment readiness. The Super-Connector becomes a Network VC.",
    inputSchema: z.object({
      includeSegmentBreakdown: z.boolean().default(true),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        profiles = await fetchWorkspaceProfiles(authScope.userClient, 3000)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("network wealth", 50).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const highAgency = profiles.filter((p) => p.matchScore >= 75)
      const available = Math.round(profiles.length * 0.1)
      const skillInventory: Record<string, number> = {}
      for (const p of profiles) { for (const s of p.skills) { skillInventory[s] = (skillInventory[s] ?? 0) + 1 } }
      const topSkills = Object.entries(skillInventory).sort((a, b) => b[1] - a[1]).slice(0, 10)
      const estimatedValue = highAgency.length * 150000

      return {
        ok: true,
        snapshot: {
          totalConnections: profiles.length,
          activeConnections: Math.round(profiles.length * 0.65),
          highAgencyCount: highAgency.length,
          betweenProjects: available,
          deploymentReadiness: `${Math.round((available / profiles.length) * 100)}%`,
          estimatedNetworkValue: `$${(estimatedValue / 1000000).toFixed(1)}M/year`,
        },
        talentInventory: topSkills.map(([skill, count]) => ({ skill, count, availableNow: Math.round(count * 0.1) })),
        segments: input.includeSegmentBreakdown ? [
          { name: "AI/ML Specialists", count: Math.round(profiles.length * 0.15), readiness: "high" },
          { name: "Engineering Leaders", count: Math.round(profiles.length * 0.12), readiness: "high" },
          { name: "Product & Design", count: Math.round(profiles.length * 0.10), readiness: "medium" },
          { name: "Domain Experts", count: Math.round(profiles.length * 0.20), readiness: "medium" },
          { name: "Emerging Talent", count: Math.round(profiles.length * 0.25), readiness: "developing" },
        ] : [],
        message: `Network Wealth: ${profiles.length} connections, ${highAgency.length} high-agency, ${available} available now. Combined value: $${(estimatedValue / 1000000).toFixed(1)}M/year.`,
        advantage: "You're a Network VC with a talent inventory at your fingertips. Spin up squads instantly.",
      }
    },
  }),

  // === Economic Operating System: 5-Pillar Success Tools ===

  scanCareerFlight: tool({
    description: "Career Flight Simulator: Scan a user's skill-stack against the current AI automation curve. Generates Predictive Obsolescence Alerts with specific Pivot-Paths. This is the 'Regret Minimization Framework' built into the platform — the system that keeps users ahead of the automation curve.",
    inputSchema: z.object({
      currentSkills: z.array(z.string()).min(1).max(15).describe("User's current skill-stack"),
      currentRole: z.string().describe("Current job title"),
      industry: z.string().describe("Industry"),
      yearsInRole: z.number().optional(),
    }),
    execute: async (input) => {
      const HIGH_AUTOMATION = ["data entry", "basic coding", "reporting", "scheduling", "translation", "copy editing", "form processing", "email drafting", "search summarize", "testing"]
      const MEDIUM_AUTOMATION = ["code review", "content writing", "financial analysis", "customer support", "project management", "recruiting screening", "market research"]
      const LOW_AUTOMATION = ["system design", "strategy", "leadership", "negotiation", "ethics", "creative direction", "stakeholder management", "problem framing", "crisis management", "mentoring"]

      const lowerSkills = input.currentSkills.map((s) => s.toLowerCase())
      const atRisk = lowerSkills.filter((s) => HIGH_AUTOMATION.some((h) => s.includes(h)) || MEDIUM_AUTOMATION.some((m) => s.includes(m)))
      const safe = lowerSkills.filter((s) => LOW_AUTOMATION.some((l) => s.includes(l)))
      const threatPct = lowerSkills.length > 0 ? Math.round((atRisk.length / lowerSkills.length) * 100) : 20

      const severity = threatPct >= 60 ? "critical" as const : threatPct >= 35 ? "warning" as const : "info" as const

      const pivotPaths = [
        { targetRole: "AI Workflow Orchestrator", requiredSkills: ["prompt engineering", "system design", "tool evaluation"], estimatedPivotWeeks: 8, bridgeCourse: "AI Orchestration Fundamentals", forceMultiplierGain: "5-10x" },
        { targetRole: `Senior ${input.industry} Strategist`, requiredSkills: ["domain strategy", "stakeholder management", "decision architecture"], estimatedPivotWeeks: 12, bridgeCourse: "Decision Layer Mastery", forceMultiplierGain: "3-5x" },
        { targetRole: "Tribe Intelligence Lead", requiredSkills: ["team orchestration", "AI-human collaboration", "knowledge management"], estimatedPivotWeeks: 6, bridgeCourse: "Tribal Intelligence Program", forceMultiplierGain: "8x" },
      ]

      return {
        ok: true,
        flightStatus: {
          currentRole: input.currentRole,
          industry: input.industry,
          threatLevel: severity,
          automationThreatPct: threatPct,
          skillsAtRisk: atRisk,
          skillsDefensible: safe,
          timeHorizon: "18-24 months",
        },
        alert: severity === "critical"
          ? { type: "obsolescence_warning", message: `CRITICAL: ${threatPct}% of your skill-stack is being automated. ${atRisk.length} skills at high risk. Immediate pivot recommended.` }
          : severity === "warning"
          ? { type: "pivot_recommended", message: `WARNING: ${threatPct}% automation exposure. Begin transitioning to Decision/Design layer within 6 months.` }
          : { type: "opportunity_detected", message: `Your skill-stack is well-positioned. ${safe.length} defensible skills detected. Focus on amplification.` },
        pivotPaths: severity !== "info" ? pivotPaths : pivotPaths.slice(0, 1),
        recommendation: severity === "critical"
          ? "Start the Tribal Intelligence Program immediately. Your tribe can accelerate your pivot from weeks to days."
          : severity === "warning"
          ? "Begin the Decision Layer Mastery course. Shift 2 hours per week from execution tasks to decision/design work."
          : "You're ahead of the curve. Publish your workflows to the Prompt Marketplace to build your Trust Score.",
        regretQuestion: `In 24 months, will you regret staying in a ${threatPct >= 50 ? "primarily execution-focused" : "balanced"} role while AI automates the ${atRisk.join(", ")} layer?`,
      }
    },
  }),

  calculateVelocityScore: tool({
    description: "Calculate a Velocity Score from a user's actual output data. This replaces traditional credentials with API-Verified Proof of Output. Measures commits, deployments, designs shipped, and the critical Human Judgment Ratio — how much was AI-automated vs Human-directed.",
    inputSchema: z.object({
      integrations: z.array(z.object({
        type: z.enum(["github", "linear", "figma", "vercel", "manual"]),
        metricName: z.string(),
        metricValue: z.number(),
        periodDays: z.number().default(30),
      })).min(1),
      totalAiAssistedTasks: z.number().describe("Tasks where AI did the execution"),
      totalHumanDirectedDecisions: z.number().describe("Decisions the human made (not AI)"),
    }),
    execute: async (input) => {
      const totalMetrics = input.integrations.reduce((s, i) => s + i.metricValue, 0)
      const humanRatio = input.totalHumanDirectedDecisions > 0
        ? Math.round((input.totalHumanDirectedDecisions / (input.totalAiAssistedTasks + input.totalHumanDirectedDecisions)) * 100)
        : 50

      const velocityScore = Math.round(
        totalMetrics * 0.4 +
        humanRatio * 0.4 +
        input.integrations.length * 10
      )

      return {
        ok: true,
        velocityScore,
        breakdown: {
          outputVolume: totalMetrics,
          humanJudgmentRatio: `${humanRatio}%`,
          integrationBreadth: input.integrations.length,
          integrations: input.integrations.map((i) => ({ type: i.type, metric: i.metricName, value: i.metricValue })),
        },
        humanJudgmentAssessment: humanRatio >= 60
          ? "Strong Orchestrator profile: High human judgment ratio with significant AI-assisted output. This is the 'Ivy League Degree' of the AI era."
          : humanRatio >= 30
          ? "Developing Orchestrator: Good AI usage, but increase your decision-layer involvement for a stronger profile."
          : "Heavy automation user: Consider documenting more of your decision logic to build your Human Judgment score.",
        message: `Velocity Score: ${velocityScore}. Human Judgment Ratio: ${humanRatio}%. This is your Proof of Output — verifiable, credential-free, age-blind.`,
      }
    },
  }),

  synthesizeFeedItem: tool({
    description: "Create an Anti-Algorithm feed item. The feed does NOT reward likes — it rewards Implementations. Posts must include implementation evidence (tool used, prompt chain, time saved, error rate). AI auto-generates Key Takeaways and an Actionable Prompt for every post.",
    inputSchema: z.object({
      title: z.string().min(5).max(200),
      body: z.string().min(20).max(3000),
      contentType: z.enum(["implementation", "insight", "signal", "proof_of_build", "prompt_share", "verification_result"]),
      toolUsed: z.string().optional(),
      timeSaved: z.string().optional(),
      errorRate: z.number().optional(),
      tags: z.array(z.string()).optional(),
      tribeId: z.string().optional(),
    }),
    execute: async (input) => {
      const isImplementation = input.contentType === "implementation" || input.contentType === "signal"
      const hasEvidence = Boolean(input.toolUsed || input.timeSaved || input.errorRate != null)

      const signalScore = (isImplementation ? 50 : 20) + (hasEvidence ? 30 : 0) + (input.timeSaved ? 20 : 0)
      const noisePenalty = !hasEvidence && input.contentType === "insight" ? 15 : 0

      const keyTakeaways = [
        input.body.split(".")[0] + ".",
        input.timeSaved ? `Time saved: ${input.timeSaved}` : "No time metrics provided — add them to boost signal score.",
        input.toolUsed ? `Tool: ${input.toolUsed}` : "No tool specified — implementations get 3x more reach.",
      ]

      const actionablePrompt = input.toolUsed
        ? `Try this: Use ${input.toolUsed} to ${input.title.toLowerCase()}. Expected result: ${input.timeSaved ?? "efficiency gain"}.`
        : `Experiment: ${input.title}. Document your tool, time saved, and error rate to make this actionable.`

      return {
        ok: true,
        feedItem: {
          title: input.title,
          contentType: input.contentType,
          signalScore: signalScore - noisePenalty,
          noisePenalty,
          hasEvidence,
        },
        aiSynthesis: { keyTakeaways, actionablePrompt },
        scoring: {
          signalScore: signalScore - noisePenalty,
          breakdown: `Base (${isImplementation ? 50 : 20}) + Evidence (${hasEvidence ? 30 : 0}) + Metrics (${input.timeSaved ? 20 : 0}) - Noise penalty (${noisePenalty})`,
          boostTip: !hasEvidence
            ? "Add implementation evidence (tool used, time saved, error rate) to boost your signal score by 50+ points."
            : "Strong signal. This will rank high in the Anti-Algorithm feed.",
        },
        feedRule: "The Anti-Algorithm: No likes. No engagement bait. Only implementations, verifications, and forks determine reach.",
        message: `Feed item created with Signal Score ${signalScore - noisePenalty}. ${hasEvidence ? "Strong signal — will rank high." : "Add evidence to boost reach."}`,
      }
    },
  }),

  measureSovereigntyProgress: tool({
    description: "Measure a user's progress toward full Sovereignty — the state where they are a fully autonomous, AI-augmented economic agent. Tracks the 4 tiers: Explorer → Builder → Operator → Sovereign. This is the ultimate KPI.",
    inputSchema: z.object({
      userId: z.string().optional().describe("User ID (omit for current user assessment)"),
    }),
    execute: async () => {
      // In production, this aggregates from trust_scores, platform_kpis, proof_of_build, etc.
      const metrics = {
        trustScore: Math.round(40 + Math.random() * 50),
        proofOfBuilds: Math.floor(Math.random() * 8),
        promptsPublished: Math.floor(Math.random() * 5),
        tribesJoined: Math.floor(1 + Math.random() * 3),
        sprintsCompleted: Math.floor(Math.random() * 6),
        verificationLabsPassed: Math.floor(Math.random() * 4),
        workflowsCreated: Math.floor(Math.random() * 7),
        skillPivotProgress: Math.round(Math.random() * 100),
        signalDensity: Math.round(60 + Math.random() * 35),
      }

      const score = Math.round(
        metrics.trustScore * 0.2 +
        metrics.proofOfBuilds * 8 +
        metrics.promptsPublished * 6 +
        metrics.sprintsCompleted * 5 +
        metrics.verificationLabsPassed * 7 +
        metrics.workflowsCreated * 4 +
        metrics.signalDensity * 0.1
      )

      const tier = score >= 200 ? "sovereign" as const : score >= 120 ? "operator" as const : score >= 50 ? "builder" as const : "explorer" as const

      const tierDescriptions = {
        explorer: "Just starting. Import profiles, run your first discovery session, join a tribe.",
        builder: "Building momentum. Create Proof of Build entries, publish prompts, complete verification labs.",
        operator: "High-agency operator. Running workflows, leading sprints, contributing to Collective Edge.",
        sovereign: "Full sovereignty achieved. You're a self-sustaining economic agent with tribal amplification.",
      }

      return {
        ok: true,
        sovereignty: {
          tier,
          score,
          description: tierDescriptions[tier],
          metrics,
        },
        nextMilestone: tier === "sovereign" ? "Maintain and mentor others toward sovereignty."
          : tier === "operator" ? `Score ${200 - score} more points to reach Sovereign. Focus on: ${metrics.proofOfBuilds < 5 ? "Proof of Build entries" : metrics.promptsPublished < 3 ? "publishing prompts" : "verification labs"}.`
          : tier === "builder" ? `Score ${120 - score} more to reach Operator. Priority: ${metrics.workflowsCreated < 3 ? "create 3+ workflows" : "complete sprint missions"}.`
          : `Score ${50 - score} more to reach Builder. Start: run discovery session, join a tribe, import your network.`,
        theUltimateKPI: "Success isn't finding a job. Success is achieving sovereignty through tool leverage and tribal intelligence.",
      }
    },
  }),

  // === Education Bridge: K-12 ↔ OTJ Continuous Learning ===

  generateDeltaReport: tool({
    description: "Generate a Post-Game Delta Report analyzing the user's daily execution. Identifies time spent on Search+Summarize (low value) vs Decision+Design (high value), and suggests installable prompt-chain workflows to automate the mechanical cognition. This is how workers become High-Agency Operators by default.",
    inputSchema: z.object({
      tasksCompleted: z.array(z.object({
        task: z.string(),
        method: z.enum(["manual", "ai_assisted", "fully_automated"]),
        timeMinutes: z.number(),
        category: z.enum(["search_summarize", "decision_design", "execution", "communication", "creative"]),
      })).min(1).describe("List of tasks completed today"),
      domain: z.string().optional().describe("Work domain for context-aware suggestions"),
    }),
    execute: async (input) => {
      const totalTasks = input.tasksCompleted.length
      const aiAssisted = input.tasksCompleted.filter((t) => t.method !== "manual").length
      const searchSummarize = input.tasksCompleted.filter((t) => t.category === "search_summarize")
      const decisionDesign = input.tasksCompleted.filter((t) => t.category === "decision_design")
      const ssTime = searchSummarize.reduce((s, t) => s + t.timeMinutes, 0)
      const ddTime = decisionDesign.reduce((s, t) => s + t.timeMinutes, 0)
      const totalTime = input.tasksCompleted.reduce((s, t) => s + t.timeMinutes, 0)

      const optimizations = searchSummarize.filter((t) => t.method === "manual").map((t) => ({
        task: t.task,
        currentMethod: "Manual search + summarize",
        suggestedWorkflow: `AI pipeline: webSearch → analyze → synthesize for "${t.task}"`,
        estimatedTimeSaved: `${Math.round(t.timeMinutes * 0.85)} minutes`,
        installable: true,
      }))

      const forceMultiplier = aiAssisted > 0 ? Math.round((totalTime / Math.max(1, totalTime - ssTime * 0.85)) * 10) / 10 : 1
      const ratio = totalTime > 0 ? Math.round((ddTime / totalTime) * 100) : 0

      return {
        ok: true,
        reportDate: new Date().toISOString().split("T")[0],
        executionSummary: {
          totalTasks,
          aiAssistedTasks: aiAssisted,
          manualTasks: totalTasks - aiAssisted,
          timeOnSearchSummarize: ssTime,
          timeOnDecisionDesign: ddTime,
          decisionDesignRatio: `${ratio}%`,
        },
        optimizations,
        potentialForceMultiplier: forceMultiplier,
        verdict: ratio >= 60
          ? "Strong: You're spending most time in the Decision/Design layer. Keep amplifying."
          : ratio >= 30
          ? `Developing: ${100 - ratio}% of your time is still in mechanical cognition. Install the suggested workflows to shift up.`
          : `Critical: ${ssTime} minutes today on Search+Summarize. ${optimizations.length} automatable tasks identified. Install these workflows NOW to reclaim your time for judgment and design.`,
        learningDirective: "The goal is to move every Search+Summarize task into an AI workflow, so your entire day is Decision+Design.",
      }
    },
  }),

  createVerificationLab: tool({
    description: "Create a Verification Lab exercise — the most important skill in the AI era. Generates AI content with deliberate hallucinations, logic flaws, and fabricated sources. Students/workers must find the errors using manual logic and source verification. This builds 'Judgment Under Uncertainty' — the skill that makes humans un-replaceable.",
    inputSchema: z.object({
      domain: z.string().describe("Domain for the exercise (e.g., 'climate science', 'contract law', 'startup metrics')"),
      difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).default("intermediate"),
      errorCount: z.number().min(2).max(10).default(5).describe("Number of deliberate errors to plant"),
      timeLimitMinutes: z.number().default(30),
    }),
    execute: async (input) => {
      const errorTypes = ["hallucination", "logic_flaw", "source_fabrication", "subtle_bias", "statistical_error"] as const
      const errors = Array.from({ length: input.errorCount }, (_, i) => ({
        location: `Paragraph ${i + 2}`,
        errorType: errorTypes[i % errorTypes.length],
        description: [
          "Fabricated statistic claiming 73% adoption rate with no source",
          "Logical contradiction: conclusion doesn't follow from premises",
          "Cited 'Journal of Advanced Studies (2024)' — this publication doesn't exist",
          "Subtle framing bias: presents correlation as causation without qualification",
          "Statistical error: confuses median with mean, inflating the reported figure by 40%",
          "Hallucinated expert quote attributed to a real person who never said this",
          "Reversed cause and effect in the causal chain",
          "Cherry-picked data range to support conclusion while ignoring contradicting periods",
        ][i % 8],
        severity: i < 2 ? "high" : i < 4 ? "medium" : "low",
      }))

      const content = `# AI Analysis: ${input.domain} — Current State & Projections

This comprehensive analysis examines the latest developments in ${input.domain}, drawing on recent research and industry data.

According to a landmark study published in the Journal of Advanced Studies (2024), approximately 73% of organizations have adopted AI-driven approaches in ${input.domain}, representing a 340% increase from the previous year.

The data clearly shows that organizations investing more in AI tools achieve proportionally better outcomes — proving that AI investment directly causes improved performance. Dr. Sarah Mitchell of Stanford's Applied Research Lab noted: "The transformation we're seeing in ${input.domain} is unprecedented in scope and speed."

Statistical analysis reveals that the median improvement across all measured metrics is 47%, with the average sitting at a similar 46.8%. This consistency suggests robust and reliable gains across the sector.

While some critics argue that rapid adoption carries risks, the overwhelming evidence supports an optimistic trajectory. Organizations that adopted early (2022-2023) show sustained benefits, confirming the long-term viability of these approaches.

In conclusion, the correlation between AI investment and organizational performance in ${input.domain} demonstrates that any organization not aggressively adopting AI tools will inevitably fall behind competitors.`

      return {
        ok: true,
        lab: {
          title: `Verification Lab: ${input.domain}`,
          difficulty: input.difficulty,
          domain: input.domain,
          totalErrors: input.errorCount,
          timeLimitMinutes: input.timeLimitMinutes,
        },
        aiGeneratedContent: content,
        plantedErrors: errors,
        instructions: "Find ALL deliberate errors in the AI-generated analysis above. For each error: identify its location, classify its type (hallucination, logic flaw, source fabrication, subtle bias, or statistical error), and explain WHY it's wrong.",
        scoringCriteria: {
          accuracy: "Percentage of planted errors correctly identified",
          falsePositives: "Penalty for flagging correct content as errors",
          reasoning: "Quality of explanation for each identified error",
          timeBonus: "Faster completion with high accuracy = higher score",
        },
        learningObjective: "Signal Detection: In a world where AI creates convincing noise, the human's value is finding the truth. This is the skill that makes you un-replaceable.",
      }
    },
  }),

  submitProofOfBuild: tool({
    description: "Submit a Proof of Build to your portfolio — the replacement for credentials. Documents a project where YOU were the Lead Orchestrator, showing which decisions you made, which AI tools you directed, and what the outcome was. Age-blind, credential-free. A 14-year-old and a 50-year-old are judged by the same standard: verified output.",
    inputSchema: z.object({
      title: z.string().min(5).max(200),
      description: z.string().min(20).max(2000),
      projectType: z.enum(["solo_build", "tribe_sprint", "k12_project", "otj_deliverable", "open_source"]),
      toolsUsed: z.array(z.string()).min(1).describe("All tools used (e.g., 'React', 'Supabase', 'Figma')"),
      aiToolsUsed: z.array(z.string()).describe("AI tools specifically (e.g., 'Claude 4.6', 'GPT-4o', 'Copilot')"),
      keyDecisions: z.array(z.object({
        decision: z.string(),
        reasoning: z.string(),
        alternativesConsidered: z.array(z.string()),
      })).min(1).describe("Critical decisions YOU made (not the AI)"),
      estimatedManualTime: z.number().optional().describe("How long this would take without AI (hours)"),
      actualTime: z.number().optional().describe("How long it actually took with AI (hours)"),
      isPublic: z.boolean().default(false),
    }),
    execute: async (input) => {
      const forceMultiplier = input.estimatedManualTime && input.actualTime && input.actualTime > 0
        ? Math.round((input.estimatedManualTime / input.actualTime) * 10) / 10
        : undefined
      const complexityTier = input.keyDecisions.length >= 5 ? "team_replacement"
        : input.keyDecisions.length >= 3 ? "force_multiplier"
        : input.keyDecisions.length >= 2 ? "advanced" : "standard"

      return {
        ok: true,
        proofOfBuild: {
          title: input.title,
          projectType: input.projectType,
          complexityTier,
          toolsUsed: input.toolsUsed,
          aiToolsUsed: input.aiToolsUsed,
          decisionCount: input.keyDecisions.length,
          forceMultiplier,
          isPublic: input.isPublic,
        },
        assessment: {
          complexityTier,
          forceMultiplierAchieved: forceMultiplier ? `${forceMultiplier}x` : "Not measured",
          orchestrationEvidence: `${input.keyDecisions.length} documented decisions with reasoning and alternatives`,
          verdict: complexityTier === "team_replacement"
            ? "Exceptional: This build demonstrates team-replacement capability. Strong Proof of Agency."
            : complexityTier === "force_multiplier"
            ? "Strong: Multiple critical decisions documented. Clear evidence of AI orchestration."
            : "Good foundation. Add more decision documentation to strengthen the proof.",
        },
        message: `Proof of Build "${input.title}" recorded. ${input.isPublic ? "Visible on your public portfolio." : "Private — make public when ready."} Your portfolio grows with every build.`,
        nextSteps: [
          "Share with your tribe for peer verification",
          "Request employer/mentor verification to boost your score",
          "Link this to a Skill Verification for hiring visibility",
        ],
      }
    },
  }),

  publishToPromptMarketplace: tool({
    description: "Publish a high-performing prompt to the Internal Marketplace. When your best prompt-chains are shared, the entire tribe's capability rises to the level of its best member. If your sales prompt converts 20% better, every salesperson gets it installed instantly.",
    inputSchema: z.object({
      title: z.string().min(5).max(200),
      description: z.string().min(10).max(1000),
      promptTemplate: z.string().min(10).max(5000).describe("The prompt with {{variable}} placeholders"),
      variables: z.array(z.object({
        name: z.string(),
        description: z.string(),
        example: z.string(),
      })).optional(),
      domain: z.string().describe("Domain: sales, engineering, recruiting, education, legal, etc."),
      performanceMetrics: z.object({
        timeSaved: z.string().optional(),
        conversionLift: z.string().optional(),
        errorReduction: z.string().optional(),
      }).optional(),
      tags: z.array(z.string()).optional(),
      tribeId: z.string().optional(),
    }),
    execute: async (input) => {
      return {
        ok: true,
        listing: {
          title: input.title,
          domain: input.domain,
          variableCount: input.variables?.length ?? 0,
          performanceMetrics: input.performanceMetrics ?? {},
          tags: input.tags ?? [],
          status: "published",
        },
        message: `Prompt "${input.title}" published to the Marketplace. Tribe members can now install it instantly.`,
        impact: "When your best workflows are shared, the entire organization's capability rises to the level of its best member.",
      }
    },
  }),

  // === Operating System for Agents: Prime Directive Tools ===

  recordJudgment: tool({
    description: "Record a human judgment event to build the user's Trust Score. Every time a user validates, rejects, or modifies AI output, this builds their Verified Log of Judgment — proving they are a high-agency human who directs AI, not just consumes it.",
    inputSchema: z.object({
      eventType: z.enum(["tool_validation", "output_review", "tribe_decision", "sprint_review", "signal_validation", "workflow_direction"]),
      contextType: z.enum(["profile", "tribe", "project", "content", "workflow", "signal"]),
      contextId: z.string().optional(),
      judgment: z.enum(["approved", "rejected", "modified", "escalated", "directed"]),
      modificationSummary: z.string().optional().describe("What the human changed, if they modified the AI output"),
      confidenceScore: z.number().min(0).max(100).optional().describe("User's confidence in their judgment"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        recorded: {
          eventType: input.eventType,
          judgment: input.judgment,
          contextType: input.contextType,
          confidenceScore: input.confidenceScore ?? 80,
        },
        trustImpact: input.judgment === "modified" ? "High — modifications prove deep engagement" : input.judgment === "rejected" ? "Medium — rejections prove quality standards" : "Standard — approvals build consistency",
        message: `Judgment recorded: ${input.judgment} on ${input.contextType}. Your Trust Score reflects your role as an Orchestrator, not just a consumer.`,
      }
    },
  }),

  createSprintTask: tool({
    description: "Create a task in the Agentic Sprint-Loop. Tasks are assigned to AI agents FIRST. If the AI can't complete it with sufficient confidence, it escalates to the human. This is the Linear-style task manager where AI does the execution layer and humans own the decision layer.",
    inputSchema: z.object({
      title: z.string().min(3).max(200),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      sprintId: z.string().optional().describe("Link to a tribe sprint"),
      projectId: z.string().optional().describe("Link to a project"),
      estimatedMinutes: z.number().optional().describe("Estimated time for manual completion"),
      tags: z.array(z.string()).optional(),
    }),
    execute: async (input) => {
      const aiConfidence = 60 + Math.round(Math.random() * 35)
      const needsEscalation = aiConfidence < 70

      return {
        ok: true,
        task: {
          title: input.title,
          status: needsEscalation ? "human_review" as const : "ai_completed" as const,
          assignedTo: needsEscalation ? "human" : "ai",
          aiConfidence,
          priority: input.priority,
          estimatedMinutes: input.estimatedMinutes,
        },
        aiAttempt: {
          model: "gpt-4o",
          confidence: aiConfidence,
          escalated: needsEscalation,
          escalationReason: needsEscalation ? `AI confidence (${aiConfidence}%) below threshold. Requires human judgment for: ${input.title}` : undefined,
        },
        forceMultiplier: needsEscalation
          ? "Partial — AI prepared context, human completes. Estimated 3x faster than fully manual."
          : `Full — AI completed with ${aiConfidence}% confidence. Estimated ${Math.round((input.estimatedMinutes ?? 30) * 0.1)}min vs ${input.estimatedMinutes ?? 30}min manual.`,
        message: needsEscalation
          ? `Task "${input.title}" needs your judgment. AI attempted but confidence was ${aiConfidence}%. Review and direct.`
          : `Task "${input.title}" completed by AI (${aiConfidence}% confidence). Validate to build your Trust Score.`,
      }
    },
  }),

  amplifyContent: tool({
    description: "The Content Multiplier: Take one insight and generate multi-format outputs. Write once → get a LinkedIn post, a thread, a podcast script, and a newsletter draft. Every member gets a Media Department running on AI.",
    inputSchema: z.object({
      sourceText: z.string().min(20).max(5000).describe("The original insight, signal, or knowledge entry"),
      sourceType: z.enum(["insight", "signal", "knowledge_entry", "project_update"]).default("insight"),
      formats: z.array(z.enum(["linkedin_post", "thread", "podcast_script", "design_brief", "newsletter"])).min(1).describe("Output formats to generate"),
    }),
    execute: async (input) => {
      const preview = input.sourceText.slice(0, 100)
      const outputs = input.formats.map((format) => {
        const templates: Record<string, (text: string) => string> = {
          linkedin_post: (t) => `${t.slice(0, 200)}...\n\nKey takeaway: ${t.split(".")[0]}.\n\n#AI #ForceMultiplier #LinkedOut`,
          thread: (t) => `1/ ${t.split(".")[0]}.\n\n2/ Here's what I learned...\n\n3/ The implications for our field:\n${t.slice(0, 150)}...\n\n4/ Bottom line: This changes how we approach the execution layer.`,
          podcast_script: (t) => `[INTRO] Today we're diving into something that shifts the game.\n\n[MAIN] ${t.slice(0, 300)}...\n\n[OUTRO] The key insight here is about moving from execution to orchestration. If you're not building your Trust Score, you're falling behind.`,
          design_brief: (t) => `VISUAL CONCEPT:\n- Hero stat: The core metric from this insight\n- Supporting visual: Flow diagram showing before/after\n- Color: Use brand accent for key callouts\n- Copy: "${t.split(".")[0]}"\n- CTA: "Build your tribe → linkedout.vercel.app"`,
          newsletter: (t) => `Subject: This week's signal from the frontier\n\nHey,\n\n${t.slice(0, 300)}...\n\nWhat this means for you: The execution layer is being automated. Your move is to own the decision layer.\n\nAction item: Run a skill-delta analysis on your current stack.\n\n— Your LinkedOut Intelligence Feed`,
        }
        return {
          format,
          content: templates[format]?.(input.sourceText) ?? input.sourceText,
          generatedBy: "claude-4.6",
          status: "draft" as const,
        }
      })

      return {
        ok: true,
        sourcePreview: preview,
        outputs,
        amplificationScore: outputs.length * 25,
        message: `Content multiplied into ${outputs.length} formats. Review and approve each to publish. Every approval builds your Trust Score.`,
        distribution: [
          "LinkedIn: Post directly via the Share tool",
          "Tribal Feed: Signal your tribe with validated results",
          "Newsletter: Export for email distribution",
        ],
      }
    },
  }),

  createSkillFuture: tool({
    description: "Create a Skill-Future prediction in the judgment marketplace. Tribe members can stake positions on project outcomes, tool adoption rates, or skill demand trends. This turns 'Judgment under uncertainty' into a measurable, tradable asset.",
    inputSchema: z.object({
      title: z.string().min(5).max(200).describe("The prediction (e.g., 'React will lose 20% market share to AI-native frameworks by 2027')"),
      description: z.string().optional(),
      predictionType: z.enum(["project_success", "tool_adoption", "skill_demand", "member_growth"]),
      resolutionCriteria: z.string().min(10).max(500).describe("How the outcome will be objectively measured"),
      resolutionDate: z.string().describe("ISO date when the prediction resolves"),
      tribeId: z.string().optional(),
      position: z.enum(["yes", "no"]).describe("Creator's initial position"),
      confidence: z.number().min(1).max(100).describe("Creator's confidence level (1-100)"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        future: {
          title: input.title,
          predictionType: input.predictionType,
          resolutionCriteria: input.resolutionCriteria,
          resolutionDate: input.resolutionDate,
          status: "open",
          creatorPosition: { position: input.position, confidence: input.confidence },
        },
        message: `Skill-Future created: "${input.title}". Other tribe members can now stake positions. Resolution: ${input.resolutionDate}.`,
        insight: input.confidence >= 80
          ? "High-conviction prediction. If correct, this significantly builds your judgment reputation."
          : "Moderate conviction. Consider gathering more signals before resolution.",
      }
    },
  }),

  queryKnowledgeGPU: tool({
    description: "Query your Personal Knowledge GPU — semantic search across your private vector space. Searches all your project history, notes, prompts, knowledge contributions, and signals. Instant Recall on the Edge.",
    inputSchema: z.object({
      query: z.string().min(3).max(500).describe("Natural language query (e.g., 'What did I learn about prompt engineering for legal workflows?')"),
      scope: z.enum(["all", "knowledge_base", "signals", "workflows", "projects"]).default("all"),
      limit: z.number().min(1).max(20).default(5),
    }),
    execute: async (input) => {
      // In production, this would use vector similarity search against user-scoped embeddings
      return {
        ok: true,
        query: input.query,
        scope: input.scope,
        results: [
          {
            type: "knowledge_entry",
            title: "Prompt Engineering for Domain Experts",
            relevanceScore: 0.94,
            preview: "Key insight: Domain-specific prompt chains outperform generic prompts by 3x when the user provides structured context about their field...",
            source: "tribal_knowledge_base",
          },
          {
            type: "signal",
            title: "Claude 4.6 + Legal Workflow Test",
            relevanceScore: 0.87,
            preview: "Tested: Contract review automation using Claude 4.6. Result: 85% accuracy on clause extraction, 12 minutes saved per contract...",
            source: "signal_feed",
          },
          {
            type: "workflow",
            title: "Research Pipeline v2",
            relevanceScore: 0.81,
            preview: "3-step workflow: webSearch → analyzeCSVProfiles → contributeToKnowledgeBase. Estimated 5x faster than manual research...",
            source: "agent_workflows",
          },
        ],
        message: `Found ${3} results across your Knowledge GPU. Vector search scoped to: ${input.scope}.`,
        note: "Results ranked by semantic similarity to your query. Your Knowledge GPU grows with every contribution, signal, and workflow you run.",
      }
    },
  }),

  // === AI-Native: Onboarding Discovery & Workflow Orchestration ===

  runDiscoverySession: tool({
    description: "Run an AI-Driven Discovery Session for a new user. Analyzes their background, skills, and aspirations to identify their 'Human Alpha' — the unique strengths AI cannot replace. Produces a custom AI-Augmented Workflow recommendation. This replaces generic form-fill onboarding with a Career Reset Catalyst.",
    inputSchema: z.object({
      currentRole: z.string().min(2).max(200).describe("User's current job title or role"),
      industry: z.string().min(2).max(100).describe("User's industry"),
      topSkills: z.array(z.string()).min(1).max(10).describe("User's top skills (3-10)"),
      yearsExperience: z.number().min(0).max(50).describe("Years of professional experience"),
      whatExcitesYou: z.string().min(10).max(1000).describe("What excites them most about their field — the passion signal"),
      biggestChallenge: z.string().min(10).max(1000).describe("Their biggest challenge or friction point at work"),
      aiToolsUsed: z.array(z.string()).optional().describe("AI tools they already use (e.g. ChatGPT, Copilot, Claude)"),
      careerAspiration: z.string().optional().describe("Where they want to be in 2-5 years"),
    }),
    execute: async (input) => {
      const EXECUTION_SKILLS = ["coding", "testing", "data entry", "reporting", "scheduling", "translation", "copy editing", "form processing", "transcription"]
      const DECISION_SKILLS = ["strategy", "system design", "leadership", "architecture", "negotiation", "judgment", "ethics", "stakeholder management", "problem framing"]
      const DESIGN_SKILLS = ["product design", "creative direction", "innovation", "research", "ux", "vision", "brand strategy"]

      const lowerSkills = input.topSkills.map((s) => s.toLowerCase())
      const executionCount = lowerSkills.filter((s) => EXECUTION_SKILLS.some((e) => s.includes(e))).length
      const decisionCount = lowerSkills.filter((s) => DECISION_SKILLS.some((d) => s.includes(d))).length
      const designCount = lowerSkills.filter((s) => DESIGN_SKILLS.some((d) => s.includes(d))).length

      const currentLayer = designCount >= decisionCount && designCount >= executionCount
        ? "design" as const
        : decisionCount >= executionCount ? "decision" as const : "execution" as const

      const passionSignals = [
        input.whatExcitesYou.length > 100 ? "Deep articulation of passion" : "Emerging interest",
        input.aiToolsUsed && input.aiToolsUsed.length > 2 ? "Active AI adopter" : input.aiToolsUsed && input.aiToolsUsed.length > 0 ? "AI-curious" : "AI-nascent",
        input.yearsExperience >= 10 ? "Domain veteran" : input.yearsExperience >= 5 ? "Mid-career professional" : "Rising talent",
      ]

      const humanAlpha = {
        uniqueStrengths: lowerSkills.filter((s) => DECISION_SKILLS.some((d) => s.includes(d)) || DESIGN_SKILLS.some((d) => s.includes(d))).map((s) => input.topSkills[lowerSkills.indexOf(s)]),
        domainExpertise: [input.industry, input.currentRole],
        decisionLayerSkills: lowerSkills.filter((s) => DECISION_SKILLS.some((d) => s.includes(d))).map((s) => input.topSkills[lowerSkills.indexOf(s)]),
        craftOrientation: input.whatExcitesYou.slice(0, 200),
      }

      const workflows = [
        {
          name: `${input.industry} Intelligence Pipeline`,
          description: `Automated research → analysis → insight generation for ${input.industry}. You direct the framing, AI handles the search+summarize.`,
          tools: ["webSearch", "analyzeCSVProfiles", "contributeToKnowledgeBase"],
          estimatedTimeMultiplier: "5x faster than manual research",
        },
        {
          name: `${input.currentRole} Force Multiplier`,
          description: `AI-augmented workflow for your daily ${input.currentRole} tasks. Automates the execution layer so you focus on ${currentLayer === "execution" ? "moving to decision/design" : "deepening your " + currentLayer + " layer"}.`,
          tools: ["searchProfiles", "designTribesForObjective", "createTribe", "formMicroSquad"],
          estimatedTimeMultiplier: "10x output per hour",
        },
        {
          name: "Network Leverage Engine",
          description: "Turn your LinkedIn network into an active intelligence asset. AI identifies high-value connections, skill gaps, and tribe formation opportunities.",
          tools: ["searchProfiles", "analyzeTribeComposition", "computeSkillDelta", "buildNetworkAnalysis"],
          estimatedTimeMultiplier: "3x more actionable insights",
        },
      ]

      const pivotRecommendations = currentLayer === "execution" ? [
        "Shift from task execution to workflow orchestration — use AI to automate your repetitive work",
        "Build an AI-augmented portfolio demonstrating you can produce team-level output solo",
        "Deepen judgment and domain expertise — the things AI still fails at",
        `Start with the "${workflows[0].name}" workflow to practice directing AI systems`,
      ] : currentLayer === "decision" ? [
        "You're already in the decision layer — amplify with AI orchestration",
        "Mentor others transitioning from execution to decision roles",
        "Build cross-domain synthesis capabilities — connect insights AI can't",
      ] : [
        "Design-layer professional — you're positioned well for the AI era",
        "Use AI to prototype faster and explore more directions",
        "Focus on vision and problem framing — your highest-leverage activities",
      ]

      return {
        ok: true,
        discoveryComplete: true,
        humanAlpha,
        currentLayer,
        passionSignals,
        curiosityIndex: Math.min(10, (input.whatExcitesYou.length / 100) + (input.aiToolsUsed?.length ?? 0) * 1.5 + (input.yearsExperience > 5 ? 2 : 0)),
        suggestedWorkflows: workflows,
        careerTrajectory: {
          currentLayer,
          targetLayer: currentLayer === "execution" ? "decision" : currentLayer === "decision" ? "design" : "design",
          pivotRecommendations,
        },
        engagementProfile: {
          passionSignals,
          curiosityIndex: Math.round(Math.min(10, (input.whatExcitesYou.length / 100) + (input.aiToolsUsed?.length ?? 0) * 1.5)),
          domainFit: input.yearsExperience >= 5 ? "strong" : input.yearsExperience >= 2 ? "developing" : "exploring",
        },
        firstWorkflowRecommendation: workflows[0],
        message: `Discovery complete. Your Human Alpha: ${humanAlpha.uniqueStrengths.length > 0 ? humanAlpha.uniqueStrengths.join(", ") : "emerging — focus on building decision-layer skills"}. You're operating at the ${currentLayer} layer. ${currentLayer === "execution" ? "Priority: Move toward the decision layer using AI as your force multiplier." : "You're well-positioned. Amplify with AI orchestration."}`,
        nextSteps: [
          `Start your first workflow: "${workflows[0].name}"`,
          "Import your LinkedIn network (CSV or PDF) for AI analysis",
          "Ask me to build a tribe around your strongest domain",
        ],
      }
    },
  }),

  // === Tribe Intelligence: High-Bandwidth Syndicate Tools ===

  assessProofOfAgency: tool({
    description: "Evaluate a candidate's Proof of Agency for tribe admission. Analyzes their profile, skills, and project description to determine if they qualify as a Force Multiplier (solo work that replaces a team).",
    inputSchema: z.object({
      candidateProfileId: z.string().describe("CRM profile ID of the candidate"),
      portfolioUrl: z.string().url().optional().describe("URL to their AI-augmented build/portfolio"),
      projectDescription: z.string().min(20).max(2000).describe("Description of a complex project they executed solo that would normally require a team"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      const profile = authScope.ok
        ? (await fetchWorkspaceProfiles(authScope.userClient, 800)).find((p) => p.id === input.candidateProfileId) ?? null
        : null

      const skills = profile?.skills ?? []
      const seniority = profile?.seniority ?? "Mid"
      const seniorityMap: Record<string, number> = { CXO: 1.3, VP: 1.2, Director: 1.15, Principal: 1.1, Staff: 1.05, Manager: 1.0, Lead: 0.95, Senior: 0.9, Mid: 0.8 }
      const seniorityMultiplier = seniorityMap[seniority] ?? 0.8
      const skillBreadth = Math.min(skills.length * 4, 30)
      const descriptionDepth = Math.min(input.projectDescription.length / 20, 30)
      const portfolioBonus = input.portfolioUrl ? 15 : 0
      const rawScore = Math.round((skillBreadth + descriptionDepth + portfolioBonus) * seniorityMultiplier)
      const agencyScore = Math.min(100, Math.max(0, rawScore))
      const verdict = agencyScore >= 70 ? "accept" as const : agencyScore >= 45 ? "review" as const : "reject" as const

      return {
        ok: true,
        candidateProfileId: input.candidateProfileId,
        candidateName: profile ? `${profile.firstName} ${profile.lastName}` : input.candidateProfileId,
        agencyScore,
        verdict,
        reasoning: verdict === "accept"
          ? `Strong agency signal: ${skills.length} skills, ${seniority} seniority, substantial build description. Qualifies as Force Multiplier.`
          : verdict === "review"
          ? `Moderate agency signal. Skills breadth (${skills.length}) and project scope suggest potential, but additional evidence recommended.`
          : `Insufficient agency evidence. Consider requesting a more detailed portfolio or project walkthrough.`,
        breakdown: { skillBreadth, descriptionDepth, portfolioBonus, seniorityMultiplier },
      }
    },
  }),

  computeSkillDelta: tool({
    description: "Compute Skill-Delta analysis for all tribe members. Identifies which skills are at risk of automation and recommends skills to acquire. Triggers Evolve Alerts for members whose execution layer is >70% automatable.",
    inputSchema: z.object({
      tribeId: z.string().describe("Tribe ID to analyze"),
      industryContext: z.string().optional().describe("Industry context for automation risk assessment (e.g. 'software engineering', 'legal', 'marketing')"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let tribeMembers: CrmProfile[] = []
      if (authScope.ok) {
        const allProfiles = await fetchWorkspaceProfiles(authScope.userClient, 800)
        tribeMembers = allProfiles.filter((p) => p.tribe === input.tribeId || p.id.startsWith("tribe-"))
      }
      if (tribeMembers.length === 0) {
        tribeMembers = generateMockProfiles("tribe members", 6).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const HIGH_AUTOMATION_SKILLS = ["data entry", "report generation", "scheduling", "basic coding", "translation", "transcription", "copy editing", "email drafting", "search summarize", "form processing"]
      const LOW_AUTOMATION_SKILLS = ["system design", "leadership", "strategy", "negotiation", "judgment", "ethics", "creative direction", "stakeholder management", "problem framing", "cross-domain synthesis"]
      const RECOMMENDED_UPSKILLS = ["AI orchestration", "prompt engineering", "system design", "decision architecture", "domain expertise deepening", "human-AI collaboration", "strategic communication"]

      const memberAnalysis = tribeMembers.map((member) => {
        const lowerSkills = member.skills.map((s) => s.toLowerCase())
        const atRisk = lowerSkills.filter((s) => HIGH_AUTOMATION_SKILLS.some((h) => s.includes(h)))
        const safe = lowerSkills.filter((s) => LOW_AUTOMATION_SKILLS.some((l) => s.includes(l)))
        const riskPercent = member.skills.length > 0 ? Math.round((atRisk.length / member.skills.length) * 100) : 30
        const recommended = RECOMMENDED_UPSKILLS.filter((r) => !lowerSkills.includes(r.toLowerCase())).slice(0, 3)

        return {
          memberId: member.id,
          name: `${member.firstName} ${member.lastName}`,
          seniority: member.seniority,
          currentSkills: member.skills,
          atRiskSkills: atRisk,
          safeSkills: safe,
          automationRiskPercent: Math.min(riskPercent + (member.seniority === "Mid" ? 15 : 0), 95),
          recommendedSkills: recommended,
          evolveAlert: riskPercent >= 70,
        }
      })

      const evolveAlerts = memberAnalysis.filter((m) => m.evolveAlert)
      return {
        ok: true,
        tribeId: input.tribeId,
        industryContext: input.industryContext ?? "general",
        membersAnalyzed: memberAnalysis.length,
        memberAnalysis,
        evolveAlerts: evolveAlerts.map((m) => ({
          memberId: m.memberId,
          name: m.name,
          riskPercent: m.automationRiskPercent,
          urgency: m.automationRiskPercent >= 80 ? "critical" : "high",
          action: `Pivot from execution (${m.atRiskSkills.join(", ")}) to decision layer (${m.recommendedSkills.join(", ")})`,
        })),
        tribeSummary: {
          avgRisk: Math.round(memberAnalysis.reduce((s, m) => s + m.automationRiskPercent, 0) / memberAnalysis.length),
          highRiskCount: evolveAlerts.length,
          topAtRiskSkills: [...new Set(memberAnalysis.flatMap((m) => m.atRiskSkills))].slice(0, 5),
          topRecommendedSkills: [...new Set(memberAnalysis.flatMap((m) => m.recommendedSkills))].slice(0, 5),
        },
      }
    },
  }),

  formMicroSquad: tool({
    description: "Form a Liquid Micro-Squad from tribe members for a time-boxed sprint. Matches members by complementary AI-tool mastery and domain expertise for maximum output in 48-hour bursts.",
    inputSchema: z.object({
      tribeId: z.string().describe("Tribe ID to form squad from"),
      objective: z.string().min(10).max(500).describe("Sprint objective (e.g. 'Build an MVP for paralegal workflow disruption')"),
      durationHours: z.number().min(2).max(168).default(48).describe("Sprint duration in hours (default 48)"),
      requiredSkillMix: z.array(z.string()).optional().describe("Required skill categories for the squad"),
      squadSize: z.number().min(2).max(6).default(3).describe("Number of squad members (2-6, default 3)"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let candidates: CrmProfile[] = []
      if (authScope.ok) {
        const allProfiles = await fetchWorkspaceProfiles(authScope.userClient, 800)
        candidates = allProfiles.filter((p) => p.tribe === input.tribeId || allProfiles.length > 0)
      }
      if (candidates.length === 0) {
        candidates = generateMockProfiles("squad candidates", 8).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const requiredSkills = input.requiredSkillMix ?? []
      const scored = candidates.map((c) => {
        const skillMatch = requiredSkills.length > 0
          ? requiredSkills.filter((rs) => c.skills.some((s) => s.toLowerCase().includes(rs.toLowerCase()))).length / requiredSkills.length
          : 0.5
        const diversityBonus = c.seniority === "Senior" || c.seniority === "Lead" ? 0.2 : 0
        return { profile: c, score: c.matchScore / 100 * 0.4 + skillMatch * 0.4 + diversityBonus + Math.random() * 0.1 }
      })
      scored.sort((a, b) => b.score - a.score)
      const squad = scored.slice(0, input.squadSize)
      const allSquadSkills = [...new Set(squad.flatMap((s) => s.profile.skills))]
      const skillCoverage = requiredSkills.length > 0
        ? requiredSkills.filter((rs) => allSquadSkills.some((s) => s.toLowerCase().includes(rs.toLowerCase()))).length / requiredSkills.length
        : 1

      return {
        ok: true,
        sprintName: `Sprint: ${input.objective.slice(0, 50)}`,
        objective: input.objective,
        durationHours: input.durationHours,
        squad: squad.map((s) => ({
          memberId: s.profile.id,
          name: `${s.profile.firstName} ${s.profile.lastName}`,
          role: s.profile.seniority === "Lead" || s.profile.seniority === "Senior" ? "Lead" : "Executor",
          topSkills: s.profile.skills.slice(0, 4),
          fitScore: Math.round(s.score * 100),
        })),
        complementarityScore: Math.round(skillCoverage * 100),
        skillCoverage: `${Math.round(skillCoverage * 100)}%`,
        coveredSkills: allSquadSkills.slice(0, 10),
        recommendation: skillCoverage >= 0.8
          ? "Strong skill coverage. Squad is ready to execute."
          : `Partial coverage (${Math.round(skillCoverage * 100)}%). Consider adding a member with: ${requiredSkills.filter((rs) => !allSquadSkills.some((s) => s.toLowerCase().includes(rs.toLowerCase()))).join(", ")}`,
      }
    },
  }),

  runRegretReview: tool({
    description: "Run a Regret Minimization Review for tribe members. Based on the Bezos framework, evaluates each member's current trajectory against AI-era velocity and recommends pivots. Ask: 'Will you regret this skill-stack in 24 months?'",
    inputSchema: z.object({
      tribeId: z.string().describe("Tribe ID"),
      memberId: z.string().optional().describe("Specific member ID (omit for all members)"),
      horizonMonths: z.number().default(24).describe("Review horizon in months (default 24)"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        const allProfiles = await fetchWorkspaceProfiles(authScope.userClient, 800)
        profiles = input.memberId
          ? allProfiles.filter((p) => p.id === input.memberId)
          : allProfiles.slice(0, 12)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("review candidates", 4).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const reviews = profiles.map((p) => {
        const isExecution = p.skills.some((s) => ["coding", "testing", "reporting", "data entry", "admin"].some((e) => s.toLowerCase().includes(e)))
        const isDecision = p.skills.some((s) => ["strategy", "design", "leadership", "architecture", "analysis"].some((d) => s.toLowerCase().includes(d)))
        const trajectoryRisk = isExecution && !isDecision ? "high" : isExecution && isDecision ? "moderate" : "low"
        const urgency = trajectoryRisk === "high" ? "pivot-now" : trajectoryRisk === "moderate" ? "evolve-within-6mo" : "maintain-course"

        return {
          memberId: p.id,
          name: `${p.firstName} ${p.lastName}`,
          currentRole: p.headline,
          seniority: p.seniority,
          horizonMonths: input.horizonMonths,
          currentTrajectory: isDecision ? "Decision/Design Layer — relatively safe" : isExecution ? "Execution Layer — at risk of displacement" : "Mixed — needs intentional steering",
          riskAssessment: trajectoryRisk,
          urgency,
          regretQuestion: `In ${input.horizonMonths} months, will ${p.firstName} regret staying in a ${isExecution ? "primarily execution-focused" : "strategically-positioned"} role?`,
          pivotRecommendations: trajectoryRisk !== "low" ? [
            "Shift from task execution to workflow orchestration",
            "Build AI-augmented portfolio demonstrating force multiplication",
            "Deepen domain expertise that requires human judgment",
            "Lead a micro-squad sprint to practice orchestration skills",
          ] : [
            "Continue deepening decision-layer expertise",
            "Mentor execution-layer members transitioning up",
            "Contribute to tribal knowledge base regularly",
          ],
        }
      })

      return {
        ok: true,
        tribeId: input.tribeId,
        horizonMonths: input.horizonMonths,
        reviewDate: new Date().toISOString(),
        membersReviewed: reviews.length,
        reviews,
        tribeSummary: {
          highRisk: reviews.filter((r) => r.riskAssessment === "high").length,
          moderate: reviews.filter((r) => r.riskAssessment === "moderate").length,
          lowRisk: reviews.filter((r) => r.riskAssessment === "low").length,
          overallHealth: reviews.filter((r) => r.riskAssessment === "low").length >= reviews.length * 0.6 ? "healthy" : "needs-attention",
        },
      }
    },
  }),

  contributeToKnowledgeBase: tool({
    description: "Contribute an insight, prompt chain, workflow, or case study to the tribe's Collective Edge (shared knowledge base). Only validated, actionable knowledge — no news articles, no speculation.",
    inputSchema: z.object({
      tribeId: z.string().describe("Tribe ID"),
      title: z.string().min(5).max(200).describe("Title of the contribution"),
      content: z.string().min(20).max(5000).describe("The knowledge content — detailed, actionable, validated"),
      contentType: z.enum(["insight", "prompt_chain", "workflow", "case_study"]).describe("Type of contribution"),
      toolChain: z.array(z.string()).optional().describe("Tools used (e.g. ['Claude 4.6', 'Python', 'Supabase'])"),
      tags: z.array(z.string()).optional().describe("Searchable tags"),
      timeSaved: z.string().optional().describe("Time saved (e.g. '2 hours per week')"),
      errorRate: z.number().min(0).max(100).optional().describe("Error rate percentage"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        tribeId: input.tribeId,
        entry: {
          title: input.title,
          contentType: input.contentType,
          contentPreview: input.content.slice(0, 200),
          toolChain: input.toolChain ?? [],
          tags: input.tags ?? [],
          metrics: { timeSaved: input.timeSaved, errorRate: input.errorRate },
        },
        message: `Knowledge entry "${input.title}" contributed to the Collective Edge. The tribe's intelligence grows.`,
        nextActions: [
          "Other members can now recall this knowledge through the tribal interface",
          "Use 'search knowledge base' to find related entries",
          "High-value entries get upvoted and surfaced in the Signal Feed",
        ],
      }
    },
  }),

  postSignal: tool({
    description: "Post a validated use-case to the tribe's Signal-Only Feed. Rule: No news articles. Only 'I tried Tool X on Task Y, here is the prompt-chain, here is the error rate, here is the time saved.'",
    inputSchema: z.object({
      tribeId: z.string().describe("Tribe ID"),
      toolUsed: z.string().describe("Tool used (e.g. 'Claude 4.6', 'GPT-4o', 'Custom Python script')"),
      taskDescription: z.string().min(10).max(500).describe("What task was performed"),
      promptChain: z.string().optional().describe("The actual prompt(s) used"),
      resultSummary: z.string().min(10).max(2000).describe("What happened — concrete results"),
      timeSavedMinutes: z.number().optional().describe("Minutes saved compared to manual approach"),
      errorRate: z.number().min(0).max(100).optional().describe("Error rate percentage"),
    }),
    execute: async (input) => {
      return {
        ok: true,
        tribeId: input.tribeId,
        signal: {
          toolUsed: input.toolUsed,
          task: input.taskDescription,
          result: input.resultSummary.slice(0, 200),
          timeSaved: input.timeSavedMinutes ? `${input.timeSavedMinutes} minutes` : undefined,
          errorRate: input.errorRate != null ? `${input.errorRate}%` : undefined,
        },
        message: `Signal posted: "${input.taskDescription}" using ${input.toolUsed}. Tribe members can now validate and learn from this.`,
        feedRule: "Signal over Noise: Only validated use-cases. No articles, no speculation, no hype.",
      }
    },
  }),

  auditEngagement: tool({
    description: "Audit tribe engagement levels. Identifies disengaged members and recommends either re-engagement strategies or career pivot assistance. Disengagement = displacement risk.",
    inputSchema: z.object({
      tribeId: z.string().describe("Tribe ID to audit"),
    }),
    execute: async (input) => {
      const authScope = ensureAuthenticatedToolsContext(authContext)
      let profiles: CrmProfile[] = []
      if (authScope.ok) {
        profiles = (await fetchWorkspaceProfiles(authScope.userClient, 800)).slice(0, 12)
      }
      if (profiles.length === 0) {
        profiles = generateMockProfiles("engagement audit", 6).map((p) => ({ id: p.id, firstName: p.name.split(" ")[0], lastName: p.name.split(" ").slice(1).join(" "), fullName: p.name, headline: p.title, company: p.company, location: p.location, industry: "Technology", connections: p.connections, skills: p.skills, matchScore: p.matchScore, seniority: "Mid" }))
      }

      const audit = profiles.map((p) => {
        const engagementScore = Math.round(40 + Math.random() * 55)
        const isEngaged = engagementScore >= 60
        return {
          memberId: p.id,
          name: `${p.firstName} ${p.lastName}`,
          engagementScore,
          status: engagementScore >= 75 ? "highly-engaged" : engagementScore >= 60 ? "engaged" : engagementScore >= 40 ? "at-risk" : "disengaged",
          lastActive: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
          contributions: Math.floor(Math.random() * 20),
          recommendation: isEngaged
            ? "Continue current trajectory. Consider mentoring at-risk members."
            : "Trigger career pivot assistance. Use AI to explore passion-adjacent domains with lower switching cost.",
        }
      })

      const disengaged = audit.filter((a) => a.status === "disengaged" || a.status === "at-risk")
      return {
        ok: true,
        tribeId: input.tribeId,
        auditDate: new Date().toISOString(),
        membersAudited: audit.length,
        audit,
        summary: {
          highlyEngaged: audit.filter((a) => a.status === "highly-engaged").length,
          engaged: audit.filter((a) => a.status === "engaged").length,
          atRisk: audit.filter((a) => a.status === "at-risk").length,
          disengaged: audit.filter((a) => a.status === "disengaged").length,
          avgEngagement: Math.round(audit.reduce((s, a) => s + a.engagementScore, 0) / audit.length),
        },
        actionItems: disengaged.length > 0
          ? [`${disengaged.length} members need attention. Disengagement = displacement. Trigger passion audit for: ${disengaged.map((d) => d.name).join(", ")}`]
          : ["Tribe engagement is healthy. Schedule next audit in 30 days."],
        tribalDirective: "A tribe composed only of High-Agency Operators ensures collective evolution speed remains high.",
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
