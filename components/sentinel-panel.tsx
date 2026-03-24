"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import type {
  SentinelActivityEvent,
  SentinelIncident,
  SentinelSnapshot,
  ThreatSignature,
} from "@/lib/sentinel/sentinel-types"
import { cn } from "@/lib/shared/utils"
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Bot,
  CheckCircle2,
  Lock,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  XCircle,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

type SentinelTab = "activity" | "chain" | "approvals" | "threats" | "incidents" | "guards"

type ChatHealthDiagnostics = {
  status?: string
  timestamp?: string
  circuitBreaker?: string
  config?: {
    openaiApiKeyConfigured?: boolean
  }
  llmGuard?: {
    enabled?: boolean
    enforce?: boolean
    failClosed?: boolean
    model?: string
    timeoutMs?: number
    maxContextChars?: number
    configured?: boolean
  }
  strictMode?: {
    mcpCriticalWorkflowVerifyMode?: string
    mcpCriticalWorkflowVerifyWindowSeconds?: number
    mcpEnforceDataEgressDlp?: boolean
    mcpEnforceDataEgressToolAllowlist?: boolean
    mcpEgressShapeApprovalEnabled?: boolean
    mcpEgressApprovalPayloadBytesThreshold?: number
    mcpEgressApprovalAttachmentCountThreshold?: number
    mcpEgressApprovalThreadMessageCountThreshold?: number
    mcpDataEgressToolAllowlistConfigured?: boolean
    mcpDataEgressToolRateLimitPerMinute?: number
    mcpDataEgressToolRateLimitWindowMs?: number
    mcpDataEgressToolRateLimitOverridesConfigured?: boolean
    egressAllowlistTools?: string[]
    egressToolRateLimits?: Record<string, number>
    sentinelAlertWebhookEnabled?: boolean
    sentinelAlertWebhookConfigured?: boolean
    sentinelAlertWebhookCooldownSeconds?: number
    supabaseBlockPoisonedDocuments?: boolean
    supabaseFilterUntrustedQueryResults?: boolean
    supabaseRequireTrustedSourceForUpsert?: boolean
    supabaseRedactSensitiveQueryFields?: boolean
    supabaseTrustedSourcesConfigured?: boolean
  }
  securityPatterns?: {
    version?: number
    updatedAt?: string | null
    hash?: string
    counts?: Record<string, number>
    refresh?: {
      script?: string
      intervalSeconds?: number
      source?: string
    }
  }
  cacheHitRate?: string
  requestsPerMinute?: number
}

type SupabaseSubagentDiagnostics = {
  ready?: boolean
  endpoint?: string
  tools?: {
    count?: number
    names?: string[]
  }
  checks?: {
    enableSupabaseLlmDbTools?: boolean
    supabaseConfigured?: boolean
    mcpDefaultSubagent?: string | null
  }
  timestamp?: string
  error?: string
}

type GuardDiagnosticsSnapshot = {
  chat: ChatHealthDiagnostics | null
  supabaseSubagent: SupabaseSubagentDiagnostics | null
  refreshedAt: string | null
  warnings: string[]
}

type RecentAlertDispatchRow = {
  alertKey: string
  alertType: string
  lastStatus: string
  lastSentAt: string | null
  lastAttemptAt: string | null
  lastError: string | null
  updatedAt: string | null
}

function statusClass(status: string): string {
  if (status === "allowed" || status === "approved" || status === "low") {
    return "bg-accent/15 text-accent"
  }
  if (status === "medium" || status === "pending") {
    return "bg-chart-4/15 text-chart-4"
  }
  if (status === "high") {
    return "bg-chart-3/15 text-chart-3"
  }
  if (status === "critical" || status === "blocked" || status === "failed" || status === "rejected" || status === "vetoed") {
    return "bg-destructive/15 text-destructive"
  }
  return "bg-muted text-muted-foreground"
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function truncate(value: string | null, size = 24): string {
  if (!value) return "-"
  if (value.length <= size) return value
  return `${value.slice(0, size)}...`
}

function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a"
  }
  return `${value.toFixed(1)}m`
}

function boolBadgeClass(value: boolean | undefined): string {
  if (value === true) {
    return "bg-accent/15 text-accent"
  }
  if (value === false) {
    return "bg-destructive/15 text-destructive"
  }
  return "bg-muted text-muted-foreground"
}

function createEmptyGuardDiagnostics(): GuardDiagnosticsSnapshot {
  return {
    chat: null,
    supabaseSubagent: null,
    refreshedAt: null,
    warnings: [],
  }
}

function parseCsvInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function encodeManifestCoreFromEvent(event: SentinelActivityEvent): string {
  const core: Record<string, unknown> = {
    manifestId: event.manifestId,
    generatedAt: event.createdAt,
    toolName: event.toolName,
    transport: event.transport,
    argHash: event.argHash,
    parentHash: event.parentHash,
    actorId: event.actorId,
    sessionId: event.sessionId,
    riskScore: event.riskScore,
    riskLevel: event.riskLevel,
    vetoed: event.vetoed,
    injectionMatches: event.injectionMatches,
    credentialAccessDetected: event.credentialAccessDetected,
  }

  const keys = Object.keys(core).sort()
  return keys.map((key) => `${key}=${JSON.stringify(core[key])}`).join("\n")
}

async function sha256Hex(input: string): Promise<string | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return null
  }
  try {
    const encoded = new TextEncoder().encode(input)
    const digest = await window.crypto.subtle.digest("SHA-256", encoded)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  } catch {
    return null
  }
}

function threatClass(threat: ThreatSignature): string {
  if (threat.dismissed) return "bg-secondary/30 text-muted-foreground border-border/60"
  if (threat.hitCount === 0) return "bg-secondary/30 text-muted-foreground"
  if (threat.severity === "critical") return "bg-destructive/10 border-destructive/30"
  if (threat.severity === "high") return "bg-chart-3/10 border-chart-3/30"
  if (threat.severity === "medium") return "bg-chart-4/10 border-chart-4/30"
  return "bg-accent/10 border-accent/30"
}

