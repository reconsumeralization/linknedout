import type { ParsedProfile } from "@/lib/csv/csv-parser"
import type { Tribe, TribeMember } from "@/lib/shared/types"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseClient } from "@/lib/supabase/supabase"

type SupabaseRow = Record<string, unknown>

const TABLES = {
  profiles: process.env.NEXT_PUBLIC_SUPABASE_PROFILES_TABLE || "profiles",
  tribes: process.env.NEXT_PUBLIC_SUPABASE_TRIBES_TABLE || "tribes",
  projects: process.env.NEXT_PUBLIC_SUPABASE_PROJECTS_TABLE || "projects",
  activity: process.env.NEXT_PUBLIC_SUPABASE_ACTIVITY_TABLE || "activity_log",
  csvUploads: process.env.NEXT_PUBLIC_SUPABASE_CSV_UPLOADS_TABLE || "csv_uploads",
  projectPositions: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_POSITIONS_TABLE || "project_positions",
  projectApplications: process.env.NEXT_PUBLIC_SUPABASE_PROJECT_APPLICATIONS_TABLE || "project_applications",
  fundraisingCampaigns: process.env.NEXT_PUBLIC_SUPABASE_FUNDRAISING_CAMPAIGNS_TABLE || "fundraising_campaigns",
  fundraisingDonors: process.env.NEXT_PUBLIC_SUPABASE_FUNDRAISING_DONORS_TABLE || "fundraising_donors",
  fundraisingDonations: process.env.NEXT_PUBLIC_SUPABASE_FUNDRAISING_DONATIONS_TABLE || "fundraising_donations",
  fundraisingGoals: process.env.NEXT_PUBLIC_SUPABASE_FUNDRAISING_GOALS_TABLE || "fundraising_goals",
}

const DASHBOARD_ACTIVITY_LIMIT = 8

export interface SupabaseProfileView {
  id: string
  firstName: string
  lastName: string
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

export type ProjectStatus =
  | "planned"
  | "active"
  | "completed"
  | "on-hold"
  | "archived"
  | "cancelled"
  | "paused"
  | "at-risk"
  | "pending"

export type ProjectType = "hiring" | "team-building" | "aspiration" | "tribe" | "network-expansion"

export interface SupabaseProjectMilestone {
  title: string
  status: "pending" | "active" | "completed"
  dueDate: string
}

export interface SupabaseProjectView {
  id: string
  name: string
  description: string
  type: ProjectType
  status: ProjectStatus
  progress: number
  profiles: number
  tribe?: string
  targetDate?: string
  tags: string[]
  milestones: SupabaseProjectMilestone[]
  nextAction: string
  aspirations?: string[]
  blockers?: string[]
  priority?: "low" | "medium" | "high" | "critical"
  owner?: string
  createdAt?: string
  updatedAt?: string
}

export interface ProjectPositionView {
  id: string
  projectId: string
  title: string
  description: string
  requiredSkills: string[]
  seniority?: string
  location?: string
  openings: number
  status: "open" | "closed" | "draft"
  createdAt?: string
}

export interface RankedProjectApplicationView {
  id: string
  projectId: string
  positionId: string
  applicantUserId: string
  applicantProfileId?: string
  applicantName: string
  applicantHeadline: string
  applicantSkills: string[]
  matchScore: number
  connections: number
  aiScore: number
  aiSummary: string
  status: string
  createdAt?: string
}

export interface ProjectHiringSnapshot {
  positions: ProjectPositionView[]
  rankedApplicationsByPosition: Record<string, RankedProjectApplicationView[]>
}

export interface ProjectCrmCandidateRecommendationView {
  profileId: string
  firstName: string
  lastName: string
  fullName: string
  headline: string
  company: string
  location: string
  seniority: string
  skills: string[]
  tribe?: string
  linkedinUrl?: string
  matchScore: number
  connections: number
  skillCoverage: number
  seniorityFit: number
  relationshipScore: number
  networkScore: number
  aiFitScore: number
  alreadyApplied: boolean
  reasons: string[]
}

export interface ProjectCrmPositionRecommendationView {
  position: ProjectPositionView
  candidateCount: number
  alreadyAppliedCount: number
  averageAiFitScore: number
  topSkillGaps: string[]
  candidates: ProjectCrmCandidateRecommendationView[]
}

export interface ProjectCrmRecommendationSnapshot {
  generatedAt: string
  profilePoolSize: number
  positions: ProjectCrmPositionRecommendationView[]
}

export type FundraisingCampaignStatus = "draft" | "active" | "paused" | "completed" | "archived"
export type FundraisingDonationStatus = "pledged" | "received" | "recurring" | "refunded" | "cancelled"
export type FundraisingGoalStatus = "active" | "met" | "missed" | "cancelled"

export interface FundraisingCampaignView {
  id: string
  name: string
  description: string
  goalAmount: number
  currency: string
  status: FundraisingCampaignStatus
  startDate?: string
  endDate?: string
  totalRaised?: number
  donorCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface FundraisingDonorView {
  id: string
  campaignId?: string
  name: string
  email?: string
  company?: string
  notes?: string
  totalDonated: number
  donationCount: number
  createdAt?: string
  updatedAt?: string
}

export interface FundraisingDonationView {
  id: string
  campaignId: string
  donorId?: string
  donorName?: string
  amount: number
  currency: string
  status: FundraisingDonationStatus
  donatedAt: string
  note?: string
  createdAt?: string
  updatedAt?: string
}

export interface FundraisingGoalView {
  id: string
  campaignId: string
  title: string
  description?: string
  targetAmount: number
  currentAmount: number
  currency: string
  dueDate?: string
  status: FundraisingGoalStatus
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export interface FundraisingSnapshot {
  campaigns: FundraisingCampaignView[]
  donors: FundraisingDonorView[]
  donations: FundraisingDonationView[]
  goals: FundraisingGoalView[]
}

export interface DashboardActivityView {
  action: string
  time: string
  type: string
}

export interface DashboardSnapshot {
  profileCount: number
  tribeCount: number
  projectCount: number
  networkReach: number
  projects: Array<{
    name: string
    progress: number
    status: string
    type: string
  }>
  activities: DashboardActivityView[]
}

type CsvUploadTelemetryInput = {
  fileName: string
  rowCount: number
  preview: string
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

function parseJsonIfPossible(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean)
  }

