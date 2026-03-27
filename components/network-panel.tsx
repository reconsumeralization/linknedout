"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  INSIGHT_INDUSTRIES,
  INSIGHT_LOCATIONS,
  buildFriendStrengthRanking,
  calculateNetworkDensity,
  filterFriendNetwork,
  getCommunityColor,
  getGroupById,
  getIndustryColor,
  type FriendLink,
  type FriendNode,
  type GroupNode,
  type GroupOverlap,
  type NetworkInsightsDataset,
  type NetworkFilters,
  jobFunnelNodes as demoFunnelNodes,
  jobFunnelLinks as demoFunnelLinks,
  jobScatter as demoScatter,
  jobCalendar as demoCalendar,
} from "@/lib/network/network-insights-data"
import { resolveSupabaseAccessToken } from "@/lib/supabase/supabase-client-auth"
import {
  BriefcaseBusiness,
  Download,
  Filter,
  Layers,
  Network,
  Printer,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

type InsightSection = "friends" | "tribes" | "groups" | "jobs"
type TribeViewMode = "bubbles" | "treemap"

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    fontSize: "11px",
    color: "var(--foreground)",
  },
}

function industryToTribeCategory(industry: NetworkFilters["industry"]): "All" | "Tech" | "Business" | "Creative" | "Community" {
  if (industry === "All") return "All"
  if (industry === "Engineering" || industry === "Data") return "Tech"
  if (industry === "Design") return "Creative"
  if (industry === "Operations") return "Community"
  return "Business"
}

function getTribeColor(category: "Tech" | "Business" | "Creative" | "Community"): string {
  switch (category) {
    case "Tech":
      return "#0A66C2"
    case "Business":
      return "#00C853"
    case "Creative":
      return "#8E24AA"
    case "Community":
      return "#EF6C00"
    default:
      return "#8B97A8"
  }
}

function getHeatColor(score: number): string {
  if (score >= 75) return "rgba(10, 102, 194, 0.95)"
  if (score >= 55) return "rgba(10, 102, 194, 0.75)"
  if (score >= 35) return "rgba(10, 102, 194, 0.45)"
  return "rgba(10, 102, 194, 0.2)"
}

function getJobMatchColor(matchScore: number): string {
  if (matchScore >= 90) return "#00C853"
  if (matchScore >= 80) return "#0A66C2"
  if (matchScore >= 70) return "#FF8F00"
  return "#8B97A8"
}

function createEmptyDataset(): NetworkInsightsDataset {
  return {
    friendNodes: [],
    friendLinks: [],
    friendGrowth: [],
    tribeBubbles: [],
    groups: [],
    groupOverlaps: [],
    groupActivity: [],
    groupHeatmap: [],
    jobFunnelNodes: demoFunnelNodes,
    jobFunnelLinks: demoFunnelLinks,
    jobScatter: demoScatter,
    jobCalendar: demoCalendar,
  }
}

