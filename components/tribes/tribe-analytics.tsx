"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { Tribe, TribeRole, TribeSkillDistPoint } from "@/lib/shared/types"
import { cn } from "@/lib/shared/utils"
import {
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

const TRIBE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const roleColors: Record<TribeRole, string> = {
  Lead: "bg-primary/15 text-primary",
  Strategist: "bg-accent/15 text-accent",
  Executor: "bg-chart-3/15 text-chart-3",
  Creative: "bg-chart-5/15 text-chart-5",
  Analyst: "bg-chart-4/15 text-chart-4",
  Connector: "bg-chart-2/15 text-chart-2",
}

const ALL_ROLES: TribeRole[] = ["Lead", "Strategist", "Executor", "Creative", "Analyst", "Connector"]

function computeRoleDistribution(members: Tribe["members"]): { role: TribeRole; count: number }[] {
  const counts: Record<TribeRole, number> = {} as Record<TribeRole, number>
  for (const r of ALL_ROLES) counts[r] = 0
  for (const m of members) {
    const r = (m.tribeRole as TribeRole) || "Executor"
    counts[r] = (counts[r] ?? 0) + 1
  }
  return ALL_ROLES.map((role) => ({ role, count: counts[role] })).filter((x) => x.count > 0)
}

interface TribeAnalyticsProps {
  tribe: Tribe
}

export function TribeAnalytics({ tribe }: TribeAnalyticsProps) {
  return (
    <>
      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Health Radar */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Health Radar
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ResponsiveContainer width="100%" height={160}>
              <RadarChart data={tribe.radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Skill Distribution */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Skill Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {(tribe.skillDist?.length ?? 0) > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={tribe.skillDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={50}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {(tribe.skillDist ?? []).map((_, idx) => (
                        <Cell key={idx} fill={TRIBE_COLORS[idx % TRIBE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                  {(tribe.skillDist ?? []).map((d, idx) => (
                    <div key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: TRIBE_COLORS[idx % TRIBE_COLORS.length] }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[140px] flex items-center justify-center text-[11px] text-muted-foreground">
                Add members to see skills
              </div>
            )}
          </CardContent>
        </Card>

        {/* Key Strengths */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Key Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {(tribe.strengths ?? []).map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />
                <span className="text-xs text-foreground leading-snug">{s}</span>
              </div>
            ))}
            <div className="pt-2 space-y-1.5">
              {[
                { label: "Cohesion", value: Math.round((tribe.cohesion ?? 0) * 10) },
                { label: "Skills fit", value: Math.round((tribe.complementarity ?? 0) * 10) },
              ].map(m => (
                <div key={m.label} className="space-y-0.5">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{m.label}</span>
                    <span>{m.value}%</span>
                  </div>
                  <Progress value={m.value} className="h-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role distribution */}
      {tribe.members.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Member distribution
            </CardTitle>
            <CardDescription className="text-[11px] mt-0.5">
              Roles and seniority in this tribe
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex flex-wrap gap-3">
              {computeRoleDistribution(tribe.members).map(({ role, count }) => (
                <div
                  key={role}
                  className={cn(
                    "rounded-lg border px-3 py-2 flex items-center gap-2",
                    roleColors[role],
                  )}
                >
                  <span className="text-xs font-medium">{role}</span>
                  <Badge variant="secondary" className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px]">
                    {count}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {["Junior", "Mid", "Senior", "Principal", "Executive"].map((sen) => {
                const n = tribe.members.filter((m) => m.seniority === sen).length
                if (n === 0) return null
                return (
                  <span key={sen} className="flex items-center gap-1">
                    <span className="font-medium text-foreground">{n}</span> {sen}
                  </span>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
