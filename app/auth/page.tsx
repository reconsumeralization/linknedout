"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { APP_NAME, APP_TAGLINE } from "@/lib/shared/branding"
import { getSupabaseClient, hasSupabasePublicEnv } from "@/lib/supabase/supabase"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { AlertTriangle, Bot, Link2, Loader2, LogIn, LogOut, Mail, RefreshCw, ShieldCheck, Sparkles } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

type EmailOAuthStatusPayload = {
  ok?: boolean
  providers?: {
    gmail?: { configured?: boolean }
    outlook?: { configured?: boolean }
  }
}

type LinkedInOAuthStatus = {
  ok?: boolean
  configured?: boolean
}

type LinkedInIdentityResponse = {
  ok?: boolean
  identity?: {
    display_name?: string | null
    email?: string | null
    has_share_scope?: boolean
  } | null
}

type AiStatusResponse = {
  ok?: boolean
  providers?: Array<{
    id: string
    configured: boolean
  }>
}

type ChatHealthResponse = {
  status?: "healthy" | "degraded"
  config?: {
    openaiApiKeyConfigured?: boolean
  }
}

type EmailIntegrationsResponse = {
  ok?: boolean
  integrations?: Array<{ id: string }>
}

export default function AuthCenterPage() {
  const router = useRouter()
  const supabase = useMemo(() => getSupabaseClient(), [])

  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const [gmailConfigured, setGmailConfigured] = useState(false)
  const [outlookConfigured, setOutlookConfigured] = useState(false)
  const [emailIntegrationsCount, setEmailIntegrationsCount] = useState(0)

  const [linkedInConfigured, setLinkedInConfigured] = useState(false)
  const [linkedInIdentityName, setLinkedInIdentityName] = useState<string | null>(null)
  const [linkedInHasShareScope, setLinkedInHasShareScope] = useState(false)

  const [configuredAiProviders, setConfiguredAiProviders] = useState(0)
  const [totalAiProviders, setTotalAiProviders] = useState(0)
  const [chatHealth, setChatHealth] = useState<"healthy" | "degraded" | "unknown">("unknown")
  const [openAiConfigured, setOpenAiConfigured] = useState(false)

  const refreshSupabaseSession = useCallback(async (): Promise<string | null> => {
    let token = resolveSupabaseAccessToken()
    let email: string | null = null

    if (supabase) {
      const { data } = await supabase.auth.getSession()
      token = data.session?.access_token || token
      email = data.session?.user?.email || null
    }

    setAccessToken(token)
    setSessionEmail(email)
    return token
  }, [supabase])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setMessage("")

    try {
      const token = await refreshSupabaseSession()

      const requests: Array<Promise<void>> = [
        fetch("/api/email/oauth?action=status", { cache: "no-store" })
          .then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as EmailOAuthStatusPayload
            setGmailConfigured(Boolean(payload.providers?.gmail?.configured))
            setOutlookConfigured(Boolean(payload.providers?.outlook?.configured))
          })
          .catch(() => {
            setGmailConfigured(false)
            setOutlookConfigured(false)
          }),
        fetch("/api/linkedin/oauth?action=status", { cache: "no-store" })
          .then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as LinkedInOAuthStatus
            setLinkedInConfigured(Boolean(payload.configured))
          })
          .catch(() => {
            setLinkedInConfigured(false)
          }),
        fetch("/api/auth/ai/status", { cache: "no-store" })
          .then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as AiStatusResponse
            const providers = payload.providers || []
            setTotalAiProviders(providers.length)
            setConfiguredAiProviders(providers.filter((provider) => provider.configured).length)
          })
          .catch(() => {
            setTotalAiProviders(0)
            setConfiguredAiProviders(0)
          }),
        fetch("/api/chat?action=health", { cache: "no-store" })
          .then(async (response) => {
            const payload = (await response.json().catch(() => ({}))) as ChatHealthResponse
            setChatHealth(payload.status || "unknown")
            setOpenAiConfigured(Boolean(payload.config?.openaiApiKeyConfigured))
          })
          .catch(() => {
            setChatHealth("unknown")
            setOpenAiConfigured(false)
          }),
      ]

      if (token) {
        requests.push(
          fetch("/api/email/integrations", {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(async (response) => {
              const payload = (await response.json().catch(() => ({}))) as EmailIntegrationsResponse
              if (!response.ok || !payload.ok) {
                setEmailIntegrationsCount(0)
                return
              }
              setEmailIntegrationsCount(payload.integrations?.length || 0)
            })
            .catch(() => {
              setEmailIntegrationsCount(0)
            }),
        )

        requests.push(
          fetch("/api/linkedin/identity", {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          })
            .then(async (response) => {
              const payload = (await response.json().catch(() => ({}))) as LinkedInIdentityResponse
              if (!response.ok || !payload.ok || !payload.identity) {
                setLinkedInIdentityName(null)
                setLinkedInHasShareScope(false)
                return
              }
              setLinkedInIdentityName(payload.identity.display_name || payload.identity.email || "LinkedIn user")
              setLinkedInHasShareScope(Boolean(payload.identity.has_share_scope))
            })
            .catch(() => {
              setLinkedInIdentityName(null)
              setLinkedInHasShareScope(false)
            }),
        )
      } else {
        setEmailIntegrationsCount(0)
        setLinkedInIdentityName(null)
        setLinkedInHasShareScope(false)
      }

      await Promise.all(requests)
    } catch {
      setMessage("Unable to load complete auth status right now.")
    } finally {
      setLoading(false)
    }
  }, [refreshSupabaseSession])

  useEffect(() => {
    void refreshAll()

    const onStorage = () => {
      void refreshAll()
    }
    window.addEventListener("storage", onStorage)

    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(() => {
        void refreshAll()
      })
      return () => {
        window.removeEventListener("storage", onStorage)
        data.subscription.unsubscribe()
      }
    }

    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [refreshAll, supabase])

  const configuredEmailProviders = Number(gmailConfigured) + Number(outlookConfigured)

  const handleSignOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    router.push("/login?redirect=/auth")
  }, [router, supabase])

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </header>
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Auth Center
            </CardTitle>
            <CardDescription>
              Unified authentication status for Supabase, Email, LinkedIn, and AI providers used by chat and agent workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={hasSupabasePublicEnv() ? "secondary" : "outline"}>
                Supabase env: {hasSupabasePublicEnv() ? "configured" : "missing"}
              </Badge>
              <Badge variant={accessToken ? "secondary" : "outline"}>
                Session: {accessToken ? "connected" : "not signed in"}
              </Badge>
              <Badge variant={chatHealth === "healthy" ? "secondary" : "outline"}>
                Chat health: {chatHealth}
              </Badge>
              <Badge variant={openAiConfigured ? "secondary" : "outline"}>
                OpenAI key: {openAiConfigured ? "configured" : "missing"}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" asChild className="text-muted-foreground">
                <Link href="/setup/wizard" className="gap-1.5">
                  <Link2 className="h-4 w-4" />
                  Back to setup wizard
                </Link>
              </Button>
              {accessToken ? (
                <Button variant="outline" onClick={() => void handleSignOut()} className="gap-1.5">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href="/login?redirect=/auth" className="gap-1.5">
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </Link>
                </Button>
              )}
              <Button variant="outline" onClick={() => void refreshAll()} disabled={loading} className="gap-1.5">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button asChild>
                <Link href="/">Open workspace</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/auth/ai">AI provider details</Link>
              </Button>
            </div>
            {message ? (
              <p className="rounded-md border border-border px-2.5 py-2 text-xs text-muted-foreground">{message}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-primary" />
                Email Providers
              </CardTitle>
              <CardDescription>Gmail/Outlook OAuth for inbox sync, drafts, and sending.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Configured providers: <span className="font-medium text-foreground">{configuredEmailProviders}/2</span>
              </p>
              <p className="text-muted-foreground">
                Connected inboxes: <span className="font-medium text-foreground">{emailIntegrationsCount}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={gmailConfigured ? "secondary" : "outline"}>Gmail</Badge>
                <Badge variant={outlookConfigured ? "secondary" : "outline"}>Outlook</Badge>
              </div>
              <Button variant="outline" asChild>
                <Link href="/auth/email">Manage email auth</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4 text-primary" />
                LinkedIn
              </CardTitle>
              <CardDescription>Identity and optional posting scope for LinkedOut automations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                OAuth app:{" "}
                <span className="font-medium text-foreground">{linkedInConfigured ? "configured" : "not configured"}</span>
              </p>
              <p className="text-muted-foreground">
                Connected identity:{" "}
                <span className="font-medium text-foreground">{linkedInIdentityName || "not connected"}</span>
              </p>
              <Badge variant={linkedInHasShareScope ? "secondary" : "outline"}>
                Share scope: {linkedInHasShareScope ? "granted" : "not granted"}
              </Badge>
              <Button variant="outline" asChild>
                <Link href="/auth/linkedin">Manage LinkedIn auth</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-primary" />
                AI Providers
              </CardTitle>
              <CardDescription>Server keys used by chat, realtime, and agent execution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Configured providers:{" "}
                <span className="font-medium text-foreground">
                  {configuredAiProviders}/{totalAiProviders}
                </span>
              </p>
              <p className="text-muted-foreground">
                Realtime/chat readiness:{" "}
                <span className="font-medium text-foreground">{chatHealth === "healthy" ? "healthy" : "degraded"}</span>
              </p>
              <Button variant="outline" asChild>
                <Link href="/auth/ai">Review AI provider auth</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Workflow Readiness
              </CardTitle>
              <CardDescription>Core checklist for teams, tribes, CRM, and project automation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Signed in account: <span className="font-medium text-foreground">{sessionEmail || "not signed in"}</span>
              </p>
              <p className="text-muted-foreground">
                Ready for secure actions:{" "}
                <span className="font-medium text-foreground">
                  {Boolean(accessToken && openAiConfigured && (configuredEmailProviders > 0 || linkedInConfigured))
                    ? "yes"
                    : "needs setup"}
                </span>
              </p>
              {!hasSupabasePublicEnv() ? (
                <div className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chart-4" />
                  Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to enable authenticated services.
                </div>
              ) : null}
              <Button asChild>
                <Link href="/login?redirect=/auth">Authenticate services</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Refreshing authentication status...
          </div>
        ) : null}
      </div>
    </div>
  )
}