  if (typeof value === "string") {
    const parsed = parseJsonIfPossible(value)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => asString(item)).filter(Boolean)
    }
    return value
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function asObjectArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (typeof value === "string") {
    const parsed = parseJsonIfPossible(value)
    if (Array.isArray(parsed)) {
      return parsed as T[]
    }
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

function relativeTime(value: unknown): string {
  const iso = asString(value)
  if (!iso) {
    return "recently"
  }

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return "recently"
  }

  const now = Date.now()
  const diffMs = now - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)

  if (minutes < 1) {
    return "just now"
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  if (hours < 24) {
    return `${hours}h ago`
  }
  if (days < 7) {
    return `${days}d ago`
  }

  return date.toLocaleDateString()
}

async function fetchRows(table: string, limit = 200): Promise<SupabaseRow[] | null> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.from(table).select("*").limit(limit)
  if (error) {
    console.warn(`[supabase] read failed for table "${table}": ${error.message}`)
    return null
  }

  return (data || []) as SupabaseRow[]
}

function mapProfileRow(row: SupabaseRow, index: number): SupabaseProfileView {
  const displayName = asString(row.name)
  const names = splitName(displayName)
  const firstName = asString(row.first_name || row.firstName, names.firstName || `User${index + 1}`)
  const lastName = asString(row.last_name || row.lastName, names.lastName)
  const id = asString(row.id || row.profile_id || `profile-${index + 1}`)

  return {
    id,
    firstName,
    lastName,
    headline: asString(row.headline, "LinkedIn profile"),
    company: asString(row.company, "Unknown"),
    location: asString(row.location, "Unknown"),
    industry: asString(row.industry, "General"),
    connections: asNumber(row.connections ?? row.connections_count, 0),
    skills: asStringArray(row.skills),
    matchScore: asNumber(row.match_score ?? row.matchScore, 75),
    seniority: asString(row.seniority, "Senior"),
    tribe: asString(row.tribe ?? row.tribe_name) || undefined,
    linkedinUrl: asString(row.linkedin_url ?? row.linkedinUrl) || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }
}

function mapTribeMember(item: unknown, index: number): TribeMember {
  const member = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}
  const name = asString(member.name, `Member ${index + 1}`)
  return {
    personId: asString(member.personId || member.person_id || member.id, `person-${index + 1}`),
    name,
    tribeRole: asString(member.tribeRole || member.tribe_role, "Executor"),
    projectRoles: [],
    seniority: asString(member.seniority, "Mid"),
    skills: asStringArray(member.skills),
    tags: [],
  }
}

function buildFallbackRadar(cohesion: number, complementarity: number) {
  return [
    { metric: "Cohesion", value: Math.round(cohesion * 10) },
    { metric: "Skills", value: Math.round(complementarity * 10) },
    { metric: "Diversity", value: 70 },
    { metric: "Leadership", value: 76 },
    { metric: "Speed", value: 81 },
  ]
}

function buildFallbackSkillDist(skills: string[]) {
  if (skills.length === 0) {
    return [
      { name: "Engineering", value: 35 },
      { name: "Product", value: 30 },
      { name: "Design", value: 20 },
      { name: "Data", value: 15 },
    ]
  }

  return skills.slice(0, 4).map((name, index) => ({
    name,
    value: Math.max(10, 40 - index * 7),
  }))
}

function mapTribeRow(row: SupabaseRow, index: number): Tribe {
  const membersRaw = asObjectArray<unknown>(row.members)
  const cohesion = asNumber(row.cohesion, 8.0)
  const complementarity = asNumber(row.complementarity, 7.8)
  const commonSkills = asStringArray(row.common_skills ?? row.commonSkills)

  const radarData = asObjectArray<{ metric?: unknown; value?: unknown }>(row.radar_data ?? row.radarData)
    .map((item) => ({
      metric: asString(item.metric, "Metric"),
      value: asNumber(item.value, 0),
    }))
    .filter((item) => item.metric && Number.isFinite(item.value))

  const skillDist = asObjectArray<{ name?: unknown; value?: unknown }>(row.skill_dist ?? row.skillDist)
    .map((item) => ({
      name: asString(item.name, "Skill"),
      value: asNumber(item.value, 0),
    }))
    .filter((item) => item.name && Number.isFinite(item.value))

  return {
    id: asString(row.id, `tribe-${index + 1}`),
    name: asString(row.name, `Tribe ${index + 1}`),
    description: asString(row.description, "Supabase tribe"),
    members: membersRaw.map(mapTribeMember),
    commonSkills,
    avgExperience: asNumber(row.avg_experience ?? row.avgExperience, 6),
    industryFocus: asString(row.industry_focus ?? row.industryFocus, "General"),
    projects: asStringArray(row.projects),
    cohesion,
    complementarity,
    strengths: asStringArray(row.strengths),
    radarData: radarData.length > 0 ? radarData : buildFallbackRadar(cohesion, complementarity),
    skillDist: skillDist.length > 0 ? skillDist : buildFallbackSkillDist(commonSkills),
    status: asString(row.status, "active") as Tribe["status"],
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }
}

function normalizeMilestoneStatus(value: string): "pending" | "active" | "completed" {
  if (value === "completed" || value === "active") {
    return value
  }
  return "pending"
}

function mapMilestone(item: unknown, index: number): SupabaseProjectMilestone {
  const milestone = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}
  return {
    title: asString(milestone.title, `Milestone ${index + 1}`),
    status: normalizeMilestoneStatus(asString(milestone.status, "pending")),
    dueDate: asString(milestone.dueDate || milestone.due_date, new Date().toISOString()),
  }
}

function normalizeProjectType(value: string): ProjectType {
  if (value === "hiring" || value === "team-building" || value === "aspiration" || value === "tribe" || value === "network-expansion") {
    return value
  }
  return "team-building"
}

function normalizeProjectStatus(value: string): ProjectStatus {
  const valid: ProjectStatus[] = [
    "planned",
    "active",
    "completed",
    "on-hold",
    "archived",
    "cancelled",
    "paused",
    "at-risk",
    "pending",
  ]
  return valid.includes(value as ProjectStatus) ? (value as ProjectStatus) : "active"
}

function normalizePositionStatus(value: string): "open" | "closed" | "draft" {
  if (value === "open" || value === "closed" || value === "draft") {
    return value
  }
  return "open"
}

function seniorityToRank(value: string): number {
  const normalized = value.toLowerCase()
  if (normalized.includes("intern") || normalized.includes("junior")) return 1
  if (normalized.includes("mid")) return 2
  if (normalized.includes("senior")) return 3
  if (normalized.includes("staff") || normalized.includes("principal")) return 4
  if (normalized.includes("lead") || normalized.includes("manager")) return 5
  if (normalized.includes("director") || normalized.includes("vp") || normalized.includes("cxo")) return 6
  return 3
}

