import type { ParsedProfile } from "@/lib/csv/csv-parser"
import type { Tribe, TribeMember, TribeKnowledgeEntry, TribeSignalPost, TribeSprint, AgentWorkflowState, UserDiscoveryProfile } from "@/lib/shared/types"
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
  agentWorkflows: "agent_workflow_states",
  userDiscovery: "user_discovery_profiles",
  tribeKnowledgeBase: "tribe_knowledge_base",
  tribeSignalFeed: "tribe_signal_feed",
  tribeSprints: "tribe_sprints",
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

// ---------------------------------------------------------------------------
// Tribe Intelligence: Knowledge Base, Signal Feed, Sprints
// ---------------------------------------------------------------------------

function mapKnowledgeEntry(row: SupabaseRow): TribeKnowledgeEntry {
  return {
    id: String(row.id ?? ""),
    tribeId: String(row.tribe_id ?? ""),
    contributedBy: String(row.contributed_by ?? ""),
    contentType: (row.content_type as TribeKnowledgeEntry["contentType"]) ?? "insight",
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    toolChain: row.tool_chain as TribeKnowledgeEntry["toolChain"] ?? undefined,
    metrics: row.metrics as TribeKnowledgeEntry["metrics"] ?? undefined,
    upvotes: Number(row.upvotes ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

function mapSignalPost(row: SupabaseRow): TribeSignalPost {
  return {
    id: String(row.id ?? ""),
    tribeId: String(row.tribe_id ?? ""),
    authorId: String(row.author_id ?? ""),
    toolUsed: String(row.tool_used ?? ""),
    taskDescription: String(row.task_description ?? ""),
    promptChain: row.prompt_chain ? String(row.prompt_chain) : undefined,
    resultSummary: String(row.result_summary ?? ""),
    errorRate: row.error_rate != null ? Number(row.error_rate) : undefined,
    timeSavedMinutes: row.time_saved_minutes != null ? Number(row.time_saved_minutes) : undefined,
    validatedBy: Array.isArray(row.validated_by) ? row.validated_by.map(String) : [],
    createdAt: String(row.created_at ?? ""),
  }
}

function mapSprint(row: SupabaseRow): TribeSprint {
  return {
    id: String(row.id ?? ""),
    tribeId: String(row.tribe_id ?? ""),
    name: String(row.name ?? ""),
    objective: String(row.objective ?? ""),
    squadMemberIds: Array.isArray(row.squad_member_ids) ? row.squad_member_ids.map(String) : [],
    status: (row.status as TribeSprint["status"]) ?? "forming",
    durationHours: Number(row.duration_hours ?? 48),
    skillRequirements: Array.isArray(row.skill_requirements) ? row.skill_requirements.map(String) : [],
    outcomes: row.outcomes as Record<string, unknown> ?? undefined,
    startedAt: row.started_at ? String(row.started_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    createdAt: String(row.created_at ?? ""),
  }
}

export async function fetchTribeKnowledgeBase(tribeId: string): Promise<TribeKnowledgeEntry[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data } = await supabase
    .from(TABLES.tribeKnowledgeBase).select("*")
    .eq("tribe_id", tribeId).order("created_at", { ascending: false }).limit(200)
  return (data ?? []).map((r) => mapKnowledgeEntry(r as SupabaseRow))
}

export async function createKnowledgeEntry(entry: {
  tribeId: string; contributedBy: string; contentType: string; title: string; content: string
  tags?: string[]; toolChain?: unknown; metrics?: unknown
}): Promise<TribeKnowledgeEntry | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from(TABLES.tribeKnowledgeBase)
    .insert({ tribe_id: entry.tribeId, contributed_by: entry.contributedBy, content_type: entry.contentType, title: entry.title, content: entry.content, tags: entry.tags ?? [], tool_chain: entry.toolChain ?? null, metrics: entry.metrics ?? null })
    .select().single()
  if (error || !data) return null
  return mapKnowledgeEntry(data as SupabaseRow)
}

export async function fetchTribeSignalFeed(tribeId: string): Promise<TribeSignalPost[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data } = await supabase
    .from(TABLES.tribeSignalFeed).select("*")
    .eq("tribe_id", tribeId).order("created_at", { ascending: false }).limit(100)
  return (data ?? []).map((r) => mapSignalPost(r as SupabaseRow))
}

export async function createSignalPost(post: {
  tribeId: string; authorId: string; toolUsed: string; taskDescription: string
  resultSummary: string; promptChain?: string; errorRate?: number; timeSavedMinutes?: number
}): Promise<TribeSignalPost | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from(TABLES.tribeSignalFeed)
    .insert({ tribe_id: post.tribeId, author_id: post.authorId, tool_used: post.toolUsed, task_description: post.taskDescription, prompt_chain: post.promptChain ?? null, result_summary: post.resultSummary, error_rate: post.errorRate ?? null, time_saved_minutes: post.timeSavedMinutes ?? null })
    .select().single()
  if (error || !data) return null
  return mapSignalPost(data as SupabaseRow)
}

