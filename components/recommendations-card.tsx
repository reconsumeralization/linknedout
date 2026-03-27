"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  getRecommendations,
  type Recommendation,
  type RecommendationPriority,
} from "@/lib/analytics/recommendation-engine"
import type { ParsedProfile } from "@/lib/csv/csv-parser"
import type { Tribe } from "@/lib/shared/types"
import { Lightbulb, X, ChevronRight } from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISMISSED_KEY = "linkedout_dismissed_recs"

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>): void {
  if (typeof window === "undefined") return
  try {
    // Keep at most 200 dismissed IDs to avoid bloat. Older ones fall off.
    const arr = [...ids].slice(-200)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr))
  } catch {
    // Ignore
  }
}

const priorityVariant: Record<
  RecommendationPriority,
  "destructive" | "default" | "secondary"
> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
}

const priorityLabel: Record<RecommendationPriority, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RecommendationsCardProps {
  profiles: ParsedProfile[]
  tribes: Tribe[]
  /** Called when user clicks the action button on a recommendation. */
  onAction?: (rec: Recommendation) => void
  /** Called when user clicks "See all" */
  onSeeAll?: () => void
  /** Maximum recommendations to show (default 3) */
  limit?: number
  className?: string
}

export function RecommendationsCard({
  profiles,
  tribes,
  onAction,
  onSeeAll,
  limit = 3,
  className,
}: RecommendationsCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())
  const [cardDismissed, setCardDismissed] = useState(false)

  // Generate recommendations, filtering out dismissed ones
  const recommendations = useMemo(() => {
    const all = getRecommendations(profiles, tribes)
    return all.filter((r) => !dismissed.has(r.id))
  }, [profiles, tribes, dismissed])

  const visible = recommendations.slice(0, limit)
  const remaining = Math.max(0, recommendations.length - limit)

  const handleDismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        const next = new Set(prev)
        next.add(id)
        saveDismissed(next)
        return next
      })
    },
    [],
  )

  const handleDismissCard = useCallback(() => {
    setCardDismissed(true)
  }, [])

  // Nothing to show
  if (cardDismissed || visible.length === 0) return null

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-accent" />
            <CardTitle className="text-sm font-semibold">
              Recommendations
            </CardTitle>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {recommendations.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismissCard}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Dismiss recommendations</span>
          </Button>
        </div>
        <CardDescription className="text-xs">
          AI-powered suggestions to improve your network
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {visible.map((rec) => (
          <div
            key={rec.id}
            className="group flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/60"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge
                  variant={priorityVariant[rec.priority]}
                  className="text-[10px] px-1.5 py-0 leading-4"
                >
                  {priorityLabel[rec.priority]}
                </Badge>
                <span className="text-xs font-medium text-foreground truncate">
                  {rec.title}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                {rec.description}
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 mt-1 text-xs text-primary"
                onClick={() => onAction?.(rec)}
              >
                {rec.actionLabel}
                <ChevronRight className="ml-0.5 h-3 w-3" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDismiss(rec.id)}
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        ))}

        {remaining > 0 && onSeeAll && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={onSeeAll}
          >
            See all {recommendations.length} recommendations
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
