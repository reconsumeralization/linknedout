
"use client"

import { ChatMessageBubble, type MessageType } from "@/components/chat-shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { parseLinkedInCsv } from "@/lib/csv/csv-parser"
import type { ImportSourceInput } from "@/lib/csv/import-session"
import { importLinkedInPdf } from "@/lib/linkedin/linkedin-pdf-parser"
import { PERSONAS } from "@/lib/shared/personas"
import { processRealtimeToolCallsFromServerEvent } from "@/lib/realtime/realtime-client"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import {
  dispatchTribeDesignPreviewEvent,
  extractTribeDesignPreviewEventDetail,
} from "@/lib/shared/tribe-design-preview-events"
import { cn } from "@/lib/shared/utils"
import { useChat } from "@ai-sdk/react"
import {
  Bot,
  ChevronDown,
  FileText,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

interface ChatPanelProps {
  activeView?: string
  csvData: string | null
  importLabel: string | null
  onImportProfiles: (input: ImportSourceInput) => void
  pageContext?: Record<string, string | number | boolean | null>
}

type ChatMode = "text" | "realtime"

function createMessageId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

type DocumentWithPermissionsPolicy = Document & {
  permissionsPolicy?: { allowsFeature?: (feature: string) => boolean }
  featurePolicy?: { allowsFeature?: (feature: string) => boolean }
}

function isMicrophoneAllowedByDocumentPolicy(): boolean {
  if (typeof document === "undefined") return true
  const policyHost = document as DocumentWithPermissionsPolicy
  const policy = policyHost.permissionsPolicy ?? policyHost.featurePolicy
  if (!policy || typeof policy.allowsFeature !== "function") {
    return true
  }
  try {
    return policy.allowsFeature("microphone")
  } catch {
    return true
  }
}

async function getMicrophonePermissionState(): Promise<PermissionState | "unknown"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown"
  }
  try {
    const result = await navigator.permissions.query({ name: "microphone" as PermissionName })
    return result.state
  } catch {
    return "unknown"
  }
}

async function readErrorMessageFromResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as unknown
    const payloadRecord = asRecord(payload)
    const errorMessage = asString(payloadRecord?.error)
    if (errorMessage) return errorMessage
    const message = asString(payloadRecord?.message)
    if (message) return message
  }

  const text = await response.text().catch(() => "")
  return text.trim().slice(0, 220)
}

function extractResponseDoneText(event: Record<string, unknown>): string {
  const response = asRecord(event.response)
  if (!response || !Array.isArray(response.output)) {
    return ""
  }

  const chunks: string[] = []
  for (const outputItem of response.output) {
    const item = asRecord(outputItem)
    if (!item) continue

    if (item.type === "output_text") {
      const text = asString(item.text || item.value)
      if (text) chunks.push(text)
      continue
    }

    if (!Array.isArray(item.content)) continue
    for (const contentPart of item.content) {
      const part = asRecord(contentPart)
      if (!part) continue
      if (part.type === "output_text" || part.type === "text") {
        const text = asString(part.text || part.value)
        if (text) chunks.push(text)
      }
    }
  }

  return chunks.join("").trim()
}

async function readTextFromFile(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "")
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."))
    reader.readAsText(file)
  })
}

