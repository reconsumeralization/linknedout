export type SentinelTransport = "mcp" | "realtime-tools" | "chat"

export type SentinelRiskLevel = "low" | "medium" | "high" | "critical"
export type SentinelMode = "shadow" | "soft" | "enforce"
export type SentinelThreatCategory =
  | "instruction_override"
  | "policy_bypass"
  | "prompt_exfiltration"
  | "credential_exfiltration"
  | "role_impersonation"
  | "ssrf"
  | "shell_injection"
  | "encoded_payload"
  | "obfuscation"
  | "other"

export type SentinelThreatCategoryCounts = Record<SentinelThreatCategory, number>

export interface SentinelPolicySnapshot {
  mode: SentinelMode
  vetoEnabled: boolean
  vetoThreshold: number
  alertThreshold: number
}

export interface C2PAManifest {
  manifestId: string
  generatedAt: string
  toolName: string
  transport: SentinelTransport
  argHash: string
  parentHash: string | null
  actorId: string
  sessionId: string | null
  riskScore: number
  riskLevel: SentinelRiskLevel
  vetoed: boolean
  injectionMatches: string[]
  credentialAccessDetected: boolean
  manifestHash: string
}

export interface ThreatSignature {
  id: string
  name: string
  patternSource: string
  hitCount: number
  lastSeenAt: string | null
  severity: SentinelRiskLevel
  category: SentinelThreatCategory
  dismissed: boolean
  dismissedAt: string | null
}

export interface SentinelActivityEvent {
  id: string
  toolName: string
  transport: SentinelTransport
  status: "allowed" | "blocked" | "failed" | "vetoed"
  riskScore: number
  riskLevel: SentinelRiskLevel
  injectionMatches: string[]
  credentialAccessDetected: boolean
  actorId: string
  sessionId: string | null
  argHash: string | null
  manifestId: string | null
  manifestHash: string | null
  parentHash: string | null
  vetoed: boolean
  createdAt: string
  argPreview: string | null
  blockedReason: string | null
  errorMessage: string | null
  criticalWorkflowClass: "none" | "destructive" | "egress"
  verificationRequired: boolean
  verificationState: "not_required" | "pending" | "passed" | "failed"
  verificationTargetTool: string | null
  verificationSubject: string | null
  verificationDueAt: string | null
  verificationCheckedAt: string | null
  egressPayloadBytes: number | null
  egressAttachmentCount: number | null
  egressThreadMessageCount: number | null
  egressShapeApprovalRequired: boolean
}

export interface SentinelApprovalItem {
  id: string
  toolName: string
  transport: SentinelTransport
  actorId: string
  riskScore: number
  riskLevel: SentinelRiskLevel
  argPreview: string | null
  manifestId: string | null
  status: "pending" | "approved" | "rejected" | "expired"
  requestedAt: string
  resolvedAt: string | null
  resolverNote: string | null
}

export type SentinelIncidentSeverity = SentinelRiskLevel
export type SentinelIncidentStatus = "open" | "investigating" | "contained" | "resolved"

export interface SentinelIncident {
  id: string
  sourceEventId: string | null
  title: string
  summary: string | null
  severity: SentinelIncidentSeverity
  status: SentinelIncidentStatus
  detectedAt: string
  containmentStartedAt: string | null
  containedAt: string | null
  resolvedAt: string | null
  impactedRoutes: string[]
  impactedFeatures: string[]
  impactedUsersEstimate: number | null
  estimatedRevenueImpactUsd: number | null
  blastRadius: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface SentinelResilienceKpis {
  observationWindowHours: number
  sessionsObserved: number
  sessionsWithDetection: number
  sessionsWithContainment: number
  mttdMinutes: number | null
  mttcMinutes: number | null
  meanApprovalResolutionMinutes: number | null
  unresolvedHighRiskEvents: number
  openIncidents: number
  criticalVerificationRequired: number
  criticalVerificationPassed: number
  criticalVerificationFailed: number
  criticalVerificationPending: number
  criticalVerificationMissed: number
  taskRealityMismatchCount: number
  taskRealityPassRatePercent: number | null
}

export interface SentinelAnomalyAlert {
  id: string
  category: "oauth" | "rate_limit" | "tool_abuse" | "incident"
  severity: SentinelRiskLevel
  title: string
  description: string
  metricValue: number
  threshold: number
  windowMinutes: number
  lastObservedAt: string | null
  recommendedAction: string
}

export interface SentinelSnapshot {
  source: "mock" | "supabase"
  mode: SentinelMode
  policy: SentinelPolicySnapshot
  events: SentinelActivityEvent[]
  approvals: SentinelApprovalItem[]
  threats: ThreatSignature[]
  kpis: SentinelResilienceKpis
  anomalies: SentinelAnomalyAlert[]
  incidents: SentinelIncident[]
  stats: {
    totalEvents: number
    blockedCount: number
    vetoedCount: number
    injectionCount: number
    credentialAccessCount: number
    highRiskCount: number
    criticalRiskCount: number
    vetoRatePercent: number
    threatCategoryCounts: SentinelThreatCategoryCounts
  }
}

export interface VetoGateConfig {
  mode: SentinelMode
  vetoThreshold: number
  alertThreshold: number
  enabled: boolean
}

export interface VetoGateResult {
  shouldVeto: boolean
  riskScore: number
  riskLevel: SentinelRiskLevel
  reasons: string[]
}

export type SentinelPostAction =
  | {
      action: "resolve_veto"
      eventId: string
      decision: "approved" | "rejected"
      resolverNote?: string
    }
  | {
      action: "dismiss_threat"
      threatId: string
    }
  | {
      action: "create_incident"
      title: string
      summary?: string
      severity: SentinelIncidentSeverity
      sourceEventId?: string
      impactedRoutes?: string[]
      impactedFeatures?: string[]
      impactedUsersEstimate?: number
      estimatedRevenueImpactUsd?: number
      blastRadius?: string
      tags?: string[]
      detectedAt?: string
      containmentStartedAt?: string
      containedAt?: string
      resolvedAt?: string
    }
  | {
      action: "update_incident"
      incidentId: string
      status?: SentinelIncidentStatus
      title?: string
      summary?: string
      severity?: SentinelIncidentSeverity
      impactedRoutes?: string[]
      impactedFeatures?: string[]
      impactedUsersEstimate?: number
      estimatedRevenueImpactUsd?: number
      blastRadius?: string
      tags?: string[]
      detectedAt?: string
      containmentStartedAt?: string
      containedAt?: string
      resolvedAt?: string
    }
