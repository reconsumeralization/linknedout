"use client"

import { AnalyticsPanel } from "@/components/analytics-panel"
import { AgentsPanel } from "@/components/agents-panel"
import { AppSidebar } from "@/components/app-sidebar"
import { AssistantDrawer } from "@/components/assistant-drawer"
import { ChatPanel } from "@/components/chat-panel"
import { DashboardPanel } from "@/components/dashboard-panel"
import { EmailPanel } from "@/components/email-panel"
import { PanelErrorBoundary } from "@/components/error-boundary"
import { LinkedOutPanel } from "@/components/linkedout-panel"
import { NetworkPanel } from "@/components/network-panel"
import { ProfilesPanel } from "@/components/profiles-panel"
import { DataHubPanel } from "@/components/data-hub-panel"
import { FundraisingPanel } from "@/components/fundraising-panel"
import { ProjectsPanel } from "@/components/projects-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { StoragePanel } from "@/components/storage-panel"
import { SentinelPanel } from "@/components/sentinel-panel"
import { TribesPanel } from "@/components/tribes-panel"
import MarketplacePanel from "@/components/marketplace-panel"
import { AppProvider, useApp, isActiveView } from "@/lib/shared/app-context"
import { PANEL_DEFINITIONS } from "@/lib/shared/panel-registry"
import dynamic from "next/dynamic"
import Link from "next/link"
import type { ComponentType } from "react"

// Re-export types for backward compat with other files that import from "@/app/page"
export type { ActiveView, PageContext } from "@/lib/shared/app-context"

const GlobePanel = dynamic(
  () => import("@/components/globe-panel").then((module) => module.GlobePanel),
  { ssr: false },
)

const REQUIRE_AUTH = process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true"

/** Map view names to their component. Keeps registry file free of client imports. */
const PANEL_COMPONENTS: Record<string, ComponentType> = {
  dashboard: DashboardPanelWrapper,
  chat: ChatPanelWrapper,
  profiles: ProfilesPanelWrapper,
  tribes: TribesPanelWrapper,
  projects: ProjectsPanelWrapper,
  fundraising: FundraisingPanelWrapper,
  data: DataHubPanelWrapper,
  storage: StoragePanel,
  email: EmailPanel,
  analytics: AnalyticsPanelWrapper,
  linkedout: LinkedOutPanelWrapper,
  network: NetworkPanel,
  agents: AgentsPanel,
  globe: GlobePanel,
  sentinel: SentinelPanel,
  settings: SettingsPanelWrapper,
  marketplace: MarketplacePanel,
}

// Wrapper components that bridge context to prop-based panels
function DashboardPanelWrapper() {
  const { setActiveView, csvData } = useApp()
  return <DashboardPanel onNavigate={setActiveView} csvData={csvData} />
}

function ChatPanelWrapper() {
  const { csvData, importLabel, handleImportProfiles } = useApp()
  return <ChatPanel activeView="chat" csvData={csvData} importLabel={importLabel} onImportProfiles={handleImportProfiles} />
}

function ProfilesPanelWrapper() {
  const { csvData, sessionImport, handleSaveImportedPdfProfiles, setActiveView, setPageContext } = useApp()
  return (
    <ProfilesPanel
      csvData={csvData}
      sessionImport={sessionImport}
      onSaveImportedPdfProfiles={handleSaveImportedPdfProfiles}
      onNavigate={setActiveView}
      onPageContextChange={setPageContext}
    />
  )
}

function TribesPanelWrapper() {
  const { csvData, setActiveView, setPageContext } = useApp()
  return (
    <TribesPanel
      csvData={csvData}
      onNavigate={(view) => { if (isActiveView(view)) setActiveView(view) }}
      onPageContextChange={setPageContext}
    />
  )
}

function ProjectsPanelWrapper() {
  const { setActiveView, setPageContext } = useApp()
  return <ProjectsPanel onNavigate={setActiveView} onPageContextChange={setPageContext} />
}

function FundraisingPanelWrapper() {
  const { setActiveView } = useApp()
  return <FundraisingPanel onNavigate={setActiveView} />
}

function DataHubPanelWrapper() {
  const { setActiveView } = useApp()
  return <DataHubPanel onNavigate={setActiveView} />
}

function AnalyticsPanelWrapper() {
  const { csvData } = useApp()
  return <AnalyticsPanel csvData={csvData} />
}

function LinkedOutPanelWrapper() {
  const { csvData, setActiveView } = useApp()
  return <LinkedOutPanel csvData={csvData} onNavigate={setActiveView} />
}

function SettingsPanelWrapper() {
  const { setActiveView } = useApp()
  return <SettingsPanel onNavigate={setActiveView} />
}

function SignInRequiredCard({ title = "Sign in required", message, redirectTo = "/" }: { title?: string; message: string; redirectTo?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 space-y-4 text-center">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to login
          </Link>
          <Link
            href="/auth"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent/50"
          >
            Auth center
          </Link>
        </div>
      </div>
    </div>
  )
}

function HomeContent() {
  const { activeView, setActiveView, hasAuthToken, csvData, importLabel, importSummary, pageContext } = useApp()

  const showOpenModeBanner = !REQUIRE_AUTH && hasAuthToken === false
  const showViewGate = !REQUIRE_AUTH && hasAuthToken === false

  function renderPanel() {
    const definition = PANEL_DEFINITIONS.find((d) => d.view === activeView)
    if (!definition) return null

    if (showViewGate && definition.requiresAuth) {
      return (
        <SignInRequiredCard
          title="Sign in for this section"
          message={definition.authMessage || "This section requires sign-in."}
          redirectTo={`/?view=${activeView}`}
        />
      )
    }

    const Panel = PANEL_COMPONENTS[activeView]
    if (!Panel) return null

    return (
      <PanelErrorBoundary panelName={definition.label}>
        <Panel />
      </PanelErrorBoundary>
    )
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {REQUIRE_AUTH && !hasAuthToken ? (
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 space-y-4 text-center">
            <h1 className="text-xl font-semibold text-foreground">Sign in required</h1>
            <p className="text-sm text-muted-foreground">
              To protect CRM data and AI tools, you must be authenticated with Supabase before using the workspace.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-2">
              <Link
                href="/login?redirect=/"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to login
              </Link>
              <Link
                href="/auth"
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent/50"
              >
                Open auth center
              </Link>
            </div>
          </div>
        </main>
      ) : (
        <div className={showOpenModeBanner ? "flex flex-col flex-1 min-h-0" : "flex flex-1 min-h-0 w-full"}>
          {showOpenModeBanner && (
            <div className="flex items-center justify-center gap-2 bg-muted/90 border-b border-border px-3 py-2 text-xs text-muted-foreground shrink-0">
              <span>Open mode — sign in for full access to Email, SENTINEL, CRM, and Projects.</span>
              <Link href="/login?redirect=/" className="font-medium text-primary hover:underline shrink-0">
                Sign in
              </Link>
              <Link href="/auth" className="text-muted-foreground hover:text-foreground shrink-0">
                Auth center
              </Link>
            </div>
          )}
          <div className="flex flex-1 min-h-0 w-full overflow-hidden">
            <AppSidebar
              activeView={activeView}
              onNavigate={setActiveView}
              importSummary={importSummary}
            />
            <main className="flex-1 overflow-hidden animate-fade-in">
              {renderPanel()}
            </main>
            <AssistantDrawer
              activeView={activeView}
              csvData={csvData}
              importLabel={importLabel}
              pageContext={pageContext}
              onNavigate={setActiveView}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  return (
    <AppProvider>
      <HomeContent />
    </AppProvider>
  )
}
