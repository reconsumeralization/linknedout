"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  DollarSign,
  Pause,
  Play,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

type PortfolioTab = "overview" | "companies" | "decisions" | "agents"

const DEMO_COMPANIES = [
  { id: "1", company_name: "Sovereign SaaS", company_type: "saas", domain: "AI Tools", status: "active", autopilot_enabled: true, monthly_revenue_usd: 42000, monthly_cost_usd: 18000, health_score: 87 },
  { id: "2", company_name: "Edge Commerce", company_type: "ecommerce", domain: "Hardware", status: "active", autopilot_enabled: true, monthly_revenue_usd: 28000, monthly_cost_usd: 12000, health_score: 74 },
  { id: "3", company_name: "Neural Media", company_type: "media", domain: "Content", status: "active", autopilot_enabled: false, monthly_revenue_usd: 15000, monthly_cost_usd: 8000, health_score: 68 },
  { id: "4", company_name: "Artisan Agency", company_type: "agency", domain: "Design", status: "active", autopilot_enabled: true, monthly_revenue_usd: 35000, monthly_cost_usd: 14000, health_score: 82 },
  { id: "5", company_name: "Tribal Marketplace", company_type: "marketplace", domain: "Talent", status: "active", autopilot_enabled: true, monthly_revenue_usd: 22000, monthly_cost_usd: 9500, health_score: 79 },
  { id: "6", company_name: "Sovereign Consulting", company_type: "consulting", domain: "Strategy", status: "active", autopilot_enabled: false, monthly_revenue_usd: 18000, monthly_cost_usd: 6000, health_score: 91 },
]

const DEMO_DECISIONS = [
  { id: "1", company_name: "Sovereign SaaS", decision_type: "strategic", decision: "Expand to EU market — GDPR compliance already built in", impact_usd: 120000, delegated_to_agent: false, created_at: "2026-03-27T14:00:00Z" },
  { id: "2", company_name: "Edge Commerce", decision_type: "product", decision: "Launch subscription model for recurring hardware orders", impact_usd: 45000, delegated_to_agent: true, created_at: "2026-03-27T10:00:00Z" },
  { id: "3", company_name: "Neural Media", decision_type: "hiring", decision: "Delegate content production to AI agent fleet — reduce FTE by 3", impact_usd: 36000, delegated_to_agent: true, created_at: "2026-03-26T16:00:00Z" },
  { id: "4", company_name: "Artisan Agency", decision_type: "financial", decision: "Cut unused SaaS subscriptions — save $2,400/mo", impact_usd: 28800, delegated_to_agent: true, created_at: "2026-03-26T09:00:00Z" },
]

const DEMO_AGENTS = [
  { company_name: "Sovereign SaaS", agent_role: "ceo", status: "active", runs_today: 12, total_runs: 847 },
  { company_name: "Sovereign SaaS", agent_role: "cto", status: "active", runs_today: 8, total_runs: 623 },
  { company_name: "Sovereign SaaS", agent_role: "cmo", status: "active", runs_today: 5, total_runs: 412 },
  { company_name: "Edge Commerce", agent_role: "ceo", status: "active", runs_today: 9, total_runs: 534 },
  { company_name: "Edge Commerce", agent_role: "cfo", status: "active", runs_today: 3, total_runs: 289 },
  { company_name: "Artisan Agency", agent_role: "ceo", status: "active", runs_today: 7, total_runs: 456 },
  { company_name: "Artisan Agency", agent_role: "coo", status: "active", runs_today: 11, total_runs: 678 },
  { company_name: "Tribal Marketplace", agent_role: "ceo", status: "active", runs_today: 6, total_runs: 312 },
]

type PortfolioCompany = {
  id: string
  company_name: string
  company_type: string
  domain: string
  status: string
  autopilot_enabled: boolean
  monthly_revenue_usd: number
  monthly_cost_usd: number
  health_score: number
}

type AgentRow = {
  company_name: string
  agent_role: string
  status: string
  runs_today: number
  total_runs: number
}

