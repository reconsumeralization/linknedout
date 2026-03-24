"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

type AiProviderStatus = {
  id: string
  label: string
  configured: boolean
  envKeys: string[]
  notes: string
}

type AiStatusResponse = {
  ok?: boolean
  providers?: AiProviderStatus[]
}

type ChatHealthResponse = {
  status?: "healthy" | "degraded"
  config?: {
    openaiApiKeyConfigured?: boolean
  }
}

export default function AiAuthPage() {
  const [providers, setProviders] = useState<AiProviderStatus[]>([])
  const [chatHealth, setChatHealth] = useState<ChatHealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    setMessage("")

    const [providersRes, chatHealthRes] = await Promise.all([
      fetch("/api/auth/ai/status", { cache: "no-store" }),
      fetch("/api/chat?action=health", { cache: "no-store" }),
    ])

    const providersPayload = (await providersRes.json().catch(() => ({}))) as AiStatusResponse
    const chatPayload = (await chatHealthRes.json().catch(() => ({}))) as ChatHealthResponse

    setProviders(providersPayload.providers || [])
    setChatHealth(chatPayload)

    if (!providersRes.ok) {
      setMessage("Failed to load AI provider status.")
    } else if (providersPayload.providers?.every((provider) => !provider.configured)) {
      setMessage("No AI provider credentials are configured yet. Add env keys in .env.local and restart.")
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              AI Provider Authentication
            </CardTitle>
            <CardDescription>
              Verify server-side AI provider credentials used by chat, realtime, and agent tooling.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={chatHealth?.status === "healthy" ? "secondary" : "outline"}>
                Chat API health: {chatHealth?.status || "unknown"}
              </Badge>
              <Badge variant={chatHealth?.config?.openaiApiKeyConfigured ? "secondary" : "outline"}>
                OpenAI key: {chatHealth?.config?.openaiApiKeyConfigured ? "configured" : "missing"}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="outline" asChild>
                <Link href="/auth" className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  Back to auth
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void refreshStatus()} disabled={loading} className="gap-1.5">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/login?redirect=/auth/ai">Sign in</Link>
              </Button>
            </div>
            {message ? (
              <p className="text-xs text-muted-foreground border border-border rounded-md px-2.5 py-2">{message}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((provider) => (
            <Card key={provider.id} className="border-border/80">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {provider.configured ? (
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-chart-4" />
                  )}
                  {provider.label}
                </CardTitle>
                <CardDescription>{provider.notes}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge variant={provider.configured ? "secondary" : "outline"}>
                  {provider.configured ? "configured" : "not configured"}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Required env keys: <code>{provider.envKeys.join(", ")}</code>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

