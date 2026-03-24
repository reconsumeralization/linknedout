"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Tribe, TribeKnowledgeEntry, TribeSignalPost, TribeSprint } from "@/lib/shared/types"
import { fetchTribeKnowledgeBase, fetchTribeSignalFeed, fetchTribeSprints } from "@/lib/supabase/supabase-data"
import { cn } from "@/lib/shared/utils"
import {
  BookOpen,
  Brain,
  Clock,
  FlaskConical,
  Lightbulb,
  Radio,
  Rocket,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"

interface TribeIntelligencePanelProps {
  tribe: Tribe
}

const CONTENT_TYPE_ICONS: Record<string, typeof Lightbulb> = {
  insight: Lightbulb,
  prompt_chain: Zap,
  workflow: Rocket,
  case_study: BookOpen,
}

const CONTENT_TYPE_COLORS: Record<string, string> = {
  insight: "bg-amber-500/10 text-amber-500",
  prompt_chain: "bg-blue-500/10 text-blue-500",
  workflow: "bg-emerald-500/10 text-emerald-500",
  case_study: "bg-purple-500/10 text-purple-500",
}

function riskColor(percent: number): string {
  if (percent >= 70) return "text-red-500"
  if (percent >= 40) return "text-amber-500"
  return "text-emerald-500"
}

function riskBg(percent: number): string {
  if (percent >= 70) return "bg-red-500"
  if (percent >= 40) return "bg-amber-500"
  return "bg-emerald-500"
}

export function TribeIntelligencePanel({ tribe }: TribeIntelligencePanelProps) {
  const [knowledgeBase, setKnowledgeBase] = useState<TribeKnowledgeEntry[]>([])
  const [signalFeed, setSignalFeed] = useState<TribeSignalPost[]>([])
  const [sprints, setSprints] = useState<TribeSprint[]>([])
  const [activeTab, setActiveTab] = useState("knowledge")

  const loadData = useCallback(async () => {
    const [kb, feed, sp] = await Promise.all([
      fetchTribeKnowledgeBase(tribe.id),
      fetchTribeSignalFeed(tribe.id),
      fetchTribeSprints(tribe.id),
    ])
    setKnowledgeBase(kb)
    setSignalFeed(feed)
    setSprints(sp)
  }, [tribe.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeSprints = sprints.filter((s) => s.status === "active" || s.status === "forming")
  const completedSprints = sprints.filter((s) => s.status === "completed")

  const membersAtRisk = tribe.members.filter((m) => (m.automationRiskPercent ?? 0) >= 70)
  const avgAgencyScore = tribe.members.length > 0
    ? Math.round(tribe.members.reduce((sum, m) => sum + (m.agencyScore ?? 0), 0) / tribe.members.length)
    : 0

  return (
    <div className="space-y-4">
      {/* Syndicate Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="gap-1">
          <Shield className="h-3 w-3" />
          {tribe.tribeDoctrine ?? "syndicate"}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Brain className="h-3 w-3" />
          Avg Agency: {avgAgencyScore}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <BookOpen className="h-3 w-3" />
          {knowledgeBase.length} KB entries
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Radio className="h-3 w-3" />
          {signalFeed.length} signals
        </Badge>
        {membersAtRisk.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <TrendingDown className="h-3 w-3" />
            {membersAtRisk.length} at risk
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="knowledge" className="text-xs">Knowledge Base</TabsTrigger>
          <TabsTrigger value="signals" className="text-xs">Signal Feed</TabsTrigger>
          <TabsTrigger value="radar" className="text-xs">Skill Radar</TabsTrigger>
          <TabsTrigger value="sprints" className="text-xs">Sprints</TabsTrigger>
          <TabsTrigger value="reviews" className="text-xs">Reviews</TabsTrigger>
        </TabsList>

        {/* Tab 1: Collective Edge — Knowledge Base */}
        <TabsContent value="knowledge" className="space-y-3 mt-3">
          {knowledgeBase.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No knowledge entries yet. Use the AI assistant to contribute insights, prompt chains, or workflows.</p>
                <p className="text-xs mt-1 opacity-70">Ask: &quot;Contribute to the knowledge base for this tribe&quot;</p>
              </CardContent>
            </Card>
          ) : (
            knowledgeBase.map((entry) => {
              const Icon = CONTENT_TYPE_ICONS[entry.contentType] ?? Lightbulb
              return (
                <Card key={entry.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={cn("rounded-md p-1.5", CONTENT_TYPE_COLORS[entry.contentType])}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">{entry.title}</CardTitle>
                          <CardDescription className="text-xs">
                            {entry.contentType} &middot; {new Date(entry.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">{entry.upvotes} upvotes</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-3">{entry.content}</p>
                    {entry.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {entry.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    )}
                    {entry.metrics && (
                      <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                        {entry.metrics.timeSaved && <span>Time saved: {entry.metrics.timeSaved}</span>}
                        {entry.metrics.errorRate != null && <span>Error rate: {entry.metrics.errorRate}%</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>

        {/* Tab 2: Signal-Only Feed */}
        <TabsContent value="signals" className="space-y-3 mt-3">
          {signalFeed.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No signals posted yet. Post validated use-cases only.</p>
                <p className="text-xs mt-1 opacity-70">Rule: No news articles. Only &quot;I tried Tool X on Task Y, here are the results.&quot;</p>
              </CardContent>
            </Card>
          ) : (
            signalFeed.map((post) => (
              <Card key={post.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-xs font-medium">{post.toolUsed}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs font-medium mb-1">{post.taskDescription}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{post.resultSummary}</p>
                  <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                    {post.timeSavedMinutes != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {post.timeSavedMinutes}m saved
                      </span>
                    )}
                    {post.errorRate != null && (
                      <span>Error: {post.errorRate}%</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {post.validatedBy.length} validated
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Tab 3: Skill-Delta Radar */}
        <TabsContent value="radar" className="space-y-3 mt-3">
          {tribe.members.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No members to analyze. Add profiles to this tribe first.</p>
              </CardContent>
            </Card>
          ) : (
            tribe.members.map((member) => (
              <Card key={member.personId}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{member.name ?? member.personId}</p>
                      <p className="text-xs text-muted-foreground">{member.tribeRole} &middot; {member.seniority ?? "Mid"}</p>
                    </div>
                    <div className="text-right">
                      {member.agencyScore != null && (
                        <Badge variant="secondary" className="text-xs mb-1">
                          Agency: {member.agencyScore}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Automation Risk Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Automation Risk</span>
                      <span className={riskColor(member.automationRiskPercent ?? 0)}>
                        {member.automationRiskPercent ?? 0}%
                      </span>
                    </div>
                    <Progress
                      value={member.automationRiskPercent ?? 0}
                      className="h-1.5"
                    />
                  </div>

                  {/* Skill Delta */}
                  {member.skillDelta && (
                    <div className="mt-2 space-y-1">
                      {member.skillDelta.atRiskSkills.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
                          {member.skillDelta.atRiskSkills.map((s) => (
                            <Badge key={s} variant="destructive" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      )}
                      {member.skillDelta.recommendedSkills.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                          {member.skillDelta.recommendedSkills.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px] border-emerald-500/30">{s}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Tab 4: Micro-Squad Sprints */}
        <TabsContent value="sprints" className="space-y-3 mt-3">
          {sprints.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No sprints yet. Form a micro-squad for a 48-hour sprint.</p>
                <p className="text-xs mt-1 opacity-70">Ask the AI: &quot;Form a micro-squad to [objective]&quot;</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeSprints.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Sprints</h4>
                  {activeSprints.map((sprint) => (
                    <Card key={sprint.id}>
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{sprint.name}</p>
                            <p className="text-xs text-muted-foreground">{sprint.objective}</p>
                          </div>
                          <Badge className={sprint.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}>
                            {sprint.status}
                          </Badge>
                        </div>
                        <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {sprint.squadMemberIds.length} members
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {sprint.durationHours}h
                          </span>
                          {sprint.skillRequirements.length > 0 && (
                            <span>{sprint.skillRequirements.join(", ")}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {completedSprints.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed ({completedSprints.length})</h4>
                  {completedSprints.slice(0, 5).map((sprint) => (
                    <Card key={sprint.id} className="opacity-70">
                      <CardContent className="py-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs">{sprint.name}</p>
                          <Badge variant="secondary" className="text-[10px]">completed</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 5: Regret Minimization Reviews */}
        <TabsContent value="reviews" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4" />
                Regret Minimization Review
              </CardTitle>
              <CardDescription className="text-xs">
                Quarterly check: &quot;Based on AI velocity, will you regret your current skill-stack in 24 months?&quot;
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tribe.nextReviewDate ? (
                  <p className="text-xs">
                    Next review: <span className="font-medium">{new Date(tribe.nextReviewDate).toLocaleDateString()}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No review scheduled. Ask the AI: &quot;Run a regret review for this tribe&quot;</p>
                )}

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{tribe.members.length}</p>
                    <p className="text-[10px] text-muted-foreground">Total Members</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className={cn("text-2xl font-bold", membersAtRisk.length > 0 ? "text-red-500" : "text-emerald-500")}>
                      {membersAtRisk.length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">High Automation Risk</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{avgAgencyScore}</p>
                    <p className="text-[10px] text-muted-foreground">Avg Agency Score</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{knowledgeBase.length + signalFeed.length}</p>
                    <p className="text-[10px] text-muted-foreground">Total Contributions</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
