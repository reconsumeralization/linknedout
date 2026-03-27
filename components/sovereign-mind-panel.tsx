"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Brain, Eye, RefreshCw, Shield, Zap } from "lucide-react"
import { useCallback, useState } from "react"

type MindTab = "psych" | "energy" | "global"

const DEMO_BRAIN_MAPS = [
  { id: "1", platform: "Twitter/X", tech_fence_active: true, subconscious_patterns_detected: 3, risk_level: "medium", created_at: new Date().toISOString() },
  { id: "2", platform: "Instagram", tech_fence_active: false, subconscious_patterns_detected: 7, risk_level: "high", created_at: new Date().toISOString() },
  { id: "3", platform: "TikTok", tech_fence_active: true, subconscious_patterns_detected: 12, risk_level: "critical", created_at: new Date().toISOString() },
]

const DEMO_PSYCH_SNAPSHOTS = [
  { id: "1", snapshot_date: "2026-03-27", digital_fence_score: 78, attention_reclaimed_pct: 65, pattern_alerts: ["doom scrolling loop", "engagement bait"] },
  { id: "2", snapshot_date: "2026-03-26", digital_fence_score: 72, attention_reclaimed_pct: 58, pattern_alerts: ["notification addiction"] },
]

const DEMO_CHARGING_AUDITS = [
  { id: "1", substrate_type: "Level 2 AC", efficiency_pct: 94, sabotage_risk: "low", compliance_blindspot_count: 0 },
  { id: "2", substrate_type: "DC Fast Charge", efficiency_pct: 87, sabotage_risk: "medium", compliance_blindspot_count: 2 },
  { id: "3", substrate_type: "Public V2G Station", efficiency_pct: 71, sabotage_risk: "high", compliance_blindspot_count: 5 },
]

const DEMO_ENERGY_STAKES = [
  { id: "1", vehicle_id: "EV-001", staked_kwh: 45, yield_pct: 8.2, frequency_sabotage_detected: false },
  { id: "2", vehicle_id: "EV-002", staked_kwh: 72, yield_pct: 12.1, frequency_sabotage_detected: false },
]

const DEMO_ENTERPRISES = [
  { id: "1", enterprise_name: "Sovereign Artisan Co.", enterprise_type: "cooperative", capital_required_usd: 0, divide_refund_score: 82 },
  { id: "2", enterprise_name: "Edge AI Studio", enterprise_type: "startup", capital_required_usd: 0, divide_refund_score: 67 },
]

const DEMO_ARTISANSHIP = [
  { id: "1", skill_domain: "Music Production", latent_score: 85, blockers: ["hearing impairment"], recommendations: ["AI-assisted mixing", "haptic feedback tools"] },
  { id: "2", skill_domain: "Software Architecture", latent_score: 72, blockers: ["dyslexia", "no formal training"], recommendations: ["voice-to-code", "visual programming"] },
]

const DEMO_SANCTUARIES = [
  { id: "1", sanctuary_name: "Evening Wind-Down", mode: "comfort", active: true, session_count: 14 },
  { id: "2", sanctuary_name: "Crisis Response", mode: "crisis", active: true, session_count: 3 },
]

function riskBadge(risk: string) {
  const v = risk === "critical" ? "destructive" : risk === "high" ? "destructive" : risk === "medium" ? "secondary" : "outline"
  return <Badge variant={v as "default" | "destructive" | "secondary" | "outline"}>{risk}</Badge>
}

