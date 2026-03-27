"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getCircuitBreaker, type CircuitState, type CircuitStatus } from "@/lib/safety/circuit-breaker"
import { getTransparencyLogger, type CostSummary } from "@/lib/safety/transparency-log"
import type { TransparencyEntry } from "@/lib/safety/love-invariant"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function circuitColor(state: CircuitState): string {
  switch (state) {
    case "closed": return "text-emerald-500"
    case "warning": return "text-amber-500"
    case "open": return "text-red-500"
  }
}

function circuitBadgeVariant(state: CircuitState): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "closed": return "default"
    case "warning": return "secondary"
    case "open": return "destructive"
  }
}

function circuitIcon(state: CircuitState) {
  switch (state) {
    case "closed": return ShieldCheck
    case "warning": return ShieldAlert
    case "open": return XCircle
  }
}

function circuitLabel(state: CircuitState): string {
  switch (state) {
    case "closed": return "Healthy"
    case "warning": return "Warning"
    case "open": return "Halted"
  }
}

function resultBadge(result: TransparencyEntry["result"]) {
  switch (result) {
    case "success":
      return <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">Success</Badge>
    case "failure":
      return <Badge variant="destructive" className="text-[10px]">Failure</Badge>
    case "blocked":
      return <Badge variant="secondary" className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20 text-[10px]">Blocked</Badge>
  }
}