type DecisionRow = {
  id: string
  company_name: string
  decision_type: string
  decision: string
  impact_usd: number
  delegated_to_agent: boolean
  created_at: string
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function mapCompanyRow(row: Record<string, unknown>): PortfolioCompany {
  return {
    id: String(row.id ?? ""),
    company_name: String(row.company_name ?? "—"),
    company_type: String(row.company_type ?? "—"),
    domain: String(row.domain ?? "—"),
    status: String(row.status ?? "active"),
    autopilot_enabled: Boolean(row.autopilot_enabled),
    monthly_revenue_usd: num(row.monthly_revenue_usd),
    monthly_cost_usd: num(row.monthly_cost_usd),
    health_score: Math.round(num(row.health_score)),
  }
}

function healthBadge(score: number) {
  const variant = score >= 80 ? "default" : score >= 60 ? "secondary" : "destructive"
  return <Badge variant={variant}>{score}</Badge>
}

type DataMode = "loading" | "demo" | "empty" | "live"

export default function PortfolioPanel() {
  const [tab, setTab] = useState<PortfolioTab>("overview")
  const [mode, setMode] = useState<DataMode>(() =>
    typeof window !== "undefined" && resolveSupabaseAccessToken() ? "loading" : "demo",
  )
  const [companies, setCompanies] = useState<PortfolioCompany[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [decisions, setDecisions] = useState<DecisionRow[]>([])

  const loadPortfolio = useCallback(async () => {
    const sb = getSupabaseClient()
    const token = resolveSupabaseAccessToken()
    if (!sb || !token) {
      setMode("demo")
      setCompanies([])
      setAgents([])
      setDecisions([])
      return
    }

    setMode("loading")
    try {
      const { data: compRows, error: cErr } = await sb
        .from("company_portfolio")
        .select("*")
        .order("health_score", { ascending: true })

      if (cErr) {
        setMode("demo")
        setCompanies([])
        setAgents([])
        setDecisions([])
        return
      }

      if (!compRows?.length) {
        setMode("empty")
        setCompanies([])
        setAgents([])
        setDecisions([])
        return
      }

      setMode("live")
      setCompanies((compRows as Record<string, unknown>[]).map(mapCompanyRow))

      const { data: agentRows } = await sb
        .from("company_agents")
        .select("agent_role, status, runs_today, total_runs, company_portfolio(company_name)")
        .order("created_at", { ascending: false })

      setAgents(
        (agentRows ?? []).map((r: Record<string, unknown>) => {
          const nest = r.company_portfolio as { company_name?: string } | null
          return {
            company_name: nest?.company_name ?? "—",
            agent_role: String(r.agent_role ?? "—"),
            status: String(r.status ?? "active"),
            runs_today: Math.round(num(r.runs_today)),
            total_runs: Math.round(num(r.total_runs)),
          }
        }),
      )

      const { data: decRows } = await sb
        .from("operator_decisions")
        .select("id, decision_type, decision, impact_usd, delegated_to_agent, created_at, company_portfolio(company_name)")
        .order("created_at", { ascending: false })
        .limit(40)

      setDecisions(
        (decRows ?? []).map((r: Record<string, unknown>) => {
          const nest = r.company_portfolio as { company_name?: string } | null
          return {
            id: String(r.id ?? ""),
            company_name: nest?.company_name ?? "—",
            decision_type: String(r.decision_type ?? "—"),
            decision: String(r.decision ?? ""),
            impact_usd: num(r.impact_usd),
            delegated_to_agent: Boolean(r.delegated_to_agent),
            created_at: String(r.created_at ?? new Date().toISOString()),
          }
        }),
      )
    } catch {
      setMode("demo")
      setCompanies([])
      setAgents([])
      setDecisions([])
    }
  }, [])

  useEffect(() => {
    void loadPortfolio()
  }, [loadPortfolio])

  const displayCompanies = useMemo((): PortfolioCompany[] => {
    if (mode === "live") return companies
    if (mode === "empty") return []
    return DEMO_COMPANIES
  }, [mode, companies])

  const displayAgents = useMemo((): AgentRow[] => {
    if (mode === "live" && agents.length > 0) return agents
    if (mode === "live") return []
    return DEMO_AGENTS
  }, [mode, agents])

  const displayDecisions = useMemo((): DecisionRow[] => {
    if (mode === "live" && decisions.length > 0) return decisions
    if (mode === "live") return []
    return DEMO_DECISIONS.map((d) => ({ ...d }))
  }, [mode, decisions])

  const totalRevenue = displayCompanies.reduce((s, c) => s + c.monthly_revenue_usd, 0)
  const totalCost = displayCompanies.reduce((s, c) => s + c.monthly_cost_usd, 0)
  const netProfit = totalRevenue - totalCost
  const avgHealth =
    displayCompanies.length > 0
      ? Math.round(displayCompanies.reduce((s, c) => s + c.health_score, 0) / displayCompanies.length)
      : 0
  const onAutopilot = displayCompanies.filter((c) => c.autopilot_enabled).length

  const lowestHealthCompany = useMemo(() => {
    if (displayCompanies.length === 0) return null
    return displayCompanies.reduce((a, b) => (a.health_score <= b.health_score ? a : b))
  }, [displayCompanies])

  const subtitle = useMemo(() => {
    if (mode === "demo") return `Sample data — sign in to load your portfolio (${DEMO_COMPANIES.length} demo companies)`
    if (mode === "empty") return "No companies yet — add via Sovereign tools or migrations"
    if (mode === "loading") return "Loading portfolio…"
    return `Run ${displayCompanies.length} companies from one cockpit`
  }, [mode, displayCompanies.length])

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Building2 className="h-6 w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">Portfolio Command</h2>
                {mode === "live" ? (
                  <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/40 text-emerald-800 dark:text-emerald-400">
                    Live data
                  </Badge>
                ) : null}
                {mode === "loading" ? (
                  <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                    Loading…
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadPortfolio()} disabled={mode === "loading"}>
            <RefreshCw className={`h-4 w-4 mr-2 ${mode === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {mode === "demo" ? (
          <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100 dark:border-amber-500/35">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            <AlertTitle className="text-sm">Sample data mode</AlertTitle>
            <AlertDescription className="text-xs text-amber-900/90 dark:text-amber-200/90">
              Tables below show demo companies only. Sign in with Supabase, apply portfolio migrations to your project, and use Refresh to load live rows from{" "}
              <code className="text-[10px]">company_portfolio</code>.
            </AlertDescription>
          </Alert>
        ) : null}

        {mode === "empty" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No portfolio companies</CardTitle>
              <CardDescription>
                You are signed in, but <code className="text-xs">company_portfolio</code> has no rows. Apply migrations (including{" "}
                <code className="text-[10px]">20260332000000_multi_company_orchestration.sql</code>), run local{" "}
                <code className="text-[10px]">supabase db reset</code> to apply <code className="text-[10px]">seed.sql</code>, or insert via SQL / Sovereign tools.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-[10px] text-muted-foreground mb-1">Example SQL (replace user id with your <code className="text-[9px]">auth.users.id</code>):</p>
              <pre className="text-[10px] overflow-x-auto rounded-md border border-border bg-muted/50 p-2 font-mono leading-relaxed">
                {`insert into public.company_portfolio (
  owner_user_id, company_name, company_type, domain, status
) values (
  '00000000-0000-0000-0000-000000000000',
  'My Company',
  'saas',
  'example.com',
  'active'
);`}
              </pre>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Building2 className="h-3.5 w-3.5 text-chart-1" />
                <span className="text-xs text-muted-foreground">Companies</span>
              </div>
              <p className="text-xl font-bold">{displayCompanies.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Bot className="h-3.5 w-3.5 text-chart-2" />
                <span className="text-xs text-muted-foreground">On Autopilot</span>
              </div>
              <p className="text-xl font-bold">
                {onAutopilot}/{Math.max(displayCompanies.length, 1)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Revenue</span>
              </div>
              <p className="text-xl font-bold">${(totalRevenue / 1000).toFixed(0)}k</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Net Profit</span>
              </div>
              <p className="text-xl font-bold text-emerald-500">${(netProfit / 1000).toFixed(0)}k</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Activity className="h-3.5 w-3.5 text-chart-3" />
                <span className="text-xs text-muted-foreground">Avg Health</span>
              </div>
              <p className="text-xl font-bold">{avgHealth}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Users className="h-3.5 w-3.5 text-chart-4" />
                <span className="text-xs text-muted-foreground">Agents Active</span>
              </div>
              <p className="text-xl font-bold">{displayAgents.length}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as PortfolioTab)}>
          <TabsList>
            <TabsTrigger value="overview">Companies</TabsTrigger>
            <TabsTrigger value="agents">Agent Fleet ({displayAgents.length})</TabsTrigger>
            <TabsTrigger value="decisions">Decisions ({displayDecisions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Portfolio Companies</CardTitle>
                <CardDescription>Health, revenue, autopilot status at a glance</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Margin</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Autopilot</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayCompanies.map((c) => {
                      const margin =
                        c.monthly_revenue_usd > 0
                          ? Math.round(
                              ((c.monthly_revenue_usd - c.monthly_cost_usd) / c.monthly_revenue_usd) * 100,
                            )
                          : 0
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.company_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{c.company_type}</Badge>
                          </TableCell>
                          <TableCell className="text-emerald-500">${(c.monthly_revenue_usd / 1000).toFixed(0)}k</TableCell>
                          <TableCell className="text-muted-foreground">${(c.monthly_cost_usd / 1000).toFixed(0)}k</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={margin} className="w-12" />
                              <span className="text-xs">{margin}%</span>
                            </div>
                          </TableCell>
                          <TableCell>{healthBadge(c.health_score)}</TableCell>
                          <TableCell>
                            {c.autopilot_enabled ? (
                              <Badge variant="default" className="gap-1">
                                <Play className="h-3 w-3" /> ON
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <Pause className="h-3 w-3" /> OFF
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Agent Workforce</CardTitle>
                <CardDescription>AI C-suite deployed across portfolio companies</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {displayAgents.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No agent rows for this portfolio yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Runs Today</TableHead>
                        <TableHead>Total Runs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayAgents.map((a, i) => (
                        <TableRow key={`${a.company_name}-${a.agent_role}-${i}`}>
                          <TableCell className="text-sm">{a.company_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="uppercase text-xs">
                              {a.agent_role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={a.status === "active" ? "default" : "outline"}>{a.status}</Badge>
                          </TableCell>
                          <TableCell>{a.runs_today}</TableCell>
                          <TableCell className="text-muted-foreground">{a.total_runs.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="decisions" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Operator Decision Log</CardTitle>
                <CardDescription>Your judgment trail across portfolio companies</CardDescription>
              </CardHeader>
              <CardContent>
                {displayDecisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No decisions logged yet.</p>
                ) : (
                  displayDecisions.map((d) => (
                    <div key={d.id} className="py-3 border-b last:border-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary">{d.company_name}</Badge>
                          <Badge variant="outline">{d.decision_type}</Badge>
                          {d.delegated_to_agent && (
                            <Badge variant="default" className="gap-1">
                              <Bot className="h-3 w-3" /> Agent
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm font-medium text-emerald-500">${d.impact_usd.toLocaleString()}</span>
                      </div>
                      <p className="text-sm mt-1">{d.decision}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(d.created_at).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {lowestHealthCompany && lowestHealthCompany.health_score < 75 && mode !== "empty" ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm font-medium">{lowestHealthCompany.company_name}</span>
                <span className="text-sm text-muted-foreground">
                  health score {lowestHealthCompany.health_score} — review cost structure or enable autopilot where appropriate
                </span>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ScrollArea>
  )
}
