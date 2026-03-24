"use client"

import type { ActiveView } from "@/app/page"
import { cn } from "@/lib/shared/utils"
import { FolderKanban, HandCoins, Link2, Layers, Users } from "lucide-react"

const CRM_VIEWS: { id: ActiveView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "tribes", label: "Tribes", icon: Layers },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "fundraising", label: "Fundraising", icon: HandCoins },
  { id: "linkedout", label: "LinkedOut", icon: Link2 },
]

interface CrmTalentNavProps {
  activeView: ActiveView
  onNavigate: (view: ActiveView) => void
  className?: string
}

/**
 * Quick switch between Profiles CRM, Tribe Builder, Projects, and LinkedOut.
 * Use in each of the four panels so they feel like one workspace.
 */
export function CrmTalentNav({ activeView, onNavigate, className }: CrmTalentNavProps) {
  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">CRM & Talent</span>
      {CRM_VIEWS.map(({ id, label, icon: Icon }) => {
        const isActive = activeView === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
              isActive
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent",
            )}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
