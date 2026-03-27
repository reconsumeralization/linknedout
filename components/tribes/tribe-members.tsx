"use client"

import type { ActiveView } from "@/app/page"
import { TribeIntelligencePanel } from "@/components/tribe-intelligence-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Tribe, TribeRole, GovernanceProposal, GovernanceVote, GovernanceDelegation } from "@/lib/shared/types"
import { cn } from "@/lib/shared/utils"
import {
  ChevronRight,
  FolderKanban,
  Plus,
  Scale,
  Target,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Vote,
} from "lucide-react"

const TRIBE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const ALL_ROLES: TribeRole[] = ["Lead", "Strategist", "Executor", "Creative", "Analyst", "Connector"]

const roleColors: Record<TribeRole, string> = {
  Lead: "bg-primary/15 text-primary",
  Strategist: "bg-accent/15 text-accent",
  Executor: "bg-chart-3/15 text-chart-3",
  Creative: "bg-chart-5/15 text-chart-5",
  Analyst: "bg-chart-4/15 text-chart-4",
  Connector: "bg-chart-2/15 text-chart-2",
}

const LINKEDOUT_FILTER_TRIBE_KEY = "linkedout_filter_tribe"

interface TribeMembersProps {
  tribe: Tribe
  onNavigate?: (view: ActiveView) => void
  onAddMember: () => void
  onRemoveMember: (personId: string) => void
  onChangeMemberRole: (personId: string, role: TribeRole) => void
  onAssignProject: () => void
  govProposals: GovernanceProposal[]
  govDelegations: GovernanceDelegation[]
  govVotesMap: Record<string, GovernanceVote[]>
  isLoadingGov: boolean
}

