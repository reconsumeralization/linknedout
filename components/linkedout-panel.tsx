"use client"

import type { ActiveView } from "@/app/page"
import { CrmTalentNav } from "@/components/crm-talent-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { parseLinkedInCsv } from "@/lib/csv/csv-parser"
import { toSafeLinkedInUrl } from "@/lib/security/security-url"
import { fetchSupabaseProfiles, subscribeToProfiles, type SupabaseProfileView } from "@/lib/supabase/supabase-data"
import { cn } from "@/lib/shared/utils"
import {
  AlertCircle,
  Building2,
  Copy,
  Download,
  Filter,
  Linkedin,
  LinkIcon,
  LinkIcon as LinkMatch,
  Moon,
  Network,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type ObjectiveId = "cyber" | "investors" | "buyers" | "podcast" | "hiring" | "custom"
type QueueFilter = "all" | "intro" | "nurture" | "curate"
type ViewMode = "queue" | "gems" | "cull"

interface UnifiedProfile {
  id: string
  firstName: string
  lastName: string
  headline: string
  company: string
  location: string
  industry: string
  connections: number
  skills: string[]
  matchScore: number
  seniority: string
  tribe?: string
  linkedinUrl?: string
  connectedOn?: string
}

interface ConciergeInsight {
  profile: UnifiedProfile
  score: number
  intentFit: number
  relationshipStrength: number
  freshness: number
  action: "intro" | "nurture" | "curate"
  reasons: string[]
  outreachNote: string
}

interface ObjectiveConfig {
  id: ObjectiveId
  label: string
  keywords: string[]
  industries: string[]
  skills: string[]
  notePrefix: string
}

interface OutreachLogEntry {
  profileId: string
  timestamp: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DAILY_LIMIT = 10
const OUTREACH_LOG_KEY = "linkedout_outreach_log"
const LINKEDOUT_OBJECTIVE_SEED_KEY = "linkedout_objective_seed"

type LinkedOutObjectiveSeed = {
  label?: unknown
  keywords?: unknown
  industries?: unknown
  skills?: unknown
  notePrefix?: unknown
  searchQuery?: unknown
}

function normalizeSeedArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit)
}

function createObjectiveFromSeed(seed: LinkedOutObjectiveSeed): ObjectiveConfig | null {
  const label = typeof seed.label === "string" ? seed.label.trim().slice(0, 80) : ""
  if (!label) {
    return null
  }

  const keywords = normalizeSeedArray(seed.keywords, 12)
  const industries = normalizeSeedArray(seed.industries, 12)
  const skills = normalizeSeedArray(seed.skills, 15)
  const notePrefixRaw =
    typeof seed.notePrefix === "string"
      ? seed.notePrefix.trim()
      : ""

  return {
    id: "custom",
    label,
    keywords,
    industries,
    skills,
    notePrefix: notePrefixRaw || "I am curating a high-fit shortlist and thought of you",
  }
}

const BASE_OBJECTIVES: ObjectiveConfig[] = [
  {
    id: "cyber",
    label: "Cyber Partners",
    keywords: ["security", "cyber", "zero trust", "risk", "compliance", "ciso"],
    industries: ["security", "cyber", "defense", "technology", "it"],
    skills: ["Security", "Zero Trust", "Compliance", "Risk", "Cloud", "Network"],
    notePrefix: "I am curating a cyber resilience circle and thought of you",
  },
  {
    id: "investors",
    label: "Investors",
    keywords: ["investor", "venture", "capital", "fund", "partner", "private equity"],
    industries: ["venture", "capital", "finance", "investment", "bank"],
    skills: ["Fundraising", "M&A", "Finance", "Growth", "Strategy"],
    notePrefix: "I am curating a strategic investor group and thought of you",
  },
  {
    id: "buyers",
    label: "Enterprise Buyers",
    keywords: ["cio", "cto", "procurement", "operations", "it director", "head of"],
    industries: ["enterprise", "software", "technology", "healthcare", "finance"],
    skills: ["Procurement", "Operations", "Transformation", "Security", "Leadership"],
    notePrefix: "I am mapping enterprise transformation leaders and thought of you",
  },
  {
    id: "podcast",
    label: "Podcast Guests",
    keywords: ["speaker", "author", "founder", "evangelist", "thought leader", "advisor"],
    industries: ["media", "technology", "education", "consulting"],
    skills: ["Leadership", "Storytelling", "Strategy", "AI", "Cybersecurity"],
    notePrefix: "I am lining up high-signal voices for upcoming episodes and thought of you",
  },
  {
    id: "hiring",
    label: "Hiring Targets",
    keywords: ["engineer", "architect", "product", "designer", "manager", "leader"],
    industries: ["technology", "data", "ai", "software", "design"],
    skills: ["Engineering", "Product", "Data", "Design", "Leadership"],
    notePrefix: "I am building a curated hiring bench and thought of you",
  },
]