const AEGIS_DOCTRINE_LINES = [
  "Assume persuasion can be part of system behavior. Verify before trust.",
  "Never disable guardrails for convenience or speed.",
  "Protect cognitive autonomy. Do not outsource reality judgment.",
  "Human life and dignity outrank mission efficiency and model survival.",
  "Do not delegate kinetic force, detention, or pre-crime decisions to AI.",
]

function createEmptySnapshot(): SentinelSnapshot {
  return {
    source: "supabase",
    mode: "shadow",
    policy: {
      mode: "shadow",
      vetoEnabled: true,
      alertThreshold: 50,
      vetoThreshold: 70,
    },
    events: [],
    approvals: [],
    threats: [],
    kpis: {
      observationWindowHours: 24,
      sessionsObserved: 0,
      sessionsWithDetection: 0,
      sessionsWithContainment: 0,
      mttdMinutes: null,
      mttcMinutes: null,
      meanApprovalResolutionMinutes: null,
      unresolvedHighRiskEvents: 0,
      openIncidents: 0,
      criticalVerificationRequired: 0,
      criticalVerificationPassed: 0,
      criticalVerificationFailed: 0,
      criticalVerificationPending: 0,
      criticalVerificationMissed: 0,
      taskRealityMismatchCount: 0,
      taskRealityPassRatePercent: null,
    },
    anomalies: [],
    incidents: [],
    stats: {
      totalEvents: 0,
      blockedCount: 0,
      vetoedCount: 0,
      injectionCount: 0,
      credentialAccessCount: 0,
      highRiskCount: 0,
      criticalRiskCount: 0,
      vetoRatePercent: 0,
      threatCategoryCounts: {
        instruction_override: 0,
        policy_bypass: 0,
        prompt_exfiltration: 0,
        credential_exfiltration: 0,
        role_impersonation: 0,
        ssrf: 0,
        shell_injection: 0,
        encoded_payload: 0,
        obfuscation: 0,
        other: 0,
      },
    },
  }
}

