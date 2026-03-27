"use client"

import type React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Tribe } from "@/lib/shared/types"
import { cn } from "@/lib/shared/utils"
import { Brain, Layers, Star, Target, Users, Zap } from "lucide-react"

function formatPercent(value: number | undefined, digits = 1): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return `${value.toFixed(digits)}%`
}

interface TribeDetailHeaderProps {
  tribe: Tribe
  editingName: boolean
  editNameValue: string
  nameInputRef: React.RefObject<HTMLInputElement | null>
  reanalyzeError: string | null
  isReanalyzing: boolean
  onEditNameValueChange: (v: string) => void
  onStartRename: () => void
  onSubmitRename: () => void
  onCancelRename: () => void
  onReanalyze: () => void
  onAssignProject: () => void
}

export function TribeDetailHeader({
  tribe,
  editingName,
  editNameValue,
  nameInputRef,
  reanalyzeError,
  isReanalyzing,
  onEditNameValueChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onReanalyze,
  onAssignProject,
}: TribeDetailHeaderProps) {
  const skillCoverage = formatPercent(tribe.requiredSkillCoveragePercent, 1)
  const networkShare = formatPercent(tribe.networkSharePercent, 2)
  const windowCoverage = formatPercent(tribe.designWindowCoveragePercent, 1)
  const hasWindowSummary = Boolean(
    typeof tribe.designWindowUsedProfileCount === "number" &&
    typeof tribe.designWindowTotalProfiles === "number",
  )

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary shrink-0" />
            {editingName ? (
              <Input
                ref={nameInputRef}
                value={editNameValue}
                onChange={e => onEditNameValueChange(e.target.value)}
                onBlur={onSubmitRename}
                onKeyDown={e => {
                  if (e.key === "Enter") onSubmitRename()
                  if (e.key === "Escape") onCancelRename()
                }}
                className="h-7 text-lg font-bold px-2 py-0 border-primary/40"
              />
            ) : (
              <h1 className="text-xl font-bold text-foreground leading-tight">{tribe.name}</h1>
            )}
            <button
              type="button"
              onClick={editingName ? onSubmitRename : onStartRename}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Rename tribe"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 ml-7">{tribe.description}</p>
          {reanalyzeError ? (
            <p role="alert" className="ml-7 mt-2 text-xs text-destructive">
              {reanalyzeError}
            </p>
          ) : null}
          {hasWindowSummary ? (
            <div
              className={cn(
                "ml-7 mt-2 rounded-md border px-2.5 py-2 text-[11px]",
                tribe.designWindowTruncated
                  ? "border-chart-4/40 bg-chart-4/10 text-chart-4"
                  : "border-accent/30 bg-accent/10 text-foreground",
              )}
            >
              <div className="font-medium">
                Window usage: {tribe.designWindowUsedProfileCount} / {tribe.designWindowTotalProfiles} profiles
              </div>
              {typeof tribe.designWindowLimit === "number" ? (
                <div className="text-muted-foreground">Window limit: {tribe.designWindowLimit}</div>
              ) : null}
              {windowCoverage ? (
                <div className="text-muted-foreground">Workspace coverage: {windowCoverage}</div>
              ) : null}
              {tribe.designWindowTruncated ? (
                <div className="mt-1 font-medium">Top window used; rerun with different filters for another slice.</div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={onReanalyze}
            disabled={isReanalyzing}
          >
            <Brain className="w-3.5 h-3.5" />
            {isReanalyzing ? "Analyzing..." : "Re-analyze"}
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={onAssignProject}
          >
            <Target className="w-3.5 h-3.5" />
            Assign Project
          </Button>
        </div>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Members", value: `${tribe.members.length}`, icon: Users, color: "text-chart-3" },
          {
            label: "Skill Coverage",
            value: skillCoverage ?? "n/a",
            icon: Brain,
            color:
              typeof tribe.requiredSkillCoveragePercent === "number" &&
              tribe.requiredSkillCoveragePercent < 50
                ? "text-chart-4"
                : "text-accent",
          },
          { label: "Network Share", value: networkShare ?? "n/a", icon: Layers, color: "text-primary" },
          {
            label: "Cohesion",
            value: typeof tribe.cohesion === "number" ? tribe.cohesion : "n/a",
            icon: Star,
            color: "text-primary",
            suffix: typeof tribe.cohesion === "number" ? "/10" : "",
          },
          {
            label: "Complementarity",
            value: typeof tribe.complementarity === "number" ? tribe.complementarity : "n/a",
            icon: Zap,
            color: "text-accent",
            suffix: typeof tribe.complementarity === "number" ? "/10" : "",
          },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
                  <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
                <div className={`text-xl font-bold ${s.color}`}>
                  {`${s.value}${s.suffix ?? ""}`}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </>
  )
}