export async function fetchTribeSprints(tribeId: string): Promise<TribeSprint[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data } = await supabase
    .from(TABLES.tribeSprints).select("*")
    .eq("tribe_id", tribeId).order("created_at", { ascending: false }).limit(50)
  return (data ?? []).map((r) => mapSprint(r as SupabaseRow))
}

export async function createTribeSprintRecord(sprint: {
  tribeId: string; name: string; objective: string; squadMemberIds: string[]
  durationHours?: number; skillRequirements?: string[]
}): Promise<TribeSprint | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from(TABLES.tribeSprints)
    .insert({ tribe_id: sprint.tribeId, name: sprint.name, objective: sprint.objective, squad_member_ids: sprint.squadMemberIds, status: "forming", duration_hours: sprint.durationHours ?? 48, skill_requirements: sprint.skillRequirements ?? [] })
    .select().single()
  if (error || !data) return null
  return mapSprint(data as SupabaseRow)
}

// ---------------------------------------------------------------------------
// Agent Workflow States & User Discovery Profiles
// ---------------------------------------------------------------------------

function mapWorkflowState(row: SupabaseRow): AgentWorkflowState {
  return {
    id: String(row.id ?? ""),
    ownerUserId: String(row.owner_user_id ?? ""),
    workflowType: (row.workflow_type as AgentWorkflowState["workflowType"]) ?? "custom",
    workflowName: String(row.workflow_name ?? ""),
    status: (row.status as AgentWorkflowState["status"]) ?? "running",
    currentStep: String(row.current_step ?? ""),
    totalSteps: Number(row.total_steps ?? 1),
    completedSteps: Number(row.completed_steps ?? 0),
    aiAgentId: row.ai_agent_id ? String(row.ai_agent_id) : undefined,
    aiModelUsed: row.ai_model_used ? String(row.ai_model_used) : undefined,
    personaId: row.persona_id ? String(row.persona_id) : undefined,
    context: (row.context as Record<string, unknown>) ?? {},
    stepHistory: Array.isArray(row.step_history) ? row.step_history as AgentWorkflowState["stepHistory"] : [],
    pendingInput: row.pending_input as Record<string, unknown> ?? undefined,
    initiatedBy: (row.initiated_by as AgentWorkflowState["initiatedBy"]) ?? "user",
    validatedBy: row.validated_by ? String(row.validated_by) : undefined,
    validatedAt: row.validated_at ? String(row.validated_at) : undefined,
    validationNotes: row.validation_notes ? String(row.validation_notes) : undefined,
    startedAt: String(row.started_at ?? ""),
    pausedAt: row.paused_at ? String(row.paused_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    failedAt: row.failed_at ? String(row.failed_at) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    metadata: row.metadata as Record<string, unknown> ?? undefined,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

export async function fetchUserWorkflows(userId: string, opts?: { status?: string }): Promise<AgentWorkflowState[]> {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from(TABLES.agentWorkflows).select("*")
    .eq("owner_user_id", userId).order("created_at", { ascending: false }).limit(50)
  if (opts?.status) query = query.eq("status", opts.status)
  const { data } = await query
  return (data ?? []).map((r) => mapWorkflowState(r as SupabaseRow))
}

export async function createWorkflow(workflow: {
  ownerUserId: string; workflowType: string; workflowName: string; currentStep: string
  totalSteps?: number; aiAgentId?: string; aiModelUsed?: string; personaId?: string
  context?: Record<string, unknown>; initiatedBy?: string
}): Promise<AgentWorkflowState | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase.from(TABLES.agentWorkflows).insert({
    owner_user_id: workflow.ownerUserId,
    workflow_type: workflow.workflowType,
    workflow_name: workflow.workflowName,
    current_step: workflow.currentStep,
    total_steps: workflow.totalSteps ?? 1,
    ai_agent_id: workflow.aiAgentId ?? null,
    ai_model_used: workflow.aiModelUsed ?? null,
    persona_id: workflow.personaId ?? null,
    context: workflow.context ?? {},
    initiated_by: workflow.initiatedBy ?? "user",
  }).select().single()
  if (error || !data) return null
  return mapWorkflowState(data as SupabaseRow)
}

export async function updateWorkflowStep(workflowId: string, update: {
  currentStep: string; completedSteps: number; context?: Record<string, unknown>
  stepResult?: unknown; status?: string
}): Promise<AgentWorkflowState | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data: existing } = await supabase.from(TABLES.agentWorkflows)
    .select("step_history, context").eq("id", workflowId).single()
  const prevHistory = Array.isArray((existing as SupabaseRow)?.step_history) ? (existing as SupabaseRow).step_history as unknown[] : []
  const prevContext = (existing as SupabaseRow)?.context as Record<string, unknown> ?? {}
  const newHistory = [...prevHistory, { step: update.currentStep, result: update.stepResult ?? null, timestamp: new Date().toISOString() }]
  const mergedContext = { ...prevContext, ...update.context }

  const { data, error } = await supabase.from(TABLES.agentWorkflows).update({
    current_step: update.currentStep,
    completed_steps: update.completedSteps,
    step_history: newHistory,
    context: mergedContext,
    ...(update.status === "completed" ? { status: "completed", completed_at: new Date().toISOString() } : {}),
    ...(update.status === "failed" ? { status: "failed", failed_at: new Date().toISOString() } : {}),
    ...(update.status ? { status: update.status } : {}),
  }).eq("id", workflowId).select().single()
  if (error || !data) return null
  return mapWorkflowState(data as SupabaseRow)
}

