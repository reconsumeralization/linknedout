"use client"

import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { CrmTalentNav } from "@/components/crm-talent-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import {
  LINKEDOUT_CREATE_PROJECT_SEED_KEY,
  LINKEDOUT_PROJECT_FOCUS_SEED_KEY,
  type ProjectCreateSeed,
  type ProjectFocusSeed,
} from "@/lib/shared/panel-navigation-seeds"
import { toSafeLinkedInUrl } from "@/lib/security/security-url"
import {
  type ProjectCrmCandidateRecommendationView,
  type ProjectCrmRecommendationSnapshot,
  type ProjectHiringSnapshot,
  type ProjectPositionView,
  fetchSupabaseProjectCrmRecommendations,
  fetchSupabaseProjectHiringSnapshot,
  fetchSupabaseProjects,
  submitProjectApplication,
  subscribeToProjectApplications,
  subscribeToProjectPositions,
  subscribeToProjects,
} from "@/lib/supabase/supabase-data"
import { cn } from "@/lib/shared/utils"
import type { ActiveView } from "@/app/page"
import {
  AlertTriangle,
  ArrowRight,
  Archive,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit,
  ExternalLink,
  Filter,
  FolderKanban,
  Layers,
  MoreHorizontal,
  Pause,
  Plus,
  Search,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

type ProjectStatus = "planned" | "active" | "completed" | "on-hold" | "archived" | "cancelled" | "paused" | "at-risk"
type ProjectType = "hiring" | "team-building" | "aspiration" | "tribe" | "network-expansion"

const projectTypes: Record<ProjectType, { label: string; color: string; icon: React.ReactNode }> = {
  hiring: { label: "Hiring", color: "bg-primary/15 text-primary", icon: <Users className="w-3 h-3" /> },
  "team-building": { label: "Team Building", color: "bg-accent/15 text-accent", icon: <Sparkles className="w-3 h-3" /> },
  aspiration: { label: "Aspiration", color: "bg-chart-3/15 text-chart-3", icon: <Star className="w-3 h-3" /> },
  tribe: { label: "Tribe", color: "bg-chart-5/15 text-chart-5", icon: <Target className="w-3 h-3" /> },
  "network-expansion": { label: "Network", color: "bg-chart-4/15 text-chart-4", icon: <TrendingUp className="w-3 h-3" /> },
}

const statusConfig: Record<ProjectStatus, { icon: React.ReactNode; label: string; color: string }> = {
  active: { icon: <div className="w-2 h-2 rounded-full bg-accent" />, label: "Active", color: "text-accent" },
  completed: { icon: <CheckCircle2 className="w-3.5 h-3.5 text-accent" />, label: "Completed", color: "text-accent" },
  paused: { icon: <Pause className="w-3.5 h-3.5 text-muted-foreground" />, label: "Paused", color: "text-muted-foreground" },
  "at-risk": { icon: <AlertTriangle className="w-3.5 h-3.5 text-destructive" />, label: "At Risk", color: "text-destructive" },
  planned: { icon: <Clock className="w-3.5 h-3.5 text-muted-foreground" />, label: "Planned", color: "text-muted-foreground" },
  "on-hold": { icon: <Pause className="w-3.5 h-3.5 text-muted-foreground" />, label: "On Hold", color: "text-muted-foreground" },
  archived: { icon: <Archive className="w-3.5 h-3.5 text-muted-foreground" />, label: "Archived", color: "text-muted-foreground" },
  cancelled: { icon: <div className="w-2 h-2 rounded-full bg-destructive/70" />, label: "Cancelled", color: "text-destructive/70" },
}

type Milestone = {
  title: string
  status: "pending" | "active" | "completed"
  dueDate: string
}

type MockProject = {
  id: string
  name: string
  description: string
  type: ProjectType
  status: ProjectStatus | "pending"
  progress: number
  profiles: number
  tribe?: string
  targetDate?: string
  tags: string[]
  milestones: Milestone[]
  nextAction: string
  aspirations?: string[]
  blockers?: string[]
  priority?: "low" | "medium" | "high" | "critical"
  owner?: string
  createdAt?: string
}

type ApplicationFeedback = {
  message: string
  tone: "success" | "error" | "muted"
}

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-chart-4/15 text-chart-4",
  high: "bg-primary/15 text-primary",
  critical: "bg-destructive/15 text-destructive",
}

function getDaysRemaining(targetDate?: string): { days: number; isOverdue: boolean } | null {
  if (!targetDate) return null
  const target = new Date(targetDate)
  const now = new Date()
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return { days: Math.abs(diff), isOverdue: diff < 0 }
}

export type PageContextUpdate = Record<string, string | number | boolean | null>

export interface ProjectsPanelProps {
  onNavigate?: (view: ActiveView) => void
  onPageContextChange?: (context: PageContextUpdate) => void
}

