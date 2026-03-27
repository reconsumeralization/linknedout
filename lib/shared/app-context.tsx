"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import {
  applyImportToSession,
  type ImportSourceInput,
  type ImportSummary,
  type SessionImportState,
  serializeProfilesToCanonicalCsv,
} from "@/lib/csv/import-session"
import { importProfilesToSupabase, saveCsvUploadTelemetry } from "@/lib/supabase/supabase-data"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"

export type ActiveView =
  | "dashboard"
  | "chat"
  | "profiles"
  | "tribes"
  | "projects"
  | "fundraising"
  | "data"
  | "storage"
  | "email"
  | "analytics"
  | "linkedout"
  | "network"
  | "agents"
  | "globe"
  | "sentinel"
  | "settings"
  | "marketplace"
  | "transparency"
  | "evolution"
  | "workflows"
  | "sovereign-mind"
  | "genesis"
  | "command-center"

const ACTIVE_VIEW_SET: ReadonlySet<ActiveView> = new Set<ActiveView>([
  "dashboard", "chat", "profiles", "tribes", "projects", "fundraising",
  "data", "storage", "email", "analytics", "linkedout", "network",
  "agents", "globe", "sentinel", "settings", "marketplace",
  "transparency", "evolution", "workflows", "sovereign-mind", "genesis", "command-center",
])

export function isActiveView(value: string | null): value is ActiveView {
  return value !== null && ACTIVE_VIEW_SET.has(value as ActiveView)
}

export type PageContext = Record<string, string | number | boolean | null>

interface AppContextValue {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  pageContext: PageContext
  setPageContext: (ctx: PageContext) => void
  hasAuthToken: boolean | null
  sessionImport: SessionImportState | null
  csvData: string | null
  importLabel: string | null
  importSummary: ImportSummary | null
  handleImportProfiles: (input: ImportSourceInput) => void
  handleSaveImportedPdfProfiles: (profileIds: string[]) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error("useApp must be used within <AppProvider>")
  }
  return ctx
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildImportSummary(sessionImport: SessionImportState | null): ImportSummary | null {
  if (!sessionImport?.displayLabel) return null
  return {
    label: sessionImport.displayLabel,
    profileCount: sessionImport.profiles.length,
    sourceCount: sessionImport.sources.length,
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView>("dashboard")
  const [pageContext, setPageContext] = useState<PageContext>({})
  const [sessionImport, setSessionImport] = useState<SessionImportState | null>(null)
  const [hasAuthToken, setHasAuthToken] = useState<boolean | null>(null)

  useEffect(() => {
    const viewParam = new URLSearchParams(window.location.search).get("view")
    if (isActiveView(viewParam)) {
      setActiveView(viewParam)
    }
  }, [])

  useEffect(() => {
    const check = () => setHasAuthToken(Boolean(resolveSupabaseAccessToken()))
    check()
    window.addEventListener("storage", check)
    return () => window.removeEventListener("storage", check)
  }, [])

  useEffect(() => {
    setPageContext({})
  }, [activeView])

  const handleImportProfiles = useCallback((input: ImportSourceInput) => {
    const importedAt = new Date().toISOString()
    setSessionImport((current) =>
      applyImportToSession(current, input, {
        sourceId: createClientId("import-source"),
        importedAt,
      }),
    )
    if (input.type === "csv") {
      const preview = (input.rawCsv ?? serializeProfilesToCanonicalCsv(input.profiles)).slice(0, 5000)
      void saveCsvUploadTelemetry({
        fileName: input.fileName,
        rowCount: input.profiles.length,
        preview,
      })
    }
  }, [])

  const handleSaveImportedPdfProfiles = useCallback(
    async (profileIds: string[]) => {
      if (!sessionImport || profileIds.length === 0) return

      const accessToken = resolveSupabaseAccessToken()
      if (!accessToken) {
        const error = new Error("Sign in to save imported profiles.")
        toast.error(error.message)
        throw error
      }

      const profilesToSave = sessionImport.profiles.filter((p) => profileIds.includes(p.id))
      if (profilesToSave.length === 0) return

      try {
        const result = await importProfilesToSupabase({ accessToken, profiles: profilesToSave })
        const savedSessionIds = new Set(result.saved.map((item) => item.sessionId))
        setSessionImport((current) => {
          if (!current) return current
          return {
            ...current,
            unsavedPdfProfileIds: current.unsavedPdfProfileIds.filter((id) => !savedSessionIds.has(id)),
          }
        })
        const totalSaved = result.counts.inserted + result.counts.updated
        toast.success(
          totalSaved === 1 ? "Saved imported profile to Supabase." : `Saved ${totalSaved} imported profiles to Supabase.`,
          { description: `${result.counts.inserted} inserted, ${result.counts.updated} updated.` },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save imported profiles."
        toast.error(message)
        throw error
      }
    },
    [sessionImport],
  )

  const csvData = sessionImport?.canonicalCsv ?? null
  const importLabel = sessionImport?.displayLabel ?? null
  const importSummary = useMemo(() => buildImportSummary(sessionImport), [sessionImport])

  const value = useMemo<AppContextValue>(
    () => ({
      activeView,
      setActiveView,
      pageContext,
      setPageContext,
      hasAuthToken,
      sessionImport,
      csvData,
      importLabel,
      importSummary,
      handleImportProfiles,
      handleSaveImportedPdfProfiles,
    }),
    [activeView, pageContext, hasAuthToken, sessionImport, csvData, importLabel, importSummary, handleImportProfiles, handleSaveImportedPdfProfiles],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
