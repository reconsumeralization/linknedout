"use client"

import type { ActiveView } from "@/app/page"
import { hasUserSupabase } from "@/lib/shared/user-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SponsorRow } from "@/components/sponsor-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OnboardingCard } from "@/components/onboarding-card"
import { getDemoPulseMetrics } from "@/lib/sovereign/evolution-loop"
import { Progress } from "@/components/ui/progress"
import { buildSkillFrequency, parseLinkedInCsv } from "@/lib/csv/csv-parser"
import {
  fetchSupabaseDashboardSnapshot,
  subscribeToActivity,
  subscribeToProfiles,
  subscribeToProjects,
  subscribeToTribes,
} from "@/lib/supabase/supabase-data"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { ArrowRight, BookOpen, Brain, ChevronRight, FlaskConical, FolderKanban, Layers, MessageSquare, Network, Radio, Shield, Sparkles, Star, TrendingDown, TrendingUp, Upload, Users, Zap } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
    Bar,
    BarChart,
    PolarAngleAxis,
    PolarGrid,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"

type SkillDatum = { skill: string; count: number }
type HealthDatum = { metric: string; value: number }
type Activity = { action: string; time: string; type: string }
type Stat = { label: string; value: string; change: string; icon: React.ElementType; color: string }
type Project = { name: string; progress: number; status: string; type: string }

const stats: Stat[] = [
  { label: "Profiles", value: "247", change: "+12 this week", icon: Users, color: "text-primary" },
  { label: "Active Tribes", value: "8", change: "3 forming", icon: Layers, color: "text-accent" },
  { label: "Projects", value: "14", change: "6 active", icon: FolderKanban, color: "text-chart-3" },
  { label: "Network Reach", value: "12.4K", change: "+850 this month", icon: Network, color: "text-chart-5" },
]

type Aspiration = { skill: string, count: number, trending?: boolean, gap?: boolean }
const aspirations: Aspiration[] = [
  { skill: "AI/ML", count: 12, trending: true },
  { skill: "Strategic Leadership", count: 9 },
  { skill: "Product Strategy", count: 7 },
  { skill: "Data Engineering", count: 6 },
  { skill: "Executive Presence", count: 5 },
  { skill: "DevOps/SRE", count: 4, gap: true },
  { skill: "UX Research", count: 3, gap: true },
]

interface DashboardPanelProps {
  onNavigate: (view: ActiveView) => void
  csvData: string | null
}

function UploadBanner({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 flex items-center justify-between cursor-pointer hover:bg-primary/10 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
          <Upload className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">
            Import LinkedIn profiles
          </div>
          <div className="text-xs text-muted-foreground">
            Bring in a LinkedIn CSV export or profile PDF for AI-powered analysis
          </div>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground" />
    </div>
  )
}

function StatCard({ stat }: { stat: Stat }) {
  const Icon = stat.icon
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {stat.label}
          </span>
          <Icon className={`w-4 h-4 ${stat.color}`} />
        </div>
        <div className="text-2xl font-bold text-foreground">{stat.value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{stat.change}</div>
      </CardContent>
    </Card>
  )
}

