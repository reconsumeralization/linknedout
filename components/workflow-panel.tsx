"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import {
  DEFAULT_WORKFLOWS,
  type WorkflowDefinition,
  type WorkflowQueueItem,
  type WorkflowResult,
  type WorkflowStatus,
} from "@/lib/linkedin/workflow-automation"
import { cn } from "@/lib/shared/utils"
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Mail,
  Map,
  MessageSquare,
  Newspaper,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  UserCheck,
  UserMinus,
  Users,
  Zap,
} from "lucide-react"
import { useCallback, useState } from "react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: WorkflowStatus) {
  switch (status) {
    case "running":
      return <Badge className="bg-chart-4/15 text-chart-4">Running</Badge>
    case "completed":
      return <Badge className="bg-accent/15 text-accent">Completed</Badge>
    case "error":
      return <Badge className="bg-destructive/15 text-destructive">Error</Badge>
    case "scheduled":
      return <Badge className="bg-primary/15 text-primary">Scheduled</Badge>
    default:
      return <Badge variant="outline">Idle</Badge>
  }
}

function categoryIcon(category: WorkflowDefinition["category"]) {
  switch (category) {
    case "invitations":
      return <UserMinus className="h-4 w-4" />
    case "connections":
      return <UserCheck className="h-4 w-4" />
    case "feed":
      return <Newspaper className="h-4 w-4" />
    case "tribes":
      return <Users className="h-4 w-4" />
    case "messages":
      return <MessageSquare className="h-4 w-4" />
    case "network":
      return <Map className="h-4 w-4" />
    case "bots":
      return <Bot className="h-4 w-4" />
    default:
      return <Activity className="h-4 w-4" />
  }
}

function resultIcon(status: WorkflowResult["status"]) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-accent" />
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-chart-4" />
    case "error":
      return <AlertTriangle className="h-4 w-4 text-destructive" />
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Demo data for queue and results
// ---------------------------------------------------------------------------

const DEMO_QUEUE: WorkflowQueueItem[] = [
  { workflowId: "analyze-stale-invites", workflowName: "Analyze Stale Invites", scheduledAt: new Date(Date.now() + 3600000).toISOString(), priority: 1 },
  { workflowId: "rank-new-connections", workflowName: "Rank New Connections", scheduledAt: new Date(Date.now() + 7200000).toISOString(), priority: 2 },
  { workflowId: "detect-ai-bots", workflowName: "Detect AI Bots", scheduledAt: new Date(Date.now() + 14400000).toISOString(), priority: 3 },
]

const DEMO_RESULTS: WorkflowResult[] = [
  { workflowId: "analyze-news-feed", workflowName: "Analyze News Feed", completedAt: new Date(Date.now() - 1800000).toISOString(), status: "success", summary: "Analyzed 24 posts. 5 high-importance, 3 repost candidates.", itemCount: 24 },
  { workflowId: "prioritize-responses", workflowName: "Prioritize DM Responses", completedAt: new Date(Date.now() - 3600000).toISOString(), status: "success", summary: "Prioritized 12 messages. 2 urgent, 4 positive responses.", itemCount: 12 },
  { workflowId: "find-tribe-members", workflowName: "Find Tribe Members", completedAt: new Date(Date.now() - 7200000).toISOString(), status: "success", summary: "Found 18 tribe candidates. 7 strong matches for Cybersecurity tribe.", itemCount: 18 },
  { workflowId: "detect-ai-bots", workflowName: "Detect AI Bots", completedAt: new Date(Date.now() - 86400000).toISOString(), status: "warning", summary: "Flagged 3 connections as potential bots. Review recommended.", itemCount: 3 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkflowPanel() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(DEFAULT_WORKFLOWS)
  const [queue] = useState<WorkflowQueueItem[]>(DEMO_QUEUE)
  const [results] = useState<WorkflowResult[]>(DEMO_RESULTS)

  const toggleWorkflow = useCallback((id: string) => {
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)),
    )
  }, [])

  const runWorkflow = useCallback((id: string) => {
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, status: "running" as WorkflowStatus, lastRun: new Date().toISOString() }
          : w,
      ),
    )
    // Simulate completion after 2 seconds
    setTimeout(() => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === id
            ? { ...w, status: "completed" as WorkflowStatus, resultCount: Math.floor(Math.random() * 20) + 5, resultSummary: "Analysis complete" }
            : w,
        ),
      )
    }, 2000)
  }, [])

  const enabledCount = workflows.filter((w) => w.enabled).length
  const runningCount = workflows.filter((w) => w.status === "running").length

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Workflow Automation</h2>
          <p className="text-sm text-muted-foreground">
            {enabledCount} automations active{runningCount > 0 ? ` \u00b7 ${runningCount} running` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh All
          </Button>
          <Button size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            Run All Active
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card
          className="cursor-pointer transition-colors hover:border-primary/50"
          onClick={() => runWorkflow("rank-new-connections")}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Analyze New Connections</p>
              <p className="text-xs text-muted-foreground">Score and rank recent additions</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:border-chart-4/50"
          onClick={() => runWorkflow("analyze-stale-invites")}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-4/10">
              <Clock className="h-5 w-5 text-chart-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Review Stale Invites</p>
              <p className="text-xs text-muted-foreground">Cull or re-invite pending invites</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-colors hover:border-accent/50"
          onClick={() => runWorkflow("find-tribe-members")}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium">Find My Tribe</p>
              <p className="text-xs text-muted-foreground">Discover aligned tribe candidates</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Active Automations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5" />
              Active Automations
            </CardTitle>
            <CardDescription>Toggle workflows on or off. Active ones run on schedule.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-3">
              <div className="flex flex-col gap-3">
                {workflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3 transition-colors",
                      workflow.enabled ? "border-border bg-card" : "border-border/50 bg-muted/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-muted-foreground">{categoryIcon(workflow.category)}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn("text-sm font-medium", !workflow.enabled && "text-muted-foreground")}>
                            {workflow.name}
                          </p>
                          {statusBadge(workflow.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">{workflow.description}</p>
                        {workflow.lastRun && (
                          <p className="mt-0.5 text-xs text-muted-foreground/70">
                            Last run: {timeAgo(workflow.lastRun)}
                            {workflow.resultCount !== undefined && ` \u00b7 ${workflow.resultCount} results`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={workflow.status === "running"}
                        onClick={() => runWorkflow(workflow.id)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={workflow.enabled}
                        onCheckedChange={() => toggleWorkflow(workflow.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right column: Queue + Results */}
        <div className="flex flex-col gap-6">
          {/* Workflow Queue */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarClock className="h-5 w-5" />
                Queue
              </CardTitle>
              <CardDescription>Upcoming scheduled runs</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[150px]">
                <div className="flex flex-col gap-2">
                  {queue.map((item, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border/50 p-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.workflowName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">#{item.priority}</Badge>
                    </div>
                  ))}
                  {queue.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">No scheduled workflows</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Results Feed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-5 w-5" />
                Recent Results
              </CardTitle>
              <CardDescription>Latest workflow outputs</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="flex flex-col gap-2">
                  {results.map((result, i) => (
                    <div key={i} className="rounded-md border border-border/50 p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {resultIcon(result.status)}
                          <p className="text-sm font-medium">{result.workflowName}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{timeAgo(result.completedAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{result.summary}</p>
                      <Badge variant="outline" className="mt-1 text-xs">{result.itemCount} items</Badge>
                    </div>
                  ))}
                  {results.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">No results yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