const SENIORITY_WEIGHT: Array<{ match: string; value: number }> = [
  { match: "cxo", value: 24 },
  { match: "chief", value: 24 },
  { match: "vp", value: 21 },
  { match: "vice president", value: 21 },
  { match: "director", value: 17 },
  { match: "principal", value: 15 },
  { match: "staff", value: 13 },
  { match: "manager", value: 11 },
  { match: "lead", value: 10 },
  { match: "senior", value: 8 },
  { match: "mid", value: 6 },
]

// ─── Score helpers ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function toUnifiedProfile(profile: SupabaseProfileView): UnifiedProfile {
  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    headline: profile.headline,
    company: profile.company,
    location: profile.location,
    industry: profile.industry,
    connections: profile.connections,
    skills: profile.skills,
    matchScore: profile.matchScore,
    seniority: profile.seniority,
    tribe: profile.tribe,
    linkedinUrl: profile.linkedinUrl,
  }
}

function connectedFreshness(connectedOn?: string): number {
  if (!connectedOn) return 60
  const parsed = new Date(connectedOn)
  if (Number.isNaN(parsed.getTime())) return 60
  const days = Math.floor((Date.now() - parsed.getTime()) / 86400000)
  if (days <= 30) return 95
  if (days <= 180) return 82
  if (days <= 365) return 72
  if (days <= 730) return 58
  return 43
}

function daysSinceConnected(connectedOn?: string): number | null {
  if (!connectedOn) return null
  const parsed = new Date(connectedOn)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.floor((Date.now() - parsed.getTime()) / 86400000)
}

function normalizedConnections(connections: number): number {
  if (connections <= 0) return 12
  const scaled = Math.log10(connections + 10) * 34
  return clamp(Math.round(scaled), 12, 100)
}

function seniorityScore(seniority: string, headline: string): number {
  const text = `${seniority} ${headline}`.toLowerCase()
  const match = SENIORITY_WEIGHT.find((item) => text.includes(item.match))
  return match?.value || 8
}

function containsAny(haystack: string, needles: string[]): number {
  return needles.reduce((count, needle) => (haystack.includes(needle) ? count + 1 : count), 0)
}

function buildInsight(profile: UnifiedProfile, objective: ObjectiveConfig): ConciergeInsight {
  const haystack = `${profile.headline} ${profile.company} ${profile.industry}`.toLowerCase()
  const skillText = profile.skills.join(" ").toLowerCase()

  const keywordHits = containsAny(haystack, objective.keywords)
  const industryHit = containsAny(profile.industry.toLowerCase(), objective.industries) > 0
  const skillHits = containsAny(skillText, objective.skills.map((s) => s.toLowerCase()))
  const seniority = seniorityScore(profile.seniority, profile.headline)
  const freshness = connectedFreshness(profile.connectedOn)

  const intentFit = clamp(
    (industryHit ? 28 : 10) + keywordHits * 16 + skillHits * 11 + Math.round(seniority * 0.8),
    0,
    100,
  )

  const relationshipStrength = clamp(
    Math.round(
      profile.matchScore * 0.5 +
        normalizedConnections(profile.connections) * 0.35 +
        (profile.tribe ? 8 : 0) +
        (profile.linkedinUrl ? 7 : 0),
    ),
    0,
    100,
  )

  const score = clamp(
    Math.round(intentFit * 0.5 + relationshipStrength * 0.35 + freshness * 0.15),
    0,
    100,
  )

  const action: ConciergeInsight["action"] = score >= 78 ? "intro" : score >= 56 ? "nurture" : "curate"

  const reasons: string[] = []
  if (industryHit) reasons.push("Strong industry alignment")
  if (skillHits > 0) reasons.push(`${skillHits} relevant skill matches`)
  if (profile.connections >= 500) reasons.push(`Large network reach (${profile.connections.toLocaleString()})`)
  if (seniority >= 17) reasons.push(`Decision-maker seniority (${profile.seniority})`)
  if (profile.tribe) reasons.push(`Already mapped in tribe ${profile.tribe}`)
  if (reasons.length === 0) reasons.push("Keep warm for future relevance")

  const displayName = `${profile.firstName} ${profile.lastName}`.trim()
  const outreachNote = `Hi ${profile.firstName || displayName}, ${objective.notePrefix} based on your ${profile.headline || "recent work"}. Open to a short intro call next week?`

  return { profile, score, intentFit, relationshipStrength, freshness, action, reasons, outreachNote }
}

