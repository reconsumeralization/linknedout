"use client"

import type { ActiveView } from "@/app/page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SPONSORS } from "@/lib/shared/sponsors"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { clearOnboardingDismissed, clearWelcomeSeen } from "@/components/onboarding-card"
import { getSupabaseClient, resetSupabaseClients } from "@/lib/supabase/supabase"
import { getUserKeys, setUserKeys, clearUserKeys, hasUserSupabase, hasUserOpenAI, type UserKeys } from "@/lib/shared/user-keys"
import {
  getIntegrationKey,
  setIntegrationKey,
  removeIntegrationKey,
  isSponsorConnected,
  countConnectedSponsors,
  SPONSOR_FIELDS,
  type IntegrationCredential,
} from "@/lib/shared/integration-keys"
import { cn } from "@/lib/shared/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  Key,
  LayoutDashboard,
  Linkedin,
  Loader2,
  Mail,
  Network,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Unlock,
  Wifi,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { useCallback, useEffect, useState } from "react"

interface SettingsPanelProps {
  onNavigate?: (view: ActiveView) => void
}

type LinkedInIdentity = {
  name?: string
  email?: string
  updatedAt: string
}

type LinkedInServerIdentity = {
  linkedin_subject: string
  display_name: string | null
  picture_url: string | null
  email: string | null
  expires_at: string
  scopes: string | null
  has_share_scope: boolean
  last_introspect_at: string | null
  introspect_active: boolean | null
}

const LINKEDIN_IDENTITY_KEY = "linkedout_linkedin_identity"

type QuickLink = {
  view: ActiveView
  label: string
  description: string
  icon: LucideIcon
}

const quickLinks: QuickLink[] = [
  {
    view: "dashboard",
    label: "Dashboard",
    description: "Setup checklist and workspace overview",
    icon: LayoutDashboard,
  },
  {
    view: "email",
    label: "Email Security",
    description: "Review sync and mailbox protection",
    icon: Mail,
  },
  {
    view: "sentinel",
    label: "SENTINEL",
    description: "Security control plane — guardrails, not checkboxes",
    icon: ShieldCheck,
  },
  {
    view: "network",
    label: "Network Insights",
    description: "Inspect org graph and connectivity",
    icon: Network,
  },
  {
    view: "agents",
    label: "Agent Control",
    description: "Manage agent guardrails and tooling",
    icon: Bot,
  },
]