function mapDiscoveryProfile(row: SupabaseRow): UserDiscoveryProfile {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    humanAlpha: (row.human_alpha as UserDiscoveryProfile["humanAlpha"]) ?? { uniqueStrengths: [], domainExpertise: [], decisionLayerSkills: [], craftOrientation: "" },
    suggestedWorkflows: Array.isArray(row.suggested_workflows) ? row.suggested_workflows as UserDiscoveryProfile["suggestedWorkflows"] : [],
    careerTrajectory: (row.career_trajectory as UserDiscoveryProfile["careerTrajectory"]) ?? { currentLayer: "execution", targetLayer: "", pivotRecommendations: [] },
    engagementProfile: (row.engagement_profile as UserDiscoveryProfile["engagementProfile"]) ?? { passionSignals: [], curiosityIndex: 0, domainFit: "" },
    firstWorkflowId: row.first_workflow_id ? String(row.first_workflow_id) : undefined,
    firstWorkflowName: row.first_workflow_name ? String(row.first_workflow_name) : undefined,
    discoveryAgentId: row.discovery_agent_id ? String(row.discovery_agent_id) : undefined,
    discoveryModel: row.discovery_model ? String(row.discovery_model) : undefined,
    discoveryCompletedAt: row.discovery_completed_at ? String(row.discovery_completed_at) : undefined,
    rawInputs: (row.raw_inputs as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}

export async function fetchUserDiscoveryProfile(userId: string): Promise<UserDiscoveryProfile | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data } = await supabase.from(TABLES.userDiscovery).select("*")
    .eq("user_id", userId).single()
  if (!data) return null
  return mapDiscoveryProfile(data as SupabaseRow)
}

export async function upsertDiscoveryProfile(profile: {
  userId: string; humanAlpha: unknown; suggestedWorkflows: unknown
  careerTrajectory?: unknown; engagementProfile?: unknown
  firstWorkflowId?: string; firstWorkflowName?: string
  discoveryAgentId?: string; discoveryModel?: string; rawInputs?: unknown
}): Promise<UserDiscoveryProfile | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase.from(TABLES.userDiscovery).upsert({
    user_id: profile.userId,
    human_alpha: profile.humanAlpha,
    suggested_workflows: profile.suggestedWorkflows,
    career_trajectory: profile.careerTrajectory ?? {},
    engagement_profile: profile.engagementProfile ?? {},
    first_workflow_id: profile.firstWorkflowId ?? null,
    first_workflow_name: profile.firstWorkflowName ?? null,
    discovery_agent_id: profile.discoveryAgentId ?? null,
    discovery_model: profile.discoveryModel ?? null,
    discovery_completed_at: new Date().toISOString(),
    raw_inputs: profile.rawInputs ?? {},
  }, { onConflict: "user_id" }).select().single()
  if (error || !data) return null
  return mapDiscoveryProfile(data as SupabaseRow)
}

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

