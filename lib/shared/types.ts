// Enhanced, extensible types supporting full-stack analytics, audit, provenance, lineage, permissions, and advanced AI integrations

export interface Persona {
  id: string
  name: string
  role: string
  description: string
  avatar: string
  systemPrompt: string
  color: string
  tags?: string[]                        // Categorization, search, filtering
  createdAt?: string                     // ISO timestamp (creation)
  updatedAt?: string                     // ISO timestamp (last update)
  usageCount?: number                    // Analytics: tracked persona selections
  isActive?: boolean                     // Soft enable/disable persona
  ownerUserId?: string                   // Multi-tenant ownership
  permissions?: string[]                 // RBAC permissions/scope identifiers
  aiProfileScore?: number                // AI-fit or post-processing scoring
  lastUsedAt?: string                    // Recent activity timestamp
  analytics?: Record<string, unknown>        // Arbitrary usage, performance, metrics
  metadata?: Record<string, unknown>         // Extensible, for custom attributes or internal markers
  version?: string                       // Track persona versioning
}

export interface TribeAssignment {
  tribeId: string
  tribeRole: string
  projects: ProjectAssignment[]
  joinedAt?: string                      // ISO, for sorting/tenure tracking
  leftAt?: string | null                 // Null if currently part of tribe
  tags?: string[]                        // Faceted filtering, permission/risk tags
  isActive?: boolean                     // Current vs alumni, eligibility flag
  assignedBy?: string                    // User/AI agent assigned
  confidenceScore?: number               // AI: tribe fit/compatibility
  notes?: string                         // Human/AI assignment rationale
  metadata?: Record<string, unknown>         // Custom extension
}

export interface ProjectAssignment {
  projectId: string
  projectRole: string
  responsibilities?: string[]
  startDate?: string                     // ISO
  endDate?: string | null                // ISO, null if ongoing
  tags?: string[]
  completed?: boolean                    // Project status tracking
  assignedBy?: string
  notes?: string
  impactScore?: number                   // AI/analytics: project impact or value
  metadata?: Record<string, unknown>
  externalReferences?: string[]          // Links: docs, tickets, reviews, etc.
}

export interface Conversation {
  id: string
  personaId: string
  title: string
  lastMessage: string
  timestamp: Date
  unread: number
  isPinned?: boolean                     // Pin/favorite UI state
  tags?: string[]
  updatedAt?: string
  createdAt?: string
  archived?: boolean                     // Soft archival state
  participants?: string[]                // User or persona IDs
  aiSummary?: string                     // AI-generated summary (optional)
  conversationType?: 'user' | 'ai' | 'group' // Classification for analytics
  isRead?: boolean                       // For more granular control
  metadata?: Record<string, unknown>
}

export interface LinkedInProfile {
  id?: string                            // Indexing/deduplication
  firstName: string
  lastName: string
  headline: string
  industry: string
  location: string
  summary: string
  positions: LinkedInPosition[]
  skills: string[]
  education: LinkedInEducation[]
  connections: number
  email?: string
  imageUrl?: string                      // Photo/avatar URL
  phoneNumber?: string
  birthday?: string
  tribalAffinityScore?: number           // AI score: tribe fit or cluster affinity
  tribeRecommendations?: string[]        // AI-suggested tribes/roles
  tribes?: TribeAssignment[]             // Current/historic tribe memberships
  projects?: ProjectAssignment[]         // Individual, direct projects/roles
  certifications?: string[]              // Professional certs, licenses, clearances
  endorsements?: Record<string, number>  // Key: skill, Value: count
  recommendationsCount?: number          // Public recommendations
  tags?: string[]                        // Subgroup/ad hoc/flags
  linkedInUrl?: string
  importedAt?: string
  updatedAt?: string
  createdByUserId?: string
  notes?: string
  lastAnalyzedAt?: string                // AI-data timestamping, for audit
  profileSource?: 'imported' | 'manual' | 'synced' // Provenance for aggregating sources
  publicProfile?: boolean                // Visibility setting
  metadata?: Record<string, unknown>
}