function computeSkillCoverage(required: string[], available: string[]): number {
  if (required.length === 0) {
    return 72
  }

  const normalizedAvailable = new Set(available.map((item) => item.toLowerCase()))
  const matches = required.filter((item) => normalizedAvailable.has(item.toLowerCase())).length
  return Math.round((matches / required.length) * 100)
}

function computeSeniorityFit(positionSeniority: string | undefined, profileSeniority: string): number {
  if (!positionSeniority) {
    return 78
  }
  const target = seniorityToRank(positionSeniority)
  const actual = seniorityToRank(profileSeniority)
  const diff = Math.abs(target - actual)
  if (diff === 0) return 100
  if (diff === 1) return 85
  if (diff === 2) return 65
  return 45
}

function computeConnectionsScore(connections: number): number {
  if (connections <= 0) return 40
  if (connections >= 4000) return 100
  return Math.round((connections / 4000) * 100)
}

function clampToScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function computeProjectFitSignals(
  position: ProjectPositionView,
  profile: {
    skills: string[]
    seniority: string
    matchScore: number
    connections: number
  },
): {
  skillCoverage: number
  seniorityFit: number
  matchScore: number
  networkScore: number
  relationshipScore: number
  aiScore: number
} {
  const skillCoverage = computeSkillCoverage(position.requiredSkills, profile.skills)
  const seniorityFit = computeSeniorityFit(position.seniority, profile.seniority)
  const matchScore = clampToScore(profile.matchScore)
  const networkScore = computeConnectionsScore(profile.connections)
  const relationshipScore = clampToScore(matchScore * 0.65 + networkScore * 0.35)
  const aiScore = clampToScore(
    skillCoverage * 0.5 +
      matchScore * 0.2 +
      seniorityFit * 0.2 +
      networkScore * 0.1,
  )

  return {
    skillCoverage,
    seniorityFit,
    matchScore,
    networkScore,
    relationshipScore,
    aiScore,
  }
}

function buildProjectRecommendationReasons(
  position: ProjectPositionView,
  profile: SupabaseProfileView,
  signals: {
    skillCoverage: number
    seniorityFit: number
    matchScore: number
  },
): string[] {
  const reasons: string[] = []

  if (signals.skillCoverage >= 85) {
    reasons.push("Strong required-skill coverage")
  } else if (signals.skillCoverage >= 60) {
    reasons.push("Good required-skill overlap")
  }

  if (signals.seniorityFit >= 85) {
    reasons.push("Seniority aligns with role")
  }

  if (signals.matchScore >= 80) {
    reasons.push("High CRM match score")
  }

  if (profile.connections >= 700) {
    reasons.push(`Large network reach (${profile.connections.toLocaleString()})`)
  }

  if (profile.tribe?.trim()) {
    reasons.push(`Mapped in tribe ${profile.tribe.trim()}`)
  }

  if (position.location && profile.location && position.location.toLowerCase() === profile.location.toLowerCase()) {
    reasons.push("Location aligned with role")
  }

  if (reasons.length === 0) {
    reasons.push("Potential growth candidate for this role")
  }

  return reasons.slice(0, 4)
}

function computeTopSkillGaps(
  requiredSkills: string[],
  candidates: ProjectCrmCandidateRecommendationView[],
): string[] {
  if (requiredSkills.length === 0) {
    return []
  }

  if (candidates.length === 0) {
    return requiredSkills.slice(0, 3)
  }

  const candidateSkillSets = candidates.map((candidate) =>
    new Set(candidate.skills.map((skill) => skill.toLowerCase())),
  )

  return requiredSkills
    .map((requiredSkill) => {
      const normalizedRequiredSkill = requiredSkill.toLowerCase()
      const matchCount = candidateSkillSets.filter((skills) => skills.has(normalizedRequiredSkill)).length
      const coverage = matchCount / candidates.length
      return { requiredSkill, coverage }
    })
    .filter((item) => item.coverage < 0.4)
    .sort((a, b) => a.coverage - b.coverage)
    .slice(0, 3)
    .map((item) => item.requiredSkill)
}

function buildAiRanking(
  position: ProjectPositionView,
  application: SupabaseRow,
  profile: SupabaseProfileView | null,
): RankedProjectApplicationView {
  const applicantName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : asString(application.applicant_name, "Unknown applicant")
  const applicantHeadline = profile?.headline || asString(application.applicant_headline, "CRM profile pending")
  const applicantSkills = profile?.skills || asStringArray(application.applicant_skills)
  const applicantSeniority = profile?.seniority || asString(application.applicant_seniority, "Senior")
  const applicantMatchScore = profile?.matchScore || asNumber(application.applicant_match_score, 65)
  const applicantConnections = profile?.connections || asNumber(application.applicant_connections, 0)

  const fitSignals = computeProjectFitSignals(position, {
    skills: applicantSkills,
    seniority: applicantSeniority,
    matchScore: applicantMatchScore,
    connections: applicantConnections,
  })

  const aiSummary = `skills ${fitSignals.skillCoverage}% | seniority ${fitSignals.seniorityFit}% | CRM match ${fitSignals.matchScore}% | network ${fitSignals.networkScore}%`

  return {
    id: asString(application.id),
    projectId: asString(application.project_id),
    positionId: asString(application.position_id),
    applicantUserId: asString(application.applicant_user_id),
    applicantProfileId: profile?.id || asString(application.applicant_profile_id) || undefined,
    applicantName,
    applicantHeadline,
    applicantSkills,
    matchScore: fitSignals.matchScore,
    connections: applicantConnections,
    aiScore: asNumber(application.ai_score, fitSignals.aiScore),
    aiSummary: asString(application.ai_summary, aiSummary),
    status: asString(application.status, "submitted"),
    createdAt: asString(application.created_at, "") || undefined,
  }
}

function mapPositionRow(row: SupabaseRow): ProjectPositionView {
  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    title: asString(row.title, "Position"),
    description: asString(row.description, ""),
    requiredSkills: asStringArray(row.required_skills),
    seniority: asString(row.seniority, "") || undefined,
    location: asString(row.location, "") || undefined,
    openings: Math.max(1, asNumber(row.openings, 1)),
    status: normalizePositionStatus(asString(row.status, "open")),
    createdAt: asString(row.created_at, "") || undefined,
  }
}