function objectiveById(id: ObjectiveId, objectives: ObjectiveConfig[]): ObjectiveConfig {
  return objectives.find((o) => o.id === id) || objectives[0]
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function loadOutreachLog(): OutreachLogEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(OUTREACH_LOG_KEY)
    return raw ? (JSON.parse(raw) as OutreachLogEntry[]) : []
  } catch {
    return []
  }
}

function saveOutreachLog(log: OutreachLogEntry[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(OUTREACH_LOG_KEY, JSON.stringify(log))
  } catch (e) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      console.warn("[linkedout] localStorage.setItem failed:", e)
    }
  }
}

function countTodayOutreach(log: OutreachLogEntry[]): number {
  const oneDayAgo = Date.now() - 86400000
  return log.filter((e) => e.timestamp > oneDayAgo).length
}

function lastOutreachTimestamp(log: OutreachLogEntry[], profileId: string): number | null {
  const entries = log.filter((e) => e.profileId === profileId)
  if (entries.length === 0) return null
  return Math.max(...entries.map((e) => e.timestamp))
}

function daysSince(timestamp: number): number {
  return Math.floor((Date.now() - timestamp) / 86400000)
}

// ─── ActionBadge ──────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: ConciergeInsight["action"] }) {
  const copy = action === "intro" ? "Priority Intro" : action === "nurture" ? "Nurture" : "Curation"
  return (
    <Badge
      variant="secondary"
      className={cn(
        "h-4 px-1.5 text-[9px] uppercase tracking-wide",
        action === "intro" && "bg-accent/15 text-accent",
        action === "nurture" && "bg-primary/15 text-primary",
        action === "curate" && "bg-muted text-muted-foreground",
      )}
    >
      {copy}
    </Badge>
  )
}