function formatCost(usd: number): string {
  if (usd < 0.001) return "<$0.001"
  return `$${usd.toFixed(4)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-lg font-semibold text-foreground leading-tight">{value}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
          {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function ExpandableRow({ entry }: { entry: TransparencyEntry }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <TableCell className="w-6 px-2">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
          {timeAgo(entry.timestamp)}
        </TableCell>
        <TableCell className="text-xs font-medium max-w-[200px] truncate">{entry.action.label}</TableCell>
        <TableCell className="text-[11px] text-muted-foreground">{entry.action.tool}</TableCell>
        <TableCell>{resultBadge(entry.result)}</TableCell>
        <TableCell className="text-[11px] text-right tabular-nums">{formatTokens(entry.tokensUsed)}</TableCell>
        <TableCell className="text-[11px] text-right tabular-nums">{formatCost(entry.costUsd)}</TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={7} className="p-3">
            <div className="space-y-1.5 text-xs">
              <div>
                <span className="font-medium text-muted-foreground">Reasoning: </span>
                <span className="text-foreground">{entry.reasoning || "No reasoning provided"}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Duration: </span>
                <span className="text-foreground">{entry.durationMs}ms</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Reversible: </span>
                <span className="text-foreground">{entry.action.reversible ? "Yes" : "No"}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Timestamp: </span>
                <span className="text-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              {entry.action.meta && (
                <div>
                  <span className="font-medium text-muted-foreground">Meta: </span>
                  <code className="text-[10px] text-foreground bg-muted rounded px-1 py-0.5">
                    {JSON.stringify(entry.action.meta)}
                  </code>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function TransparencyPanel() {
  const [entries, setEntries] = useState<TransparencyEntry[]>([])
  const [circuitStatus, setCircuitStatus] = useState<CircuitStatus | null>(null)
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null)

  // Hydrate from singletons
  const refresh = useCallback(() => {
    const logger = getTransparencyLogger()
    const breaker = getCircuitBreaker()
    setEntries(logger.getEntries())
    setCostSummary(logger.getCostSummary())
    setCircuitStatus(breaker.getStatus())
  }, [])

  useEffect(() => {
    refresh()

    const logger = getTransparencyLogger()
    const breaker = getCircuitBreaker()

    const unsub1 = logger.onChange(() => {
      setEntries(logger.getEntries())
      setCostSummary(logger.getCostSummary())
    })
    const unsub2 = breaker.onChange((status) => setCircuitStatus(status))

    return () => { unsub1(); unsub2() }
  }, [refresh])

  // Derived stats
  const totalActions = entries.length
  const successCount = useMemo(() => entries.filter((e) => e.result === "success").length, [entries])
  const failureCount = useMemo(() => entries.filter((e) => e.result === "failure").length, [entries])
  const blockedCount = useMemo(() => entries.filter((e) => e.result === "blocked").length, [entries])
  const successRate = totalActions > 0 ? ((successCount / totalActions) * 100).toFixed(1) : "0"

  const state = circuitStatus?.state ?? "closed"
  const StateIcon = circuitIcon(state)

  // Cost by tool for the table
  const toolBreakdown = useMemo(() => {
    if (!costSummary) return []
    return Object.entries(costSummary.byTool)
      .map(([tool, data]) => ({ tool, ...data }))
      .sort((a, b) => b.costUsd - a.costUsd)
  }, [costSummary])

  // Export
  const handleExport = useCallback(() => {
    const logger = getTransparencyLogger()
    const json = logger.exportJson()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `linkedout-transparency-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Reset circuit breaker
  const handleResetBreaker = useCallback(() => {
    const breaker = getCircuitBreaker()
    breaker.reset()
    refresh()
  }, [refresh])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Love Invariant &mdash; Transparency
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Structural accountability: every AI action is legible, reversible, and bounded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export Report
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Love Invariant explainer */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-foreground">The Love Invariant</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-primary/10 bg-background/50 p-3">
                      <p className="font-medium text-xs text-primary mb-1">1. Bounded Asymmetry</p>
                      <p className="text-[11px] text-muted-foreground">
                        Every AI action is legible to you. No black-box manipulation. You can see what it did, why, and at what cost.
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/10 bg-background/50 p-3">
                      <p className="font-medium text-xs text-primary mb-1">2. Preserved Agency</p>
                      <p className="text-[11px] text-muted-foreground">
                        You always have final say. The AI cannot trap or coerce. The circuit breaker auto-halts on runaway behavior.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI row */}
          <div className="flex flex-wrap gap-3">
            <StatCard
              label="Total Actions"
              value={String(totalActions)}
              icon={Activity}
              color="text-primary"
            />
            <StatCard
              label="Success Rate"
              value={`${successRate}%`}
              sub={`${successCount} ok / ${failureCount} fail / ${blockedCount} blocked`}
              icon={CheckCircle2}
              color="text-emerald-500"
            />
            <StatCard
              label="Tokens Used"
              value={formatTokens(costSummary?.totalTokens ?? 0)}
              icon={Zap}
              color="text-amber-500"
            />
            <StatCard
              label="Total Cost"
              value={formatCost(costSummary?.totalCostUsd ?? 0)}
              icon={DollarSign}
              color="text-chart-3"
            />
          </div>

          {/* Circuit Breaker Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StateIcon className={`w-5 h-5 ${circuitColor(state)}`} />
                  <CardTitle className="text-sm">Circuit Breaker</CardTitle>
                  <Badge variant={circuitBadgeVariant(state)} className="text-[10px]">
                    {circuitLabel(state)}
                  </Badge>
                </div>
                {state !== "closed" && (
                  <Button variant="outline" size="sm" onClick={handleResetBreaker}>
                    Reset
                  </Button>
                )}
              </div>
              {circuitStatus?.reason && state !== "closed" && (
                <CardDescription className="text-xs mt-1">
                  {circuitStatus.reason}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Token budget progress */}
              {circuitStatus && circuitStatus.tokenBudget > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Token Budget</span>
                    <span>
                      {formatTokens(circuitStatus.totalTokensUsed)} / {formatTokens(circuitStatus.tokenBudget)}
                      {" "}({(circuitStatus.usageRatio * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <Progress
                    value={Math.min(circuitStatus.usageRatio * 100, 100)}
                    className="h-2"
                  />
                </div>
              )}

              {/* Per-tool failure counts */}
              {circuitStatus && Object.keys(circuitStatus.failureCounts).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Consecutive Failures by Tool</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(circuitStatus.failureCounts).map(([tool, count]) => (
                      <Badge
                        key={tool}
                        variant={count >= 3 ? "destructive" : count >= 2 ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {tool}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {state === "closed" && (!circuitStatus || Object.keys(circuitStatus.failureCounts).length === 0) && (
                <p className="text-xs text-muted-foreground">
                  All systems nominal. The circuit breaker will auto-halt after 3 consecutive failures on any tool,
                  or if token usage exceeds 2x the budget.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cost Breakdown by Tool */}
          {toolBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Cost Breakdown by Tool</CardTitle>
                <CardDescription className="text-xs">
                  Where your AI tokens and dollars are going.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Tool</TableHead>
                      <TableHead className="text-[11px] text-right">Actions</TableHead>
                      <TableHead className="text-[11px] text-right">Tokens</TableHead>
                      <TableHead className="text-[11px] text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {toolBreakdown.map((row) => (
                      <TableRow key={row.tool}>
                        <TableCell className="text-xs font-medium">{row.tool}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatTokens(row.tokens)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{formatCost(row.costUsd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Recent Action Log */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Action Log</CardTitle>
                  <CardDescription className="text-xs">
                    Every AI action with full reasoning, cost, and outcome. Click a row to expand.
                  </CardDescription>
                </div>
                {entries.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {entries.length} entries
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No AI actions logged yet.</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    When the AI takes actions, they will appear here with full transparency.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-6 px-2" />
                        <TableHead className="text-[11px]">When</TableHead>
                        <TableHead className="text-[11px]">Action</TableHead>
                        <TableHead className="text-[11px]">Tool</TableHead>
                        <TableHead className="text-[11px]">Result</TableHead>
                        <TableHead className="text-[11px] text-right">Tokens</TableHead>
                        <TableHead className="text-[11px] text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.slice(0, 50).map((entry, i) => (
                        <ExpandableRow key={`${entry.timestamp}-${i}`} entry={entry} />
                      ))}
                    </TableBody>
                  </Table>
                  {entries.length > 50 && (
                    <div className="p-3 text-center text-xs text-muted-foreground border-t">
                      Showing 50 of {entries.length} entries. Export the full report for complete data.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