function mapProjectRow(row: SupabaseRow, index: number): SupabaseProjectView {
  const milestones = asObjectArray<unknown>(row.milestones).map(mapMilestone)
  const priority = asString(row.priority, "")
  const normalizedPriority =
    priority === "low" || priority === "medium" || priority === "high" || priority === "critical"
      ? priority
      : undefined

  return {
    id: asString(row.id, `project-${index + 1}`),
    name: asString(row.name, `Project ${index + 1}`),
    description: asString(row.description, "Supabase project"),
    type: normalizeProjectType(asString(row.type, "team-building")),
    status: normalizeProjectStatus(asString(row.status, "active")),
    progress: asNumber(row.progress, 0),
    profiles: asNumber(row.profiles ?? row.profile_count, 0),
    tribe: asString(row.tribe, "") || undefined,
    targetDate: asString(row.target_date ?? row.targetDate, "") || undefined,
    tags: asStringArray(row.tags),
    milestones,
    nextAction: asString(row.next_action ?? row.nextAction, "Review status"),
    aspirations: asStringArray(row.aspirations),
    blockers: asStringArray(row.blockers),
    priority: normalizedPriority,
    owner: asString(row.owner, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }
}

function mapActivityRow(row: SupabaseRow): DashboardActivityView {
  return {
    action: asString(row.action || row.message, "Supabase event"),
    time: relativeTime(row.created_at || row.createdAt || row.timestamp),
    type: asString(row.type, "event"),
  }
}

function mapFundraisingCampaignRow(row: SupabaseRow, index: number): FundraisingCampaignView {
  const status = asString(row.status, "draft") as FundraisingCampaignStatus
  const validStatus: FundraisingCampaignStatus[] = ["draft", "active", "paused", "completed", "archived"]
  return {
    id: asString(row.id, `campaign-${index + 1}`),
    name: asString(row.name, `Campaign ${index + 1}`),
    description: asString(row.description, ""),
    goalAmount: asNumber(row.goal_amount ?? row.goalAmount, 0),
    currency: asString(row.currency, "USD"),
    status: validStatus.includes(status) ? status : "draft",
    startDate: asString(row.start_date ?? row.startDate, "") || undefined,
    endDate: asString(row.end_date ?? row.endDate, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }
}

function mapFundraisingDonorRow(row: SupabaseRow, index: number): FundraisingDonorView {
  return {
    id: asString(row.id, `donor-${index + 1}`),
    campaignId: asString(row.campaign_id ?? row.campaignId, "") || undefined,
    name: asString(row.name, `Donor ${index + 1}`),
    email: asString(row.email, "") || undefined,
    company: asString(row.company, "") || undefined,
    notes: asString(row.notes, "") || undefined,
    totalDonated: asNumber(row.total_donated ?? row.totalDonated, 0),
    donationCount: asNumber(row.donation_count ?? row.donationCount, 0),
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }
}

function mapFundraisingDonationRow(row: SupabaseRow, index: number): FundraisingDonationView {
  const status = asString(row.status, "pledged") as FundraisingDonationStatus
  const validStatus: FundraisingDonationStatus[] = ["pledged", "received", "recurring", "refunded", "cancelled"]
  return {
    id: asString(row.id, `donation-${index + 1}`),
    campaignId: asString(row.campaign_id ?? row.campaignId, ""),
    donorId: asString(row.donor_id ?? row.donorId, "") || undefined,
    donorName: asString((row as Record<string, unknown>).donor_name, "") || undefined,
    amount: asNumber(row.amount, 0),
    currency: asString(row.currency, "USD"),
    status: validStatus.includes(status) ? status : "pledged",
    donatedAt: asString(row.donated_at ?? row.donatedAt, new Date().toISOString()),
    note: asString(row.note, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }
}

function mapFundraisingGoalRow(row: SupabaseRow, index: number): FundraisingGoalView {
  const status = asString(row.status, "active") as FundraisingGoalStatus
  const validStatus: FundraisingGoalStatus[] = ["active", "met", "missed", "cancelled"]
  return {
    id: asString(row.id, `goal-${index + 1}`),
    campaignId: asString(row.campaign_id ?? row.campaignId, ""),
    title: asString(row.title, `Goal ${index + 1}`),
    description: asString(row.description, "") || undefined,
    targetAmount: asNumber(row.target_amount ?? row.targetAmount, 0),
    currentAmount: asNumber(row.current_amount ?? row.currentAmount, 0),
    currency: asString(row.currency, "USD"),
    dueDate: asString(row.due_date ?? row.dueDate, "") || undefined,
    status: validStatus.includes(status) ? status : "active",
    sortOrder: asNumber(row.sort_order ?? row.sortOrder, 0),
    createdAt: asString(row.created_at ?? row.createdAt, "") || undefined,
    updatedAt: asString(row.updated_at ?? row.updatedAt, "") || undefined,
  }
}

export function getSupabaseTableNames() {
  return { ...TABLES }
}

export async function fetchSupabaseProfiles(): Promise<SupabaseProfileView[] | null> {
  const rows = await fetchRows(TABLES.profiles, 400)
  if (!rows) {
    return null
  }
  return rows.map(mapProfileRow)
}

export async function fetchSupabaseTribes(): Promise<Tribe[] | null> {
  const rows = await fetchRows(TABLES.tribes, 120)
  if (!rows) {
    return null
  }
  return rows.map(mapTribeRow)
}

export async function fetchSupabaseProjects(): Promise<SupabaseProjectView[] | null> {
  const rows = await fetchRows(TABLES.projects, 200)
  if (!rows) {
    return null
  }
  return rows.map(mapProjectRow)
}

export async function fetchSupabaseProjectPositions(
  projectId: string,
  supabaseOverride?: SupabaseClient,
): Promise<ProjectPositionView[] | null> {
  const supabase = supabaseOverride || getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from(TABLES.projectPositions)
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })

  if (error) {
    console.warn(`[supabase] read failed for table "${TABLES.projectPositions}": ${error.message}`)
    return null
  }

  return (data || []).map((row) => mapPositionRow(row as SupabaseRow))
}

export async function fetchSupabaseProjectHiringSnapshot(
  projectId: string,
  supabaseOverride?: SupabaseClient,
): Promise<ProjectHiringSnapshot | null> {
  const supabase = supabaseOverride || getSupabaseClient()
  if (!supabase) {
    return null
  }

  const positions = await fetchSupabaseProjectPositions(projectId, supabase)
  if (!positions) {
    return null
  }

  const { data: applicationsData, error: applicationsError } = await supabase
    .from(TABLES.projectApplications)
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })

  if (applicationsError) {
    console.warn(`[supabase] read failed for table "${TABLES.projectApplications}": ${applicationsError.message}`)
    return {
      positions,
      rankedApplicationsByPosition: {},
    }
  }

  const applications = (applicationsData || []) as SupabaseRow[]
  const profileIds = Array.from(
    new Set(applications.map((item) => asString(item.applicant_profile_id)).filter(Boolean)),
  )

  let profilesById = new Map<string, SupabaseProfileView>()
  if (profileIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from(TABLES.profiles)
      .select("*")
      .in("id", profileIds)

    if (!profilesError && profilesData) {
      profilesById = new Map(
        profilesData.map((row, index) => {
          const profile = mapProfileRow(row as SupabaseRow, index)
          return [profile.id, profile]
        }),
      )
    }
  }

  const positionMap = new Map(positions.map((position) => [position.id, position]))
  const rankedApplicationsByPosition: Record<string, RankedProjectApplicationView[]> = {}

  for (const application of applications) {
    const positionId = asString(application.position_id)
    const position = positionMap.get(positionId)
    if (!position) {
      continue
    }

    const profileId = asString(application.applicant_profile_id)
    const profile = profileId ? profilesById.get(profileId) || null : null
    const ranked = buildAiRanking(position, application, profile)

    if (!rankedApplicationsByPosition[position.id]) {
      rankedApplicationsByPosition[position.id] = []
    }

    rankedApplicationsByPosition[position.id].push(ranked)
  }

  for (const positionId of Object.keys(rankedApplicationsByPosition)) {
    rankedApplicationsByPosition[positionId] = rankedApplicationsByPosition[positionId]
      .sort((a, b) => b.aiScore - a.aiScore)
      .map((item, index) => ({
        ...item,
        aiSummary: `${item.aiSummary} | rank #${index + 1}`,
      }))
  }

  return {
    positions,
    rankedApplicationsByPosition,
  }
}

