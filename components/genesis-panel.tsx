"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Globe, Lock, Map, RefreshCw, Rocket, Shield, Sparkles } from "lucide-react"
import { useCallback, useState } from "react"

type GenesisTab = "genesis" | "civic" | "strategy"

const DEMO_PROTOCOLS = [
  { id: "1", protocol_name: "Dawn Abstain", protocol_type: "abstain", chain_delegation_target: "Chairman", devotion_signature: "0xab3f...e7c1", status: "active" },
  { id: "2", protocol_name: "Kraken Genesis", protocol_type: "genesis", chain_delegation_target: "Meta-Agent #150", devotion_signature: "0x7d2a...f4b8", status: "active" },
  { id: "3", protocol_name: "Recursive Sprint", protocol_type: "genesis", chain_delegation_target: null, devotion_signature: null, status: "pending" },
]

const DEMO_VAULTS = [
  { id: "1", vault_name: "Ancestral Alpha Archive", entry_type: "ancestral", chain_id: "chain-001" },
  { id: "2", vault_name: "2026 Intent Crystal", entry_type: "contemporary", chain_id: "chain-002" },
  { id: "3", vault_name: "Civilizational Blueprint", entry_type: "prophetic", chain_id: "chain-003" },
]

const DEMO_CIVIC_ACTIONS = [
  { id: "1", action_type: "legislative_bypass", jurisdiction: "Minnesota", bill_reference: "HF-2847", safety_physics_score: 82, lobby_exposure_pct: 67, fulfillment_dividend: 14500, status: "active" },
  { id: "2", action_type: "sanctuary_provision", jurisdiction: "California", bill_reference: "SB-1024", safety_physics_score: 91, lobby_exposure_pct: 43, fulfillment_dividend: 22000, status: "active" },
]

const DEMO_SHIELDS = [
  { id: "1", shield_name: "School District Alpha", scope: "local", active: true, threat_blocked_count: 7 },
  { id: "2", shield_name: "Regional Healthcare", scope: "regional", active: true, threat_blocked_count: 3 },
]

const DEMO_CANVAS = [
  { id: "1", canvas_name: "Q2 Strategic Pivot", judgment_density_score: 87, overnight_retraining_status: "complete", revision_count: 4 },
  { id: "2", canvas_name: "Global Expansion Map", judgment_density_score: 72, overnight_retraining_status: "queued", revision_count: 1 },
]

const DEMO_IP_LICENSES = [
  { id: "1", asset_name: "RAG Pipeline v3", license_type: "standard", royalty_pct: 15, targeting_integrity_score: 95, status: "active" },
  { id: "2", asset_name: "Sentiment Classifier", license_type: "open", royalty_pct: 0, targeting_integrity_score: 88, status: "active" },
]

