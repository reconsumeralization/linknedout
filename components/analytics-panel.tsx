"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ParsedActivity } from "@/lib/csv/activity-csv-parser"
import { summarizeActivityTypes } from "@/lib/csv/activity-csv-parser"
import { parseLinkedInCsv } from "@/lib/csv/csv-parser"
import {
  createAnalyticsSnapshot,
  type AnalyticsBreakdownDatum,
  type AnalyticsDatum,
  type AnalyticsKpi,
  type AnalyticsLabeledDatum,
  type AnalyticsSeries,
  type AnalyticsSkillTableItem,
} from "@/lib/shared/analytics-panel-data"
import {
  fetchSupabaseProfiles,
  fetchSupabaseProjects,
  fetchSupabaseTribes,
  subscribeToProfiles,
  subscribeToProjects,
  subscribeToTribes,
  type SupabaseProfileView,
  type SupabaseProjectView,
} from "@/lib/supabase/supabase-data"
import type { Tribe } from "@/lib/shared/types"
import { ClipboardList, FolderKanban, Layers3, Target, TrendingUp, Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    fontSize: "11px",
    color: "var(--foreground)",
  },
}

const KPI_DECORATORS: Record<
  AnalyticsKpi["key"],
  { icon: React.ElementType; color: string }
> = {
  profiles: { icon: Users, color: "text-primary" },
  tribes: { icon: Layers3, color: "text-accent" },
  projects: { icon: FolderKanban, color: "text-chart-3" },
  match: { icon: Target, color: "text-chart-5" },
}

