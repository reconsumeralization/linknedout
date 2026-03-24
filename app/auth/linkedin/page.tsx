"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { ArrowLeft, CheckCircle2, Linkedin, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type LinkedInOAuthStatus = {
  ok?: boolean
  configured?: boolean
  scopes?: string[]
  shareScope?: string
}

type LinkedInIdentity = {
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

function formatDate(value: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString()
}

export default function LinkedInAuthPage() {
  const autoStartedRef = useRef(false)
  const supabase = useMemo(() => getSupabaseClient(), [])

  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [shareScopeRequested, setShareScopeRequested] = useState(false)
  const [oauthStatus, setOauthStatus] = useState<LinkedInOAuthStatus | null>(null)
  const [identity, setIdentity] = useState<LinkedInIdentity | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

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
    const response = await fetch("/api/linkedin/oauth?action=status", { cache: "no-store" })
    const payload = (await response.json().catch(() => ({}))) as LinkedInOAuthStatus
    setOauthStatus(payload)
  }, [])

  const loadIdentity = useCallback(async (tokenOverride?: string | null) => {
    const token = tokenOverride ?? accessToken
    if (!token) {
      setIdentity(null)
      return
    }

    const response = await fetch("/api/linkedin/identity", {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      identity?: LinkedInIdentity | null
    }
    if (!response.ok || !payload.ok) {
      setIdentity(null)
      if (response.status !== 401) {
        setMessage(payload.error || "Unable to load LinkedIn identity.")
      }
      return
    }
    setIdentity(payload.identity || null)
  }, [accessToken])

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      refreshAuth().then((token) => loadIdentity(token)),
      loadOAuthStatus(),
    ]).finally(() => setLoading(false))

    const onStorage = () => {
      void refreshAuth().then((token) => loadIdentity(token))
    }
    window.addEventListener("storage", onStorage)

    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const token = session?.access_token || resolveSupabaseAccessToken()
        setAccessToken(token || null)
        setSessionEmail(session?.user?.email || null)
        void loadIdentity(token || null)
      })
      return () => {
        window.removeEventListener("storage", onStorage)
        data.subscription.unsubscribe()
      }
    }

    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [loadIdentity, loadOAuthStatus, refreshAuth, supabase])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setShareScopeRequested(params.get("scope") === "share")
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get("linkedinAuthSuccess") === "true"
    const error = params.get("linkedinError")

    if (success) {
      setMessage("LinkedIn authentication completed successfully.")
      void refreshAuth().then((token) => loadIdentity(token))
    } else if (error) {
      setMessage(`LinkedIn authentication failed: ${error}`)
    }

    if (success || error) {
      params.delete("linkedinAuthSuccess")
      params.delete("linkedinError")
      params.delete("linkedinName")
      params.delete("linkedinEmail")
      params.delete("linkedinExpiresIn")
      const cleanQuery = params.toString()
      const nextUrl = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash}`
      window.history.replaceState({}, "", nextUrl)
    }
  }, [loadIdentity, refreshAuth])

  const startOAuth = useCallback((includeShareScope: boolean) => {
    if (!accessToken) {
      setMessage("Sign in with Supabase first so LinkedIn identity can be saved to your account.")
      return
    }

    setMessage("")
    setLoading(true)
    const returnTo = encodeURIComponent("/auth/linkedin")
    const scope = includeShareScope ? "&scope=share" : ""
    void fetch(`/api/linkedin/oauth?action=start&response=json${scope}&returnTo=${returnTo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          authUrl?: string
        }
        if (!response.ok || !payload.ok || !payload.authUrl) {
          throw new Error(payload.error || "Unable to start LinkedIn OAuth flow.")
        }
        window.location.href = payload.authUrl
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Unable to start LinkedIn OAuth flow.")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [accessToken])

  useEffect(() => {
    if (autoStartedRef.current) {
      return
    }
    if (!shareScopeRequested) {
      return
    }
    if (!oauthStatus?.configured || !accessToken) {
      return
    }
    autoStartedRef.current = true
    startOAuth(true)
  }, [accessToken, oauthStatus?.configured, shareScopeRequested, startOAuth])

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Linkedin className="h-5 w-5 text-primary" />
              LinkedIn Authentication
            </CardTitle>
            <CardDescription>
              Authenticate LinkedIn Sign In and optional share scope for LinkedOut workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={oauthStatus?.configured ? "secondary" : "outline"}>
                OAuth app: {oauthStatus?.configured ? "configured" : "missing LINKEDIN_CLIENT_ID/SECRET"}
              </Badge>
              <Badge variant={accessToken ? "secondary" : "outline"}>
                Supabase session: {accessToken ? "connected" : "required"}
              </Badge>
              <Badge variant={sessionEmail ? "secondary" : "outline"}>
                Account: {sessionEmail || "not signed in"}
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <Button variant="outline" asChild>
                <Link href="/auth" className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  Back to auth
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void Promise.all([refreshAuth().then((token) => loadIdentity(token)), loadOAuthStatus()])} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={() => startOAuth(false)} disabled={!oauthStatus?.configured || !accessToken || loading}>
                Connect profile
              </Button>
              <Button variant="secondary" onClick={() => startOAuth(true)} disabled={!oauthStatus?.configured || !accessToken || loading}>
                Connect + share
              </Button>
            </div>

            {message ? (
              <p className="text-xs text-muted-foreground border border-border rounded-md px-2.5 py-2">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              LinkedIn Identity
            </CardTitle>
            <CardDescription>
              Active LinkedIn identity stored for this user.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading identity...
              </div>
            ) : !identity ? (
              <p className="text-sm text-muted-foreground">No LinkedIn identity connected yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  {identity.display_name || "LinkedIn user"}
                </p>
                <p className="text-muted-foreground">Email: {identity.email || "-"}</p>
                <p className="text-muted-foreground">Subject: {identity.linkedin_subject}</p>
                <p className="text-muted-foreground">Scopes: {identity.scopes || "-"}</p>
                <p className="text-muted-foreground">Share scope: {identity.has_share_scope ? "enabled" : "not granted"}</p>
                <p className="text-muted-foreground">Expires: {formatDate(identity.expires_at)}</p>
                <p className="text-muted-foreground">Last introspection: {formatDate(identity.last_introspect_at)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