export function TribeMembers({
  tribe,
  onNavigate,
  onAddMember,
  onRemoveMember,
  onChangeMemberRole,
  onAssignProject,
  govProposals,
  govDelegations,
  govVotesMap,
  isLoadingGov,
}: TribeMembersProps) {
  return (
    <>
      {/* Members Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-semibold">Team Members</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {tribe.members.length} profile{tribe.members.length !== 1 ? "s" : ""} in this tribe
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7"
                onClick={() => {
                  try {
                    sessionStorage.setItem(LINKEDOUT_FILTER_TRIBE_KEY, tribe.name)
                  } catch (e) {
                    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
                      console.warn("[tribes] sessionStorage.setItem failed:", e)
                    }
                  }
                  onNavigate("profiles" as ActiveView)
                }}
              >
                <Users className="w-3.5 h-3.5" />
                View in Profiles CRM
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-7"
              onClick={onAddMember}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Member
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tribe.members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <Users className="w-8 h-8 text-muted-foreground/40" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">No members yet</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Add members manually or re-analyze to populate.</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={onAddMember}>
                <UserPlus className="w-3 h-3" />
                Add First Member
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tribe.members.map((member, i) => (
                <div
                  key={member.personId || i}
                  className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: TRIBE_COLORS[i % TRIBE_COLORS.length] }}
                    >
                      {member.name
                        ? member.name.split(" ").map(n => n[0]).join("").slice(0, 2)
                        : "?"}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{member.name}</div>
                      <div className="text-xs text-muted-foreground">{member.seniority}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Skill badges */}
                    <div className="flex flex-wrap gap-1 justify-end max-w-[180px]">
                      {(member.skills ?? []).slice(0, 3).map(skill => (
                        <Badge key={skill} variant="secondary" className="text-[10px] h-4 px-1.5">
                          {skill}
                        </Badge>
                      ))}
                    </div>

                    {/* Role select */}
                    <Select
                      value={member.tribeRole as TribeRole}
                      onValueChange={v => onChangeMemberRole(member.personId, v as TribeRole)}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-5 px-1.5 text-[10px] border-0 shadow-none w-auto gap-1 font-medium rounded-full",
                          roleColors[member.tribeRole as TribeRole] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map(r => (
                          <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Remove member */}
                    <button
                      type="button"
                      onClick={() => onRemoveMember(member.personId)}
                      className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-all"
                      title="Remove member"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assigned Projects */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Assigned Projects</CardTitle>
          {onNavigate && (tribe.projects?.length ?? 0) > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs h-7"
              onClick={() => onNavigate("projects" as ActiveView)}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Open in Projects
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {(tribe.projects?.length ?? 0) > 0 ? (
            <div className="divide-y divide-border">
              {(tribe.projects ?? []).map((project, i) => {
                const name = typeof project === "string" ? project : project.id
                return (
                  <button
                    key={i}
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => onNavigate?.("projects" as ActiveView)}
                  >
                    <div className="flex items-center gap-2">
                      <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium">{name}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground mb-3">No projects linked yet</p>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onAssignProject}>
                <Target className="w-3.5 h-3.5" />
                Assign Project
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tribe Intelligence */}
      <TribeIntelligencePanel tribe={tribe} />

      {/* Governance */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Governance</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {govProposals.filter(p => p.status === "open" || p.status === "voting").length} active
              </Badge>
            </div>
            <Button size="sm" className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Propose
            </Button>
          </div>
          <CardDescription className="text-xs">
            Liquid governance proposals, delegation, and execution history
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Proposals */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Proposals</h4>
            {isLoadingGov ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading governance data...</p>
            ) : govProposals.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No proposals yet. Start one to coordinate tribe decisions.</p>
            ) : (
              <div className="space-y-2">
                {govProposals.map(proposal => {
                  const votes = govVotesMap[proposal.id] ?? []
                  const totalPower = (proposal.voteSummary?.totalPower ?? votes.reduce((s: number, v: any) => s + (v.voting_power ?? 0), 0)) || 1
                  const approvePower = proposal.voteSummary?.approvePower ?? votes.filter(v => v.vote === "approve").reduce((s, v) => s + v.votingPower, 0)
                  const rejectPower = proposal.voteSummary?.rejectPower ?? votes.filter(v => v.vote === "reject").reduce((s, v) => s + v.votingPower, 0)
                  const approvePercent = Math.round((approvePower / totalPower) * 100)
                  const rejectPercent = Math.round((rejectPower / totalPower) * 100)
                  const voterCount = proposal.voteSummary?.voterCount ?? votes.length
                  const isActive = proposal.status === "open" || proposal.status === "voting"
                  return (
                    <div key={proposal.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{proposal.title}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize">{proposal.proposalType.replace("_", " ")}</Badge>
                            <Badge
                              variant={isActive ? "default" : proposal.status === "passed" || proposal.status === "executed" ? "default" : "secondary"}
                              className={cn(
                                "text-[10px] capitalize",
                                isActive && "bg-chart-2/20 text-chart-2 border-chart-2/30",
                                (proposal.status === "passed" || proposal.status === "executed") && "bg-accent/20 text-accent border-accent/30",
                                proposal.status === "rejected" && "bg-destructive/20 text-destructive border-destructive/30",
                              )}
                            >
                              {proposal.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                          <Vote className="w-3 h-3" />
                          {voterCount}
                        </div>
                      </div>
                      {/* Vote progress bar */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-accent">{approvePercent}% approve</span>
                          <span className="text-muted-foreground mx-1">|</span>
                          <span className="text-destructive">{rejectPercent}% reject</span>
                        </div>
                        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                          <div className="bg-accent transition-all" style={{ width: `${approvePercent}%` }} />
                          <div className="bg-destructive transition-all" style={{ width: `${rejectPercent}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Delegation Management */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delegations</h4>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                <UserCheck className="w-3 h-3" />
                Delegate Vote
              </Button>
            </div>
            {govDelegations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No active delegations. Delegate your voting power to trusted members.</p>
            ) : (
              <div className="space-y-1.5">
                {govDelegations.map(d => (
                  <div key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs truncate">{d.delegateUserId.slice(0, 8)}...</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] capitalize">{d.domain}</Badge>
                      <Badge
                        variant={d.isActive ? "default" : "secondary"}
                        className={cn("text-[10px]", d.isActive && "bg-accent/20 text-accent border-accent/30")}
                      >
                        {d.isActive ? "Active" : "Revoked"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Execution History */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Execution History</h4>
            {govProposals.filter(p => p.status === "executed").length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No executed proposals yet.</p>
            ) : (
              <div className="space-y-1.5">
                {govProposals
                  .filter(p => p.status === "executed")
                  .map(p => (
                    <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Scale className="w-3.5 h-3.5 text-accent shrink-0" />
                        <span className="text-xs truncate">{p.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="default" className="text-[10px] bg-accent/20 text-accent border-accent/30">Executed</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(p.resolvedAt ?? p.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