function Legend({
  items,
  itemClass = "text-xs",
  dotSize = "w-2.5 h-2.5",
  gap = "gap-1.5",
}: {
  items: AnalyticsSeries[]
  itemClass?: string
  dotSize?: string
  gap?: string
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 px-1">
      {items.map((item) => (
        <div key={item.key} className={`flex items-center ${gap} ${itemClass} text-muted-foreground`}>
          <div className={`${dotSize} rounded-full`} style={{ background: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  )
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 text-center text-xs text-muted-foreground">
      {message}
    </div>
  )
}

function KpiRow({ kpis }: { kpis: AnalyticsKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const decorator = KPI_DECORATORS[kpi.key]
        const Icon = decorator.icon
        return (
          <Card key={kpi.key} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</span>
                <Icon className={`h-4 w-4 ${decorator.color}`} />
              </div>
              <div className={`text-2xl font-bold ${decorator.color}`}>{kpi.value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{kpi.change}</div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function SkillCoverageChart({ data, series }: { data: AnalyticsDatum[]; series: AnalyticsSeries[] }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Skill Coverage by Seniority</CardTitle>
        <CardDescription className="text-xs">How top skills cluster across the current talent mix.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 || series.length === 0 ? (
          <ChartEmptyState message="Load profiles to see skill coverage by seniority band." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="band" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip {...tooltipStyle} />
                {series.map((item) => (
                  <Line key={item.key} type="monotone" dataKey={item.key} stroke={item.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <Legend items={series} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ProjectPortfolioChart({ data, series }: { data: AnalyticsDatum[]; series: AnalyticsSeries[] }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Project Portfolio</CardTitle>
        <CardDescription className="text-xs">Projects by type and lifecycle stage.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState message="Create projects to see portfolio mix and delivery stage." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip {...tooltipStyle} />
                {series.map((item) => (
                  <Area
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    stackId="portfolio"
                    stroke={item.color}
                    fill={item.color}
                    fillOpacity={0.16}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <Legend items={series} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TribeComparisonChart({
  data,
  series,
  description,
}: {
  data: AnalyticsDatum[]
  series: AnalyticsSeries[]
  description: string
}) {
  return (
    <Card className="border-border bg-card lg:col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Tribe Comparison</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 || series.length === 0 ? (
          <ChartEmptyState message="Assign profiles to tribes to compare their current shape." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={data}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                {series.map((item) => (
                  <Radar key={item.key} dataKey={item.key} stroke={item.color} fill={item.color} fillOpacity={0.15} />
                ))}
                <Tooltip {...tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
            <Legend items={series} itemClass="text-[10px]" dotSize="h-2 w-2" />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function FocusAreasBarChart({
  title,
  description,
  data,
}: {
  title: string
  description: string
  data: AnalyticsLabeledDatum[]
}) {
  return (
    <Card className="border-border bg-card lg:col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState message="Load profiles or projects to populate focus-area distribution." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis dataKey="label" type="category" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={88} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((item, index) => (
                  <Cell key={item.label} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function ProfileSourcesPieChart({ data }: { data: AnalyticsBreakdownDatum[] }) {
  return (
    <Card className="border-border bg-card lg:col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Profile Sources</CardTitle>
        <CardDescription className="text-xs">How the current analytics dataset was assembled.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState message="Upload a CSV or load CRM profiles to see source breakdown." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={68}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {data.map((item, index) => (
                    <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-1 flex flex-col gap-1 px-2">
              {data.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
                    {item.name}
                  </div>
                  <span className="font-medium">{item.value}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TopSkillsTable({ items }: { items: AnalyticsSkillTableItem[] }) {
  const maxCount = useMemo(
    () => (items.length > 0 ? Math.max(...items.map((item) => item.count)) : 0),
    [items],
  )

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Top Network Skills</CardTitle>
        <CardDescription className="text-xs">Coverage across the current profile set.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <ChartEmptyState message="Load profiles to surface the strongest skills in the network." />
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <div key={item.skill} className="flex items-center gap-3">
                <span className="w-44 truncate text-sm text-foreground">{item.skill}</span>
                <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.type === "core"
                        ? "bg-accent"
                        : item.type === "growing"
                        ? "bg-primary"
                        : "bg-chart-4/70"
                    }`}
                    style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }}
                    aria-label="skill coverage"
                    aria-valuemax={maxCount}
                    aria-valuenow={item.count}
                  />
                </div>
                <span className="w-8 text-right text-xs font-medium text-muted-foreground">{item.count}</span>
                <Badge
                  variant="secondary"
                  className={`h-4 w-14 px-1.5 text-center text-[9px] ${
                    item.type === "core"
                      ? "bg-accent/15 text-accent"
                      : item.type === "growing"
                      ? "bg-primary/15 text-primary"
                      : "bg-chart-4/15 text-chart-4"
                  }`}
                >
                  {item.coverageLabel}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface AnalyticsPanelProps {
  csvData?: string | null
  activityAuditRows?: ParsedActivity[]
}

export function AnalyticsPanel({ csvData, activityAuditRows = [] }: AnalyticsPanelProps = {}) {
  const [liveProfiles, setLiveProfiles] = useState<SupabaseProfileView[] | null>(null)
  const [liveTribes, setLiveTribes] = useState<Tribe[] | null>(null)
  const [liveProjects, setLiveProjects] = useState<SupabaseProjectView[] | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const csvProfiles = useMemo(() => (csvData ? parseLinkedInCsv(csvData) : null), [csvData])

  const auditTypeChartData = useMemo(() => {
    if (activityAuditRows.length === 0) return []
    return summarizeActivityTypes(activityAuditRows, 8).map(({ type, count }) => ({
      label: type.length > 36 ? `${type.slice(0, 33)}…` : type,
      count,
    }))
  }, [activityAuditRows])

  const loadLiveAnalytics = useCallback(async () => {
    setIsSyncing(true)
    try {
      const [profiles, tribes, projects] = await Promise.all([
        fetchSupabaseProfiles(),
        fetchSupabaseTribes(),
        fetchSupabaseProjects(),
      ])
      setLiveProfiles(profiles)
      setLiveTribes(tribes)
      setLiveProjects(projects)
    } finally {
      setIsSyncing(false)
    }
  }, [])

  useEffect(() => {
    void loadLiveAnalytics()
    const subscriptions = [
      subscribeToProfiles(() => {
        void loadLiveAnalytics()
      }),
      subscribeToTribes(() => {
        void loadLiveAnalytics()
      }),
      subscribeToProjects(() => {
        void loadLiveAnalytics()
      }),
    ].filter(Boolean) as Array<() => void>

    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe()
      }
    }
  }, [loadLiveAnalytics])

  const snapshot = useMemo(
    () =>
      createAnalyticsSnapshot({
        supabaseProfiles: liveProfiles,
        csvProfiles,
        tribes: liveTribes,
        projects: liveProjects,
      }),
    [csvProfiles, liveProfiles, liveProjects, liveTribes],
  )

  const sourceLabel =
    snapshot.source === "combined"
      ? `Combined | ${snapshot.profileCount} profiles`
      : snapshot.source === "csv"
      ? `CSV | ${snapshot.profileCount} profiles`
      : snapshot.source === "supabase"
      ? `Supabase | ${snapshot.profileCount} profiles`
      : "No profile data"

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Talent intelligence and network coverage derived from CRM data.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-accent" />
              {sourceLabel}
            </Badge>
            {isSyncing && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Syncing
              </Badge>
            )}
          </div>
        </div>

        {!snapshot.hasData && (
          <Card className="border-border bg-card">
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="text-sm font-medium text-foreground">No analytics data yet</div>
              <div className="text-xs text-muted-foreground">
                Sign in to load Supabase-backed CRM data, or upload a LinkedIn or activity-audit CSV from Chat or the dashboard to populate the panel.
              </div>
            </CardContent>
          </Card>
        )}

        <KpiRow kpis={snapshot.kpis} />

        {auditTypeChartData.length > 0 ? (
          <Card className="border-border bg-card border-accent/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-accent" />
                Audit activity (import session)
              </CardTitle>
              <CardDescription className="text-xs">
                {activityAuditRows.length.toLocaleString()} events — top types from your activity export.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.min(280, 48 + auditTypeChartData.length * 32)}>
                <BarChart
                  data={auditTypeChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={200}
                    tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {auditTypeChartData.map((item, index) => (
                      <Cell key={item.label} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkillCoverageChart data={snapshot.skillCoverage.data} series={snapshot.skillCoverage.series} />
          <ProjectPortfolioChart data={snapshot.projectPortfolio.data} series={snapshot.projectPortfolio.series} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TribeComparisonChart
            data={snapshot.tribeComparison.data}
            series={snapshot.tribeComparison.series}
            description={snapshot.tribeComparison.description}
          />
          <FocusAreasBarChart
            title={snapshot.focusAreas.title}
            description={snapshot.focusAreas.description}
            data={snapshot.focusAreas.data}
          />
          <ProfileSourcesPieChart data={snapshot.profileSources} />
        </div>

        <TopSkillsTable items={snapshot.topSkills} />
      </div>
    </div>
  )
}
