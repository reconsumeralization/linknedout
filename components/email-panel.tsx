"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { MAX_ATTACHMENTS_PER_EMAIL } from "@/lib/email/email-intergrations"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { cn } from "@/lib/shared/utils"
import {
  ChevronDown,
  FileText,
  Inbox,
  LogIn,
  Mail,
  Mailbox,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Provider = "gmail" | "outlook" | "imap" | "other"
type AuthKind = "oauth" | "password" | "appPassword" | "accessToken"

interface IntegrationView {
  id: string
  email: string
  displayName?: string
  provider: Provider
  status: "connected" | "disconnected" | "syncing" | "error" | "pending"
  syncEnabled: boolean
  syncError?: string
  syncErrorCount: number
  lastSyncedAt?: string
  nextSyncAt?: string
}

interface MessageAddress {
  email: string
  name?: string
}

interface MessageView {
  id: string
  integrationId: string
  subject: string
  snippet?: string
  from: MessageAddress
  to: MessageAddress[]
  cc?: MessageAddress[]
  bcc?: MessageAddress[]
  body: string
  receivedAt: string
  sentAt?: string
  isDraft: boolean
  isRead: boolean
  mailboxes: string[]
  attachments?: MessageAttachmentView[]
}

interface MessageAttachmentView {
  id?: string
  filename: string
  mimeType: string
  size: number
  contentId?: string
  isInline: boolean
  contentDisposition?: "inline" | "attachment"
  contentBase64?: string
}

type ApiEnvelope<T> = {
  ok?: boolean
  error?: string
  details?: unknown
} & T

const MAX_COMPOSE_ATTACHMENT_SIZE_BYTES = 2 * 1024 * 1024
const MAX_COMPOSE_ATTACHMENT_TOTAL_BYTES = 5 * 1024 * 1024

function parseRecipients(value: string): MessageAddress[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((item) => ({ email: item }))
}

function toRecipientInput(list: MessageAddress[] | undefined): string {
  return (list || []).map((item) => item.email).join(", ")
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  return date.toLocaleString()
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function statusBadgeTone(status: IntegrationView["status"]): string {
  if (status === "connected") return "bg-accent/15 text-accent"
  if (status === "syncing") return "bg-primary/15 text-primary"
  if (status === "error") return "bg-destructive/15 text-destructive"
  if (status === "disconnected") return "bg-muted text-muted-foreground"
  return "bg-muted text-muted-foreground"
}

const providerMeta: Record<Provider, { label: string; icon: React.ReactNode; color: string; short: string }> = {
  gmail: { label: "Gmail", icon: <Mail className="w-4 h-4" />, color: "bg-red-500/15 text-red-600 dark:text-red-400", short: "Gmail" },
  outlook: { label: "Outlook", icon: <Mail className="w-4 h-4" />, color: "bg-blue-500/15 text-blue-600 dark:text-blue-400", short: "Outlook" },
  imap: { label: "IMAP", icon: <Mailbox className="w-4 h-4" />, color: "bg-slate-500/15 text-slate-600 dark:text-slate-400", short: "IMAP" },
  other: { label: "Other", icon: <Inbox className="w-4 h-4" />, color: "bg-violet-500/15 text-violet-600 dark:text-violet-400", short: "Other" },
}

function formatRelativeDate(value: string): "today" | "yesterday" | "older" {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "older"
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const t = d.getTime()
  if (t >= today.getTime()) return "today"
  if (t >= yesterday.getTime()) return "yesterday"
  return "older"
}

export function EmailPanel() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string>("")
  const [isBusy, setIsBusy] = useState(false)
  const [integrations, setIntegrations] = useState<IntegrationView[]>([])
  const [messages, setMessages] = useState<MessageView[]>([])
  const [drafts, setDrafts] = useState<MessageView[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchQueryDebounced, setSearchQueryDebounced] = useState("")
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>("")

  const [newEmail, setNewEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [provider, setProvider] = useState<Provider>("gmail")
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [authKind, setAuthKind] = useState<AuthKind>("oauth")
  const [accessTokenInput, setAccessTokenInput] = useState("")
  const [refreshTokenInput, setRefreshTokenInput] = useState("")
  const [usernameInput, setUsernameInput] = useState("")
  const [passwordInput, setPasswordInput] = useState("")
  const [credentialTokenInput, setCredentialTokenInput] = useState("")

  const setProviderWithDefaultAuth = useCallback((next: Provider) => {
    setProvider(next)
    if (next === "gmail" || next === "outlook") setAuthKind("oauth")
    else if (next === "imap") setAuthKind("appPassword")
    else setAuthKind("accessToken")
  }, [])

  const [messagesRefreshing, setMessagesRefreshing] = useState(false)
  const [draftId, setDraftId] = useState<string>("")
  const [composeIntegrationId, setComposeIntegrationId] = useState<string>("")
  const [toInput, setToInput] = useState("")
  const [ccInput, setCcInput] = useState("")
  const [bccInput, setBccInput] = useState("")
  const [subjectInput, setSubjectInput] = useState("")
  const [bodyInput, setBodyInput] = useState("")
  const [attachments, setAttachments] = useState<MessageAttachmentView[]>([])
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  const authReady = Boolean(accessToken)

  const apiRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> => {
      const headers = new Headers(init?.headers)
      headers.set("Content-Type", "application/json")
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`)
      }

      const response = await fetch(path, {
        ...init,
        headers,
      })

      const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>
      if (!response.ok) {
        return {
          ...(payload || ({} as ApiEnvelope<T>)),
          ok: false,
          error: payload?.error || `Request failed (${response.status})`,
        }
      }

      return payload
    },
    [accessToken],
  )

  const loadIntegrations = useCallback(async () => {
    if (!authReady) {
      setIntegrations([])
      return
    }

    const payload = await apiRequest<{ integrations: IntegrationView[] }>("/api/email/integrations")
    if (!payload.ok) {
      setErrorText(payload.error || "Could not load integrations.")
      return
    }

    const rows = payload.integrations || []
    setIntegrations(rows)
    if (!selectedIntegrationId && rows.length > 0) {
      setSelectedIntegrationId(rows[0].id)
    } else if (selectedIntegrationId && !rows.some((item) => item.id === selectedIntegrationId)) {
      setSelectedIntegrationId(rows[0]?.id || "")
    }
  }, [apiRequest, authReady, selectedIntegrationId])

  const loadMessages = useCallback(async () => {
    if (!authReady) {
      setMessages([])
      return
    }

    const params = new URLSearchParams()
    if (selectedIntegrationId) {
      params.set("integrationId", selectedIntegrationId)
    }
    if (searchQueryDebounced) {
      params.set("q", searchQueryDebounced)
    }
    params.set("limit", "80")

    const payload = await apiRequest<{ messages: MessageView[] }>(
      `/api/email/messages?${params.toString()}`,
    )
    if (!payload.ok) {
      setErrorText(payload.error || "Could not load messages.")
      return
    }
    setMessages(payload.messages || [])
  }, [apiRequest, authReady, searchQueryDebounced, selectedIntegrationId])

  const loadDrafts = useCallback(async () => {
    if (!authReady) {
      setDrafts([])
      return
    }

    const params = new URLSearchParams()
    if (selectedIntegrationId) {
      params.set("integrationId", selectedIntegrationId)
    }

    const payload = await apiRequest<{ drafts: MessageView[] }>(
      `/api/email/drafts?${params.toString()}`,
    )
    if (!payload.ok) {
      setErrorText(payload.error || "Could not load drafts.")
      return
    }
    setDrafts(payload.drafts || [])
  }, [apiRequest, authReady, selectedIntegrationId])

  useEffect(() => {
    setAccessToken(resolveSupabaseAccessToken())
    const onStorage = () => {
      setAccessToken(resolveSupabaseAccessToken())
    }

    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  // Handle OAuth callback: read tokens from URL hash and auto-populate fields
  useEffect(() => {
    if (typeof window === "undefined") return
    const hash = window.location.hash
    if (!hash.startsWith("#oauth=")) return

    try {
      const encoded = hash.slice("#oauth=".length)
      const decoded = decodeURIComponent(encoded)
      const params = new URLSearchParams(decoded)
      const at = params.get("accessToken")
      const rt = params.get("refreshToken")
      if (at) {
        setAccessTokenInput(at)
        if (rt) setRefreshTokenInput(rt)
        setAuthKind("oauth")
        // Read provider from URL search params
        const searchParams = new URLSearchParams(window.location.search)
        const oauthProvider = searchParams.get("oauthProvider") as Provider | null
        const oauthEmail = searchParams.get("oauthEmail") ?? ""
        if (oauthProvider) setProvider(oauthProvider)
        if (oauthEmail) setNewEmail(oauthEmail)
        // Clean up hash
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
      }
    } catch {
      // ignore malformed hash
    }
  }, [])

  useEffect(() => {
    if (!authReady) {
      return
    }
    void loadIntegrations()
  }, [authReady, loadIntegrations])

  // Debounce search query for API calls (400ms)
  useEffect(() => {
    const t = setTimeout(() => setSearchQueryDebounced(searchQuery.trim()), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    if (!authReady) {
      return
    }
    void loadMessages()
    void loadDrafts()
  }, [authReady, loadDrafts, loadMessages])

  useEffect(() => {
    if (composeIntegrationId) {
      return
    }
    if (selectedIntegrationId) {
      setComposeIntegrationId(selectedIntegrationId)
    } else if (integrations[0]?.id) {
      setComposeIntegrationId(integrations[0].id)
    }
  }, [composeIntegrationId, integrations, selectedIntegrationId])

  const clearCompose = useCallback(() => {
    setDraftId("")
    setToInput("")
    setCcInput("")
    setBccInput("")
    setSubjectInput("")
    setBodyInput("")
    setAttachments([])
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = ""
    }
  }, [])

  const handleAttachmentPick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      if (files.length === 0) {
        return
      }

      const existingTotal = attachments.reduce((sum, item) => sum + item.size, 0)
      if (attachments.length + files.length > MAX_ATTACHMENTS_PER_EMAIL) {
        setErrorText(`You can attach up to ${MAX_ATTACHMENTS_PER_EMAIL} files per message.`)
        event.target.value = ""
        return
      }

      const oversized = files.find((file) => file.size > MAX_COMPOSE_ATTACHMENT_SIZE_BYTES)
      if (oversized) {
        setErrorText(
          `${oversized.name} is too large. Individual attachments are limited to ${formatBytes(MAX_COMPOSE_ATTACHMENT_SIZE_BYTES)} in the current compose flow.`,
        )
        event.target.value = ""
        return
      }

      const totalSize = existingTotal + files.reduce((sum, file) => sum + file.size, 0)
      if (totalSize > MAX_COMPOSE_ATTACHMENT_TOTAL_BYTES) {
        setErrorText(
          `Attachments exceed the ${formatBytes(MAX_COMPOSE_ATTACHMENT_TOTAL_BYTES)} compose limit.`,
        )
        event.target.value = ""
        return
      }

      setIsPreparingAttachments(true)
      setErrorText("")
      try {
        const nextAttachments = await Promise.all(
          files.map(async (file) => ({
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            isInline: false,
            contentDisposition: "attachment" as const,
            contentBase64: await fileToBase64(file),
          })),
        )

        setAttachments((current) => [...current, ...nextAttachments])
      } catch {
        setErrorText("Could not read one or more attachments.")
      } finally {
        setIsPreparingAttachments(false)
        event.target.value = ""
      }
    },
    [attachments, setErrorText],
  )

  const handleRemoveAttachment = useCallback((filename: string) => {
    setAttachments((current) => current.filter((item) => item.filename !== filename))
  }, [])

  const buildAuthPayload = useCallback(() => {
    if (authKind === "oauth") {
      if (!accessTokenInput.trim()) {
        return null
      }
      return {
        kind: "oauth",
        tokens: {
          accessToken: accessTokenInput.trim(),
          refreshToken: refreshTokenInput.trim() || undefined,
        },
      }
    }

    if (authKind === "password") {
      if (!usernameInput.trim() || !passwordInput.trim()) {
        return null
      }
      return {
        kind: "password",
        username: usernameInput.trim(),
        password: passwordInput.trim(),
      }
    }

    if (!credentialTokenInput.trim()) {
      return null
    }

    return {
      kind: authKind,
      token: credentialTokenInput.trim(),
    }
  }, [
    accessTokenInput,
    authKind,
    credentialTokenInput,
    passwordInput,
    refreshTokenInput,
    usernameInput,
  ])

  const handleAddIntegration = useCallback(async () => {
    if (!authReady) {
      setErrorText("Sign in with Supabase first.")
      return
    }
    if (!newEmail.trim()) {
      setErrorText("Enter an email address.")
      return
    }

    const authPayload = buildAuthPayload()
    if (!authPayload) {
      setErrorText("Provide credentials for the selected auth mode.")
      return
    }

    setIsBusy(true)
    setErrorText("")

    const payload = await apiRequest<{ integration: IntegrationView }>("/api/email/integrations", {
      method: "POST",
      body: JSON.stringify({
        email: newEmail.trim(),
        displayName: displayName.trim() || undefined,
        provider,
        syncEnabled,
        auth: authPayload,
        config: {
          syncIntervalMs: 300_000,
        },
      }),
    })

    setIsBusy(false)
    if (!payload.ok || !payload.integration) {
      setErrorText(payload.error || "Could not create integration.")
      return
    }

    setNewEmail("")
    setDisplayName("")
    setAccessTokenInput("")
    setRefreshTokenInput("")
    setUsernameInput("")
    setPasswordInput("")
    setCredentialTokenInput("")

    await loadIntegrations()
    setSelectedIntegrationId(payload.integration.id)
    setComposeIntegrationId(payload.integration.id)
  }, [
    apiRequest,
    authReady,
    buildAuthPayload,
    displayName,
    loadIntegrations,
    newEmail,
    provider,
    syncEnabled,
  ])

  const handleDeleteIntegration = useCallback(
    async (integrationId: string) => {
      if (!authReady) return
      setIsBusy(true)
      setErrorText("")

      const payload = await apiRequest<{}>(`/api/email/integrations/${integrationId}`, {
        method: "DELETE",
      })

      setIsBusy(false)
      if (!payload.ok) {
        setErrorText(payload.error || "Could not delete integration.")
        return
      }

      await loadIntegrations()
      await loadMessages()
      await loadDrafts()
    },
    [apiRequest, authReady, loadDrafts, loadIntegrations, loadMessages],
  )

  const handleToggleSync = useCallback(
    async (integration: IntegrationView) => {
      if (!authReady) return
      const payload = await apiRequest<{ integration: IntegrationView }>(
        `/api/email/integrations/${integration.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            syncEnabled: !integration.syncEnabled,
          }),
        },
      )

      if (!payload.ok) {
        setErrorText(payload.error || "Could not update sync settings.")
        return
      }

      await loadIntegrations()
    },
    [apiRequest, authReady, loadIntegrations],
  )

  const handleSyncNow = useCallback(
    async (integrationId: string) => {
      if (!authReady) return
      setIsBusy(true)
      setErrorText("")

      const payload = await apiRequest<{ processedCount: number; simulated: boolean }>(
        `/api/email/integrations/${integrationId}/sync`,
        { method: "POST" },
      )

      setIsBusy(false)
      if (!payload.ok) {
        setErrorText(payload.error || "Could not run sync.")
        return
      }

      await loadIntegrations()
      await loadMessages()
      await loadDrafts()
    },
    [apiRequest, authReady, loadDrafts, loadIntegrations, loadMessages],
  )

  const buildComposePayload = useCallback((options?: { requireRecipient?: boolean }) => {
    if (!composeIntegrationId) {
      return null
    }

    const to = parseRecipients(toInput)
    if (options?.requireRecipient && to.length === 0) {
      return null
    }

    return {
      draftId: draftId || undefined,
      integrationId: composeIntegrationId,
      to,
      cc: parseRecipients(ccInput),
      bcc: parseRecipients(bccInput),
      subject: subjectInput.trim() || "No subject",
      body: bodyInput,
      attachments,
    }
  }, [attachments, bccInput, bodyInput, ccInput, composeIntegrationId, draftId, subjectInput, toInput])

  const handleSaveDraft = useCallback(async () => {
    if (!authReady) return
    const payloadBody = buildComposePayload()
    if (!payloadBody) {
      setErrorText("Select an integration before saving the draft.")
      return
    }

    setIsBusy(true)
    setErrorText("")

    const payload = await apiRequest<{ draft: MessageView; simulated: boolean }>(
      "/api/email/drafts",
      {
        method: "POST",
        body: JSON.stringify(payloadBody),
      },
    )

    setIsBusy(false)
    if (!payload.ok || !payload.draft) {
      setErrorText(payload.error || "Could not save draft.")
      return
    }

    setDraftId(payload.draft.id)
    await loadDrafts()
    await loadMessages()
  }, [apiRequest, authReady, buildComposePayload, loadDrafts, loadMessages])

  const handleSend = useCallback(async () => {
    if (!authReady) return
    const payloadBody = buildComposePayload({ requireRecipient: true })
    if (!payloadBody) {
      setErrorText("Select an integration and provide at least one recipient.")
      return
    }

    setIsBusy(true)
    setErrorText("")

    const payload = await apiRequest<{ message: MessageView; simulated: boolean }>(
      "/api/email/messages",
      {
        method: "POST",
        body: JSON.stringify({
          action: "send",
          payload: {
            integrationId: payloadBody.integrationId,
            to: payloadBody.to,
            cc: payloadBody.cc,
            bcc: payloadBody.bcc,
            subject: payloadBody.subject,
            body: payloadBody.body,
            attachments: payloadBody.attachments,
          },
        }),
      },
    )

    setIsBusy(false)
    if (!payload.ok) {
      setErrorText(payload.error || "Could not send email.")
      return
    }

    clearCompose()
    await loadMessages()
    await loadDrafts()
  }, [
    apiRequest,
    authReady,
    buildComposePayload,
    clearCompose,
    loadDrafts,
    loadMessages,
  ])

  const handleDraftSelect = useCallback((draft: MessageView) => {
    setDraftId(draft.id)
    setComposeIntegrationId(draft.integrationId)
    setToInput(toRecipientInput(draft.to))
    setCcInput(toRecipientInput(draft.cc))
    setBccInput(toRecipientInput(draft.bcc))
    setSubjectInput(draft.subject || "")
    setBodyInput(draft.body || "")
    setAttachments(draft.attachments || [])
  }, [])

  const handleDraftDelete = useCallback(
    async (id: string) => {
      if (!authReady) return
      const payload = await apiRequest(`/api/email/drafts/${id}`, {
        method: "DELETE",
      })
      if (!payload.ok) {
        setErrorText(payload.error || "Could not delete draft.")
        return
      }

      if (draftId === id) {
        clearCompose()
      }
      await loadDrafts()
    },
    [apiRequest, authReady, clearCompose, draftId, loadDrafts],
  )

  const messageGroups = useMemo(() => {
    const today: MessageView[] = []
    const yesterday: MessageView[] = []
    const older: MessageView[] = []
    for (const m of messages) {
      const g = formatRelativeDate(m.receivedAt)
      if (g === "today") today.push(m)
      else if (g === "yesterday") yesterday.push(m)
      else older.push(m)
    }
    return { today, yesterday, older }
  }, [messages])

  const unreadCount = useMemo(() => messages.filter((m) => !m.isRead).length, [messages])

  return (
    <div className="h-full overflow-hidden p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">Email Workspace</h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
            Integrated with Gmail, Outlook, IMAP, and other email APIs. Securely store credentials; sync, search, send, and manage drafts.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {authReady && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{integrations.length}</span> accounts
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{messages.length}</span> messages
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{drafts.length}</span> drafts
              </span>
            </div>
          )}
          <Badge variant="outline" className="gap-1.5 shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" />
            Encrypted credentials
          </Badge>
        </div>
      </div>

      {!authReady ? (
        <Card className="overflow-hidden border-2 border-dashed bg-gradient-to-b from-card to-muted/20">
          <CardContent className="p-8 md:p-10">
            <div className="flex flex-col items-center text-center max-w-lg mx-auto">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 ring-4 ring-primary/5">
                <Mail className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Sign in to connect your email</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Supabase sign-in is required so we can store and use your credentials securely. After sign-in you can connect Gmail, Outlook, IMAP, or other providers.
              </p>
              <ul className="mt-6 text-left w-full space-y-3">
                {(["gmail", "outlook", "imap", "other"] as const).map((p) => {
                  const meta = providerMeta[p]
                  return (
                    <li key={p} className={cn("flex items-center gap-3 rounded-lg border border-border bg-background/60 px-4 py-3", meta.color)}>
                      <span className="shrink-0 w-9 h-9 rounded-lg bg-background/80 flex items-center justify-center border border-border/50">
                        {meta.icon}
                      </span>
                      <div className="min-w-0 text-left">
                        <span className="font-semibold text-foreground">{meta.label}</span>
                        <span className="text-muted-foreground ml-1.5">
                          {p === "gmail" && "OAuth — Connect with Google"}
                          {p === "outlook" && "OAuth — Connect with Microsoft"}
                          {p === "imap" && "App password or username/password"}
                          {p === "other" && "Access token or app password"}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3 justify-center">
                <Button size="lg" className="gap-2 shadow-sm" asChild>
                  <a href="/login">
                    <LogIn className="h-4 w-4" />
                    Sign in to get started
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="gap-2" asChild>
                  <a href="/auth">
                    Manage auth & connections
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid h-[calc(100vh-9.25rem)] grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(400px,1fr)_400px]">
          <Card className="flex min-h-0 flex-col shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">Accounts</CardTitle>
                  <CardDescription className="mt-0.5">
                    Connect Gmail, Outlook, IMAP, or other. OAuth or app password.
                  </CardDescription>
                </div>
                {integrations.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 shrink-0"
                    onClick={async () => {
                      for (const i of integrations) void handleSyncNow(i.id)
                    }}
                    disabled={isBusy}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", isBusy && "animate-spin")} />
                    Refresh all
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Collapsible defaultOpen={integrations.length === 0}>
                <CollapsibleTrigger asChild>
                  <Button variant="secondary" className="w-full justify-between gap-2 h-10" size="sm">
                    <span className="flex items-center gap-2">
                      <UserRoundPlus className="h-4 w-4" />
                      Add account
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 gap-3 pt-3 border-t border-border mt-3">
                <Input
                  placeholder="email@domain.com"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  className="h-9"
                />
                <Input
                  placeholder="Display name (optional)"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="h-9"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Provider</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={provider}
                      onChange={(event) => setProviderWithDefaultAuth(event.target.value as Provider)}
                    >
                      {(["gmail", "outlook", "imap", "other"] as const).map((p) => (
                        <option key={p} value={p}>{providerMeta[p].label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Auth</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={authKind}
                      onChange={(event) => setAuthKind(event.target.value as AuthKind)}
                    >
                      <option value="oauth">OAuth</option>
                      <option value="accessToken">Access Token</option>
                      <option value="appPassword">App Password</option>
                      <option value="password">Username/Password</option>
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  {provider === "gmail" && "Gmail: Click ‘Connect with Google’ below or paste OAuth tokens from Google Cloud Console."}
                  {provider === "outlook" && "Outlook: Click ‘Connect with Microsoft’ below or paste OAuth tokens from Azure."}
                  {provider === "imap" && "IMAP: Use your provider’s app password (e.g. Gmail → Security → App passwords) or username + password."}
                  {provider === "other" && "Other: Use an API access token or app-specific password from your email provider."}
                </p>

                {authKind === "oauth" ? (
                  <div className="grid grid-cols-1 gap-2">
                    {(provider === "gmail" || provider === "outlook") ? (
                      <a
                        href={`/api/email/oauth?action=start&provider=${provider}`}
                        className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md border border-border bg-card hover:bg-secondary transition-colors text-sm font-medium"
                      >
                        {provider === "gmail" ? "Connect with Google" : "Connect with Microsoft"}
                      </a>
                    ) : null}
                    <p className="text-[10px] text-muted-foreground text-center">
                      — or paste tokens manually —
                    </p>
                    <Input
                      placeholder="OAuth access token"
                      value={accessTokenInput}
                      onChange={(event) => setAccessTokenInput(event.target.value)}
                    />
                    <Input
                      placeholder="Refresh token (optional)"
                      value={refreshTokenInput}
                      onChange={(event) => setRefreshTokenInput(event.target.value)}
                    />
                  </div>
                ) : null}

                {authKind === "password" ? (
                  <div className="grid grid-cols-1 gap-2">
                    <Input
                      placeholder="Username"
                      value={usernameInput}
                      onChange={(event) => setUsernameInput(event.target.value)}
                    />
                    <Input
                      placeholder="Password"
                      type="password"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                    />
                  </div>
                ) : null}

                {authKind === "accessToken" || authKind === "appPassword" ? (
                  <Input
                    placeholder={authKind === "accessToken" ? "Access token" : "App password"}
                    type="password"
                    value={credentialTokenInput}
                    onChange={(event) => setCredentialTokenInput(event.target.value)}
                  />
                ) : null}

                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <Label htmlFor="sync-enabled" className="text-xs">
                    Enable auto-sync
                  </Label>
                  <Switch
                    id="sync-enabled"
                    checked={syncEnabled}
                    onCheckedChange={setSyncEnabled}
                  />
                </div>

                <Button className="gap-2 w-full" onClick={() => void handleAddIntegration()} disabled={isBusy}>
                  <UserRoundPlus className="h-4 w-4" />
                  Add account
                </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <ScrollArea className="h-[380px] rounded-lg border border-border">
                <div className="p-2 space-y-2">
                  {integrations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                      <div className="w-14 h-14 rounded-xl bg-muted/80 flex items-center justify-center mb-3 ring-2 ring-border/50">
                        <Mailbox className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No accounts yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Add an account above to sync and send email.</p>
                    </div>
                  ) : (
                    integrations.map((integration) => {
                      const meta = providerMeta[integration.provider]
                      return (
                        <div
                          key={integration.id}
                          className={cn(
                            "rounded-xl border p-3 text-xs transition-colors",
                            selectedIntegrationId === integration.id
                              ? "border-primary/40 bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:bg-muted/30",
                          )}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => {
                              setSelectedIntegrationId(integration.id)
                              setComposeIntegrationId(integration.id)
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", meta.color)}>
                                {meta.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-foreground">{integration.email}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{meta.short}</p>
                              </div>
                              <Badge className={cn("h-5 px-1.5 text-[10px] shrink-0", statusBadgeTone(integration.status))}>
                                {integration.status}
                              </Badge>
                            </div>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              Last sync: {formatTimestamp(integration.lastSyncedAt)}
                            </p>
                            {integration.syncError && (
                              <p className="mt-1 text-[10px] text-destructive truncate">{integration.syncError}</p>
                            )}
                          </button>
                          <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-border">
                            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => void handleSyncNow(integration.id)} disabled={integration.status === "syncing"}>
                              <RefreshCw className={cn("h-3 w-3", integration.status === "syncing" && "animate-spin")} />
                              Sync
                            </Button>
                            <div className="flex items-center gap-1.5">
                              <Label className="text-[10px] text-muted-foreground">Auto</Label>
                              <Switch checked={integration.syncEnabled} onCheckedChange={() => void handleToggleSync(integration)} />
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => void handleDeleteIntegration(integration.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">Messages</CardTitle>
                  <CardDescription className="mt-0.5">Search and browse synced email.</CardDescription>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {unreadCount} unread
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={messagesRefreshing}
                    onClick={async () => {
                      setMessagesRefreshing(true)
                      await loadMessages()
                      await loadDrafts()
                      setMessagesRefreshing(false)
                    }}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", messagesRefreshing && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>
              <div className="relative mt-2 flex items-center gap-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9 h-9 flex-1"
                  placeholder="Search subject, sender, or body..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery !== searchQueryDebounced && searchQuery.trim() && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Searching...</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid min-h-0 grid-cols-1 gap-4 pb-4 md:grid-cols-2">
              <div className="flex min-h-0 flex-col rounded-xl border border-border overflow-hidden">
                <Tabs defaultValue="all" className="flex flex-col min-h-0 flex-1">
                  <div className="border-b border-border px-3 py-2 flex items-center justify-between">
                    <TabsList className="h-8 p-0.5 bg-transparent gap-0">
                      <TabsTrigger value="all" className="text-xs data-[state=active]:bg-muted rounded-md px-2.5">All</TabsTrigger>
                      <TabsTrigger value="unread" className="text-xs data-[state=active]:bg-muted rounded-md px-2.5">
                        Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <ScrollArea className="h-[440px] flex-1">
                    <TabsContent value="all" className="m-0 p-2 space-y-3">
                      {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                          <div className="w-14 h-14 rounded-xl bg-muted/80 flex items-center justify-center mb-3 ring-2 ring-border/50">
                            <Inbox className="w-7 h-7 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium text-foreground">No messages</p>
                          <p className="text-xs text-muted-foreground mt-1">Sync an account or try a different search.</p>
                        </div>
                      ) : (
                        ["today", "yesterday", "older"].map((groupKey) => {
                          const label = groupKey === "today" ? "Today" : groupKey === "yesterday" ? "Yesterday" : "Older"
                          const items = messageGroups[groupKey as keyof typeof messageGroups]
                          if (!items || items.length === 0) return null
                          return (
                            <div key={groupKey}>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1.5">{label}</p>
                              <div className="space-y-1.5">
                                {items.map((message) => (
                                  <button
                                    key={message.id}
                                    type="button"
                                    className={cn(
                                      "w-full rounded-lg border p-2.5 text-left text-xs transition-colors",
                                      !message.isRead ? "border-primary/30 bg-primary/5 font-medium" : "border-border bg-card hover:bg-muted/40",
                                    )}
                                    onClick={() => {
                                      setComposeIntegrationId(message.integrationId)
                                      setToInput(toRecipientInput(message.to))
                                      setCcInput(toRecipientInput(message.cc))
                                      setBccInput(toRecipientInput(message.bcc))
                                      setSubjectInput(message.subject)
                                      setBodyInput(message.body)
                                      setDraftId("")
                                      setAttachments([])
                                    }}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span className={cn("flex-1 truncate", !message.isRead && "text-foreground")}>
                                        {message.subject || "No subject"}
                                      </span>
                                      {!message.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                                      <span className="text-[10px] text-muted-foreground shrink-0">
                                        {new Date(message.receivedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                      {message.from.name || message.from.email}
                                    </p>
                                    {message.attachments && message.attachments.length > 0 ? (
                                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Paperclip className="h-3 w-3" />
                                        {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}
                                      </p>
                                    ) : null}
                                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                      {message.snippet || message.body || "—"}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </TabsContent>
                    <TabsContent value="unread" className="m-0 p-2">
                      {messages.filter((m) => !m.isRead).length === 0 ? (
                        <p className="p-4 text-xs text-muted-foreground text-center">No unread messages.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {messages.filter((m) => !m.isRead).map((message) => (
                            <button
                              key={message.id}
                              type="button"
                              className="w-full rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-left text-xs hover:bg-primary/10"
                              onClick={() => {
                                setComposeIntegrationId(message.integrationId)
                                setToInput(toRecipientInput(message.to))
                                setCcInput(toRecipientInput(message.cc))
                                setBccInput(toRecipientInput(message.bcc))
                                setSubjectInput(message.subject)
                                setBodyInput(message.body)
                                setDraftId("")
                                setAttachments([])
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate font-medium">{message.subject || "No subject"}</p>
                                <span className="text-[10px] text-muted-foreground">{new Date(message.receivedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{message.from.name || message.from.email}</p>
                              {message.attachments && message.attachments.length > 0 ? (
                                <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Paperclip className="h-3 w-3" />
                                  {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}
                                </p>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>
              </div>

              <div className="flex min-h-0 flex-col rounded-xl border border-border overflow-hidden">
                <div className="border-b border-border px-3 py-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Drafts</p>
                  {drafts.length > 0 && <Badge variant="secondary" className="text-[10px]">{drafts.length}</Badge>}
                </div>
                <ScrollArea className="h-[440px]">
                  <div className="p-2 space-y-2">
                    {drafts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div className="w-14 h-14 rounded-xl bg-muted/80 flex items-center justify-center mb-3 ring-2 ring-border/50">
                          <FileText className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No drafts</p>
                        <p className="text-xs text-muted-foreground mt-1">Save a draft from the compose panel.</p>
                      </div>
                    ) : (
                      drafts.map((draft) => (
                        <div key={draft.id} className="rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors">
                          <button type="button" className="w-full text-left text-xs" onClick={() => handleDraftSelect(draft)}>
                            <p className="truncate font-medium text-foreground">{draft.subject || "Untitled draft"}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">To: {toRecipientInput(draft.to) || "No recipients"}</p>
                            {draft.attachments && draft.attachments.length > 0 ? (
                              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Paperclip className="h-3 w-3" />
                                {draft.attachments.length} attachment{draft.attachments.length === 1 ? "" : "s"}
                              </p>
                            ) : null}
                            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{draft.body || "(empty)"}</p>
                          </button>
                          <div className="mt-2 flex justify-end">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-destructive hover:bg-destructive/10" onClick={() => void handleDraftDelete(draft.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Compose</CardTitle>
              <CardDescription className="mt-0.5">Create, save drafts, and send email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleAttachmentPick}
              />
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">From</Label>
                <select
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={composeIntegrationId}
                  onChange={(event) => setComposeIntegrationId(event.target.value)}
                >
                  <option value="">Select account</option>
                  {integrations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.email} ({item.provider})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">To</Label>
                <Input
                  className="h-9 rounded-lg"
                  placeholder="recipient@example.com"
                  value={toInput}
                  onChange={(event) => setToInput(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Cc</Label>
                  <Input className="h-9 rounded-lg" placeholder="Optional" value={ccInput} onChange={(event) => setCcInput(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Bcc</Label>
                  <Input className="h-9 rounded-lg" placeholder="Optional" value={bccInput} onChange={(event) => setBccInput(event.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Subject</Label>
                <Input
                  className="h-9 rounded-lg"
                  placeholder="Subject"
                  value={subjectInput}
                  onChange={(event) => setSubjectInput(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground">Message</Label>
                  {bodyInput.length > 0 && <span className="text-[10px] text-muted-foreground">{bodyInput.length} characters</span>}
                </div>
                <Textarea
                  className="min-h-[200px] rounded-lg resize-y"
                  placeholder="Write your message..."
                  value={bodyInput}
                  onChange={(event) => setBodyInput(event.target.value)}
                />
              </div>
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foreground">Attachments</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {attachments.length} file{attachments.length === 1 ? "" : "s"} · {formatBytes(attachments.reduce((sum, item) => sum + item.size, 0))}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {attachments.map((attachment) => (
                      <div
                        key={`${attachment.filename}-${attachment.size}-${attachment.contentId || "file"}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{attachment.filename}</p>
                          <p className="text-[10px] text-muted-foreground">{formatBytes(attachment.size)} · {attachment.mimeType}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          onClick={() => handleRemoveAttachment(attachment.filename)}
                          disabled={isBusy}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleSaveDraft()} disabled={isBusy || isPreparingAttachments}>
                  <Mail className="h-3.5 w-3.5" />
                  Save draft
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => void handleSend()} disabled={isBusy || isPreparingAttachments}>
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
                <Button variant="ghost" size="sm" onClick={clearCompose} disabled={isBusy || isPreparingAttachments}>
                  Clear
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={isBusy || isPreparingAttachments}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {isPreparingAttachments ? "Preparing..." : "Attach files"}
                </Button>
                {(isBusy || isPreparingAttachments) && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    {isPreparingAttachments ? "Reading files..." : "Working..."}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {errorText ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
          <span>{errorText}</span>
          <Button variant="ghost" size="sm" className="shrink-0 text-destructive hover:bg-destructive/20" onClick={() => setErrorText("")}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  )
}
