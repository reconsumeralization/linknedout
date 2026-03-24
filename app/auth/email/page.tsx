"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { ArrowLeft, Loader2, Mail, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Provider = "gmail" | "outlook"

type IntegrationView = {
  id: string
  email: string
  provider: Provider | "imap" | "other"
  status: "connected" | "disconnected" | "syncing" | "error" | "pending"
  lastSyncedAt?: string
  syncError?: string
}

type OauthStatusPayload = {
  ok?: boolean
  providers?: {
    gmail?: { configured?: boolean }
    outlook?: { configured?: boolean }
  }
}

function formatDate(value?: string): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString()
}

function providerLabel(provider: Provider): string {
  return provider === "gmail" ? "Gmail" : "Outlook"
}

export default function EmailAuthPage() {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const oauthHandledRef = useRef(false)

  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationView[]>([])
  const [gmailConfigured, setGmailConfigured] = useState(false)
  const [outlookConfigured, setOutlookConfigured] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isActionBusy, setIsActionBusy] = useState(false)
  const [message, setMessage] = useState<string>("")

  const refreshAuth = useCallback(async (): Promise<string | null> => {
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

  const loadOAuthStatus = useCallback(async () => {
    const response = await fetch("/api/email/oauth?action=status", { cache: "no-store" })
    const payload = (await response.json().catch(() => ({}))) as OauthStatusPayload
    setGmailConfigured(Boolean(payload.providers?.gmail?.configured))
    setOutlookConfigured(Boolean(payload.providers?.outlook?.configured))
  }, [])

  const loadIntegrations = useCallback(
    async (tokenOverride?: string | null) => {
      const token = tokenOverride ?? accessToken
      if (!token) {
        setIntegrations([])
        return
      }

      setIsLoading(true)
      const response = await fetch("/api/email/integrations", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        integrations?: IntegrationView[]
      }
      setIsLoading(false)

      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Unable to load email integrations.")
        return
      }

      setIntegrations(payload.integrations || [])
    },
    [accessToken],
  )

  const finalizeOAuthFromCallback = useCallback(
    async (tokenOverride?: string | null) => {
      if (oauthHandledRef.current || typeof window === "undefined") return

      const query = new URLSearchParams(window.location.search)
      const oauthSuccess = query.get("oauthSuccess") === "true"
      const oauthProvider = query.get("oauthProvider")
      const oauthError = query.get("oauthError")
      const oauthEmail = query.get("oauthEmail") || sessionEmail || ""

      if (oauthError) {
        setMessage(`OAuth failed: ${oauthError}`)
      }

      if (!oauthSuccess || (oauthProvider !== "gmail" && oauthProvider !== "outlook")) {
        return
      }

      const hash = window.location.hash
      if (!hash.startsWith("#oauth=")) {
        setMessage("OAuth callback did not include access tokens.")
        return
      }

      const supabaseToken = tokenOverride ?? accessToken ?? (await refreshAuth())
      if (!supabaseToken) {
        setMessage("Sign in with Supabase first, then retry email OAuth connection.")
        return
      }

      const encoded = hash.slice("#oauth=".length)
      const decoded = decodeURIComponent(encoded)
      const hashParams = new URLSearchParams(decoded)
      const providerAccessToken = hashParams.get("accessToken")
      const providerRefreshToken = hashParams.get("refreshToken")

      if (!providerAccessToken) {
        setMessage("OAuth callback access token was missing.")
        return
      }

      oauthHandledRef.current = true
      setIsActionBusy(true)

      const response = await fetch("/api/email/integrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseToken}`,
        },
        body: JSON.stringify({
          email: oauthEmail || `connected-${oauthProvider}@example.com`,
          provider: oauthProvider,
          syncEnabled: true,
          auth: {
            kind: "oauth",
            tokens: {
              accessToken: providerAccessToken,
              refreshToken: providerRefreshToken || undefined,
            },
          },
          config: {
            syncIntervalMs: 300_000,
          },
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      setIsActionBusy(false)

      const cleanUrl = new URL(window.location.href)
      cleanUrl.hash = ""
      cleanUrl.searchParams.delete("oauthSuccess")
      cleanUrl.searchParams.delete("oauthProvider")
      cleanUrl.searchParams.delete("oauthEmail")
      cleanUrl.searchParams.delete("oauthError")
      cleanUrl.searchParams.delete("oauthErrorDescription")
      window.history.replaceState({}, "", cleanUrl.toString())

      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Email integration creation failed after OAuth callback.")
        return
      }

      setMessage("Email provider connected successfully.")
      await loadIntegrations(supabaseToken)
    },
    [accessToken, loadIntegrations, refreshAuth, sessionEmail],
  )

  useEffect(() => {
    void loadOAuthStatus()
    void refreshAuth().then((token) => {
      void loadIntegrations(token)
      void finalizeOAuthFromCallback(token)
    })

    const onStorage = () => {
      void refreshAuth().then((token) => {
        void loadIntegrations(token)
      })
    }
    window.addEventListener("storage", onStorage)

    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const token = session?.access_token || resolveSupabaseAccessToken()
        setAccessToken(token || null)
        setSessionEmail(session?.user?.email || null)
        void loadIntegrations(token || null)
      })
      return () => {
        window.removeEventListener("storage", onStorage)
        data.subscription.unsubscribe()
      }
    }

    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [finalizeOAuthFromCallback, loadIntegrations, loadOAuthStatus, refreshAuth, supabase])

  const startOAuth = useCallback(
    async (provider: Provider) => {
      const token = accessToken ?? (await refreshAuth())
      if (!token) {
        setMessage("Sign in with Supabase first, then retry email OAuth connection.")
        return
      }

      setIsActionBusy(true)
      setMessage("")
      const returnTo = encodeURIComponent("/auth/email")
      const response = await fetch(
        `/api/email/oauth?action=start&provider=${provider}&response=json&returnTo=${returnTo}`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        authUrl?: string
        error?: string
        message?: string
      }
      setIsActionBusy(false)

      if (!response.ok || !payload.ok || !payload.authUrl) {
        setMessage(payload.message || payload.error || "Unable to start OAuth flow.")
        return
      }

      window.location.href = payload.authUrl
    },
    [accessToken, refreshAuth],
  )

  const syncIntegration = useCallback(
    async (integrationId: string) => {
      if (!accessToken) return
      setIsActionBusy(true)
      setMessage("")
      const response = await fetch(`/api/email/integrations/${integrationId}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      setIsActionBusy(false)
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Sync failed.")
        return
      }
      setMessage("Sync completed.")
      await loadIntegrations(accessToken)
    },
    [accessToken, loadIntegrations],
  )

  const deleteIntegration = useCallback(
    async (integrationId: string) => {
      if (!accessToken) return
      setIsActionBusy(true)
      setMessage("")
      const response = await fetch(`/api/email/integrations/${integrationId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      setIsActionBusy(false)
      if (!response.ok || !payload.ok) {
        setMessage(payload.error || "Disconnect failed.")
        return
      }
      setMessage("Integration removed.")
      await loadIntegrations(accessToken)
    },
    [accessToken, loadIntegrations],
  )

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email Authentication
            </CardTitle>
            <CardDescription>
              Authenticate Gmail/Outlook services and manage email connector integrations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={accessToken ? "secondary" : "outline"}>
                Supabase session: {accessToken ? "connected" : "required"}
              </Badge>
              <Badge variant={sessionEmail ? "secondary" : "outline"}>
                Account: {sessionEmail || "not signed in"}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="outline" asChild>
                <Link href="/auth" className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  Back to auth
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void refreshAuth().then((token) => void loadIntegrations(token))} disabled={isLoading || isActionBusy}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/login?redirect=/auth/email">Sign in</Link>
              </Button>
            </div>
            {message ? (
              <p className="text-xs text-muted-foreground border border-border rounded-md px-2.5 py-2">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Gmail</CardTitle>
              <CardDescription>OAuth connector for Google Workspace and Gmail inbox sync.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge variant={gmailConfigured ? "secondary" : "outline"}>
                {gmailConfigured ? "configured" : "missing GOOGLE_CLIENT_ID/SECRET"}
              </Badge>
              <Button
                className="w-full"
                onClick={() => startOAuth("gmail")}
                disabled={!accessToken || !gmailConfigured || isActionBusy}
              >
                Connect Gmail
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Outlook</CardTitle>
              <CardDescription>OAuth connector for Microsoft 365 and Outlook inbox sync.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge variant={outlookConfigured ? "secondary" : "outline"}>
                {outlookConfigured ? "configured" : "missing MICROSOFT_CLIENT_ID/SECRET"}
              </Badge>
              <Button
                className="w-full"
                onClick={() => startOAuth("outlook")}
                disabled={!accessToken || !outlookConfigured || isActionBusy}
              >
                Connect Outlook
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Connected Integrations
            </CardTitle>
            <CardDescription>
              Active email connectors for this signed-in Supabase user.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading integrations...
              </div>
            ) : integrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No email integrations found.</p>
            ) : (
              integrations.map((integration) => (
                <div key={integration.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{integration.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {integration.provider.toUpperCase()} · status {integration.status} · last sync {formatDate(integration.lastSyncedAt)}
                      </p>
                      {integration.syncError ? (
                        <p className="text-xs text-destructive mt-1">{integration.syncError}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void syncIntegration(integration.id)} disabled={isActionBusy || !accessToken}>
                        Sync
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void deleteIntegration(integration.id)} disabled={isActionBusy || !accessToken}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