export default function GenesisPanel() {
  const [tab, setTab] = useState<GenesisTab>("genesis")
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
            <Rocket className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Project Genesis</h2>
              <p className="text-sm text-muted-foreground">Creation protocols, civic sovereignty & strategic command</p>
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
                <Sparkles className="h-4 w-4 text-chart-1" />
                <span className="text-sm text-muted-foreground">Active Protocols</span>
              </div>
              <p className="text-2xl font-bold">{DEMO_PROTOCOLS.filter(p => p.status === "active").length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-4 w-4 text-chart-2" />
                <span className="text-sm text-muted-foreground">Memory Vaults</span>
              </div>
              <p className="text-2xl font-bold">{DEMO_VAULTS.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-chart-3" />
                <span className="text-sm text-muted-foreground">Sanctuary Shields</span>
              </div>
              <p className="text-2xl font-bold">{DEMO_SHIELDS.length}</p>
              <p className="text-xs text-muted-foreground mt-1">{DEMO_SHIELDS.reduce((s, sh) => s + sh.threat_blocked_count, 0)} threats blocked</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Map className="h-4 w-4 text-chart-4" />
                <span className="text-sm text-muted-foreground">Strategy Canvas</span>
              </div>
              <p className="text-2xl font-bold">{DEMO_CANVAS.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Avg density: {Math.round(DEMO_CANVAS.reduce((s, c) => s + c.judgment_density_score, 0) / DEMO_CANVAS.length)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as GenesisTab)}>
          <TabsList>
            <TabsTrigger value="genesis">Genesis</TabsTrigger>
            <TabsTrigger value="civic">Civic</TabsTrigger>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
          </TabsList>

          {/* Genesis Tab */}
          <TabsContent value="genesis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Genesis Protocols</CardTitle>
                <CardDescription>Abstain protocols, chain delegations & devotion signatures</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Chain Target</TableHead>
                      <TableHead>Devotion</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_PROTOCOLS.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.protocol_name}</TableCell>
                        <TableCell><Badge variant="secondary">{p.protocol_type}</Badge></TableCell>
                        <TableCell>{p.chain_delegation_target ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{p.devotion_signature ?? "—"}</TableCell>
                        <TableCell><Badge variant={p.status === "active" ? "default" : "outline"}>{p.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Atlantis Memory Vaults</CardTitle>
                <CardDescription>Deep-time intent stored in 12,000-year resistant crystalline lattice</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vault</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Chain ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_VAULTS.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.vault_name}</TableCell>
                        <TableCell><Badge variant="secondary">{v.entry_type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{v.chain_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Civic Tab */}
          <TabsContent value="civic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Legislative Actions</CardTitle>
                <CardDescription>Tribal safety standards when government is blocked</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Jurisdiction</TableHead>
                      <TableHead>Safety</TableHead>
                      <TableHead>Lobby %</TableHead>
                      <TableHead>Dividend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_CIVIC_ACTIONS.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.action_type.replace(/_/g, " ")}</TableCell>
                        <TableCell>{a.jurisdiction}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={a.safety_physics_score} className="w-16" />
                            <span className="text-xs">{a.safety_physics_score}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-amber-500">{a.lobby_exposure_pct}%</TableCell>
                        <TableCell className="text-emerald-500">${a.fulfillment_dividend.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sanctuary Shields</CardTitle>
                <CardDescription>Jurisdictional air-gaps protecting tribal buildings</CardDescription>
              </CardHeader>
              <CardContent>
                {DEMO_SHIELDS.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div>
                      <p className="font-medium">{s.shield_name}</p>
                      <Badge variant="secondary" className="text-xs mt-1">{s.scope}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{s.threat_blocked_count} blocked</span>
                      <Badge variant={s.active ? "default" : "outline"}>{s.active ? "Active" : "Off"}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Strategy Tab */}
          <TabsContent value="strategy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sovereign Canvas</CardTitle>
                <CardDescription>Maven-style strategy snapshots with judgment density tracking</CardDescription>
              </CardHeader>
              <CardContent>
                {DEMO_CANVAS.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div>
                      <p className="font-medium">{c.canvas_name}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">Rev {c.revision_count}</Badge>
                        <Badge variant={c.overnight_retraining_status === "complete" ? "default" : "secondary"} className="text-xs">{c.overnight_retraining_status}</Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Judgment: <span className="font-bold">{c.judgment_density_score}</span></p>
                      <Progress value={c.judgment_density_score} className="w-24 mt-1" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tribal IP Licenses</CardTitle>
                <CardDescription>P2P workflow licensing with authorship sovereignty</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>License</TableHead>
                      <TableHead>Royalty</TableHead>
                      <TableHead>Integrity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DEMO_IP_LICENSES.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.asset_name}</TableCell>
                        <TableCell><Badge variant="secondary">{l.license_type}</Badge></TableCell>
                        <TableCell>{l.royalty_pct}%</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={l.targeting_integrity_score} className="w-16" />
                            <span className="text-xs">{l.targeting_integrity_score}</span>
                          </div>
                        </TableCell>
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