export function ChatPanel({ activeView = "chat", csvData, importLabel, onImportProfiles, pageContext }: ChatPanelProps) {
  const [selectedPersonaId, setSelectedPersonaId] = useState("hr-director")
  const [showPersonaMenu, setShowPersonaMenu] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [chatMode, setChatMode] = useState<ChatMode>("text")
  const [realtimeMessages, setRealtimeMessages] = useState<MessageType[]>([])
  const [isRealtimeConnecting, setIsRealtimeConnecting] = useState(false)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState("Disconnected")
  const [realtimeError, setRealtimeError] = useState<string | null>(null)
  const [realtimeToolsUsed, setRealtimeToolsUsed] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const assistantDraftIdRef = useRef<string | null>(null)
  const handledDesignPreviewKeysRef = useRef<Set<string>>(new Set())
  const chatModeRef = useRef<ChatMode>(chatMode)
  const isRealtimeClosingRef = useRef(false)

  const selectedPersona = PERSONAS.find((p) => p.id === selectedPersonaId) ?? PERSONAS[0]

  useEffect(() => {
    chatModeRef.current = chatMode
  }, [chatMode])

  useEffect(() => {
    const refreshAuth = () => {
      setAccessToken(resolveSupabaseAccessToken())
    }
    refreshAuth()
    window.addEventListener("storage", refreshAuth)
    return () => {
      window.removeEventListener("storage", refreshAuth)
    }
  }, [])

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, setInput } = useChat({
    api: "/api/chat",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: {
      personaId: selectedPersonaId,
      csvData: csvData ?? undefined,
      activeView,
      pageContext: pageContext ?? undefined,
    },
    onFinish: () => {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
    },
  })

  const addRealtimeMessage = useCallback((role: "user" | "assistant" | "system", content: string) => {
    if (!content.trim()) return
    setRealtimeMessages((current) => [...current, { id: createMessageId(role), role, content }])
  }, [])

  useEffect(() => {
    const handledKeys = handledDesignPreviewKeysRef.current
    const messageList = Array.isArray(messages) ? (messages as unknown[]) : []

    for (let messageIndex = 0; messageIndex < messageList.length; messageIndex++) {
      const message = asRecord(messageList[messageIndex])
      if (!message) continue
      const messageId = asString(message.id) || `msg-${messageIndex}`
      const parts = Array.isArray(message.parts) ? message.parts : []

      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex]
        const detail = extractTribeDesignPreviewEventDetail(part)
        if (!detail) continue
        const dedupeKey = `${messageId}:${partIndex}:${detail.sourceId}`
        if (handledKeys.has(dedupeKey)) continue
        handledKeys.add(dedupeKey)
        dispatchTribeDesignPreviewEvent(part)
      }
    }
  }, [messages])

  const appendAssistantDelta = useCallback((delta: string) => {
    if (!delta) return

    setRealtimeMessages((current) => {
      const draftId = assistantDraftIdRef.current
      if (draftId) {
        return current.map((message) =>
          message.id === draftId ? { ...message, content: `${message.content || ""}${delta}` } : message,
        )
      }

      const id = createMessageId("assistant")
      assistantDraftIdRef.current = id
      return [...current, { id, role: "assistant", content: delta }]
    })
  }, [])

  const finalizeAssistantDraft = useCallback(() => {
    assistantDraftIdRef.current = null
  }, [])

  const disconnectRealtime = useCallback((reason = "Disconnected") => {
    if (isRealtimeClosingRef.current) {
      return
    }

    isRealtimeClosingRef.current = true

    const channel = dataChannelRef.current
    if (channel) {
      try {
        channel.close()
      } catch {
        // Ignore close errors
      }
      dataChannelRef.current = null
    }

    const peerConnection = peerConnectionRef.current
    if (peerConnection) {
      try {
        peerConnection.close()
      } catch {
        // Ignore close errors
      }
      peerConnectionRef.current = null
    }

    const localStream = localStreamRef.current
    if (localStream) {
      for (const track of localStream.getTracks()) {
        track.stop()
      }
      localStreamRef.current = null
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }

    finalizeAssistantDraft()
    setIsRealtimeConnected(false)
    setIsRealtimeConnecting(false)
    setRealtimeStatus(reason)
    isRealtimeClosingRef.current = false
  }, [finalizeAssistantDraft])

  useEffect(() => {
    return () => {
      disconnectRealtime("Disconnected")
    }
  }, [disconnectRealtime])

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>): boolean => {
    const channel = dataChannelRef.current
    if (!channel || channel.readyState !== "open") {
      return false
    }
    channel.send(JSON.stringify(event))
    return true
  }, [])

  const runRealtimePreflight = useCallback(async (): Promise<string | null> => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "Realtime voice requires HTTPS (or localhost)."
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return "Microphone access is not available in this browser."
    }

    if (!isMicrophoneAllowedByDocumentPolicy()) {
      return "Microphone is blocked by site Permissions-Policy. Enable microphone access in security headers."
    }

    const microphonePermission = await getMicrophonePermissionState()
    if (microphonePermission === "denied") {
      return "Microphone permission is denied in this browser."
    }

    let discoveryResponse: Response
    try {
      discoveryResponse = await fetch("/api/realtime/session", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error"
      return `Realtime preflight failed: ${message}`
    }
    if (!discoveryResponse.ok) {
      if (discoveryResponse.status === 401) {
        return "Sign in with Supabase to use realtime voice."
      }
      const errorMessage = await readErrorMessageFromResponse(discoveryResponse)
      return errorMessage || `Realtime preflight failed (HTTP ${discoveryResponse.status}).`
    }

    const payload = (await discoveryResponse.json().catch(() => ({}))) as {
      requiresOpenAiKey?: boolean
    }
    if (payload.requiresOpenAiKey === false) {
      return "Server is missing OPENAI_API_KEY. Realtime voice is disabled."
    }

    return null
  }, [accessToken])

  const handleRealtimeServerEvent = useCallback(
    async (event: Record<string, unknown>) => {
      const eventType = asString(event.type)

      if (eventType === "error") {
        const errorData = asRecord(event.error)
        const message = asString(errorData?.message) || "Realtime session error."
        setRealtimeError(message)
        setRealtimeStatus("Error")
        toast.error(message)
      }

      if (eventType === "session.created" || eventType === "session.updated") {
        setRealtimeStatus("Session ready")
      }
      if (eventType === "input_audio_buffer.speech_started") setRealtimeStatus("Listening...")
      if (eventType === "input_audio_buffer.speech_stopped") setRealtimeStatus("Processing speech...")
      if (eventType === "response.created") setRealtimeStatus("Generating response...")

      if (eventType === "conversation.item.input_audio_transcription.completed") {
        const transcript = asString(event.transcript)
        if (transcript) addRealtimeMessage("user", transcript)
      }

      if (eventType === "response.output_text.delta" || eventType === "response.audio_transcript.delta") {
        appendAssistantDelta(asString(event.delta))
      }

      if (eventType === "response.output_text.done") {
        const text = asString(event.text)
        if (text && !assistantDraftIdRef.current) addRealtimeMessage("assistant", text)
        finalizeAssistantDraft()
      }

      if (eventType === "response.audio_transcript.done") {
        const transcript = asString(event.transcript)
        if (transcript && !assistantDraftIdRef.current) addRealtimeMessage("assistant", transcript)
        finalizeAssistantDraft()
      }

      if (eventType === "response.done") {
        const fallbackText = extractResponseDoneText(event)
        if (fallbackText && !assistantDraftIdRef.current) addRealtimeMessage("assistant", fallbackText)
        finalizeAssistantDraft()
        setRealtimeStatus("Listening...")
      }

      await processRealtimeToolCallsFromServerEvent(event, {
        accessToken,
        sendClientEvent: (clientEvent) => {
          sendRealtimeEvent(clientEvent)
        },
        onToolResult: (payload) => {
          setRealtimeToolsUsed((count) => count + 1)
          dispatchTribeDesignPreviewEvent(payload)
        },
        onToolError: (error) => {
          setRealtimeError(error)
          toast.error(error)
        },
      })
    },
    [accessToken, addRealtimeMessage, appendAssistantDelta, finalizeAssistantDraft, sendRealtimeEvent],
  )

  const connectRealtime = useCallback(async () => {
    if (isRealtimeConnecting || isRealtimeConnected) return

    setRealtimeError(null)
    setIsRealtimeConnecting(true)
    setRealtimeStatus("Checking prerequisites...")

    const preflightMessage = await runRealtimePreflight()
    if (preflightMessage) {
      setRealtimeError(preflightMessage)
      setRealtimeStatus("Unavailable")
      toast.error(preflightMessage)
      setIsRealtimeConnecting(false)
      return
    }

    setRealtimeStatus("Requesting microphone...")

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = localStream

      const peerConnection = new RTCPeerConnection()
      peerConnectionRef.current = peerConnection

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams
        if (remoteAudioRef.current && stream) {
          remoteAudioRef.current.srcObject = stream
          void remoteAudioRef.current.play().catch(() => {
            // Playback may require user interaction; ignore.
          })
        }
      }

      peerConnection.onconnectionstatechange = () => {
        if (
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected" ||
          peerConnection.connectionState === "closed"
        ) {
          disconnectRealtime(peerConnection.connectionState === "failed" ? "Connection lost" : "Disconnected")
        }
      }

      for (const track of localStream.getTracks()) {
        peerConnection.addTrack(track, localStream)
      }

      const dataChannel = peerConnection.createDataChannel("oai-events")
      dataChannelRef.current = dataChannel

      dataChannel.onopen = () => {
        setIsRealtimeConnected(true)
        setIsRealtimeConnecting(false)
        setRealtimeStatus("Listening...")
        addRealtimeMessage("system", "Realtime connected. Speak naturally or type and press Enter.")
      }

      dataChannel.onclose = () => {
        disconnectRealtime("Disconnected")
      }

      dataChannel.onerror = () => {
        setRealtimeError("Realtime data channel encountered an error.")
        setRealtimeStatus("Error")
      }

      dataChannel.onmessage = (messageEvent) => {
        try {
          const serverEvent = JSON.parse(messageEvent.data as string) as Record<string, unknown>
          void handleRealtimeServerEvent(serverEvent)
        } catch {
          // Ignore malformed events
        }
      }

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      const response = await fetch("/api/realtime/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          offerSdp: offer.sdp,
          outputModalities: ["text", "audio"],
          toolChoice: "auto",
          instructions: selectedPersona.systemPrompt,
        }),
      })

      if (!response.ok) {
        const serverMessage = await readErrorMessageFromResponse(response)
        const normalizedServerMessage = serverMessage.toLowerCase()
        const missingKeyHint =
          response.status >= 500 && normalizedServerMessage.includes("openai_api_key")
            ? " Add OPENAI_API_KEY to server env and restart."
            : ""
        const message =
          (serverMessage ? `${serverMessage}${missingKeyHint}` : "") ||
          `Failed to establish realtime session (HTTP ${response.status}).`
        throw new Error(message)
      }

      const answerSdp = await response.text()
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp })
    } catch (error) {
      const domErrorName = error instanceof DOMException ? error.name : ""
      const message =
        domErrorName === "NotAllowedError" || domErrorName === "SecurityError"
          ? isMicrophoneAllowedByDocumentPolicy()
            ? "Microphone permission was denied by the browser."
            : "Microphone is blocked by site Permissions-Policy."
          : domErrorName === "NotFoundError"
          ? "No microphone input device was found."
          : error instanceof Error
          ? error.message
          : "Failed to connect realtime session."
      setRealtimeError(message)
      toast.error(message)
      disconnectRealtime("Disconnected")
      setIsRealtimeConnecting(false)
    }
  }, [
    accessToken,
    addRealtimeMessage,
    disconnectRealtime,
    handleRealtimeServerEvent,
    isRealtimeConnected,
    isRealtimeConnecting,
    runRealtimePreflight,
    selectedPersona.systemPrompt,
  ])

  const sendRealtimeTextPrompt = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    if (!sendRealtimeEvent({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text: trimmed }] },
    })) {
      toast.error("Realtime session is not connected.")
      return
    }

    addRealtimeMessage("user", trimmed)
    finalizeAssistantDraft()
    sendRealtimeEvent({ type: "response.create" })
  }, [addRealtimeMessage, finalizeAssistantDraft, sendRealtimeEvent])
  useEffect(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 80)
  }, [messages, realtimeMessages, isLoading, isRealtimeConnecting])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const lowerName = file.name.toLowerCase()
      const isCsv = lowerName.endsWith(".csv") || file.type.toLowerCase().includes("csv")
      const isPdf = lowerName.endsWith(".pdf") || file.type === "application/pdf"

      try {
        if (isCsv) {
          const text = await readTextFromFile(file)
          const profiles = parseLinkedInCsv(text)
          if (profiles.length === 0) {
            toast.error("No profiles found in CSV.")
            return
          }

          onImportProfiles({
            type: "csv",
            fileName: file.name,
            profiles,
            rawCsv: text,
          })
          toast.success(`CSV loaded: ${file.name}`, {
            description: `${profiles.length} profiles ready for analysis`,
          })
          return
        }

        if (isPdf) {
          const result = await importLinkedInPdf(file)
          const fullName = `${result.profile.firstName} ${result.profile.lastName}`.trim()
          onImportProfiles({
            type: "linkedin_pdf",
            fileName: file.name,
            profiles: [result.profile],
            warnings: result.warnings,
          })
          toast.success(`LinkedIn PDF imported: ${fullName || "Profile"}`, {
            description: accessToken
              ? "Profile ready for analysis."
              : "Profile ready for analysis. Sign in to review and save in Profiles CRM.",
          })
          return
        }

        toast.error("Please upload a CSV or LinkedIn PDF file.")
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to import file."
        toast.error(message)
      } finally {
        e.target.value = ""
      }
    },
    [accessToken, onImportProfiles],
  )

  const handleModeSwitch = useCallback((mode: ChatMode) => {
    setChatMode(mode)
    chatModeRef.current = mode
    setRealtimeError(null)
    if (mode === "text") {
      disconnectRealtime("Disconnected")
      return
    }

    setRealtimeStatus("Checking prerequisites...")
    void runRealtimePreflight().then((preflightMessage) => {
      if (chatModeRef.current !== "realtime") {
        return
      }
      if (preflightMessage) {
        setRealtimeError(preflightMessage)
        setRealtimeStatus("Unavailable")
        return
      }
      setRealtimeStatus("Ready")
    })
  }, [disconnectRealtime, runRealtimePreflight])

  const clearChat = () => {
    if (chatMode === "realtime") {
      setRealtimeMessages([])
      setRealtimeToolsUsed(0)
      finalizeAssistantDraft()
      return
    }
    setMessages([])
  }

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (chatMode === "realtime") {
      if (!isRealtimeConnected || !input.trim()) return
      sendRealtimeTextPrompt(input)
      setInput("")
      return
    }

    if (!input.trim() || isLoading) return
    void handleSubmit(e)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return
    e.preventDefault()

    if (chatMode === "realtime") {
      if (!isRealtimeConnected || !input.trim()) return
      sendRealtimeTextPrompt(input)
      setInput("")
      return
    }

    if (input.trim() && !isLoading) {
      void handleSubmit()
    }
  }

  const suggestedPrompts: string[] = csvData
    ? [
        "Analyze my imported profiles — summarize skill distribution, top profiles, and tribe recommendations",
        "Form tribes from these profiles optimized for innovation and cross-functional collaboration",
        "What skill gaps exist in this dataset? Identify missing and overrepresented skills",
        "Which profiles show the most leadership potential based on seniority and experience?",
      ]
    : [
        "Search for senior engineers in San Francisco with ML experience",
        "Analyze the network for talent clusters in fintech",
        "What are the top skills trending in the AI space?",
        "Find companies with strong engineering culture hiring now",
      ]

  const activeMessages = chatMode === "realtime" ? realtimeMessages : (messages as MessageType[])
  const showTypingIndicator = chatMode === "text" ? isLoading : isRealtimeConnecting

  return (
    <div className="flex h-full flex-col">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPersonaMenu((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
              aria-haspopup="listbox"
              aria-expanded={showPersonaMenu}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: selectedPersona.color }}
              >
                {selectedPersona.avatar}
              </div>
              <div className="text-sm">
                <span className="font-medium text-foreground">{selectedPersona.name}</span>
                <span className="text-muted-foreground ml-1 text-xs">| {selectedPersona.role}</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {showPersonaMenu ? (
              <div className="absolute top-full left-0 mt-1 w-72 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                {PERSONAS.map((persona) => (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => {
                      setSelectedPersonaId(persona.id)
                      setShowPersonaMenu(false)
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-2.5 hover:bg-secondary transition-colors text-left",
                      selectedPersonaId === persona.id && "bg-primary/10",
                    )}
                    tabIndex={0}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5"
                      style={{ background: persona.color }}
                    >
                      {persona.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{persona.name}</div>
                      <div className="text-xs text-muted-foreground leading-snug">{persona.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {importLabel ? (
            <Badge variant="secondary" className="gap-1 text-xs">
              <FileText className="w-3 h-3" />
              {importLabel}
            </Badge>
          ) : null}

          <Badge variant={accessToken ? "secondary" : "outline"} className="text-xs">
            {accessToken ? "DB tools: auth" : "DB tools: locked"}
          </Badge>

          {chatMode === "realtime" ? (
            <>
              <Badge variant={isRealtimeConnected ? "secondary" : "outline"} className="text-xs">
                {isRealtimeConnected ? "Realtime: connected" : realtimeStatus}
              </Badge>
              <Badge variant="outline" className="text-xs">Tools used: {realtimeToolsUsed}</Badge>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => handleModeSwitch("text")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                chatMode === "text" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch("realtime")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                chatMode === "realtime" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              Realtime
            </button>
          </div>

          {chatMode === "realtime" ? (
            <Button
              variant={isRealtimeConnected ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                if (isRealtimeConnected || isRealtimeConnecting) {
                  disconnectRealtime("Disconnected")
                  return
                }
                void connectRealtime()
              }}
              className="gap-1.5 text-xs h-8"
              type="button"
            >
              {isRealtimeConnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRealtimeConnected ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
              {isRealtimeConnecting
                ? "Connecting..."
                : isRealtimeConnected
                ? "Disconnect"
                : realtimeStatus === "Unavailable"
                ? "Retry Checks"
                : "Connect Mic"}
            </Button>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf,application/pdf,text/csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5 text-xs h-8"
            type="button"
          >
            <Upload className="w-3.5 h-3.5" />
            {importLabel ? "Add CSV/PDF" : "Import CSV/PDF"}
          </Button>
          {activeMessages.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearChat} className="h-8 px-2" type="button">
              <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {activeMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center gap-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-lg"
              style={{ background: selectedPersona.color }}
            >
              {selectedPersona.avatar}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{selectedPersona.name}</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">{selectedPersona.description}</p>
              {chatMode === "realtime" ? (
                <p className="text-xs text-muted-foreground mt-2">
                  Connect microphone to start realtime voice. Tools are executed through secure server routes.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setInput(prompt)
                  }}
                  className="text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            {activeMessages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg as MessageType} />
            ))}
            {showTypingIndicator ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                </div>
                <span>{chatMode === "text" ? `${selectedPersona.name} is thinking...` : "Realtime is connecting..."}</span>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      <div className="px-4 py-3 border-t border-border bg-card/30 shrink-0">
        {chatMode === "realtime" && realtimeError ? (
          <p className="text-[11px] text-destructive mb-2">{realtimeError}</p>
        ) : null}

        <form onSubmit={handleFormSubmit} className="flex gap-2 items-end" autoComplete="off">
          <div className="flex-1 relative">
            <Textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                chatMode === "text"
                  ? `Ask ${selectedPersona.name} anything about LinkedIn data, profiles, tribes, or projects...`
                  : isRealtimeConnected
                  ? "Type while connected, or just speak into your microphone..."
                  : "Connect Realtime first, then type or speak..."
              }
              className="min-h-[44px] max-h-32 resize-none pr-3 bg-input border-border focus:border-primary text-sm"
              rows={1}
              spellCheck={true}
              autoFocus={false}
            />
          </div>
          <Button
            type="submit"
            disabled={chatMode === "text" ? isLoading || !input.trim() : !isRealtimeConnected || !input.trim()}
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
          >
            {chatMode === "text" && isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : chatMode === "realtime" && isRealtimeConnected ? (
              <Mic className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          {chatMode === "text"
            ? "Press Enter to send | Shift+Enter for new line | Tools: LinkedIn API, CSV analysis, tribe formation"
            : "Realtime mode uses /api/realtime/session and /api/realtime/tools for secure tool execution"}
        </p>
      </div>
    </div>
  )
}