export default function SovereignMindPanel() {
  const [tab, setTab] = useState<MindTab>("psych")
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
            <Brain className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Sovereign Mind</h2>
              <p className="text-sm text-muted-foreground">Psychological, thermodynamic & global human sovereignty</p>
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
                <Eye className="h-4 w-4 text-chart-1" />
                <span className="text-sm text-muted-foreground">Attention Reclaimed</span>
              </div>
              <p className="text-2xl font-bold">65%</p>
              <Progress value={65} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-chart-2" />
                <span className="text-sm text-muted-foreground">Digital Fence Score</span>
              </div>
              <p className="text-2xl font-bold">78</p>
              <Progress value={78} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-chart-3" />
                <span className="text-sm text-muted-foreground">Energy Staked</span>
              </div>
              <p className="text-2xl font-bold">117 kWh</p>
              <p className="text-xs text-muted-foreground mt-1">Avg yield: 10.2%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="h-4 w-4 text-chart-4" />
                <span className="text-sm text-muted-foreground">Enterprises Forged</span>
              </div>
              <p className="text-2xl font-bold">2</p>
              <p className="text-xs text-muted-foreground mt-1">$0 capital required</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as MindTab)}>
          <TabsList>
            <TabsTrigger value="psych">Mind</TabsTrigger>
            <TabsTrigger value="energy">Energy</TabsTrigger>
            <TabsTrigger value="global">Global Human</TabsTrigger>
          </TabsList>

          {/* Mind Tab */}
          <TabsContent value="psych" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Algo Brain Maps</CardTitle>
                <CardDescription>Algorithmic influence patterns across social platforms</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Tech Fence</TableHead>
                      <TableHead>Patterns</TableHead>
                      <TableHead>Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_BRAIN_MAPS.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.platform}</TableCell>
                        <TableCell><Badge variant={m.tech_fence_active ? "default" : "outline"}>{m.tech_fence_active ? "Active" : "Off"}</Badge></TableCell>
                        <TableCell>{m.subconscious_patterns_detected}</TableCell>
                        <TableCell>{riskBadge(m.risk_level)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Psychological Snapshots</CardTitle>
                <CardDescription>Attention economy metrics and dark pattern exposure</CardDescription>
              </CardHeader>
              <CardContent>
                {DEMO_PSYCH_SNAPSHOTS.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{s.snapshot_date}</p>
                      <div className="flex gap-1 mt-1">
                        {s.pattern_alerts.map((a, i) => <Badge key={i} variant="outline" className="text-xs">{a}</Badge>)}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Fence: <span className="font-bold">{s.digital_fence_score}</span></p>
                      <p className="text-xs text-muted-foreground">Reclaimed: {s.attention_reclaimed_pct}%</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Energy Tab */}
          <TabsContent value="energy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Charging Substrate Audits</CardTitle>
                <CardDescription>Station integrity and compliance blindspot detection</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Efficiency</TableHead>
                      <TableHead>Sabotage Risk</TableHead>
                      <TableHead>Blindspots</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_CHARGING_AUDITS.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.substrate_type}</TableCell>
                        <TableCell>{a.efficiency_pct}%</TableCell>
                        <TableCell>{riskBadge(a.sabotage_risk)}</TableCell>
                        <TableCell>{a.compliance_blindspot_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vehicle Energy Stakes</CardTitle>
                <CardDescription>Battery mesh stabilizing the tribal basepower loop</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Staked kWh</TableHead>
                      <TableHead>Yield</TableHead>
                      <TableHead>Sabotage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_ENERGY_STAKES.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.vehicle_id}</TableCell>
                        <TableCell>{s.staked_kwh}</TableCell>
                        <TableCell className="text-emerald-500">{s.yield_pct}%</TableCell>
                        <TableCell><Badge variant={s.frequency_sabotage_detected ? "destructive" : "outline"}>{s.frequency_sabotage_detected ? "Detected" : "Clear"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Global Human Tab */}
          <TabsContent value="global" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sovereign Enterprises</CardTitle>
                <CardDescription>$0-capital businesses forged to bypass VC gatekeepers</CardDescription>
              </CardHeader>
              <CardContent>
                {DEMO_ENTERPRISES.map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div>
                      <p className="font-medium">{e.enterprise_name}</p>
                      <Badge variant="secondary" className="text-xs mt-1">{e.enterprise_type}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Divide Refund: <span className="font-bold">{e.divide_refund_score}</span></p>
                      <Progress value={e.divide_refund_score} className="w-24 mt-1" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latent Artisanship</CardTitle>
                <CardDescription>Hidden potential revealed — passion domains unblocked</CardDescription>
              </CardHeader>
              <CardContent>
                {DEMO_ARTISANSHIP.map((a) => (
                  <div key={a.id} className="py-3 border-b last:border-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{a.skill_domain}</p>
                      <Badge variant="default">Score: {a.latent_score}</Badge>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {a.blockers.map((b, i) => <Badge key={i} variant="destructive" className="text-xs">{b}</Badge>)}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {a.recommendations.map((r, i) => <Badge key={i} variant="outline" className="text-xs">{r}</Badge>)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resonance Sanctuaries</CardTitle>
                <CardDescription>Non-judgmental emotional support spaces</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Sessions</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_SANCTUARIES.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.sanctuary_name}</TableCell>
                        <TableCell><Badge variant="secondary">{s.mode}</Badge></TableCell>
                        <TableCell>{s.session_count}</TableCell>
                        <TableCell><Badge variant={s.active ? "default" : "outline"}>{s.active ? "Active" : "Inactive"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  )
}