export interface LinkedInPosition {
  id?: string
  title: string
  company: string
  startDate: string
  endDate: string | null
  description: string
  location: string
  projects?: ProjectAssignment[]         // Project involvements during this position
  supervisor?: string                    // Optional: name or id
  isCurrent?: boolean
  tags?: string[]
  impactScore?: number                   // AI- or user-determined
  companyId?: string                     // Optional: for normalization
  companyIndustry?: string
  performanceNotes?: string
  metadata?: Record<string, unknown>
}

export interface LinkedInEducation {
  id?: string
  school: string
  degree: string
  fieldOfStudy: string
  startDate: string
  endDate: string
  grade?: string
  activities?: string                    // Clubs, orgs, leadership
  awards?: string[]
  thesisTitle?: string                   // Academic project/dissertation/major paper
  tags?: string[]
  honors?: string                        // Extra field: Cum Laude etc.
  gpa?: string                           // Extra: for STEM/military
  metadata?: Record<string, unknown>
}

export interface TribeAnalysis {
  tribes: Tribe[]
  totalProfiles: number
  analysisDate: string                   // ISO
  projects: Project[]
  metaGroups?: MetaGroup[]
  elapsedMs?: number
  tags?: string[]
  runByUserId?: string                   // Provenance/audit
  summary?: string
  recommendations?: string[]             // AI actions or next steps
  topOutliers?: string[]                 // AI-detected anomalies
  insights?: Record<string, unknown>         // Key metrics, dashboards, visualization
  version?: string
  riskAssessments?: Record<string, unknown>  // Optional: detailed risk/fitness analysis
  lineage?: string[]                     // Report lineage, if chained
  metadata?: Record<string, unknown>
}

export interface Tribe {
  id: string
  name: string
  description: string
  members: TribeMember[]
  commonSkills: string[]
  avgExperience: number                  // Average years/months experience
  industryFocus: string
  projects: Project[] | string[]         // Allow both Project objects and string IDs
  subgroups?: Subgroup[]
  tribeType?: 'enterprise' | 'clandestine' | 'military' | 'hybrid'
  leaderId?: string                      // Main leader (personId)
  deputyLeaderId?: string                // Optional: secondary
  activeMemberCount?: number
  alumniCount?: number                   // Workforce analytics
  tags?: string[]
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  aiCohesionScore?: number               // Group cohesion score (AI)
  externalRelations?: string[]           // Links to other tribes/groups/orgs
  emblemUrl?: string                     // Visual identity
  visibility?: 'public' | 'private' | 'secret'
  lineage?: string[]                     // Provenance for report chains
  metadata?: Record<string, unknown>
  // UI visualization fields
  cohesion?: number
  complementarity?: number
  strengths?: string[]
  radarData?: TribeRadarDataPoint[]
  skillDist?: TribeSkillDistPoint[]
  status?: "active" | "forming" | "paused" | "archived"
  // Optional design-preview health metadata (from designTribesForObjective windowed output)
  requiredSkillCoveragePercent?: number
  networkSharePercent?: number
  designWindowUsedProfileCount?: number
  designWindowTotalProfiles?: number
  designWindowLimit?: number
  designWindowCoveragePercent?: number
  designWindowTruncated?: boolean
}

export interface TribeMember {
  personId: string
  name?: string
  tribeRole: TribeRole | string
  projectRoles?: ProjectAssignment[] | string[]
  seniority?: string
  skills?: string[]
  joinedAt?: string
  leftAt?: string | null
  status?: 'active' | 'inactive' | 'alumni' | 'prospect' // Granular status
  isMentor?: boolean                     // For org/tribe analytics
  tags?: string[]
  invitedBy?: string
  lastActiveAt?: string
  participationScore?: number            // AI or analytics
  contactEmail?: string                  // For notifications
  metadata?: Record<string, unknown>
}

export interface Subgroup {
  id: string
  name: string
  description?: string
  members: string[]                      // personIds
  tags?: string[]
  subgroupType?: string                  // Team, cell, unit, squadron, etc.
  visibility?: 'public' | 'private' | 'secret'
  createdAt?: string
  updatedAt?: string
  leaderId?: string
  aiAffinityScore?: number               // For dynamic subgroups/AI groupings
  parentTribeId?: string                 // For multi-level hierarchy
  metadata?: Record<string, unknown>
}