export async function fetchGovernanceProposals(tribeId: string, status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("governance_proposals").select("*").eq("tribe_id", tribeId).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchGovernanceProposals", error); return [] }
  return data ?? []
}

export async function fetchGovernanceVotes(proposalId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("governance_votes").select("*").eq("proposal_id", proposalId)
  if (error) { console.error("fetchGovernanceVotes", error); return [] }
  return data ?? []
}

export async function fetchGovernanceDelegations(tribeId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("governance_delegations").select("*").eq("tribe_id", tribeId).eq("is_active", true)
  if (error) { console.error("fetchGovernanceDelegations", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export async function fetchMarketplaceListings(filters?: { listingType?: string; limit?: number; offset?: number }) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("marketplace_listings").select("*").eq("status", "active").order("created_at", { ascending: false })
  if (filters?.listingType) query = query.eq("listing_type", filters.listingType)
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 20) - 1)
  const { data, error } = await query
  if (error) { console.error("fetchMarketplaceListings", error); return [] }
  return data ?? []
}

export async function fetchMyMarketplaceListings() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("marketplace_listings").select("*").eq("seller_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchMyMarketplaceListings", error); return [] }
  return data ?? []
}

export async function fetchMyMarketplaceOrders() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("marketplace_orders").select("*").or(`buyer_user_id.eq.${user.id},seller_user_id.eq.${user.id}`).order("created_at", { ascending: false })
  if (error) { console.error("fetchMyMarketplaceOrders", error); return [] }
  return data ?? []
}

export async function fetchFulfillmentYieldScore() {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from("fulfillment_yield_scores").select("*").eq("user_id", user.id).single()
  if (error) { console.error("fetchFulfillmentYieldScore", error); return null }
  return data
}

// ---------------------------------------------------------------------------
// Trade
// ---------------------------------------------------------------------------

export async function fetchTradeOffers(filters?: { offerType?: string; visibility?: string; limit?: number }) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("sovereign_trade_offers").select("*").eq("status", "open").order("created_at", { ascending: false })
  if (filters?.offerType) query = query.eq("offer_type", filters.offerType)
  if (filters?.visibility) query = query.eq("visibility", filters.visibility)
  if (filters?.limit) query = query.limit(filters.limit)
  const { data, error } = await query
  if (error) { console.error("fetchTradeOffers", error); return [] }
  return data ?? []
}

