"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getUserKeyHeaders } from "@/lib/shared/user-keys"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { CheckCircle2, ExternalLink, KeyRound, LogIn, Upload, Wrench, XCircle } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type TableStatus = "present" | "missing" | "unknown"
type SchemaStatusPayload = {
  ok?: boolean
  message?: string
  supabase?: { url?: string; source?: "user" | "env" }
  tables?: Record<string, TableStatus>
  summary?: { present: number; missing: number; unknown: number; total: number }
  recommendedAction?: string
}

function authHeaders(): HeadersInit {
  const token = resolveSupabaseAccessToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...getUserKeyHeaders(),
  }
}

export default function SetupWizardPage() {
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schema, setSchema] = useState<SchemaStatusPayload | null>(null)

  const runSchemaCheck = useCallback(async () => {
    setSchemaLoading(true)
    try {
      const res = await fetch("/api/setup/schema-status", { headers: { ...authHeaders() }, cache: "no-store" })
      const j = (await res.json().catch(() => ({}))) as SchemaStatusPayload
      setSchema(j)
    } catch {
      setSchema({ ok: false, message: "Schema check failed." })
    } finally {
      setSchemaLoading(false)
    }
  }, [])

  useEffect(() => {
    // Run once on entry so users get immediate feedback.
    void runSchemaCheck()
  }, [runSchemaCheck])

  const schemaOk = Boolean(schema?.ok && schema?.summary && schema.summary.missing === 0)
  const progressPct = useMemo(() => {
    // Lightweight proxy: 20% base; +40% if schema ok; +40% if signed in.
    const signedIn = Boolean(resolveSupabaseAccessToken())
    return 20 + (schemaOk ? 40 : 0) + (signedIn ? 40 : 0)
  }, [schemaOk])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Setup Wizard</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Complete core setup inside the app: connect Supabase, sign in, confirm schema, then import data.
              </p>
            </div>
            <div className="min-w-[140px] text-right">
              <p className="text-2xl font-semibold">{progressPct}%</p>
              <p className="text-xs text-muted-foreground">setup progress</p>
            </div>
          </div>
          <Progress value={progressPct} className="mt-3 h-2" />
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Step 1 — Connect Supabase
            </CardTitle>
            <CardDescription>
              For hosted use, enter your Supabase URL + anon key in Settings. For local dev, you can also set `.env.local`.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/">
                <Wrench className="h-4 w-4" />
                Open app (then Ctrl+9 for Settings)
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link href="/setup">
                View setup guide
              </Link>
            </Button>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Create Supabase project <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Step 2 — Sign in
            </CardTitle>
            <CardDescription>Sign in once Supabase is configured to unlock CRM, Email, agents, and secure features.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="gap-2">
              <Link href="/login?redirect=/setup/wizard">Open login</Link>
            </Button>
            {resolveSupabaseAccessToken() ? (
              <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-500/40">
                Signed in (token present)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-800 dark:text-amber-400 border-amber-500/40">
                Not signed in yet
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {schemaOk ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-amber-500" />}
              Step 3 — Confirm schema / migrations
            </CardTitle>
            <CardDescription>Checks whether your Supabase project has the tables this app expects.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void runSchemaCheck()} disabled={schemaLoading}>
                {schemaLoading ? "Checking…" : "Run schema check"}
              </Button>
              {schema?.summary ? (
                <Badge variant="outline" className="text-xs">
                  {schema.summary.present}/{schema.summary.total} present
                </Badge>
              ) : null}
              {schema?.supabase?.source ? (
                <Badge variant="outline" className="text-xs">
                  Using {schema.supabase.source === "user" ? "Settings keys" : "deployment env"}
                </Badge>
              ) : null}
            </div>

            {schema?.recommendedAction ? (
              <Alert className="border-border/80 bg-muted/20">
                <AlertTitle>Next action</AlertTitle>
                <AlertDescription className="text-xs">{schema.recommendedAction}</AlertDescription>
              </Alert>
            ) : null}

            {schema?.tables ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(schema.tables).map(([name, status]) => (
                  <div key={name} className="flex items-center justify-between rounded-md border border-border/80 bg-background/60 px-3 py-2">
                    <span className="text-xs font-mono">{name}</span>
                    <span className="text-xs text-muted-foreground">
                      {status === "present" ? "present" : status === "missing" ? "missing" : "unknown"}
                    </span>
                  </div>
                ))}
              </div>
            ) : schema?.message ? (
              <p className="text-xs text-muted-foreground">{schema.message}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Step 4 — Import data
            </CardTitle>
            <CardDescription>Upload a LinkedIn CSV or profile PDF so the workspace has real profiles to analyze.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="gap-2">
              <Link href="/">Open AI Assistant (Ctrl+2)</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step 5 (optional) — LinkedIn + Email</CardTitle>
            <CardDescription>Connect when you want identity and outreach workflows.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/auth">Open Auth Center</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