async function fetchSupabaseProfilesWithClient(
  supabase: SupabaseClient,
  limit = 600,
): Promise<SupabaseProfileView[] | null> {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.warn(`[supabase] read failed for table "${TABLES.profiles}": ${error.message}`)
    return null
  }

  return (data || []).map((row, index) => mapProfileRow(row as SupabaseRow, index))
}

export async function fetchSupabaseProjectCrmRecommendations(
  projectId: string,
  limitPerPosition = 5,
  supabaseOverride?: SupabaseClient,
): Promise<ProjectCrmRecommendationSnapshot | null> {
  const supabase = supabaseOverride || getSupabaseClient()
  if (!supabase) {
    return null
  }

  const sanitizedLimit = Math.max(1, Math.min(limitPerPosition, 12))
  const [positions, profiles, applicationsResult] = await Promise.all([
    fetchSupabaseProjectPositions(projectId, supabase),
    fetchSupabaseProfilesWithClient(supabase),
    supabase
      .from(TABLES.projectApplications)
      .select("position_id,applicant_profile_id")
      .eq("project_id", projectId),
  ])

  if (!positions || !profiles) {
    return null
  }

  if (applicationsResult.error) {
    console.warn(
      `[supabase] read failed for table "${TABLES.projectApplications}": ${applicationsResult.error.message}`,
    )
  }

  const applications = (applicationsResult.data || []) as SupabaseRow[]
  const appliedByPosition = new Map<string, Set<string>>()
  for (const application of applications) {
    const positionId = asString(application.position_id)
    const profileId = asString(application.applicant_profile_id)
    if (!positionId || !profileId) {
      continue
    }
    const existing = appliedByPosition.get(positionId)
    if (existing) {
      existing.add(profileId)
    } else {
      appliedByPosition.set(positionId, new Set([profileId]))
    }
  }

  const positionsToRecommend = positions.filter((position) => position.status !== "closed")
  const recommendationBuckets: ProjectCrmPositionRecommendationView[] = positionsToRecommend.map((position) => {
    const appliedProfileIds = appliedByPosition.get(position.id) || new Set<string>()

    const scoredCandidates = profiles
      .map((profile) => {
        const fitSignals = computeProjectFitSignals(position, {
          skills: profile.skills,
          seniority: profile.seniority,
          matchScore: profile.matchScore,
          connections: profile.connections,
        })

        return {
          profile,
          fitSignals,
          alreadyApplied: appliedProfileIds.has(profile.id),
        }
      })
      .sort((a, b) => {
        if (b.fitSignals.aiScore !== a.fitSignals.aiScore) {
          return b.fitSignals.aiScore - a.fitSignals.aiScore
        }
        if (b.fitSignals.skillCoverage !== a.fitSignals.skillCoverage) {
          return b.fitSignals.skillCoverage - a.fitSignals.skillCoverage
        }
        return b.fitSignals.matchScore - a.fitSignals.matchScore
      })

    const shortlisted = scoredCandidates
      .filter((candidate) => !candidate.alreadyApplied)
      .slice(0, sanitizedLimit)
      .map((candidate) => {
        const fullName = `${candidate.profile.firstName} ${candidate.profile.lastName}`.trim()
        const reasons = buildProjectRecommendationReasons(position, candidate.profile, candidate.fitSignals)

        return {
          profileId: candidate.profile.id,
          firstName: candidate.profile.firstName,
          lastName: candidate.profile.lastName,
          fullName: fullName || "Unknown profile",
          headline: candidate.profile.headline,
          company: candidate.profile.company,
          location: candidate.profile.location,
          seniority: candidate.profile.seniority,
          skills: candidate.profile.skills,
          tribe: candidate.profile.tribe,
          linkedinUrl: candidate.profile.linkedinUrl,
          matchScore: candidate.fitSignals.matchScore,
          connections: candidate.profile.connections,
          skillCoverage: candidate.fitSignals.skillCoverage,
          seniorityFit: candidate.fitSignals.seniorityFit,
          relationshipScore: candidate.fitSignals.relationshipScore,
          networkScore: candidate.fitSignals.networkScore,
          aiFitScore: candidate.fitSignals.aiScore,
          alreadyApplied: false,
          reasons,
        } as ProjectCrmCandidateRecommendationView
      })

    const averageAiFitScore =
      shortlisted.length > 0
        ? Math.round(
            shortlisted.reduce((total, candidate) => total + candidate.aiFitScore, 0) / shortlisted.length,
          )
        : 0

    return {
      position,
      candidateCount: shortlisted.length,
      alreadyAppliedCount: appliedProfileIds.size,
      averageAiFitScore,
      topSkillGaps: computeTopSkillGaps(position.requiredSkills, shortlisted),
      candidates: shortlisted,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    profilePoolSize: profiles.length,
    positions: recommendationBuckets,
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

async function resolveOrCreateCorrelatedProfile(
  client: ReturnType<typeof createUserScopedClient>,
  userId: string,
  email: string | null,
): Promise<string | null> {
  if (!client) {
    return null
  }

  const { data: existingByAuthUser } = await client
    .from(TABLES.profiles)
    .select("id")
    .eq("auth_user_id", userId)
    .limit(1)
    .maybeSingle()

  if (existingByAuthUser?.id) {
    return asString(existingByAuthUser.id)
  }

  const { data: existingByOwner } = await client
    .from(TABLES.profiles)
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle()

  if (existingByOwner?.id) {
    return asString(existingByOwner.id)
  }

  const newProfileId = `crm-${userId.slice(0, 8)}-${Math.floor(Date.now() / 1000)}`
  const profileName = email ? email.split("@")[0] : "New User"
  const [firstName, ...rest] = profileName.replace(/[._-]/g, " ").split(" ")
  const lastName = rest.join(" ")

  const { data: inserted, error } = await client
    .from(TABLES.profiles)
    .insert({
      id: newProfileId,
      owner_user_id: userId,
      auth_user_id: userId,
      name: profileName,
      first_name: firstName || profileName,
      last_name: lastName || "",
      headline: "CRM applicant profile",
      company: "Independent",
      location: "Unknown",
      industry: "General",
      skills: [],
      connections: 0,
      match_score: 60,
      seniority: "Mid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error || !inserted?.id) {
    console.warn(`[supabase] failed to create correlated profile: ${error?.message || "unknown error"}`)
    return null
  }

  return asString(inserted.id)
}

async function persistRankingForProject(
  client: ReturnType<typeof createUserScopedClient>,
  projectId: string,
): Promise<void> {
  if (!client) {
    return
  }

  const snapshot = await fetchSupabaseProjectHiringSnapshot(projectId, client)
  if (!snapshot) {
    return
  }

  for (const position of snapshot.positions) {
    const ranked = snapshot.rankedApplicationsByPosition[position.id] || []
    for (const application of ranked) {
      const { error } = await client
        .from(TABLES.projectApplications)
        .update({
          ai_score: application.aiScore,
          ai_summary: application.aiSummary,
          ranked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id)

      if (error) {
        console.warn(`[supabase] failed to persist application ranking: ${error.message}`)
      }
    }
  }
}

export async function submitProjectApplication(input: {
  accessToken: string
  projectId: string
  positionId: string
  coverNote?: string
}): Promise<{ ok: boolean; error?: string; alreadyApplied?: boolean }> {
  const client = createUserScopedClient(input.accessToken)
  if (!client) {
    return { ok: false, error: "Supabase authentication is unavailable." }
  }

  const { data: authUser, error: authError } = await client.auth.getUser(input.accessToken)
  if (authError || !authUser.user) {
    return { ok: false, error: "Invalid Supabase session. Please sign in again." }
  }

  const { data: position, error: positionError } = await client
    .from(TABLES.projectPositions)
    .select("id,project_id,status")
    .eq("id", input.positionId)
    .eq("project_id", input.projectId)
    .maybeSingle()

  if (positionError || !position) {
    return { ok: false, error: "Position not found." }
  }

  if (asString((position as SupabaseRow).status, "open") !== "open") {
    return { ok: false, error: "Position is no longer open." }
  }

  const { data: existing } = await client
    .from(TABLES.projectApplications)
    .select("id")
    .eq("position_id", input.positionId)
    .eq("applicant_user_id", authUser.user.id)
    .maybeSingle()

  if (existing?.id) {
    return { ok: true, alreadyApplied: true }
  }

  const profileId = await resolveOrCreateCorrelatedProfile(client, authUser.user.id, authUser.user.email ?? null)
  if (!profileId) {
    return { ok: false, error: "Unable to correlate this user with a CRM profile." }
  }

  const { error: insertError } = await client.from(TABLES.projectApplications).insert({
    project_id: input.projectId,
    position_id: input.positionId,
    applicant_user_id: authUser.user.id,
    applicant_profile_id: profileId,
    cover_note: input.coverNote || null,
    status: "submitted",
    ai_score: 0,
    ai_summary: "Pending AI ranking",
    ranked_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (insertError) {
    return { ok: false, error: "Could not submit application." }
  }

  await persistRankingForProject(client, input.projectId)
  return { ok: true }
}

export async function fetchSupabaseDashboardSnapshot(): Promise<DashboardSnapshot | null> {
  const [profiles, tribes, projects, activityRows] = await Promise.all([
    fetchSupabaseProfiles(),
    fetchSupabaseTribes(),
    fetchSupabaseProjects(),
    fetchRows(TABLES.activity, DASHBOARD_ACTIVITY_LIMIT),
  ])

  if (!profiles && !tribes && !projects && !activityRows) {
    return null
  }

  const mappedActivities = (activityRows || []).map(mapActivityRow)
  const profileCount = profiles?.length || 0
  const tribeCount = tribes?.length || 0
  const projectCount = projects?.length || 0
  const networkReach = (profiles || []).reduce((total, item) => total + item.connections, 0)
  const projectCards = (projects || []).slice(0, 4).map((project) => ({
    name: project.name,
    progress: project.progress,
    status: project.status,
    type: project.type,
  }))

  const synthesizedActivities =
    mappedActivities.length > 0
      ? mappedActivities
      : [
          { action: `${profileCount} profiles loaded from Supabase`, time: "just now", type: "profiles" },
          { action: `${tribeCount} tribes available`, time: "just now", type: "tribe" },
          { action: `${projectCount} projects synced`, time: "just now", type: "project" },
        ]

  return {
    profileCount,
    tribeCount,
    projectCount,
    networkReach,
    projects: projectCards,
    activities: synthesizedActivities,
  }
}

export function subscribeToSupabaseTable(table: string, onChange: () => void, debounceMs = 300): (() => void) | null {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const debouncedOnChange = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, debounceMs)
  }

  const channelName = `table-updates-${table}-${Math.random().toString(36).slice(2, 8)}`
  const channel = supabase
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public", table }, () => debouncedOnChange())
    .subscribe()

  return () => {
    if (timer) clearTimeout(timer)
    void supabase.removeChannel(channel)
  }
}

export function subscribeToProfiles(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.profiles, onChange)
}

export function subscribeToTribes(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.tribes, onChange)
}

export function subscribeToProjects(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.projects, onChange)
}

export function subscribeToProjectPositions(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.projectPositions, onChange)
}

export function subscribeToProjectApplications(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.projectApplications, onChange)
}

export function subscribeToActivity(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.activity, onChange)
}

