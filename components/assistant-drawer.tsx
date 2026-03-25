"use client"

import type { ActiveView } from "@/app/page"
import { ChatMessageBubble, type MessageType } from "@/components/chat-shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PERSONAS } from "@/lib/shared/personas"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import {
  dispatchTribeDesignPreviewEvent,
  extractTribeDesignPreviewEventDetail,
} from "@/lib/shared/tribe-design-preview-events"
import { cn } from "@/lib/shared/utils"
import { useChat } from "@ai-sdk/react"
import { Bot, Check, ChevronDown, Copy, FileText, Loader2, Maximize2, MessageSquare, Minimize2, RefreshCw, Send, Sparkles, Trash2, Upload, X, Zap } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const VIEW_LABELS: Record<ActiveView, string> = {
  dashboard: "Dashboard",
  chat: "AI Assistant",
  profiles: "Profiles CRM",
  tribes: "Tribe Builder",
  projects: "Projects",
  fundraising: "Fundraising",
  data: "Data Hub",
  storage: "Storage",
  email: "Email",
  analytics: "Analytics",
  linkedout: "LinkedOut",
  network: "Network Insights",
  agents: "Agent Control",
  globe: "3D Globe",
  sentinel: "SENTINEL",
  settings: "Settings",
  marketplace: "Marketplace",
}

const VIEW_ICONS: Partial<Record<ActiveView, string>> = {
  dashboard: "📊",
  chat: "💬",
  profiles: "👥",
  tribes: "🏛️",
  projects: "📋",
  fundraising: "💰",
  data: "🗄️",
  storage: "📁",
  email: "📧",
  analytics: "📈",
  linkedout: "🔗",
  network: "🌐",
  agents: "🤖",
  globe: "🌍",
  sentinel: "🛡️",
  settings: "⚙️",
  marketplace: "❤️",
}

const VIEW_DESCRIPTIONS: Partial<Record<ActiveView, string>> = {
  dashboard: "Overview of your workspace metrics and activity",
  chat: "Full AI toolkit for profiles, tribes, projects, and research",
  profiles: "Manage and analyze your professional network",
  tribes: "Build and organize collaborative teams",
  projects: "Track and manage ongoing initiatives",
  fundraising: "Campaigns, donors, donations, goals, and outreach",
  data: "Hub for all Supabase-backed data (profiles, tribes, projects, fundraising, files)",
  storage: "Files & assets — upload and manage files in Supabase Storage",
  email: "Communication center and outreach",
  analytics: "Deep insights and trend analysis",
  linkedout: "LinkedIn integration and automation",
  network: "Network visualization and insights",
  agents: "AI agent configuration and control",
  globe: "Geographic view of network and locations",
  sentinel: "Security and compliance monitoring",
  settings: "System configuration and preferences",
  marketplace: "Trade non-scalable human experiences, list offerings, and track fulfillment yield",
}

