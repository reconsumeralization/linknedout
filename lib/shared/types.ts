// Enhanced, extensible types supporting full-stack analytics, audit, provenance, lineage, permissions, and advanced AI integrations

// ---------------------------------------------------------------------------
// Sovereign Civilization: 6 Bespoke Elements
// ---------------------------------------------------------------------------

export interface HumanAlphaDecision {
  id: string
  userId: string
  decisionType: "ai_override" | "strategic_direction" | "veto" | "creative_divergence" | "ethical_judgment"
  context: string
  aiRecommendation?: string
  humanDecision: string
  divergenceReasoning?: string
  confidence: number
  decisionComplexity: "routine" | "complex" | "novel" | "high_stakes"
  cognitiveState: { hoursWorked?: number; decisionFatigue?: number; focusLevel?: number }
  humanAlphaPoints: number
  createdAt: string
}

export interface NegotiationSession {
  id: string
  userId: string
  sessionType: "zoom_call" | "in_person" | "email_thread" | "async_negotiation"
  counterparty?: string
  context: string
  insightsGenerated: Array<{ timestamp: string; type: string; insight: string; confidence: number; suggestedAction: string }>
  sentimentTrajectory: Array<{ timestamp: string; sentiment: number; topic: string }>
  outcome?: string
  outcomeValueUsd?: number
  createdAt: string
}

export interface SanctuarySession {
  id: string
  userId: string
  mode: "deep_work" | "creative_flow" | "strategic_planning" | "recovery"
  startedAt: string
  endedAt?: string
  durationMinutes?: number
  notificationsSilenced: number
  tribalSignalsPassed: number
  commandersBriefing?: { totalDMs: number; actionableDMs: number; synthesizedBriefing: string; criticalAlerts: string[] }
  focusScore: number
  outputDuringSession?: string
}

export interface AgenticWill {
  userId: string
  legacyAgentId?: string
  successionType: "tribal_transition" | "heir_transfer" | "foundation" | "archive"
  heirUserIds: string[]
  decisionHistoryTrained: boolean
  trainingDataYears: number
  activationTrigger: string
  legacyModeConfig: { autoRunWorkflows?: boolean; maintainTribes?: boolean; budgetLimit?: number }
}

export interface ArtifactRegistration {
  id: string
  userId: string
  artifactType: "sovereign_stone" | "tribal_ring" | "founder_key"
  publicKey: string
  trustHandshakes: number
  verifiedEncounters: Array<{ withUserId: string; location?: string; timestamp: string; mutualTrustVerified: boolean }>
  artifactStatus: "active" | "lost" | "replaced" | "decommissioned"
  issuedAt: string
}

// ---------------------------------------------------------------------------
// Agent & App Factory: Industrialized Intelligence
// ---------------------------------------------------------------------------

export type FactoryPipelineStatus = "queued" | "station_1" | "station_2" | "station_3" | "quality_check" | "deployed" | "failed"

export interface FactoryStation {
  stationId: string
  name: string
  role: string
  status: "pending" | "running" | "completed" | "failed"
  agentUsed?: string
  input?: string
  output?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
}

export interface FactoryPipeline {
  id: string
  ownerUserId: string
  pipelineType: "app_build" | "agent_build" | "tool_build" | "workflow_build"
  name: string
  intent: string
  status: FactoryPipelineStatus
  stations: FactoryStation[]
  currentStation: number
  totalStations: number
  qualityScore: number
  securityScanPassed?: boolean
  complianceCheckPassed?: boolean
  outputType?: string
  outputUrl?: string
  totalDurationMs?: number
  estimatedManualHours?: number
  actualCostUsd: number
  forceMultiplier?: number
  createdAt: string
}

export interface FactoryAgent {
  id: string
  ownerUserId: string
  pipelineId?: string
  agentName: string
  agentRole: string
  backstory?: string
  toolsEquipped: string[]
  memoryType: "vector" | "graph" | "relational" | "hybrid"
  capabilities: string[]
  constraints: string[]
  performanceMetrics: { tasksCompleted?: number; avgConfidence?: number; avgResponseMs?: number; errorRate?: number }
  status: "draft" | "testing" | "active" | "paused" | "retired"
  deployedAt?: string
  createdAt: string
}

export interface FactoryMetrics {
  ownerUserId: string
  periodDate: string
  appsBuilt: number
  agentsAssembled: number
  toolsCreated: number
  workflowsShipped: number
  totalComputeCostUsd: number
  totalManualHoursSaved: number
  avgQualityScore: number
  factoryVelocity: number
  selfPerpetuatingLoops: number
}

// ---------------------------------------------------------------------------
// Cyborg C-Suite: AI Autonomous Executive Layer
// ---------------------------------------------------------------------------

export type CsuiteExecutive = "ceo" | "cfo" | "cto" | "cmo" | "cco"

export interface StrategicPath {
  id: string
  title: string
  description: string
  confidence: number
  riskLevel: "low" | "medium" | "high"
  estimatedImpact: string
  requiredResources: string[]
  timelineHours: number
}

export interface ExecutiveBrief {
  id: string
  ownerUserId: string
  briefDate: string
  briefType: "morning_review" | "priority_shift" | "emergency" | "weekly_synthesis"
  ceoStrategicPaths: StrategicPath[]
  ceoPriorityRanking: string[]
  cfoRefundsFound: Record<string, unknown>
  cfoBurnRateAlert?: string
  ctoSystemHealth: { uptime?: string; errorRate?: number; securityAlerts?: number; complianceStatus?: string }
  ctoAutoFixesApplied: number
  cmoTribalGrowth: Record<string, unknown>
  ccoTrustScoreAvg: number
  ccoBotsVlagged: number
  ccoCommunityHealth: string
  chairmanDecision?: string
  chairmanVetoNotes?: string
  chairmanAdditions?: string
  executionStatus: "pending" | "decided" | "executing" | "completed" | "vetoed"
  createdAt: string
}

