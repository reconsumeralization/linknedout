"use client"

import type { ActiveView } from "@/app/page"
import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { CrmTalentNav } from "@/components/crm-talent-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Tribe } from "@/lib/shared/types"
import {
  LINKEDOUT_CREATE_PROJECT_SEED_KEY,
  LINKEDOUT_PROJECT_FOCUS_SEED_KEY,
  type ProjectCreateSeed,
  type ProjectFocusSeed,
} from "@/lib/shared/panel-navigation-seeds"
import { parseLinkedInCsv } from "@/lib/csv/csv-parser"
import type { SessionImportState } from "@/lib/csv/import-session"
import { fetchSupabaseProfiles, fetchSupabaseTribes, subscribeToProfiles } from "@/lib/supabase/supabase-data"
import { toSafeLinkedInUrl } from "@/lib/security/security-url"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import { cn } from "@/lib/shared/utils"
import { Building2, Filter, Layers, Linkedin, Loader2, MapPin, Search, Star, Target, Upload, Users } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { getSupabaseClient } from "@/lib/supabase/supabase"

interface ProfileType {
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
}

const seniorityColors: Record<string, string> = {
  CXO: "bg-chart-5/15 text-chart-5",
  VP: "bg-primary/15 text-primary",
  Director: "bg-accent/15 text-accent",
  Principal: "bg-chart-3/15 text-chart-3",
  Staff: "bg-chart-4/15 text-chart-4",
  Manager: "bg-chart-2/15 text-chart-2",
  Lead: "bg-muted text-muted-foreground",
  Senior: "bg-muted text-muted-foreground",
}

interface ProfileCardProps {
  profile: ProfileType
  onClick: () => void
  selected: boolean
}

