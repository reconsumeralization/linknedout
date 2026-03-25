"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  FolderKanban,
  Linkedin,
  Mail,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Upload,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

const MINIMAL_ENV = `# Copy to .env.local and fill in your values
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
NEXT_PUBLIC_APP_URL=http://localhost:3000`

const steps = [
  {
    id: "supabase-config",
    title: "Create a Supabase project and grab your keys",
    description:
      "Go to supabase.com, create a new project, then copy the URL and anon key from Settings > API. Paste them into .env.local as NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. Also set SUPABASE_SERVICE_ROLE_KEY for server-side features.",
    href: null,
    icon: ShieldCheck,
  },
  {
    id: "migrations",
    title: "Apply database migrations",
    description:
      "Run pnpm supabase:db:start to apply migrations automatically, or apply them manually via the Supabase SQL editor. This creates the tables the app needs (profiles, tribes, projects, etc.).",
    href: null,
    icon: FolderKanban,
  },
  {
    id: "sign-in",
    title: "Sign in once the env is ready",
    description: "This unlocks CRM, Email, Network Insights, SENTINEL, and Agent Control for your account.",
    href: "/login",
    label: "Go to login",
    icon: ShieldCheck,
  },
  {
    id: "auth",
    title: "Check the auth center",
    description: "Use it to confirm your session and connect email, LinkedIn, or AI providers.",
    href: "/auth",
    label: "Open auth center",
    icon: ShieldCheck,
  },
  {
    id: "data",
    title: "Import your first profiles",
    description: "Open the app and import a LinkedIn CSV or profile PDF in AI Assistant, or use live Supabase profiles if you already have them.",
    href: "/",
    label: "Open app",
    icon: Upload,
  },
  {
    id: "linkedin",
    title: "Connect LinkedIn when you want richer identity features",
    description:
      "Create an app at linkedin.com/developers, add the client ID and secret to .env.local, then connect LinkedIn from Settings.",
    href: "/auth/linkedin",
    label: "Connect LinkedIn",
    icon: Linkedin,
  },
  {
    id: "email",
    title: "Connect email if you need outreach workflows",
    description: "Add Gmail, Outlook, or IMAP credentials in .env.local, then finish the connection in the app.",
    href: "/auth/email",
    label: "Email setup",
    icon: Mail,
  },
]

const conversationalPrompts = [
  "Walk me through Supabase Cloud setup for this app",
  "I already have Supabase keys. What should I do next?",
  "Help me import my first LinkedIn CSV or profile PDF",
]

export default function SetupPage() {
  const [copied, setCopied] = useState(false)

  const copyEnv = () => {
    navigator.clipboard.writeText(MINIMAL_ENV).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header className="rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Setup and onboarding</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Let&apos;s get LinkedOut running without guesswork. The shortest path is simple: add Supabase keys, sign in, then import a LinkedIn CSV or profile PDF so the workspace has something real to analyze.
              </p>
            </div>
          </div>
        </header>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-4 w-4 text-primary" />
              Fastest path
            </CardTitle>
            <CardDescription>
              Most setups only need these four moves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3">
              <li className="rounded-xl border border-border/80 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">1. Create a Supabase project and copy keys to .env.local</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Create a project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">supabase.com</a>. Copy <code className="rounded bg-muted px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="rounded bg-muted px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> from Settings &gt; API into .env.local.
                </p>
              </li>
              <li className="rounded-xl border border-border/80 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">2. Apply migrations and run the app</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Run <code className="rounded bg-muted px-1.5 py-0.5 text-xs">pnpm supabase:db:start</code> to apply migrations (or run them manually via the SQL editor). Then start the app with <code className="rounded bg-muted px-1.5 py-0.5 text-xs">pnpm dev</code>.
                </p>
              </li>
              <li className="rounded-xl border border-border/80 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">3. Sign up / sign in, then import profiles</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Go to AI Assistant and import a LinkedIn CSV or text-based LinkedIn profile PDF. That immediately feeds the existing analysis panels.
                </p>
              </li>
              <li className="rounded-xl border border-border/80 bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">4. Add optional connections when you need them</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  LinkedIn auth gives you identity and sharing. Email setup unlocks outreach workflows. Docker is only for the full local stack.
                </p>
              </li>
            </ol>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="mb-2 text-xs text-muted-foreground">Minimal .env.local snippet</p>
              <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground/90">
                {MINIMAL_ENV}
              </pre>
              <Button variant="outline" size="sm" className="mt-3 h-8 gap-1.5 text-xs" onClick={copyEnv}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy snippet"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              Want a conversational walkthrough?
            </CardTitle>
            <CardDescription>
              The AI Assistant already has the app-specific setup context plus official Supabase docs references.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              Open the app, go to Dashboard or Settings, open AI Assistant, and use one of these prompts:
            </p>
            <div className="space-y-2">
              {conversationalPrompts.map((prompt) => (
                <div key={prompt} className="rounded-lg border border-border/80 bg-background/70 px-3 py-2 text-sm text-foreground">
                  &quot;{prompt}&quot;
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              If you prefer the long-form written version, open <code className="rounded bg-muted px-1.5 py-0.5 text-xs">docs/setup-and-onboarding.md</code> in this repo.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              Official Supabase docs
            </CardTitle>
            <CardDescription>
              Use these when the setup guide or AI points you to primary docs.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><a href="https://database.new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">database.new</a> - Create a new project</li>
              <li><a href="https://supabase.com/docs/guides/api/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">API keys</a> - Project URL, anon key, service role</li>
              <li><a href="https://supabase.com/docs/guides/auth" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Auth</a> - Email/password and providers</li>
              <li><a href="https://supabase.com/docs/guides/getting-started/quickstarts/nextjs" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Next.js quickstart</a> - Connect a Next.js app</li>
              <li><a href="https://supabase.com/docs/guides/cli/local-development" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Local development (CLI)</a> - Run Supabase locally</li>
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Detailed walkthrough</h2>
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <Card key={step.id} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {index + 1}
                        </span>
                        <Icon className={`h-4 w-4 ${step.id === "linkedin" ? "text-[#0077b5]" : step.id === "email" ? "text-muted-foreground" : "text-primary"}`} />
                        {step.title}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">
                        {step.description}
                      </CardDescription>
                    </div>
                    {step.href && step.label ? (
                      <Button size="sm" variant="outline" className="shrink-0 gap-1" asChild>
                        <Link href={step.href}>
                          {step.label}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
              </Card>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2 pt-4">
          <Button asChild className="gap-2">
            <Link href="/">
              Open LinkedOut
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/auth">Auth center</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