export async function fetchTradeSessions() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("sovereign_trade_sessions").select("*").or(`party_a_user_id.eq.${user.id},party_b_user_id.eq.${user.id}`).order("created_at", { ascending: false })
  if (error) { console.error("fetchTradeSessions", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Authenticity
// ---------------------------------------------------------------------------

export async function fetchAuthenticityAttestations(contentHash?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("authenticity_attestations").select("*").order("created_at", { ascending: false })
  if (contentHash) query = query.eq("content_hash", contentHash)
  const { data, error } = await query.limit(50)
  if (error) { console.error("fetchAuthenticityAttestations", error); return [] }
  return data ?? []
}

export async function fetchAuthenticityChallenges(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("authenticity_challenges").select("*").order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query.limit(50)
  if (error) { console.error("fetchAuthenticityChallenges", error); return [] }
  return data ?? []
}

export async function fetchHeartbeatLog(limit?: number) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("biological_heartbeat_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit ?? 20)
  if (error) { console.error("fetchHeartbeatLog", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// A2A Protocol
// ---------------------------------------------------------------------------

export async function fetchA2AAgentCards(capability?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("a2a_agent_cards").select("*").order("avg_rating", { ascending: false })
  if (capability) query = query.contains("capabilities", [capability])
  const { data, error } = await query.limit(50)
  if (error) { console.error("fetchA2AAgentCards", error); return [] }
  return data ?? []
}

export async function fetchA2AHandshakes(role?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("a2a_handshakes").select("*").order("created_at", { ascending: false })
  if (role === "requester") {
    query = query.eq("requester_user_id", user.id)
  } else if (role === "provider") {
    query = query.eq("provider_user_id", user.id)
  } else {
    query = query.or(`requester_user_id.eq.${user.id},provider_user_id.eq.${user.id}`)
  }
  const { data, error } = await query.limit(50)
  if (error) { console.error("fetchA2AHandshakes", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Experience Archive
// ---------------------------------------------------------------------------

export async function fetchExperienceEntries(filters?: { entryType?: string; tribeId?: string; limit?: number }) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("experience_entries").select("*").order("created_at", { ascending: false })
  if (filters?.entryType) query = query.eq("entry_type", filters.entryType)
  if (filters?.tribeId) query = query.eq("tribe_id", filters.tribeId)
  const { data, error } = await query.limit(filters?.limit ?? 50)
  if (error) { console.error("fetchExperienceEntries", error); return [] }
  return data ?? []
}

export async function fetchExperienceEndorsements(experienceId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("experience_endorsements").select("*").eq("experience_id", experienceId).order("created_at", { ascending: false })
  if (error) { console.error("fetchExperienceEndorsements", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Decoupling
// ---------------------------------------------------------------------------

export async function fetchDecouplingAudits() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("decoupling_audits").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchDecouplingAudits", error); return [] }
  return data ?? []
}

export async function fetchDecouplingMilestones(auditId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("decoupling_milestones").select("*").eq("audit_id", auditId).order("sort_order", { ascending: true })
  if (error) { console.error("fetchDecouplingMilestones", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

export async function fetchBountyOpportunities(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("bounty_opportunities").select("*").order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query.limit(50)
  if (error) { console.error("fetchBountyOpportunities", error); return [] }
  return data ?? []
}

export async function fetchBountySubmissions() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("bounty_submissions").select("*").eq("submitter_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchBountySubmissions", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Recursive Evolution
// ---------------------------------------------------------------------------

export async function fetchIntelligenceTariffAudits() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("intelligence_tariff_audits").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchIntelligenceTariffAudits", error); return [] }
  return data ?? []
}

export async function fetchAgentHarnessEvolutions(agentDefinitionId?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("agent_harness_evolutions").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (agentDefinitionId) query = query.eq("agent_definition_id", agentDefinitionId)
  const { data, error } = await query.limit(50)
  if (error) { console.error("fetchAgentHarnessEvolutions", error); return [] }
  return data ?? []
}

export async function fetchAutoResearchCampaigns(tribeId?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("tribal_auto_research_campaigns").select("*").order("created_at", { ascending: false })
  if (tribeId) query = query.eq("tribe_id", tribeId)
  const { data, error } = await query
  if (error) { console.error("fetchAutoResearchCampaigns", error); return [] }
  return data ?? []
}

export async function fetchAutoResearchExperiments(campaignId: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data, error } = await supabase.from("auto_research_experiments").select("*").eq("campaign_id", campaignId).order("score", { ascending: false })
  if (error) { console.error("fetchAutoResearchExperiments", error); return [] }
  return data ?? []
}

// SherLog Forensics

export async function fetchMalwareArtifacts(classification?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("malware_artifacts").select("*").eq("reporter_user_id", user.id).order("created_at", { ascending: false })
  if (classification) query = query.eq("classification", classification)
  const { data, error } = await query
  if (error) { console.error("fetchMalwareArtifacts", error); return [] }
  return data ?? []
}

export async function fetchForensicNarratives(artifactId?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("forensic_narratives").select("*").eq("analyst_user_id", user.id).order("created_at", { ascending: false })
  if (artifactId) query = query.eq("artifact_id", artifactId)
  const { data, error } = await query
  if (error) { console.error("fetchForensicNarratives", error); return [] }
  return data ?? []
}

export async function fetchTribalIocs(isActive?: boolean) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  let query = supabase.from("tribal_herd_immunity").select("*").order("last_seen_at", { ascending: false })
  if (isActive !== undefined) query = query.eq("is_active", isActive)
  const { data, error } = await query
  if (error) { console.error("fetchTribalIocs", error); return [] }
  return data ?? []
}

export async function fetchSandboxDetonations(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("sandbox_detonations").select("*").eq("submitted_by_user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchSandboxDetonations", error); return [] }
  return data ?? []
}

// LeWorldModel
export async function fetchWorldModels() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("world_models").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchWorldModels", error); return [] }
  return data ?? []
}

export async function fetchImaginarySimulations(worldModelId?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("imaginary_simulations").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (worldModelId) query = query.eq("world_model_id", worldModelId)
  const { data, error } = await query
  if (error) { console.error("fetchImaginarySimulations", error); return [] }
  return data ?? []
}

export async function fetchSurpriseEvents(worldModelId?: string, severity?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("surprise_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (worldModelId) query = query.eq("world_model_id", worldModelId)
  if (severity) query = query.eq("severity", severity)
  const { data, error } = await query
  if (error) { console.error("fetchSurpriseEvents", error); return [] }
  return data ?? []
}

export async function fetchLatentProbes(worldModelId?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("latent_probes").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (worldModelId) query = query.eq("world_model_id", worldModelId)
  const { data, error } = await query
  if (error) { console.error("fetchLatentProbes", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Pacific Rim Shield
// ---------------------------------------------------------------------------

export async function fetchTrafficEntropyLedger(anomalousOnly?: boolean) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("traffic_entropy_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (anomalousOnly) query = query.eq("is_anomalous", true)
  const { data, error } = await query
  if (error) { console.error("fetchTrafficEntropyLedger", error); return [] }
  return data ?? []
}

export async function fetchAdversaryProfiles(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("adversary_stylometry").select("*").eq("analyst_user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchAdversaryProfiles", error); return [] }
  return data ?? []
}

export async function fetchDeviceLifecycleStates(lifecycleStatus?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("device_lifecycle_states").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (lifecycleStatus) query = query.eq("lifecycle_status", lifecycleStatus)
  const { data, error } = await query
  if (error) { console.error("fetchDeviceLifecycleStates", error); return [] }
  return data ?? []
}

export async function fetchBiometricEncryptionGates() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("biometric_encryption_gates").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchBiometricEncryptionGates", error); return [] }
  return data ?? []
}

// Interplanetary Pipeline

export async function fetchDeregulatedPolicies(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("deregulated_policy_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("deregulation_status", status)
  const { data, error } = await query
  if (error) { console.error("fetchDeregulatedPolicies", error); return [] }
  return data ?? []
}

export async function fetchLunarBuildPhases(phase?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("lunar_build_phases").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (phase) query = query.eq("phase", phase)
  const { data, error } = await query
  if (error) { console.error("fetchLunarBuildPhases", error); return [] }
  return data ?? []
}

export async function fetchFissionTelemetry(sourceType?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("fission_power_telemetry").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (sourceType) query = query.eq("source_type", sourceType)
  const { data, error } = await query
  if (error) { console.error("fetchFissionTelemetry", error); return [] }
  return data ?? []
}

export async function fetchSupplyChainMonitors(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("supply_chain_monitors").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchSupplyChainMonitors", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Recursive Meta-Agent
// ---------------------------------------------------------------------------

export async function fetchEvolutionLogs(mutationType?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("evolution_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (mutationType) query = query.eq("mutation_type", mutationType)
  const { data, error } = await query
  if (error) { console.error("fetchEvolutionLogs", error); return [] }
  return data ?? []
}

export async function fetchPerformanceMutations(toolName?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("performance_mutations").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (toolName) query = query.eq("tool_name", toolName)
  const { data, error } = await query
  if (error) { console.error("fetchPerformanceMutations", error); return [] }
  return data ?? []
}

export async function fetchTribalDna(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("tribal_dna_registry").select("*").eq("contributor_user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchTribalDna", error); return [] }
  return data ?? []
}

export async function fetchChairmanAlignment(): Promise<Record<string, number>> {
  const supabase = getSupabaseClient()
  if (!supabase) return {}
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data, error } = await supabase.from("chairman_alignment_vectors").select("dimension, weight").eq("user_id", user.id)
  if (error) { console.error("fetchChairmanAlignment", error); return {} }
  const result: Record<string, number> = {}
  for (const row of data ?? []) {
    result[row.dimension] = row.weight
  }
  return result
}

// Invisible Infrastructure
export async function fetchWasmArtifacts(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("wasm_artifacts").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("sandbox_status", status)
  const { data, error } = await query
  if (error) { console.error("fetchWasmArtifacts", error); return [] }
  return data ?? []
}

export async function fetchVisualWebLogs(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("visual_web_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchVisualWebLogs", error); return [] }
  return data ?? []
}

export async function fetchConsultantBlueprints(domain?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("consultant_blueprints").select("*").eq("creator_user_id", user.id).order("created_at", { ascending: false })
  if (domain) query = query.eq("expertise_domain", domain)
  const { data, error } = await query
  if (error) { console.error("fetchConsultantBlueprints", error); return [] }
  return data ?? []
}

export async function fetchObservabilityRefunds() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("observability_refund_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchObservabilityRefunds", error); return [] }
  return data ?? []
}

// Diplomatic Integrity

export async function fetchProxyInfluenceAudits(riskLevel?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("proxy_influence_audit").select("*").eq("analyst_user_id", user.id).order("created_at", { ascending: false })
  if (riskLevel) query = query.eq("risk_level", riskLevel)
  const { data, error } = await query
  if (error) { console.error("fetchProxyInfluenceAudits", error); return [] }
  return data ?? []
}

export async function fetchDiplomaticLureReviews(verdict?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("diplomatic_lure_registry").select("*").eq("reviewer_user_id", user.id).order("created_at", { ascending: false })
  if (verdict) query = query.eq("verdict", verdict)
  const { data, error } = await query
  if (error) { console.error("fetchDiplomaticLureReviews", error); return [] }
  return data ?? []
}

export async function fetchDiplomaticRefunds() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("diplomatic_refund_ledger").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchDiplomaticRefunds", error); return [] }
  return data ?? []
}

export async function fetchHandshakeSovereigntyGates(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("handshake_sovereignty_gates").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("session_status", status)
  const { data, error } = await query
  if (error) { console.error("fetchHandshakeSovereigntyGates", error); return [] }
  return data ?? []
}

// Blockade Bypass
export async function fetchVendorOpennessAudits() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("vendor_openness_audit").select("*").eq("user_id", user.id).order("friction_score", { ascending: false })
  if (error) { console.error("fetchVendorOpennessAudits", error); return [] }
  return data ?? []
}

export async function fetchSovereignMcpNodes(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("sovereign_mcp_nodes").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchSovereignMcpNodes", error); return [] }
  return data ?? []
}

export async function fetchVisualBypasses(app?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("visual_bypass_registry").select("*").eq("creator_user_id", user.id).order("created_at", { ascending: false })
  if (app) query = query.eq("target_app", app)
  const { data, error } = await query
  if (error) { console.error("fetchVisualBypasses", error); return [] }
  return data ?? []
}

export async function fetchAgenticIntentCerts(level?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("agentic_intent_certs").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (level) query = query.eq("certification_level", level)
  const { data, error } = await query
  if (error) { console.error("fetchAgenticIntentCerts", error); return [] }
  return data ?? []
}

// Forensic Accountability
export async function fetchAccountabilityGaps(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("accountability_gap_audit").select("*").eq("analyst_user_id", user.id).order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) { console.error("fetchAccountabilityGaps", error); return [] }
  return data ?? []
}

export async function fetchEconomicSanctions(sanctionStatus?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("economic_sanction_ledger").select("*").eq("enforcer_user_id", user.id).order("created_at", { ascending: false })
  if (sanctionStatus) query = query.eq("sanction_status", sanctionStatus)
  const { data, error } = await query
  if (error) { console.error("fetchEconomicSanctions", error); return [] }
  return data ?? []
}

export async function fetchHiddenNarratives(verificationStatus?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("hidden_narrative_reconstructions").select("*").eq("analyst_user_id", user.id).order("created_at", { ascending: false })
  if (verificationStatus) query = query.eq("verification_status", verificationStatus)
  const { data, error } = await query
  if (error) { console.error("fetchHiddenNarratives", error); return [] }
  return data ?? []
}

export async function fetchNetworkHygieneReports() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("network_hygiene_reports").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchNetworkHygieneReports", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Morpheus Protocol
// ---------------------------------------------------------------------------

export async function fetchBiometricMaskingSessions() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("biometric_masking_sessions").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchBiometricMaskingSessions", error); return [] }
  return data ?? []
}

export async function fetchEthicalResolutions() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("ethical_deadlock_resolutions").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchEthicalResolutions", error); return [] }
  return data ?? []
}

export async function fetchVibeSecurityAudits(passed?: boolean) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let query = supabase.from("vibe_code_security_audits").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (passed !== undefined) query = query.eq("passed", passed)
  const { data, error } = await query
  if (error) { console.error("fetchVibeSecurityAudits", error); return [] }
  return data ?? []
}

export async function fetchSolidStatePowerConfigs() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("solid_state_power_configs").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchSolidStatePowerConfigs", error); return [] }
  return data ?? []
}

// LinkedIn Workflow Automation
export async function fetchInvitationTracking(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let q = supabase.from("invitation_tracking").select("*").eq("owner_user_id", user.id)
  if (status) q = q.eq("invitation_status", status)
  const { data, error } = await q.order("updated_at", { ascending: false })
  if (error) { console.error("fetchInvitationTracking", error); return [] }
  return data ?? []
}

export async function fetchConnectionScores(minValue?: number) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let q = supabase.from("connection_scoring").select("*").eq("owner_user_id", user.id)
  if (minValue !== undefined) q = q.gte("value_score", minValue)
  const { data, error } = await q.order("value_score", { ascending: false })
  if (error) { console.error("fetchConnectionScores", error); return [] }
  return data ?? []
}