function ProfileCard({ profile, onClick, selected }: ProfileCardProps) {
  const initials = `${profile.firstName?.[0] || "?"}${profile.lastName?.[0] || ""}`
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border transition-all hover:border-primary/30",
        selected ? "border-primary/50 bg-primary/8" : "border-border bg-card hover:bg-secondary/30"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-semibold text-foreground truncate">
              {profile.firstName} {profile.lastName}
            </span>
            <Badge className={cn("h-4 px-1.5 text-[9px] shrink-0", seniorityColors[profile.seniority] ?? "bg-muted text-muted-foreground")} variant="secondary">
              {profile.seniority}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{profile.headline}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Building2 className="w-2.5 h-2.5" />
              {profile.company}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="w-2.5 h-2.5" />
              {profile.location}
            </div>
          </div>
          {profile.tribe?.trim() && (
            <div className="mt-1.5">
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] gap-1 text-chart-5 border-chart-5/40">
                <Layers className="w-2.5 h-2.5" />
                {profile.tribe}
              </Badge>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex flex-wrap gap-1">
              {profile.skills.slice(0, 3).map(s => (
                <Badge key={s} variant="secondary" className="text-[9px] h-4 px-1">
                  {s}
                </Badge>
              ))}
              {profile.skills.length > 3 && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1 text-muted-foreground">
                  +{profile.skills.length - 3}
                </Badge>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-accent">
              <Star className="w-2.5 h-2.5" />
              {profile.matchScore}
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

const projectTypes = ["hiring", "team-building", "aspiration", "tribe", "network-expansion"] as const

type ProjectSeedType = (typeof projectTypes)[number]

interface ProfileProjectAction {
  profileId: string
  projectId?: string
  name: string
  type: ProjectSeedType
  description: string
  targetDate?: string
}

interface ProfileGoalAction {
  profileId: string
  projectId?: string
  goal: string
  targetDate?: string
}

interface ProfileDetailProps {
  profile: ProfileType
  tribeNames: string[]
  onAddToTribe: (profileId: string, tribeName: string) => void
  onCreateProject: (input: ProfileProjectAction) => void
  onSetGoal: (input: ProfileGoalAction) => void
  onNavigate?: (view: ActiveView) => void
}

function ProfileDetail({ profile, tribeNames, onAddToTribe, onCreateProject, onSetGoal, onNavigate }: ProfileDetailProps) {
  const [addTribeOpen, setAddTribeOpen] = useState(false)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [setGoalOpen, setSetGoalOpen] = useState(false)

  // Add to tribe form
  const [selectedTribe, setSelectedTribe] = useState("")

  // Create project form
  const [projectName, setProjectName] = useState("")
  const [projectType, setProjectType] = useState("team-building")
  const [projectDesc, setProjectDesc] = useState("")

  // Set goal form
  const [goalText, setGoalText] = useState("")
  const [goalDate, setGoalDate] = useState("")

  // Loading states
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isSettingGoal, setIsSettingGoal] = useState(false)

  const safeLinkedInUrl = toSafeLinkedInUrl(profile.linkedinUrl)

  useEffect(() => {
    if (!selectedTribe && tribeNames.length > 0) {
      setSelectedTribe(tribeNames[0])
    }
  }, [selectedTribe, tribeNames])

  useEffect(() => {
    if (createProjectOpen) {
      setProjectName(`${profile.firstName} ${profile.lastName} - Project`)
    }
  }, [createProjectOpen, profile.firstName, profile.lastName])

  const handleAddToTribe = () => {
    if (!selectedTribe) {
      return
    }
    onAddToTribe(profile.id, selectedTribe)
    setAddTribeOpen(false)
  }

  const handleCreateProject = async () => {
    if (!projectName.trim()) return
    setIsCreatingProject(true)
    try {
      const supabase = getSupabaseClient()
      if (supabase) {
        const { data, error } = await supabase
          .from("projects")
          .insert({
            name: projectName.trim(),
            description: projectDesc.trim() || null,
            type: projectType,
            status: "planned",
            progress: 0,
            profiles: 1,
            tags: [],
            milestones: [],
            next_action: "Review and kick off project",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id,name")
          .single()
        if (error) {
          console.warn("[profiles-panel] project insert failed:", error.message)
          toast.error("Failed to create project. Check Supabase connection.")
        } else {
          onCreateProject({
            profileId: profile.id,
            projectId: typeof data?.id === "string" ? data.id : undefined,
            name: projectName.trim(),
            type: projectType as ProjectSeedType,
            description: projectDesc.trim(),
          })
          toast.success(`Project "${projectName.trim()}" created successfully.`)
          setProjectName("")
          setProjectDesc("")
          setCreateProjectOpen(false)
        }
      } else {
        // No Supabase configured — fall back to local callback only
        onCreateProject({
          profileId: profile.id,
          name: projectName.trim(),
          type: projectType as ProjectSeedType,
          description: projectDesc.trim(),
        })
        toast.success(`Project "${projectName.trim()}" created (local only — Supabase not configured).`)
        setProjectName("")
        setProjectDesc("")
        setCreateProjectOpen(false)
      }
    } catch (err) {
      console.error("[profiles-panel] unexpected error creating project:", err)
      toast.error("An unexpected error occurred while creating the project.")
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleSetGoal = async () => {
    if (!goalText.trim()) return
    setIsSettingGoal(true)
    try {
      const supabase = getSupabaseClient()
      if (supabase) {
        const { data, error } = await supabase
          .from("projects")
          .insert({
            name: `Aspiration: ${goalText.trim().slice(0, 60)}`,
            description: goalText.trim(),
            type: "aspiration",
            status: "planned",
            progress: 0,
            profiles: 1,
            target_date: goalDate || null,
            aspirations: [goalText.trim()],
            tags: ["aspiration", profile.firstName.toLowerCase()],
            milestones: [],
            next_action: "Review aspiration goal",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id,name")
          .single()
        if (error) {
          console.warn("[profiles-panel] aspiration goal insert failed:", error.message)
          toast.error("Failed to save goal. Check Supabase connection.")
        } else {
          onSetGoal({
            profileId: profile.id,
            projectId: typeof data?.id === "string" ? data.id : undefined,
            goal: goalText.trim(),
            targetDate: goalDate || undefined,
          })
          toast.success("Aspiration goal saved successfully.")
          setGoalText("")
          setGoalDate("")
          setSetGoalOpen(false)
        }
      } else {
        // No Supabase configured — fall back to local callback only
        onSetGoal({
          profileId: profile.id,
          goal: goalText.trim(),
          targetDate: goalDate || undefined,
        })
        toast.success("Aspiration goal saved (local only — Supabase not configured).")
        setGoalText("")
        setGoalDate("")
        setSetGoalOpen(false)
      }
    } catch (err) {
      console.error("[profiles-panel] unexpected error saving goal:", err)
      toast.error("An unexpected error occurred while saving the goal.")
    } finally {
      setIsSettingGoal(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-xl font-bold text-primary shrink-0">
          {profile.firstName?.[0] || "?"}{profile.lastName?.[0] || ""}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">
            {profile.firstName} {profile.lastName}
          </h2>
          <p className="text-sm text-muted-foreground">{profile.headline}</p>
          <div className="flex items-center flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{profile.company}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.location}</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{profile.connections.toLocaleString()} connections</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs shrink-0"
          asChild={!!safeLinkedInUrl}
        >
          {safeLinkedInUrl ? (
            <a href={safeLinkedInUrl} target="_blank" rel="noopener noreferrer">
              <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />
              View Profile
            </a>
          ) : (
            <>
              <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />
              View Profile
            </>
          )}
        </Button>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Match Score", value: `${profile.matchScore}%`, color: "text-accent" },
          { label: "Seniority", value: profile.seniority, color: "text-primary" },
          { label: "Industry", value: profile.industry, color: "text-chart-3" },
        ].map(s => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{s.label}</div>
              <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Skills */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Skills & Expertise</h3>
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map(skill => (
              <Badge key={skill} variant="secondary" className="text-xs">
                {skill}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tribe */}
      {profile.tribe && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tribe Membership</h3>
            <Badge className="bg-accent/15 text-accent text-sm px-3 py-1 gap-1.5">
              <Users className="w-3 h-3" />
              {profile.tribe}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAddTribeOpen(true)}>
          <Users className="w-3 h-3" />
          Add to Tribe
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setCreateProjectOpen(true)}>
          Create Project
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setSetGoalOpen(true)}>
          <Target className="w-3 h-3" />
          Set Aspiration Goal
        </Button>
        <Button
          size="sm"
          className="gap-1.5 text-xs"
          asChild={!!safeLinkedInUrl}
        >
          {safeLinkedInUrl ? (
            <a href={`https://www.linkedin.com/messaging/compose/?recipient=${encodeURIComponent(safeLinkedInUrl)}`} target="_blank" rel="noopener noreferrer">
              <Linkedin className="w-3 h-3" />
              Send Message
            </a>
          ) : (
            <>
              <Linkedin className="w-3 h-3" />
              Send Message
            </>
          )}
        </Button>
      </div>

      {/* Add to Tribe Dialog */}
      <Dialog open={addTribeOpen} onOpenChange={setAddTribeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to Tribe</DialogTitle>
            <DialogDescription>
              Assign {profile.firstName} {profile.lastName} to an existing tribe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Select Tribe</Label>
              <Select value={selectedTribe} onValueChange={setSelectedTribe}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tribeNames.map(t => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddTribeOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddToTribe} disabled={!selectedTribe}>Add to Tribe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Project Dialog */}
      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Start a new project with {profile.firstName} {profile.lastName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Project Name</Label>
              <Input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="e.g. Q3 Hiring Drive"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectTypes.map(t => (
                    <SelectItem key={t} value={t} className="text-xs capitalize">{t.replace("-", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                value={projectDesc}
                onChange={e => setProjectDesc(e.target.value)}
                placeholder="Brief description of the project goal..."
                className="text-xs min-h-[60px] resize-none"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex-1 w-full sm:w-auto order-2 sm:order-1">
              {onNavigate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground gap-1.5"
                  onClick={() => {
                    try {
                      const seed: ProjectCreateSeed = {
                        suggestedName: projectName.trim() || `${profile.firstName} ${profile.lastName} - Project`,
                        suggestedType: projectType as ProjectSeedType,
                        suggestedDescription: projectDesc.trim() || undefined,
                      }
                      sessionStorage.setItem(LINKEDOUT_CREATE_PROJECT_SEED_KEY, JSON.stringify(seed))
                    } catch {
                      /* ignore */
                    }
                    setCreateProjectOpen(false)
                    onNavigate("projects")
                  }}
                >
                  Open in Projects with this name
                </Button>
              )}
            </div>
            <div className="flex gap-2 order-1 sm:order-2">
              <Button variant="outline" size="sm" onClick={() => setCreateProjectOpen(false)} disabled={isCreatingProject}>Cancel</Button>
              <Button size="sm" onClick={() => { void handleCreateProject() }} disabled={!projectName.trim() || isCreatingProject} className="gap-1.5">
                {isCreatingProject && <Loader2 className="w-3 h-3 animate-spin" />}
                {isCreatingProject ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Aspiration Goal Dialog */}
      <Dialog open={setGoalOpen} onOpenChange={setSetGoalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Aspiration Goal</DialogTitle>
            <DialogDescription>
              Define a development goal for {profile.firstName} {profile.lastName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Goal</Label>
              <Textarea
                value={goalText}
                onChange={e => setGoalText(e.target.value)}
                placeholder="e.g. Become a Principal Engineer within 18 months..."
                className="text-xs min-h-[70px] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target Date (optional)</Label>
              <Input
                type="date"
                value={goalDate}
                onChange={e => setGoalDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSetGoalOpen(false)} disabled={isSettingGoal}>Cancel</Button>
            <Button size="sm" onClick={() => { void handleSetGoal() }} disabled={!goalText.trim() || isSettingGoal} className="gap-1.5">
              {isSettingGoal && <Loader2 className="w-3 h-3 animate-spin" />}
              {isSettingGoal ? "Saving..." : "Set Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface ProfilesPanelProps {
  csvData: string | null
  sessionImport: SessionImportState | null
  onSaveImportedPdfProfiles: (profileIds: string[]) => Promise<void>
  onNavigate?: (view: ActiveView) => void
  onPageContextChange?: (context: Record<string, string | number | boolean | null>) => void
}

export function ProfilesPanel({
  csvData,
  sessionImport,
  onSaveImportedPdfProfiles,
  onNavigate,
  onPageContextChange,
}: ProfilesPanelProps) {
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<ProfileType[]>([])
  const [filterTribe, setFilterTribe] = useState<string>("all")
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false)
  const [dataSource, setDataSource] = useState<"csv" | "supabase">("supabase")
  const [supabaseTribeNames, setSupabaseTribeNames] = useState<string[]>([])
  const [hasSaveAuth, setHasSaveAuth] = useState(false)
  const [isSavingImportedProfiles, setIsSavingImportedProfiles] = useState(false)

  useEffect(() => {
    if (!onPageContextChange) return
    const profile = selectedId ? profiles.find((p) => p.id === selectedId) : null
    if (profile) {
      onPageContextChange({
        profileId: profile.id,
        profileName: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.id,
        tribe: profile.tribe ?? null,
      })
    } else {
      onPageContextChange({})
    }
  }, [onPageContextChange, selectedId, profiles])

  useEffect(() => {
    const refreshAuth = () => setHasSaveAuth(Boolean(resolveSupabaseAccessToken()))
    refreshAuth()
    window.addEventListener("storage", refreshAuth)
    return () => window.removeEventListener("storage", refreshAuth)
  }, [])

  const handleAddToTribe = useCallback((profileId: string, tribeName: string) => {
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, tribe: tribeName } : p))
  }, [])

  const handleCreateProject = useCallback((input: ProfileProjectAction) => {
    try {
      if (input.projectId?.trim()) {
        const seed: ProjectFocusSeed = {
          projectId: input.projectId.trim(),
          fallbackName: input.name,
        }
        sessionStorage.setItem(LINKEDOUT_PROJECT_FOCUS_SEED_KEY, JSON.stringify(seed))
      } else {
        const seed: ProjectCreateSeed = {
          suggestedName: input.name,
          suggestedType: input.type,
          suggestedDescription: input.description || undefined,
        }
        sessionStorage.setItem(LINKEDOUT_CREATE_PROJECT_SEED_KEY, JSON.stringify(seed))
      }
    } catch {
      // ignore session storage failures
    }

    if (onNavigate) {
      onNavigate("projects")
    }
  }, [onNavigate])

  const handleSetGoal = useCallback((input: ProfileGoalAction) => {
    try {
      if (input.projectId?.trim()) {
        const seed: ProjectFocusSeed = {
          projectId: input.projectId.trim(),
          fallbackName: `Aspiration: ${input.goal.slice(0, 60)}`,
        }
        sessionStorage.setItem(LINKEDOUT_PROJECT_FOCUS_SEED_KEY, JSON.stringify(seed))
      } else {
        const seed: ProjectCreateSeed = {
          suggestedName: `Aspiration: ${input.goal.slice(0, 60)}`,
          suggestedType: "aspiration",
          suggestedDescription: input.goal,
          suggestedDate: input.targetDate,
        }
        sessionStorage.setItem(LINKEDOUT_CREATE_PROJECT_SEED_KEY, JSON.stringify(seed))
      }
    } catch {
      // ignore session storage failures
    }

    if (onNavigate) {
      onNavigate("projects")
    }
  }, [onNavigate])

  const handleReviewImportedProfiles = useCallback(() => {
    const nextId = sessionImport?.unsavedPdfProfileIds[0]
    if (nextId) {
      setSelectedId(nextId)
    }
  }, [sessionImport?.unsavedPdfProfileIds])

  const handleSaveImportedProfiles = useCallback(async () => {
    const profileIds = sessionImport?.unsavedPdfProfileIds ?? []
    if (profileIds.length === 0) {
      return
    }

    setIsSavingImportedProfiles(true)
    try {
      await onSaveImportedPdfProfiles(profileIds)
    } finally {
      setIsSavingImportedProfiles(false)
    }
  }, [onSaveImportedPdfProfiles, sessionImport?.unsavedPdfProfileIds])

  const loadSupabaseProfiles = useCallback(async () => {
    setIsLoadingSupabase(true)
    try {
      const supabaseProfiles = await fetchSupabaseProfiles()
      setProfiles(supabaseProfiles || [])
      setDataSource("supabase")
    } finally {
      setIsLoadingSupabase(false)
    }
  }, [])

  useEffect(() => {
    try {
      const tribeFilter = sessionStorage.getItem("linkedout_filter_tribe")
      if (tribeFilter?.trim()) {
        setFilterTribe(tribeFilter.trim())
        sessionStorage.removeItem("linkedout_filter_tribe")
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (csvData) {
      setIsLoadingSupabase(false)
      try {
        const items: ProfileType[] = parseLinkedInCsv(csvData).map((profile) => ({
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
        }))
        setProfiles(items)
        setDataSource("csv")
      } catch {
        setProfiles([])
        setDataSource("csv")
      }
      return
    }

    void loadSupabaseProfiles()
    const fetchTribes = async () => {
      const tribes = await fetchSupabaseTribes()
      if (tribes?.length) {
        setSupabaseTribeNames(tribes.map((t: Tribe) => t.name).filter(Boolean))
      }
    }
    void fetchTribes()
    const unsubscribe = subscribeToProfiles(() => {
      void loadSupabaseProfiles()
    })

    return () => {
      unsubscribe?.()
    }
  }, [csvData, loadSupabaseProfiles])

  useEffect(() => {
    if (profiles.length === 0) {
      setSelectedId(null)
      return
    }

    if (!selectedId || !profiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(profiles[0].id)
    }
  }, [profiles, selectedId])

  const tribeOptions = useMemo(() => {
    const fromProfiles = Array.from(new Set(profiles.map((p) => p.tribe).filter((v): v is string => Boolean(v?.trim()))))
    return Array.from(new Set([...fromProfiles, ...supabaseTribeNames])).sort()
  }, [profiles, supabaseTribeNames])

  const filtered = profiles.filter(p => {
    const matchesSearch =
      search === "" ||
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      p.company.toLowerCase().includes(search.toLowerCase()) ||
      p.skills.some(s => s.toLowerCase().includes(search.toLowerCase()))
    const matchesTribe = filterTribe === "all" || (p.tribe?.trim() ?? "") === filterTribe
    return matchesSearch && matchesTribe
  })

  const selectedProfile = profiles.find(p => p.id === selectedId)
  const tribeNames = tribeOptions

  // Extracted to avoid a nested ternary with `>` comparison inside JSX
  // which confuses the SWC tokenizer in some webpack configurations.
  function renderDetailPanel() {
    if (selectedProfile) {
      return (
        <ProfileDetail
          profile={selectedProfile}
          tribeNames={tribeNames}
          onAddToTribe={handleAddToTribe}
          onCreateProject={handleCreateProject}
          onSetGoal={handleSetGoal}
          onNavigate={onNavigate}
        />
      )
    }
    if (profiles.length > 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Select a Profile</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
              Click on any profile to view details, skills, tribe assignments, and actions
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Users className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">No profiles yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
            Import a LinkedIn CSV or PDF in AI Assistant to load profiles, or add data to your Supabase profiles table.
          </p>
        </div>
        {onNavigate ? (
          <Button size="sm" className="gap-1.5" onClick={() => onNavigate("chat")}>
            <Upload className="w-3.5 h-3.5" />
            Go to AI Assistant
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BrandedPanelHeader
        title="Profiles CRM"
        description="Manage contacts"
        icon={Users}
        right={onNavigate ? <CrmTalentNav activeView="profiles" onNavigate={onNavigate} /> : undefined}
        compact
      />
      {sessionImport?.unsavedPdfProfileIds.length ? (
        <div className="border-b border-border bg-amber-500/8 px-4 py-3">
          <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Imported PDF profiles ready to save</p>
              <p className="text-xs text-muted-foreground">
                {sessionImport.unsavedPdfProfileIds.length === 1
                  ? "Review the imported LinkedIn PDF profile, then save it to Supabase."
                  : "Review the imported LinkedIn PDF profiles, then save them to Supabase."}
              </p>
              <p className="text-[11px] text-muted-foreground">Only CRM-supported fields will be saved in v1.</p>
              {!hasSaveAuth ? (
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Sign in to save</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleReviewImportedProfiles}
                type="button"
              >
                <Upload className="w-3.5 h-3.5" />
                Review imported profiles
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => void handleSaveImportedProfiles()}
                disabled={!hasSaveAuth || isSavingImportedProfiles}
                type="button"
              >
                {isSavingImportedProfiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save to Supabase
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: Profile List */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground">{filtered.length} profiles</p>
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase">
                  {dataSource}
                </Badge>
              </div>
              {onNavigate ? <CrmTalentNav activeView="profiles" onNavigate={onNavigate} className="mt-2" /> : null}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <Filter className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <Upload className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search profiles, skills, companies..."
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingSupabase ? (
            <div className="text-xs text-muted-foreground px-2 py-4">Loading profiles from Supabase...</div>
          ) : filtered.length > 0 ? (
            filtered.map(profile => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onClick={() => setSelectedId(profile.id)}
                selected={selectedId === profile.id}
              />
            ))
          ) : (
            <div className="px-2 py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {dataSource === "supabase"
                  ? "No profiles in Supabase for this account."
                  : "No profiles in the current import session."}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Import a LinkedIn CSV or PDF in AI Assistant to load profiles, or add profile data to your Supabase tables.
              </p>
              {onNavigate ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => onNavigate("chat")}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Go to AI Assistant to import CSV/PDF
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Right: Profile Detail or Empty State */}
      <div className="flex-1 overflow-y-auto">
        {renderDetailPanel()}
      </div>
      </div>
    </div>
  )
}