function getSuggestedPrompts(activeView: ActiveView, hasImportedProfiles: boolean): string[] {
  if (hasImportedProfiles) {
    return [
      "Analyze my imported profiles — summarize skills and tribe recommendations",
      "Form tribes from these profiles for collaboration",
      "What skill gaps exist in this dataset?",
    ]
  }
  const byView: Partial<Record<ActiveView, string[]>> = {
    profiles: [
      "Search for senior engineers with ML experience",
      "Who are the top connectors in my network?",
      "Suggest tribes from my profiles",
      "Add these profiles to a tribe and suggest a project for them",
      "Which of my tribes or projects fit this profile?",
    ],
    tribes: [
      "Form a tribe from my CRM profiles for a product launch",
      "Design tribes for this objective, create a project for the best fit, then suggest Share on LinkedIn or outreach",
      "Recommend a tribe composition for innovation",
      "List my tribes and suggest roles or members to add",
      "Analyze team dynamics and link this tribe to a project",
      "Suggest CRM profiles to add to this tribe",
      "Create a project for this tribe and recommend outreach",
    ],
    projects: [
      "Get CRM + AI candidate recommendations for my open roles",
      "Design tribes for this project, create one tribe, attach it, and suggest Share on LinkedIn or outreach",
      "Identify project skill gaps from current hiring positions",
      "Draft outreach notes for top shortlisted candidates",
      "Recommend tribes and CRM profiles for this project",
      "Who should I reach out to from LinkedOut for this role?",
    ],
    analytics: ["Summarize aspiration trends", "Top skills in my network"],
    network: ["Analyze network clusters", "Get talent recommendations"],
    dashboard: [
      "Summarize my dashboard metrics",
      "What should I focus on next?",
      "Help me set up the full stack (Supabase + LinkedIn)",
      "Walk me through Supabase Cloud setup",
      "I want to run with Docker — what do I need?",
      "Help me self-host Supabase with Docker",
      "Look up current best practices for X and compare with our talent pool",
    ],
    chat: [
      "Search profiles by skills and location",
      "Analyze network or suggest tribes",
      "Look up something and cite sources (web search + our data)",
      "Research a topic and combine with our CRM or project data",
      "What can you help me with?",
    ],
    linkedout: [
      "Find companies hiring in fintech",
      "Search jobs in San Francisco",
      "Build a custom objective for a hiring project",
      "Design tribes for this objective, create a project, and suggest Share on LinkedIn or outreach",
      "Connect this objective to a project and suggest a tribe",
      "Which of my CRM profiles or tribes should I target for this?",
    ],
    email: ["Summarize my recent email threads", "How do I connect Gmail or Outlook?", "Draft a short outreach email"],
    fundraising: [
      "Explain the Fundraising panel and how campaigns work",
      "How do I add donors or record donations?",
      "Where do I run email or LinkedIn outreach for fundraising?",
    ],
    data: [
      "What does the Data hub show?",
      "Where do I manage profiles vs tribes vs projects?",
      "Point me to the right panel for my task",
    ],
    storage: [
      "How do I upload files or campaign assets?",
      "Storage says bucket not set up — what do I run?",
    ],
    settings: [
      "How do I connect LinkedIn?",
      "How do I share a post on LinkedIn?",
      "Share on LinkedIn said 'try again later' — what does that mean?",
      "Where are credentials stored?",
      "Help me set up Supabase and the entire stack",
      "What goes in .env.local for Supabase and LinkedIn?",
      "Walk me through self-hosted Supabase with Docker",
    ],
    sentinel: [
      "What's the difference between compliance and real security?",
      "Why can't we turn off guardrails for convenience?",
      "Explain SENTINEL and the AEGIS Doctrine",
      "How do we shift from activity metrics to impact metrics?",
      "What should we measure for resilience, not just maturity?",
      "Why might zero incidents be a red flag?",
      "Analyze this suspicious screenshot for infostealer indicators",
      "Check if a URL is in our tribal immunity blacklist",
      "Detonate this suspicious link in a sandbox",
      "Run a Sovereign Audit for cracked software risks",
      "Audit port entropy for covert channel detection",
      "Profile an adversary by their stylometric fingerprint",
      "Cull zombie devices that missed their heartbeat",
      "Sync new threat indicators to tribal herd immunity",
    ],
    marketplace: [
      "What listings are available in the marketplace?",
      "Help me create a listing for a mentorship session",
      "Show my orders and fulfillment yield score",
      "What types of experiences can I trade?",
      "Explain how the Labor of Love marketplace works",
      "Show me active bounties I could submit to",
    ],
    agents: [
      "Discover agents with legal review capability across the network",
      "Initiate an A2A handshake to sub-contract a security audit",
      "Publish my agent as available for hire on the A2A network",
      "Show my active A2A handshakes and their status",
      "What agents are available in my tribe?",
      "Run an Intelligence Tariff audit on my most expensive API calls",
      "Evolve my agent harness to fix recent failures",
      "Launch a tribal Auto Research campaign",
      "Forge a world model for my environment",
      "Simulate 1000 imaginary rollouts for this tribal mission",
      "Check for surprise events in my sensor data",
      "Execute a permissionless launch using deregulated policy sections",
      "Stake tokens to a lunar build phase mission",
      "Monitor supply chain vendors for slippage",
      "Initialize Agent #0 for recursive self-optimization",
      "Calibrate the alignment vector to prioritize energy sovereignty",
      "Distill tribal intelligence into local model weights",
      "Browse a website visually using Molmo local vision",
      "Compile my intent into invisible WebAssembly code",
      "Deploy a consultant agent for regulatory strategy",
      "Audit a contact for proxy influence or hidden bias",
      "Verify a meeting request for diplomatic legitimacy",
      "Calculate diplomatic refund for wasted executive time",
      "Audit a vendor for agentic friction and lock-in tariff",
      "Provision a sovereign MCP server on local hardware",
      "Certify an agent's intent with biometric pulse",
      "Audit institutional accountability gaps for a subject",
      "Reconstruct hidden narrative from redacted dataset",
      "Run network hygiene report on my connections",
    ],
    globe: [
      "Show me governance arcs for active proposals",
      "Where are marketplace hotspots for in-person experiences?",
      "Visualize trade routes between sovereign factories",
    ],
  }
  return byView[activeView] ?? [
    "Search profiles by skills and location",
    "Analyze network or suggest tribes",
    "What can you help me with on this page?",
  ]
}