export async function fetchFeedIntelligence(repostOnly?: boolean) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let q = supabase.from("feed_intelligence").select("*").eq("owner_user_id", user.id)
  if (repostOnly) q = q.eq("repost_candidate", true)
  const { data, error } = await q.order("importance", { ascending: false }).limit(100)
  if (error) { console.error("fetchFeedIntelligence", error); return [] }
  return data ?? []
}

export async function fetchExternalContacts(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let q = supabase.from("external_contact_lists").select("*").eq("owner_user_id", user.id)
  if (status) q = q.eq("match_status", status)
  const { data, error } = await q.order("created_at", { ascending: false })
  if (error) { console.error("fetchExternalContacts", error); return [] }
  return data ?? []
}

export async function fetchDmResponseQueue(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let q = supabase.from("dm_response_queue").select("*").eq("owner_user_id", user.id)
  if (status) q = q.eq("response_status", status)
  const { data, error } = await q.order("priority", { ascending: false })
  if (error) { console.error("fetchDmResponseQueue", error); return [] }
  return data ?? []
}

// DNS + RSI Ascent
export async function fetchSovereignDnsZones() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("sovereign_dns_zones").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchSovereignDnsZones", error); return [] }
  return data ?? []
}

export async function fetchAgentWorkloads(status?: string) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let q = supabase.from("agent_parallel_workloads").select("*").eq("owner_user_id", user.id)
  if (status) q = q.eq("status", status)
  const { data, error } = await q.order("created_at", { ascending: false })
  if (error) { console.error("fetchAgentWorkloads", error); return [] }
  return data ?? []
}