export function ProjectsPanel({ onNavigate, onPageContextChange }: ProjectsPanelProps = {}) {
  const [selectedId, setSelectedId] = useState<string>("")
  const [projects, setProjects] = useState<MockProject[]>([])
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false)
  const [dataSource, setDataSource] = useState<"supabase" | "none">("none")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterTribe, setFilterTribe] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "progress" | "date">("name")
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [hiringSnapshot, setHiringSnapshot] = useState<ProjectHiringSnapshot | null>(null)
  const [isLoadingHiring, setIsLoadingHiring] = useState(false)
  const [coverNotes, setCoverNotes] = useState<Record<string, string>>({})
  const [applyingPositionId, setApplyingPositionId] = useState<string | null>(null)
  const [applicationFeedback, setApplicationFeedback] = useState<Record<string, ApplicationFeedback>>({})
  const [crmRecommendations, setCrmRecommendations] = useState<ProjectCrmRecommendationSnapshot | null>(null)
  const [isLoadingCrmRecommendations, setIsLoadingCrmRecommendations] = useState(false)
  const [copiedOutreachKey, setCopiedOutreachKey] = useState<string | null>(null)

  // "Create Project" dialog
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectType, setNewProjectType] = useState("team-building")
  const [newProjectDesc, setNewProjectDesc] = useState("")
  const [newProjectDate, setNewProjectDate] = useState("")

  // "Add Milestone" dialog
  const [addMilestoneOpen, setAddMilestoneOpen] = useState(false)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("")
  const [newMilestoneDue, setNewMilestoneDue] = useState("")

  const handleUpdateProjectStatus = useCallback((projectId: string, status: ProjectStatus) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status } : p))
  }, [])

  const handleToggleMilestone = useCallback((projectId: string, milestoneIndex: number) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const milestones = p.milestones.map((m, i) =>
        i === milestoneIndex ? { ...m, status: m.status === "completed" ? "pending" as const : "completed" as const } : m
      )
      const completed = milestones.filter(m => m.status === "completed").length
      const progress = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0
      return { ...p, milestones, progress }
    }))
  }, [])

  const handleAddMilestone = useCallback(() => {
    if (!newMilestoneTitle.trim()) return
    setProjects(prev => prev.map(p => {
      if (p.id !== selectedId) return p
      const milestones = [
        ...p.milestones,
        { title: newMilestoneTitle.trim(), status: "pending" as const, dueDate: newMilestoneDue || new Date().toISOString().split("T")[0] },
      ]
      return { ...p, milestones }
    }))
    setNewMilestoneTitle("")
    setNewMilestoneDue("")
    setAddMilestoneOpen(false)
  }, [newMilestoneTitle, newMilestoneDue, selectedId])

  const handleCreateProject = useCallback(() => {
    if (!newProjectName.trim()) return
    const newProject: MockProject = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim(),
      description: newProjectDesc.trim() || "No description provided.",
      type: newProjectType as ProjectType,
      status: "planned",
      progress: 0,
      profiles: 0,
      targetDate: newProjectDate || undefined,
      tags: [],
      milestones: [],
      nextAction: "Define milestones and assign team members",
      priority: "medium",
      createdAt: new Date().toISOString().split("T")[0],
    }
    setProjects(prev => [...prev, newProject])
    setSelectedId(newProject.id)
    setNewProjectName("")
    setNewProjectDesc("")
    setNewProjectDate("")
    setCreateProjectOpen(false)
  }, [newProjectName, newProjectDesc, newProjectType, newProjectDate])

  const handleMarkNextActionDone = useCallback(() => {
    setProjects(prev => prev.map(p =>
      p.id === selectedId ? { ...p, nextAction: "All actions completed — define next steps" } : p
    ))
  }, [selectedId])

  const handleResolveBlocker = useCallback((projectId: string, blockerIndex: number) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId || !p.blockers) return p
      return { ...p, blockers: p.blockers.filter((_, i) => i !== blockerIndex) }
    }))
  }, [])

  const loadSupabaseProjects = useCallback(async () => {
    setIsLoadingSupabase(true)
    try {
      const supabaseProjects = await fetchSupabaseProjects()
      if (supabaseProjects && supabaseProjects.length > 0) {
        setProjects(supabaseProjects as MockProject[])
        setDataSource("supabase")
      } else {
        setProjects([])
        setDataSource("none")
      }
    } finally {
      setIsLoadingSupabase(false)
    }
  }, [])

  const loadHiringSnapshot = useCallback(async (projectId: string) => {
    if (!projectId) {
      setHiringSnapshot(null)
      return
    }

    setIsLoadingHiring(true)
    const snapshot = await fetchSupabaseProjectHiringSnapshot(projectId)
    setHiringSnapshot(snapshot)
    setIsLoadingHiring(false)
  }, [])

  const loadProjectCrmRecommendations = useCallback(async (projectId: string) => {
    if (!projectId) {
      setCrmRecommendations(null)
      return
    }

    setIsLoadingCrmRecommendations(true)
    try {
      const snapshot = await fetchSupabaseProjectCrmRecommendations(projectId, 5)
      setCrmRecommendations(snapshot)
    } finally {
      setIsLoadingCrmRecommendations(false)
    }
  }, [])

  useEffect(() => {
    void loadSupabaseProjects()
    const unsubscribe = subscribeToProjects(() => {
      void loadSupabaseProjects()
    })

    return () => {
      unsubscribe?.()
    }
  }, [loadSupabaseProjects])

  useEffect(() => {
    if (!projects.some((project) => project.id === selectedId)) {
      setSelectedId(projects[0]?.id || "")
    }
  }, [projects, selectedId])

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

  useEffect(() => {
    void loadHiringSnapshot(selectedId)
    void loadProjectCrmRecommendations(selectedId)
  }, [loadHiringSnapshot, loadProjectCrmRecommendations, selectedId])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LINKEDOUT_CREATE_PROJECT_SEED_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as ProjectCreateSeed
      if (data?.suggestedName?.trim()) {
        setNewProjectName(data.suggestedName.trim())
        setNewProjectType(data.suggestedType ?? "team-building")
        setNewProjectDesc(data.suggestedDescription ?? "")
        setNewProjectDate(data.suggestedDate ?? "")
        setCreateProjectOpen(true)
      }
      sessionStorage.removeItem(LINKEDOUT_CREATE_PROJECT_SEED_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (projects.length === 0) {
      return
    }

    try {
      const raw = sessionStorage.getItem(LINKEDOUT_PROJECT_FOCUS_SEED_KEY)
      if (!raw) {
        return
      }

      const seed = JSON.parse(raw) as ProjectFocusSeed
      const match = projects.find((project) => {
        if (seed.projectId?.trim()) {
          return project.id === seed.projectId.trim()
        }
        if (seed.fallbackName?.trim()) {
          return project.name === seed.fallbackName.trim()
        }
        return false
      })

      if (match) {
        setSelectedId(match.id)
        sessionStorage.removeItem(LINKEDOUT_PROJECT_FOCUS_SEED_KEY)
      }
    } catch {
      sessionStorage.removeItem(LINKEDOUT_PROJECT_FOCUS_SEED_KEY)
    }
  }, [projects])

  useEffect(() => {
    if (!selectedId) {
      return
    }

    const reload = () => {
      void loadHiringSnapshot(selectedId)
      void loadProjectCrmRecommendations(selectedId)
    }

    const unsubscribePositions = subscribeToProjectPositions(reload)
    const unsubscribeApplications = subscribeToProjectApplications(reload)

    return () => {
      unsubscribePositions?.()
      unsubscribeApplications?.()
    }
  }, [loadHiringSnapshot, loadProjectCrmRecommendations, selectedId])

  const tribeOptions = useMemo(() => {
    const tribes = new Set<string>()
    projects.forEach(p => {
      if (p.tribe?.trim()) tribes.add(p.tribe.trim())
    })
    return Array.from(tribes).sort()
  }, [projects])

  const filtered = useMemo(() => {
    return projects
      .filter(p => {
        const matchesStatus = filterStatus === "all" || p.status === filterStatus
        const matchesType = filterType === "all" || p.type === filterType
        const matchesTribe = filterTribe === "all" || (p.tribe?.trim() ?? "") === filterTribe
        const matchesSearch = searchQuery === "" ||
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (p.tribe?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
        return matchesStatus && matchesType && matchesTribe && matchesSearch
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name)
        if (sortBy === "progress") return b.progress - a.progress
        if (sortBy === "date") {
          if (!a.targetDate) return 1
          if (!b.targetDate) return -1
          return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
        }
        return 0
      })
  }, [filterStatus, filterType, filterTribe, projects, searchQuery, sortBy])

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter(p => p.status === "active").length,
    completed: projects.filter(p => p.status === "completed").length,
    atRisk: projects.filter(p => p.status === "at-risk" || (p.blockers && p.blockers.length > 0)).length,
  }), [projects])

  const selected = projects.find(p => p.id === selectedId) ?? projects[0]
  const positions = hiringSnapshot?.positions || []
  const rankedApplicationsByPosition = hiringSnapshot?.rankedApplicationsByPosition || {}
  const crmRecommendationsByPosition = useMemo(() => {
    const entries = crmRecommendations?.positions || []
    return new Map(entries.map((entry) => [entry.position.id, entry]))
  }, [crmRecommendations])

  const updateCoverNote = useCallback((positionId: string, value: string) => {
    setCoverNotes((current) => ({
      ...current,
      [positionId]: value,
    }))
  }, [])

  const handleApply = useCallback(
    async (projectId: string, position: ProjectPositionView) => {
      if (!accessToken) {
        setApplicationFeedback((current) => ({
          ...current,
          [position.id]: {
            message: "Sign in with Supabase auth to submit an application.",
            tone: "error",
          },
        }))
        return
      }

      setApplyingPositionId(position.id)
      setApplicationFeedback((current) => ({
        ...current,
        [position.id]: {
          message: "",
          tone: "muted",
        },
      }))

      try {
        const result = await submitProjectApplication({
          accessToken,
          projectId,
          positionId: position.id,
          coverNote: coverNotes[position.id]?.trim() || undefined,
        })

        if (!result.ok) {
          setApplicationFeedback((current) => ({
            ...current,
            [position.id]: {
              message: result.error || "Could not submit application.",
              tone: "error",
            },
          }))
          return
        }

        if (result.alreadyApplied) {
          setApplicationFeedback((current) => ({
            ...current,
            [position.id]: {
              message: "Application already submitted for this position.",
              tone: "muted",
            },
          }))
        } else {
          setApplicationFeedback((current) => ({
            ...current,
            [position.id]: {
              message: "Application submitted. AI ranking has been refreshed.",
              tone: "success",
            },
          }))
        }

        await Promise.all([
          loadHiringSnapshot(projectId),
          loadProjectCrmRecommendations(projectId),
        ])
      } catch {
        setApplicationFeedback((current) => ({
          ...current,
          [position.id]: {
            message: "Unexpected error while submitting application.",
            tone: "error",
          },
        }))
      } finally {
        setApplyingPositionId(null)
      }
    },
    [accessToken, coverNotes, loadHiringSnapshot, loadProjectCrmRecommendations],
  )

  const handleCopyOutreachDraft = useCallback(
    async (position: ProjectPositionView, candidate: ProjectCrmCandidateRecommendationView) => {
      const project = projects.find((item) => item.id === selectedId)
      const projectName = project?.name || "this project"
      const candidateFirstName = candidate.firstName || candidate.fullName.split(" ")[0] || "there"
      const draft = [
        `Hi ${candidateFirstName},`,
        "",
        `I am building a shortlist for ${projectName} (${position.title}) and your profile stood out.`,
        `Your fit score is ${candidate.aiFitScore}% based on required skills, seniority, CRM match, and network strength.`,
        "",
        `Would you be open to a short intro call this week?`,
      ].join("\n")

      try {
        await navigator.clipboard.writeText(draft)
        const key = `${position.id}:${candidate.profileId}`
        setCopiedOutreachKey(key)
        window.setTimeout(() => {
          setCopiedOutreachKey((current) => (current === key ? null : current))
        }, 1600)
      } catch {
        /* ignore clipboard errors */
      }
    },
    [projects, selectedId],
  )

  const handleSendToLinkedOut = useCallback(
    (position: ProjectPositionView, candidate?: ProjectCrmCandidateRecommendationView) => {
      if (!onNavigate) {
        return
      }

      const project = projects.find((item) => item.id === selectedId)
      const projectName = project?.name || "Project Hiring"

      try {
        sessionStorage.setItem(
          "linkedout_objective_seed",
          JSON.stringify({
            label: `${projectName}: ${position.title}`.slice(0, 80),
            keywords: [position.title, ...position.requiredSkills].filter(Boolean).slice(0, 10),
            industries: [project?.type || "hiring"],
            skills: position.requiredSkills.slice(0, 12),
            notePrefix: candidate
              ? `I am curating candidates for ${projectName} and your ${candidate.headline || "background"} stood out`
              : `I am curating a shortlist for ${projectName} and thought of you`,
            searchQuery: candidate?.fullName || position.title,
          }),
        )
      } catch {
        /* ignore */
      }

      onNavigate("linkedout")
    },
    [onNavigate, projects, selectedId],
  )

  const typeInfo = selected ? projectTypes[selected.type as ProjectType] : null
  const statusInfo = selected ? statusConfig[selected.status as ProjectStatus] : null
  const daysRemaining = selected ? getDaysRemaining(selected.targetDate) : null
  const completedMilestones = selected ? selected.milestones.filter(m => m.status === "completed").length : 0
  const totalMilestones = selected ? selected.milestones.length : 0

  useEffect(() => {
    if (!onPageContextChange) return
    if (selected) {
      onPageContextChange({ projectId: selected.id, projectName: selected.name, tribe: selected.tribe ?? null })
    } else {
      onPageContextChange({})
    }
  }, [onPageContextChange, selected?.id, selected?.name, selected?.tribe])

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        <BrandedPanelHeader
          title="Projects"
          description="Track initiatives"
          icon={FolderKanban}
          right={onNavigate ? <CrmTalentNav activeView="projects" onNavigate={onNavigate} /> : undefined}
          compact
        />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Project List */}
        <div className="w-[320px] shrink-0 border-r border-border flex flex-col overflow-hidden bg-background/50">
          <div className="px-4 py-3 border-b border-border space-y-3 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground tracking-tight">Projects</span>
                  <Badge variant="secondary" className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px] font-medium">
                    {filtered.length}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {stats.active} active · {stats.completed} completed
                  </span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase font-normal">
                    {dataSource}
                  </Badge>
                </div>
                {onNavigate ? <CrmTalentNav activeView="projects" onNavigate={onNavigate} className="mt-2" /> : null}
                {isLoadingSupabase ? (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Syncing...
                  </p>
                ) : null}
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0 shadow-sm" onClick={() => setCreateProjectOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                New
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-sm bg-background border-border/80 placeholder:text-muted-foreground"
              />
            </div>

            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-0.5">Status</span>
                {["all", "active", "paused", "completed"].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition-colors",
                      filterStatus === s
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {tribeOptions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                  <button
                    onClick={() => setFilterTribe("all")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors flex items-center gap-1",
                      filterTribe === "all"
                        ? "bg-chart-5/20 text-chart-5"
                        : "bg-muted/80 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    All tribes
                  </button>
                  {tribeOptions.map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterTribe(t)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors truncate max-w-[120px]",
                        filterTribe === t
                          ? "bg-chart-5/20 text-chart-5"
                          : "bg-muted/80 text-muted-foreground hover:bg-muted"
                      )}
                      title={t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Filter className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setSortBy("name")}>
                    Sort by Name
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("progress")}>
                    Sort by Progress
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("date")}>
                    Sort by Due Date
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFilterType("all")}>
                    All Types
                  </DropdownMenuItem>
                  {Object.entries(projectTypes).map(([key, val]) => (
                    <DropdownMenuItem key={key} onClick={() => setFilterType(key)}>
                      {val.label}
                    </DropdownMenuItem>
                  ))}
                  {tribeOptions.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setFilterTribe("all")}>
                        All Tribes
                      </DropdownMenuItem>
                      {tribeOptions.map((t) => (
                        <DropdownMenuItem key={t} onClick={() => setFilterTribe(t)}>
                          <Layers className="w-3.5 h-3.5 mr-2" />
                          {t}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8 px-2">
                <FolderKanban className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {projects.length === 0 ? "No projects yet" : "No projects match filters"}
                </p>
                {projects.length === 0 && onNavigate && (
                  <div className="mt-3 space-y-1.5">
                    <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={() => setCreateProjectOpen(true)}>
                      <Plus className="w-3 h-3" />
                      Create first project
                    </Button>
                    <Button size="sm" variant="ghost" className="w-full gap-1.5 text-xs text-muted-foreground" onClick={() => onNavigate("tribes")}>
                      <Layers className="w-3 h-3" />
                      Go to Tribe Builder
                    </Button>
                    <Button size="sm" variant="ghost" className="w-full gap-1.5 text-xs text-muted-foreground" onClick={() => onNavigate("profiles")}>
                      <Users className="w-3 h-3" />
                      Go to Profiles CRM
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              filtered.map(proj => {
                const t = projectTypes[proj.type as ProjectType]
                const statusVal = proj.status as ProjectStatus
                const s = statusConfig[statusVal]
                const projDays = getDaysRemaining(proj.targetDate)
                const isSelected = selectedId === proj.id
                return (
                  <button
                    key={proj.id}
                    onClick={() => setSelectedId(proj.id)}
                    className={cn(
                      "w-full text-left rounded-xl border transition-all group relative overflow-hidden",
                      "pl-4 py-3.5 pr-3 border-l-4",
                      isSelected
                        ? "border-primary/50 border-l-primary bg-primary/8 shadow-sm"
                        : "border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/20",
                      proj.type === "hiring" && !isSelected && "border-l-primary/40",
                      proj.type === "tribe" && !isSelected && "border-l-chart-5/40",
                      proj.type === "aspiration" && !isSelected && "border-l-chart-3/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-foreground leading-tight line-clamp-1 flex-1 min-w-0">
                        {proj.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{s?.icon ?? null}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{s?.label}</p>
                          </TooltipContent>
                        </Tooltip>
                        <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isSelected && "text-primary", !isSelected && "group-hover:translate-x-0.5 opacity-70")} />
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2.5">
                      {proj.description}
                    </p>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="secondary" className={cn("h-5 px-1.5 text-[9px] gap-1", t?.color)}>
                        {t?.icon}
                        {t?.label}
                      </Badge>
                      {proj.tribe?.trim() && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[9px] gap-1 text-chart-5 border-chart-5/40">
                          <Layers className="w-2.5 h-2.5" />
                          {proj.tribe}
                        </Badge>
                      )}
                      {proj.priority && (
                        <Badge variant="secondary" className={cn("h-5 px-1.5 text-[9px] capitalize", priorityColors[proj.priority])}>
                          {proj.priority}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto">
                        <Users className="w-2.5 h-2.5" />
                        {proj.profiles}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Progress</span>
                        <span className="font-medium text-foreground">{proj.progress}%</span>
                      </div>
                      <Progress value={proj.progress} className="h-2 rounded-full" />
                    </div>
                    {projDays && (
                      <div className={cn(
                        "mt-2 text-[10px] flex items-center gap-1",
                        projDays.isOverdue ? "text-destructive" : "text-muted-foreground"
                      )}>
                        <Calendar className="w-2.5 h-2.5 shrink-0" />
                        {projDays.isOverdue ? `${projDays.days}d overdue` : `${projDays.days}d remaining`}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Project Detail */}
        <div className="flex-1 overflow-y-auto bg-muted/20">
          <div className="max-w-3xl mx-auto p-6 space-y-5">
            {!selected ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-4 ring-2 ring-border/50">
                  <FolderKanban className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {projects.length === 0 ? "Create your first project" : "Select a project"}
                </h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  {projects.length === 0
                    ? "Add a project to track hiring, team-building, or aspirations. Connect tribes and profiles from the CRM."
                    : "Choose a project from the list to view details, milestones, and hiring positions."}
                </p>
                <div className="mt-6 flex flex-wrap gap-3 justify-center">
                  {projects.length === 0 && onNavigate && (
                    <>
                      <Button size="default" className="gap-2 shadow-sm" onClick={() => setCreateProjectOpen(true)}>
                        <Plus className="w-4 h-4" />
                        Create project
                      </Button>
                      <Button size="default" variant="outline" className="gap-2" onClick={() => onNavigate("tribes")}>
                        <Layers className="w-4 h-4" />
                        Tribe Builder
                      </Button>
                      <Button size="default" variant="outline" className="gap-2" onClick={() => onNavigate("profiles")}>
                        <Users className="w-4 h-4" />
                        Profiles CRM
                      </Button>
                    </>
                  )}
                  {projects.length > 0 && (
                    <Button size="default" variant="outline" className="gap-2" onClick={() => setCreateProjectOpen(true)}>
                      <Plus className="w-4 h-4" />
                      New project
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
            {/* Header */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className={cn("text-xs gap-1", typeInfo?.color)}>
                      {typeInfo?.icon}
                      {typeInfo?.label}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn("text-xs capitalize gap-1", statusInfo?.color)}
                    >
                      {statusInfo?.icon}
                      {selected.status}
                    </Badge>
                    {selected.tribe?.trim() && (
                      <Badge variant="outline" className="text-xs gap-1 text-chart-5 border-chart-5/40">
                        <Layers className="w-3 h-3" />
                        {selected.tribe}
                      </Badge>
                    )}
                    {selected.priority && (
                      <Badge variant="secondary" className={cn("text-xs capitalize", priorityColors[selected.priority])}>
                        {selected.priority} priority
                      </Badge>
                    )}
                  </div>
                  <h1 className="text-xl font-bold text-foreground leading-tight">{selected.name}</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p>
                  {selected.owner && (
                    <p className="text-xs text-muted-foreground">
                      Owned by <span className="font-medium text-foreground">{selected.owner}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                    <Edit className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleUpdateProjectStatus(selected.id, "active")}>
                      <div className="w-3.5 h-3.5 mr-2 rounded-full bg-accent" />
                      Set Active
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleUpdateProjectStatus(selected.id, "paused")}>
                      <Pause className="w-3.5 h-3.5 mr-2" />
                      Pause
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleUpdateProjectStatus(selected.id, "completed")}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                      Mark Complete
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleUpdateProjectStatus(selected.id, "archived")}>
                      <Archive className="w-3.5 h-3.5 mr-2" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => {
                      setProjects(prev => prev.filter(p => p.id !== selected.id))
                      setSelectedId(projects.find(p => p.id !== selected.id)?.id ?? "")
                    }}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Progress",
                  value: `${selected.progress}%`,
                  subValue: `${completedMilestones}/${totalMilestones} milestones`,
                  icon: TrendingUp,
                  color: "text-primary",
                },
                {
                  label: "Profiles",
                  value: selected.profiles,
                  subValue: "people involved",
                  icon: Users,
                  color: "text-accent",
                },
                {
                  label: "Due Date",
                  value: selected.targetDate
                    ? new Date(selected.targetDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "-",
                  subValue: daysRemaining 
                    ? daysRemaining.isOverdue 
                      ? `${daysRemaining.days}d overdue`
                      : `${daysRemaining.days}d remaining`
                    : "No deadline",
                  icon: Calendar,
                  color: daysRemaining?.isOverdue ? "text-destructive" : "text-chart-3",
                },
                {
                  label: "Tribe",
                  value: selected.tribe ?? "-",
                  subValue: selected.tribe ? "assigned team" : "unassigned",
                  icon: Star,
                  color: "text-chart-5",
                },
              ].map((s) => {
                const Icon = s.icon
                const isTribeCard = s.label === "Tribe" && selected.tribe?.trim() && onNavigate
                return (
                  <Card key={s.label} className="bg-card border-border hover:shadow-md hover:border-muted-foreground/20 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
                        <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center">
                          <Icon className={cn("w-4 h-4", s.color)} />
                        </div>
                      </div>
                      <div className={cn("text-base font-bold truncate", s.color)}>
                        {String(s.value)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {s.subValue}
                      </div>
                      {isTribeCard && (
                        <Button size="sm" variant="ghost" className="mt-3 h-7 px-2 text-xs gap-1.5 text-chart-5 hover:text-chart-5 hover:bg-chart-5/10" onClick={() => onNavigate!("tribes")}>
                          <Layers className="w-3.5 h-3.5" />
                          View tribe
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Progress bar */}
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-foreground">Overall Progress</span>
                  <span className="text-sm font-bold text-primary">
                    {selected.progress}%
                  </span>
                </div>
                <Progress value={selected.progress} className="h-2.5" />
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>{completedMilestones} of {totalMilestones} milestones complete</span>
                  {daysRemaining && !daysRemaining.isOverdue && (
                    <span>{daysRemaining.days} days remaining</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Milestones */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Milestones</CardTitle>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setAddMilestoneOpen(true)}>
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {selected.milestones.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        m.status === "active" && "bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={m.status === "completed"}
                        onCheckedChange={() => handleToggleMilestone(selected.id, i)}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "text-sm block truncate",
                            m.status === "completed"
                              ? "line-through text-muted-foreground"
                              : m.status === "active"
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {m.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {new Date(m.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-4 px-1.5 text-[9px] capitalize",
                            m.status === "completed"
                              ? "bg-accent/15 text-accent"
                              : m.status === "active"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {m.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Next Action */}
            <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
                      Next Action
                    </div>
                    <p className="text-sm text-foreground font-medium">{selected.nextAction}</p>
                  </div>
                  <Button size="sm" variant="secondary" className="shrink-0 text-xs" onClick={handleMarkNextActionDone}>
                    Mark Done
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Hiring Pipeline */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Hiring Pipeline</CardTitle>
                  <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase">
                    {positions.filter((position) => position.status === "open").length} open
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Applications are correlated to CRM profiles and sorted with AI ranking.
                </p>
                {crmRecommendations ? (
                  <p className="text-[11px] text-muted-foreground">
                    AI scanned {crmRecommendations.profilePoolSize} CRM profiles for pre-screen recommendations.
                  </p>
                ) : null}
                {!accessToken ? (
                  <p className="text-[11px] text-muted-foreground">
                    Sign in to Supabase auth to submit applications.
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingHiring ? (
                  <p className="text-xs text-muted-foreground">Loading hiring data...</p>
                ) : null}

                {!isLoadingHiring && positions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      No positions are configured for this project yet.
                    </p>
                  </div>
                ) : null}

                {positions.map((position) => {
                  const rankedApplicants = rankedApplicationsByPosition[position.id] || []
                  const feedback = applicationFeedback[position.id]
                  const recommendation = crmRecommendationsByPosition.get(position.id)

                  return (
                    <div key={position.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground">{position.title}</h3>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "h-4 px-1.5 text-[9px] uppercase",
                                position.status === "open"
                                  ? "bg-accent/15 text-accent"
                                  : position.status === "closed"
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {position.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {position.description || "No position description yet."}
                          </p>
                        </div>
                        <div className="text-[11px] text-muted-foreground text-right">
                          <div>Openings: {position.openings}</div>
                          <div>Seniority: {position.seniority || "Any"}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {position.requiredSkills.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">No required skills listed.</span>
                        ) : (
                          position.requiredSkills.map((skill) => (
                            <Badge key={skill} variant="outline" className="text-[10px]">
                              {skill}
                            </Badge>
                          ))
                        )}
                      </div>

                      <div className="space-y-2">
                        <Textarea
                          placeholder="Optional cover note for this project position..."
                          value={coverNotes[position.id] || ""}
                          onChange={(event) => updateCoverNote(position.id, event.target.value)}
                          className="min-h-16 text-xs"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={position.status !== "open" || applyingPositionId === position.id}
                            onClick={() => {
                              void handleApply(selected.id, position)
                            }}
                          >
                            {applyingPositionId === position.id ? "Applying..." : "Apply"}
                          </Button>
                          {feedback?.message ? (
                            <p
                              className={cn(
                                "text-[11px]",
                                feedback.tone === "success"
                                  ? "text-accent"
                                  : feedback.tone === "error"
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {feedback.message}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-background/50 p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            AI Ranked Applicants
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {rankedApplicants.length} submitted
                          </span>
                        </div>
                        {rankedApplicants.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No applicants yet.</p>
                        ) : (
                          rankedApplicants.slice(0, 6).map((applicant, index) => (
                            <div key={applicant.id} className="rounded-md border border-border/60 bg-card p-2 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium text-foreground truncate">
                                  #{index + 1} {applicant.applicantName}
                                </p>
                                <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                                  AI {Math.round(applicant.aiScore)}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {applicant.applicantHeadline}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                CRM {applicant.applicantProfileId || "pending"} | Match {Math.round(applicant.matchScore)}% | Connections {applicant.connections}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">{applicant.aiSummary}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="rounded-lg border border-border/70 bg-background/50 p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                            <BrainCircuit className="w-3 h-3" />
                            CRM Bench + AI Match
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {recommendation?.candidateCount || 0} suggested
                          </span>
                        </div>

                        {recommendation?.topSkillGaps && recommendation.topSkillGaps.length > 0 ? (
                          <p className="text-[10px] text-muted-foreground">
                            Skill gaps: {recommendation.topSkillGaps.join(", ")}
                          </p>
                        ) : null}

                        {!isLoadingCrmRecommendations && !recommendation ? (
                          <p className="text-[11px] text-muted-foreground">
                            AI CRM recommendations are unavailable for this role.
                          </p>
                        ) : null}

                        {isLoadingCrmRecommendations ? (
                          <p className="text-[11px] text-muted-foreground">Scoring CRM candidates...</p>
                        ) : null}

                        {recommendation?.candidates.length === 0 && !isLoadingCrmRecommendations ? (
                          <p className="text-[11px] text-muted-foreground">
                            No new CRM profiles available beyond current applicants.
                          </p>
                        ) : null}

                        {recommendation?.candidates.slice(0, 4).map((candidate) => {
                          const outreachKey = `${position.id}:${candidate.profileId}`
                          const safeLinkedInUrl = toSafeLinkedInUrl(candidate.linkedinUrl)
                          return (
                            <div key={candidate.profileId} className="rounded-md border border-border/60 bg-card p-2 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium text-foreground truncate">{candidate.fullName}</p>
                                <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                                  AI {candidate.aiFitScore}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">{candidate.headline}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                Skill {candidate.skillCoverage}% | Seniority {candidate.seniorityFit}% | Match {candidate.matchScore}% | Network {candidate.networkScore}%
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {candidate.reasons.join(" | ")}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => {
                                    void handleCopyOutreachDraft(position, candidate)
                                  }}
                                >
                                  {copiedOutreachKey === outreachKey ? "Copied" : "Copy note"}
                                </Button>
                                {safeLinkedInUrl ? (
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" asChild>
                                    <a href={safeLinkedInUrl} target="_blank" rel="noreferrer">
                                      <ExternalLink className="w-3 h-3 mr-1" />
                                      Profile
                                    </a>
                                  </Button>
                                ) : null}
                                {onNavigate ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => handleSendToLinkedOut(position, candidate)}
                                  >
                                    LinkedOut
                                    <ArrowRight className="w-3 h-3 ml-1" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Blockers */}
            {selected.blockers && selected.blockers.length > 0 && (
              <Card className="bg-destructive/10 border-destructive/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-destructive uppercase tracking-wide mb-3">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Blockers ({selected.blockers.length})
                  </div>
                  <div className="space-y-2">
                    {selected.blockers.map((b, i) => (
                      <div key={i} className="text-sm text-destructive flex items-start gap-2 group">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0 mt-1.5" />
                        <span className="flex-1">{b}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleResolveBlocker(selected.id, i)}
                        >
                          Resolve
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Aspirations */}
            {selected.aspirations && selected.aspirations.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Star className="w-4 h-4 text-chart-3" />
                    Aspiration Goals
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selected.aspirations.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <ChevronRight className="w-3.5 h-3.5 text-chart-3 shrink-0" />
                      {a}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {selected.tags.map((tag) => (
                <Badge 
                  key={tag} 
                  variant="outline" 
                  className="text-xs text-muted-foreground hover:bg-secondary cursor-pointer transition-colors"
                >
                  #{tag}
                </Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-5 px-2 text-xs text-muted-foreground">
                <Plus className="w-3 h-3 mr-1" />
                Add tag
              </Button>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Create Project Dialog */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>Define a new project to track hiring, team-building, or aspirations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="e.g. Q3 Hiring Drive" className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={newProjectType} onValueChange={setNewProjectType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(projectTypes).map(([key, val]) => (
                    <SelectItem key={key} value={key} className="text-xs">{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)} placeholder="Brief project description..." className="text-xs min-h-[60px] resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target Date (optional)</Label>
              <Input type="date" value={newProjectDate} onChange={e => setNewProjectDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateProjectOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateProject} disabled={!newProjectName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Milestone Dialog */}
      <Dialog open={addMilestoneOpen} onOpenChange={setAddMilestoneOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Milestone</DialogTitle>
            <DialogDescription>Add a new milestone to track project progress.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Milestone Title</Label>
              <Input value={newMilestoneTitle} onChange={e => setNewMilestoneTitle(e.target.value)} placeholder="e.g. Complete first-round interviews" className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={newMilestoneDue} onChange={e => setNewMilestoneDue(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddMilestoneOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddMilestone} disabled={!newMilestoneTitle.trim()}>Add Milestone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