export interface CsuiteAutonomousAction {
  id: string
  ownerUserId: string
  executive: CsuiteExecutive
  actionType: string
  description: string
  impactSummary?: string
  confidence: number
  requiresChairmanReview: boolean
  chairmanApproved?: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Refund Engine: Tariff & Efficiency Reclamation + BAHA Blasts
// ---------------------------------------------------------------------------

export interface RefundDashboard {
  userId: string
  totalMonetaryRefundUsd: number
  totalHoursReclaimed: number
  totalSaasSavingsMonthlyUsd: number
  totalNetworkSignalGainPct: number
  totalRdCreditEstimateUsd: number
  tariffVatRefundUsd: number
  cognitiveTariffHours: number
  saasRedundancySavingsUsd: number
  networkNoiseReductionPct: number
  rdInnovationHours: number
  refundsDeployedToProjects: number
  lastAuditAt?: string
}

export interface CognitiveTariffAudit {
  id: string
  userId: string
  totalWorkHours: number
  searchSummarizeHours: number
  decisionDesignHours: number
  automatableHours: number
  hoursReclaimed: number
  topTariffTasks: Array<{ task: string; hoursSpent: number; automationPotential: number; suggestedWorkflow: string }>
  refundRatePct: number
}

export interface BahaBlast {
  id: string
  userId: string
  triggeredBy: string
  triggerAlertId?: string
  severityOfTrigger: string
  buildAction: string
  adaptAction: string
  hardenAction: string
  amplifyAction: string
  buildStatus: "pending" | "in_progress" | "completed"
  adaptStatus: "pending" | "in_progress" | "completed"
  hardenStatus: "pending" | "in_progress" | "completed"
  amplifyStatus: "pending" | "in_progress" | "completed"
  overallConfidenceBoost: number
  completedAt?: string
  outcomeSummary?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Network Intelligence Engine: Super-Connector Tools for 30K+ Networks
// ---------------------------------------------------------------------------

export interface NetworkTriageRule {
  id: string
  ownerUserId: string
  ruleName: string
  ruleType: "auto_respond" | "require_proof" | "priority_pass" | "decline" | "queue"
  conditions: { minTrustScore?: number; requiresProofOfBuild?: boolean; requiredSkills?: string[]; fromTribe?: string; hasVerifiedOutput?: boolean }
  autoResponseTemplate?: string
  priority: number
  isActive: boolean
  matchesCount: number
  createdAt: string
}

export interface NetworkTriageEntry {
  id: string
  ownerUserId: string
  senderProfileId?: string
  senderName?: string
  messagePreview?: string
  triageResult: "passed" | "queued" | "auto_responded" | "declined"
  matchedRuleId?: string
  senderTrustScore?: number
  senderProofOfBuilds?: number
  aiReasoning?: string
  createdAt: string
}

export interface NetworkSegment {
  id: string
  ownerUserId: string
  segmentName: string
  segmentType: "auto" | "manual" | "ai_suggested"
  clusteringBasis?: string
  memberProfileIds: string[]
  memberCount: number
  avgActivityVelocity: number
  avgHumanAlpha: number
  topSkills: string[]
  description?: string
  lastBroadcastAt?: string
  createdAt: string
}

export interface NetworkWealthSnapshot {
  id: string
  ownerUserId: string
  snapshotDate: string
  totalConnections: number
  activeConnections: number
  highAgencyCount: number
  betweenProjectsCount: number
  combinedProofOfBuilds: number
  estimatedNetworkValueUsd?: number
  topSegments: Array<{ name: string; count: number; avgVelocity: number }>
  talentAvailability: { bySkill?: Record<string, number>; byAvailability?: { available: number; busy: number } }
  deploymentReadiness: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Economic Operating System: 5-Pillar Platform Success
// ---------------------------------------------------------------------------

export type SovereigntyTier = "explorer" | "builder" | "operator" | "sovereign"

export interface PlatformKPI {
  id: string
  userId: string
  periodStart: string
  periodEnd: string
  firstCollaborationHours?: number
  firstProjectShippedHours?: number
  velocityOfValueScore?: number
  executionLayerPct: number
  decisionLayerPct: number
  pivotVelocity: number
  skillPivotAchieved: boolean
  soloOutputScore: number
  tribalOutputScore: number
  tribeMultiplier: number
  trustScoreCurrent: number
  signalDensityScore: number
  judgmentEventsCount: number
  streakDays: number
  sovereigntyTier: SovereigntyTier
  toolsMastered: number
  workflowsCreated: number
  promptsPublished: number
  createdAt: string
  updatedAt: string
}

export interface CareerFlightAlert {
  id: string
  userId: string
  alertType: "obsolescence_warning" | "opportunity_detected" | "pivot_recommended" | "skill_expiring"
  severity: "info" | "warning" | "critical"
  title: string
  description: string
  affectedSkills: string[]
  automationThreatPct?: number
  pivotPaths: Array<{ targetRole: string; requiredSkills: string[]; estimatedPivotWeeks: number; bridgeCourse?: string; forceMultiplierGain?: string }>
  marketSignal: { source?: string; trend?: string; confidence?: number }
  status: "active" | "acknowledged" | "acting" | "resolved" | "dismissed"
  createdAt: string
}

export interface FeedItem {
  id: string
  authorUserId: string
  tribeId?: string
  contentType: "implementation" | "insight" | "signal" | "proof_of_build" | "prompt_share" | "verification_result"
  title: string
  body: string
  implementationEvidence?: { toolUsed?: string; promptChain?: string; timeSaved?: string; errorRate?: number; beforeAfter?: string }
  aiSynthesis?: { keyTakeaways: string[]; actionablePrompt: string }
  implementationCount: number
  verificationCount: number
  forkCount: number
  signalScore: number
  noisePenalty: number
  tags: string[]
  isFeatured: boolean
  createdAt: string
}

export interface VelocityScore {
  id: string
  userId: string
  integrationType: "github" | "linear" | "figma" | "vercel" | "manual"
  metricName: string
  metricValue: number
  humanJudgmentRatio?: number
  measurementPeriodDays: number
  verifiedAt: string
}

// ---------------------------------------------------------------------------
// Education Bridge: K-12 ↔ OTJ Continuous Learning System
// ---------------------------------------------------------------------------

export interface ShadowAgentSession {
  id: string
  userId: string
  sessionType: "otj_copilot" | "k12_guided" | "self_directed" | "tribe_mentored"
  contextDomain: string
  taskObserved: string
  narrationLog: Array<{ timestamp: string; observation: string; logicExplanation: string; toolSuggested?: string; confidence?: number }>
  interventions: Array<{ timestamp: string; type: "suggestion" | "correction" | "optimization"; accepted: boolean; detail: string }>
  skillsPracticed: string[]
  masteryDelta: { before: Record<string, number>; after: Record<string, number>; improvementPct: number }
  durationMinutes?: number
  aiModelUsed?: string
  createdAt: string
}

export interface DeltaReport {
  id: string
  userId: string
  reportDate: string
  executionSummary: { totalTasks: number; aiAssistedTasks: number; manualTasks: number; timeOnSearchSummarize: number; timeOnDecisionDesign: number }
  optimizations: Array<{ task: string; currentMethod: string; suggestedWorkflow: string; estimatedTimeSaved: string; promptChain?: string; installable: boolean }>
  skillProgression: { newSkillsUsed: string[]; skillsImproved: string[]; atRiskSkills: string[] }
  forceMultiplierAchieved?: number
  learningVelocity?: number
  streakDays: number
  createdAt: string
}

export interface PromptMarketplaceEntry {
  id: string
  authorUserId: string
  tribeId?: string
  title: string
  description: string
  promptTemplate: string
  variables: Array<{ name: string; description: string; type: string; example: string }>
  domain: string
  performanceMetrics: { conversionLift?: string; timeSaved?: string; errorReduction?: string; usageCount?: number }
  installCount: number
  ratingAvg: number
  ratingCount: number
  tags: string[]
  status: "draft" | "published" | "archived" | "featured"
  createdAt: string
  updatedAt: string
}

export interface VerificationLab {
  id: string
  creatorUserId: string
  tribeId?: string
  title: string
  difficulty: "beginner" | "intermediate" | "advanced" | "expert"
  domain: string
  aiGeneratedContent: string
  plantedErrors: Array<{ location: string; errorType: "hallucination" | "logic_flaw" | "source_fabrication" | "subtle_bias" | "statistical_error"; description: string; severity: string }>
  totalErrors: number
  timeLimitMinutes: number
  attempts: Array<{ userId: string; errorsFound: string[]; accuracy: number; timeSpent: number; completedAt: string }>
  createdAt: string
}

export interface ProofOfBuild {
  id: string
  userId: string
  title: string
  description: string
  projectType: "solo_build" | "tribe_sprint" | "k12_project" | "otj_deliverable" | "open_source"
  complexityTier: "standard" | "advanced" | "force_multiplier" | "team_replacement"
  toolsUsed: string[]
  aiToolsUsed: string[]
  decisionLog: Array<{ decision: string; reasoning: string; alternativesConsidered: string[]; outcome: string }>
  evidenceUrls: string[]
  outputMetrics: { timeTaken?: number; estimatedManualTime?: number; forceMultiplier?: number; qualityScore?: number }
  verifiedBy: Array<{ userId: string; role: "peer" | "mentor" | "employer" | "tribe_lead"; verifiedAt: string; notes?: string }>
  verificationScore: number
  skillsDemonstrated: string[]
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface SkillVerification {
  id: string
  userId: string
  skillName: string
  verificationMethod: "proof_of_build" | "verification_lab" | "peer_review" | "tribe_assessment" | "delta_report_trend"
  evidenceId?: string
  outputVelocity: { tasksPerHour?: number; qualityScore?: number; consistencyOver30Days?: number; forceMultiplier?: number }
  verifiedAt: string
  expiresAt?: string
  confidence: number
}

// ---------------------------------------------------------------------------
// Operating System for Agents: 6 Prime Directives
// ---------------------------------------------------------------------------

// 1. Trust Score: Verified Log of Judgment
export interface JudgmentEvent {
  id: string
  userId: string
  eventType: "tool_validation" | "output_review" | "tribe_decision" | "sprint_review" | "signal_validation" | "workflow_direction"
  contextType: "profile" | "tribe" | "project" | "content" | "workflow" | "signal"
  contextId?: string
  judgment: "approved" | "rejected" | "modified" | "escalated" | "directed"
  aiOutputHash?: string
  aiModelUsed?: string
  modificationSummary?: string
  confidenceScore?: number
  timeSpentSeconds?: number
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface TrustScore {
  userId: string
  totalJudgments: number
  approvalRate: number
  modificationRate: number
  rejectionRate: number
  avgResponseTimeSeconds: number
  decisionLayerScore: number
  judgmentStreak: number
  domainsJudged: string[]
  lastJudgmentAt?: string
  updatedAt: string
}

// 2. Agentic Sprint-Loop: AI-first task assignment
export type SprintTaskStatus = "backlog" | "ai_assigned" | "ai_in_progress" | "ai_completed" | "human_review" | "human_in_progress" | "done" | "failed"

export interface SprintTask {
  id: string
  ownerUserId: string
  sprintId?: string
  projectId?: string
  title: string
  description?: string
  status: SprintTaskStatus
  priority: "low" | "medium" | "high" | "critical"
  assignedTo: string
  aiAgentId?: string
  aiModelUsed?: string
  aiAttemptCount: number
  aiOutput?: Record<string, unknown>
  aiConfidence?: number
  humanFeedback?: string
  escalationReason?: string
  estimatedMinutes?: number
  actualMinutes?: number
  forceMultiplier?: number
  tags: string[]
  dueAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

// 3. Content Multiplier: One insight → multi-format
export interface ContentAmplification {
  id: string
  ownerUserId: string
  sourceType: "insight" | "signal" | "knowledge_entry" | "project_update"
  sourceId?: string
  sourceText: string
  outputs: Array<{
    format: "linkedin_post" | "thread" | "podcast_script" | "design_brief" | "newsletter"
    content: string
    generatedBy: string
    status: "draft" | "approved" | "published"
    publishedAt?: string
  }>
  distributionChannels: Array<{
    channel: "linkedin" | "tribal_feed" | "email" | "podcast"
    status: "pending" | "sent"
    sentAt?: string
  }>
  amplificationScore: number
  createdAt: string
  updatedAt: string
}

// 5. Skill-Futures: Judgment marketplace
export interface SkillFuture {
  id: string
  creatorUserId: string
  tribeId?: string
  predictionType: "project_success" | "tool_adoption" | "skill_demand" | "member_growth"
  title: string
  description?: string
  resolutionCriteria: string
  resolutionDate: string
  status: "open" | "locked" | "resolved_yes" | "resolved_no" | "cancelled"
  stakes: Array<{ userId: string; position: "yes" | "no"; confidence: number; stakedAt: string }>
  resolutionEvidence?: string
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
}

// 6. Sovereignty Profile
export interface SovereigntyProfile {
  userId: string
  entityType?: "sole_proprietor" | "llc" | "corp" | "freelancer" | "not_set"
  entityName?: string
  jurisdiction?: string
  taxClassification?: string
  complianceChecklist: Array<{ item: string; status: "done" | "pending" | "overdue"; dueDate?: string; completedAt?: string }>
  autoComplianceEnabled: boolean
  toolsBudgetMonthly?: number
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Legal Sovereign Module
// ---------------------------------------------------------------------------

export interface SovereignLegalStack {
  id: string
  ownerUserId: string
  stackName: string
  firmName?: string
  stackType: "due_diligence" | "contract_synthesis" | "judgment_modeling" | "litigation_strategy" | "full_sovereign"
  modelProvider: "local_slm" | "claude" | "gpt4" | "gemini"
  persistentMemoryLocation: "sovereign" | "cloud" | "hybrid"
  agentCount: number
  casesProcessed: number
  dependencyScore: number
  monthlySavingsUsd: number
  status: "provisioning" | "active" | "migrating" | "archived"
}

export interface ClientTrustPortal {
  id: string
  firmUserId: string
  clientName: string
  portalType: "judgment_verified" | "full_transparency" | "read_only"
  matters: Array<{ matterId: string; title: string; humanJudgmentScore: number; aiExecutionPct: number }>
  humanJudgmentCertificates: number
  artifactHandshakeRequired: boolean
}

export interface LegalDependencyAudit {
  id: string
  userId: string
  platformName: string
  annualCostUsd: number
  dataLockInRisk: "low" | "medium" | "high" | "critical"
  migrationComplexity: "simple" | "moderate" | "complex"
  sovereignAlternative: string
  estimatedMigrationDays: number
  annualSavingsUsd: number
  intelligenceTaxPct: number
}

// ---------------------------------------------------------------------------
// Energy Sovereignty + Spatial Sovereignty
// ---------------------------------------------------------------------------

export interface OneChargeDevice {
  id: string
  userId: string
  deviceType: "artifact" | "phone" | "home_storage" | "vehicle" | "compute_node" | "satellite"
  deviceName: string
  batteryTech: "nuclear_diamond" | "solid_state" | "graphene" | "hybrid"
  lifespanYears: number
  currentHealthPct: number
  yearsRemaining?: number
  alwaysOnAiEnabled: boolean
  energyStagedToTribe: number
  sovereignPulseActive: boolean
}

export interface SovereignVehicle {
  id: string
  ownerUserId: string
  vehicleName: string
  vehicleType: "sedan" | "suv" | "van" | "truck" | "pod" | "delivery_drone"
  powertrain: "one_charge" | "solid_state" | "ev_standard"
  autonomyLevel: number
  lifespanYears: number
  xenobotSelfHealing: boolean
  fleetAvailable: boolean
  fleetEarningsUsd: number
  mobileNeoLabActive: boolean
  drivingHoursReclaimed: number
}

export interface FleetSession {
  id: string
  vehicleId: string
  riderUserId: string
  artifactVerified: boolean
  routeType: "optimized" | "high_signal" | "scenic" | "tribal_hub"
  durationMinutes?: number
  deepWorkMinutes: number
  settlementTokens?: number
}

// ---------------------------------------------------------------------------
// Decadal Timeline + Orbital Pharma
// ---------------------------------------------------------------------------

export interface DecadalMilestone {
  id: string
  userId: string
  phase: 1 | 2 | 3 | 4
  phaseName: string
  milestoneKey: string
  milestoneDescription: string
  status: "pending" | "in_progress" | "completed" | "skipped"
  targetDate?: string
  refundType?: "labor" | "capital" | "energy_health" | "space_compute"
  refundValue?: string
}

export interface OrbitalNeoLab {
  id: string
  labName: string
  labType: "pharma_crystallization" | "protein_folding" | "material_science" | "xenobot_culture"
  orbitType: "LEO" | "GEO" | "lunar_orbit" | "deep_space"
  operationalStatus: string
  microgravityQuality: number
  currentBatch?: string
  batchStatus?: string
}

export interface TribalPharmaMission {
  id: string
  missionName: string
  targetCompound: string
  compoundType: "cancer_protein" | "insulin" | "supplement" | "vaccine" | "custom"
  stakersCount: number
  totalStakedUsd: number
  manufacturingStatus: "staking" | "funded" | "launched" | "crystallizing" | "reentry" | "distributed"
  purityScore?: number
  potencyMultiplier: number
  costReductionPct?: number
}

// ---------------------------------------------------------------------------
// Agentic Token Economy + Lunar Infrastructure
// ---------------------------------------------------------------------------

export interface AgenticTokenEntry {
  id: string
  userId: string
  tokenType: "compute_credit" | "cognitive_royalty" | "tribal_pool" | "lunar_compute"
  amount: number
  direction: "earned" | "spent" | "staked" | "pooled" | "refunded"
  source?: string
  balanceAfter: number
}

export interface TribalComputePool {
  id: string
  poolName: string
  tribeId?: string
  contributorCount: number
  totalTokens: number
  infrastructure: "cloud" | "edge" | "lunar" | "photonic"
  status: "active" | "depleted" | "archived"
}

export interface LunarInfrastructureAsset {
  id: string
  assetType: "mass_driver" | "vacuum_fab" | "petawatt_node" | "tribal_satellite" | "compute_relay"
  assetName: string
  location: "lunar_surface" | "earth_orbit" | "lagrange_point" | "deep_space"
  operationalStatus: "planned" | "under_construction" | "operational" | "decommissioned"
  computeCapacityPflops?: number
  gravityTariffSavingsPct?: number
}

// ---------------------------------------------------------------------------
// TEACHER Codex + Hard-Tech + Xenobots + AI Moment
// ---------------------------------------------------------------------------

export interface TeacherClassroom {
  id: string
  teacherUserId: string
  classroomName: string
  studentCount: number
  aiChiefOfStaffConfig: { model?: string; autoGrading?: boolean; pathOptimization?: boolean }
  learningPathsActive: number
  passionDomainsDetected: string[]
  cognitiveRefundHours: number
  parentalBiosConfig: { ethicsLevel?: string; contentFilters?: string[]; forbiddenTopics?: string[] }
  edgeInferenceEnabled: boolean
}

export interface TeacherStudentProfile {
  id: string
  classroomId: string
  studentAlias: string
  humanAlphaIdentified?: string
  passionDomain?: string
  learningStyle?: "visual" | "auditory" | "kinesthetic" | "reading" | "multimodal"
  memoryPalace: { yearlySnapshots?: Array<{ age: number; breakthroughs: string[]; struggles: string[]; styleShifts?: string }> }
  proofOfBuilds: Array<{ title: string; verified: boolean; tradePath?: string }>
  tradePath?: "agentic_orchestrator" | "hybrid_artisan" | "sovereign_entrepreneur" | "silicon_collar" | "bio_architect"
  sovereigntyReadiness: number
}

export interface HardTechMilestone {
  id: string
  techDomain: "lithography" | "quantum" | "photonics" | "xenobots"
  milestoneName: string
  description: string
  impactOnEnergyTariff: number
  impactOnCognitiveYield: number
  siliconLineage: { fab?: string; nodeNm?: number; chipFamily?: string; euvGeneration?: string }
  availableVia?: string
}

export interface XenobotDeployment {
  id: string
  userId: string
  blueprintName: string
  targetEnvironment: string
  deploymentType: "environmental" | "medical" | "agricultural" | "research"
  cellCount: number
  selfDestructTimerDays: number
  status: "designing" | "culturing" | "deployed" | "active" | "self_destructed"
  bioEthicsCleared: boolean
}

export interface SovereignWaveTracker {
  userId: string
  currentWave: 1 | 2 | 3
  wave1Milestones: { chatUsed?: boolean; searchReplaced?: boolean }
  wave2Milestones: { agentDeployed?: boolean; mooresBlockSmashed?: boolean; tariffRefundClaimed?: boolean; durableWorkflowLaunched?: boolean }
  wave3Milestones: { edgeInferenceActive?: boolean; tribalMissionCompleted?: boolean; xenobotDeployed?: boolean; quantumOracleUsed?: boolean; sovereignArtifactOwned?: boolean }
  economicRefundTotalUsd: number
  cognitiveRefundHours: number
  agencyScore: number
  sovereigntyPercentage: number
}

// ---------------------------------------------------------------------------
// MITRE ATT&CK Immune System
// ---------------------------------------------------------------------------

export interface MitreTtpEntry {
  id: string
  tactic: string
  technique: string
  subtechnique?: string
  riskScore: number
  automatedDefenseStatus: "none" | "partial" | "full"
  counterAgentId?: string
  tribalIncidentCount: number
}

export interface RedTeamExercise {
  id: string
  userId: string
  exerciseName: string
  targetSystem: string
  ttpsTested: string[]
  findings: Array<{ ttpId: string; result: "blocked" | "detected" | "bypassed"; details: string; severity: string }>
  overallScore: number
  status: "running" | "completed" | "aborted"
}

export interface TribaThreatIntel {
  id: string
  mitreTtpId?: string
  threatType: "known_ttp" | "zero_day" | "anomaly" | "social_engineering"
  severity: string
  counterMeasure?: string
  humanAlphaRequired: boolean
  tribalAlertCount: number
}

export interface DefensePosture {
  userId: string
  overallScore: number
  ttpsCovered: number
  ttpsTotal: number
  autoHardenedCount: number
  manualReviewPending: number
  herdImmunityActive: boolean
}

// ---------------------------------------------------------------------------
// Critical Safeguards: 6 Failure Point Defenses
// ---------------------------------------------------------------------------

export interface LiabilityFirewallEvent {
  id: string
  userId: string
  agentSource: string
  actionType: "financial_transaction" | "contract_signing" | "data_sharing" | "api_call"
  riskTier: "low" | "medium" | "high" | "critical"
  estimatedValueUsd?: number
  humanAlphaRequired: boolean
  humanApproved?: boolean
  blocked: boolean
  blockReason?: string
}

export interface SovereignFailoverState {
  userId: string
  serviceName: string
  status: "healthy" | "degraded" | "offline" | "failover_active"
  lastHealthCheck: string
  failoverTarget?: string
  localMirrorStatus: "synced" | "stale" | "not_configured"
  dataFreshnessHours?: number
}

export interface TribalMission {
  id: string
  tribeId?: string
  missionName: string
  objective: string
  requiredParticipants: number
  currentParticipants: number
  status: "recruiting" | "active" | "completed" | "failed"
  difficulty: "moderate" | "hard" | "legendary"
  rewardType: "cognitive_royalty" | "tribal_honor" | "skill_unlock"
}

export interface AgenticQuarantineResult {
  id: string
  stakeId: string
  quarantineStatus: "pending" | "testing" | "passed" | "failed" | "banned"
  adversarialTestsRun: number
  vulnerabilitiesFound: Array<{ type: string; severity: string; description: string }>
  hiddenIntentDetected: boolean
  dataExfiltrationAttempt: boolean
  biasScore: number
}

export interface BiologicalHeartbeat {
  userId: string
  lastBiologicalSignal: string
  signalSource: "artifact_nfc" | "wearable" | "manual_checkin" | "app_activity"
  consecutiveMissedHours: number
  stewardshipModeActive: boolean
  thresholdHours: number
}

export interface PrimarySourceEntry {
  id: string
  userId: string
  sourceType: "interview" | "handwritten_note" | "physical_experiment" | "field_observation" | "original_research"
  title: string
  description: string
  verifiedNonDigital: boolean
  craftsmanRewardPoints: number
}

// ---------------------------------------------------------------------------
// Agent Lab: Cognitive Particle Accelerator + Persistent Agentic Memory
// ---------------------------------------------------------------------------

export interface AgentLabSandbox {
  id: string
  userId: string
  name: string
  forkedFrom?: string
  status: "active" | "paused" | "completed" | "archived"
  environmentConfig: { runtime?: string; model?: string; maxTokens?: number; shadowMode?: boolean }
  experimentLog: Array<{ timestamp: string; action: string; input: string; output: string; latencyMs: number; tokenCost: number }>
  resultsSummary?: Record<string, unknown>
  contributedToTribalGraph: boolean
}

export interface CognitiveStake {
  id: string
  creatorUserId: string
  stakeType: "prompt_chain" | "agent" | "workflow" | "dataset"
  title: string
  description: string
  domain?: string
  usageCount: number
  royaltyEarnedUsd: number
  rating: number
  ratingCount: number
  status: "active" | "deprecated" | "under_review"
  createdAt: string
}

export interface FailureLedgerEntry {
  id: string
  reportedBy: string
  agentType: string
  failureType: "hallucination" | "timeout" | "logic_error" | "api_failure" | "moores_block"
  promptChain?: string
  errorDetails: string
  errorRate?: number
  resolution?: string
  severity: "low" | "medium" | "high" | "critical"
  tribalAlertSent: boolean
  createdAt: string
}

export interface AgenticBreed {
  id: string
  parentAgentA: string
  parentAgentB: string
  hybridName: string
  hybridDescription: string
  domainA: string
  domainB: string
  mergedCapabilities: string[]
  performanceScore: number
  status: "experimental" | "validated" | "production" | "deprecated"
}

export interface TribalRlhfGrade {
  id: string
  graderUserId: string
  targetType: "agent_output" | "stake" | "breed" | "sandbox_result"
  targetId: string
  grade: "excellent" | "good" | "acceptable" | "poor" | "dangerous"
  judgmentNotes?: string
  criteria: { accuracy?: number; creativity?: number; safety?: number; efficiency?: number; humanAlphaPreserved?: boolean }
  graderExpertiseLevel?: "elder" | "expert" | "member" | "apprentice"
}

export interface EpisodicMemoryEntry {
  id: string
  userId: string
  agentId: string
  actionType: "read" | "write" | "analyze" | "decide" | "create" | "communicate"
  source?: string
  contentSummary: string
  importanceScore: number
  ttlDays?: number
  createdAt: string
}

export interface DurableWorkflow {
  id: string
  userId: string
  workflowName: string
  mission: string
  currentStep: number
  totalSteps?: number
  status: "running" | "paused" | "completed" | "failed" | "waiting_human"
  lastPulseAt?: string
  pulseIntervalHours: number
  nextAction?: string
  parentalGuardrails: { memoryRetentionDays?: number; forbiddenSources?: string[]; budgetLimitUsd?: number }
}

export interface LabAccelerationMetrics {
  cognitiveYield: number
  pivotVelocityDays?: number
  tariffReductionRate: number
  failureRefundsReceived: number
  stakesPublished: number
  stakesRoyaltiesUsd: number
  tribalLearningRate: number
}

// ---------------------------------------------------------------------------
// AI-Native: Agent Workflow States, Discovery Profiles, Lineage
// ---------------------------------------------------------------------------

export type WorkflowStatus = "running" | "paused" | "completed" | "failed" | "cancelled"
export type WorkflowType = "onboarding_discovery" | "tribe_formation" | "skill_audit" | "outreach_campaign" | "regret_review" | "custom"
export type WorkflowInitiator = "user" | "agent" | "cron" | "system"

export interface AgentWorkflowState {
  id: string
  ownerUserId: string
  workflowType: WorkflowType
  workflowName: string
  status: WorkflowStatus
  currentStep: string
  totalSteps: number
  completedSteps: number
  aiAgentId?: string
  aiModelUsed?: string
  personaId?: string
  context: Record<string, unknown>
  stepHistory: Array<{ step: string; result: unknown; timestamp: string }>
  pendingInput?: Record<string, unknown>
  initiatedBy: WorkflowInitiator
  validatedBy?: string
  validatedAt?: string
  validationNotes?: string
  startedAt: string
  pausedAt?: string
  completedAt?: string
  failedAt?: string
  errorMessage?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface HumanAlpha {
  uniqueStrengths: string[]
  domainExpertise: string[]
  decisionLayerSkills: string[]
  craftOrientation: string
}

export interface SuggestedWorkflow {
  name: string
  description: string
  tools: string[]
  estimatedTimeMultiplier: string
}

export interface CareerTrajectory {
  currentLayer: "execution" | "decision" | "design"
  targetLayer: string
  pivotRecommendations: string[]
}

export interface UserDiscoveryProfile {
  id: string
  userId: string
  humanAlpha: HumanAlpha
  suggestedWorkflows: SuggestedWorkflow[]
  careerTrajectory: CareerTrajectory
  engagementProfile: { passionSignals: string[]; curiosityIndex: number; domainFit: string }
  firstWorkflowId?: string
  firstWorkflowName?: string
  discoveryAgentId?: string
  discoveryModel?: string
  discoveryCompletedAt?: string
  rawInputs: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ToolAuditLineage {
  aiAgentId?: string
  aiModelUsed?: string
  personaId?: string
  validatedBy?: string
  validatedAt?: string
  workflowId?: string
  lineageChain: Array<{ actor: string; action: string; timestamp: string }>
}

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
  // Tribe Intelligence: High-Bandwidth Syndicate features
  tribeDoctrine?: "syndicate" | "enterprise" | "research" | "open"
  entryRequirements?: { proofOfAgency?: boolean; minBuildComplexity?: string }
  engagementThreshold?: number
  sharedResources?: { apiCredits?: Record<string, unknown>; datasets?: string[]; tools?: string[] }
  nextReviewDate?: string
  automationRiskAlerts?: Array<{ memberId: string; riskPercent: number; atRiskSkills: string[] }>
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
  // Tribe Intelligence: Force Multiplier tracking
  agencyScore?: number                   // 0-100, Proof of Agency rating
  portfolioUrl?: string                  // Link to AI-augmented build
  automationRiskPercent?: number         // How much of their role is automatable
  lastPassionAudit?: string              // ISO date of last engagement review
  skillDelta?: {
    currentSkills: string[]
    atRiskSkills: string[]
    recommendedSkills: string[]
    lastUpdated: string
  }
  sprintHistory?: string[]              // Sprint IDs participated in
  knowledgeContributions?: number       // Count of KB entries
}

// Tribe Intelligence: Knowledge Base entry
export interface TribeKnowledgeEntry {
  id: string
  tribeId: string
  contributedBy: string
  contentType: "insight" | "prompt_chain" | "workflow" | "case_study"
  title: string
  content: string
  tags: string[]
  toolChain?: { tools: string[]; params?: Record<string, unknown> }
  metrics?: { timeSaved?: string; errorRate?: number }
  upvotes: number
  createdAt: string
  updatedAt: string
}

// Tribe Intelligence: Signal Feed post
export interface TribeSignalPost {
  id: string
  tribeId: string
  authorId: string
  toolUsed: string
  taskDescription: string
  promptChain?: string
  resultSummary: string
  errorRate?: number
  timeSavedMinutes?: number
  validatedBy: string[]
  createdAt: string
}

// Tribe Intelligence: Micro-Squad Sprint
export interface TribeSprint {
  id: string
  tribeId: string
  name: string
  objective: string
  squadMemberIds: string[]
  status: "forming" | "active" | "completed" | "cancelled"
  durationHours: number
  skillRequirements: string[]
  outcomes?: Record<string, unknown>
  startedAt?: string
  completedAt?: string
  createdAt: string
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

// ---------------------------------------------------------------------------
// Component 1: Liquid Governance Protocol (Tribal Consensus)
// ---------------------------------------------------------------------------

export interface GovernanceProposal {
  id: string
  tribeId: string
  proposerUserId: string
  proposalType: "pivot" | "policy_change" | "resource_allocation" | "member_action" | "custom"
  title: string
  description: string
  evidenceIds: string[]
  quorumThreshold: number
  approvalThreshold: number
  status: "draft" | "open" | "voting" | "passed" | "rejected" | "executed" | "expired"
  executionPayload?: Record<string, unknown>
  voteSummary?: { totalPower: number; approvePower: number; rejectPower: number; abstainPower: number; voterCount: number }
  expiresAt?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface GovernanceVote {
  id: string
  proposalId: string
  voterUserId: string
  vote: "approve" | "reject" | "abstain"
  votingPower: number
  delegationFromUserId?: string
  reasoning?: string
  createdAt: string
}

export interface GovernanceDelegation {
  id: string
  delegatorUserId: string
  delegateUserId: string
  tribeId: string
  domain: "all" | "technical" | "financial" | "operational"
  isActive: boolean
  createdAt: string
  revokedAt?: string
}

export interface GovernanceExecutionLog {
  id: string
  proposalId: string
  executedBy: "system" | "ceo_agent" | "manual"
  executionResult: Record<string, unknown>
  errorMessage?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Component 6: Labor of Love Marketplace (Post-Work Economy)
// ---------------------------------------------------------------------------

export type MarketplaceListingType =
  | "philosophy_session"
  | "handcrafted_art"
  | "physical_mentorship"
  | "live_performance"
  | "culinary_experience"
  | "custom"

export interface MarketplaceListing {
  id: string
  sellerUserId: string
  tribeId?: string
  listingType: MarketplaceListingType
  title: string
  description: string
  deliveryMethod: "in_person" | "video_call" | "shipped_physical" | "hybrid"
  location?: string
  latitude?: number
  longitude?: number
  maxCapacity?: number
  priceTokens?: number
  priceUsd?: number
  fulfillmentYield: number
  authenticityProof?: { artifactVerified?: boolean; photoUrls?: string[]; videoUrl?: string }
  humanAlphaRequired?: string[]
  status: "draft" | "active" | "paused" | "sold_out" | "archived"
  avgRating?: number
  ratingCount: number
  createdAt: string
  updatedAt: string
}

export interface MarketplaceOrder {
  id: string
  listingId: string
  buyerUserId: string
  sellerUserId: string
  status: "pending" | "confirmed" | "in_progress" | "delivered" | "completed" | "disputed" | "refunded"
  paymentMethod: "tokens" | "usd" | "barter"
  amountTokens?: number
  amountUsd?: number
  fulfillmentDate?: string
  buyerFulfillmentYield?: number
  sellerFulfillmentYield?: number
  reviewText?: string
  rating?: number
  createdAt: string
  completedAt?: string
}

export interface FulfillmentYieldScore {
  userId: string
  totalExperiencesSold: number
  totalExperiencesBought: number
  avgSellerFulfillment: number
  avgBuyerFulfillment: number
  combinedFulfillmentYield: number
  topDomains: string[]
  lastActivityAt?: string
}

// ---------------------------------------------------------------------------
// Component 4: Barter Bot (Inter-Sovereign Trade)
// ---------------------------------------------------------------------------

export type TradeOfferType =
  | "energy_credits"
  | "compute_tokens"
  | "xenobot_blueprint"
  | "marketplace_listing"
  | "custom_asset"

export interface SovereignTradeOffer {
  id: string
  offererUserId: string
  offerType: TradeOfferType
  assetDescription: string
  quantity: number
  minAcceptableReturn?: { assetType: string; minQuantity: number }
  status: "open" | "in_negotiation" | "accepted" | "withdrawn" | "expired"
  visibility: "public" | "tribe_only" | "direct"
  targetUserId?: string
  targetTribeId?: string
  expiresAt?: string
  createdAt: string
}

export interface SovereignTradeSession {
  id: string
  offerId: string
  partyAUserId: string
  partyBUserId: string
  partyAAgentConfig: { walkAwayPoint?: number; priorities?: string[]; maxRounds?: number }
  partyBAgentConfig: { walkAwayPoint?: number; priorities?: string[]; maxRounds?: number }
  negotiationRounds: Array<{
    round: number
    partyAProposal: Record<string, unknown>
    partyBProposal: Record<string, unknown>
    status: "proposed" | "countered" | "accepted" | "rejected"
  }>
  currentRound: number
  maxRounds: number
  status: "initializing" | "negotiating" | "agreement_reached" | "failed" | "ratified" | "cancelled"
  agreedTerms?: Record<string, unknown>
  sandboxSecurityLog?: Record<string, unknown>
  governanceRatificationId?: string
  createdAt: string
  completedAt?: string
}

export interface SovereignTradeEscrow {
  id: string
  tradeSessionId: string
  depositorUserId: string
  assetType: string
  amount: number
  status: "held" | "released" | "returned" | "disputed"
  releasedToUserId?: string
  createdAt: string
  releasedAt?: string
}

// ---------------------------------------------------------------------------
// Component 5: Authenticity Oracle (Anti-Deepfake Protocol)
// ---------------------------------------------------------------------------

export type AttestationMethod = "artifact_nfc" | "wearable_confirmed" | "manual_oath" | "ai_verified"

export interface AuthenticityAttestation {
  id: string
  creatorUserId: string
  contentType: "text" | "image" | "video" | "audio" | "data" | "code"
  contentHash: string
  artifactSignature?: string
  biologicalSignal?: { signalHash: string; signalSource: string; timestamp: string }
  c2paManifestId?: string
  attestationMethod: AttestationMethod
  trustChain: string[]
  verificationCount: number
  disputeCount: number
  status: "pending" | "verified" | "disputed" | "revoked"
  createdAt: string
}

export interface AuthenticityChallenge {
  id: string
  attestationId: string
  challengerUserId: string
  challengeType: "deepfake_suspected" | "provenance_mismatch" | "signature_invalid" | "plagiarism"
  evidence: string
  status: "open" | "investigating" | "upheld" | "dismissed"
  ccoAgentAnalysis?: Record<string, unknown>
  resolutionNote?: string
  resolvedAt?: string
  createdAt: string
}

export interface BiologicalHeartbeatEntry {
  id: string
  userId: string
  signalSource: "artifact_nfc" | "wearable" | "app_activity" | "manual_checkin"
  signalHash: string
  deviceId?: string
  isValid: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Component 3: Deep Space Latency Buffer (Lunar Sync)
// ---------------------------------------------------------------------------

export type BufferOperationType =
  | "workflow_step"
  | "vote"
  | "trade_round"
  | "attestation"
  | "heartbeat"
  | "marketplace_action"

export interface LatencyBufferEntry {
  id: string
  userId: string
  operationType: BufferOperationType
  payload: Record<string, unknown>
  targetTable: string
  priority: number
  status: "queued" | "syncing" | "synced" | "conflict" | "failed"
  createdOfflineAt: string
  syncedAt?: string
  conflictResolution?: Record<string, unknown>
  retryCount: number
  maxRetries: number
}

export interface ShadowStateSnapshot {
  id: string
  userId: string
  stateType: "workflow" | "governance" | "trade" | "token_balance"
  stateKey: string
  snapshotData: Record<string, unknown>
  version: number
  isStale: boolean
  sourceUpdatedAt: string
  snapshotAt: string
}

export interface SyncConflict {
  id: string
  bufferQueueId: string
  userId: string
  conflictType: "version_mismatch" | "concurrent_edit" | "state_divergence"
  localState: Record<string, unknown>
  remoteState: Record<string, unknown>
  resolution: "local_wins" | "remote_wins" | "merged" | "manual"
  resolvedAt?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Component 2: Spatial Cockpit (AR/Vision Interface)
// ---------------------------------------------------------------------------

export type XRSessionMode = "inline" | "immersive-vr" | "immersive-ar"
export type XRProjectionType = "globe" | "dashboard_hud" | "workflow_timeline" | "trade_board" | "governance_vote"

export interface SpatialCockpitConfig {
  sessionMode: XRSessionMode
  activeProjections: XRProjectionType[]
  globeScale: number
  hudPosition: "left" | "right" | "center"
  handTrackingEnabled: boolean
  voiceCommandsEnabled: boolean
  passthrough: boolean
}

export interface XRProjection {
  type: XRProjectionType
  dataSource: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: number
  opacity: number
}

// ---------------------------------------------------------------------------
// Component A2A: Inter-Tribe Agent Intelligence Exchange
// ---------------------------------------------------------------------------

export interface A2AAgentCard {
  id: string
  ownerUserId: string
  agentDefinitionId?: string
  displayName: string
  capabilities: string[]
  pricingTokensPerTask: number
  availability: "available" | "busy" | "offline"
  trustScoreMinimum: number
  maxConcurrentTasks: number
  totalTasksCompleted: number
  avgRating?: number
  createdAt: string
  updatedAt: string
}

export interface A2AHandshake {
  id: string
  requesterUserId: string
  providerUserId: string
  requesterAgentId?: string
  providerAgentCardId: string
  taskDescription: string
  taskPayload?: Record<string, unknown>
  agreedPriceTokens?: number
  status: "requested" | "accepted" | "in_progress" | "completed" | "failed" | "rejected" | "cancelled"
  escrowId?: string
  resultPayload?: Record<string, unknown>
  qualityRating?: number
  requesterFeedback?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
}

export interface A2AMessage {
  id: string
  handshakeId: string
  sender: "requester_agent" | "provider_agent" | "system"
  messageType: "task_clarification" | "progress_update" | "result_delivery" | "error_report"
  payload: Record<string, unknown>
  createdAt: string
}

// ---------------------------------------------------------------------------
// Echoes of Experience Archive (Mentor Ledger)
// ---------------------------------------------------------------------------

export type ExperienceEntryType =
  | "moores_block_overcome"
  | "launch_win"
  | "career_pivot"
  | "technical_breakthrough"
  | "leadership_lesson"
  | "failure_postmortem"

export interface ExperienceEntry {
  id: string
  authorUserId: string
  tribeId?: string
  entryType: ExperienceEntryType
  title: string
  narrative: string
  hardWonAdvice?: string
  contextTags: string[]
  difficultyLevel: "beginner" | "intermediate" | "advanced" | "expert"
  verificationCount: number
  upvoteCount: number
  isArchived: boolean
  attestationId?: string
  createdAt: string
  updatedAt: string
}

export interface ExperienceEndorsement {
  id: string
  experienceId: string
  endorserUserId: string
  endorsementType: "verified_witnessed" | "valuable_advice" | "applied_successfully"
  comment?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Handcuff Cutter (Decoupling Suite)
// ---------------------------------------------------------------------------

export interface DecouplingAudit {
  id: string
  userId: string
  currentSalaryUsd: number
  vestingSchedule: Array<{ grantDate: string; vestDate: string; amount: number; vestedPct: number }>
  benefitsValueUsd: number
  stockOptionsValueUsd: number
  totalHandcuffValueUsd: number
  sovereigntyIncomeUsd: number
  breakevenMonths?: number
  sovereignIncomeSources: Array<{ source: string; monthlyUsd: number; growthRate: number }>
  recommendedExitDate?: string
  confidenceScore: number
  sixMonthPlan: Array<{ month: number; milestone: string; incomeTarget: number; actions: string[] }>
  status: "draft" | "active" | "on_track" | "achieved" | "paused"
  createdAt: string
  updatedAt: string
}

export interface DecouplingMilestone {
  id: string
  auditId: string
  userId: string
  monthNumber: number
  milestoneDescription?: string
  incomeTargetUsd?: number
  actualIncomeUsd?: number
  actionsCompleted: string[]
  status: "pending" | "in_progress" | "achieved" | "missed"
  dueDate?: string
  completedAt?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Bounty Hunter (External Market Submission Pipeline)
// ---------------------------------------------------------------------------

export type BountySourcePlatform = "devto" | "notion" | "github" | "producthunt" | "custom"

export interface BountyOpportunity {
  id: string
  discoveredBy: "system" | "user" | "agent"
  sourcePlatform?: BountySourcePlatform
  sourceUrl?: string
  title: string
  description?: string
  prizeDescription?: string
  prizeValueUsd?: number
  deadline?: string
  requiredSkills: string[]
  matchingFactoryBuilds: string[]
  matchConfidence: number
  status: "discovered" | "evaluating" | "targeting" | "submitted" | "won" | "lost" | "expired"
  createdAt: string
  updatedAt: string
}

export interface BountySubmission {
  id: string
  opportunityId: string
  submitterUserId: string
  factoryBuildId?: string
  submissionUrl?: string
  documentationGenerated?: { readme?: string; demoVideo?: string; architectureDiagram?: string }
  packagingStatus: "drafting" | "packaged" | "submitted" | "accepted" | "revision_requested"
  submissionDate?: string
  result: "pending" | "shortlisted" | "winner" | "runner_up" | "not_selected"
  prizeEarnedUsd?: number
  tokenReward?: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Recursive Self-Improvement: Intelligence Explosion Infrastructure
// ---------------------------------------------------------------------------

export interface IntelligenceTariffAudit {
  id: string
  userId: string
  taskDomain: string
  frontierModel: string
  frontierCostPerTaskUsd: number
  frontierAccuracyPct: number
  localModel?: string
  localAccuracyPct: number
  parityThresholdPct: number
  trainingDataSize: number
  fineTuneStatus: "pending" | "generating_data" | "training" | "evaluating" | "deployed" | "failed"
  monthlySavingsUsd: number
  isReplacementActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentHarnessEvolution {
  id: string
  agentDefinitionId?: string
  userId: string
  evolutionType: "performance_optimization" | "error_fix" | "capability_expansion" | "cost_reduction"
  triggerSource?: "failure_pattern" | "benchmark_regression" | "cost_spike" | "schedule"
  diagnosis?: string
  proposedFix?: string
  experimentBranch?: string
  beforeMetrics: Record<string, unknown>
  afterMetrics: Record<string, unknown>
  improvementPct?: number
  status: "diagnosed" | "experimenting" | "validated" | "merged" | "rejected"
  autoMerged: boolean
  createdAt: string
}

export interface TribalAutoResearchCampaign {
  id: string
  tribeId: string
  initiatorUserId: string
  researchGoal: string
  hypothesis?: string
  experimentSpec: Record<string, unknown>
  participantCount: number
  maxParticipants: number
  status: "recruiting" | "running" | "collecting" | "analyzing" | "completed" | "cancelled"
  winningExperimentId?: string
  resultsSummary?: Record<string, unknown>
  totalComputeTokensSpent: number
  breakthroughAchieved: boolean
  createdAt: string
  updatedAt: string
}

export interface AutoResearchExperiment {
  id: string
  campaignId: string
  participantUserId: string
  agentSandboxId?: string
  experimentConfig: Record<string, unknown>
  resultMetrics: Record<string, unknown>
  score?: number
  isWinner: boolean
  computeTokensUsed: number
  gitCommitHash?: string
  status: "queued" | "running" | "completed" | "failed"
  createdAt: string
  completedAt?: string
}

// ---------------------------------------------------------------------------
// Project SherLog: Forensic Intelligence Pipeline
// ---------------------------------------------------------------------------

export interface MalwareArtifact {
  id: string
  reporterUserId: string
  artifactType: "screenshot" | "process_log" | "browser_history" | "sysinfo" | "installer_binary"
  storageRef?: string
  rawData: Record<string, unknown>
  fileHashSha256?: string
  sourceDescription?: string
  classification: "web_lure" | "file_lure" | "hybrid" | "unknown"
  infectionStatus: "suspected" | "confirmed" | "benign" | "false_positive"
  relatedIncidentId?: string
  createdAt: string
}

export interface ForensicNarrative {
  id: string
  artifactId: string
  analystUserId: string
  layer1Visual: {
    sceneDescription?: string
    contentClass?: "web" | "file" | "hybrid"
    visibleUrls?: string[]
    visibleFilenames?: string[]
    browserTabs?: string[]
    confidence?: number
  }
  layer2Vector: {
    infectionVector?: string
    theme?: string
    iocStatus?: "live" | "dead" | "unknown"
    correlatedProcesses?: string[]
    riskAssessment?: string
    narrative?: string
  }
  combinedNarrative?: string
  iocsExtracted: Array<{ type: string; value: string; confidence: number; status: "live" | "dead" | "unknown" }>
  threatActorProfile?: Record<string, unknown>
  timeToAnalysisSeconds?: number
  status: "analyzing" | "complete" | "needs_review" | "disputed"
  createdAt: string
}

export interface TribalHerdImmunityEntry {
  id: string
  sourceNarrativeId?: string
  iocType: "url" | "domain" | "ip" | "file_hash" | "ad_id" | "installer_name"
  iocValue: string
  threatCategory: "infostealer" | "ransomware" | "phishing" | "cryptominer" | "rat" | "custom"
  severity: "low" | "medium" | "high" | "critical"
  reportedByCount: number
  firstSeenAt: string
  lastSeenAt: string
  isActive: boolean
  tribalPropagationCount: number
  createdAt: string
}

export interface SandboxDetonation {
  id: string
  submittedByUserId: string
  lureUrl: string
  lureType: "youtube_redirect" | "mega_download" | "google_ad" | "sponsored_link" | "direct_download" | "custom"
  detonationEnvironment: string
  status: "queued" | "detonating" | "analyzing" | "complete" | "failed"
  resultVerdict?: "clean" | "suspicious" | "malicious" | "inconclusive"
  artifactsCollected: string[]
  networkIocs: Array<{ type: string; value: string }>
  behaviorSummary?: string
  detonationDurationSeconds?: number
  createdAt: string
  completedAt?: string
}

// ---------------------------------------------------------------------------
// LeWorldModel: Latent Physics Engine
// ---------------------------------------------------------------------------

export type WorldModelEnvironment = "neo_lab" | "sovereign_vehicle" | "home" | "office" | "factory_floor" | "custom"

export interface WorldModel {
  id: string
  ownerUserId: string
  modelName: string
  environmentType: WorldModelEnvironment
  parameterCount: number
  latentDim: number
  gaussianPrior: Record<string, unknown>
  trainingStatus: "untrained" | "collecting_data" | "training" | "evaluating" | "deployed" | "failed"
  trainingDataFrames: number
  trainingHours: number
  hardwareUsed?: string
  accuracyPct?: number
  surpriseThreshold: number
  deployedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ImaginarySimulation {
  id: string
  worldModelId: string
  userId: string
  goalDescription: string
  terminalState?: Record<string, unknown>
  numRollouts: number
  bestTrajectoryCost?: number
  planningTimeMs?: number
  speedupFactor?: number
  selectedActionSequence: Record<string, unknown>[]
  status: "planned" | "simulating" | "complete" | "executed" | "abandoned"
  createdAt: string
}

export type SurpriseEventType = "object_teleport" | "color_change" | "physics_violation" | "trajectory_divergence" | "sensor_anomaly" | "deepfake_detected"

export interface SurpriseEvent {
  id: string
  worldModelId: string
  userId: string
  eventType: SurpriseEventType
  predictedState?: Record<string, unknown>
  actualState?: Record<string, unknown>
  surpriseDelta: number
  severity: "low" | "medium" | "high" | "critical"
  autoResponse: "logged" | "alert_sent" | "actuators_frozen" | "sentinel_triggered"
  relatedIncidentId?: string
  createdAt: string
}

export interface LatentProbe {
  id: string
  worldModelId: string
  userId: string
  probeType: "position" | "orientation" | "velocity" | "temperature" | "pressure" | "custom"
  probeLabel?: string
  extractedValue: { value: unknown; unit?: string; confidence?: number; latentCoords?: number[] }
  groundTruthValue?: Record<string, unknown>
  accuracyPct?: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Pacific Rim Shield: Agentic Immunity
// ---------------------------------------------------------------------------

export interface TrafficEntropyEntry {
  id: string
  userId: string
  sourceIp?: string
  portDistribution: Record<string, unknown>
  timingPattern: Record<string, unknown>
  entropyScore: number
  isAnomalous: boolean
  anomalyType: "covert_channel" | "coded_instructions" | "timing_attack" | "normal"
  relatedSurpriseEventId?: string
  analyzedPackets: number
  analysisWindowSeconds: number
  createdAt: string
}

export interface AdversaryStylometry {
  id: string
  analystUserId: string
  profileName: string
  stylometricFeatures: {
    handles?: string[]
    slangPatterns?: string[]
    culturalReferences?: string[]
    passwordThemes?: string[]
    codingStyle?: string
    operationalTempo?: string
  }
  confidenceScore: number
  linkedNarrativeIds: string[]
  linkedTtpIds: string[]
  threatActorGroup?: string
  status: "draft" | "active" | "confirmed" | "archived"
  createdAt: string
  updatedAt: string
}

export interface DeviceLifecycleState {
  id: string
  userId: string
  deviceId: string
  deviceType: "server" | "firewall" | "router" | "vehicle" | "smr" | "iot_sensor" | "one_charge" | "custom"
  lastHeartbeatAt?: string
  heartbeatSource?: "artifact_nfc" | "wearable" | "network_ping" | "manual"
  consecutiveMissedDays: number
  lifecycleStatus: "active" | "warning" | "zombie" | "culled" | "decommissioned"
  cullThresholdDays: number
  autoCullEnabled: boolean
  cullExecutedAt?: string
  createdAt: string
}

export interface BiometricEncryptionGate {
  id: string
  userId: string
  dataLabel: string
  dataClassification: "public" | "internal" | "sensitive" | "critical" | "sovereign"
  artifactId?: string
  encryptionMethod: "artifact_proximity" | "biometric_confirm" | "dual_key" | "sovereign_enclave"
  lastAccessAt?: string
  accessCount: number
  breachAttempts: number
  status: "active" | "locked" | "revoked"
  createdAt: string
}

// ---------------------------------------------------------------------------
// Interplanetary Pipeline: NASA Ignition & SR1 Freedom
// ---------------------------------------------------------------------------

export interface DeregulatedPolicyEntry {
  id: string
  userId: string
  policySection: string
  originalRegulation?: string
  deregulationStatus: "identified" | "analyzed" | "automated" | "executed" | "archived"
  executionPath: Record<string, unknown>
  complianceAgentId?: string
  timeSavedHours: number
  costSavedUsd: number
  createdAt: string
  updatedAt: string
}

export interface LunarBuildPhase {
  id: string
  userId: string
  phase: "experimentation" | "infrastructure" | "permanence"
  missionName: string
  stakedTokens: number
  contributionType?: "compute" | "design" | "engineering" | "science" | "logistics"
  deliverableDescription?: string
  status: "proposed" | "funded" | "in_progress" | "delivered" | "verified"
  verificationProof?: Record<string, unknown>
  cosmicEquityPct: number
  createdAt: string
}

export interface FissionPowerTelemetry {
  id: string
  userId: string
  sourceType: "sr1_freedom" | "tribal_smr" | "lunar_rtg" | "orbital_relay"
  powerOutputKw?: number
  thermalEfficiencyPct?: number
  fuelRemainingPct?: number
  uptimeHours: number
  telemetryData: Record<string, unknown>
  alertLevel: "nominal" | "advisory" | "caution" | "warning" | "critical"
  lastSyncAt?: string
  createdAt: string
}

export interface SupplyChainMonitor {
  id: string
  userId: string
  vendorName: string
  contractDescription?: string
  criticalPathItem?: string
  scheduledDeliveryDate?: string
  projectedDeliveryDate?: string
  slippageDays: number
  status: "on_track" | "at_risk" | "slipping" | "blocked" | "resolved" | "bypassed"
  uncomfortableActionTriggered: boolean
  reallocationTarget?: string
  resolutionNotes?: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Recursive Meta-Agent: Agent #0 (Tools #150-155)
// ---------------------------------------------------------------------------

export type MutationType = "optimization" | "refactor" | "distillation" | "security_hardening" | "alignment_shift"

export interface EvolutionLog {
  id: string
  userId: string
  agentId?: string
  toolName?: string
  mutationType: MutationType
  beforeState: Record<string, unknown>
  afterState: Record<string, unknown>
  improvementPct?: number
  energyDeltaKwh?: number
  tokenDelta?: number
  autoApplied: boolean
  approvedByChairman?: boolean
  createdAt: string
}

export interface PerformanceMutation {
  id: string
  userId: string
  toolName: string
  metricName: "latency_ms" | "token_count" | "energy_kwh" | "error_rate" | "accuracy_pct"
  beforeValue: number
  afterValue: number
  improvementPct: number
  mutationSource: "meta_agent" | "tribal_sync" | "manual" | "auto_research"
  appliedAt?: string
  reverted: boolean
  createdAt: string
}

export interface TribalDnaEntry {
  id: string
  contributorUserId: string
  campaignId?: string
  commitHash?: string
  optimizationDomain: string
  description?: string
  improvementPct?: number
  adoptionCount: number
  tribalRewardTokens: number
  status: "submitted" | "verified" | "adopted" | "superseded" | "rejected"
  createdAt: string
}

export interface ChairmanAlignmentVector {
  userId: string
  dimension: string
  weight: number
  lastCalibratedFrom?: "veto" | "approval" | "explicit_direction" | "behavioral_inference"
  calibrationCount: number
  createdAt: string
  updatedAt: string
}

export interface EvolutionSummary {
  totalEvolutions: number
  avgImprovementPct: number
  totalEnergySavedKwh: number
  totalTokensSaved: number
  topMutatedTools: Array<{ toolName: string; mutationCount: number }>
  alignmentVector: Record<string, number>
}

// ---------------------------------------------------------------------------
// Invisible Infrastructure: MolmoWeb Vision + WebAssembly Sandbox
// ---------------------------------------------------------------------------

export interface WasmArtifact {
  id: string
  userId: string
  artifactName: string
  intentDescription?: string
  wasmBinaryHash?: string
  sourceToolName?: string
  sandboxStatus: "provisioned" | "running" | "completed" | "vaporized" | "failed"
  isolationLevel: "strict" | "permissive" | "quarantine"
  memoryLimitMb: number
  executionTimeMs?: number
  vantaCompliant: boolean
  sentryTested: boolean
  createdAt: string
  completedAt?: string
}

export interface VisualWebLog {
  id: string
  userId: string
  sessionName?: string
  targetUrl?: string
  navigationSteps: Array<{ step: number; action: string; element?: string; url?: string }>
  semanticSnapshots: Array<{ timestamp: string; description: string; elements: string[] }>
  elementsInteracted: number
  modelUsed: string
  hardwareNode?: string
  processingTimeMs?: number
  status: "active" | "completed" | "failed" | "archived"
  createdAt: string
}

export interface ConsultantBlueprint {
  id: string
  creatorUserId: string
  blueprintName: string
  expertiseDomain: string
  description?: string
  skillDefinition: Record<string, unknown>
  hourlyRateEquivalentUsd: number
  usageCount: number
  avgRating?: number
  tribalVerified: boolean
  status: "draft" | "published" | "verified" | "deprecated"
  createdAt: string
  updatedAt: string
}

export interface ObservabilityRefundEntry {
  id: string
  userId: string
  sourceSystem: string
  originalDataVolumeMb: number
  sanitizedDataVolumeMb: number
  reductionPct: number
  garbageCategoriesPruned: string[]
  vendorCostBeforeUsd?: number
  vendorCostAfterUsd?: number
  monthlySavingsUsd?: number
  sanitizationRulesApplied: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Diplomatic Integrity: Proxy Influence Auditing & Handshake Sovereignty
// ---------------------------------------------------------------------------

export interface ProxyInfluenceAudit {
  id: string
  analystUserId: string
  subjectName: string
  relationshipType: string
  externalFinancialIncentives: Array<{ source: string; amountUsd?: number; description?: string }>
  biasIndicators: Record<string, unknown>
  influenceScore: number
  riskLevel: "low" | "medium" | "high" | "critical"
  linkedEntity?: string
  linkedCountry?: string
  verificationStatus: "pending" | "investigating" | "verified_clean" | "verified_compromised" | "archived"
  evidenceRefs: string[]
  createdAt: string
  updatedAt: string
}

export interface DiplomaticLureReview {
  id: string
  reviewerUserId: string
  lureLabel: string
  lureType: "document" | "meeting_request" | "introduction" | "proposal" | "letter" | "gift" | "invitation"
  claimedIntent?: string
  semanticValidityScore: number
  proofOfBuildPresent: boolean
  proofDetails: Record<string, unknown>
  sourceEntity?: string
  sourceCountry?: string
  verdict: "unreviewed" | "legitimate" | "suspicious" | "confirmed_lure" | "rejected"
  timeSavedMinutes: number
  createdAt: string
}

export interface DiplomaticRefundEntry {
  id: string
  userId: string
  incidentLabel: string
  timeLostMinutes: number
  reputationalCostScore: number
  financialExposureUsd: number
  rootCause?: string
  proxyAuditId?: string
  lureId?: string
  refundStatus: "calculated" | "acknowledged" | "mitigated" | "closed"
  lessonsLearned?: string
  createdAt: string
}

export interface HandshakeSovereigntyGate {
  id: string
  userId: string
  sessionLabel: string
  participants: Array<{ name: string; role?: string; verified?: boolean }>
  artifactVerified: boolean
  artifactId?: string
  biometricPulseConfirmed: boolean
  stakesLevel: "standard" | "elevated" | "high" | "critical" | "sovereign"
  sovereigntyScore: number
  sessionStatus: "pending" | "verified" | "in_progress" | "completed" | "rejected" | "escalated"
  startedAt?: string
  completedAt?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Blockade Bypass: Vendor Openness & Sovereign MCP Infrastructure
// ---------------------------------------------------------------------------

export interface VendorOpennessAudit {
  id: string
  userId: string
  vendorName: string
  productName: string
  apiAvailability: "full" | "partial" | "read_only" | "none" | "deprecated"
  mcpSupport: boolean
  rateLimitHitsMonthly: number
  monthlyCostUsd: number
  frictionScore: number
  lockInTariffUsd: number
  bypassMethod?: "api" | "visual" | "mcp_local" | "hybrid" | "none"
  bypassSuccessRate: number
  lastAuditAt: string
  createdAt: string
  updatedAt: string
}

export interface SovereignMcpNode {
  id: string
  userId: string
  nodeName: string
  hardwareType: "one_charge" | "lambda" | "cloud" | "edge" | "sovereign_stone" | "custom"
  endpointUrl?: string
  connectedApps: string[]
  uptimePct: number
  requestsServed: number
  lastHealthCheckAt?: string
  status: "provisioning" | "online" | "degraded" | "offline" | "decommissioned"
  createdAt: string
  updatedAt: string
}

export interface VisualBypassBlueprint {
  id: string
  creatorUserId: string
  targetApp: string
  targetWorkflow: string
  interactionBlueprint: Array<{ step: number; action: string; selector?: string; description?: string }>
  stepsCount: number
  successRate: number
  avgExecutionTimeMs: number
  modelUsed: string
  tribalShared: boolean
  usageCount: number
  status: "draft" | "tested" | "verified" | "deprecated"
  createdAt: string
  updatedAt: string
}

export interface AgenticIntentCert {
  id: string
  userId: string
  agentName: string
  intentDescription: string
  biometricPulseHash?: string
  artifactId?: string
  certificationLevel: "standard" | "verified" | "sovereign" | "tribal_broadcast"
  isCertified: boolean
  outgoingTarget?: string
  expiresAt?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Forensic Accountability: Justice Tariff Refund & Network Hygiene
// ---------------------------------------------------------------------------

export interface AccountabilityGapAudit {
  id: string
  analystUserId: string
  subjectLabel: string
  gapType: "prosecution_stall" | "regulatory_capture" | "institutional_latency" | "evidence_suppression" | "jurisdictional_void" | "whistleblower_retaliation"
  institutionalBody?: string
  evidenceSources: string[]
  severityScore: number
  estimatedDelayYears: number
  financialExposureUsd: number
  linkedProxyAuditId?: string
  status: "identified" | "investigating" | "documented" | "escalated" | "resolved" | "archived"
  createdAt: string
  updatedAt: string
}

export interface EconomicSanctionEntry {
  id: string
  enforcerUserId: string
  targetNodeLabel: string
  sanctionType: "token_freeze" | "compute_revoke" | "tribal_exclusion" | "staking_suspend" | "full_lockout"
  reason: string
  linkedProxyAuditId?: string
  linkedAccountabilityId?: string
  frozenTokenAmount: number
  sanctionStatus: "pending" | "active" | "appealed" | "lifted" | "permanent"
  appealDeadlineAt?: string
  enforcedAt?: string
  liftedAt?: string
  createdAt: string
}

export interface HiddenNarrativeReconstruction {
  id: string
  analystUserId: string
  datasetLabel: string
  originalRedactionPct: number
  reconstructionConfidence: number
  predictedEntities: Array<{ name: string; role?: string; confidence?: number }>
  predictedConnections: Array<{ from: string; to: string; relationship?: string }>
  predictedTimeline: Array<{ date: string; event: string; confidence?: number }>
  lewmModelUsed: string
  verificationStatus: "draft" | "low_confidence" | "medium_confidence" | "high_confidence" | "verified" | "retracted"
  createdAt: string
  updatedAt: string
}

export interface NetworkHygieneReport {
  id: string
  userId: string
  networkSize: number
  highRiskNodes: number
  mediumRiskNodes: number
  lowRiskNodes: number
  riskCategories: Record<string, number>
  separationDegreesToRisk: number
  humanAlphaImpactScore: number
  recommendations: string[]
  reportStatus: "generated" | "reviewed" | "actioned" | "archived"
  createdAt: string
}

// ---------------------------------------------------------------------------
// Morpheus Protocol: Biometric Sovereignty & Vibe-Hardened Security
// ---------------------------------------------------------------------------

export interface BiometricMaskingSession {
  id: string; userId: string
  maskingType: "iris" | "facial" | "gait" | "voice" | "fingerprint" | "multi_modal"
  threatSource?: string; frequencyBand?: string
  maskingMethod: "adversarial_glint" | "noise_injection" | "pattern_disruption" | "frequency_shift" | "holographic"
  effectivenessScore: number; durationMinutes: number; hardwareUsed?: string
  status: "active" | "completed" | "failed" | "archived"; createdAt: string
}

export interface EthicalDeadlockResolution {
  id: string; userId: string; scenarioLabel: string
  redFlagType: "violence" | "self_harm" | "exploitation" | "fraud" | "terrorism" | "other"
  tribalEthicalCodeRef?: string; actionTaken: string; resolutionTimeMs: number
  escalatedToHuman: boolean; humanOverrideApplied: boolean
  outcome: "resolved" | "escalated" | "overridden" | "logged_only" | "false_positive"
  createdAt: string
}

export interface VibeCodeSecurityAudit {
  id: string; userId: string; codebaseLabel: string; scanEngine: string
  totalFilesScanned: number; highSeverityCount: number; mediumSeverityCount: number
  lowSeverityCount: number; autoFixedCount: number
  vulnerabilities: Array<{ id: string; severity: string; description: string; file?: string; fixed?: boolean }>
  scanDurationSeconds: number; passed: boolean; createdAt: string
}

export interface SolidStatePowerConfig {
  id: string; userId: string; deviceLabel: string
  batteryType: "solid_state" | "donut_labs" | "sodium_ion" | "graphene" | "lithium_solid" | "experimental"
  capacityKwh: number; chargeTimeMinutes: number
  coolingMethod: "air" | "liquid" | "passive" | "phase_change" | "cryogenic"
  weightReductionKg: number; runtimeHours: number; targetDevice?: string
  operationalStatus: "configured" | "charging" | "operational" | "degraded" | "replaced"
  createdAt: string
}