export async function fetchRsiLearningSlope() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("rsi_learning_slope").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchRsiLearningSlope", error); return [] }
  return data ?? []
}

export async function fetchHardwareCompetitiveness() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("hardware_competitiveness_index").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchHardwareCompetitiveness", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Nuance & Resilience + Sovereign Health & Atoms (#208-221)
// ---------------------------------------------------------------------------

export async function fetchThermodynamicPolicies() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("thermodynamic_policy").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchThermodynamicPolicies", error); return [] }
  return data ?? []
}

export async function fetchShadowDecisions(requiresReview?: boolean) {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  let q = supabase.from("shadow_decision_logs").select("*").eq("owner_user_id", user.id)
  if (requiresReview !== undefined) q = q.eq("requires_review", requiresReview)
  const { data, error } = await q.order("created_at", { ascending: false })
  if (error) { console.error("fetchShadowDecisions", error); return [] }
  return data ?? []
}

export async function fetchFulfillmentLedger() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("fulfillment_ledger").select("*").eq("owner_user_id", user.id).order("measured_at", { ascending: false })
  if (error) { console.error("fetchFulfillmentLedger", error); return [] }
  return data ?? []
}

export async function fetchAtomicInventory() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("atomic_inventory").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchAtomicInventory", error); return [] }
  return data ?? []
}