function SponsorKeyForm({
  sponsorName,
  fields,
  powersFeature,
  featureTools,
  onSaved,
}: {
  sponsorName: string
  fields: import("@/lib/shared/integration-keys").IntegrationFieldDef[]
  powersFeature: string
  featureTools: string[]
  onSaved: () => void
}) {
  const existing = getIntegrationKey(sponsorName)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of fields) {
      init[f.field] = existing?.[f.field] ?? ""
    }
    return init
  })
  const [saved, setSaved] = useState(false)
  const connected = isSponsorConnected(sponsorName)

  const handleSave = () => {
    const cred: Partial<import("@/lib/shared/integration-keys").IntegrationCredential> = {}
    for (const f of fields) {
      const val = values[f.field]?.trim()
      if (val) (cred as Record<string, string>)[f.field] = val
    }
    setIntegrationKey(sponsorName, cred as Omit<import("@/lib/shared/integration-keys").IntegrationCredential, "savedAt">)
    setSaved(true)
    onSaved()
    toast.success(`${sponsorName} keys saved.`)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDisconnect = () => {
    removeIntegrationKey(sponsorName)
    const cleared: Record<string, string> = {}
    for (const f of fields) cleared[f.field] = ""
    setValues(cleared)
    onSaved()
    toast.success(`${sponsorName} disconnected.`)
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
        <p className="text-xs font-medium">{powersFeature.split(" — ")[0]}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{powersFeature.split(" — ")[1] ?? powersFeature}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {featureTools.slice(0, 4).map((t) => (
            <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>
          ))}
          {featureTools.length > 4 ? (
            <Badge variant="secondary" className="text-[9px]">+{featureTools.length - 4} more</Badge>
          ) : null}
        </div>
      </div>
      {fields.map((f) => (
        <div key={f.field} className="space-y-1.5">
          <Label htmlFor={`${sponsorName}-${f.field}`} className="text-xs">{f.label}</Label>
          <Input
            id={`${sponsorName}-${f.field}`}
            type={f.sensitive ? "password" : "text"}
            placeholder={f.placeholder}
            value={values[f.field] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.field]: e.target.value }))}
            className="font-mono text-xs"
          />
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} className="gap-1.5">
          {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          {saved ? "Saved" : connected ? "Update Keys" : "Connect"}
        </Button>
        {connected ? (
          <Button size="sm" variant="ghost" onClick={handleDisconnect} className="text-muted-foreground">
            Disconnect
          </Button>
        ) : null}
      </div>
      {connected && existing?.savedAt ? (
        <p className="text-[10px] text-muted-foreground">
          Connected since {new Date(existing.savedAt).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  )
}

export function SettingsPanel({ onNavigate }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [guidesReset, setGuidesReset] = useState(false)
  const [linkedinIdentity, setLinkedinIdentity] = useState<LinkedInIdentity | null>(null)
  const [serverLinkedInIdentity, setServerLinkedInIdentity] = useState<LinkedInServerIdentity | null>(null)
  const [linkedinNotice, setLinkedinNotice] = useState<string | null>(null)
  const [linkedinError, setLinkedinError] = useState<string | null>(null)
  const [shareText, setShareText] = useState("")
  const [shareVisibility, setShareVisibility] = useState<"PUBLIC" | "CONNECTIONS" | "LOGGED_IN">("PUBLIC")
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareSuccess, setShareSuccess] = useState<string | null>(null)

  // User-provided keys state
  const [userKeysState, setUserKeysState] = useState<UserKeys>({ supabaseUrl: "", supabaseAnonKey: "", openaiApiKey: "" })
  const [keysSaved, setKeysSaved] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<"success" | "error" | null>(null)

  useEffect(() => {
    setUserKeysState(getUserKeys())
  }, [])

  const handleSaveKeys = useCallback(() => {
    setUserKeys(userKeysState)
    // Reset cached Supabase clients so they pick up new keys
    resetSupabaseClients()
    setKeysSaved(true)
    setConnectionResult(null)
    toast.success("Backend keys saved.")
    setTimeout(() => setKeysSaved(false), 3000)
  }, [userKeysState])

  const handleClearKeys = useCallback(() => {
    clearUserKeys()
    resetSupabaseClients()
    setUserKeysState({ supabaseUrl: "", supabaseAnonKey: "", openaiApiKey: "" })
    setConnectionResult(null)
    toast.success("Backend keys cleared.")
  }, [])

  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true)
    setConnectionResult(null)
    try {
      // Save first so client picks up new keys
      setUserKeys(userKeysState)
      resetSupabaseClients()
      const client = getSupabaseClient()
      if (!client) {
        setConnectionResult("error")
        toast.error("No Supabase URL/key configured.")
        return
      }
      // Simple health check — get session (will fail if keys are invalid)
      const { error } = await client.auth.getSession()
      if (error) {
        setConnectionResult("error")
        toast.error(`Supabase connection failed: ${error.message}`)
      } else {
        setConnectionResult("success")
        toast.success("Supabase connected successfully!")
      }
    } catch (e) {
      setConnectionResult("error")
      toast.error(e instanceof Error ? e.message : "Connection failed.")
    } finally {
      setTestingConnection(false)
    }
  }, [userKeysState])

  // Sponsor integration state
  const integrableSponsors = SPONSORS.filter(s => s.integrationAvailable)
  const [connectedCount, setConnectedCount] = useState(0)
  useEffect(() => {
    setConnectedCount(countConnectedSponsors())
  }, [])

  const supabasePublicEnvConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  const hasUserSupabaseKeys = hasUserSupabase()
  const hasUserOpenAIKey = hasUserOpenAI()
  const supabaseConfigured = supabasePublicEnvConfigured || hasUserSupabaseKeys
  const [hasSession, setHasSession] = useState(false)
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session))
    const { data } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getSession().then(({ data: d }) => setHasSession(!!d.session))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const fetchServerLinkedInIdentity = useCallback(async () => {
    const supabase = getSupabaseClient()
    if (!supabase) return
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return
    try {
      const res = await fetch("/api/linkedin/identity", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = (await res.json()) as { ok?: boolean; identity?: LinkedInServerIdentity | null }
      if (json.ok && json.identity) {
        setServerLinkedInIdentity(json.identity)
      } else {
        setServerLinkedInIdentity(null)
      }
    } catch {
      setServerLinkedInIdentity(null)
    }
  }, [])

  useEffect(() => {
    setMounted(true)

    const loadSavedIdentity = () => {
      try {
        const raw = localStorage.getItem(LINKEDIN_IDENTITY_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as LinkedInIdentity
        if (parsed && typeof parsed === "object") {
          setLinkedinIdentity(parsed)
        }
      } catch {
        // ignore malformed local value
      }
    }

    loadSavedIdentity()

    const params = new URLSearchParams(window.location.search)
    const isSuccess = params.get("linkedinAuthSuccess") === "true"
    const errorCode = params.get("linkedinError")
    const name = params.get("linkedinName") || undefined
    const email = params.get("linkedinEmail") || undefined

    if (isSuccess) {
      const identity: LinkedInIdentity = {
        name,
        email,
        updatedAt: new Date().toISOString(),
      }
      setLinkedinIdentity(identity)
      setLinkedinError(null)
      setLinkedinNotice(
        `LinkedIn connected${name ? ` as ${name}` : ""}${email ? ` (${email})` : ""}.`,
      )
      try {
        localStorage.setItem(LINKEDIN_IDENTITY_KEY, JSON.stringify(identity))
      } catch {
        // ignore storage errors
      }
      fetchServerLinkedInIdentity()
    } else if (errorCode) {
      setLinkedinError(`LinkedIn auth failed (${errorCode.replace(/_/g, " ")}).`)
    }

    if (isSuccess || errorCode) {
      params.delete("linkedinAuthSuccess")
      params.delete("linkedinError")
      params.delete("linkedinName")
      params.delete("linkedinEmail")
      params.delete("linkedinExpiresIn")
      const nextQuery = params.toString()
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
      window.history.replaceState({}, "", nextUrl)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    fetchServerLinkedInIdentity()
  }, [mounted, fetchServerLinkedInIdentity])

  const handleShowSetupChecklist = () => {
    clearOnboardingDismissed()
    onNavigate?.("dashboard")
  }

  const handleShowWelcomeAgain = () => {
    clearWelcomeSeen()
    onNavigate?.("dashboard")
  }

  const handleResetGuides = () => {
    clearOnboardingDismissed()
    clearWelcomeSeen()
    setGuidesReset(true)
  }

  const handleClearLinkedInIdentity = () => {
    try {
      localStorage.removeItem(LINKEDIN_IDENTITY_KEY)
    } catch {
      // ignore storage errors
    }
    setLinkedinIdentity(null)
    setLinkedinNotice("Stored LinkedIn identity was cleared on this browser.")
    setLinkedinError(null)
  }

  const handleShareOnLinkedIn = useCallback(async () => {
    const trimmed = shareText.trim()
    if (!trimmed) {
      toast.error("Enter some text to post.")
      return
    }
    const supabase = getSupabaseClient()
    if (!supabase) {
      toast.error("Supabase not configured.")
      return
    }
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      toast.error("Sign in with Supabase to post to LinkedIn.")
      return
    }
    setShareLoading(true)
    setShareError(null)
    setShareSuccess(null)
    try {
      const res = await fetch("/api/linkedin/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: trimmed, visibility: shareVisibility }),
      })
      const json = (await res.json()) as { ok?: boolean; ugcPostId?: string; error?: string; message?: string }
      if (res.ok && json.ok && json.ugcPostId) {
        setShareSuccess(json.ugcPostId)
        setShareText("")
        toast.success("Posted to LinkedIn.")
      } else {
        const msg = json.message || json.error || "Post failed"
        setShareError(msg)
        toast.error(msg)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Post failed"
      setShareError(msg)
      toast.error(msg)
    } finally {
      setShareLoading(false)
    }
  }, [shareText, shareVisibility])

  const themeLabel = mounted ? (theme ?? "dark").toUpperCase() : "LOADING"
  const statusItems = [
    { label: "Theme state", value: themeLabel, ok: mounted },
    {
      label: "Supabase",
      value: supabaseConfigured ? (supabasePublicEnvConfigured ? "Env configured" : "User keys") : "Not configured",
      ok: supabaseConfigured,
    },
    {
      label: "OpenAI API key",
      value: hasUserOpenAIKey ? "User key set" : "Not configured",
      ok: hasUserOpenAIKey,
    },
    { label: "Guided onboarding controls", value: "Ready", ok: true },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-xl border border-border/80 bg-gradient-to-br from-primary/10 via-background to-background p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Control center</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Tune appearance, onboarding flow, and workspace behavior.
              </p>
              <p className="mt-2 text-xs text-muted-foreground/90 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                Credentials are encrypted; security is built in, not bolted on.
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
        </header>

        {/* Backend Configuration — user-provided keys */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Backend Configuration
            </CardTitle>
            <CardDescription>
              Connect your own Supabase project and AI provider. Keys are stored locally in your browser and sent securely with each request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supabase-url" className="text-xs font-medium flex items-center gap-1.5">
                <Database className="h-3 w-3" />
                Supabase URL
              </Label>
              <Input
                id="supabase-url"
                type="url"
                placeholder="https://your-project.supabase.co"
                value={userKeysState.supabaseUrl}
                onChange={(e) => setUserKeysState((prev) => ({ ...prev, supabaseUrl: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabase-anon-key" className="text-xs font-medium flex items-center gap-1.5">
                <Key className="h-3 w-3" />
                Supabase Anon Key
              </Label>
              <Input
                id="supabase-anon-key"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                value={userKeysState.supabaseAnonKey}
                onChange={(e) => setUserKeysState((prev) => ({ ...prev, supabaseAnonKey: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai-key" className="text-xs font-medium flex items-center gap-1.5">
                <Key className="h-3 w-3" />
                OpenAI API Key
              </Label>
              <Input
                id="openai-key"
                type="password"
                placeholder="sk-..."
                value={userKeysState.openaiApiKey}
                onChange={(e) => setUserKeysState((prev) => ({ ...prev, openaiApiKey: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleSaveKeys} className="gap-1.5">
                {keysSaved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                {keysSaved ? "Saved" : "Save Keys"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleTestConnection} disabled={testingConnection} className="gap-1.5">
                {testingConnection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Test Connection
              </Button>
              <Button size="sm" variant="ghost" onClick={handleClearKeys} className="text-muted-foreground">
                Clear All
              </Button>
            </div>
            {connectionResult === "success" ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Supabase connected successfully
              </div>
            ) : connectionResult === "error" ? (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                Connection failed — check your URL and key
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className={cn("inline-block h-2 w-2 rounded-full", supabaseConfigured ? "bg-emerald-500" : "bg-amber-500")} />
                <span className="text-[10px] text-muted-foreground">Supabase {supabaseConfigured ? (supabasePublicEnvConfigured ? "(env)" : "(user)") : "Not set"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("inline-block h-2 w-2 rounded-full", hasUserOpenAIKey ? "bg-emerald-500" : "bg-amber-500")} />
                <span className="text-[10px] text-muted-foreground">OpenAI {hasUserOpenAIKey ? "Configured" : "Not set"}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Need a Supabase project? <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Create one free</a>.
              Then run the migrations from the <code className="rounded bg-muted px-1 py-0.5">supabase/migrations/</code> folder.
            </p>
          </CardContent>
        </Card>

        {onNavigate ? (
          <Card className="border-primary/10 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Setup progress</CardTitle>
              <CardDescription className="text-xs">
                At a glance. Full steps on Dashboard or the setup guide.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-md border border-border/80 bg-background/60 px-3 py-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${supabaseConfigured ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="text-xs">Supabase</span>
                  <span className="text-xs text-muted-foreground">{supabaseConfigured ? "Connected" : "Not configured"}</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border/80 bg-background/60 px-3 py-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${hasSession ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="text-xs">Session</span>
                  <span className="text-xs text-muted-foreground">{hasSession ? "Signed in" : "Not signed in"}</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border/80 bg-background/60 px-3 py-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${serverLinkedInIdentity || linkedinIdentity ? "bg-emerald-500" : "bg-muted-foreground/60"}`} />
                  <span className="text-xs">LinkedIn</span>
                  <span className="text-xs text-muted-foreground">{serverLinkedInIdentity || linkedinIdentity ? "Connected" : "Optional"}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                  <a href="/setup" target="_blank" rel="noopener noreferrer">
                    Full guide
                    <ArrowRight className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {onNavigate ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Setup and onboarding
              </CardTitle>
              <CardDescription>
                Enter your Supabase and OpenAI keys above, then sign in to unlock Email, Network Insights, and Agent Control. The conversational setup checklist is on the Dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                <a href="/setup" target="_blank" rel="noopener noreferrer">
                  <Rocket className="h-4 w-4" />
                  Open setup guide (Supabase &amp; LinkedIn)
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" onClick={handleShowSetupChecklist}>
                <LayoutDashboard className="h-4 w-4" />
                Show setup checklist on Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 w-full sm:w-auto"
                onClick={() => {
                  window.location.href = "/login?redirect=/auth"
                }}
              >
                <ShieldCheck className="h-4 w-4" />
                Open login page
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 w-full sm:w-auto"
                onClick={() => {
                  window.location.href = "/auth"
                }}
              >
                <ArrowRight className="h-4 w-4" />
                Open auth center
              </Button>
              <Button variant="ghost" size="sm" className="gap-2 w-full sm:w-auto text-muted-foreground" onClick={handleShowWelcomeAgain}>
                <Sparkles className="h-4 w-4" />
                Show welcome screen again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {onNavigate ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace shortcuts</CardTitle>
              <CardDescription>Jump directly to high-impact sections from one place.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {quickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Button
                    key={link.view}
                    variant="outline"
                    className="h-auto justify-between px-3 py-3"
                    onClick={() => onNavigate(link.view)}
                  >
                    <span className="flex min-w-0 items-start gap-2 text-left">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{link.label}</span>
                        <span className="block text-xs text-muted-foreground">{link.description}</span>
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                )
              })}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Choose how LinkedOut looks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="theme">Theme</Label>
                <Badge variant="secondary" className="text-[10px] tracking-wide">
                  {themeLabel}
                </Badge>
              </div>
              {mounted ? (
                <Select
                  value={theme ?? "dark"}
                  onValueChange={(value) => setTheme(value)}
                >
                  <SelectTrigger id="theme" className="w-[220px]">
                    <SelectValue placeholder="Theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Button id="theme" variant="outline" className="w-[220px] justify-between" disabled>
                  Loading...
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn consumer auth
            </CardTitle>
            <CardDescription>
              Sign In with LinkedIn (OpenID Connect). Use &quot;Connect with Share&quot; to also allow posting from LinkedOut. Scopes: <code className="rounded bg-muted px-1 py-0.5 text-xs">openid profile email</code>
              {serverLinkedInIdentity?.has_share_scope ? " + w_member_social" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={cn("inline-block h-2 w-2 rounded-full", (serverLinkedInIdentity || linkedinIdentity) ? "bg-emerald-500" : "bg-amber-500")} />
                <span>Status</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {serverLinkedInIdentity ? "Connected (saved to account)" : linkedinIdentity ? "Connected (this browser)" : "Not connected"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <a href="/auth/linkedin">Connect LinkedIn</a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href="/auth/linkedin?scope=share">Connect with Share</a>
              </Button>
              {linkedinIdentity && !serverLinkedInIdentity ? (
                <Button size="sm" variant="ghost" onClick={handleClearLinkedInIdentity}>
                  Clear local identity
                </Button>
              ) : null}
            </div>
            {(serverLinkedInIdentity || linkedinIdentity) ? (
              <p className="text-xs text-muted-foreground">
                Connected: {serverLinkedInIdentity?.display_name ?? linkedinIdentity?.name ?? "Unknown name"}
                {(serverLinkedInIdentity?.email ?? linkedinIdentity?.email) ? ` (${serverLinkedInIdentity?.email ?? linkedinIdentity?.email})` : ""}
                {serverLinkedInIdentity?.has_share_scope ? " · Can post to LinkedIn." : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Connect to link your LinkedIn identity to LinkedOut. Sign in with Supabase first to save the connection to your account.
              </p>
            )}
            {linkedinNotice ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{linkedinNotice}</p>
            ) : null}
            {linkedinError ? (
              <p className="text-xs text-destructive">{linkedinError}</p>
            ) : null}

            {serverLinkedInIdentity?.has_share_scope ? (
              <div className="space-y-3 border-t border-border pt-3 mt-3">
                <Label className="text-xs font-medium">Share on LinkedIn</Label>
                <Textarea
                  placeholder="What do you want to share? (max 3000 characters)"
                  value={shareText}
                  onChange={(e) => setShareText(e.target.value.slice(0, 3000))}
                  className="min-h-[100px] text-sm resize-y"
                  maxLength={3000}
                  disabled={shareLoading}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={shareVisibility} onValueChange={(v) => setShareVisibility(v as "PUBLIC" | "CONNECTIONS" | "LOGGED_IN")}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PUBLIC" className="text-xs">Public</SelectItem>
                      <SelectItem value="CONNECTIONS" className="text-xs">Connections</SelectItem>
                      <SelectItem value="LOGGED_IN" className="text-xs">Logged-in members</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleShareOnLinkedIn}
                    disabled={shareLoading || !shareText.trim()}
                    className="gap-1.5"
                  >
                    {shareLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {shareLoading ? "Posting..." : "Post to LinkedIn"}
                  </Button>
                </div>
                {shareSuccess ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Posted. Post ID: {shareSuccess}</p>
                ) : null}
                {shareError ? (
                  <p className="text-xs text-destructive">{shareError}</p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Local guides and prompts
            </CardTitle>
            <CardDescription>Reset onboarding reminders and welcome prompts for this browser.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleResetGuides}>
              Reset onboarding and welcome flags
            </Button>
            {guidesReset ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Local guidance flags were reset.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runtime status</CardTitle>
            <CardDescription>Fast checks for client configuration and readiness.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      item.ok ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  <span>{item.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Sponsor Integration Hub — functional key management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Sponsor Integrations
            </CardTitle>
            <CardDescription>
              Connect sponsor services to unlock enhanced features. {connectedCount} of {integrableSponsors.length} connected.
              Keys are stored locally in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {integrableSponsors.map((sponsor) => {
                const connected = isSponsorConnected(sponsor.name)
                const fields = SPONSOR_FIELDS[sponsor.name]
                return (
                  <Dialog key={sponsor.name}>
                    <DialogTrigger asChild>
                      <button className="flex items-center justify-between rounded-lg border border-border p-2.5 hover:border-primary/30 transition-colors w-full text-left">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", connected ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                            <p className="text-xs font-medium truncate">{sponsor.name}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate ml-3.5">{sponsor.powersFeature.split(" — ")[0]}</p>
                        </div>
                        <Badge variant={connected ? "default" : "outline"} className="shrink-0 text-[10px]">
                          {connected ? "Connected" : "Connect"}
                        </Badge>
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base">
                          <Key className="h-4 w-4" />
                          {sponsor.name} Integration
                        </DialogTitle>
                        <DialogDescription>
                          {sponsor.description}
                        </DialogDescription>
                      </DialogHeader>
                      <SponsorKeyForm
                        sponsorName={sponsor.name}
                        fields={fields ?? [{ field: "apiKey", label: "API Key", placeholder: "Enter key...", sensitive: true }]}
                        powersFeature={sponsor.powersFeature}
                        featureTools={sponsor.featureTools}
                        onSaved={() => setConnectedCount(countConnectedSponsors())}
                      />
                    </DialogContent>
                  </Dialog>
                )
              })}
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-muted-foreground">
                {SPONSORS.filter(s => !s.integrationAvailable).length} more coming soon
              </p>
              <a href="/sponsors" className="text-[10px] text-primary hover:underline">View all sponsors &rarr;</a>
            </div>
          </CardContent>
        </Card>

        {/* Sovereignty Audit */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Unlock className="h-4 w-4 text-amber-500" />
              Sovereignty Audit
            </CardTitle>
            <CardDescription className="text-xs">Analyze golden handcuffs and calculate your break-even to sovereignty</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Handcuff value</span>
              <span className="text-xs font-medium">Not calculated</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Break-even months</span>
              <span className="text-xs font-medium">&mdash;</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Sovereign income</span>
              <span className="text-xs font-medium">$0/mo</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Status</span>
              <Badge variant="outline" className="text-xs">Not started</Badge>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              Run Handcuff Audit
            </Button>
          </CardContent>
        </Card>

        {/* Sync Status */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wifi className="h-4 w-4 text-emerald-500" />
              Sync Status
            </CardTitle>
            <CardDescription className="text-xs">Offline queue and shadow state persistence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground">Connection</span>
              </div>
              <Badge variant="outline" className="text-xs">Online</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Pending operations</span>
              <span className="text-xs font-medium">0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Shadow snapshots</span>
              <span className="text-xs font-medium">0 cached</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Conflicts</span>
              <span className="text-xs font-medium">0 pending</span>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
              <RefreshCw className="h-3 w-3" />
              Force Sync
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
            <CardDescription>LinkedOut and environment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              LinkedOut — AI-powered LinkedIn CRM &amp; Tribe Intelligence Platform.
              Backend keys are configured per-user in the Backend Configuration section above.
              Server operators can also set keys via environment variables.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