export async function fetchFundraisingSnapshot(): Promise<FundraisingSnapshot | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  const [campaignsRes, donorsRes, donationsRes, goalsRes] = await Promise.all([
    supabase.from(TABLES.fundraisingCampaigns).select("*").order("updated_at", { ascending: false }).limit(200),
    supabase.from(TABLES.fundraisingDonors).select("*").order("updated_at", { ascending: false }).limit(500),
    supabase.from(TABLES.fundraisingDonations).select("*").order("donated_at", { ascending: false }).limit(500),
    supabase.from(TABLES.fundraisingGoals).select("*").order("sort_order", { ascending: true }).order("id").limit(200),
  ])

  const campaigns = (campaignsRes.data || []).map((r, i) => mapFundraisingCampaignRow(r as SupabaseRow, i))
  const donors = (donorsRes.data || []).map((r, i) => mapFundraisingDonorRow(r as SupabaseRow, i))
  const donations = (donationsRes.data || []).map((r, i) => mapFundraisingDonationRow(r as SupabaseRow, i))
  const goals = (goalsRes.data || []).map((r, i) => mapFundraisingGoalRow(r as SupabaseRow, i))

  const campaignIds = new Set(campaigns.map((c) => c.id))
  const donationsByCampaign = new Map<string, { total: number; count: number }>()
  for (const d of donations) {
    if (!campaignIds.has(d.campaignId)) continue
    const cur = donationsByCampaign.get(d.campaignId) ?? { total: 0, count: 0 }
    if (d.status !== "refunded" && d.status !== "cancelled") {
      cur.total += d.amount
      cur.count += 1
    }
    donationsByCampaign.set(d.campaignId, cur)
  }
  const campaignsWithTotals = campaigns.map((c) => ({
    ...c,
    totalRaised: donationsByCampaign.get(c.id)?.total ?? 0,
    donorCount: donors.filter((dr) => dr.campaignId === c.id).length || (donationsByCampaign.get(c.id)?.count ?? 0),
  }))

  return {
    campaigns: campaignsWithTotals,
    donors,
    donations,
    goals,
  }
}