export async function fetchTemporalMap() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("temporal_map").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchTemporalMap", error); return [] }
  return data ?? []
}

export async function fetchZkCredentials() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("zk_reputation_vault").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchZkCredentials", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Validation & Integrity
// ---------------------------------------------------------------------------

export async function fetchObjectiveFunctions() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("objective_functions").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchObjectiveFunctions", error); return [] }
  return data ?? []
}

export async function fetchReasoningAudits() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("reasoning_audit_logs").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchReasoningAudits", error); return [] }
  return data ?? []
}

export async function fetchPhysicalVerifications() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("physical_verification_states").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchPhysicalVerifications", error); return [] }
  return data ?? []
}

export async function fetchHumanAlphaGates() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("human_alpha_gates").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchHumanAlphaGates", error); return [] }
  return data ?? []
}

// ---------------------------------------------------------------------------
// Harness Evolution Layer
// ---------------------------------------------------------------------------

export async function fetchAestheticCalibrations() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("aesthetic_calibrations").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchAestheticCalibrations", error); return [] }
  return data ?? []
}

export async function fetchVerificationContracts() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("verification_contracts").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchVerificationContracts", error); return [] }
  return data ?? []
}

export async function fetchScaffoldAudits() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("scaffold_audit_log").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchScaffoldAudits", error); return [] }
  return data ?? []
}

export async function fetchVisualQaResults() {
  const supabase = getSupabaseClient()
  if (!supabase) return []
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from("visual_qa_results").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false })
  if (error) { console.error("fetchVisualQaResults", error); return [] }
  return data ?? []
}
