"use client"

import * as React from "react"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AuthDecision, PermissionEntry } from "@/lib/safety/tool-authorization"
import type { RiskLevel } from "@/lib/safety/action-classifier"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthGateRequest {
  decision: AuthDecision
  toolLabel: string
  estimatedCost?: number
}

export interface AuthGateDialogProps {
  /** The pending permission request, or null if no request is pending */
  request: AuthGateRequest | null
  /** Recent permission log entries */
  recentLog: PermissionEntry[]
  /** Called when user clicks "Allow Once" */
  onAllowOnce: (toolId: string) => void
  /** Called when user clicks "Allow for Session" */
  onAllowSession: (toolId: string) => void
  /** Called when user clicks "Deny" */
  onDeny: (toolId: string) => void
  /** Called when user activates the kill switch */
  onKillSwitch: () => void
  /** Whether the kill switch is currently active */
  isKilled: boolean
  /** Called when user resets the kill switch */
  onResetKillSwitch?: () => void
}

// ---------------------------------------------------------------------------
// Risk level badge
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<RiskLevel, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  safe: { variant: "secondary", label: "Safe" },
  moderate: { variant: "outline", label: "Moderate" },
  dangerous: { variant: "default", label: "Dangerous" },
  critical: { variant: "destructive", label: "Critical" },
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const config = RISK_COLORS[level]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ---------------------------------------------------------------------------
// Permission log entry
// ---------------------------------------------------------------------------

function LogEntry({ entry }: { entry: PermissionEntry }) {
  const actionColors: Record<string, string> = {
    granted: "text-green-400",
    denied: "text-red-400",
    requested: "text-yellow-400",
    revoked: "text-orange-400",
    "kill-switch": "text-red-500 font-bold",
  }

  const time = new Date(entry.timestamp).toLocaleTimeString()

  return (
    <div className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground font-mono w-16 shrink-0">{time}</span>
      <span className={actionColors[entry.action] ?? "text-foreground"}>
        {entry.action.toUpperCase()}
      </span>
      <span className="text-foreground truncate">{entry.toolId}</span>
      <RiskBadge level={entry.riskLevel} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AuthGateDialog({
  request,
  recentLog,
  onAllowOnce,
  onAllowSession,
  onDeny,
  onKillSwitch,
  isKilled,
  onResetKillSwitch,
}: AuthGateDialogProps) {
  const open = request !== null || isKilled

  // Kill switch active state
  if (isKilled && !request) {
    return (
      <AlertDialog open={true}>
        <AlertDialogContent className="border-red-500/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500 flex items-center gap-2">
              KILL SWITCH ACTIVE
            </AlertDialogTitle>
            <AlertDialogDescription>
              All AI actions have been halted. No tools can execute until the kill switch is manually reset.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {recentLog.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Recent activity before halt:</p>
              <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2">
                {recentLog.map((entry, i) => (
                  <LogEntry key={`${entry.timestamp}-${i}`} entry={entry} />
                ))}
              </ScrollArea>
            </div>
          )}

          <AlertDialogFooter>
            {onResetKillSwitch && (
              <Button variant="outline" onClick={onResetKillSwitch}>
                Reset Kill Switch
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  if (!request) return null

  const { decision, toolLabel, estimatedCost } = request
  const isCritical = decision.riskLevel === "critical"
  const isDangerous = decision.riskLevel === "dangerous"

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className={isCritical ? "border-red-500/50" : undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            Tool Authorization Required
            <RiskBadge level={decision.riskLevel} />
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p className="font-medium text-foreground">{toolLabel}</p>
              {decision.confirmationMessage && (
                <p className="text-sm text-muted-foreground">{decision.confirmationMessage}</p>
              )}
              <p className="text-sm text-muted-foreground">{decision.reason}</p>
              {estimatedCost !== undefined && estimatedCost > 0 && (
                <p className="text-xs text-muted-foreground">
                  Estimated cost: ${estimatedCost.toFixed(4)}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Recent permission log */}
        {recentLog.length > 0 && (
          <div className="mt-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">Recent permissions:</p>
            <ScrollArea className="h-24 rounded-md border bg-muted/30 p-2">
              {recentLog.map((entry, i) => (
                <LogEntry key={`${entry.timestamp}-${i}`} entry={entry} />
              ))}
            </ScrollArea>
          </div>
        )}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          {/* Kill Switch -- always visible, always red */}
          <Button
            variant="destructive"
            size="sm"
            className="sm:mr-auto"
            onClick={onKillSwitch}
          >
            Kill Switch (Stop All)
          </Button>

          <Button variant="outline" onClick={() => onDeny(decision.toolId)}>
            Deny
          </Button>

          {/* Allow for Session -- disabled for critical/dangerous */}
          {!isCritical && !isDangerous && (
            <Button variant="secondary" onClick={() => onAllowSession(decision.toolId)}>
              Allow for Session
            </Button>
          )}

          <Button
            variant={isCritical ? "destructive" : "default"}
            onClick={() => onAllowOnce(decision.toolId)}
          >
            Allow Once
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