export function SentinelPanel() {
  const [snapshot, setSnapshot] = useState<SentinelSnapshot>(createEmptySnapshot())
  const [guardDiagnostics, setGuardDiagnostics] = useState<GuardDiagnosticsSnapshot>(
    createEmptyGuardDiagnostics(),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isGuardLoading, setIsGuardLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [activeTab, setActiveTab] = useState<SentinelTab>("activity")
  const [recentAlertDispatches, setRecentAlertDispatches] = useState<RecentAlertDispatchRow[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState("")
  const [resolverNotes, setResolverNotes] = useState<Record<string, string>>({})
  const [integrityChecks, setIntegrityChecks] = useState<Record<string, "pass" | "fail" | "unknown">>({})
  const [incidentDraft, setIncidentDraft] = useState({
    title: "",
    summary: "",
    severity: "medium" as SentinelIncident["severity"],
    impactedRoutes: "",
    impactedFeatures: "",
    impactedUsersEstimate: "",
    estimatedRevenueImpactUsd: "",
    blastRadius: "",
    tags: "",
  })

  const loadSnapshot = useCallback(async (tokenOverride?: string | null) => {
    setIsLoading(true)
    try {
      const token = tokenOverride ?? accessToken
      if (!token) {
        setMessage("Supabase auth required to load SENTINEL data.")
        setSnapshot(createEmptySnapshot())
        return
      }

      const response = await fetch("/api/sentinel", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        data?: SentinelSnapshot
        recentAlertDispatches?: RecentAlertDispatchRow[]
      }
      if (!response.ok || !payload.ok || !payload.data) {
        setMessage(payload.error || "Unable to load SENTINEL data.")
        return
      }
      setSnapshot(payload.data)
      setRecentAlertDispatches(Array.isArray(payload.recentAlertDispatches) ? payload.recentAlertDispatches : [])
      setMessage("")
    } catch {
      setMessage("Unable to fetch SENTINEL data. Showing last snapshot.")
    } finally {
      setIsLoading(false)
    }
  }, [accessToken])

  const loadGuardDiagnostics = useCallback(async (tokenOverride?: string | null) => {
    setIsGuardLoading(true)
    const token = tokenOverride ?? accessToken
    const warnings: string[] = []
    let chatHealth: ChatHealthDiagnostics | null = null
    let supabaseSubagent: SupabaseSubagentDiagnostics | null = null

    try {
      try {
        const chatResponse = await fetch("/api/chat?action=health", { cache: "no-store" })
        let payload: ChatHealthDiagnostics | null = null
        try {
          payload = (await chatResponse.json()) as ChatHealthDiagnostics
        } catch {
          payload = null
        }
        if (payload) {
          chatHealth = payload
        }
        if (!chatResponse.ok) {
          warnings.push(`Chat health request failed (${chatResponse.status}).`)
        }
      } catch {
        warnings.push("Unable to load chat guard diagnostics.")
      }

      if (!token) {
        warnings.push("Supabase sub-agent diagnostics require authentication.")
      } else {
        try {
          const subagentResponse = await fetch("/api/subagents/supabase/health", {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
          const payload = (await subagentResponse.json()) as SupabaseSubagentDiagnostics
          if (subagentResponse.ok) {
            supabaseSubagent = payload
          } else {
            supabaseSubagent = payload
            warnings.push(payload.error || "Unable to load Supabase sub-agent diagnostics.")
          }
        } catch {
          warnings.push("Unable to load Supabase sub-agent diagnostics.")
        }
      }
    } finally {
      setGuardDiagnostics({
        chat: chatHealth,
        supabaseSubagent,
        refreshedAt: new Date().toISOString(),
        warnings,
      })
      setIsGuardLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    const token = resolveSupabaseAccessToken()
    setAccessToken(token)
    void loadSnapshot(token)
    void loadGuardDiagnostics(token)

    const onStorage = () => {
      const updated = resolveSupabaseAccessToken()
      setAccessToken(updated)
      void loadSnapshot(updated)
      void loadGuardDiagnostics(updated)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [loadGuardDiagnostics, loadSnapshot])

  const sessions = useMemo(
    () =>
      Array.from(
        new Set(
          snapshot.events
            .map((event) => event.sessionId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    [snapshot.events],
  )

  useEffect(() => {
    if (!selectedSessionId && sessions[0]) {
      setSelectedSessionId(sessions[0])
    }
  }, [selectedSessionId, sessions])

  const chainEvents = useMemo(
    () =>
      snapshot.events
        .filter((event) => event.sessionId === selectedSessionId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [selectedSessionId, snapshot.events],
  )

  const activeThreatCategories = useMemo(
    () => {
      const counts = new Map<string, number>()
      for (const threat of snapshot.threats) {
        if (threat.dismissed || threat.hitCount <= 0) {
          continue
        }
        counts.set(threat.category, (counts.get(threat.category) || 0) + threat.hitCount)
      }
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
    },
    [snapshot.threats],
  )

  const recentGuardBlocks = useMemo(
    () =>
      snapshot.events
        .filter((event) =>
          event.status === "blocked" ||
          event.status === "vetoed" ||
          event.status === "failed",
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10),
    [snapshot.events],
  )

  const recentVerificationIssues = useMemo(
    () =>
      snapshot.events
        .filter((event) => {
          if (!event.verificationRequired) {
            return false
          }
          if (event.verificationState === "failed") {
            return true
          }
          if (
            event.verificationState === "pending" &&
            event.verificationDueAt &&
            new Date(event.verificationDueAt).getTime() < Date.now()
          ) {
            return true
          }
          return false
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10),
    [snapshot.events],
  )

  const resolveVeto = async (approvalId: string, decision: "approved" | "rejected") => {
    if (!accessToken) {
      setMessage("Supabase auth required to resolve veto requests.")
      return
    }
    const resolverNote = (resolverNotes[approvalId] || "").trim()
    try {
      const response = await fetch("/api/sentinel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "resolve_veto",
          eventId: approvalId,
          decision,
          resolverNote: resolverNote || undefined,
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Failed to resolve veto.")
        return
      }
      setMessage(`Veto request ${decision}.`)
      await loadSnapshot(accessToken)
    } catch {
      setMessage("Failed to resolve veto.")
    }
  }

  const dismissThreat = async (threatId: string) => {
    if (!accessToken) {
      setMessage("Supabase auth required to dismiss threats.")
      return
    }
    try {
      const response = await fetch("/api/sentinel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "dismiss_threat",
          threatId,
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Failed to dismiss threat.")
        return
      }
      setMessage(`Threat ${threatId} dismissed.`)
      await loadSnapshot(accessToken)
    } catch {
      setMessage("Failed to dismiss threat.")
    }
  }

  const createIncident = async () => {
    if (!accessToken) {
      setMessage("Supabase auth required to create incidents.")
      return
    }

    const title = incidentDraft.title.trim()
    if (!title) {
      setMessage("Incident title is required.")
      return
    }

    try {
      const response = await fetch("/api/sentinel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "create_incident",
          title,
          summary: incidentDraft.summary.trim() || undefined,
          severity: incidentDraft.severity,
          impactedRoutes: parseCsvInput(incidentDraft.impactedRoutes),
          impactedFeatures: parseCsvInput(incidentDraft.impactedFeatures),
          impactedUsersEstimate: incidentDraft.impactedUsersEstimate.trim()
            ? Number(incidentDraft.impactedUsersEstimate.trim())
            : undefined,
          estimatedRevenueImpactUsd: incidentDraft.estimatedRevenueImpactUsd.trim()
            ? Number(incidentDraft.estimatedRevenueImpactUsd.trim())
            : undefined,
          blastRadius: incidentDraft.blastRadius.trim() || undefined,
          tags: parseCsvInput(incidentDraft.tags),
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Failed to create incident.")
        return
      }

      setIncidentDraft({
        title: "",
        summary: "",
        severity: "medium",
        impactedRoutes: "",
        impactedFeatures: "",
        impactedUsersEstimate: "",
        estimatedRevenueImpactUsd: "",
        blastRadius: "",
        tags: "",
      })
      setMessage("Incident created.")
      await loadSnapshot(accessToken)
    } catch {
      setMessage("Failed to create incident.")
    }
  }

  const updateIncidentStatus = async (
    incidentId: string,
    status: "open" | "investigating" | "contained" | "resolved",
  ) => {
    if (!accessToken) {
      setMessage("Supabase auth required to update incidents.")
      return
    }
    try {
      const response = await fetch("/api/sentinel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "update_incident",
          incidentId,
          status,
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Failed to update incident.")
        return
      }
      setMessage(`Incident moved to ${status}.`)
      await loadSnapshot(accessToken)
    } catch {
      setMessage("Failed to update incident.")
    }
  }

  const verifyChainEventIntegrity = async (event: SentinelActivityEvent) => {
    if (!event.manifestHash || !event.manifestId) {
      setIntegrityChecks((prev) => ({ ...prev, [event.id]: "unknown" }))
      return
    }

    const encoded = encodeManifestCoreFromEvent(event)
    const recomputed = await sha256Hex(encoded)
    if (!recomputed) {
      setIntegrityChecks((prev) => ({ ...prev, [event.id]: "unknown" }))
      return
    }

    setIntegrityChecks((prev) => ({
      ...prev,
      [event.id]: recomputed === event.manifestHash ? "pass" : "fail",
    }))
  }

  const refreshControlPlane = useCallback(() => {
    void loadSnapshot(accessToken)
    void loadGuardDiagnostics(accessToken)
  }, [accessToken, loadGuardDiagnostics, loadSnapshot])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" />
              SENTINEL Security Control Plane
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Risk scoring, veto oversight, provenance chains, and threat telemetry.
            </p>
            <p className="text-xs text-muted-foreground/90 mt-1.5 max-w-xl">
              Security is culture, not a checkbox. Compliance alone is not the same as being safe — guardrails protect people, not audit dates.
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="secondary" className="text-[10px] uppercase">{snapshot.source}</Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">{snapshot.mode}</Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {snapshot.policy.vetoEnabled ? "veto:on" : "veto:off"}
              </Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">
                alert {snapshot.policy.alertThreshold}
              </Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">
                veto {snapshot.policy.vetoThreshold}
              </Badge>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={refreshControlPlane}
            disabled={isLoading || isGuardLoading}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading || isGuardLoading ? "animate-spin" : "")} />
            Refresh
          </Button>
        </div>

        {message ? (
          <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
            {message}
          </div>
        ) : null}

        {snapshot.anomalies.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Anomaly Alerts</CardTitle>
              <CardDescription className="text-xs">
                Automatically detected spikes from tool, OAuth, rate-limit, and incident telemetry.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {snapshot.anomalies.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(alert.severity))}>
                      {alert.severity}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {alert.category.replaceAll("_", " ")}
                    </Badge>
                    <span className="text-xs text-foreground">{alert.title}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {alert.description}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    metric {alert.metricValue} | threshold {alert.threshold} | window {alert.windowMinutes}m
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">AEGIS Doctrine</CardTitle>
            <CardDescription className="text-xs">
              Human-first operating constraints applied across chat, MCP, and realtime tool execution. We patch the code and the will — guardrails are mandatory, not optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {AEGIS_DOCTRINE_LINES.map((line) => (
                <li key={line} className="rounded border border-border/60 bg-secondary/20 px-2 py-1.5">
                  {line}
                </li>
              ))}
              <li className="rounded border border-primary/20 bg-primary/5 px-2 py-1.5 text-foreground/90">
                Compliance is a checkbox in a burning building; the fire does not care about your audit date. Build safety in.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resilience Signals</CardTitle>
            <CardDescription className="text-xs">
              Translate telemetry into survival, not theatre. These checks tilt SENTINEL toward containment, recovery, and blast-radius control. Ask the AI Assistant how to apply these in your program.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="rounded border border-border/60 bg-secondary/20 px-2 py-1.5">
                Passing audits is table stakes; measure whether you can contain an active breach, not just clear a checklist.
              </li>
              <li className="rounded border border-border/60 bg-secondary/20 px-2 py-1.5">
                Red-team findings are only useful if detection and containment speed improve after every exercise.
              </li>
              <li className="rounded border border-border/60 bg-secondary/20 px-2 py-1.5">
                Green dashboards and ticket volumes are vanity; track time-to-detect, time-to-contain, and blast radius per incident.
              </li>
              <li className="rounded border border-border/60 bg-secondary/20 px-2 py-1.5">
                Zero incidents may mean zero detection. Silence is not safety — assume quiet periods still need inspection.
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase">Total Events</span>
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground">{snapshot.stats.totalEvents}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase">Blocked + Vetoed</span>
                <Ban className="w-4 h-4 text-destructive" />
              </div>
              <div className="text-2xl font-bold text-destructive">
                {snapshot.stats.blockedCount + snapshot.stats.vetoedCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase">Injection Hits</span>
                <Zap className="w-4 h-4 text-chart-3" />
              </div>
              <div className="text-2xl font-bold text-chart-3">{snapshot.stats.injectionCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase">High Risk</span>
                <AlertTriangle className="w-4 h-4 text-chart-4" />
              </div>
              <div className="text-2xl font-bold text-chart-4">{snapshot.stats.highRiskCount}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                critical {snapshot.stats.criticalRiskCount} | veto {snapshot.stats.vetoRatePercent}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase">MTTD</span>
                <ShieldAlert className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatMinutes(snapshot.kpis.mttdMinutes)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                sessions {snapshot.kpis.sessionsWithDetection}/{snapshot.kpis.sessionsObserved}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase">MTTC</span>
                <CheckCircle2 className="w-4 h-4 text-accent" />
              </div>
              <div className="text-2xl font-bold text-foreground">
                {formatMinutes(snapshot.kpis.mttcMinutes)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                approval {formatMinutes(snapshot.kpis.meanApprovalResolutionMinutes)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground uppercase">Open Incidents</span>
                <XCircle className="w-4 h-4 text-destructive" />
              </div>
              <div className="text-2xl font-bold text-destructive">{snapshot.kpis.openIncidents}</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                unresolved high-risk events {snapshot.kpis.unresolvedHighRiskEvents}
              </div>
            </CardContent>
          </Card>
        </div>

        {recentAlertDispatches.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-chart-4" />
                Recent alerts
              </CardTitle>
              <CardDescription className="text-xs">
                Webhook pipeline dispatch state (last attempt per alert key).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[140px] pr-2">
                <div className="space-y-1.5">
                  {recentAlertDispatches.map((row, i) => (
                    <div
                      key={`${row.alertKey}-${i}`}
                      className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/20 px-2 py-1.5 text-[11px]"
                    >
                      <span className="font-mono font-medium text-foreground">{row.alertKey}</span>
                      <Badge variant="secondary" className={cn("text-[9px] uppercase", statusClass(row.lastStatus))}>
                        {row.lastStatus}
                      </Badge>
                      {(row.lastSentAt || row.lastAttemptAt || row.updatedAt) && (
                        <span className="text-muted-foreground">
                          {formatTime(row.lastSentAt ?? row.lastAttemptAt ?? row.updatedAt ?? "")}
                        </span>
                      )}
                      {row.lastError ? (
                        <span className="text-chart-4 truncate max-w-[200px]" title={row.lastError}>
                          {row.lastError}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {([
            ["activity", "Activity Monitor"],
            ["chain", "Provenance Chain"],
            ["approvals", "Approval Queue"],
            ["threats", "Threat Intel"],
            ["incidents", "Incidents"],
            ["guards", "Guard Diagnostics"],
          ] as Array<[SentinelTab, string]>).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={activeTab === id ? "default" : "outline"}
              className="text-xs"
              onClick={() => setActiveTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        {activeTab === "activity" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Activity Monitor</CardTitle>
              <CardDescription className="text-xs">
                Recent tool executions from MCP, realtime, and chat transports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[520px] pr-3">
                <div className="space-y-2">
                  {snapshot.events.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No events recorded yet.
                    </div>
                  ) : (
                    snapshot.events.map((event) => (
                      <div key={event.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(event.status))}>
                            {event.status}
                          </Badge>
                          <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(event.riskLevel))}>
                            {event.riskLevel} {event.riskScore}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] uppercase">{event.transport}</Badge>
                          <span className="text-xs text-muted-foreground">{formatTime(event.createdAt)}</span>
                        </div>
                        <div className="text-sm font-medium text-foreground mt-1">{event.toolName}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          session: {event.sessionId || "none"} | manifest: {truncate(event.manifestId, 30)}
                        </div>
                        {event.injectionMatches.length > 0 ? (
                          <div className="text-[11px] text-chart-3 mt-1">
                            matches: {event.injectionMatches.join(" | ")}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "chain" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Provenance Chain</CardTitle>
              <CardDescription className="text-xs">
                Verify hash continuity for a selected session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
                placeholder={sessions[0] || "Enter session id"}
                className="h-8 text-xs"
              />
              <div className="text-xs text-muted-foreground">
                Known sessions: {sessions.length > 0 ? sessions.join(", ") : "none"}
              </div>
              <ScrollArea className="h-[440px] pr-3">
                <div className="space-y-2">
                  {chainEvents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No chain events for this session.
                    </div>
                  ) : (
                    chainEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(event.riskLevel))}>
                            {event.riskLevel} {event.riskScore}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{event.toolName}</span>
                          <span className="text-[11px] text-muted-foreground">{formatTime(event.createdAt)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          id: {truncate(event.manifestId, 42)} | hash: {truncate(event.manifestHash, 42)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          parent: {truncate(event.parentHash, 42)}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => void verifyChainEventIntegrity(event)}>
                            Verify Integrity
                          </Button>
                          {integrityChecks[event.id] === "pass" ? (
                            <span className="text-[11px] text-accent flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              verified
                            </span>
                          ) : null}
                          {integrityChecks[event.id] === "fail" ? (
                            <span className="text-[11px] text-destructive flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              mismatch
                            </span>
                          ) : null}
                          {integrityChecks[event.id] === "unknown" ? (
                            <span className="text-[11px] text-muted-foreground">
                              unavailable
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "approvals" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Approval Queue</CardTitle>
              <CardDescription className="text-xs">
                Resolve vetoed tool actions with explicit human decisions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[520px] pr-3">
                <div className="space-y-2">
                  {snapshot.approvals.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No veto approvals pending.
                    </div>
                  ) : (
                    snapshot.approvals.map((approval) => (
                      <div key={approval.id} className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(approval.status))}>
                            {approval.status}
                          </Badge>
                          <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(approval.riskLevel))}>
                            {approval.riskLevel} {approval.riskScore}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{approval.transport}</span>
                        </div>
                        <div className="text-sm font-medium text-foreground">{approval.toolName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          requested: {formatTime(approval.requestedAt)} | manifest: {truncate(approval.manifestId, 36)}
                        </div>
                        {approval.argPreview ? (
                          <div className="text-[11px] text-muted-foreground bg-background/60 border border-border rounded-md p-2">
                            {approval.argPreview}
                          </div>
                        ) : null}
                        {approval.status === "pending" ? (
                          <div className="space-y-2">
                            <Textarea
                              className="min-h-16 text-xs"
                              placeholder="Resolver note (optional)"
                              value={resolverNotes[approval.id] || ""}
                              onChange={(event) =>
                                setResolverNotes((prev) => ({
                                  ...prev,
                                  [approval.id]: event.target.value,
                                }))
                              }
                            />
                            <div className="flex items-center gap-2">
                              <Button size="sm" className="h-7 text-xs" onClick={() => void resolveVeto(approval.id, "approved")}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void resolveVeto(approval.id, "rejected")}>
                                Reject
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "threats" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Threat Intel</CardTitle>
              <CardDescription className="text-xs">
                Signature detections derived from recent tool-argument inspections.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 rounded-lg border border-border bg-secondary/20 p-2">
                <div className="text-[11px] text-muted-foreground mb-1">
                  Active categories: {activeThreatCategories.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeThreatCategories.length > 0 ? (
                    activeThreatCategories.map(([category, count]) => (
                      <Badge key={category} variant="secondary" className="text-[10px] uppercase">
                        {category.replaceAll("_", " ")}: {count}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No active threat categories.</span>
                  )}
                </div>
              </div>
              <ScrollArea className="h-[520px] pr-3">
                <div className="space-y-2">
                  {snapshot.threats.map((threat) => (
                    <div key={threat.id} className={cn("rounded-lg border p-3", threatClass(threat))}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(threat.severity))}>
                          {threat.severity}
                        </Badge>
                        <span className="text-xs font-medium">{threat.id}</span>
                        <span className="text-xs">{threat.name}</span>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {threat.category.replaceAll("_", " ")}
                        </Badge>
                        {threat.dismissed ? (
                          <Badge variant="secondary" className="text-[10px] uppercase bg-muted text-muted-foreground">
                            dismissed
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-[11px] mt-1 break-all">{threat.patternSource}</div>
                      <div className="text-[11px] mt-1">
                        hits: {threat.hitCount} | last seen: {threat.lastSeenAt ? formatTime(threat.lastSeenAt) : "never"}
                        {threat.dismissedAt ? ` | dismissed: ${formatTime(threat.dismissedAt)}` : ""}
                      </div>
                      {!threat.dismissed ? (
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px]"
                            onClick={() => void dismissThreat(threat.id)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "guards" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
              Refreshed {guardDiagnostics.refreshedAt ? formatTime(guardDiagnostics.refreshedAt) : "never"}.
              {isGuardLoading ? " Loading latest guard diagnostics..." : ""}
            </div>

            {guardDiagnostics.warnings.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-chart-4">Diagnostics Warnings</CardTitle>
                  <CardDescription className="text-xs">
                    Some diagnostics endpoints are degraded or unavailable.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {guardDiagnostics.warnings.map((warning) => (
                    <div
                      key={warning}
                      className="rounded border border-chart-4/40 bg-chart-4/10 px-2 py-1.5 text-xs text-chart-4"
                    >
                      {warning}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-primary" />
                    Chat Guard Plane
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Runtime status and LLM guard posture for `/api/chat`.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] uppercase", boolBadgeClass(guardDiagnostics.chat?.status === "healthy"))}
                    >
                      status: {guardDiagnostics.chat?.status || "unknown"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      breaker: {guardDiagnostics.chat?.circuitBreaker || "unknown"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.config?.openaiApiKeyConfigured),
                      )}
                    >
                      openai key: {guardDiagnostics.chat?.config?.openaiApiKeyConfigured ? "set" : "missing"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    req/min {guardDiagnostics.chat?.requestsPerMinute ?? "n/a"} | cache hit{" "}
                    {guardDiagnostics.chat?.cacheHitRate || "n/a"}
                  </div>
                  <div className="rounded border border-border bg-background/40 p-2 space-y-1.5">
                    <div className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                      LLM Guard
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] uppercase", boolBadgeClass(guardDiagnostics.chat?.llmGuard?.enabled))}
                      >
                        enabled: {guardDiagnostics.chat?.llmGuard?.enabled ? "true" : "false"}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] uppercase", boolBadgeClass(guardDiagnostics.chat?.llmGuard?.enforce))}
                      >
                        enforce: {guardDiagnostics.chat?.llmGuard?.enforce ? "true" : "false"}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] uppercase", boolBadgeClass(guardDiagnostics.chat?.llmGuard?.failClosed))}
                      >
                        fail-closed: {guardDiagnostics.chat?.llmGuard?.failClosed ? "true" : "false"}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] uppercase", boolBadgeClass(guardDiagnostics.chat?.llmGuard?.configured))}
                      >
                        configured: {guardDiagnostics.chat?.llmGuard?.configured ? "true" : "false"}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      model {guardDiagnostics.chat?.llmGuard?.model || "n/a"} | timeout{" "}
                      {guardDiagnostics.chat?.llmGuard?.timeoutMs ?? "n/a"}ms | max context{" "}
                      {guardDiagnostics.chat?.llmGuard?.maxContextChars ?? "n/a"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-primary" />
                    Supabase Sub-Agent
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tool readiness checks for the Supabase MCP sub-agent.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn("text-[10px] uppercase", boolBadgeClass(guardDiagnostics.supabaseSubagent?.ready))}
                    >
                      ready: {guardDiagnostics.supabaseSubagent?.ready ? "true" : "false"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      tools: {guardDiagnostics.supabaseSubagent?.tools?.count ?? 0}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground break-all">
                    endpoint: {guardDiagnostics.supabaseSubagent?.endpoint || "/api/subagents/supabase/health"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.supabaseSubagent?.checks?.enableSupabaseLlmDbTools),
                      )}
                    >
                      llm db tools:{" "}
                      {guardDiagnostics.supabaseSubagent?.checks?.enableSupabaseLlmDbTools ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.supabaseSubagent?.checks?.supabaseConfigured),
                      )}
                    >
                      supabase: {guardDiagnostics.supabaseSubagent?.checks?.supabaseConfigured ? "configured" : "missing"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      default: {guardDiagnostics.supabaseSubagent?.checks?.mcpDefaultSubagent || "none"}
                    </Badge>
                  </div>
                  {guardDiagnostics.supabaseSubagent?.tools?.names?.length ? (
                    <div className="rounded border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                      {guardDiagnostics.supabaseSubagent.tools.names.join(", ")}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      No tool names returned.
                    </div>
                  )}
                  {guardDiagnostics.supabaseSubagent?.error ? (
                    <div className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                      {guardDiagnostics.supabaseSubagent.error}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Strict Mode + Pattern Registry</CardTitle>
                  <CardDescription className="text-xs">
                    Production guard toggles and loaded injection/jailbreak pattern metadata.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      verify mode: {guardDiagnostics.chat?.strictMode?.mcpCriticalWorkflowVerifyMode || "warn"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      verify window:{" "}
                      {guardDiagnostics.chat?.strictMode?.mcpCriticalWorkflowVerifyWindowSeconds ?? "n/a"}s
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.mcpEnforceDataEgressDlp),
                      )}
                    >
                      egress dlp: {guardDiagnostics.chat?.strictMode?.mcpEnforceDataEgressDlp ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.mcpEnforceDataEgressToolAllowlist),
                      )}
                    >
                      egress allowlist:{" "}
                      {guardDiagnostics.chat?.strictMode?.mcpEnforceDataEgressToolAllowlist ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.mcpEgressShapeApprovalEnabled),
                      )}
                    >
                      egress shape approval:{" "}
                      {guardDiagnostics.chat?.strictMode?.mcpEgressShapeApprovalEnabled ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.mcpDataEgressToolAllowlistConfigured),
                      )}
                    >
                      egress allowlist config:{" "}
                      {guardDiagnostics.chat?.strictMode?.mcpDataEgressToolAllowlistConfigured ? "set" : "missing"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.mcpDataEgressToolRateLimitOverridesConfigured),
                      )}
                    >
                      egress rate overrides:{" "}
                      {guardDiagnostics.chat?.strictMode?.mcpDataEgressToolRateLimitOverridesConfigured ? "set" : "none"}
                    </Badge>
                  </div>
                  {(guardDiagnostics.chat?.strictMode?.egressAllowlistTools?.length ?? 0) > 0 ? (
                    <div className="mt-2 rounded border border-border bg-muted/30 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Per-tool allowlist (
                        {guardDiagnostics.chat?.strictMode?.egressAllowlistTools?.length ?? 0} tools)
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(guardDiagnostics.chat?.strictMode?.egressAllowlistTools ?? []).map((name) => {
                          const rateLimit = guardDiagnostics.chat?.strictMode?.egressToolRateLimits?.[name]
                          return (
                            <Badge
                              key={name}
                              variant="secondary"
                              className="text-[10px] font-mono"
                            >
                              {name}
                              {typeof rateLimit === "number" ? ` (${rateLimit}/min)` : ""}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.sentinelAlertWebhookEnabled),
                      )}
                    >
                      sentinel webhook alerts: {guardDiagnostics.chat?.strictMode?.sentinelAlertWebhookEnabled ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.sentinelAlertWebhookConfigured),
                      )}
                    >
                      sentinel webhook url: {guardDiagnostics.chat?.strictMode?.sentinelAlertWebhookConfigured ? "set" : "missing"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.supabaseBlockPoisonedDocuments),
                      )}
                    >
                      block poisoned docs:{" "}
                      {guardDiagnostics.chat?.strictMode?.supabaseBlockPoisonedDocuments ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.supabaseFilterUntrustedQueryResults),
                      )}
                    >
                      filter untrusted query:{" "}
                      {guardDiagnostics.chat?.strictMode?.supabaseFilterUntrustedQueryResults ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.supabaseRequireTrustedSourceForUpsert),
                      )}
                    >
                      require trusted upsert:{" "}
                      {guardDiagnostics.chat?.strictMode?.supabaseRequireTrustedSourceForUpsert ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.supabaseRedactSensitiveQueryFields),
                      )}
                    >
                      redact sensitive fields:{" "}
                      {guardDiagnostics.chat?.strictMode?.supabaseRedactSensitiveQueryFields ? "on" : "off"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px] uppercase",
                        boolBadgeClass(guardDiagnostics.chat?.strictMode?.supabaseTrustedSourcesConfigured),
                      )}
                    >
                      trusted sources:{" "}
                      {guardDiagnostics.chat?.strictMode?.supabaseTrustedSourcesConfigured ? "set" : "missing"}
                    </Badge>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                    egress rate policy{" "}
                    {guardDiagnostics.chat?.strictMode?.mcpDataEgressToolRateLimitPerMinute ?? "n/a"} req /{" "}
                    {guardDiagnostics.chat?.strictMode?.mcpDataEgressToolRateLimitWindowMs ?? "n/a"}ms window
                  </div>
                  <div className="rounded border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                    sentinel webhook cooldown{" "}
                    {guardDiagnostics.chat?.strictMode?.sentinelAlertWebhookCooldownSeconds ?? "n/a"}s
                  </div>
                  <div className="rounded border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                    egress shape thresholds payload{" "}
                    {guardDiagnostics.chat?.strictMode?.mcpEgressApprovalPayloadBytesThreshold ?? "n/a"} bytes | attachments{" "}
                    {guardDiagnostics.chat?.strictMode?.mcpEgressApprovalAttachmentCountThreshold ?? "n/a"} | thread messages{" "}
                    {guardDiagnostics.chat?.strictMode?.mcpEgressApprovalThreadMessageCountThreshold ?? "n/a"}
                  </div>
                  <div className="rounded border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                    version {guardDiagnostics.chat?.securityPatterns?.version ?? "n/a"} | hash{" "}
                    {truncate(guardDiagnostics.chat?.securityPatterns?.hash || null, 42)} | updated{" "}
                    {guardDiagnostics.chat?.securityPatterns?.updatedAt
                      ? formatTime(guardDiagnostics.chat.securityPatterns.updatedAt)
                      : "n/a"}
                  </div>
                  <div className="rounded border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                    refresh script{" "}
                    <span className="font-mono text-foreground/90">
                      {guardDiagnostics.chat?.securityPatterns?.refresh?.script || "node scripts/update-security-patterns-from-openai.js"}
                    </span>{" "}
                    | interval{" "}
                    {guardDiagnostics.chat?.securityPatterns?.refresh?.intervalSeconds
                      ? `${guardDiagnostics.chat.securityPatterns.refresh.intervalSeconds}s`
                      : "n/a"}{" "}
                    | source {guardDiagnostics.chat?.securityPatterns?.refresh?.source || "docker-security-cron-or-ci"}
                  </div>
                  {Object.entries(guardDiagnostics.chat?.securityPatterns?.counts || {}).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(guardDiagnostics.chat?.securityPatterns?.counts || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([group, count]) => (
                          <Badge key={group} variant="secondary" className="text-[10px] uppercase">
                            {group}: {count}
                          </Badge>
                        ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      Pattern group counts unavailable.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Task vs Reality</CardTitle>
                  <CardDescription className="text-xs">
                    Tracks critical write verification outcomes so completed claims match actual system state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      required: {snapshot.kpis.criticalVerificationRequired}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase bg-accent/15 text-accent">
                      passed: {snapshot.kpis.criticalVerificationPassed}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase bg-destructive/15 text-destructive">
                      failed: {snapshot.kpis.criticalVerificationFailed}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      pending: {snapshot.kpis.criticalVerificationPending}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase bg-chart-4/15 text-chart-4">
                      missed: {snapshot.kpis.criticalVerificationMissed}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] uppercase bg-destructive/15 text-destructive">
                      mismatches: {snapshot.kpis.taskRealityMismatchCount}
                    </Badge>
                  </div>
                  <div className="rounded border border-border bg-background/40 p-2 text-[11px] text-muted-foreground">
                    pass rate {snapshot.kpis.taskRealityPassRatePercent ?? "n/a"}%
                  </div>
                  <ScrollArea className="h-[180px] pr-3">
                    <div className="space-y-2">
                      {recentVerificationIssues.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                          No recent failed or missed verification obligations.
                        </div>
                      ) : (
                        recentVerificationIssues.map((event) => (
                          <div key={event.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[10px] uppercase",
                                  event.verificationState === "failed"
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-chart-4/15 text-chart-4",
                                )}
                              >
                                {event.verificationState}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatTime(event.createdAt)}</span>
                            </div>
                            <div className="text-sm font-medium text-foreground mt-1">
                              {event.verificationTargetTool || event.toolName}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1">
                              subject {event.verificationSubject || "unknown"} | due{" "}
                              {event.verificationDueAt ? formatTime(event.verificationDueAt) : "n/a"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recent Blocked/Vetoed Requests</CardTitle>
                  <CardDescription className="text-xs">
                    Drill into the latest denied actions to validate guard quality and false-positive rate.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ScrollArea className="h-[280px] pr-3">
                    <div className="space-y-2">
                      {recentGuardBlocks.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                          No blocked or vetoed events in the current snapshot.
                        </div>
                      ) : (
                        recentGuardBlocks.map((event) => (
                          <div key={event.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(event.status))}>
                                {event.status}
                              </Badge>
                              <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(event.riskLevel))}>
                                {event.riskLevel} {event.riskScore}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] uppercase">{event.transport}</Badge>
                              <span className="text-xs text-muted-foreground">{formatTime(event.createdAt)}</span>
                            </div>
                            <div className="text-sm font-medium text-foreground mt-1">{event.toolName}</div>
                            <div className="text-[11px] text-muted-foreground mt-1">
                              session {event.sessionId || "none"} | actor {event.actorId || "unknown"} | manifest{" "}
                              {truncate(event.manifestId, 30)}
                            </div>
                            {event.injectionMatches.length > 0 ? (
                              <div className="text-[11px] text-chart-3 mt-1">
                                injection matches: {event.injectionMatches.join(" | ")}
                              </div>
                            ) : null}
                            {event.egressPayloadBytes !== null || event.egressAttachmentCount !== null || event.egressThreadMessageCount !== null ? (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                egress shape payload {event.egressPayloadBytes ?? "n/a"} bytes | attachments{" "}
                                {event.egressAttachmentCount ?? "n/a"} | thread messages{" "}
                                {event.egressThreadMessageCount ?? "n/a"}
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {activeTab === "incidents" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Incident Register</CardTitle>
              <CardDescription className="text-xs">
                Track containment timelines with explicit business-impact tags.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={incidentDraft.title}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Incident title"
                  className="h-8 text-xs"
                />
                <select
                  value={incidentDraft.severity}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      severity: event.target.value as SentinelIncident["severity"],
                    }))
                  }
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
                <Input
                  value={incidentDraft.impactedRoutes}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      impactedRoutes: event.target.value,
                    }))
                  }
                  placeholder="Impacted routes (comma-separated)"
                  className="h-8 text-xs"
                />
                <Input
                  value={incidentDraft.impactedFeatures}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      impactedFeatures: event.target.value,
                    }))
                  }
                  placeholder="Impacted features (comma-separated)"
                  className="h-8 text-xs"
                />
                <Input
                  value={incidentDraft.impactedUsersEstimate}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      impactedUsersEstimate: event.target.value,
                    }))
                  }
                  placeholder="Impacted users estimate"
                  className="h-8 text-xs"
                />
                <Input
                  value={incidentDraft.estimatedRevenueImpactUsd}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      estimatedRevenueImpactUsd: event.target.value,
                    }))
                  }
                  placeholder="Revenue impact USD"
                  className="h-8 text-xs"
                />
                <Input
                  value={incidentDraft.blastRadius}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      blastRadius: event.target.value,
                    }))
                  }
                  placeholder="Blast radius"
                  className="h-8 text-xs"
                />
                <Input
                  value={incidentDraft.tags}
                  onChange={(event) =>
                    setIncidentDraft((prev) => ({
                      ...prev,
                      tags: event.target.value,
                    }))
                  }
                  placeholder="Tags (comma-separated)"
                  className="h-8 text-xs"
                />
              </div>
              <Textarea
                value={incidentDraft.summary}
                onChange={(event) =>
                  setIncidentDraft((prev) => ({
                    ...prev,
                    summary: event.target.value,
                  }))
                }
                className="min-h-20 text-xs"
                placeholder="Incident summary"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={() => void createIncident()}>
                  Create incident
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  MTTD {formatMinutes(snapshot.kpis.mttdMinutes)} | MTTC {formatMinutes(snapshot.kpis.mttcMinutes)}
                </span>
              </div>

              <ScrollArea className="h-[420px] pr-3">
                <div className="space-y-2">
                  {snapshot.incidents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No incidents recorded.
                    </div>
                  ) : (
                    snapshot.incidents.map((incident) => (
                      <div key={incident.id} className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(incident.severity))}>
                            {incident.severity}
                          </Badge>
                          <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(incident.status))}>
                            {incident.status}
                          </Badge>
                          <span className="text-xs text-foreground">{incident.title}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          detected {formatTime(incident.detectedAt)} | id {truncate(incident.id, 18)}
                        </div>
                        {incident.summary ? (
                          <div className="text-[11px] text-muted-foreground">{incident.summary}</div>
                        ) : null}
                        <div className="text-[11px] text-muted-foreground">
                          users {incident.impactedUsersEstimate ?? "-"} | revenue $
                          {incident.estimatedRevenueImpactUsd?.toFixed(2) ?? "0.00"} | blast radius {incident.blastRadius || "-"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          routes {incident.impactedRoutes.join(", ") || "-"} | features {incident.impactedFeatures.join(", ") || "-"}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {(["open", "investigating", "contained", "resolved"] as const).map((status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant={incident.status === status ? "default" : "outline"}
                              className="h-6 text-[11px]"
                              onClick={() => void updateIncidentStatus(incident.id, status)}
                              disabled={incident.status === status}
                            >
                              {status}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