export function subscribeToFundraisingCampaigns(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.fundraisingCampaigns, onChange)
}

export function subscribeToFundraisingDonors(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.fundraisingDonors, onChange)
}

export function subscribeToFundraisingDonations(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.fundraisingDonations, onChange)
}

export function subscribeToFundraisingGoals(onChange: () => void): (() => void) | null {
  return subscribeToSupabaseTable(TABLES.fundraisingGoals, onChange)
}

export async function upsertFundraisingCampaign(input: {
  id?: string
  name: string
  description?: string
  goalAmount: number
  currency?: string
  status?: FundraisingCampaignStatus
  startDate?: string
  endDate?: string
}): Promise<FundraisingCampaignView | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  let ownerUserId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    ownerUserId = data?.user?.id ?? null
  } catch {
    return null
  }
  if (!ownerUserId) return null

  const payload = {
    owner_user_id: ownerUserId,
    name: input.name,
    description: input.description ?? null,
    goal_amount: input.goalAmount,
    currency: input.currency ?? "USD",
    status: input.status ?? "draft",
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await supabase
      .from(TABLES.fundraisingCampaigns)
      .update(payload)
      .eq("id", input.id)
      .eq("owner_user_id", ownerUserId)
      .select()
      .single()
    if (error) {
      console.warn("[supabase] update fundraising campaign failed:", error.message)
      return null
    }
    return data ? mapFundraisingCampaignRow(data as SupabaseRow, 0) : null
  }

  const { data, error } = await supabase.from(TABLES.fundraisingCampaigns).insert(payload).select().single()
  if (error) {
    console.warn("[supabase] insert fundraising campaign failed:", error.message)
    return null
  }
  return data ? mapFundraisingCampaignRow(data as SupabaseRow, 0) : null
}

export async function upsertFundraisingDonor(input: {
  id?: string
  campaignId?: string
  name: string
  email?: string
  company?: string
  notes?: string
}): Promise<FundraisingDonorView | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  let ownerUserId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    ownerUserId = data?.user?.id ?? null
  } catch {
    return null
  }
  if (!ownerUserId) return null

  const payload = {
    owner_user_id: ownerUserId,
    campaign_id: input.campaignId ?? null,
    name: input.name,
    email: input.email ?? null,
    company: input.company ?? null,
    notes: input.notes ?? null,
    total_donated: 0,
    donation_count: 0,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data: existing } = await supabase
      .from(TABLES.fundraisingDonors)
      .select("total_donated, donation_count")
      .eq("id", input.id)
      .single()
    if (existing) {
      const row = existing as SupabaseRow
      payload.total_donated = asNumber(row.total_donated ?? row.totalDonated, 0)
      payload.donation_count = asNumber(row.donation_count ?? row.donationCount, 0)
    }
    const { data, error } = await supabase
      .from(TABLES.fundraisingDonors)
      .update(payload)
      .eq("id", input.id)
      .eq("owner_user_id", ownerUserId)
      .select()
      .single()
    if (error) {
      console.warn("[supabase] update fundraising donor failed:", error.message)
      return null
    }
    return data ? mapFundraisingDonorRow(data as SupabaseRow, 0) : null
  }

  const { data, error } = await supabase.from(TABLES.fundraisingDonors).insert(payload).select().single()
  if (error) {
    console.warn("[supabase] insert fundraising donor failed:", error.message)
    return null
  }
  return data ? mapFundraisingDonorRow(data as SupabaseRow, 0) : null
}

