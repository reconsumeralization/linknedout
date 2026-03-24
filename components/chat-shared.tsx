"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/shared/utils"
import { Bot, Check, Copy, Loader2, Wrench } from "lucide-react"
import { useState } from "react"

export const TOOL_LABELS: Record<string, string> = {
  searchProfiles: "Searching Profiles",
  getProfileDetails: "Fetching Profile",
  getProfileConnections: "Getting Connections",
  searchCompanies: "Searching Companies",
  getCompanyEmployees: "Getting Employees",
  getSkillsAnalysis: "Analyzing Skills",
  searchJobs: "Searching Jobs",
  getConversations: "Getting Messages",
  sendMessage: "Sending Message",
  analyzeNetwork: "Analyzing Network",
  getRecommendations: "Getting Recommendations",
  getProfileViews: "Getting Analytics",
  analyzeCSVProfiles: "Analyzing CSV",
  sendConnectionRequest: "Sending Connection",
  searchGroups: "Searching Groups",
  postContent: "Publishing Post",
  getPostAnalytics: "Getting Post Stats",
  createTribe: "Forming Tribe",
  createTeamFromProfiles: "Forming Team",
  addProfilesToTribe: "Updating Tribe Members",
  listTribes: "Listing Tribes",
  createProject: "Creating Project",
  addProjectPosition: "Adding Position",
  addProjectMilestone: "Adding Milestone",
  listProjects: "Listing Projects",
  getProjectStatus: "Checking Projects",
  getProjectCrmInsights: "Scoring CRM Matches",
  setAspirationGoal: "Setting Goal",
  getAspirationInsights: "Analyzing Aspirations",
  createRapidFireDb: "Creating RapidFire DB",
  listRapidFireDbs: "Listing RapidFire DBs",
  createRapidFireCollection: "Creating Collection",
  upsertRapidFireDocument: "Saving Document",
  queryRapidFireDocuments: "Querying Documents",
}

export interface MessagePart {
  type: string
  text?: string
  toolInvocation?: { toolName?: string }
}

export interface MessageType {
  id: string
  role: string
  content?: string
  parts?: MessagePart[]
}

function ToolCallBadge({ toolName }: { toolName: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border text-[11px] text-muted-foreground w-fit">
      <Wrench className="w-3 h-3 text-accent" />
      <span>{TOOL_LABELS[toolName] ?? toolName}</span>
      <Loader2 className="w-2.5 h-2.5 animate-spin ml-0.5" />
    </div>
  )
}

export function ChatMessageBubble({ message }: { message: MessageType }) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"

  const copyText = () => {
    const text =
      message.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("") ?? message.content ?? ""
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const textContent =
    message.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") ?? (typeof message.content === "string" ? message.content : "") ?? ""

  const toolInvocations = message.parts?.filter((p) => p.type === "tool-invocation") ?? []

  if (!textContent && toolInvocations.length === 0) return null

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser ? (
        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-1 text-[10px] font-bold text-foreground">
          You
        </div>
      )}

      <div className={cn("flex flex-col gap-1.5 max-w-[85%]", isUser ? "items-end" : "items-start")}>
        {toolInvocations.map((tool, i) => (
          <ToolCallBadge key={`${message.id}-tool-${i}`} toolName={tool.toolInvocation?.toolName ?? ""} />
        ))}

        {textContent ? (
          <div
            className={cn(
              "group relative rounded-2xl px-4 py-3 text-sm leading-relaxed",
              isUser
                ? "bg-[var(--message-user)] text-[var(--message-user-foreground)] rounded-tr-sm"
                : "bg-[var(--message-ai)] text-[var(--message-ai-foreground)] rounded-tl-sm",
            )}
          >
            <div className="whitespace-pre-wrap break-words">{textContent}</div>
            {!isUser ? (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={copyText}
                aria-label="Copy message"
              >
                {copied ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
