"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  type AgentPermissionMode,
  type AgentPlatformSnapshot,
  buildAgentDraftFromPromptLegacy,
} from "@/lib/agents/agent-platform-types"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { cn } from "@/lib/shared/utils"
import { Bot, Clock3, Download, FlaskConical, Gauge, Handshake, History, PauseCircle, PlayCircle, RefreshCw, ShieldCheck, Sparkles, Wrench } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

type ConnectorDraft = {
  permissionMode: AgentPermissionMode
  scopesText: string
}

function statusClass(status: string): string {
  if (status === "active" || status === "connected" || status === "completed" || status === "passed") return "bg-accent/15 text-accent"
  if (status === "paused" || status === "degraded" || status === "running") return "bg-chart-4/15 text-chart-4"
  if (status === "failed" || status === "archived") return "bg-destructive/15 text-destructive"
  if (status === "pending") return "bg-chart-4/15 text-chart-4"
  return "bg-muted text-muted-foreground"
}

function parseScopes(value: string): string[] {
  return value.split(/[,\n;]/g).map((item) => item.trim()).filter(Boolean)
}

function parseNumericInput(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function playbookFromNotes(value: string): string[] {
  const lower = value.toLowerCase()
  return [
    "Show internal shadow-tool coverage with quantified overlap against current SaaS scope.",
    lower.includes("seat") || lower.includes("license")
      ? "Negotiate down seat commitments and move to usage-aligned pricing."
      : "Ask for pricing tied only to unique features not replaced by internal agents.",
    "Require export portability, SLA commitments, and written delta versus your internal stack.",
  ]
}

function createEmptyAgentSnapshot(): AgentPlatformSnapshot {
  return {
    source: "supabase",
    agents: [],
    versions: [],
    connectors: [],
    runs: [],
    skillEvents: [],
    shadowTools: [],
    schedules: [],
    evaluations: [],
    approvals: [],
    templates: [],
    models: [],
    economics: {
      weeklyEfficiencyGainPct: 0,
      tokenSpendUsdMonthly: 0,
      tokenBudgetUtilizationPct: 0,
      projectedOpexCompressionPct: 0,
      computeSharePct: 0,
      recommendations: [],
    },
    governance: {
      pendingApprovals: 0,
      highRiskConnectors: 0,
      rollbackReadyAgents: 0,
      complianceNotes: [],
    },
  }
}

export function AgentsPanel() {
  const [snapshot, setSnapshot] = useState<AgentPlatformSnapshot>(createEmptyAgentSnapshot())
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string>("")
  const [message, setMessage] = useState("")
  const [prompt, setPrompt] = useState(
    "Scrape top podcasts for advertisers, cross-check CRM, draft outreach, and post summary to Slack.",
  )
  const [preferredModelId, setPreferredModelId] = useState("")
  const [budget, setBudget] = useState("900")
  const [connectorDrafts, setConnectorDrafts] = useState<Record<string, ConnectorDraft>>({})
  const [contractNotes, setContractNotes] = useState("")
  const [playbook, setPlaybook] = useState<string[]>([])
  const [skillSource, setSkillSource] = useState("internal wiki")
  const [learnedSkill, setLearnedSkill] = useState("")
  const [skillNote, setSkillNote] = useState("")
  const [skillAccepted, setSkillAccepted] = useState(true)
  const [shadowToolName, setShadowToolName] = useState("")
  const [shadowToolDescription, setShadowToolDescription] = useState("")
  const [shadowToolCoverage, setShadowToolCoverage] = useState("80")
  const [scheduleKind, setScheduleKind] = useState<"workflow_run" | "self_improvement" | "evaluation">("workflow_run")
  const [scheduleFrequency, setScheduleFrequency] = useState<"hourly" | "daily" | "weekly" | "custom">("daily")
  const [scheduleIntervalMinutes, setScheduleIntervalMinutes] = useState("1440")
  const [scheduleEnabled, setScheduleEnabled] = useState(true)
  const [scheduleBenchmarkName, setScheduleBenchmarkName] = useState("scheduled_quality_benchmark")
  const [scheduleThresholdPct, setScheduleThresholdPct] = useState("85")
  const [evaluationBenchmarkName, setEvaluationBenchmarkName] = useState("manual_quality_benchmark")
  const [evaluationThresholdPct, setEvaluationThresholdPct] = useState("85")
  const [approvalActionType, setApprovalActionType] = useState("connector_write_action")
  const [approvalPayloadSummary, setApprovalPayloadSummary] = useState("")
  const [approvalRiskLevel, setApprovalRiskLevel] = useState<"low" | "medium" | "high">("medium")
  const [approvalConnectorId, setApprovalConnectorId] = useState("")
  const [approvalResolverNote, setApprovalResolverNote] = useState("")

  const resolveActiveAccessToken = useCallback(async (): Promise<string | null> => {
    const storageToken = resolveSupabaseAccessToken()
    if (storageToken) {
      return storageToken
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      return null
    }

    const { data, error } = await supabase.auth.getSession()
    if (error) {
      return null
    }

    return data.session?.access_token || null
  }, [])

  const loadSnapshot = useCallback(async (tokenOverride?: string | null) => {
    const token = tokenOverride ?? accessToken
    if (!token) {
      setMessage("Sign in with Supabase to view the control plane.")
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setMessage("")
    try {
      const response = await fetch("/api/agents/control-plane", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        setMessage("Sign in with Supabase to view the control plane.")
        return
      }
      if (!response.ok) throw new Error("control plane fetch failed")
      const payload = (await response.json()) as { ok?: boolean; data?: AgentPlatformSnapshot }
      const snapshotData = payload.data
      if (payload.ok && snapshotData) {
        setSnapshot(snapshotData)
        setSelectedAgentId((current) => current || snapshotData.agents[0]?.id || "")
      }
    } catch {
      setMessage("Unable to load live control-plane data.")
    } finally {
      setIsLoading(false)
    }
  }, [accessToken])

  const refreshSnapshot = useCallback(async () => {
    const token = await resolveActiveAccessToken()
    setAccessToken(token)
    await loadSnapshot(token)
  }, [loadSnapshot, resolveActiveAccessToken])

  useEffect(() => {
    let isCancelled = false
    void refreshSnapshot()

    const onStorage = () => {
      if (!isCancelled) {
        void refreshSnapshot()
      }
    }

    const supabase = getSupabaseClient()
    const authSubscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (isCancelled) {
        return
      }

      const token = session?.access_token || null
      setAccessToken(token)
      if (token) {
        setMessage("")
        void loadSnapshot(token)
        return
      }

      setSnapshot(createEmptyAgentSnapshot())
      setMessage("Sign in with Supabase to view the control plane.")
    })

    window.addEventListener("storage", onStorage)
    return () => {
      isCancelled = true
      window.removeEventListener("storage", onStorage)
      authSubscription?.data.subscription.unsubscribe()
    }
  }, [loadSnapshot, refreshSnapshot])

  useEffect(() => {
    if (!preferredModelId && snapshot.models[0]) {
      setPreferredModelId(snapshot.models[0].id)
    }
  }, [preferredModelId, snapshot.models])

  useEffect(() => {
    const drafts: Record<string, ConnectorDraft> = {}
    for (const connector of snapshot.connectors) {
      drafts[connector.id] = {
        permissionMode: connector.permissionMode,
        scopesText: connector.scopes.join(", "),
      }
    }
    setConnectorDrafts(drafts)
  }, [snapshot.connectors])

  const selectedAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === selectedAgentId) || snapshot.agents[0] || null,
    [selectedAgentId, snapshot.agents],
  )

  const versions = useMemo(
    () =>
      selectedAgent
        ? snapshot.versions.filter((version) => version.agentId === selectedAgent.id).sort((a, b) => b.versionNumber - a.versionNumber)
        : [],
    [selectedAgent, snapshot.versions],
  )

  const schedules = useMemo(
    () =>
      selectedAgent
        ? snapshot.schedules
            .filter((schedule) => schedule.agentId === selectedAgent.id)
            .sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime())
        : [],
    [selectedAgent, snapshot.schedules],
  )

  const evaluations = useMemo(
    () =>
      selectedAgent
        ? snapshot.evaluations
            .filter((evaluation) => evaluation.agentId === selectedAgent.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [selectedAgent, snapshot.evaluations],
  )

  const approvals = useMemo(
    () =>
      selectedAgent
        ? snapshot.approvals
            .filter((approval) => approval.agentId === selectedAgent.id)
            .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
        : [],
    [selectedAgent, snapshot.approvals],
  )

  const preview = useMemo(
    () =>
      buildAgentDraftFromPromptLegacy({
        prompt,
        preferredModelId,
        tokenBudgetUsdMonthly: Number(budget),
      }),
    [budget, preferredModelId, prompt],
  )

  const postAction = async (body: Record<string, unknown>) => {
    if (!accessToken) {
      setMessage("Supabase authentication is required for write actions.")
      return null
    }
    const response = await fetch("/api/agents/control-plane", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as { ok?: boolean; error?: string }
    if (!response.ok || !payload.ok) {
      setMessage(payload.error || "Action failed.")
      return null
    }
    await loadSnapshot(accessToken)
    return payload
  }

  const createAgent = async () => {
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "create_agent_from_prompt",
        prompt,
        preferredModelId,
        tokenBudgetUsdMonthly: Number(budget),
      })
      if (payload) setMessage("Agent draft created.")
    } finally {
      setIsSaving(false)
    }
  }

  const createVersion = async () => {
    if (!selectedAgent) return
    setIsSaving(true)
    try {
      const payload = await postAction({ action: "create_version", agentId: selectedAgent.id, changeNote: "Manual snapshot" })
      if (payload) setMessage("Version snapshot created.")
    } finally {
      setIsSaving(false)
    }
  }

  const rollbackVersion = async (versionId: string) => {
    if (!selectedAgent) return
    setIsSaving(true)
    try {
      const payload = await postAction({ action: "rollback_agent", agentId: selectedAgent.id, versionId })
      if (payload) setMessage("Rollback applied.")
    } finally {
      setIsSaving(false)
    }
  }

  const saveConnector = async (connectorId: string) => {
    const draft = connectorDrafts[connectorId]
    if (!draft) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "update_connector_permissions",
        connectorId,
        permissionMode: draft.permissionMode,
        scopes: parseScopes(draft.scopesText),
      })
      if (payload) setMessage("Connector scope updated.")
    } finally {
      setIsSaving(false)
    }
  }

  const runConnectorHealthChecks = async () => {
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "run_connector_health_checks",
      })
      if (payload) {
        const details = payload as {
          checked?: number
          updated?: number
          degraded?: number
          notConnected?: number
        }
        setMessage(
          `Connector health checks complete. checked=${details.checked ?? 0}, updated=${details.updated ?? 0}, degraded=${details.degraded ?? 0}, not_connected=${details.notConnected ?? 0}.`,
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  const rotateConnectorSecretForConnector = async (connectorId: string) => {
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "rotate_connector_secret",
        connectorId,
      })
      if (payload) {
        setMessage("Connector secret rotation completed.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const setAgentLifecycleStatus = async (status: "active" | "paused") => {
    if (!selectedAgent) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "set_agent_status",
        agentId: selectedAgent.id,
        status,
      })
      if (payload) {
        setMessage(`Agent status set to ${status}.`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const runAgentNow = async () => {
    if (!selectedAgent) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "run_agent_workflow",
        agentId: selectedAgent.id,
        summary: "Manual run started from Agent Control panel.",
      })
      if (payload) {
        setMessage("Agent run created and logged.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const appendSkillEvent = async () => {
    if (!selectedAgent || !learnedSkill.trim()) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "append_skill_event",
        agentId: selectedAgent.id,
        source: skillSource,
        skill: learnedSkill.trim(),
        note: skillNote.trim() || undefined,
        accepted: skillAccepted,
        testStatus: skillAccepted ? "passed" : "pending",
      })
      if (payload) {
        setMessage("Skill event recorded.")
        setLearnedSkill("")
        setSkillNote("")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const createShadowToolRecord = async () => {
    if (!shadowToolName.trim()) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "create_shadow_tool",
        name: shadowToolName.trim(),
        description: shadowToolDescription.trim(),
        mappedAgentId: selectedAgent?.id,
        coveragePct: Number(shadowToolCoverage),
        status: "active",
      })
      if (payload) {
        setMessage("Shadow tool record created.")
        setShadowToolName("")
        setShadowToolDescription("")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const upsertSchedule = async () => {
    if (!selectedAgent) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "upsert_schedule",
        agentId: selectedAgent.id,
        kind: scheduleKind,
        frequency: scheduleFrequency,
        intervalMinutes: parseNumericInput(scheduleIntervalMinutes, 1440),
        enabled: scheduleEnabled,
        benchmarkName: scheduleKind === "evaluation" ? scheduleBenchmarkName : undefined,
        thresholdPct: scheduleKind === "evaluation" ? parseNumericInput(scheduleThresholdPct, 85) : undefined,
      })
      if (payload) {
        setMessage("Schedule saved.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const runEvaluationNow = async () => {
    if (!selectedAgent || !evaluationBenchmarkName.trim()) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "run_evaluation",
        agentId: selectedAgent.id,
        benchmarkName: evaluationBenchmarkName.trim(),
        thresholdPct: parseNumericInput(evaluationThresholdPct, 85),
      })
      if (payload) {
        setMessage("Evaluation run completed.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const createApproval = async () => {
    if (!selectedAgent || !approvalPayloadSummary.trim() || !approvalActionType.trim()) return
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "create_approval_request",
        agentId: selectedAgent.id,
        connectorId: approvalConnectorId.trim() || undefined,
        actionType: approvalActionType.trim(),
        payloadSummary: approvalPayloadSummary.trim(),
        riskLevel: approvalRiskLevel,
      })
      if (payload) {
        setMessage("Approval request created.")
        setApprovalPayloadSummary("")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const resolveApproval = async (approvalId: string, decision: "approved" | "rejected") => {
    setIsSaving(true)
    try {
      const payload = await postAction({
        action: "resolve_approval_request",
        approvalId,
        decision,
        resolverNote: approvalResolverNote.trim() || undefined,
      })
      if (payload) {
        setMessage(`Approval ${decision}.`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const exportAgent = () => {
    if (!selectedAgent) return
    const blob = new Blob(
      [
        JSON.stringify(
          {
            agent: selectedAgent,
            versions,
            connectors: snapshot.connectors.filter((connector) => selectedAgent.connectors.includes(connector.provider)),
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${selectedAgent.name.toLowerCase().replace(/\s+/g, "-")}-chain.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agent Control Plane</h1>
            <p className="text-sm text-muted-foreground">No-code training, fleet ops, scoped connectors, economics, rollback.</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="secondary" className="text-[10px] uppercase">{snapshot.source}</Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">{snapshot.agents.length} agents</Badge>
              <Badge variant="secondary" className={cn("text-[10px] uppercase", accessToken ? "bg-accent/15 text-accent" : "bg-chart-4/15 text-chart-4")}>
                {accessToken ? "auth connected" : "auth missing"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => void refreshSnapshot()} disabled={isLoading}>
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading ? "animate-spin" : "")} />
              Refresh
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportAgent} disabled={!selectedAgent}>
              <Download className="w-3.5 h-3.5" />
              Export Chain
            </Button>
          </div>
        </div>

        {message ? <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{message}</div> : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground uppercase">Weekly Gain</span><Gauge className="w-4 h-4 text-primary" /></div><div className="text-2xl font-bold text-primary">{snapshot.economics.weeklyEfficiencyGainPct}%</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Token Burn</div><div className="text-2xl font-bold text-chart-3">${snapshot.economics.tokenSpendUsdMonthly}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">OPEX Compression</div><div className="text-2xl font-bold text-accent">{snapshot.economics.projectedOpexCompressionPct}%</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground uppercase">Approvals</span><ShieldCheck className="w-4 h-4 text-chart-4" /></div><div className="text-2xl font-bold text-chart-4">{snapshot.governance.pendingApprovals}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Natural Language Agent Builder</CardTitle>
              <CardDescription className="text-xs">Describe a process and generate a secure, scoped agent draft.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-24 text-sm" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select className="h-9 rounded-md border border-border bg-background px-2 text-xs" value={preferredModelId} onChange={(event) => setPreferredModelId(event.target.value)}>
                  {snapshot.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
                <Input value={budget} onChange={(event) => setBudget(event.target.value)} type="number" min={50} max={20000} className="h-9 text-xs" />
                <Button className="h-9 text-xs gap-1.5" onClick={() => void createAgent()} disabled={isSaving || prompt.trim().length < 8}><Bot className="w-3.5 h-3.5" />Create Draft</Button>
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs">
                <div className="font-semibold text-foreground">{preview.name}</div>
                <div className="text-muted-foreground mt-1">{preview.purpose}</div>
                <div className="flex flex-wrap gap-1 mt-2">{preview.connectors.map((connector: string) => <Badge key={connector} variant="secondary" className="text-[10px]">{connector}</Badge>)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Fleet Manager</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {selectedAgent ? (
                <div className="rounded-lg border border-border bg-secondary/40 p-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => void runAgentNow()} disabled={isSaving}>
                    <PlayCircle className="w-3.5 h-3.5" />
                    Run Now
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => void setAgentLifecycleStatus("active")} disabled={isSaving}>
                    <PlayCircle className="w-3.5 h-3.5" />
                    Resume
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => void setAgentLifecycleStatus("paused")} disabled={isSaving}>
                    <PauseCircle className="w-3.5 h-3.5" />
                    Pause
                  </Button>
                </div>
              ) : null}
              {snapshot.agents.map((agent) => (
                <button key={agent.id} type="button" onClick={() => setSelectedAgentId(agent.id)} className={cn("w-full rounded-lg border p-2 text-left", selectedAgent?.id === agent.id ? "border-primary bg-primary/5" : "border-border bg-secondary/40")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-foreground truncate">{agent.name}</div>
                    <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(agent.status))}>{agent.status}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">Gain {agent.weeklyEfficiencyGainPct}% | ${agent.tokenBudgetUsdMonthly}/mo</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-chart-4" />
                Human Approval Queue
              </CardTitle>
              <CardDescription className="text-xs">
                Queue risky actions for explicit approve/reject decisions with audit history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input
                  className="h-8 text-xs"
                  value={approvalActionType}
                  onChange={(event) => setApprovalActionType(event.target.value)}
                  placeholder="Action type"
                />
                <Input
                  className="h-8 text-xs"
                  value={approvalConnectorId}
                  onChange={(event) => setApprovalConnectorId(event.target.value)}
                  placeholder="Connector ID (optional)"
                />
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={approvalRiskLevel}
                  onChange={(event) => setApprovalRiskLevel(event.target.value as "low" | "medium" | "high")}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
                <Button size="sm" className="h-8 text-xs" onClick={() => void createApproval()} disabled={isSaving || !selectedAgent || !approvalPayloadSummary.trim()}>
                  Create Request
                </Button>
              </div>
              <Textarea
                value={approvalPayloadSummary}
                onChange={(event) => setApprovalPayloadSummary(event.target.value)}
                className="min-h-16 text-xs"
                placeholder="Summarize the action payload and impact."
              />
              <Input
                className="h-8 text-xs"
                value={approvalResolverNote}
                onChange={(event) => setApprovalResolverNote(event.target.value)}
                placeholder="Resolver note (used when approve/reject)"
              />
              <div className="space-y-2">
                {approvals.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No approval requests for this agent.
                  </div>
                ) : (
                  approvals.slice(0, 10).map((approval) => (
                    <div key={approval.id} className="rounded-lg border border-border bg-secondary/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-foreground truncate">{approval.actionType}</div>
                        <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(approval.status))}>
                          {approval.status}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        risk: {approval.riskLevel} | {new Date(approval.requestedAt).toLocaleString()}
                        {approval.connectorId ? ` | connector: ${approval.connectorId}` : ""}
                      </div>
                      <div className="text-[11px] text-foreground mt-1">{approval.payloadSummary}</div>
                      {approval.status === "pending" ? (
                        <div className="flex items-center gap-2 mt-2">
                          <Button size="sm" className="h-6 text-[11px]" onClick={() => void resolveApproval(approval.id, "approved")} disabled={isSaving}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => void resolveApproval(approval.id, "rejected")} disabled={isSaving}>
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Approval Metrics</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-md border border-border bg-secondary/40 p-2 text-xs text-foreground">
                Pending: {approvals.filter((item) => item.status === "pending").length}
              </div>
              <div className="rounded-md border border-border bg-secondary/40 p-2 text-xs text-foreground">
                Approved: {approvals.filter((item) => item.status === "approved").length}
              </div>
              <div className="rounded-md border border-border bg-secondary/40 p-2 text-xs text-foreground">
                Rejected: {approvals.filter((item) => item.status === "rejected").length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-primary" />
                Scheduled Automation
              </CardTitle>
              <CardDescription className="text-xs">
                Configure recurring workflow runs, self-improvement scans, and automated evaluations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={scheduleKind}
                  onChange={(event) => setScheduleKind(event.target.value as "workflow_run" | "self_improvement" | "evaluation")}
                >
                  <option value="workflow_run">workflow_run</option>
                  <option value="self_improvement">self_improvement</option>
                  <option value="evaluation">evaluation</option>
                </select>
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={scheduleFrequency}
                  onChange={(event) => setScheduleFrequency(event.target.value as "hourly" | "daily" | "weekly" | "custom")}
                >
                  <option value="hourly">hourly</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="custom">custom</option>
                </select>
                <Input
                  className="h-8 text-xs"
                  value={scheduleIntervalMinutes}
                  onChange={(event) => setScheduleIntervalMinutes(event.target.value)}
                  type="number"
                  min={15}
                  max={43200}
                  placeholder="Interval minutes"
                />
                <Input
                  className="h-8 text-xs"
                  value={scheduleBenchmarkName}
                  onChange={(event) => setScheduleBenchmarkName(event.target.value)}
                  placeholder="Benchmark"
                  disabled={scheduleKind !== "evaluation"}
                />
                <Input
                  className="h-8 text-xs"
                  value={scheduleThresholdPct}
                  onChange={(event) => setScheduleThresholdPct(event.target.value)}
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Threshold %"
                  disabled={scheduleKind !== "evaluation"}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(event) => setScheduleEnabled(event.target.checked)}
                  />
                  Schedule enabled
                </label>
                <Button size="sm" className="h-7 text-xs" onClick={() => void upsertSchedule()} disabled={isSaving || !selectedAgent}>
                  Save Schedule
                </Button>
              </div>
              <div className="space-y-2">
                {schedules.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No schedules configured for this agent.
                  </div>
                ) : (
                  schedules.map((schedule) => (
                    <div key={schedule.id} className="rounded-lg border border-border bg-secondary/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-foreground">
                          {schedule.kind} | every {schedule.intervalMinutes}m
                        </div>
                        <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(schedule.lastStatus || (schedule.enabled ? "active" : "paused")))}>
                          {schedule.lastStatus || (schedule.enabled ? "enabled" : "disabled")}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        next: {new Date(schedule.nextRunAt).toLocaleString()}
                        {schedule.lastRunAt ? ` | last: ${new Date(schedule.lastRunAt).toLocaleString()}` : ""}
                        {schedule.config?.benchmarkName ? ` | benchmark: ${schedule.config.benchmarkName}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-chart-3" />
                Prompt Evaluation
              </CardTitle>
              <CardDescription className="text-xs">
                Execute benchmark checks and capture pass/fail trends per agent version.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={evaluationBenchmarkName}
                onChange={(event) => setEvaluationBenchmarkName(event.target.value)}
                className="h-8 text-xs"
                placeholder="Benchmark name"
              />
              <Input
                value={evaluationThresholdPct}
                onChange={(event) => setEvaluationThresholdPct(event.target.value)}
                className="h-8 text-xs"
                type="number"
                min={0}
                max={100}
                placeholder="Threshold %"
              />
              <Button size="sm" className="w-full h-8 text-xs" onClick={() => void runEvaluationNow()} disabled={isSaving || !selectedAgent || !evaluationBenchmarkName.trim()}>
                Run Evaluation
              </Button>
              <div className="space-y-2">
                {evaluations.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    No evaluations logged yet.
                  </div>
                ) : (
                  evaluations.slice(0, 6).map((evaluation) => (
                    <div key={evaluation.id} className="rounded-lg border border-border bg-secondary/40 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-foreground truncate">{evaluation.benchmarkName}</div>
                        <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(evaluation.status))}>{evaluation.status}</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        score {evaluation.scorePct}% | threshold {evaluation.thresholdPct}%
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Recursive Self-Improvement Loop
              </CardTitle>
              <CardDescription className="text-xs">
                Record learned skills from approved sources and append them to agent skill files after validation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input value={skillSource} onChange={(event) => setSkillSource(event.target.value)} className="h-8 text-xs" placeholder="Source" />
                <Input value={learnedSkill} onChange={(event) => setLearnedSkill(event.target.value)} className="h-8 text-xs" placeholder="Learned skill" />
                <Input value={skillNote} onChange={(event) => setSkillNote(event.target.value)} className="h-8 text-xs" placeholder="Validation note" />
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={skillAccepted ? "accepted" : "pending"}
                  onChange={(event) => setSkillAccepted(event.target.value === "accepted")}
                >
                  <option value="accepted">accepted</option>
                  <option value="pending">pending</option>
                </select>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="h-7 text-xs" onClick={() => void appendSkillEvent()} disabled={isSaving || !selectedAgent || !learnedSkill.trim()}>
                  Append Skill Event
                </Button>
              </div>
              <div className="space-y-2">
                {snapshot.skillEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-lg border border-border bg-secondary/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground truncate">{event.skill}</div>
                      <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(event.testStatus))}>{event.testStatus}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {event.source} | {event.accepted ? "accepted" : "pending"}{event.note ? ` | ${event.note}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="w-4 h-4 text-chart-3" />
                Shadow SaaS Builder
              </CardTitle>
              <CardDescription className="text-xs">
                Track internal tool clones and replacement coverage versus external SaaS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input value={shadowToolName} onChange={(event) => setShadowToolName(event.target.value)} className="h-8 text-xs" placeholder="Shadow tool name" />
              <Input value={shadowToolDescription} onChange={(event) => setShadowToolDescription(event.target.value)} className="h-8 text-xs" placeholder="Description" />
              <Input value={shadowToolCoverage} onChange={(event) => setShadowToolCoverage(event.target.value)} className="h-8 text-xs" type="number" min={0} max={100} placeholder="Coverage %" />
              <Button size="sm" className="w-full h-8 text-xs" onClick={() => void createShadowToolRecord()} disabled={isSaving || !shadowToolName.trim()}>
                Create Shadow Tool
              </Button>
              <div className="space-y-2">
                {snapshot.shadowTools.slice(0, 6).map((tool) => (
                  <div key={tool.id} className="rounded-lg border border-border bg-secondary/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground truncate">{tool.name}</div>
                      <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(tool.status))}>{tool.status}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {tool.coveragePct}% coverage{tool.mappedAgentId ? ` | ${tool.mappedAgentId}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold">Secure Connector Hub</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => void runConnectorHealthChecks()}
                  disabled={isSaving}
                >
                  Health Check
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {snapshot.connectors.map((connector) => {
                const draft = connectorDrafts[connector.id] || { permissionMode: connector.permissionMode, scopesText: connector.scopes.join(", ") }
                return (
                  <div key={connector.id} className="rounded-lg border border-border bg-secondary/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium text-foreground">{connector.provider}</div>
                      <Badge variant="secondary" className={cn("text-[10px] uppercase", statusClass(connector.status))}>{connector.status}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                      <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={draft.permissionMode} onChange={(event) => setConnectorDrafts((current) => ({ ...current, [connector.id]: { ...draft, permissionMode: event.target.value as AgentPermissionMode } }))}>
                        <option value="read_only">read_only</option>
                        <option value="write_with_approval">write_with_approval</option>
                        <option value="scheduled_only">scheduled_only</option>
                        <option value="disabled">disabled</option>
                      </select>
                        <Input className="h-8 text-xs md:col-span-2" value={draft.scopesText} onChange={(event) => setConnectorDrafts((current) => ({ ...current, [connector.id]: { ...draft, scopesText: event.target.value } }))} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-2">
                      {connector.healthStatusReason ? `health: ${connector.healthStatusReason}` : "health: no health check metadata yet"}
                      {connector.healthCheckedAt ? ` | checked: ${new Date(connector.healthCheckedAt).toLocaleString()}` : ""}
                      {connector.secretRotatedAt ? ` | rotated: ${new Date(connector.secretRotatedAt).toLocaleString()}` : ""}
                      {connector.secretKeyVersion ? ` | key: ${connector.secretKeyVersion}` : ""}
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => void rotateConnectorSecretForConnector(connector.id)}
                        disabled={isSaving}
                      >
                        Rotate Secret
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void saveConnector(connector.id)} disabled={isSaving}>Save Scope</Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Handshake className="w-4 h-4 text-chart-3" />Negotiation Playbook</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Textarea value={contractNotes} onChange={(event) => setContractNotes(event.target.value)} className="min-h-20 text-xs" placeholder="Contract terms, seat counts, renewal pressure..." />
              <Button size="sm" className="w-full h-8 text-xs" onClick={() => setPlaybook(playbookFromNotes(contractNotes))}>Generate</Button>
              {playbook.length > 0 ? <div className="rounded-lg border border-border bg-secondary/40 p-2 space-y-1">{playbook.map((item) => <p key={item} className="text-[11px] text-foreground">{item}</p>)}</div> : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><History className="w-4 h-4 text-primary" />Versioning + Rollback</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button size="sm" variant="outline" className="text-xs" onClick={() => void createVersion()} disabled={!selectedAgent || isSaving}>Create Version Snapshot</Button>
              {versions.length === 0 ? <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No versions found for selected agent.</div> : versions.slice(0, 6).map((version) => (
                <div key={version.id} className="rounded-lg border border-border bg-secondary/40 p-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-foreground">v{version.versionNumber}</div>
                    <div className="text-[11px] text-muted-foreground">{version.changeNote}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => void rollbackVersion(version.id)} disabled={isSaving}>Rollback</Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Scale Guardrails</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {snapshot.governance.complianceNotes.map((note) => <div key={note} className="rounded-md border border-border bg-secondary/40 p-2 text-[11px] text-foreground">{note}</div>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
