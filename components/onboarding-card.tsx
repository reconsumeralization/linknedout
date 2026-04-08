"use client"

import type { ActiveView } from "@/app/page"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { OnboardingOptionalStepsState } from "@/lib/supabase/supabase-data"
import { getUserKeyHeaders } from "@/lib/shared/user-keys"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { Check, ChevronRight, Heart, Linkedin, Mail, MessageSquare, Rocket, ShieldCheck, Sparkles, Upload } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

const ONBOARDING_DISMISSED_KEY = "linkedout_onboarding_dismissed"
const WELCOME_SEEN_KEY = "linkedout_welcome_seen"

export interface OnboardingCardProps {
  /** Supabase env vars are set (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY). */
  hasSupabaseConfigured?: boolean
  /** User has a valid Supabase session (bearer token in storage). */
  hasAuth: boolean
  /** User has added data (CSV/PDF uploaded or Supabase has profile/crm data). */
  hasData: boolean
  onNavigate: (view: ActiveView) => void
  /** Optional: force show even if previously dismissed (e.g. from Settings). */
  forceShow?: boolean
  /** When signed in, reflects Supabase-backed completion for optional checklist rows. */
  optionalStepsState?: OnboardingOptionalStepsState | null
}

type StepConfig = {
  id: string
  done: boolean
  label: string
  description: string
  actionLabel: string
  actionView?: ActiveView
  linkHref?: string
  optional?: boolean
}

type PrimaryAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "navigate"; label: string; view: ActiveView }

type OnboardingConversation = {
  eyebrow: string
  title: string
  body: string
  primaryAction: PrimaryAction
}

function getStoredDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true"
  } catch {
    return false
  }
}

function setStoredDismissed(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true")
    } else {
      localStorage.removeItem(ONBOARDING_DISMISSED_KEY)
    }
  } catch {
    // ignore
  }
}

/** Clear the dismissed flag so the setup checklist shows again on the Dashboard. */
export function clearOnboardingDismissed(): void {
  setStoredDismissed(false)
}

export function getWelcomeSeen(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === "true"
  } catch {
    return false
  }
}

export function setWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "true")
  } catch {
    // ignore
  }
}

/** Clear the welcome-seen flag so the welcome modal shows again on the next Dashboard visit. */
export function clearWelcomeSeen(): void {
  try {
    localStorage.removeItem(WELCOME_SEEN_KEY)
  } catch {
    // ignore
  }
}

function PrimaryActionButton({
  action,
  onNavigate,
}: {
  action: PrimaryAction
  onNavigate: (view: ActiveView) => void
}) {
  if (action.kind === "link") {
    return (
      <Button size="sm" className="gap-1.5" asChild>
        <Link href={action.href}>
          {action.label}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    )
  }

  return (
    <Button size="sm" className="gap-1.5" onClick={() => onNavigate(action.view)}>
      {action.label}
      <ChevronRight className="h-3.5 w-3.5" />
    </Button>
  )
}

function StepRow({
  step,
  onNavigate,
}: {
  step: StepConfig
  onNavigate: (view: ActiveView) => void
}) {
  const actionButton =
    !step.done && (step.linkHref ? (
      <Button size="sm" variant="outline" className="shrink-0 gap-1" asChild>
        <Link href={step.linkHref}>
          {step.actionLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    ) : step.actionView ? (
      <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => onNavigate(step.actionView!)}>
        {step.actionLabel === "Import CSV/PDF" ? <Upload className="h-3.5 w-3.5" /> : null}
        {step.actionLabel === "Open Settings" ? <Linkedin className="h-3.5 w-3.5" /> : null}
        {step.actionLabel === "Open Email" ? <Mail className="h-3.5 w-3.5" /> : null}
        {step.actionLabel}
      </Button>
    ) : null)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-background/50 p-3">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          step.done ? "bg-primary text-primary-foreground" : step.optional ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {step.done ? <Check className="h-3.5 w-3.5" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {step.label}
          {step.optional ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
      </div>
      {actionButton}
    </div>
  )
}