function SkillsBarChart({ data }: { data: SkillDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="skill" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function TribeRadarChart({ data }: { data: HealthDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
        <Radar
          name="Score"
          dataKey="value"
          stroke="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.25}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function ProjectProgress({ project }: { project: Project }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">{project.name}</span>
          <Badge
            variant="secondary"
            className={`h-4 px-1.5 text-[9px] font-medium ${
              project.status === "Complete"
                ? "bg-accent/15 text-accent"
                : project.status === "Paused"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/15 text-primary"
            }`}
          >
            {project.status}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{project.progress}%</span>
      </div>
      <Progress value={project.progress} className="h-1.5" />
    </div>
  )
}

function ActivityRow({ item }: { item: Activity }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
        item.type === "tribe" ? "bg-accent" :
        item.type === "ai" ? "bg-primary" :
        item.type === "profiles" ? "bg-chart-3" :
        "bg-muted-foreground"
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground leading-snug">{item.action}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
      </div>
    </div>
  )
}

function AspirationBadge({ aspiration }: { aspiration: Aspiration }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${
        aspiration.trending
          ? "border-accent/40 bg-accent/10 text-accent"
          : aspiration.gap
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-secondary text-secondary-foreground"
      }`}
    >
      {aspiration.trending && <TrendingUp className="w-2.5 h-2.5" />}
      {aspiration.skill}
      <span className="opacity-60">x{aspiration.count}</span>
    </div>
  )
}

function SingularityPulseCard({ onNavigate }: { onNavigate?: (view: ActiveView) => void }) {
  const pulse = getDemoPulseMetrics()
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Singularity Pulse
          </CardTitle>
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => onNavigate?.("chat")}>
            Run Evolution Loop
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        <CardDescription className="text-xs">Recursive self-improvement velocity across the Sovereign Factory</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Self-Improvement Rate</p>
            <p className="text-lg font-bold text-foreground">{pulse.selfImprovementRate}</p>
            <p className="text-[10px] text-muted-foreground">evolutions/week</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Intelligence Tariff Savings</p>
            <p className="text-lg font-bold text-emerald-500">${pulse.intelligenceTariffSavings.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">monthly</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Auto Research</p>
            <p className="text-lg font-bold text-foreground">{pulse.activeAutoResearch}</p>
            <p className="text-[10px] text-muted-foreground">active campaigns</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tribal Learning</p>
            <p className="text-lg font-bold text-foreground">{pulse.tribalLearningVelocity}</p>
            <p className="text-[10px] text-muted-foreground">experiments/week</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardPanel({ onNavigate, csvData }: DashboardPanelProps) {
  const [liveStats, setLiveStats] = useState<Stat[]>([])
  const [liveProjects, setLiveProjects] = useState<Project[]>([])
  const [liveActivity, setLiveActivity] = useState<Activity[]>([])
  const [dataSource, setDataSource] = useState<"csv" | "supabase">("supabase")
  const [isSyncing, setIsSyncing] = useState(false)
  const [hasAuth, setHasAuth] = useState(false)

  // Imported profile data is normalized to CSV for downstream analysis.
  const csvProfiles = useMemo(() => (csvData ? parseLinkedInCsv(csvData) : null), [csvData])
  const csvSkillsData = useMemo(() => (csvProfiles && csvProfiles.length > 0 ? buildSkillFrequency(csvProfiles) : null), [csvProfiles])

  useEffect(() => {
    if (!csvProfiles || csvProfiles.length === 0) return
    const count = csvProfiles.length
    const tribeCount = new Set(csvProfiles.map(p => p.tribe).filter(Boolean)).size
    const totalConnections = csvProfiles.reduce((sum, p) => sum + (p.connections || 0), 0)
    setLiveStats([
      { ...stats[0], value: count.toLocaleString(), change: `from imported profiles (${count} rows)` },
      { ...stats[1], value: Math.max(tribeCount, 1).toString(), change: tribeCount > 0 ? "detected in import session" : "auto-grouped" },
      { ...stats[2], value: stats[2].value, change: stats[2].change },
      {
        ...stats[3],
        value: new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(totalConnections),
        change: "sum of connections",
      },
    ])
    setLiveActivity([
      { action: `${count} profiles imported for analysis`, time: "just now", type: "profiles" },
    ])
    setDataSource("csv")
  }, [csvProfiles])

  const loadSupabaseSnapshot = useCallback(async () => {
    setIsSyncing(true)
    try {
      const snapshot = await fetchSupabaseDashboardSnapshot()
      if (!snapshot) {
        setLiveStats([
          { ...stats[0], value: "0", change: "from Supabase" },
          { ...stats[1], value: "0", change: "live tribe records" },
          { ...stats[2], value: "0", change: "project sync active" },
          { ...stats[3], value: "0", change: "calculated from profile connections" },
        ])
        setLiveProjects([])
        setLiveActivity([])
        setDataSource("supabase")
        return
      }

      setLiveStats([
        { ...stats[0], value: snapshot.profileCount.toLocaleString(), change: "from Supabase" },
        { ...stats[1], value: snapshot.tribeCount.toLocaleString(), change: "live tribe records" },
        { ...stats[2], value: snapshot.projectCount.toLocaleString(), change: "project sync active" },
        {
          ...stats[3],
          value: new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(snapshot.networkReach),
          change: "calculated from profile connections",
        },
      ])

      if (snapshot.projects.length > 0) {
        setLiveProjects(
          snapshot.projects.map((project) => ({
            name: project.name,
            progress: project.progress,
            status: project.status,
            type: project.type,
          })),
        )
      } else {
        setLiveProjects([])
      }

      setLiveActivity(snapshot.activities)
      setDataSource("supabase")
    } finally {
      setIsSyncing(false)
    }
  }, [])

  useEffect(() => {
    const token = resolveSupabaseAccessToken()
    setHasAuth(!!token)
    const onStorage = () => setHasAuth(!!resolveSupabaseAccessToken())
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    void loadSupabaseSnapshot()
    const subscriptions = [
      subscribeToProfiles(() => {
        void loadSupabaseSnapshot()
      }),
      subscribeToTribes(() => {
        void loadSupabaseSnapshot()
      }),
      subscribeToProjects(() => {
        void loadSupabaseSnapshot()
      }),
      subscribeToActivity(() => {
        void loadSupabaseSnapshot()
      }),
    ].filter(Boolean) as Array<() => void>

    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe()
      }
    }
  }, [loadSupabaseSnapshot])

  const hasData = Boolean(
    csvData ||
    (dataSource === "supabase" && liveStats[0] && liveStats[0].value !== "0"),
  )

  const hasSupabaseConfigured = Boolean(
    typeof window !== "undefined" &&
      ((process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
        hasUserSupabase()),
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Your LinkedIn CRM & Tribe Intelligence Hub
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase">
                {dataSource}
              </Badge>
              {isSyncing ? <span className="text-[10px] text-muted-foreground">Syncing...</span> : null}
            </div>
          </div>
          <div className="flex gap-2">
            {!csvData && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate("chat")}
                className="gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                Import CSV/PDF
              </Button>
            )}
            <Button size="sm" onClick={() => onNavigate("chat")} className="gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Ask AI
            </Button>
          </div>
        </div>

        {/* Onboarding / setup checklist */}
        <OnboardingCard
          hasSupabaseConfigured={hasSupabaseConfigured}
          hasAuth={hasAuth}
          hasData={hasData}
          onNavigate={onNavigate}
        />

        {/* No imported-profile banner */}
        {!csvData && (
          <UploadBanner onClick={() => onNavigate("chat")} />
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {liveStats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Skills Distribution */}
          <Card className="lg:col-span-2 bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Skills in Network</CardTitle>
              <CardDescription className="text-xs">Frequency across all profiles</CardDescription>
            </CardHeader>
            <CardContent>
              <SkillsBarChart data={csvSkillsData ?? []} />
            </CardContent>
          </Card>

          {/* Tribe Health Radar */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Tribe Health Score</CardTitle>
              <CardDescription className="text-xs">Alpha Squad composition</CardDescription>
            </CardHeader>
            <CardContent>
              <TribeRadarChart data={[]} />
            </CardContent>
          </Card>
        </div>

        {/* Tribe Intelligence Summary */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                Tribe Intelligence
              </CardTitle>
              <CardDescription className="text-xs">High-Bandwidth Intelligence Syndicate</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("tribes")} className="text-xs gap-1 h-7">
              Open Tribes <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <Brain className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                <p className="text-lg font-bold">{liveStats[1]?.value ?? "0"}</p>
                <p className="text-[10px] text-muted-foreground">Active Tribes</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <Radio className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
                <p className="text-lg font-bold">0</p>
                <p className="text-[10px] text-muted-foreground">Signals Posted</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <FlaskConical className="h-4 w-4 mx-auto mb-1 text-purple-500" />
                <p className="text-lg font-bold">0</p>
                <p className="text-[10px] text-muted-foreground">Active Sprints</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <TrendingDown className="h-4 w-4 mx-auto mb-1 text-red-500" />
                <p className="text-lg font-bold">0</p>
                <p className="text-[10px] text-muted-foreground">At Risk Members</p>
              </div>
            </div>
            <SponsorRow sponsors={["CrowdStrike", "MongoDB", "Turbopuffer", "Lambda"]} className="mt-3 pt-3 border-t border-border/30" />
          </CardContent>
        </Card>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Active Projects */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Active Projects</CardTitle>
                <CardDescription className="text-xs">Talent & team initiatives</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("projects")} className="text-xs gap-1 h-7">
                View all <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {liveProjects.map((proj) => (
                <ProjectProgress key={proj.name} project={proj} />
              ))}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
              <CardDescription className="text-xs">Latest actions & AI insights</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {liveActivity.map((item, i) => (
                <ActivityRow key={i} item={item} />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Weekly Wins & Echoes */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-500" />
                Weekly Wins & Echoes
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => onNavigate?.("chat")}>
                Share Your Experience
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
            <CardDescription className="text-xs">Hard-won advice and verified experiences from your tribe</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">No echoes yet</p>
                  <p className="text-[10px] text-muted-foreground">Share a breakthrough, lesson, or career pivot to start the tribal wisdom archive</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Singularity Pulse — demo metrics from evolution loop */}
        <SingularityPulseCard onNavigate={onNavigate} />

        {/* Aspirations Snapshot */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Star className="w-4 h-4 text-chart-3" />
                Aspiration Trends
              </CardTitle>
              <CardDescription className="text-xs">Top development goals across network</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("analytics")} className="text-xs gap-1 h-7">
              Full report <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {aspirations.map((item) => (
                <AspirationBadge key={item.skill} aspiration={item} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