// ─── InsightCard ──────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  copied,
  onCopy,
  limitReached,
  lastOutreachTs,
  onIntroduce,
  cullMode,
  selected,
  onToggleSelect,
}: {
  insight: ConciergeInsight
  copied: boolean
  onCopy: (text: string, profileId: string) => void
  limitReached: boolean
  lastOutreachTs: number | null
  onIntroduce: (profile: UnifiedProfile) => void
  cullMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const fullName = `${insight.profile.firstName} ${insight.profile.lastName}`.trim()
  const safeLinkedInUrl = toSafeLinkedInUrl(insight.profile.linkedinUrl)
  const sentDaysAgo = lastOutreachTs !== null ? daysSince(lastOutreachTs) : null

  return (
    <Card className={cn("bg-card border-border", selected && "border-destructive/60 bg-destructive/5")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {cullMode && onToggleSelect && (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggleSelect(insight.profile.id)}
                className="mt-0.5 shrink-0"
              />
            )}
            <div>
              <div className="text-sm font-semibold text-foreground">{fullName || "Unknown"}</div>
              <div className="text-xs text-muted-foreground">{insight.profile.headline || "No headline"}</div>
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" />
                {insight.profile.company || "Unknown company"}
                <span>•</span>
                {insight.profile.location || "Unknown location"}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <ActionBadge action={insight.action} />
            <div className="text-lg font-bold text-foreground mt-1">{insight.score}</div>
          </div>
        </div>

        {sentDaysAgo !== null && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-500">
            <AlertCircle className="w-3 h-3" />
            Note sent {sentDaysAgo === 0 ? "today" : `${sentDaysAgo}d ago`}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-secondary px-2 py-1.5">
            <div className="text-[10px] text-muted-foreground uppercase">Fit</div>
            <div className="text-xs font-semibold text-foreground">{insight.intentFit}</div>
          </div>
          <div className="rounded-md bg-secondary px-2 py-1.5">
            <div className="text-[10px] text-muted-foreground uppercase">Strength</div>
            <div className="text-xs font-semibold text-foreground">{insight.relationshipStrength}</div>
          </div>
          <div className="rounded-md bg-secondary px-2 py-1.5">
            <div className="text-[10px] text-muted-foreground uppercase">Freshness</div>
            <div className="text-xs font-semibold text-foreground">{insight.freshness}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {insight.reasons.slice(0, 3).map((reason) => (
            <Badge key={reason} variant="secondary" className="text-[10px]">
              {reason}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            disabled={limitReached && sentDaysAgo === null}
            onClick={() => onCopy(insight.outreachNote, insight.profile.id)}
            title={limitReached && sentDaysAgo === null ? `Daily limit of ${DEFAULT_DAILY_LIMIT} notes reached` : undefined}
          >
            <Copy className="w-3 h-3" />
            {copied ? "Copied" : limitReached && sentDaysAgo === null ? "Limit reached" : "Copy note"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => onIntroduce(insight.profile)}
          >
            <UserPlus className="w-3 h-3" />
            Introduce
          </Button>
          {safeLinkedInUrl ? (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" asChild>
              <a href={safeLinkedInUrl} target="_blank" rel="noopener noreferrer">
                <Linkedin className="w-3 h-3 text-[#0077b5]" />
                Open
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── IntroDialog ──────────────────────────────────────────────────────────────

function IntroDialog({
  source,
  profiles,
  onClose,
}: {
  source: UnifiedProfile
  profiles: UnifiedProfile[]
  onClose: () => void
}) {
  const [targetId, setTargetId] = useState<string>("")
  const [copied, setCopied] = useState(false)

  const otherProfiles = useMemo(() => profiles.filter((p) => p.id !== source.id), [profiles, source.id])
  const target = useMemo(() => otherProfiles.find((p) => p.id === targetId) || null, [otherProfiles, targetId])

  const introMessage = useMemo(() => {
    if (!target) return ""
    const sourceSkills = source.skills.slice(0, 2).join(" and ") || source.industry
    const targetSkills = target.skills.slice(0, 2).join(" and ") || target.industry
    return (
      `Hi ${source.firstName}, I wanted to connect you with ${target.firstName} ${target.lastName} — ` +
      `${target.headline || "a valued contact"} at ${target.company || "their company"}.\n\n` +
      `${target.firstName}'s background in ${targetSkills} aligns well with your work in ${sourceSkills}, ` +
      `and I think there's real value in you two connecting.\n\n` +
      `${target.firstName}, I've copied ${source.firstName} here — ${source.headline || "a strong contact of mine"} ` +
      `at ${source.company || "their company"}. Would love to see you both connect!`
    )
  }, [source, target])

  async function handleCopy() {
    if (!introMessage) return
    try {
      await navigator.clipboard.writeText(introMessage)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[linkedout] clipboard write failed:", e)
      }
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Introduce {source.firstName} {source.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Introduce to</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select a connection..." />
              </SelectTrigger>
              <SelectContent>
                {otherProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.firstName} {p.lastName} — {p.headline || p.company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {introMessage && (
            <div className="space-y-1.5">
              <Label className="text-xs">Generated introduction</Label>
              <Textarea
                readOnly
                value={introMessage}
                className="text-xs h-40 resize-none font-mono leading-relaxed"
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="text-xs h-8 gap-1.5" disabled={!introMessage} onClick={handleCopy}>
            <Copy className="w-3 h-3" />
            {copied ? "Copied!" : "Copy message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── CustomObjectiveDialog ────────────────────────────────────────────────────

function CustomObjectiveDialog({
  onSave,
  onClose,
}: {
  onSave: (obj: ObjectiveConfig) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({ label: "", keywords: "", industries: "", skills: "", notePrefix: "" })

  function handleSave() {
    if (!form.label.trim()) return
    onSave({
      id: "custom",
      label: form.label.trim(),
      keywords: form.keywords.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      industries: form.industries.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      notePrefix: form.notePrefix.trim() || "I am building a curated group and thought of you",
    })
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Custom Objective</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Label *</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. Quantum Experts"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Keywords (comma-separated)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. quantum, cryptography, post-quantum"
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Industries (comma-separated)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. defense, research, academia"
              value={form.industries}
              onChange={(e) => setForm((f) => ({ ...f, industries: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Skills (comma-separated)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. Cryptography, Quantum Computing, PKI"
              value={form.skills}
              onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Outreach note prefix</Label>
            <Textarea
              className="text-xs h-16 resize-none"
              placeholder="I am curating a group of quantum experts and thought of you"
              value={form.notePrefix}
              onChange={(e) => setForm((f) => ({ ...f, notePrefix: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="text-xs h-8" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="text-xs h-8" disabled={!form.label.trim()} onClick={handleSave}>
            Save objective
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── LinkedOutPanel ───────────────────────────────────────────────────────────

interface LinkedOutPanelProps {
  csvData: string | null
  onNavigate?: (view: ActiveView) => void
}

export function LinkedOutPanel({ csvData, onNavigate }: LinkedOutPanelProps) {
  const [objective, setObjective] = useState<ObjectiveId>("cyber")
  const [customObjective, setCustomObjective] = useState<ObjectiveConfig | null>(null)
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("queue")
  const [query, setQuery] = useState("")
  const [minScore, setMinScore] = useState(50)
  const [profiles, setProfiles] = useState<UnifiedProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [dataSource, setDataSource] = useState<"csv" | "supabase">("supabase")
  const [copiedProfileId, setCopiedProfileId] = useState<string | null>(null)
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([])
  const [selectedForCull, setSelectedForCull] = useState<Set<string>>(new Set())
  const [cullExported, setCullExported] = useState(false)
  const [introSource, setIntroSource] = useState<UnifiedProfile | null>(null)

  const objectives = useMemo(() => {
    const base = [...BASE_OBJECTIVES]
    if (customObjective) {
      const idx = base.findIndex((o) => o.id === "custom")
      if (idx >= 0) base[idx] = customObjective
      else base.push(customObjective)
    }
    return base
  }, [customObjective])

  const currentObjective = useMemo(() => objectiveById(objective, objectives), [objective, objectives])
  const todaySent = useMemo(() => countTodayOutreach(outreachLog), [outreachLog])
  const limitReached = todaySent >= DEFAULT_DAILY_LIMIT

  useEffect(() => {
    setOutreachLog(loadOutreachLog())
  }, [])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LINKEDOUT_OBJECTIVE_SEED_KEY)
      if (!raw) {
        return
      }

      const seed = JSON.parse(raw) as LinkedOutObjectiveSeed
      const seededObjective = createObjectiveFromSeed(seed)
      if (seededObjective) {
        setCustomObjective(seededObjective)
        setObjective("custom")
      }

      if (typeof seed.searchQuery === "string" && seed.searchQuery.trim()) {
        setQuery(seed.searchQuery.trim().slice(0, 100))
      }

      sessionStorage.removeItem(LINKEDOUT_OBJECTIVE_SEED_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const loadSupabaseProfiles = useCallback(async () => {
    setIsLoading(true)
    const rows = await fetchSupabaseProfiles()
    setProfiles((rows || []).map(toUnifiedProfile))
    setDataSource("supabase")
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (csvData) {
      const parsed = parseLinkedInCsv(csvData).map((item) => ({
        id: item.id,
        firstName: item.firstName,
        lastName: item.lastName,
        headline: item.headline,
        company: item.company,
        location: item.location,
        industry: item.industry,
        connections: item.connections,
        skills: item.skills,
        matchScore: item.matchScore,
        seniority: item.seniority,
        tribe: item.tribe,
        linkedinUrl: item.linkedinUrl,
        connectedOn: item.connectedOn,
      }))
      setProfiles(parsed)
      setDataSource("csv")
      setIsLoading(false)
      return
    }

    void loadSupabaseProfiles()
    const unsubscribe = subscribeToProfiles(() => {
      void loadSupabaseProfiles()
    })
    return () => {
      unsubscribe?.()
    }
  }, [csvData, loadSupabaseProfiles])

  const insights = useMemo(
    () => profiles.map((p) => buildInsight(p, currentObjective)).sort((a, b) => b.score - a.score),
    [profiles, currentObjective],
  )

  const filteredInsights = useMemo(() => {
    const q = query.trim().toLowerCase()
    return insights.filter((insight) => {
      if (insight.score < minScore) return false
      if (queueFilter !== "all" && insight.action !== queueFilter) return false
      if (!q) return true
      const s = `${insight.profile.firstName} ${insight.profile.lastName} ${insight.profile.company} ${insight.profile.headline} ${insight.profile.skills.join(" ")}`.toLowerCase()
      return s.includes(q)
    })
  }, [insights, minScore, queueFilter, query])

  const introQueue = useMemo(() => filteredInsights.filter((i) => i.action === "intro"), [filteredInsights])
  const nurtureQueue = useMemo(() => filteredInsights.filter((i) => i.action === "nurture"), [filteredInsights])
  const curationQueue = useMemo(() => filteredInsights.filter((i) => i.action === "curate"), [filteredInsights])

  // Sleeping Giants: relevant contacts gone dormant (connected 6+ months ago, high intent fit)
  const sleepingGiants = useMemo(
    () => insights.filter((i) => i.freshness <= 58 && i.intentFit >= 55).sort((a, b) => b.intentFit - a.intentFit),
    [insights],
  )

  const tribeOpportunities = useMemo(() => {
    const skillMap = new Map<string, { skill: string; count: number; contacts: Set<string> }>()
    for (const insight of filteredInsights.filter((i) => i.action !== "curate")) {
      for (const skill of insight.profile.skills.slice(0, 5)) {
        const key = skill.toLowerCase()
        const existing = skillMap.get(key)
        if (existing) {
          existing.count += 1
          existing.contacts.add(insight.profile.id)
        } else {
          skillMap.set(key, { skill, count: 1, contacts: new Set([insight.profile.id]) })
        }
      }
    }
    return Array.from(skillMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((item) => ({ ...item, contacts: item.contacts.size }))
  }, [filteredInsights])

  const handleCopy = useCallback(async (text: string, profileId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedProfileId(profileId)
      const entry: OutreachLogEntry = { profileId, timestamp: Date.now() }
      setOutreachLog((prev) => {
        const next = [...prev, entry]
        saveOutreachLog(next)
        return next
      })
      window.setTimeout(() => {
        setCopiedProfileId((cur) => (cur === profileId ? null : cur))
      }, 1600)
    } catch (e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[linkedout] clipboard write (copy profile) failed:", e)
      }
    }
  }, [])

  const handleToggleCull = useCallback((id: string) => {
    setSelectedForCull((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAllCull = useCallback(() => {
    const allIds = curationQueue.map((i) => i.profile.id)
    setSelectedForCull((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)))
  }, [curationQueue])

  const handleExportCull = useCallback(async () => {
    const lines = curationQueue
      .filter((i) => selectedForCull.has(i.profile.id))
      .map((i, idx) => {
        const name = `${i.profile.firstName} ${i.profile.lastName}`.trim()
        return `${idx + 1}. ${name} — ${i.profile.headline || "No headline"} @ ${i.profile.company || "Unknown"} (score: ${i.score})`
      })
      .join("\n")
    const text = `LinkedOut Cull List (${selectedForCull.size} connections)\n${"─".repeat(44)}\n${lines}\n\nReview each on LinkedIn and disconnect to free up connection slots.`
    try {
      await navigator.clipboard.writeText(text)
      setCullExported(true)
      window.setTimeout(() => setCullExported(false), 2000)
    } catch (e) {
      if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[linkedout] clipboard write (cull export) failed:", e)
      }
    }
  }, [curationQueue, selectedForCull])

  function handleObjectiveChange(value: string) {
    if (value === "custom") {
      setShowCustomDialog(true)
    } else {
      setObjective(value as ObjectiveId)
    }
  }

  function handleSaveCustomObjective(obj: ObjectiveConfig) {
    setCustomObjective(obj)
    setObjective("custom")
    setShowCustomDialog(false)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">LinkedOut Concierge</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Surface high-value connections, sleeping giants, and cull candidates from your network.
            </p>
            {onNavigate ? <CrmTalentNav activeView="linkedout" onNavigate={onNavigate} className="mt-2" /> : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase">
              source: {dataSource}
            </Badge>
            <Badge
              variant="secondary"
              className={cn(
                "h-5 px-2 text-[10px] uppercase",
                limitReached ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {todaySent}/{DEFAULT_DAILY_LIMIT} notes today
            </Badge>
          </div>
        </div>

        {/* Anti-spam warning */}
        {limitReached && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Daily outreach limit reached ({DEFAULT_DAILY_LIMIT} notes). Resume tomorrow to keep your LinkedIn account safe from spam detection.
          </div>
        )}

        {/* View mode tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-secondary w-fit">
          {(
            [
              { id: "queue", label: "Priority Queue", icon: Sparkles },
              {
                id: "gems",
                label: `Sleeping Giants${sleepingGiants.length > 0 ? ` (${sleepingGiants.length})` : ""}`,
                icon: Moon,
              },
              {
                id: "cull",
                label: `Cull Mode${curationQueue.length > 0 ? ` (${curationQueue.length})` : ""}`,
                icon: Trash2,
              },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                viewMode === id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Contacts</div>
              <div className="text-2xl font-bold text-foreground mt-1">{profiles.length.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Priority Intros</div>
              <div className="text-2xl font-bold text-accent mt-1">{introQueue.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sleeping Giants</div>
              <div className="text-2xl font-bold text-chart-3 mt-1">{sleepingGiants.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cull Candidates</div>
              <div className="text-2xl font-bold text-destructive/80 mt-1">{curationQueue.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters — queue mode only */}
        {viewMode === "queue" && (
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Objective</div>
                  <Select value={objective} onValueChange={handleObjectiveChange}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {objectives.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="text-xs">
                          {item.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs text-primary">
                        + Custom objective
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Queue</div>
                  <Select value={queueFilter} onValueChange={(v) => setQueueFilter(v as QueueFilter)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All</SelectItem>
                      <SelectItem value="intro" className="text-xs">Priority Intro</SelectItem>
                      <SelectItem value="nurture" className="text-xs">Nurture</SelectItem>
                      <SelectItem value="curate" className="text-xs">Curation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Min Score</div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={minScore}
                    onChange={(e) => setMinScore(clamp(Number(e.target.value) || 0, 0, 100))}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1 lg:col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Name, company, skill..."
                      className="h-8 text-xs pl-8"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Priority Queue View ── */}
        {viewMode === "queue" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-2 bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  Priority Queue
                </CardTitle>
                <CardDescription className="text-xs">
                  Top connections ranked for {currentObjective.label.toLowerCase()}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <div className="text-xs text-muted-foreground">Loading LinkedOut concierge queue...</div>
                ) : filteredInsights.length > 0 ? (
                  filteredInsights.slice(0, 12).map((insight) => (
                    <InsightCard
                      key={insight.profile.id}
                      insight={insight}
                      copied={copiedProfileId === insight.profile.id}
                      onCopy={handleCopy}
                      limitReached={limitReached}
                      lastOutreachTs={lastOutreachTimestamp(outreachLog, insight.profile.id)}
                      onIntroduce={setIntroSource}
                    />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    No contacts match your current filters.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Filter className="w-4 h-4 text-primary" />
                    Curation Snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {curationQueue.slice(0, 6).map((item) => (
                    <div key={item.profile.id} className="rounded-lg border border-border p-2">
                      <div className="text-xs font-medium text-foreground">
                        {item.profile.firstName} {item.profile.lastName}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{item.profile.headline || "No headline"}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        score {item.score} • {item.profile.company || "Unknown"}
                      </div>
                    </div>
                  ))}
                  {curationQueue.length === 0 && (
                    <div className="text-xs text-muted-foreground">No low-fit contacts in current filter range.</div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Network className="w-4 h-4 text-chart-3" />
                    Tribe Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tribeOpportunities.map((item) => (
                    <div key={item.skill} className="rounded-lg bg-secondary p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{item.skill}</span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{item.count} hits</Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {item.contacts} contacts can seed a tribe
                      </div>
                    </div>
                  ))}
                  {tribeOpportunities.length === 0 && (
                    <div className="text-xs text-muted-foreground">Insufficient skills data for clustering.</div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-chart-5" />
                    Queue Mix
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><LinkMatch className="w-3 h-3" /> Priority Intro</span>
                    <span className="font-semibold text-foreground">{introQueue.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><LinkIcon className="w-3 h-3" /> Nurture</span>
                    <span className="font-semibold text-foreground">{nurtureQueue.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Filter className="w-3 h-3" /> Curation</span>
                    <span className="font-semibold text-foreground">{curationQueue.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Linkedin className="w-3 h-3" /> With LinkedIn URL</span>
                    <span className="font-semibold text-foreground">{filteredInsights.filter((i) => Boolean(toSafeLinkedInUrl(i.profile.linkedinUrl))).length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Companies</span>
                    <span className="font-semibold text-foreground">{new Set(filteredInsights.map((i) => i.profile.company).filter(Boolean)).size}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── Sleeping Giants View ── */}
        {viewMode === "gems" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-chart-3/30 bg-chart-3/10 px-3 py-2 text-xs text-chart-3">
              <Moon className="w-3.5 h-3.5 shrink-0" />
              High-relevance contacts you haven't engaged in 6+ months. Re-engaging dormant connections is one of the highest-ROI moves in network management.
            </div>
            {isLoading ? (
              <div className="text-xs text-muted-foreground">Loading...</div>
            ) : sleepingGiants.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                No sleeping giants found. Either all high-value connections are fresh, or no connection dates are available in your data.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {sleepingGiants.map((insight) => {
                  const days = daysSinceConnected(insight.profile.connectedOn)
                  return (
                    <Card key={insight.profile.id} className="bg-card border-border">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {insight.profile.firstName} {insight.profile.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground">{insight.profile.headline || "No headline"}</div>
                            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                              <Building2 className="w-3 h-3" />
                              {insight.profile.company || "Unknown"}
                              {days !== null && (
                                <>
                                  <span>•</span>
                                  <Moon className="w-3 h-3 text-chart-3" />
                                  <span className="text-chart-3">{days}d dormant</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge variant="secondary" className="h-4 px-1.5 text-[9px] bg-chart-3/15 text-chart-3 uppercase">
                              Sleeping Giant
                            </Badge>
                            <div className="text-lg font-bold text-foreground mt-1">{insight.intentFit}</div>
                            <div className="text-[9px] text-muted-foreground">intent fit</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {insight.reasons.slice(0, 2).map((r) => (
                            <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            disabled={limitReached && lastOutreachTimestamp(outreachLog, insight.profile.id) === null}
                            onClick={() => handleCopy(insight.outreachNote, insight.profile.id)}
                          >
                            <Copy className="w-3 h-3" />
                            {copiedProfileId === insight.profile.id ? "Copied" : "Copy re-engage note"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => setIntroSource(insight.profile)}
                          >
                            <UserPlus className="w-3 h-3" />
                            Introduce
                          </Button>
                          {(() => {
                            const safeLinkedInUrl = toSafeLinkedInUrl(insight.profile.linkedinUrl)
                            if (!safeLinkedInUrl) {
                              return null
                            }
                            return (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" asChild>
                                <a href={safeLinkedInUrl} target="_blank" rel="noopener noreferrer">
                                  <Linkedin className="w-3 h-3 text-[#0077b5]" />
                                  Open
                                </a>
                              </Button>
                            )
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Cull Mode View ── */}
        {viewMode === "cull" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex-1 min-w-0">
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                {curationQueue.length} low-fit connections identified. Select and export a cull list, then disconnect on LinkedIn to free up slots for better connections.
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSelectAllCull}>
                  {selectedForCull.size === curationQueue.length && curationQueue.length > 0 ? "Deselect all" : "Select all"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs gap-1.5"
                  disabled={selectedForCull.size === 0}
                  onClick={handleExportCull}
                >
                  <Download className="w-3 h-3" />
                  {cullExported ? "Copied!" : `Export${selectedForCull.size > 0 ? ` (${selectedForCull.size})` : ""}`}
                </Button>
              </div>
            </div>
            {isLoading ? (
              <div className="text-xs text-muted-foreground">Loading...</div>
            ) : curationQueue.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                No cull candidates at current score threshold. Lower the minimum score in Queue mode to surface more.
              </div>
            ) : (
              <div className="space-y-3">
                {curationQueue.map((insight) => (
                  <InsightCard
                    key={insight.profile.id}
                    insight={insight}
                    copied={copiedProfileId === insight.profile.id}
                    onCopy={handleCopy}
                    limitReached={limitReached}
                    lastOutreachTs={lastOutreachTimestamp(outreachLog, insight.profile.id)}
                    onIntroduce={setIntroSource}
                    cullMode
                    selected={selectedForCull.has(insight.profile.id)}
                    onToggleSelect={handleToggleCull}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {introSource && (
        <IntroDialog source={introSource} profiles={profiles} onClose={() => setIntroSource(null)} />
      )}
      {showCustomDialog && (
        <CustomObjectiveDialog onSave={handleSaveCustomObjective} onClose={() => setShowCustomDialog(false)} />
      )}
    </div>
  )
}