export function OnboardingCard({
  hasSupabaseConfigured = false,
  hasAuth,
  hasData,
  onNavigate,
  forceShow = false,
  optionalStepsState = null,
}: OnboardingCardProps) {
  const [dismissed, setDismissed] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDismissed(getStoredDismissed())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!getWelcomeSeen()) {
      setShowWelcome(true)
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setStoredDismissed(true)
    setDismissed(true)
  }, [])

  const handleWelcomeClose = useCallback(() => {
    setWelcomeSeen()
    setShowWelcome(false)
  }, [])

  const coreSteps: StepConfig[] = [
    {
      id: "supabase",
      done: hasSupabaseConfigured,
      label: "Connect Supabase",
      description: hasSupabaseConfigured
        ? "Supabase is connected — the app can read and write your data."
        : "Enter your Supabase URL and anon key in Settings to unlock the full workspace.",
      actionLabel: "Open Settings",
      actionView: "settings" as ActiveView,
    },
    {
      id: "sign-in",
      done: hasAuth,
      label: "Sign in",
      description: hasAuth
        ? "You are signed in, so protected panels like CRM, Email, and Agents can load account data."
        : "Sign in with Supabase so CRM, Email, Network Insights, and Agents can use your account.",
      actionLabel: "Go to login",
      linkHref: "/login?redirect=/",
    },
    {
      id: "data",
      done: hasData,
      label: "Import your first profiles",
      description: hasData
        ? "The workspace already has profiles to analyze."
        : "Import a LinkedIn CSV or profile PDF in AI Assistant, or use live Supabase records if you already have them.",
      actionLabel: "Import CSV/PDF",
      actionView: "chat",
    },
  ]

  const optionalSteps = useMemo((): StepConfig[] => {
    const o = optionalStepsState
    const linkedinDone = Boolean(o?.linkedinConnected)
    const emailDone = Boolean(o?.emailConnected)
    const marketplaceDone = Boolean(o?.marketplaceEngaged)
    const governanceDone = Boolean(o?.governanceHasTribes)
    const authenticityDone = Boolean(o?.authenticityEngaged)
    const handcuffDone = Boolean(o?.handcuffAuditStarted)
    const autoResearchDone = Boolean(o?.autoResearchLaunched)

    return [
      {
        id: "linkedin",
        done: linkedinDone,
        label: "Connect LinkedIn",
        description: linkedinDone
          ? "LinkedIn is connected — identity and share features can use your account."
          : "Optional, but useful if you want identity sync and Share on LinkedIn from Settings.",
        actionLabel: "Open Settings",
        actionView: "settings" as ActiveView,
        optional: true,
      },
      {
        id: "email",
        done: emailDone,
        label: "Connect email and explore",
        description: emailDone
          ? "At least one mailbox is connected — Globe and agents can use your mail data."
          : "Optional. Add Gmail, Outlook, or IMAP, then explore Globe, Network, and Agents once your data is in.",
        actionLabel: "Open Email",
        actionView: "email" as ActiveView,
        optional: true,
      },
      {
        id: "marketplace",
        done: marketplaceDone,
        label: "Explore the Marketplace",
        description: marketplaceDone
          ? "You have marketplace activity (listing or order) on record."
          : "Trade non-scalable human experiences — mentorship, handcrafted art, philosophy sessions, and more.",
        actionLabel: "Open Marketplace",
        actionView: "marketplace" as ActiveView,
        optional: true,
      },
      {
        id: "governance",
        done: governanceDone,
        label: "Try Tribal Governance",
        description: governanceDone
          ? "You have tribe data in Supabase — open Tribes to govern and delegate."
          : "Propose decisions, delegate votes, and run consensus within your tribes.",
        actionLabel: "Open Tribes",
        actionView: "tribes" as ActiveView,
        optional: true,
      },
      {
        id: "authenticity",
        done: authenticityDone,
        label: "Set up content authenticity",
        description: authenticityDone
          ? "SENTINEL has saved signals or incidents for your account — open the panel to review."
          : "Attest your content with provenance proofs and biological signals via the Authenticity Oracle.",
        actionLabel: "Open SENTINEL",
        actionView: "sentinel" as ActiveView,
        optional: true,
      },
      {
        id: "handcuff-audit",
        done: handcuffDone,
        label: "Run a Handcuff Audit",
        description: handcuffDone
          ? "You have a decoupling / handcuff audit saved — refine it anytime in Settings."
          : "Analyze your golden handcuffs (salary, vesting, benefits) and calculate your break-even to sovereignty.",
        actionLabel: "Open Settings",
        actionView: "settings" as ActiveView,
        optional: true,
      },
      {
        id: "auto-research",
        done: autoResearchDone,
        label: "Launch your first Auto Research",
        description: autoResearchDone
          ? "You have launched an auto research campaign — check Tribes for progress."
          : "Coordinate overnight research across the tribal network to accelerate breakthroughs.",
        actionLabel: "Open Tribes",
        actionView: "tribes" as ActiveView,
        optional: true,
      },
    ]
  }, [optionalStepsState])

  const complete = coreSteps.every((step) => step.done)
  const shouldShow = forceShow || (!dismissed && !complete)
  // Use 0 on server to avoid hydration mismatch (props like hasSupabaseConfigured
  // can differ between SSR and client when env vars are resolved client-side).
  const coreStepsComplete = mounted ? coreSteps.filter((step) => step.done).length : 0
  const coreProgress = mounted ? Math.round((coreStepsComplete / coreSteps.length) * 100) : 0

  const conversation: OnboardingConversation = !hasSupabaseConfigured
    ? {
        eyebrow: "Start here",
        title: "Let's get Supabase connected first.",
        body:
          "Connect Supabase either by setting .env.local (local dev) or by entering your Supabase URL + anon key in Settings (hosted build). Once connected, sign in, import profiles, and start asking the workspace questions.",
        primaryAction: {
          kind: "navigate",
          label: "Open Settings",
          view: "settings",
        },
      }
    : !hasAuth
    ? {
        eyebrow: "Next step",
        title: "Supabase is configured. Now sign in.",
        body:
          "That one step unlocks the CRM, Email, Network Insights, and agent controls for your account instead of leaving the app in open mode.",
        primaryAction: {
          kind: "link",
          label: "Go to login",
          href: "/login?redirect=/",
        },
      }
    : !hasData
    ? {
        eyebrow: "Almost there",
        title: "Now give the workspace something to analyze.",
        body:
          "Open AI Assistant and import a LinkedIn CSV or profile PDF. As soon as that lands, the rest of the panels can start working with real profile data.",
        primaryAction: {
          kind: "navigate",
          label: "Import CSV/PDF",
          view: "chat",
        },
      }
    : {
        eyebrow: "Core setup complete",
        title: "You are ready to use LinkedOut.",
        body:
          "The required setup is done. Connect LinkedIn and email for richer integrations, or explore the Sovereign Economy — trade experiences in the Marketplace, govern your tribes, and verify content authenticity.",
        primaryAction: {
          kind: "navigate",
          label: "Open Profiles CRM",
          view: "profiles",
        },
      }

  const [schemaHint, setSchemaHint] = useState<string | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)

  const runSchemaCheck = useCallback(async () => {
    setSchemaLoading(true)
    setSchemaHint(null)
    try {
      const token = resolveSupabaseAccessToken()
      const res = await fetch("/api/setup/schema-status", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...getUserKeyHeaders(),
        },
        cache: "no-store",
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        summary?: { present: number; missing: number; total: number }
        recommendedAction?: string
        message?: string
      }
      if (j.ok && j.summary) {
        const status = j.summary.missing === 0 ? "Schema OK" : "Schema incomplete"
        setSchemaHint(
          `${status}: ${j.summary.present}/${j.summary.total} tables present${j.recommendedAction ? ` — ${j.recommendedAction}` : ""}`,
        )
      } else {
        setSchemaHint(j.message ?? j.recommendedAction ?? "Schema check failed.")
      }
    } catch {
      setSchemaHint("Schema check failed.")
    } finally {
      setSchemaLoading(false)
    }
  }, [])

  // Suppress SSR render entirely to avoid hydration mismatch — props like
  // hasSupabaseConfigured can differ between server and client when env vars
  // or localStorage are only available client-side.
  if (!mounted) return null

  if (!shouldShow && !showWelcome) {
    return null
  }

  return (
    <>
      {showWelcome ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border-2 border-primary/20 shadow-xl">
            <CardHeader className="pb-2 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Welcome to LinkedOut</CardTitle>
              <CardDescription>
                Your AI-powered Tribe Intelligence Platform. We&apos;ll discover your unique strengths, build your first workflow, and connect you to your professional network.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                  Connect Supabase (Settings or .env.local) to unlock CRM, Email, Network, and Agents
                </li>
                <li className="flex items-center gap-2">
                  <Upload className="h-4 w-4 shrink-0 text-primary" />
                  Import a LinkedIn CSV or profile PDF, or use live Supabase data
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                  Ask the AI to help you identify your strengths and build your first workflow
                </li>
                <li className="flex items-center gap-2">
                  <Rocket className="h-4 w-4 shrink-0 text-primary" />
                  Explore AI-powered tools for team building, analytics, security, and more
                </li>
                <li className="flex items-center gap-2">
                  <Heart className="h-4 w-4 shrink-0 text-primary" />
                  Trade human experiences in the marketplace, govern your teams with voting, and verify content authenticity
                </li>
              </ul>
              <p className="text-[10px] text-muted-foreground text-center">
                <a href="/terms" className="hover:text-foreground underline">Terms</a>
                {" · "}
                <a href="/privacy" className="hover:text-foreground underline">Privacy</a>
                {" · "}
                <a href="/sponsors" className="hover:text-foreground underline">Sponsors</a>
                {" · "}
                Powered by Hill &amp; Valley Gigastream
              </p>
              <Button className="w-full gap-2" onClick={handleWelcomeClose}>
                Get Started
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {shouldShow ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Rocket className="h-4 w-4 text-primary" />
                    Onboarding
                  </CardTitle>
                  <span className="text-xs font-normal text-muted-foreground">
                    {coreStepsComplete} of {coreSteps.length} core steps
                  </span>
                </div>
                <CardDescription className="mt-1">
                  Finish the core setup first. The optional extras can come later.
                </CardDescription>
                <Link href="/setup" className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  View full setup guide
                  <ChevronRight className="h-3 w-3" />
                </Link>
                <Link href="/setup/wizard" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Open setup wizard
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <Button variant="ghost" size="sm" onClick={handleDismiss} className="shrink-0 text-muted-foreground">
                Dismiss
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-background/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary/80">
                    {conversation.eyebrow}
                  </p>
                  <p className="text-sm font-semibold text-foreground">{conversation.title}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{conversation.body}</p>
                </div>
                <div className="min-w-[84px] text-right">
                  <p className="text-2xl font-semibold text-foreground">{coreProgress}%</p>
                  <p className="text-[11px] text-muted-foreground">core setup</p>
                </div>
              </div>
              <Progress value={coreProgress} className="mt-3 h-2" />
              <div className="mt-3 flex flex-wrap gap-2">
                <PrimaryActionButton action={conversation.primaryAction} onNavigate={onNavigate} />
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onNavigate("chat")}>
                  <MessageSquare className="h-3.5 w-3.5" />
                  Ask AI to guide me
                </Button>
                {hasSupabaseConfigured && hasAuth && !hasData ? (
                  <Button size="sm" variant="outline" onClick={() => void runSchemaCheck()} disabled={schemaLoading}>
                    {schemaLoading ? "Checking…" : "Check schema"}
                  </Button>
                ) : null}
              </div>
              {schemaHint ? <p className="mt-2 text-[11px] text-muted-foreground">{schemaHint}</p> : null}
            </div>

            <div className="space-y-3">
              {coreSteps.map((step) => (
                <StepRow key={step.id} step={step} onNavigate={onNavigate} />
              ))}
            </div>

            <div className="space-y-3 rounded-xl border border-border/80 bg-background/50 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Optional next steps</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  These are not required to finish onboarding, but they make the workspace more useful once the core setup is done.
                </p>
              </div>
              {optionalSteps.map((step) => (
                <StepRow key={step.id} step={step} onNavigate={onNavigate} />
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2">
              <p className="text-xs text-muted-foreground">
                {complete ? "Core setup is complete. Optional connections can wait." : "Dismiss this card any time. You can bring it back from Settings."}
              </p>
              {complete ? (
                <Button size="sm" variant="secondary" onClick={handleDismiss}>
                  Hide checklist
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
