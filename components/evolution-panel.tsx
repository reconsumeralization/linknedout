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
import { getPromptEvolver, type Evolution, type Observation } from "@/lib/evolution/prompt-evolver"
import { MetricsCollector, type Opportunity, type PersonaMetrics, type ToolMetrics } from "@/lib/evolution/metrics-collector"
import { getABTester, type Experiment, type ExperimentResults } from "@/lib/evolution/ab-tester"
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Lightbulb,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function statusBadge(status: Evolution["status"]) {
  switch (status) {
    case "observed":
      return <Badge variant="outline" className="text-[10px]">Observed</Badge>
    case "hypothesized":
      return <Badge variant="secondary" className="text-[10px]">Hypothesized</Badge>
    case "evaluated":
      return <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px]">Evaluated</Badge>
    case "promoted":
      return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">Promoted</Badge>
    case "rejected":
      return <Badge variant="destructive" className="text-[10px]">Rejected</Badge>
  }
}

function opportunityBadge(type: Opportunity["type"]) {
  switch (type) {
    case "low-success":
      return <Badge variant="destructive" className="text-[10px]">Low Success</Badge>
    case "token-waste":
      return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">Token Waste</Badge>
    case "repeated-failure":
      return <Badge variant="destructive" className="text-[10px]">Repeated Failure</Badge>
    case "slow-tool":
      return <Badge variant="secondary" className="text-[10px]">Slow Tool</Badge>
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Evolution Panel
// ---------------------------------------------------------------------------

export default function EvolutionPanel() {
  const [toolMetrics, setToolMetrics] = useState<ToolMetrics[]>([])
  const [personaMetrics, setPersonaMetrics] = useState<PersonaMetrics[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [evolutions, setEvolutions] = useState<Evolution[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null)

  const collector = useMemo(() => new MetricsCollector(), [])

  const refresh = useCallback(() => {
    setToolMetrics(collector.collectByTool())
    setPersonaMetrics(collector.collectByPersona())
    setOpportunities(collector.getImprovementOpportunities())
    setEvolutions(getPromptEvolver().getEvolutionHistory())
    setExperiments(getABTester().getAll())
  }, [collector])

  useEffect(() => {
    refresh()
    const unsub1 = getPromptEvolver().onChange((evo) => setEvolutions(evo))
    const unsub2 = getABTester().onChange((exp) => setExperiments(exp))
    return () => { unsub1(); unsub2() }
  }, [refresh])

  const handleRunAnalysis = useCallback(() => {
    setIsAnalyzing(true)
    // Use setTimeout to allow UI to update before running analysis
    setTimeout(() => {
      try {
        const evolver = getPromptEvolver()
        evolver.runAnalysis()
        refresh()
        setLastAnalysis(new Date().toISOString())
      } finally {
        setIsAnalyzing(false)
      }
    }, 50)
  }, [refresh])

  // Summary stats
  const totalEvolutions = evolutions.length
  const promotedCount = evolutions.filter((e) => e.status === "promoted").length
  const avgImprovement = evolutions
    .filter((e) => e.improvementPct > 0)
    .reduce((s, e, _, a) => s + e.improvementPct / a.length, 0)

  const runningExperiments = experiments.filter((e) => e.status === "running")

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Prompt Evolution
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Self-improving prompt system — observe, hypothesize, evaluate, promote
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={handleRunAnalysis} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Tools Tracked
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{toolMetrics.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {toolMetrics.filter((t) => t.successRate >= 0.7).length} healthy,{" "}
                {toolMetrics.filter((t) => t.successRate < 0.7 && t.totalCalls >= 3).length} need attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Evolutions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEvolutions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {promotedCount} promoted
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Avg Improvement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {avgImprovement > 0 ? `+${avgImprovement.toFixed(1)}%` : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">success rate gain per evolution</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" />
                Active Experiments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{runningExperiments.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {experiments.filter((e) => e.status === "concluded").length} concluded
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Persona Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Persona Performance
            </CardTitle>
            <CardDescription>Success rate and token efficiency per persona</CardDescription>
          </CardHeader>
          <CardContent>
            {personaMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No persona data yet. Use AI tools to generate metrics.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Success Rate</TableHead>
                    <TableHead>Avg Tokens</TableHead>
                    <TableHead>Avg Duration</TableHead>
                    <TableHead>Best Tools</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personaMetrics.map((pm) => (
                    <TableRow key={pm.persona}>
                      <TableCell className="font-medium capitalize">{pm.persona}</TableCell>
                      <TableCell>{pm.totalCalls}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pm.successRate * 100} className="w-16 h-1.5" />
                          <span className={`text-xs ${pm.successRate >= 0.7 ? "text-emerald-500" : "text-red-500"}`}>
                            {pct(pm.successRate)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {Math.round(pm.avgTokens).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(pm.avgDurationMs / 1000).toFixed(1)}s
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {pm.bestTools.slice(0, 2).map((t) => (
                            <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Tool Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Tool Success Rates
            </CardTitle>
            <CardDescription>Per-tool performance metrics from the transparency log</CardDescription>
          </CardHeader>
          <CardContent>
            {toolMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tool data yet. AI actions will appear here automatically.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Success Rate</TableHead>
                    <TableHead>Failures</TableHead>
                    <TableHead>Avg Tokens</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {toolMetrics.map((tm) => (
                    <TableRow key={tm.tool}>
                      <TableCell className="font-mono text-xs">{tm.tool}</TableCell>
                      <TableCell>{tm.totalCalls}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={tm.successRate * 100} className="w-16 h-1.5" />
                          <span className={`text-xs font-medium ${
                            tm.successRate >= 0.85
                              ? "text-emerald-500"
                              : tm.successRate >= 0.7
                              ? "text-amber-500"
                              : "text-red-500"
                          }`}>
                            {pct(tm.successRate)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {tm.failureCount > 0 ? (
                          <Badge variant="destructive" className="text-[10px]">{tm.failureCount}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {Math.round(tm.avgTokens).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        ${tm.totalCostUsd.toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Active A/B Experiments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              A/B Experiments
            </CardTitle>
            <CardDescription>Prompt variant experiments with live progress</CardDescription>
          </CardHeader>
          <CardContent>
            {experiments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No experiments yet. Run analysis to generate prompt variants and start testing.
              </p>
            ) : (
              <div className="space-y-4">
                {experiments.map((exp) => {
                  const results = getABTester().getResults(exp.name)
                  const totalImpressions = results?.totalImpressions ?? 0
                  const targetImpressions = (results?.minImpressionsPerVariant ?? 10) * exp.allVariants.length
                  const progress = Math.min(100, (totalImpressions / targetImpressions) * 100)

                  return (
                    <div key={exp.name} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{exp.name}</span>
                          <Badge variant={exp.status === "running" ? "default" : "secondary"} className="text-[10px]">
                            {exp.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {totalImpressions} / {targetImpressions} impressions
                        </span>
                      </div>

                      <Progress value={progress} className="h-2" />

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {results?.metrics.map((m) => (
                          <div key={m.variant} className="text-xs border rounded p-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono truncate max-w-[120px]" title={m.variant}>
                                {m.variant === exp.control ? "control" : m.variant.slice(0, 20)}
                              </span>
                              {exp.winner === m.variant && (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                              )}
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <span>{m.impressions} calls</span>
                              <span className={m.successRate >= 0.7 ? "text-emerald-500" : "text-red-500"}>
                                {pct(m.successRate)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {results?.confidence !== undefined && results.confidence > 0 && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          Confidence: {pct(results.confidence)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Improvement Opportunities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Improvement Opportunities
            </CardTitle>
            <CardDescription>Ranked suggestions from the metrics collector</CardDescription>
          </CardHeader>
          <CardContent>
            {opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {toolMetrics.length === 0
                  ? "No data yet. Use AI tools to generate metrics, then run analysis."
                  : "All tools are performing within acceptable thresholds."}
              </p>
            ) : (
              <div className="space-y-3">
                {opportunities.map((opp) => (
                  <div key={`${opp.type}-${opp.tool}`} className="flex items-start gap-3 border rounded-lg p-3">
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">
                      {opp.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {opportunityBadge(opp.type)}
                        <span className="font-mono text-xs">{opp.tool}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{opp.description}</p>
                      <div className="flex items-center gap-1 mt-1.5">
                        <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                        <span className="text-xs text-emerald-500 font-medium">
                          ~{opp.impactPct}% potential improvement
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evolution History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Evolution History
            </CardTitle>
            <CardDescription>
              Timeline of prompt improvements — {totalEvolutions} total, {promotedCount} promoted
            </CardDescription>
          </CardHeader>
          <CardContent>
            {evolutions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No evolutions yet. Click "Run Analysis" to start the self-improvement loop.
              </p>
            ) : (
              <div className="space-y-3">
                {evolutions.slice(0, 20).map((evo) => (
                  <div key={evo.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusBadge(evo.status)}
                        <span className="font-mono text-xs">{evo.observation.tool}</span>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {evo.variants.length} variant{evo.variants.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{relativeTime(evo.timestamp)}</span>
                    </div>

                    <p className="text-xs text-muted-foreground">{evo.observation.description}</p>

                    {evo.variants.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {evo.variants.map((v) => (
                          <Badge
                            key={v.id}
                            variant={evo.promotedVariant?.id === v.id ? "default" : "outline"}
                            className="text-[9px]"
                          >
                            {v.strategy}
                            {evo.promotedVariant?.id === v.id && " (winner)"}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {evo.improvementPct > 0 && (
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        <span className="text-xs text-emerald-500 font-medium">
                          +{evo.improvementPct}% improvement
                        </span>
                      </div>
                    )}

                    {evo.evalResult && (
                      <div className="text-xs text-muted-foreground">
                        Baseline: {pct(evo.evalResult.baselineMetrics.successRate)} success rate
                        {evo.evalResult.winner && (
                          <> | Best variant: {pct(
                            evo.evalResult.variantResults.find(
                              (r) => r.variant.id === evo.evalResult!.winner!.id
                            )?.metrics.successRate ?? 0
                          )}</>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        {lastAnalysis && (
          <p className="text-xs text-muted-foreground text-center">
            Last analysis: {relativeTime(lastAnalysis)}
          </p>
        )}
      </div>
    </ScrollArea>
  )
}
