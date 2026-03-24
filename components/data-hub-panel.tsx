"use client"

import type { ActiveView } from "@/app/page"
import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Database,
  FolderKanban,
  HandCoins,
  Layers,
  Users,
  HardDrive,
  ChevronRight,
} from "lucide-react"

interface DataHubPanelProps {
  onNavigate: (view: ActiveView) => void
}

const DATA_CARDS: Array<{
  id: ActiveView
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: "profiles", title: "Profiles CRM", description: "Contacts and talent", icon: Users },
  { id: "tribes", title: "Tribe Builder", description: "Build dream teams", icon: Layers },
  { id: "projects", title: "Projects", description: "Track initiatives", icon: FolderKanban },
  { id: "fundraising", title: "Fundraising", description: "Campaigns, donors, goals", icon: HandCoins },
  { id: "storage", title: "Files & assets", description: "Upload and manage files", icon: HardDrive },
]

export function DataHubPanel({ onNavigate }: DataHubPanelProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <BrandedPanelHeader
        compact
        title="Data hub"
        description="All Supabase-backed data and storage"
        icon={Database}
      />
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-muted-foreground mb-4">
          Open any area to view and manage data. All data is stored in your Supabase project and surfaced here with LinkedOut branding.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DATA_CARDS.map(({ id, title, description, icon: Icon }) => (
            <Card
              key={id}
              className="cursor-pointer border-border/80 hover:border-primary/40 hover:bg-muted/30 transition-colors"
              onClick={() => onNavigate(id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <span className="text-xs text-primary font-medium">Open →</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