export interface AssistantDrawerProps {
  activeView: ActiveView
  csvData: string | null
  importLabel?: string | null
  pageContext?: Record<string, string | number | boolean | null>
  onNavigate?: (view: ActiveView) => void
}

export function AssistantDrawer({ activeView, csvData, importLabel, pageContext, onNavigate }: AssistantDrawerProps) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [selectedPersonaId, setSelectedPersonaId] = useState("hr-director")
  const [showPersonaMenu, setShowPersonaMenu] = useState(false)
  const [isHoveringFab, setIsHoveringFab] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const handledDesignPreviewKeysRef = useRef<Set<string>>(new Set())

  const selectedPersona = PERSONAS.find((p) => p.id === selectedPersonaId) ?? PERSONAS[0]

  useEffect(() => {
    setAccessToken(resolveSupabaseAccessToken())
    const onStorage = () => setAccessToken(resolveSupabaseAccessToken())
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, setInput, stop, reload } = useChat({
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

  useEffect(() => {
    const handledKeys = handledDesignPreviewKeysRef.current
    const messageList = Array.isArray(messages) ? (messages as unknown[]) : []

    for (let messageIndex = 0; messageIndex < messageList.length; messageIndex++) {
      const message = messageList[messageIndex]
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        continue
      }

      const messageRecord = message as Record<string, unknown>
      const messageId =
        typeof messageRecord.id === "string" && messageRecord.id.length > 0
          ? messageRecord.id
          : `msg-${messageIndex}`
      const parts = Array.isArray(messageRecord.parts) ? messageRecord.parts : []

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

  // Auto-focus input when drawer opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open])

  useEffect(() => {
    if (open && messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
    }
  }, [open, messages.length])

  // Click outside to close persona menu
  useEffect(() => {
    if (!showPersonaMenu) return
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-persona-menu]")) {
        setShowPersonaMenu(false)
      }
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [showPersonaMenu])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        setOpen(false)
        return
      }
      if (e.key !== "Enter" || e.shiftKey) return
      e.preventDefault()
      if (input.trim() && !isLoading) handleSubmit()
    },
    [input, isLoading, handleSubmit],
  )

  // Keyboard shortcut to open/close
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      // Cmd/Ctrl + Shift + K to expand
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault()
        if (open) setExpanded((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [open])

  const viewLabel = VIEW_LABELS[activeView] ?? activeView
  const viewIcon = VIEW_ICONS[activeView] ?? "📄"
  const viewDescription = VIEW_DESCRIPTIONS[activeView] ?? "Context-aware AI assistance"
  
  const contextSummary = useMemo(() => {
    if (!pageContext || Object.keys(pageContext).length === 0) return null
    return Object.entries(pageContext)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ")
  }, [pageContext])

  const contextCount = useMemo(() => {
    if (!pageContext) return 0
    return Object.values(pageContext).filter((v) => v != null && v !== "").length
  }, [pageContext])

  const shouldHideFloatingAssistant = activeView === "chat"

  useEffect(() => {
    if (shouldHideFloatingAssistant && open) {
      setOpen(false)
    }
  }, [open, shouldHideFloatingAssistant])

  // Message count for badge
  const messageCount = messages.filter((m) => m.role === "assistant").length

  const handleCopyMessage = useCallback((messageId: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedMessageId(messageId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }, [])

  const handleRegenerateLastResponse = useCallback(() => {
    if (messages.length > 0 && !isLoading) {
      reload()
    }
  }, [messages.length, isLoading, reload])

  if (shouldHideFloatingAssistant) {
    return null
  }

  return (
    <TooltipProvider>
      {/* Floating action button with enhanced styling and animations */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            onMouseEnter={() => setIsHoveringFab(true)}
            onMouseLeave={() => setIsHoveringFab(false)}
            className={cn(
              "fixed bottom-20 right-4 z-40 flex items-center justify-center rounded-full shadow-lg transition-all duration-300 sm:bottom-6 sm:left-[15.5rem] sm:right-auto",
              "bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground",
              "hover:from-primary/95 hover:via-primary/85 hover:to-primary/75",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
              "hover:scale-110 hover:shadow-2xl hover:shadow-primary/30",
              "before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-t before:from-white/0 before:to-white/20 before:opacity-0 hover:before:opacity-100 before:transition-opacity",
              isHoveringFab ? "h-14 w-auto px-4 gap-2" : "h-14 w-14",
              isLoading && "animate-pulse",
            )}
            aria-label="Open AI Assistant (⌘K)"
          >
            <MessageSquare className={cn(
              "h-6 w-6 transition-all duration-200 relative z-10",
              isHoveringFab && "scale-90",
              isLoading && "animate-bounce"
            )} />
            {isHoveringFab && (
              <span className="text-sm font-medium whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200 relative z-10">
                AI Assistant
              </span>
            )}
            {messageCount > 0 && !isHoveringFab && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-background animate-in zoom-in duration-200">
                {messageCount > 9 ? "9+" : messageCount}
              </span>
            )}
            {/* Pulse ring effect */}
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-75" style={{ animationDuration: "2s" }} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="bg-card border-border">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <p className="text-sm font-medium">Open AI Assistant</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">⌘K to toggle · ⌘⇧K to expand</p>
        </TooltipContent>
      </Tooltip>

      {/* Drawer overlay with enhanced blur effect */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md animate-in fade-in duration-300"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer panel with enhanced animations and styling */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-0 right-0 z-50 flex h-full flex-col border-l border-border/50 bg-background/98 backdrop-blur-xl shadow-2xl transition-all duration-300 ease-out",
          expanded ? "w-full max-w-[720px]" : "w-full max-w-[440px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="AI Assistant"
        aria-modal="true"
      >
        {/* Header with enhanced gradient accent */}
        <div className="relative shrink-0 flex flex-col gap-3 border-b border-border/50 px-4 py-4 bg-gradient-to-b from-primary/8 via-primary/4 to-transparent">
          {/* Decorative gradient orb */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-center justify-between gap-2 relative">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/15 to-primary/5 ring-1 ring-primary/25 shadow-lg shadow-primary/10">
                <Bot className="h-5.5 w-5.5 text-primary" />
                <Sparkles className="absolute -top-1.5 -right-1.5 h-4 w-4 text-primary animate-pulse" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  AI Assistant
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium bg-card/50 border-border/50">
                    <span className="mr-1">{viewIcon}</span>
                    {viewLabel}
                  </Badge>
                </h2>
                <p className="text-[11px] text-muted-foreground truncate max-w-[220px] flex items-center gap-1.5" title={contextSummary ?? viewDescription}>
                  {contextCount > 0 && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                      {contextCount}
                    </span>
                  )}
                  {contextSummary ?? viewDescription}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 hover:bg-primary/10 hover:text-primary" 
                        onClick={handleRegenerateLastResponse}
                        disabled={isLoading}
                      >
                        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Regenerate response</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" 
                        onClick={() => setMessages([])}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Clear conversation</TooltipContent>
                  </Tooltip>
                </>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-secondary" 
                    onClick={() => setExpanded((prev) => !prev)}
                    aria-label={expanded ? "Collapse" : "Expand"}
                  >
                    {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{expanded ? "Collapse (⌘⇧K)" : "Expand (⌘⇧K)"}</TooltipContent>
              </Tooltip>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" 
                onClick={() => setOpen(false)} 
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Enhanced controls row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" data-persona-menu>
              <button
                type="button"
                onClick={() => setShowPersonaMenu((v) => !v)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-xs transition-all",
                  "hover:bg-secondary hover:border-primary/40 hover:shadow-md",
                  showPersonaMenu && "border-primary/60 bg-primary/5 shadow-md"
                )}
              >
                <span 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ring-2 ring-white/30 shadow-sm" 
                  style={{ background: `linear-gradient(135deg, ${selectedPersona.color}, ${selectedPersona.color}dd)` }}
                >
                  {selectedPersona.avatar}
                </span>
                <span className="text-foreground font-medium">{selectedPersona.name}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-200", showPersonaMenu && "rotate-180")} />
              </button>
              {showPersonaMenu && (
                <div className="absolute top-full left-0 mt-2 w-72 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl z-10 py-2 animate-in fade-in slide-in-from-top-3 duration-200">
                  <p className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Bot className="h-3 w-3" />
                    Select Persona
                  </p>
                  <div className="max-h-64 overflow-y-auto">
                    {PERSONAS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPersonaId(p.id)
                          setShowPersonaMenu(false)
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left text-xs transition-all duration-150",
                          "hover:bg-secondary/80",
                          selectedPersonaId === p.id && "bg-primary/10",
                        )}
                      >
                        <span 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white ring-2 ring-white/30 shadow-md shrink-0" 
                          style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}dd)` }}
                        >
                          {p.avatar}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={cn("block truncate font-semibold", selectedPersonaId === p.id && "text-primary")}>{p.name}</span>
                          {p.description && (
                            <span className="block text-[10px] text-muted-foreground truncate mt-0.5">{p.description}</span>
                          )}
                        </div>
                        {selectedPersonaId === p.id && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {importLabel && (
              <Badge variant="secondary" className="gap-1.5 text-[10px] px-2.5 py-1.5 bg-secondary/80 border-border/40">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span className="truncate max-w-[140px] font-medium">{importLabel}</span>
              </Badge>
            )}
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 text-[11px] hover:bg-primary/10 hover:border-primary/40 hover:text-primary"
                onClick={() => {
                  setOpen(false)
                  onNavigate("chat")
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                Full View
              </Button>
            )}
          </div>
        </div>

        {/* Messages area with improved styling and animations */}
        <ScrollArea className="flex-1 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center gap-6">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/25 via-primary/15 to-primary/5 ring-1 ring-primary/25 shadow-xl shadow-primary/10">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-card border-2 border-background shadow-lg">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="space-y-2 max-w-[320px]">
                <p className="text-base text-foreground font-semibold">
                  How can I help with {viewLabel}?
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {viewDescription}. I can help with profiles, tribes, analytics, and more.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 w-full max-w-sm">
                {getSuggestedPrompts(activeView, !!csvData).map((prompt, idx) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className={cn(
                      "group text-left text-xs px-4 py-3.5 rounded-xl border border-border/60 bg-card/60 transition-all duration-200",
                      "hover:bg-primary/5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:scale-[1.02]",
                      "text-muted-foreground hover:text-foreground",
                      "animate-in fade-in slide-in-from-bottom-3",
                    )}
                    style={{ animationDelay: `${idx * 60}ms`, animationFillMode: "both" }}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] group-hover:bg-primary/20 transition-colors">
                        →
                      </span>
                      <span className="flex-1">{prompt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 pb-4">
              {messages.map((msg, idx) => (
                <div 
                  key={msg.id} 
                  className={cn(
                    "group relative animate-in fade-in slide-in-from-bottom-3",
                    msg.role === "assistant" && "pr-8"
                  )}
                  style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "both" }}
                >
                  <ChatMessageBubble message={msg as MessageType} />
                  {msg.role === "assistant" && (
                    <div className="absolute top-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-secondary"
                            onClick={() => handleCopyMessage(msg.id, typeof msg.content === "string" ? msg.content : "")}
                          >
                            {copiedMessageId === msg.id ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">{copiedMessageId === msg.id ? "Copied!" : "Copy message"}</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground p-4 rounded-xl bg-muted/30 border border-border/40 animate-in fade-in slide-in-from-bottom-2">
                  <div className="relative">
                    <span 
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white" 
                      style={{ background: selectedPersona.color }}
                    >
                      {selectedPersona.avatar}
                    </span>
                    <Loader2 className="absolute -bottom-1 -right-1 h-4 w-4 animate-spin text-primary bg-background rounded-full" />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-foreground">{selectedPersona.name}</span>
                    <span className="text-muted-foreground"> is thinking</span>
                    <span className="inline-flex ml-1">
                      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                    </span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-[10px] hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40" 
                    onClick={stop}
                  >
                    Stop
                  </Button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input area with enhanced styling */}
        <div className="shrink-0 border-t border-border/50 p-4 bg-gradient-to-t from-muted/40 via-muted/20 to-transparent">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (input.trim() && !isLoading) handleSubmit(e)
            }}
            className="flex gap-3 items-end"
          >
            <div className="relative flex-1">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${selectedPersona.name} about ${viewLabel}...`}
                className={cn(
                  "min-h-[52px] max-h-36 resize-none text-sm pr-4 transition-all rounded-xl",
                  "bg-card/80 border-border/60",
                  "focus:ring-2 focus:ring-primary/25 focus:border-primary/50",
                  "placeholder:text-muted-foreground/60",
                )}
                rows={1}
              />
            </div>
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              size="icon"
              className={cn(
                "h-[52px] w-[52px] shrink-0 rounded-xl transition-all duration-200",
                "bg-gradient-to-br from-primary via-primary/95 to-primary/85",
                "hover:from-primary/95 hover:via-primary/90 hover:to-primary/80 hover:shadow-lg hover:shadow-primary/25",
                "disabled:from-muted disabled:via-muted disabled:to-muted disabled:shadow-none",
                "active:scale-95",
              )}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </form>
          <div className="flex items-center justify-between mt-3 px-1">
            <p className="text-[10px] text-muted-foreground flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded-md bg-muted/80 text-[9px] font-mono border border-border/40">Enter</kbd>
              <span>send</span>
              <span className="text-border">·</span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-muted/80 text-[9px] font-mono border border-border/40">Shift+Enter</kbd>
              <span>new line</span>
              <span className="text-border">·</span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-muted/80 text-[9px] font-mono border border-border/40">Esc</kbd>
              <span>close</span>
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" />
              <span>Full toolkit active</span>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
