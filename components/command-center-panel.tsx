"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock,
  Command,
  Loader2,
  Play,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

interface ToolCategory {
  range: string
  name: string
  route: string
}

interface ToolEntry {
  name: string
  description: string
}

interface ExecutionRecord {
  id: string
  tool: string
  params: Record<string, unknown>
  result: unknown
  ok: boolean
  timestamp: string
  durationMs: number
}

type CenterTab = "browse" | "execute" | "history"

export default function CommandCenterPanel() {
  const [tab, setTab] = useState<CenterTab>("browse")
  const [categories, setCategories] = useState<ToolCategory[]>([])
  const [tools, setTools] = useState<ToolEntry[]>([])
  const [totalTools, setTotalTools] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Execute tab state
  const [execToolName, setExecToolName] = useState("")
  const [execParams, setExecParams] = useState("{}")
  const [execResult, setExecResult] = useState<unknown>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  // History
  const [history, setHistory] = useState<ExecutionRecord[]>([])

  const fetchCatalog = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/sovereign?tools=true")
      const data = await res.json()
      if (data.ok) {
        setCategories(data.categories ?? [])
        setTools(data.tools ?? [])
        setTotalTools(data.totalTools ?? 0)
      }
    } catch {
      // Silently handle — will show empty state
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchCatalog() }, [fetchCatalog])

  // Filter tools by search + category
  const filteredTools = useMemo(() => {
    let result = tools
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      )
    }
    if (selectedCategory) {
      // Map category name to tool names (heuristic: match by position in array)
      // For now, search filter is the primary mechanism
    }
    return result
  }, [tools, search, selectedCategory])

  const executeTool = useCallback(async () => {
    if (!execToolName.trim()) return
    setIsExecuting(true)
    setExecResult(null)
    const start = Date.now()
    try {
      let params: Record<string, unknown> = {}
      try { params = JSON.parse(execParams) } catch { /* empty */ }
      const res = await fetch("/api/sovereign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: execToolName.trim(), params }),
      })
      const data = await res.json()
      const duration = Date.now() - start
      setExecResult(data)

      // Add to history
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          tool: execToolName.trim(),
          params,
          result: data,
          ok: data.ok ?? false,
          timestamp: new Date().toISOString(),
          durationMs: duration,
        },
        ...prev.slice(0, 49),
      ])
    } catch (err) {
      setExecResult({ ok: false, error: err instanceof Error ? err.message : "Failed" })
    } finally {
      setIsExecuting(false)
    }
  }, [execToolName, execParams])

  const selectToolForExecution = useCallback((toolName: string) => {
    setExecToolName(toolName)
    setExecParams("{}")
    setExecResult(null)
    setTab("execute")
  }, [])

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Command className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Sovereign Command Center</h2>
              <p className="text-sm text-muted-foreground">
                Browse, execute & monitor all {totalTools} sovereign tools
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchCatalog} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Command className="h-4 w-4 text-chart-1" />
                <span className="text-sm text-muted-foreground">Total Tools</span>
              </div>
              <p className="text-2xl font-bold">{totalTools}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-chart-2" />
                <span className="text-sm text-muted-foreground">Categories</span>
              </div>
              <p className="text-2xl font-bold">{categories.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-chart-3" />
                <span className="text-sm text-muted-foreground">Executions</span>
              </div>
              <p className="text-2xl font-bold">{history.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">Success Rate</span>
              </div>
              <p className="text-2xl font-bold">
                {history.length > 0
                  ? `${Math.round((history.filter((h) => h.ok).length / history.length) * 100)}%`
                  : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as CenterTab)}>
          <TabsList>
            <TabsTrigger value="browse">Browse Tools</TabsTrigger>
            <TabsTrigger value="execute">Execute</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tools by name or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(null)}
              >
                All ({tools.length})
              </Badge>
              {categories.map((cat) => (
                <Badge
                  key={cat.range}
                  variant={selectedCategory === cat.name ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() =>
                    setSelectedCategory(selectedCategory === cat.name ? null : cat.name)
                  }
                >
                  {cat.name} {cat.range}
                </Badge>
              ))}
            </div>

            {/* Tool list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {search ? `${filteredTools.length} results` : `All Tools (${tools.length})`}
                </CardTitle>
                <CardDescription>Click a tool to execute it</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[50vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">Tool Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[80px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTools.map((t) => (
                        <TableRow
                          key={t.name}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => selectToolForExecution(t.name)}
                        >
                          <TableCell className="font-mono text-sm font-medium">
                            {t.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[400px] truncate">
                            {t.description}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredTools.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            {isLoading ? "Loading tools..." : search ? "No tools match your search" : "No tools available"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Execute Tab */}
          <TabsContent value="execute" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Execute Sovereign Tool</CardTitle>
                <CardDescription>
                  POST /api/sovereign with tool name and JSON parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tool Name</label>
                  <Input
                    placeholder="e.g. sovereignCanvas, runBiometricVetting, mapAlgoBrain..."
                    value={execToolName}
                    onChange={(e) => setExecToolName(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Parameters (JSON)</label>
                  <textarea
                    className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder='{ "canvasName": "My Strategy" }'
                    value={execParams}
                    onChange={(e) => setExecParams(e.target.value)}
                  />
                </div>
                <Button onClick={executeTool} disabled={isExecuting || !execToolName.trim()}>
                  {isExecuting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {isExecuting ? "Executing..." : "Execute Tool"}
                </Button>

                {execResult !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {(execResult as { ok?: boolean }).ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm font-medium">
                        {(execResult as { ok?: boolean }).ok ? "Success" : "Error"}
                      </span>
                    </div>
                    <pre className="rounded-md border bg-muted/30 p-3 text-xs font-mono overflow-auto max-h-[300px]">
                      {JSON.stringify(execResult, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Execution History</CardTitle>
                <CardDescription>Last {history.length} tool executions this session</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tool</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="w-[80px]">Replay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="font-mono text-sm">{h.tool}</TableCell>
                          <TableCell>
                            <Badge variant={h.ok ? "default" : "destructive"}>
                              {h.ok ? "OK" : "Error"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {h.durationMs}ms
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(h.timestamp).toLocaleTimeString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setExecToolName(h.tool)
                                setExecParams(JSON.stringify(h.params, null, 2))
                                setExecResult(null)
                                setTab("execute")
                              }}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {history.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No executions yet — browse and run a tool to get started
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  )
}
