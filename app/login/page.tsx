"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { APP_NAME, APP_TAGLINE } from "@/lib/shared/branding"
import { normalizeRedirectPath } from "@/lib/auth/auth-redirect"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { ArrowRight, KeyRound, Loader2, Lock, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => getSupabaseClient(), [])

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>("")
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [hasSessionToken, setHasSessionToken] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [redirectTo, setRedirectTo] = useState("/")

  const refreshSession = useCallback(async () => {
    const token = resolveSupabaseAccessToken()
    setHasSessionToken(Boolean(token))

    if (!supabase) {
      setSessionEmail(null)
      return
    }

    const { data } = await supabase.auth.getSession()
    setSessionEmail(data.session?.user?.email || null)
  }, [supabase])

  useEffect(() => {
    if (!supabase) {
      setStatusMessage("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.")
      return
    }

    const hash = typeof window !== "undefined" ? window.location.hash : ""
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()
    setRedirectTo(normalizeRedirectPath(params.get("redirect")))
    const isRecovery = params.get("type") === "recovery" || (hash && hash.includes("type=recovery"))
    if (isRecovery) setRecoveryMode(true)

    void refreshSession()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email || null)
      setHasSessionToken(Boolean(session?.access_token || resolveSupabaseAccessToken()))
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [refreshSession, supabase])

  const handleSignIn = useCallback(async () => {
    if (!supabase) {
      setStatusMessage("Supabase is not configured.")
      return
    }
    setBusy(true)
    setStatusMessage("")
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) {
      setStatusMessage(error.message)
      return
    }
    setStatusMessage("Signed in successfully.")
    await refreshSession()
    router.push(redirectTo)
  }, [email, password, redirectTo, refreshSession, router, supabase])

  const handleSignUp = useCallback(async () => {
    if (!supabase) {
      setStatusMessage("Supabase is not configured.")
      return
    }
    setBusy(true)
    setStatusMessage("")
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTo)}` : undefined,
      },
    })
    setBusy(false)
    if (error) {
      setStatusMessage(error.message)
      return
    }
    setStatusMessage("Sign-up succeeded. Check your inbox to confirm your account if required.")
  }, [email, password, redirectTo, supabase])

  const handleMagicLink = useCallback(async () => {
    if (!supabase) {
      setStatusMessage("Supabase is not configured.")
      return
    }
    setBusy(true)
    setStatusMessage("")
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTo)}` : undefined,
      },
    })
    setBusy(false)
    if (error) {
      setStatusMessage(error.message)
      return
    }
    setStatusMessage("Magic link sent. Open your email to continue.")
  }, [email, redirectTo, supabase])

  const handleOAuth = useCallback(
    async (provider: "google" | "github") => {
      if (!supabase) {
        setStatusMessage("Supabase is not configured.")
        return
      }
      setBusy(true)
      setStatusMessage("")
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTo)}`
              : undefined,
        },
      })
      setBusy(false)
      if (error) {
        setStatusMessage(error.message)
      }
    },
    [redirectTo, supabase],
  )

  const handleSignOut = useCallback(async () => {
    if (!supabase) {
      setStatusMessage("Supabase is not configured.")
      return
    }
    setBusy(true)
    setStatusMessage("")
    const { error } = await supabase.auth.signOut()
    setBusy(false)
    if (error) {
      setStatusMessage(error.message)
      return
    }
    setStatusMessage("Signed out.")
    setRecoveryMode(false)
    setForgotPasswordSent(false)
    await refreshSession()
  }, [refreshSession, supabase])

  const handleForgotPassword = useCallback(async () => {
    if (!supabase || !email.trim()) {
      setStatusMessage("Enter your email address first.")
      return
    }
    setBusy(true)
    setStatusMessage("")
    const redirectToReset = typeof window !== "undefined"
      ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTo)}&type=recovery`
      : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectToReset,
    })
    setBusy(false)
    if (error) {
      setStatusMessage(error.message)
      return
    }
    setForgotPasswordSent(true)
    setStatusMessage("Check your email for a password reset link.")
  }, [email, redirectTo, supabase])

  const handleSetNewPassword = useCallback(async () => {
    if (!supabase) return
    if (newPassword.length < 6) {
      setStatusMessage("Password must be at least 6 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setStatusMessage("Passwords do not match.")
      return
    }
    setBusy(true)
    setStatusMessage("")
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setBusy(false)
    if (error) {
      setStatusMessage(error.message)
      return
    }
    setStatusMessage("Password updated. Redirecting...")
    setNewPassword("")
    setConfirmPassword("")
    setRecoveryMode(false)
    setTimeout(() => router.push(redirectTo), 800)
  }, [confirmPassword, newPassword, redirectTo, router, supabase])

  const supabaseReady = Boolean(supabase)
  const canSubmitPassword = email.trim().length > 3 && password.length >= 6 && !busy && supabaseReady
  const canSubmitEmailOnly = email.trim().length > 3 && !busy && supabaseReady
  const canSetNewPassword = newPassword.length >= 6 && newPassword === confirmPassword && !busy && supabaseReady

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-xl font-bold text-foreground">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </header>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {recoveryMode ? "Set new password" : "Sign in"}
            </CardTitle>
            <CardDescription>
              {recoveryMode
                ? "You opened the reset link. Choose a new password below."
                : "Authenticate with Supabase to unlock CRM, email, agents, and secure tools."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recoveryMode ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                  />
                </div>
                <Button onClick={() => void handleSetNewPassword()} disabled={!canSetNewPassword} className="w-full gap-1.5">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  Update password
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Your password"
                  />
                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={!canSubmitEmailOnly || forgotPasswordSent}
                    className="text-xs text-muted-foreground hover:text-primary hover:underline disabled:opacity-50"
                  >
                    {forgotPasswordSent ? "Reset link sent — check your email" : "Forgot password?"}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => void handleSignIn()} disabled={!canSubmitPassword} className="gap-1.5">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Sign in
                  </Button>
                  <Button variant="outline" onClick={() => void handleSignUp()} disabled={!canSubmitPassword}>
                    Create account
                  </Button>
                </div>
                <Button variant="secondary" className="w-full gap-1.5" onClick={() => void handleMagicLink()} disabled={!canSubmitEmailOnly}>
                  <Mail className="h-4 w-4" />
                  Send magic link
                </Button>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" onClick={() => void handleOAuth("google")} disabled={!canSubmitEmailOnly}>
                    Continue with Google
                  </Button>
                  <Button variant="outline" onClick={() => void handleOAuth("github")} disabled={!canSubmitEmailOnly}>
                    Continue with GitHub
                  </Button>
                </div>
              </>
            )}
            {statusMessage ? (
              <p className="text-xs text-muted-foreground rounded-md border border-border px-2.5 py-2">{statusMessage}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              Session
            </CardTitle>
            <CardDescription>
              {hasSessionToken
                ? `Signed in as ${sessionEmail || "user"}. Continue to your destination or sign out.`
                : `After login you will be sent to: ${redirectTo}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={hasSessionToken ? "secondary" : "outline"}>
                {hasSessionToken ? "Signed in" : "Not signed in"}
              </Badge>
              {sessionEmail && (
                <Badge variant="outline" className="font-normal truncate max-w-[200px]">
                  {sessionEmail}
                </Badge>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => void refreshSession()} disabled={busy}>
                Refresh
              </Button>
              <Button variant="outline" onClick={() => void handleSignOut()} disabled={!sessionEmail || busy} className="gap-1.5">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild disabled={!hasSessionToken}>
                <Link href={redirectTo} className="gap-1.5">
                  Continue to destination
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/auth">Auth center</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
