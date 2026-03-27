"use client"

import { BrandedPanelHeader } from "@/components/branded-panel-header"
import { CrmTalentNav } from "@/components/crm-talent-nav"
import { FormTribeDialog, AssignProjectDialog, AddMemberDialog } from "@/components/tribes/tribe-form"
import { TribeDetailHeader } from "@/components/tribes/tribe-detail"
import { TribeAnalytics } from "@/components/tribes/tribe-analytics"
import { TribeMembers } from "@/components/tribes/tribe-members"
import {
  ALL_ROLES,
  DESIGN_PREVIEW_ID_PREFIX,
  TRIBE_COLORS,
  buildCsvAutoGroupedTribe,
  buildCsvFormTribe,
  buildLocalReanalyzedTribe,
  buildPersistedReanalyzedTribe,
  computeRadarData,
  computeSkillDist,
  executeRealtimeToolRequest,
  formatPercent,
  groupCsvProfilesForTribes,
  hydrateDesignPreviewMember,
  mapDesignPreviewToTribe,
  type TribeCompositionAnalysisOutput,
} from "@/components/tribes/tribe-helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ActiveView } from "@/app/page"
import { parseLinkedInCsv } from "@/lib/csv/csv-parser"
import {
  fetchSupabaseProfiles,
  fetchSupabaseProjects,
  fetchSupabaseTribes,
  subscribeToProfiles,
  subscribeToTribes,
  fetchGovernanceProposals,
  fetchGovernanceVotes,
  fetchGovernanceDelegations,
  type SupabaseProfileView,
} from "@/lib/supabase/supabase-data"
import {
  addTribeDesignPreviewEventListener,
} from "@/lib/shared/tribe-design-preview-events"
import type { Tribe, TribeRole, TribesPanelProps, TribeMember, GovernanceProposal, GovernanceVote, GovernanceDelegation } from "@/lib/shared/types"
import { cn } from "@/lib/shared/utils"
import {
  FileUp,
  FolderKanban,
  Layers,
  Plus,
  Shuffle,
  Sparkles,
  Users,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

// ─── Component ────────────────────────────────────────────────────────────────

export function TribesPanel({ csvData, onNavigate, onPageContextChange }: TribesPanelProps) {
  const [selectedTribeId, setSelectedTribeId] = useState<string>("")
  const [tribes, setTribes] = useState<Tribe[]>([])
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(false)
  const [dataSource, setDataSource] = useState<"csv" | "supabase">("supabase")
  const [projectNames, setProjectNames] = useState<string[]>([])

  // Governance state
  const [govProposals, setGovProposals] = useState<GovernanceProposal[]>([])
  const [govDelegations, setGovDelegations] = useState<GovernanceDelegation[]>([])
  const [govVotesMap, setGovVotesMap] = useState<Record<string, GovernanceVote[]>>({})
  const [isLoadingGov, setIsLoadingGov] = useState(false)

  // CSV Auto-Group
  useEffect(() => {
    if (!csvData) return
    const profiles = parseLinkedInCsv(csvData)
    if (profiles.length === 0) return
    const groupedProfiles = groupCsvProfilesForTribes(profiles)
    const csvTribes: Tribe[] = groupedProfiles.map((group, idx) =>
      buildCsvAutoGroupedTribe(group.skill, group.profiles, idx),
    )
    if (csvTribes.length > 0) {
      setTribes(csvTribes)
      setSelectedTribeId(csvTribes[0].id)
      setDataSource("csv")
    }
  }, [csvData])

  // Dialog state: Form New Tribe
  const [newTribeOpen, setNewTribeOpen] = useState(false)
  const [newTribeName, setNewTribeName] = useState("")
  const [newTribeDesc, setNewTribeDesc] = useState("")
  const [newTribeSize, setNewTribeSize] = useState("5")
  const [newTribeOptimize, setNewTribeOptimize] = useState("balanced")
  const [newTribeSkills, setNewTribeSkills] = useState("")
  const [isFormingTribe, setIsFormingTribe] = useState(false)
  const [newTribeError, setNewTribeError] = useState<string | null>(null)
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null)

  // Dialog state: Assign Project
  const [assignProjectOpen, setAssignProjectOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState("")

  // Dialog state: Add Member
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberName, setAddMemberName] = useState("")
  const [addMemberRole, setAddMemberRole] = useState<TribeRole>("Executor")
  const [addMemberSeniority, setAddMemberSeniority] = useState("Mid")
  const [addMemberSkills, setAddMemberSkills] = useState("")

  // Inline rename
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)
  const handledDesignPreviewSourceIdsRef = useRef<Set<string>>(new Set())
  const designPreviewProfilesByIdRef = useRef<Map<string, SupabaseProfileView>>(new Map())

  // Re-analyze
  const [isReanalyzing, setIsReanalyzing] = useState(false)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const hydrateDesignPreviewTribe = useCallback(
    (tribe: Tribe, profilesById: Map<string, SupabaseProfileView>): Tribe => {
      if (!tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX) || tribe.members.length === 0) return tribe
      let changed = false
      const fallbackSkills = tribe.commonSkills.slice(0, 3)
      const nextMembers = tribe.members.map((member) => {
        const nextMember = hydrateDesignPreviewMember(member, fallbackSkills, profilesById)
        if (nextMember !== member && (nextMember.name !== member.name || nextMember.seniority !== member.seniority || (nextMember.skills ?? []).join("|") !== (member.skills ?? []).join("|"))) {
          changed = true
        }
        return nextMember
      })
      if (!changed) return tribe
      return { ...tribe, members: nextMembers, radarData: computeRadarData(nextMembers, tribe.cohesion ?? 7, tribe.complementarity ?? 7), skillDist: computeSkillDist(nextMembers) }
    },
    [],
  )

  useEffect(() => {
    const unsubscribe = addTribeDesignPreviewEventListener((detail) => {
      const handled = handledDesignPreviewSourceIdsRef.current
      if (handled.has(detail.sourceId)) return
      handled.add(detail.sourceId)
      const previews = detail.output.designedTribes.map((designedTribe, index) =>
        mapDesignPreviewToTribe(detail, designedTribe, index, designPreviewProfilesByIdRef.current),
      )
      if (previews.length === 0) return
      setTribes((current) => {
        const persisted = current.filter((tribe) => !tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX))
        return [...previews, ...persisted]
      })
      setSelectedTribeId(previews[0].id)
    })
    return () => unsubscribe()
  }, [])

  const handleFormTribe = useCallback(async () => {
    if (!newTribeDesc.trim() && !newTribeName.trim()) return
    setIsFormingTribe(true)
    setNewTribeError(null)
    const size = Math.max(2, Math.min(15, parseInt(newTribeSize, 10) || 5))
    const requiredSkills = newTribeSkills.split(",").map(s => s.trim()).filter(Boolean)
    const objective = newTribeDesc.trim() || newTribeName.trim()
    const tribeName = newTribeName.trim()
    let shouldResetDialog = false
    try {
      if (csvData) {
        const csvTribe = buildCsvFormTribe(csvData, { name: tribeName, description: objective, size, optimize: newTribeOptimize, requiredSkills })
        if (!csvTribe) throw new Error("At least two CSV profiles are required to form a local tribe.")
        setTribes((prev) => [...prev, csvTribe])
        setSelectedTribeId(csvTribe.id)
        setDataSource("csv")
        shouldResetDialog = true
        return
      }
      const designed = await executeRealtimeToolRequest<{ designedTribes?: Array<{ profileIds?: string[] }> }>("designTribesForObjective", {
        objective, desiredTribeCount: 1, desiredTribeSize: size, requiredSkills: requiredSkills.length > 0 ? requiredSkills : null,
      })
      const designedProfileIds = designed.designedTribes?.[0]?.profileIds?.filter(Boolean) || []
      if (designedProfileIds.length < 2) throw new Error("AI could not assemble a viable tribe from the current CRM profiles.")
      const created = await executeRealtimeToolRequest<{ tribes?: Array<{ id?: string }> }>("createTribe", {
        tribeName: tribeName || null, profileIds: designedProfileIds, tribePurpose: objective, tribeSize: size, optimizeFor: newTribeOptimize,
        constraints: requiredSkills.length > 0 ? { mustIncludeSkills: requiredSkills } : null,
      })
      const createdTribeId = created.tribes?.[0]?.id || ""
      const [profiles, supabaseTribes] = await Promise.all([fetchSupabaseProfiles(), fetchSupabaseTribes()])
      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
      designPreviewProfilesByIdRef.current = profilesById
      setTribes((current) => {
        const previews = current.filter((tribe) => tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX)).map((tribe) => hydrateDesignPreviewTribe(tribe, profilesById))
        return [...(supabaseTribes || []), ...previews]
      })
      setDataSource("supabase")
      if (createdTribeId) setSelectedTribeId(createdTribeId)
      shouldResetDialog = true
    } catch (error) {
      setNewTribeError(error instanceof Error ? error.message : "Failed to form tribe.")
    } finally {
      setIsFormingTribe(false)
      if (shouldResetDialog) {
        setNewTribeName(""); setNewTribeDesc(""); setNewTribeSize("5"); setNewTribeOptimize("balanced"); setNewTribeSkills(""); setNewTribeError(null); setNewTribeOpen(false)
      }
    }
  }, [csvData, hydrateDesignPreviewTribe, newTribeDesc, newTribeName, newTribeSize, newTribeOptimize, newTribeSkills])

  const handleReanalyze = useCallback(async () => {
    const activeTribe = tribes.find((tribe) => tribe.id === selectedTribeId) || null
    if (!activeTribe) return
    setIsReanalyzing(true)
    setReanalyzeError(null)
    try {
      const isLocalOnlyTribe = dataSource === "csv" || activeTribe.id.startsWith("csv-") || activeTribe.id.startsWith("csv-manual-") || activeTribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX)
      if (isLocalOnlyTribe) {
        setTribes((prev) => prev.map((tribe) => (tribe.id === selectedTribeId ? buildLocalReanalyzedTribe(tribe) : tribe)))
        return
      }
      const requiredSkills = activeTribe.commonSkills.slice(0, 6)
      const analysis = await executeRealtimeToolRequest<{ tribes?: TribeCompositionAnalysisOutput[] }>("analyzeTribeComposition", {
        tribeId: activeTribe.id, requiredSkills: requiredSkills.length > 0 ? requiredSkills : null, benchmarkAgainstWorkspace: true, limitRecommendations: 3,
      })
      const composition = analysis.tribes?.[0]
      if (!composition) throw new Error("AI could not return tribe composition analysis.")
      setTribes((prev) => prev.map((tribe) => (tribe.id === selectedTribeId ? buildPersistedReanalyzedTribe(tribe, composition) : tribe)))
    } catch (error) {
      setReanalyzeError(error instanceof Error ? error.message : "Failed to re-analyze tribe.")
    } finally {
      setIsReanalyzing(false)
    }
  }, [dataSource, selectedTribeId, tribes])

  const handleAssignProject = useCallback(() => {
    if (!selectedProject) return
    setTribes(prev => prev.map(t =>
      t.id === selectedTribeId
        ? { ...t, projects: [...(Array.isArray(t.projects) ? t.projects.map(item => (typeof item === "string" ? item : item.id)) : []), selectedProject] }
        : t,
    ))
    setAssignProjectOpen(false)
  }, [selectedProject, selectedTribeId])

  const handleAddMember = useCallback(() => {
    if (!addMemberName.trim()) return
    const skills = addMemberSkills.split(",").map(s => s.trim()).filter(Boolean)
    const newMember: TribeMember = { personId: `m-${Date.now()}`, name: addMemberName.trim(), tribeRole: addMemberRole, projectRoles: [], tags: [], seniority: addMemberSeniority, skills }
    setTribes(prev => prev.map(t => {
      if (t.id !== selectedTribeId) return t
      const members = [...t.members, newMember]
      return { ...t, members, skillDist: computeSkillDist(members) }
    }))
    setAddMemberOpen(false); setAddMemberName(""); setAddMemberRole("Executor"); setAddMemberSeniority("Mid"); setAddMemberSkills("")
  }, [addMemberName, addMemberRole, addMemberSeniority, addMemberSkills, selectedTribeId])

  const handleRemoveMember = useCallback((personId: string) => {
    setTribes(prev => prev.map(t => {
      if (t.id !== selectedTribeId) return t
      const members = t.members.filter(m => m.personId !== personId)
      return { ...t, members, skillDist: computeSkillDist(members) }
    }))
  }, [selectedTribeId])

  const handleChangeMemberRole = useCallback((personId: string, role: TribeRole) => {
    setTribes(prev => prev.map(t => {
      if (t.id !== selectedTribeId) return t
      return { ...t, members: t.members.map(m => m.personId === personId ? { ...m, tribeRole: role } : m) }
    }))
  }, [selectedTribeId])

  const handleDeleteTribe = useCallback((tribeId: string) => {
    setTribes(prev => {
      const next = prev.filter(t => t.id !== tribeId)
      if (selectedTribeId === tribeId) setSelectedTribeId(next[0]?.id ?? "")
      return next
    })
  }, [selectedTribeId])

  const handleStartRename = useCallback(() => {
    const tribe = tribes.find(t => t.id === selectedTribeId)
    if (!tribe) return
    setEditNameValue(tribe.name)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [tribes, selectedTribeId])

  const handleSubmitRename = useCallback(() => {
    if (editNameValue.trim()) {
      setTribes(prev => prev.map(t => t.id === selectedTribeId ? { ...t, name: editNameValue.trim() } : t))
    }
    setEditingName(false)
  }, [editNameValue, selectedTribeId])

  // ── Supabase data loading ─────────────────────────────────────────────────

  const loadSupabaseProfiles = useCallback(async () => {
    const profiles = await fetchSupabaseProfiles()
    const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
    designPreviewProfilesByIdRef.current = profilesById
    setTribes((current) => current.map((tribe) => hydrateDesignPreviewTribe(tribe, profilesById)))
  }, [hydrateDesignPreviewTribe])

  const loadSupabaseTribes = useCallback(async () => {
    if (csvData) return
    setIsLoadingSupabase(true)
    try {
      const supabaseTribes = await fetchSupabaseTribes()
      setTribes((current) => {
        const previews = current.filter((tribe) => tribe.id.startsWith(DESIGN_PREVIEW_ID_PREFIX))
        return [...(supabaseTribes || []), ...previews]
      })
      setDataSource("supabase")
    } finally {
      setIsLoadingSupabase(false)
    }
  }, [csvData])

  const loadSupabaseProjects = useCallback(async () => {
    const projects = await fetchSupabaseProjects()
    const names = (projects || []).map(p => p.name.trim()).filter(Boolean)
    setProjectNames(names)
    if (!selectedProject && names[0]) setSelectedProject(names[0])
  }, [selectedProject])

  useEffect(() => {
    void loadSupabaseProfiles()
    const unsubscribe = subscribeToProfiles(() => { void loadSupabaseProfiles() })
    return () => { unsubscribe?.() }
  }, [loadSupabaseProfiles])

  useEffect(() => {
    if (!csvData) void loadSupabaseTribes()
    void loadSupabaseProjects()
    const unsubscribe = csvData ? null : subscribeToTribes(() => { void loadSupabaseTribes() })
    return () => { unsubscribe?.() }
  }, [csvData, loadSupabaseProjects, loadSupabaseTribes])

  useEffect(() => {
    if (tribes.length > 0 && !tribes.some(t => t.id === selectedTribeId)) {
      setSelectedTribeId(tribes[0].id)
    }
  }, [selectedTribeId, tribes])

  useEffect(() => { setReanalyzeError(null) }, [selectedTribeId])

  // Load governance data when tribe changes
  useEffect(() => {
    if (!selectedTribeId || selectedTribeId.startsWith(DESIGN_PREVIEW_ID_PREFIX)) return
    let cancelled = false
    async function loadGov() {
      setIsLoadingGov(true)
      try {
        const [proposals, delegations] = await Promise.all([fetchGovernanceProposals(selectedTribeId), fetchGovernanceDelegations(selectedTribeId)])
        if (cancelled) return
        setGovProposals(proposals)
        setGovDelegations(delegations)
        const votesEntries = await Promise.all(proposals.map(async (p) => [p.id, await fetchGovernanceVotes(p.id)] as const))
        if (cancelled) return
        setGovVotesMap(Object.fromEntries(votesEntries))
      } catch (err) {
        console.error("loadGovernance", err)
      } finally {
        if (!cancelled) setIsLoadingGov(false)
      }
    }
    void loadGov()
    return () => { cancelled = true }
  }, [selectedTribeId])

  const selectedTribe = tribes.find(t => t.id === selectedTribeId) ?? tribes[0]

  useEffect(() => {
    if (!onPageContextChange) return
    if (selectedTribe) {
      onPageContextChange({ tribeId: selectedTribe.id, tribeName: selectedTribe.name, memberCount: selectedTribe.members.length })
    } else {
      onPageContextChange({})
    }
  }, [onPageContextChange, selectedTribe?.id, selectedTribe?.name, selectedTribe?.members.length])

  // ─── Dialogs ────────────────────────────────────────────────────────────────

  const dialogs = (
    <>
      <FormTribeDialog
        open={newTribeOpen}
        onOpenChange={setNewTribeOpen}
        tribeName={newTribeName}
        onTribeNameChange={setNewTribeName}
        tribeDesc={newTribeDesc}
        onTribeDescChange={setNewTribeDesc}
        tribeSize={newTribeSize}
        onTribeSizeChange={setNewTribeSize}
        tribeOptimize={newTribeOptimize}
        onTribeOptimizeChange={setNewTribeOptimize}
        tribeSkills={newTribeSkills}
        onTribeSkillsChange={setNewTribeSkills}
        error={newTribeError}
        isForming={isFormingTribe}
        onSubmit={() => void handleFormTribe()}
        onClearError={() => setNewTribeError(null)}
      />
      <AssignProjectDialog
        open={assignProjectOpen}
        onOpenChange={setAssignProjectOpen}
        selectedProject={selectedProject}
        onProjectChange={setSelectedProject}
        projectNames={projectNames}
        tribeName={selectedTribe?.name ?? ""}
        onAssign={handleAssignProject}
      />
      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        memberName={addMemberName}
        onMemberNameChange={setAddMemberName}
        memberRole={addMemberRole}
        onMemberRoleChange={setAddMemberRole}
        memberSeniority={addMemberSeniority}
        onMemberSeniorityChange={setAddMemberSeniority}
        memberSkills={addMemberSkills}
        onMemberSkillsChange={setAddMemberSkills}
        tribeName={selectedTribe?.name ?? ""}
        onAdd={() => void handleAddMember()}
      />
    </>
  )

  // ─── Empty State ──────────────────────────────────────────────────────────

  if (tribes.length === 0 && !isLoadingSupabase) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-6 text-center p-8 max-w-md mx-auto">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
            <Layers className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">No tribes yet</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Upload a LinkedIn CSV to auto-group your network by skills, or use AI to form your first tribe. Tribes connect to Profiles CRM and Projects.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button size="default" className="gap-2 shadow-sm" onClick={() => { setNewTribeError(null); setNewTribeOpen(true) }}>
              <Sparkles className="w-4 h-4" />
              Form First Tribe
            </Button>
            {onNavigate && (
              <>
                <Button size="default" variant="outline" className="gap-2" onClick={() => onNavigate("profiles" as ActiveView)}>
                  <Users className="w-4 h-4" />
                  Pull from Profiles CRM
                </Button>
                <Button size="default" variant="outline" className="gap-2" onClick={() => onNavigate("projects" as ActiveView)}>
                  <FolderKanban className="w-4 h-4" />
                  Link to Projects
                </Button>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <FileUp className="w-3.5 h-3.5" />
            Upload a CSV in Dashboard or AI Assistant to auto-create tribes by skill clusters.
          </p>
        </div>
        {dialogs}
      </>
    )
  }

  // ─── Main Layout ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BrandedPanelHeader
        title="Tribe Builder"
        description="Build dream teams"
        icon={Layers}
        right={onNavigate ? <CrmTalentNav activeView="tribes" onNavigate={onNavigate} /> : undefined}
        compact
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Tribe List Sidebar */}
      <div className="w-64 shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground">{tribes.length} formed</p>
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] uppercase">
                {dataSource}
              </Badge>
            </div>
            {onNavigate ? <CrmTalentNav activeView="tribes" onNavigate={onNavigate} className="mt-2" /> : null}
            {isLoadingSupabase && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Syncing...</p>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setNewTribeError(null); setNewTribeOpen(true) }}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tribes.map((tribe, i) => {
            const requiredCoverageLabel = formatPercent(tribe.requiredSkillCoveragePercent, 1)
            const networkShareLabel = formatPercent(tribe.networkSharePercent, 2)
            const hasWindowUsage = typeof tribe.designWindowUsedProfileCount === "number" && typeof tribe.designWindowTotalProfiles === "number"
            const hasHealthStrip = Boolean(requiredCoverageLabel || networkShareLabel || hasWindowUsage)

            return (
              <div key={tribe.id} className="group relative">
                <button
                  onClick={() => setSelectedTribeId(tribe.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border transition-all",
                    selectedTribeId === tribe.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent bg-transparent hover:bg-secondary",
                  )}
                  type="button"
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                      style={{ background: TRIBE_COLORS[i % TRIBE_COLORS.length] }}
                    >
                      {tribe.name[0]}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-foreground truncate">{tribe.name}</span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-4 px-1.5 text-[9px] shrink-0",
                            tribe.status === "active" ? "bg-accent/15 text-accent" : "bg-chart-3/15 text-chart-3",
                          )}
                        >
                          {tribe.status}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug truncate">{tribe.description}</p>
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                        <Users className="w-2.5 h-2.5" />
                        <span>{tribe.members.length} members</span>
                        {typeof tribe.cohesion === "number" ? (
                          <span className="ml-1 text-accent font-medium">* {tribe.cohesion}</span>
                        ) : null}
                      </div>
                      {hasHealthStrip ? (
                        <div className="mt-1 text-[10px] text-muted-foreground flex flex-wrap items-center gap-1">
                          {requiredCoverageLabel ? (
                            <span className={cn(typeof tribe.requiredSkillCoveragePercent === "number" && tribe.requiredSkillCoveragePercent < 50 ? "text-chart-4" : "text-accent")}>
                              {requiredCoverageLabel} required skills covered
                            </span>
                          ) : null}
                          {requiredCoverageLabel && networkShareLabel ? <span>|</span> : null}
                          {networkShareLabel ? <span>{networkShareLabel} of network window</span> : null}
                          {(requiredCoverageLabel || networkShareLabel) && hasWindowUsage ? <span>|</span> : null}
                          {hasWindowUsage ? <span>window {tribe.designWindowUsedProfileCount}/{tribe.designWindowTotalProfiles}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTribe(tribe.id)}
                  className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all"
                  title="Delete tribe"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}

          <button
            className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary"
            type="button"
            onClick={() => setNewTribeOpen(true)}
          >
            <Shuffle className="w-4 h-4" />
            <span className="text-xs">Form new tribe with AI</span>
          </button>
        </div>
      </div>

      {/* Tribe Detail Panel */}
      {selectedTribe && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-5">
            <TribeDetailHeader
              tribe={selectedTribe}
              editingName={editingName}
              editNameValue={editNameValue}
              nameInputRef={nameInputRef}
              reanalyzeError={reanalyzeError}
              isReanalyzing={isReanalyzing}
              onEditNameValueChange={setEditNameValue}
              onStartRename={handleStartRename}
              onSubmitRename={handleSubmitRename}
              onCancelRename={() => setEditingName(false)}
              onReanalyze={() => void handleReanalyze()}
              onAssignProject={() => setAssignProjectOpen(true)}
            />
            <TribeAnalytics tribe={selectedTribe} />
            <TribeMembers
              tribe={selectedTribe}
              onNavigate={onNavigate}
              onAddMember={() => setAddMemberOpen(true)}
              onRemoveMember={handleRemoveMember}
              onChangeMemberRole={handleChangeMemberRole}
              onAssignProject={() => setAssignProjectOpen(true)}
              govProposals={govProposals}
              govDelegations={govDelegations}
              govVotesMap={govVotesMap}
              isLoadingGov={isLoadingGov}
            />
          </div>
        </div>
      )}
      </div>

      {dialogs}
    </div>
  )
}