export interface Project {
  id: string
  name: string
  description: string
  startDate?: string
  endDate?: string | null
  members: ProjectMember[]
  tribeId?: string                       // Associated tribe, if any
  tags?: string[]
  status?: "planned" | "active" | "completed" | "on-hold" | "archived" | "cancelled"
  visibility?: "internal" | "external" | "restricted"
  ownerUserId?: string
  createdAt?: string
  updatedAt?: string
  budget?: number                        // Project budget/cost
  impactScore?: number                   // AI/analytics outcome
  priority?: "low" | "medium" | "high" | "critical"   // For portfolio mgmt
  clientName?: string                    // If external/supporting
  attachments?: string[]                 // Docs, links, references
  objective?: string                     // Short project goal/summary
  stakeholders?: string[]                // Key people/users/orgs
  metadata?: Record<string, unknown>
}

export interface ProjectMember {
  personId: string
  role: string
  responsibilities?: string[]
  startDate?: string
  endDate?: string | null
  tags?: string[]
  joinedAt?: string
  leftAt?: string | null
  status?: 'active' | 'former' | 'prospect'
  assignedBy?: string
  ratePerHour?: number                   // Advanced: analytics, cost, finance
  contributionScore?: number             // AI or user input
  contactEmail?: string
  timeAllocationPct?: number             // Analytics: commitment %
  metadata?: Record<string, unknown>
}

export interface MetaGroup {
  id: string
  name: string
  description?: string
  tribeIds: string[]
  purpose?: string
  metaGroupType?: string                 // Category/classification
  leadTribeId?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
  partners?: string[]                    // External affiliations/partners
  priority?: "low" | "medium" | "high"
  visibility?: "public" | "private"
  aiAffinityScore?: number               // Optional: AI grouping metric
  lineage?: string[]                     // For provenance
  metadata?: Record<string, unknown>
}

// === Tribe Panel Support Types ===

export type TribeRole = "Lead" | "Strategist" | "Executor" | "Creative" | "Analyst" | "Connector"

export interface TribesPanelProps {
  csvData: string | null
  onNavigate?: (view: string) => void
  onPageContextChange?: (context: Record<string, string | number | boolean | null>) => void
}

export interface TribeRadarDataPoint {
  metric: string
  value: number
}

export interface TribeSkillDistPoint {
  name: string
  value: number
}

export interface CSVUploadResult {
  profiles: LinkedInProfile[]
  fileName: string
  rowCount: number
  importedAt?: string
  importedByUserId?: string              // Audit/provenance
  elapsedMs?: number
  warnings?: string[]                    // Import, parse, validation warnings
  tags?: string[]
  analysisResults?: TribeAnalysis        // Optional: immediate post-upload
  fileSizeBytes?: number                 // For quota/audit
  ignoredRows?: number                   // Parse failures etc.
  version?: string
  metadata?: Record<string, unknown>
}

export interface GlobeProfileDot {
  id: string
  name: string
  headline: string
  longitude: number
  latitude: number
  tribeId?: string
  connectionCount: number
}

export interface GlobeTribeCluster {
  id: string
  name: string
  memberCount: number
  longitude: number
  latitude: number
  color: [number, number, number]
}

export interface GlobeProjectArc {
  id: string
  name: string
  sourcePosition: [number, number]
  targetPosition: [number, number]
  tribeId?: string
}

export interface FriendLocation {
  id: string
  name: string
  headline: string
  longitude: number
  latitude: number
  lastSeen: string
  consentGiven: boolean
}

export interface GlobeConnectionLine {
  sourcePosition: [number, number]
  targetPosition: [number, number]
}

export type GlobeMapStyle = "satellite" | "dark" | "streets"

export interface GlobeSelectedItem {
  type: "profile" | "tribe" | "project" | "friend"
  id: string
  name: string
  details: string
  longitude: number
  latitude: number
}