export async function upsertFundraisingDonation(input: {
  campaignId: string
  donorId?: string
  amount: number
  currency?: string
  status?: FundraisingDonationStatus
  donatedAt?: string
  note?: string
}): Promise<FundraisingDonationView | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  let ownerUserId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    ownerUserId = data?.user?.id ?? null
  } catch {
    return null
  }
  if (!ownerUserId) return null

  const payload = {
    owner_user_id: ownerUserId,
    campaign_id: input.campaignId,
    donor_id: input.donorId ?? null,
    amount: input.amount,
    currency: input.currency ?? "USD",
    status: input.status ?? "pledged",
    donated_at: input.donatedAt ?? new Date().toISOString(),
    note: input.note ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase.from(TABLES.fundraisingDonations).insert(payload).select().single()
  if (error) {
    console.warn("[supabase] insert fundraising donation failed:", error.message)
    return null
  }
  if (data && input.donorId) {
    const donorRows = await supabase
      .from(TABLES.fundraisingDonors)
      .select("total_donated, donation_count")
      .eq("id", input.donorId)
      .single()
    const donor = donorRows.data as SupabaseRow | null
    if (donor) {
      const total = asNumber(donor.total_donated ?? donor.totalDonated, 0) + input.amount
      const count = asNumber(donor.donation_count ?? donor.donationCount, 0) + 1
      await supabase
        .from(TABLES.fundraisingDonors)
        .update({ total_donated: total, donation_count: count, updated_at: new Date().toISOString() })
        .eq("id", input.donorId)
    }
  }
  return data ? mapFundraisingDonationRow(data as SupabaseRow, 0) : null
}

export async function upsertFundraisingGoal(input: {
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
  const supabase = getSupabaseClient()
  if (!supabase) return null
  let ownerUserId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    ownerUserId = data?.user?.id ?? null
  } catch {
    return null
  }
  if (!ownerUserId) return null

  const payload = {
    owner_user_id: ownerUserId,
    campaign_id: input.campaignId,
    title: input.title,
    description: input.description ?? null,
    target_amount: input.targetAmount,
    current_amount: input.currentAmount ?? 0,
    currency: input.currency ?? "USD",
    due_date: input.dueDate ?? null,
    status: input.status ?? "active",
    sort_order: input.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await supabase
      .from(TABLES.fundraisingGoals)
      .update(payload)
      .eq("id", input.id)
      .eq("owner_user_id", ownerUserId)
      .select()
      .single()
    if (error) {
      console.warn("[supabase] update fundraising goal failed:", error.message)
      return null
    }
    return data ? mapFundraisingGoalRow(data as SupabaseRow, 0) : null
  }

  const { data, error } = await supabase.from(TABLES.fundraisingGoals).insert(payload).select().single()
  if (error) {
    console.warn("[supabase] insert fundraising goal failed:", error.message)
    return null
  }
  return data ? mapFundraisingGoalRow(data as SupabaseRow, 0) : null
}

export async function saveCsvUploadTelemetry(input: CsvUploadTelemetryInput): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return
  }

  let ownerUserId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    ownerUserId = data?.user?.id || null
  } catch {
    ownerUserId = null
  }

  const payload = {
    owner_user_id: ownerUserId,
    file_name: input.fileName,
    row_count: input.rowCount,
    preview: input.preview,
    uploaded_at: new Date().toISOString(),
  }

  const { error } = await supabase.from(TABLES.csvUploads).insert(payload)
  if (error) {
    console.warn(`[supabase] CSV telemetry write failed: ${error.message}`)
  }
}

export async function importProfilesToSupabase(input: {
  accessToken: string
  profiles: ParsedProfile[]
}): Promise<{
  saved: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
  counts: { inserted: number; updated: number }
}> {
  const response = await fetch("/api/profiles/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      profiles: input.profiles.map((profile) => ({
        sessionId: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName || undefined,
        headline: profile.headline,
        company: profile.company || undefined,
        location: profile.location || undefined,
        industry: profile.industry || undefined,
        connections: Number.isFinite(profile.connections) ? profile.connections : 0,
        skills: profile.skills,
        matchScore: Number.isFinite(profile.matchScore) ? profile.matchScore : undefined,
        seniority: profile.seniority || undefined,
        tribe: profile.tribe || undefined,
        linkedinUrl: profile.linkedinUrl || undefined,
      })),
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean
        error?: string
        message?: string
        saved?: Array<{ sessionId: string; profileId: string; action: "inserted" | "updated" }>
        counts?: { inserted: number; updated: number }
      }
    | null

  if (!response.ok || !payload?.ok || !payload.saved || !payload.counts) {
    throw new Error(payload?.message || payload?.error || "Unable to import profiles into Supabase.")
  }

  return {
    saved: payload.saved,
    counts: payload.counts,
  }
}

// ---------------------------------------------------------------------------
// Cursor-based pagination helpers
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  data: T[]
  nextCursor: string | null
  hasMore: boolean
}

export interface PaginationOptions {
  pageSize?: number
  cursor?: string | null
  orderBy?: string
}

const DEFAULT_PAGE_SIZE = 50

export async function fetchProfilesPaginated(
  opts: PaginationOptions = {},
): Promise<PaginatedResult<SupabaseProfileView>> {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], nextCursor: null, hasMore: false }

  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE
  const orderBy = opts.orderBy ?? "updated_at"

  let query = supabase
    .from(TABLES.profiles)
    .select("*")
    .order(orderBy, { ascending: false })
    .limit(pageSize + 1)

  if (opts.cursor) {
    query = query.lt(orderBy, opts.cursor)
  }

  const { data, error } = await query
  if (error || !data) return { data: [], nextCursor: null, hasMore: false }

  const hasMore = data.length > pageSize
  const page = hasMore ? data.slice(0, pageSize) : data
  const mapped = page.map((row, i) => mapProfileRow(row as SupabaseRow, i))
  const nextCursor = hasMore && page.length > 0
    ? String((page[page.length - 1] as SupabaseRow)[orderBy] ?? "")
    : null

  return { data: mapped, nextCursor, hasMore }
}

export async function fetchProjectsPaginated(
  opts: PaginationOptions = {},
): Promise<PaginatedResult<SupabaseProjectView>> {
  const supabase = getSupabaseClient()
  if (!supabase) return { data: [], nextCursor: null, hasMore: false }

  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE
  const orderBy = opts.orderBy ?? "updated_at"

  let query = supabase
    .from(TABLES.projects)
    .select("*")
    .order(orderBy, { ascending: false })
    .limit(pageSize + 1)

  if (opts.cursor) {
    query = query.lt(orderBy, opts.cursor)
  }

  const { data, error } = await query
  if (error || !data) return { data: [], nextCursor: null, hasMore: false }

  const hasMore = data.length > pageSize
  const page = hasMore ? data.slice(0, pageSize) : data
  const mapped = page.map((row, i) => mapProjectRow(row as SupabaseRow, i))
  const nextCursor = hasMore && page.length > 0
    ? String((page[page.length - 1] as SupabaseRow)[orderBy] ?? "")
    : null

  return { data: mapped, nextCursor, hasMore }
}
