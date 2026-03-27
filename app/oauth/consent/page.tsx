"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { APP_NAME } from "@/lib/shared/branding"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OAuthParams {
  clientId: string
  redirectUri: string
  responseType: string
  scope: string
  state: string
}

interface AppInfo {
  name: string
  icon?: string
}

// ---------------------------------------------------------------------------
// Scope descriptions for human-readable display
// ---------------------------------------------------------------------------

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  "openid": { label: "OpenID", description: "Verify your identity" },
  "profile": { label: "Profile", description: "Read your basic profile information" },
  "email": { label: "Email", description: "Read your email address" },
  "offline_access": { label: "Offline Access", description: "Maintain access when you're not actively using the app" },
  "read:profiles": { label: "Profiles (read)", description: "Read your CRM profiles" },
  "write:profiles": { label: "Profiles (write)", description: "Create and update CRM profiles" },
  "read:tribes": { label: "Tribes (read)", description: "Read your tribe data" },
  "write:tribes": { label: "Tribes (write)", description: "Create and update tribes" },
  "read:projects": { label: "Projects (read)", description: "Read your projects" },
  "write:projects": { label: "Projects (write)", description: "Create and update projects" },
}

function getScopeInfo(scope: string) {
  return SCOPE_LABELS[scope] ?? { label: scope, description: `Access: ${scope}` }
}

// ---------------------------------------------------------------------------
// Inner consent component (needs useSearchParams inside Suspense)
// ---------------------------------------------------------------------------

function ConsentInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => getSupabaseClient(), [])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Parse OAuth params from URL
  const oauthParams = useMemo<OAuthParams | null>(() => {
    const clientId = searchParams.get("client_id")
    const redirectUri = searchParams.get("redirect_uri")
    const responseType = searchParams.get("response_type") ?? "code"
    const scope = searchParams.get("scope") ?? "openid"
    const state = searchParams.get("state") ?? ""

    if (!clientId || !redirectUri) return null
    return { clientId, redirectUri, responseType, scope, state }
  }, [searchParams])

  const scopes = useMemo(
    () => (oauthParams?.scope ?? "").split(/\s+/).filter(Boolean),
    [oauthParams],
  )

  // Resolve app name from client_id (could be enhanced with a lookup)
  const appInfo = useMemo<AppInfo>(() => {
    return { name: oauthParams?.clientId ?? "Unknown App" }
  }, [oauthParams])

  // Check session
  useEffect(() => {
    if (!supabase) {
      setError("Authentication service is not configured.")
      setLoading(false)
      return
    }

    void supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user?.email ?? null
      setUserEmail(email)
      setLoading(false)

      // If not logged in, redirect to login with a return URL
      if (!data.session) {
        const returnUrl = typeof window !== "undefined" ? window.location.href : "/oauth/consent"
        router.replace(`/login?redirect=${encodeURIComponent(returnUrl)}`)
      }
    })
  }, [supabase, router])

  // Approve: POST consent to Supabase OAuth server
  const handleApprove = useCallback(async () => {
    if (!supabase || !oauthParams) return
    setBusy(true)
    setError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        setError("Session expired. Please sign in again.")
        setBusy(false)
        return
      }

      // Build the authorization URL with consent=true
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl) {
        setError("Supabase URL not configured.")
        setBusy(false)
        return
      }

      // POST to the Supabase OAuth authorize endpoint with consent granted
      const authorizeUrl = new URL("/auth/v1/authorize", supabaseUrl)
      authorizeUrl.searchParams.set("client_id", oauthParams.clientId)
      authorizeUrl.searchParams.set("redirect_uri", oauthParams.redirectUri)
      authorizeUrl.searchParams.set("response_type", oauthParams.responseType)
      authorizeUrl.searchParams.set("scope", oauthParams.scope)
      if (oauthParams.state) authorizeUrl.searchParams.set("state", oauthParams.state)
      authorizeUrl.searchParams.set("consent", "true")

      const res = await fetch(authorizeUrl.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        redirect: "follow",
      })

      if (res.redirected) {
        // Supabase sent back a redirect with the authorization code
        window.location.href = res.url
        return
      }

      // Try to get redirect from response body
      if (res.ok) {
        const body = await res.json().catch(() => null)
        if (body?.redirect_to) {
          window.location.href = body.redirect_to
          return
        }
        // If we get a code directly
        if (body?.code) {
          const redirect = new URL(oauthParams.redirectUri)
          redirect.searchParams.set("code", body.code)
          if (oauthParams.state) redirect.searchParams.set("state", oauthParams.state)
          window.location.href = redirect.toString()
          return
        }
      }

      // Non-redirect response — likely an error
      const errorBody = await res.text().catch(() => "Unknown error")
      setError(`Authorization failed (${res.status}): ${errorBody}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed")
    } finally {
      setBusy(false)
    }
  }, [supabase, oauthParams])

  // Deny: redirect back with error
  const handleDeny = useCallback(() => {
    if (!oauthParams) return
    const redirect = new URL(oauthParams.redirectUri)
    redirect.searchParams.set("error", "access_denied")
    redirect.searchParams.set("error_description", "The user denied the authorization request.")
    if (oauthParams.state) redirect.searchParams.set("state", oauthParams.state)
    window.location.href = redirect.toString()
  }, [oauthParams])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!oauthParams) {
    return (
      <div className="min-h-screen bg-background text-foreground px-4 py-10">
        <div className="mx-auto max-w-md">
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Invalid Request
              </CardTitle>
              <CardDescription>
                Missing required OAuth parameters. The authorization request must include{" "}
                <code className="text-xs">client_id</code> and <code className="text-xs">redirect_uri</code>.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="mx-auto max-w-md space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-xl font-bold">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">Authorization Request</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Authorize {appInfo.name}
            </CardTitle>
            <CardDescription>
              <strong>{appInfo.name}</strong> is requesting access to your {APP_NAME} account
              {userEmail ? ` (${userEmail})` : ""}.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Requested scopes */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">This app will be able to:</p>
              <ul className="space-y-2">
                {scopes.map((scope) => {
                  const info = getScopeInfo(scope)
                  return (
                    <li key={scope} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <div>
                        <span className="text-sm font-medium">{info.label}</span>
                        <p className="text-xs text-muted-foreground">{info.description}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Redirect info */}
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Redirect URI</p>
              <p className="text-xs font-mono truncate">{oauthParams.redirectUri}</p>
            </div>

            {userEmail && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  Signed in as {userEmail}
                </Badge>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={handleDeny}
              disabled={busy}
            >
              <XCircle className="h-4 w-4" />
              Deny
            </Button>
            <Button
              className="flex-1 gap-1.5"
              onClick={() => void handleApprove()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Authorize
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          You can revoke access at any time from your {APP_NAME} settings.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page wrapper with Suspense (required for useSearchParams)
// ---------------------------------------------------------------------------

export default function OAuthConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ConsentInner />
    </Suspense>
  )
}