function FriendForceGraph(props: {
  nodes: FriendNode[]
  links: FriendLink[]
  selectedFriendId: string | null
  onSelectFriend: (friendId: string) => void
  minStrength: number
  showRecommendations: boolean
  egoMode: boolean
}) {
  const { nodes, links, selectedFriendId, onSelectFriend, minStrength, showRecommendations, egoMode } = props
  const width = 980
  const height = 520
  const padding = 48

  const nodeById = useMemo(() => {
    const map = new Map<string, FriendNode>()
    for (const node of nodes) {
      map.set(node.id, node)
    }
    return map
  }, [nodes])

  const visibleNodeIds = useMemo(() => {
    if (!egoMode || !selectedFriendId) {
      return new Set(nodes.map((node) => node.id))
    }

    const ids = new Set<string>([selectedFriendId])
    for (const link of links) {
      if (link.source === selectedFriendId || link.target === selectedFriendId) {
        ids.add(link.source)
        ids.add(link.target)
      }
    }
    return ids
  }, [egoMode, links, nodes, selectedFriendId])

  const visibleLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          link.strength >= minStrength &&
          visibleNodeIds.has(link.source) &&
          visibleNodeIds.has(link.target),
      ),
    [links, minStrength, visibleNodeIds],
  )

  const visibleNodes = useMemo(
    () => nodes.filter((node) => visibleNodeIds.has(node.id)),
    [nodes, visibleNodeIds],
  )

  const communityClouds = useMemo(() => {
    const byCommunity = new Map<FriendNode["community"], FriendNode[]>()
    for (const node of visibleNodes) {
      const current = byCommunity.get(node.community) || []
      current.push(node)
      byCommunity.set(node.community, current)
    }

    return Array.from(byCommunity.entries()).map(([community, entries]) => {
      const avgX = entries.reduce((acc, node) => acc + node.x, 0) / entries.length
      const avgY = entries.reduce((acc, node) => acc + node.y, 0) / entries.length
      const radius = Math.max(70, 30 + entries.length * 14)
      return { community, avgX, avgY, radius }
    })
  }, [visibleNodes])

  const pointX = (raw: number) => padding + (raw / 100) * (width - padding * 2)
  const pointY = (raw: number) => padding + (raw / 100) * (height - padding * 2)

  const isNeighbor = (nodeId: string): boolean => {
    if (!selectedFriendId) return false
    return visibleLinks.some(
      (link) =>
        (link.source === selectedFriendId && link.target === nodeId) ||
        (link.target === selectedFriendId && link.source === nodeId),
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[360px] md:h-[420px]">
        <defs>
          <filter id="suggestedGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {communityClouds.map((cloud) => (
          <g key={cloud.community}>
            <circle
              cx={pointX(cloud.avgX)}
              cy={pointY(cloud.avgY)}
              r={cloud.radius}
              fill={getCommunityColor(cloud.community)}
              opacity={0.08}
            />
            <text
              x={pointX(cloud.avgX)}
              y={pointY(cloud.avgY) - cloud.radius - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {cloud.community}
            </text>
          </g>
        ))}

        {visibleLinks.map((link) => {
          const source = nodeById.get(link.source)
          const target = nodeById.get(link.target)
          if (!source || !target) return null

          const highlighted =
            selectedFriendId &&
            (link.source === selectedFriendId || link.target === selectedFriendId)

          return (
            <line
              key={`${link.source}-${link.target}`}
              x1={pointX(source.x)}
              y1={pointY(source.y)}
              x2={pointX(target.x)}
              y2={pointY(target.y)}
              stroke={highlighted ? "var(--primary)" : "var(--border)"}
              strokeWidth={Math.max(1.2, link.strength / 30)}
              opacity={highlighted ? 0.85 : 0.45}
              strokeDasharray={link.pending ? "6 5" : undefined}
            />
          )
        })}

        {visibleNodes.map((node) => {
          const isSelected = node.id === selectedFriendId
          const highlight = isSelected || isNeighbor(node.id)
          const radius = Math.max(9, 5 + node.mutualConnections / 5)

          return (
            <g
              key={node.id}
              onClick={() => onSelectFriend(node.id)}
              style={{ cursor: "pointer" }}
              filter={showRecommendations && node.recommended ? "url(#suggestedGlow)" : undefined}
            >
              {showRecommendations && node.recommended ? (
                <circle
                  cx={pointX(node.x)}
                  cy={pointY(node.y)}
                  r={radius + 7}
                  fill="#00C853"
                  opacity={0.18}
                />
              ) : null}
              <circle
                cx={pointX(node.x)}
                cy={pointY(node.y)}
                r={radius}
                fill={getIndustryColor(node.industry)}
                stroke={highlight ? "var(--foreground)" : "var(--card)"}
                strokeWidth={highlight ? 2 : 1}
                opacity={highlight || !selectedFriendId ? 1 : 0.45}
              />
              <title>
                {node.label} | {node.role} | {node.location}
              </title>
              {(isSelected || highlight) && (
                <text
                  x={pointX(node.x)}
                  y={pointY(node.y) - radius - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--foreground)"
                  fontWeight="600"
                >
                  {node.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function GroupChordDiagram(props: {
  groups: GroupNode[]
  overlaps: GroupOverlap[]
  hoveredOverlap: GroupOverlap | null
  onHoverOverlap: (overlap: GroupOverlap | null) => void
}) {
  const { groups: groupsList, overlaps, hoveredOverlap, onHoverOverlap } = props
  const width = 500
  const height = 500
  const centerX = width / 2
  const centerY = height / 2
  const radius = 170

  const groupLayout = useMemo(() => {
    return groupsList.map((group, index) => {
      const angle = (index / groupsList.length) * Math.PI * 2 - Math.PI / 2
      return {
        ...group,
        angle,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        labelX: centerX + Math.cos(angle) * (radius + 26),
        labelY: centerY + Math.sin(angle) * (radius + 26),
      }
    })
  }, [centerX, centerY, groupsList, radius])

  const byId = useMemo(() => {
    const map = new Map<string, (typeof groupLayout)[number]>()
    for (const group of groupLayout) {
      map.set(group.id, group)
    }
    return map
  }, [groupLayout])

  return (
    <div className="rounded-xl border border-border bg-card/50 p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[360px]">
        <circle cx={centerX} cy={centerY} r={radius + 8} fill="none" stroke="var(--border)" />
        {overlaps.map((overlap) => {
          const source = byId.get(overlap.source)
          const target = byId.get(overlap.target)
          if (!source || !target) return null

          const active =
            hoveredOverlap &&
            hoveredOverlap.source === overlap.source &&
            hoveredOverlap.target === overlap.target

          const controlX = centerX + (source.x + target.x - centerX * 2) * 0.12
          const controlY = centerY + (source.y + target.y - centerY * 2) * 0.12

          return (
            <path
              key={`${overlap.source}-${overlap.target}`}
              d={`M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`}
              stroke={active ? "var(--primary)" : "var(--muted-foreground)"}
              strokeWidth={Math.max(1.8, overlap.sharedMembers / 75)}
              opacity={active ? 0.9 : 0.42}
              fill="none"
              onMouseEnter={() => onHoverOverlap(overlap)}
              onMouseLeave={() => onHoverOverlap(null)}
            />
          )
        })}

        {groupLayout.map((group) => (
          <g key={group.id}>
            <circle
              cx={group.x}
              cy={group.y}
              r={9 + group.members / 1300}
              fill="var(--card)"
              stroke={getTribeColor(
                group.category === "Functional"
                  ? "Tech"
                  : group.category === "Leadership"
                    ? "Business"
                    : group.category === "Industry"
                      ? "Creative"
                      : "Community",
              )}
              strokeWidth={2}
            />
            <text
              x={group.labelX}
              y={group.labelY}
              textAnchor={group.labelX >= centerX ? "start" : "end"}
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {group.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export function NetworkPanel() {
  const panelRef = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState<InsightSection>("friends")
  const [dataset, setDataset] = useState<NetworkInsightsDataset>(createEmptyDataset())
  const [dataSource, setDataSource] = useState<"loading" | "supabase" | "supabase-empty" | "error">("loading")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isPngExporting, setIsPngExporting] = useState(false)
  const [filters, setFilters] = useState<NetworkFilters>({
    industry: "All",
    location: "All",
    minStrength: 55,
    timeRange: "90d",
  })
  const [showRecommendations, setShowRecommendations] = useState(true)
  const [egoMode, setEgoMode] = useState(false)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [tribeView, setTribeView] = useState<TribeViewMode>("bubbles")
  const [selectedTribeId, setSelectedTribeId] = useState<string | null>(null)
  const [hoveredOverlap, setHoveredOverlap] = useState<GroupOverlap | null>(null)
  const [careerSignal, setCareerSignal] = useState(72)

  const refreshData = useCallback(async () => {
    const token = resolveSupabaseAccessToken()
    if (!token) {
      setDataSource("error")
      return
    }
    setIsRefreshing(true)
    try {
      const params = new URLSearchParams({ timeRange: filters.timeRange })
      const response = await fetch(`/api/network/insights?${params.toString()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        setDataSource("error")
        return
      }
      if (!response.ok) {
        throw new Error(`network insights fetch failed: ${response.status}`)
      }

      const payload = (await response.json()) as {
        ok?: boolean
        source?: "supabase" | "supabase-empty"
        data?: NetworkInsightsDataset
      }

      if (payload.ok && payload.data) {
        setDataset(payload.data)
        setDataSource(payload.source || "supabase-empty")
      } else {
        setDataSource("error")
      }
    } catch {
      setDataSource("error")
    } finally {
      setIsRefreshing(false)
    }
  }, [filters.timeRange])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  const filteredNetwork = useMemo(
    () => filterFriendNetwork(filters, { nodes: dataset.friendNodes, links: dataset.friendLinks }),
    [dataset.friendLinks, dataset.friendNodes, filters],
  )
  const visibleJobs = useMemo(
    () => dataset.jobScatter.filter((job) => filters.industry === "All" || job.industry === filters.industry),
    [dataset.jobScatter, filters.industry],
  )
  const density = useMemo(
    () => calculateNetworkDensity(filteredNetwork.nodes.length, filteredNetwork.links.length),
    [filteredNetwork.links.length, filteredNetwork.nodes.length],
  )
  const strongConnections = useMemo(
    () => filteredNetwork.links.filter((link) => link.strength >= 75).length,
    [filteredNetwork.links],
  )
  const topConnections = useMemo(
    () => buildFriendStrengthRanking(filteredNetwork.nodes, filteredNetwork.links),
    [filteredNetwork.links, filteredNetwork.nodes],
  )

  const selectedFriend = useMemo(
    () => filteredNetwork.nodes.find((friend) => friend.id === selectedFriendId) || null,
    [filteredNetwork.nodes, selectedFriendId],
  )

  const filteredTribes = useMemo(() => {
    const category = industryToTribeCategory(filters.industry)
    return dataset.tribeBubbles.filter((tribe) => category === "All" || tribe.category === category)
  }, [dataset.tribeBubbles, filters.industry])

  const selectedTribe = useMemo(
    () => filteredTribes.find((tribe) => tribe.id === selectedTribeId) || null,
    [filteredTribes, selectedTribeId],
  )

  const projectedOfferProbability = useMemo(() => {
    const base = 24
    const matchBonus = Math.round((visibleJobs.reduce((acc, job) => acc + job.matchScore, 0) / Math.max(visibleJobs.length, 1)) * 0.3)
    const signalBonus = Math.round(careerSignal * 0.35)
    return Math.min(96, base + matchBonus + signalBonus)
  }, [careerSignal, visibleJobs])

  const topGroupRecommendation = useMemo(() => {
    const ranked = [...dataset.groupOverlaps].sort((a, b) => b.sharedMembers - a.sharedMembers)
    const first = ranked[0]
    const source = first ? getGroupById(first.source, dataset.groups) : null
    const target = first ? getGroupById(first.target, dataset.groups) : null
    if (!first || !source || !target) {
      return null
    }
    return {
      groupName: source.name,
      connectedGroupName: target.name,
      sharedMembers: first.sharedMembers,
    }
  }, [dataset.groupOverlaps, dataset.groups])

  const exportPayload = useMemo(
    () => ({
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        totalFriends: filteredNetwork.nodes.length,
        totalConnections: filteredNetwork.links.length,
        networkDensityPct: density,
        strongConnections,
      },
      friends: filteredNetwork.nodes,
      links: filteredNetwork.links,
      tribes: filteredTribes,
      groups: dataset.groups,
      overlaps: dataset.groupOverlaps,
      jobs: visibleJobs,
    }),
    [
      dataset.groupOverlaps,
      dataset.groups,
      density,
      filteredNetwork.links,
      filteredNetwork.nodes,
      filteredTribes,
      filters,
      strongConnections,
      visibleJobs,
    ],
  )

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "network-insights-export.json"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const exportPng = async () => {
    if (!panelRef.current) {
      return
    }

    setIsPngExporting(true)
    try {
      const htmlToImage = await import("html-to-image")
      const dataUrl = await htmlToImage.toPng(panelRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      })
      const anchor = document.createElement("a")
      anchor.href = dataUrl
      anchor.download = "network-insights.png"
      anchor.click()
    } catch {
      // Ignore export failures and keep UI interactive.
    } finally {
      setIsPngExporting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div ref={panelRef} className="max-w-7xl mx-auto p-6 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Network Insights</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tribes, friends, groups, and jobs in one interactive intelligence surface
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={dataSource === "supabase" ? "default" : "secondary"}
              className="text-[10px] uppercase tracking-wide"
            >
              {dataSource === "loading"
                ? "Loading"
                : dataSource === "supabase"
                  ? "Live Supabase"
                  : dataSource === "supabase-empty"
                    ? "No Supabase Data"
                  : dataSource === "error"
                    ? "Load Error"
                    : "Loading"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => void refreshData()}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => void exportPng()}
              disabled={isPngExporting}
            >
              <Download className="w-3.5 h-3.5" />
              Export PNG
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" />
              Export PDF
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={exportJson}>
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </Button>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              Global Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Time Range</span>
              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                value={filters.timeRange}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    timeRange: event.target.value as NetworkFilters["timeRange"],
                  }))
                }
              >
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="180d">Last 180 days</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Industry</span>
              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                value={filters.industry}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    industry: event.target.value as NetworkFilters["industry"],
                  }))
                }
              >
                {INSIGHT_INDUSTRIES.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Location</span>
              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                value={filters.location}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    location: event.target.value as NetworkFilters["location"],
                  }))
                }
              >
                {INSIGHT_LOCATIONS.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Minimum Strength: {filters.minStrength}
              </span>
              <Slider
                min={20}
                max={95}
                step={5}
                value={[filters.minStrength]}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, minStrength: value[0] || prev.minStrength }))
                }
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={showRecommendations} onCheckedChange={setShowRecommendations} />
                AI suggestions
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={egoMode} onCheckedChange={setEgoMode} />
                Ego mode
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Friends</span>
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-primary">{filteredNetwork.nodes.length}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Active in selected filters</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Network Density</span>
                <Network className="w-4 h-4 text-accent" />
              </div>
              <div className="text-2xl font-bold text-accent">{density}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {filteredNetwork.links.length} active links
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Strong Connections</span>
                <TrendingUp className="w-4 h-4 text-chart-3" />
              </div>
              <div className="text-2xl font-bold text-chart-3">{strongConnections}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Strength score 75+</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Offer Projection</span>
                <BriefcaseBusiness className="w-4 h-4 text-chart-4" />
              </div>
              <div className="text-2xl font-bold text-chart-4">{projectedOfferProbability}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">Career path simulator</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { id: "friends", label: "Friends", icon: Users },
            { id: "tribes", label: "Tribes", icon: Layers },
            { id: "groups", label: "Groups", icon: Network },
            { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
          ].map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`h-10 rounded-lg border text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-primary font-semibold"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setSection(item.id as InsightSection)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="w-4 h-4" />
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>

        {section === "friends" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2 bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Friends Relationship Graph</CardTitle>
                  <CardDescription className="text-xs">
                    Node size = mutual connections, edge thickness = relationship strength
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FriendForceGraph
                    nodes={filteredNetwork.nodes}
                    links={filteredNetwork.links}
                    selectedFriendId={selectedFriendId}
                    onSelectFriend={setSelectedFriendId}
                    minStrength={filters.minStrength}
                    showRecommendations={showRecommendations}
                    egoMode={egoMode}
                  />
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    {selectedFriend ? selectedFriend.label : "Friend Details"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {selectedFriend ? `${selectedFriend.role} | ${selectedFriend.location}` : "Click a node to drill in"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedFriend ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-secondary p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mutuals</div>
                          <div className="text-lg font-bold text-foreground">{selectedFriend.mutualConnections}</div>
                        </div>
                        <div className="rounded-lg bg-secondary p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Community</div>
                          <div className="text-sm font-bold text-foreground">{selectedFriend.community}</div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Industry</div>
                        <Badge variant="secondary">{selectedFriend.industry}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">AI Action</div>
                        <div className="rounded-lg border border-border bg-background p-2 text-xs">
                          Invite {selectedFriend.label.split(" ")[0]} into your next tribe planning loop.
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                      Pick a friend node to recenter the graph and inspect their strongest ties.
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Strongest Connections</div>
                    {topConnections.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground truncate">{entry.label}</span>
                        <span className="text-muted-foreground">{entry.strength}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Friends Added Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={dataset.friendGrowth} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Line type="monotone" dataKey="friendsAdded" stroke="var(--primary)" strokeWidth={2.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Top Connection Strength</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={topConnections.slice(0, 6)} margin={{ top: 8, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" angle={-20} textAnchor="end" height={40} interval={0} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="strength" radius={[4, 4, 0, 0]}>
                        {topConnections.slice(0, 6).map((entry) => (
                          <Cell key={entry.id} fill="var(--chart-1)" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {section === "tribes" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={tribeView === "bubbles" ? "default" : "outline"}
                className="text-xs"
                onClick={() => setTribeView("bubbles")}
              >
                Packed Bubbles
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tribeView === "treemap" ? "default" : "outline"}
                className="text-xs"
                onClick={() => setTribeView("treemap")}
              >
                Treemap
              </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2 bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Tribe Scale and Health</CardTitle>
                  <CardDescription className="text-xs">
                    Bubble size = members, color intensity = activity score
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {tribeView === "bubbles" ? (
                    <div className="relative h-[420px] rounded-xl border border-border bg-card/50 overflow-hidden">
                      {filteredTribes.map((tribe) => {
                        const diameter = Math.max(78, Math.min(170, Math.round(Math.sqrt(tribe.members) * 1.35)))
                        const fill = getTribeColor(tribe.category)
                        return (
                          <button
                            key={tribe.id}
                            type="button"
                            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 text-white text-center transition-transform hover:scale-105"
                            style={{
                              left: `${tribe.x}%`,
                              top: `${tribe.y}%`,
                              width: diameter,
                              height: diameter,
                              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), ${fill})`,
                              boxShadow: selectedTribeId === tribe.id ? "0 0 0 2px rgba(255,255,255,0.5)" : undefined,
                              opacity: 0.45 + tribe.activityScore / 180,
                            }}
                            onClick={() => setSelectedTribeId(tribe.id)}
                          >
                            <span className="block text-[10px] px-2 leading-tight font-semibold">{tribe.name}</span>
                            <span className="block text-[10px] mt-1">{(tribe.members / 1000).toFixed(1)}k</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={420}>
                      <Treemap
                        data={filteredTribes.map((tribe) => ({
                          name: tribe.name,
                          size: tribe.members,
                          growthPct: tribe.growthPct,
                          category: tribe.category,
                        }))}
                        dataKey="size"
                        aspectRatio={1.4}
                        stroke="var(--border)"
                      >
                        {filteredTribes.map((tribe) => (
                          <Cell key={tribe.id} fill={getTribeColor(tribe.category)} />
                        ))}
                        <Tooltip {...tooltipStyle} />
                      </Treemap>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    {selectedTribe ? selectedTribe.name : "Tribe Details"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {selectedTribe ? `${selectedTribe.members.toLocaleString()} members` : "Select a tribe bubble"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedTribe ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-secondary p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Growth</div>
                          <div className="text-lg font-bold text-accent">+{selectedTribe.growthPct}%</div>
                        </div>
                        <div className="rounded-lg bg-secondary p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Activity</div>
                          <div className="text-lg font-bold text-primary">{selectedTribe.activityScore}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-2 text-xs">
                        Overlap signal: 34% of your strongest friends are active in {selectedTribe.name}.
                      </div>
                      <Button size="sm" className="w-full text-xs gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Explore Tribe Overlap
                      </Button>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                      Click a tribe to inspect member scale, growth, and overlap opportunities.
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fastest Growing</div>
                    {filteredTribes
                      .slice()
                      .sort((a, b) => b.growthPct - a.growthPct)
                      .slice(0, 4)
                      .map((tribe) => (
                        <div key={tribe.id} className="flex items-center justify-between text-xs">
                          <span className="text-foreground truncate">{tribe.name}</span>
                          <span className="text-accent font-semibold">+{tribe.growthPct}%</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {section === "groups" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2 bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Group Overlap Chord View</CardTitle>
                  <CardDescription className="text-xs">
                    Chord thickness represents shared members between groups
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GroupChordDiagram
                    groups={dataset.groups}
                    overlaps={dataset.groupOverlaps}
                    hoveredOverlap={hoveredOverlap}
                    onHoverOverlap={setHoveredOverlap}
                  />
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Overlap Detail</CardTitle>
                  <CardDescription className="text-xs">
                    {hoveredOverlap ? "Hovering active chord" : "Hover a chord to inspect overlap"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {hoveredOverlap ? (
                    <>
                      <div className="rounded-lg bg-secondary p-3">
                        <div className="text-xs text-foreground font-semibold">
                          {getGroupById(hoveredOverlap.source, dataset.groups)?.name} and {getGroupById(hoveredOverlap.target, dataset.groups)?.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          Shared members: {hoveredOverlap.sharedMembers}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Top Shared Friends</div>
                        {hoveredOverlap.topSharedFriends.map((friend) => (
                          <div key={friend} className="text-xs text-foreground">
                            {friend}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                      Use this view to identify high-overlap communities for targeted group expansion.
                    </div>
                  )}

                  {topGroupRecommendation ? (
                    <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-accent">Recommendation</div>
                      <div className="text-xs mt-1 text-foreground">
                        Join {topGroupRecommendation.groupName}: {topGroupRecommendation.sharedMembers} members overlap
                        with {topGroupRecommendation.connectedGroupName}.
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Group Activity Mix</CardTitle>
                  <CardDescription className="text-xs">
                    Recent posts, comments, and joins inferred from workspace activity in the selected window
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dataset.groupActivity} margin={{ top: 6, right: 10, left: -20, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="group" angle={-20} textAnchor="end" interval={0} height={44} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="posts" stackId="a" fill="var(--chart-1)" />
                      <Bar dataKey="comments" stackId="a" fill="var(--chart-2)" />
                      <Bar dataKey="joins" stackId="a" fill="var(--chart-3)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Participation Heatmap</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground mb-1">
                    <div>Morning</div>
                    <div>Afternoon</div>
                    <div>Evening</div>
                  </div>
                  <div className="space-y-1">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                      const cells = dataset.groupHeatmap.filter((cell) => cell.day === day)
                      return (
                        <div key={day} className="grid grid-cols-[32px_1fr_1fr_1fr] gap-1 items-center">
                          <span className="text-[10px] text-muted-foreground">{day}</span>
                          {cells.map((cell) => (
                            <div
                              key={`${cell.day}-${cell.period}`}
                              className="h-7 rounded-md border border-border"
                              style={{ backgroundColor: getHeatColor(cell.score) }}
                              title={`${cell.day} ${cell.period}: ${cell.score}`}
                            />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {section === "jobs" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <Card className="xl:col-span-2 bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Application Flow Sankey</CardTitle>
                  <CardDescription className="text-xs">
                    Sources to stages to outcomes, weighted by volume
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <Sankey
                      data={{ nodes: dataset.jobFunnelNodes, links: dataset.jobFunnelLinks }}
                      nodePadding={26}
                      nodeWidth={16}
                      margin={{ top: 8, right: 40, left: 20, bottom: 8 }}
                    >
                      <Tooltip {...tooltipStyle} />
                    </Sankey>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Career Path Simulator</CardTitle>
                  <CardDescription className="text-xs">Adjust skill readiness signal</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg bg-secondary p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Projected Offer Probability</div>
                    <div className="text-3xl font-bold text-primary mt-1">{projectedOfferProbability}%</div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">Skill Readiness: {careerSignal}</div>
                    <Slider
                      min={40}
                      max={100}
                      step={1}
                      value={[careerSignal]}
                      onValueChange={(value) => setCareerSignal(value[0] || careerSignal)}
                    />
                  </div>
                  <div className="rounded-lg border border-accent/30 bg-accent/10 p-2 text-xs text-foreground">
                    With current signal, prioritize Data and Engineering roles for highest conversion.
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Salary vs Experience</CardTitle>
                  <CardDescription className="text-xs">Dot color reflects profile match score</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <ScatterChart margin={{ top: 8, right: 10, left: -18, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="experienceYears" name="Experience" unit="y" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <YAxis dataKey="salaryK" name="Salary" unit="k" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <ZAxis dataKey="matchScore" range={[80, 380]} />
                      <Tooltip {...tooltipStyle} />
                      <Scatter data={visibleJobs}>
                        {visibleJobs.map((job) => (
                          <Cell key={job.id} fill={getJobMatchColor(job.matchScore)} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Applications Activity Calendar</CardTitle>
                  <CardDescription className="text-xs">Demand pulse across the selected time range</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-7 gap-1">
                    {dataset.jobCalendar.map((cell) => (
                      <div
                        key={cell.date}
                        className="h-9 rounded-md border border-border"
                        style={{ backgroundColor: getHeatColor(cell.intensity) }}
                        title={`${cell.date}: ${cell.intensity} activity score`}
                      />
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Peak activity window appears mid-cycle. Schedule outreach before that spike.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
