"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle2, Download, GitBranch, RefreshCw, Star, Store, Users } from "lucide-react"
import { useCallback, useState } from "react"

type CreatorsTab = "browse" | "my-offshoots" | "approval"

const DEMO_CREATORS = [
  { id: "1", creator_name: "Sovereign Artisan Co.", domain: "AI Tools", creator_type: "team", reputation_score: 92, total_offshoots: 7, total_revenue_usd: 4200 },
  { id: "2", creator_name: "Edge Intelligence Lab", domain: "Security", creator_type: "tribe", reputation_score: 88, total_offshoots: 4, total_revenue_usd: 1800 },
  { id: "3", creator_name: "Neural Craft Studios", domain: "Creative", creator_type: "individual", reputation_score: 76, total_offshoots: 12, total_revenue_usd: 8500 },
]

const DEMO_OFFSHOOTS = [
  { id: "1", offshoot_name: "RAG Pipeline Optimizer", offshoot_type: "tool", source_sovereign_tool: "overnightRetraining", license_type: "standard", price_usd: 29, downloads: 142, rating_avg: 4.7, rating_count: 23, status: "published", creator_name: "Sovereign Artisan Co." },
  { id: "2", offshoot_name: "Threat Intel Dashboard", offshoot_type: "template", source_sovereign_tool: "runDefenseAudit", license_type: "open", price_usd: 0, downloads: 389, rating_avg: 4.9, rating_count: 51, status: "published", creator_name: "Edge Intelligence Lab" },
  { id: "3", offshoot_name: "Brand Voice Cloner", offshoot_type: "workflow", source_sovereign_tool: "measureBrandAlpha", license_type: "tribal", price_usd: 49, downloads: 67, rating_avg: 4.3, rating_count: 12, status: "published", creator_name: "Neural Craft Studios" },
  { id: "4", offshoot_name: "ARC Puzzle Solver Pack", offshoot_type: "model", source_sovereign_tool: "arcRunMentalSimulation", license_type: "exclusive", price_usd: 99, downloads: 18, rating_avg: 4.8, rating_count: 5, status: "published", creator_name: "Edge Intelligence Lab" },
  { id: "5", offshoot_name: "Abstain Protocol Habit Tracker", offshoot_type: "integration", source_sovereign_tool: "activateAbstainProtocol", license_type: "open", price_usd: 0, downloads: 221, rating_avg: 4.5, rating_count: 34, status: "published", creator_name: "Neural Craft Studios" },
]

const DEMO_PENDING = [
  { id: "p1", creator_name: "Startup Forge LLC", domain: "Finance", creator_type: "enterprise", created_at: "2026-03-26" },
  { id: "p2", creator_name: "Community Healer", domain: "Wellness", creator_type: "individual", created_at: "2026-03-27" },
]

function starRating(avg: number) {
  return (
    <div className="flex items-center gap-1">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <span className="text-sm font-medium">{avg}</span>
    </div>
  )
}

export default function CreatorsPanel() {
  const [tab, setTab] = useState<CreatorsTab>("browse")
  const [isLoading, setIsLoading] = useState(false)

  const handleRefresh = useCallback(() => {
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 800)
  }, [])

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitBranch className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Micro-Creators</h2>
              <p className="text-sm text-muted-foreground">Offshoots marketplace — approved creators build on sovereign tools</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-chart-1" />
                <span className="text-sm text-muted-foreground">Approved Creators</span>
              </div>
              <p className="text-2xl font-bold">{DEMO_CREATORS.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="h-4 w-4 text-chart-2" />
                <span className="text-sm text-muted-foreground">Published Offshoots</span>
              </div>
              <p className="text-2xl font-bold">{DEMO_OFFSHOOTS.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Download className="h-4 w-4 text-chart-3" />
                <span className="text-sm text-muted-foreground">Total Downloads</span>
              </div>
              <p className="text-2xl font-bold">{DEMO_OFFSHOOTS.reduce((s, o) => s + o.downloads, 0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Store className="h-4 w-4 text-chart-4" />
                <span className="text-sm text-muted-foreground">Revenue Generated</span>
              </div>
              <p className="text-2xl font-bold">${DEMO_CREATORS.reduce((s, c) => s + c.total_revenue_usd, 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as CreatorsTab)}>
          <TabsList>
            <TabsTrigger value="browse">Browse Offshoots</TabsTrigger>
            <TabsTrigger value="my-offshoots">Creators</TabsTrigger>
            <TabsTrigger value="approval">Approval Queue ({DEMO_PENDING.length})</TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Published Offshoots</CardTitle>
                <CardDescription>Derivative tools built by approved creators on sovereign tools</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[50vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Source Tool</TableHead>
                        <TableHead>Creator</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead>Downloads</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {DEMO_OFFSHOOTS.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.offshoot_name}</TableCell>
                          <TableCell><Badge variant="secondary">{o.offshoot_type}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{o.source_sovereign_tool}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{o.creator_name}</TableCell>
                          <TableCell>{o.price_usd === 0 ? <Badge variant="outline">Free</Badge> : `$${o.price_usd}`}</TableCell>
                          <TableCell>{starRating(o.rating_avg)}</TableCell>
                          <TableCell>{o.downloads}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Creators Tab */}
          <TabsContent value="my-offshoots" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Approved Creators</CardTitle>
                <CardDescription>Verified micro-creators in the sovereign ecosystem</CardDescription>
              </CardHeader>
              <CardContent>
                {DEMO_CREATORS.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{c.creator_name}</p>
                        <Badge variant="secondary">{c.creator_type}</Badge>
                        <Badge variant="outline">{c.domain}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{c.total_offshoots} offshoots | ${c.total_revenue_usd.toLocaleString()} earned</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Reputation: <span className="font-bold">{c.reputation_score}</span></p>
                      <Progress value={c.reputation_score} className="w-24 mt-1" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Approval Tab */}
          <TabsContent value="approval" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pending Approvals</CardTitle>
                <CardDescription>Creators awaiting review before they can publish offshoots</CardDescription>
              </CardHeader>
              <CardContent>
                {DEMO_PENDING.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div>
                      <p className="font-medium">{p.creator_name}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary">{p.creator_type}</Badge>
                        <Badge variant="outline">{p.domain}</Badge>
                        <span className="text-xs text-muted-foreground">Applied {p.created_at}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-emerald-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-500">
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
                {DEMO_PENDING.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No pending approvals</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  )
}
