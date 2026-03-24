"use client"

import { APP_NAME, APP_TAGLINE } from "@/lib/shared/branding"
import { cn } from "@/lib/shared/utils"
import { Linkedin, type LucideIcon } from "lucide-react"

export interface BrandedPanelHeaderProps {
  /** Panel title (e.g. "Profiles CRM", "Fundraising") */
  title: string
  /** Short description or subtitle for the panel */
  description?: string
  /** Icon for this panel (shown next to title) */
  icon?: LucideIcon
  /** Optional right-side content (e.g. CrmTalentNav, actions) */
  right?: React.ReactNode
  /** Optional extra row below the main header (e.g. stats cards) */
  children?: React.ReactNode
  /** Skip the app branding strip and only show title/description (for compact panels) */
  compact?: boolean
  className?: string
}

/**
 * Shared header for DB/data panels. Shows app branding (name + tagline) and the panel title + description
 * so every data page has a consistent branded look.
 */
export function BrandedPanelHeader({
  title,
  description,
  icon: Icon,
  right,
  children,
  compact = false,
  className,
}: BrandedPanelHeaderProps) {
  return (
    <header
      className={cn(
        "shrink-0 border-b border-border/60 bg-card/50 backdrop-blur-sm",
        compact ? "px-4 py-2" : "px-4 py-3",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {!compact && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
                <Linkedin className="h-4 w-4" />
              </div>
              <div className="hidden sm:block">
                <span className="text-xs font-bold text-foreground tracking-tight">{APP_NAME}</span>
                <span className="text-[10px] text-muted-foreground font-medium tracking-wide ml-1.5">
                  · {APP_TAGLINE}
                </span>
              </div>
            </div>
          )}
          {!compact && (Icon || title) && (
            <div className="h-4 w-px bg-border/80 shrink-0" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {Icon && (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
              )}
              <div>
                <h1 className="text-base font-semibold tracking-tight text-foreground truncate">
                  {title}
                </h1>
                {description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{description}</p>
                )}
              </div>
            </div>
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children && <div className={cn("mt-3", compact && "mt-2")}>{children}</div>}
    </header>
  )
}
