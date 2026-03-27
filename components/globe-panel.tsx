"use client"

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react"
import DeckGL from "@deck.gl/react"
import { ArcLayer, LineLayer, ScatterplotLayer } from "@deck.gl/layers"
import type { MapViewState, PickingInfo } from "@deck.gl/core"
import Map, { type MapRef } from "react-map-gl/maplibre"
import { Check, Crosshair, MapPin, Pause, Play, Search, UserRound, Users, Wifi, WifiOff } from "lucide-react"

import { EnterXRButton } from "@/components/spatial-cockpit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { buildGlobeLiveData, type GlobeLiveDataSnapshot } from "@/lib/globe/globe-live-data"
import { getSupabaseClient } from "@/lib/supabase/supabase"
import {
  fetchSupabaseProfiles,
  fetchSupabaseProjects,
  fetchSupabaseTribes,
  subscribeToProfiles,
  subscribeToProjects,
  subscribeToTribes,
} from "@/lib/supabase/supabase-data"
import type {
  FriendLocation,
  GlobeMapStyle,
  GlobeConnectionLine,
  GlobeProfileDot,
  GlobeProjectArc,
  GlobeSelectedItem,
  GlobeTribeCluster,
} from "@/lib/shared/types"

// Free map styles (no API key or credit card). MapLibre + CARTO/OSM.
const MAP_STYLES: Record<GlobeMapStyle, string> = {
  streets:
    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark:
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  satellite:
    "https://demotiles.maplibre.org/style.json",
}

type LayerConfig = {
  profiles: boolean
  tribes: boolean
  projects: boolean
  friends: boolean
  connections: boolean
  agenticPulse: boolean      // Sovereign: active workflow arcs
  alphaBeacons: boolean      // Sovereign: unique strengths brightness
  tariffHeatmap: boolean     // Sovereign: refund activity regions
  infrastructure: boolean    // Sovereign: basepower, orbital, lunar
  governanceArcs: boolean
  marketplaceHotspots: boolean
  tradeRoutes: boolean
  singularityPulse: boolean
  imaginationArcs: boolean
  surpriseMonitor: boolean
  opacity: number
  rotationPaused: boolean
}

const DEFAULT_VIEW_STATE: MapViewState = {
  longitude: -20,
  latitude: 22,
  zoom: 1.4,
  bearing: 0,
  pitch: 35,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const MAPLIBRE_CSS_HREF = "https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css"

class GlobeErrorBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function isWebGL2Supported(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    if (!gl || typeof gl.getParameter !== "function") return false
    const max = gl.getParameter(0x0D33) // MAX_TEXTURE_SIZE
    return typeof max === "number" && max >= 1024
  } catch {
    return false
  }
}

export function GlobePanel() {
  const mapRef = useRef<MapRef | null>(null)
  const rotateFrameRef = useRef<number | null>(null)
  const isInteractingRef = useRef(false)
  const [webglReady, setWebglReady] = useState(false)
  const [webglError, setWebglError] = useState(false)

  useEffect(() => {
    if (document.querySelector(`link[href="${MAPLIBRE_CSS_HREF}"]`)) return
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = MAPLIBRE_CSS_HREF
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  useEffect(() => {
    if (webglReady || webglError) return
    const ok = isWebGL2Supported()
    if (ok) {
      requestAnimationFrame(() => setWebglReady(true))
    } else {
      setWebglError(true)
    }
  }, [webglReady, webglError])

  const [viewState, setViewState] = useState<MapViewState>(DEFAULT_VIEW_STATE)
  const [layerConfig, setLayerConfig] = useState<LayerConfig>({
    profiles: true,
    tribes: true,
    projects: true,
    friends: true,
    connections: true,
    agenticPulse: false,
    alphaBeacons: false,
    tariffHeatmap: false,
    infrastructure: false,
    governanceArcs: false,
    marketplaceHotspots: false,
    tradeRoutes: false,
    singularityPulse: false,
    imaginationArcs: false,
    surpriseMonitor: false,
    opacity: 92,
    rotationPaused: false,
  })
  const [mapStyle, setMapStyle] = useState<GlobeMapStyle>("dark")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedItem, setSelectedItem] = useState<GlobeSelectedItem | null>(null)
  const [friendLocations, setFriendLocations] = useState<FriendLocation[]>([])
  const [consentListOpen, setConsentListOpen] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [consentByFriend, setConsentByFriend] = useState<Record<string, boolean>>({})
  const [liveLayerData, setLiveLayerData] = useState<GlobeLiveDataSnapshot>({
    profileDots: [],
    tribeClusters: [],
    projectArcs: [],
    connectionLines: [],
  })
  const [isLayerSyncing, setIsLayerSyncing] = useState(false)

  const loadLiveLayerData = useCallback(async () => {
    setIsLayerSyncing(true)
    try {
      const [profiles, tribes, projects] = await Promise.all([
        fetchSupabaseProfiles(),
        fetchSupabaseTribes(),
        fetchSupabaseProjects(),
      ])
      setLiveLayerData(
        buildGlobeLiveData({
          profiles,
          tribes,
          projects,
        }),
      )
    } finally {
      setIsLayerSyncing(false)
    }
  }, [])

  useEffect(() => {
    void loadLiveLayerData()
    const subscriptions = [
      subscribeToProfiles(() => {
        void loadLiveLayerData()
      }),
      subscribeToTribes(() => {
        void loadLiveLayerData()
      }),
      subscribeToProjects(() => {
        void loadLiveLayerData()
      }),
    ].filter(Boolean) as Array<() => void>

    return () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe()
      }
    }
  }, [loadLiveLayerData])

  useEffect(() => {
    const supabase = getSupabaseClient()

    if (!supabase) {
      setRealtimeConnected(false)
      return
    }

    const loadInitialFriendLocations = async () => {
      const { data, error } = await supabase
        .from("friend_locations")
        .select("*")
        .limit(300)

      if (error || !data) {
        return
      }

      const mapped = data.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? "Unknown"),
        headline: String(row.headline ?? "Friend"),
        longitude: Number(row.longitude ?? 0),
        latitude: Number(row.latitude ?? 0),
        lastSeen: String(row.last_seen ?? new Date().toISOString()),
        consentGiven: Boolean(row.consent_given ?? true),
      }))

      setFriendLocations(mapped)
      setConsentByFriend((current) => {
        const next = { ...current }
        for (const friend of mapped) {
          if (typeof next[friend.id] !== "boolean") {
            next[friend.id] = friend.consentGiven
          }
        }
        return next
      })
    }

    void loadInitialFriendLocations()

    const channel = supabase
      .channel("friend_locations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_locations" },
        (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const row = payload.new ?? payload.old
          if (!row || !row.id) {
            return
          }

          setFriendLocations((current) => {
            const next: FriendLocation = {
              id: String(row.id),
              name: String(row.name ?? "Unknown"),
              headline: String(row.headline ?? "Friend"),
              longitude: Number(row.longitude ?? 0),
              latitude: Number(row.latitude ?? 0),
              lastSeen: String(row.last_seen ?? new Date().toISOString()),
              consentGiven: Boolean(row.consent_given ?? true),
            }

            const index = current.findIndex((item) => item.id === next.id)
            if (index === -1) {
              return [...current, next]
            }

            const copy = [...current]
            copy[index] = next
            return copy
          })
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED")
      })

    return () => {
      supabase.removeChannel(channel)
      setRealtimeConnected(false)
    }
  }, [])

  useEffect(() => {
    const animate = () => {
      setViewState((current) => {
        if (isInteractingRef.current || layerConfig.rotationPaused) {
          return current
        }
        return {
          ...current,
          longitude: current.longitude + 0.008,
        }
      })
      rotateFrameRef.current = window.requestAnimationFrame(animate)
    }
    rotateFrameRef.current = window.requestAnimationFrame(animate)
    return () => {
      if (rotateFrameRef.current !== null) {
        window.cancelAnimationFrame(rotateFrameRef.current)
      }
    }
  }, [layerConfig.rotationPaused])

  const visibleFriends = useMemo(() => {
    return friendLocations.filter((friend) => friend.consentGiven && consentByFriend[friend.id] !== false)
  }, [friendLocations, consentByFriend])
  const hasMappedLiveData =
    liveLayerData.profileDots.length > 0 ||
    liveLayerData.tribeClusters.length > 0 ||
    liveLayerData.projectArcs.length > 0

  const opacity = layerConfig.opacity / 100

  const layers = useMemo(() => {
    const nextLayers = []

    if (layerConfig.connections) {
      nextLayers.push(
        new LineLayer<GlobeConnectionLine>({
          id: "connection-lines",
          data: liveLayerData.connectionLines,
          pickable: true,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getColor: [120, 200, 255, Math.round(95 * opacity)],
          getWidth: 2.5,
          widthMinPixels: 2,
          widthMaxPixels: 4,
        }),
      )
    }

    if (layerConfig.projects) {
      nextLayers.push(
        new ArcLayer<GlobeProjectArc>({
          id: "project-arcs",
          data: liveLayerData.projectArcs,
          pickable: true,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getSourceColor: [34, 211, 238, Math.round(220 * opacity)],
          getTargetColor: [251, 146, 60, Math.round(220 * opacity)],
          getWidth: 3.5,
          getHeight: 0.5,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          onClick: (info) => {
            if (!info.object) {
              return
            }

            const midLongitude = (info.object.sourcePosition[0] + info.object.targetPosition[0]) / 2
            const midLatitude = (info.object.sourcePosition[1] + info.object.targetPosition[1]) / 2

            setSelectedItem({
              type: "project",
              id: info.object.id,
              name: info.object.name,
              details: "Cross-region project arc",
              longitude: midLongitude,
              latitude: midLatitude,
            })
          },
        }),
      )
    }

    if (layerConfig.tribes) {
      nextLayers.push(
        new ScatterplotLayer<GlobeTribeCluster>({
          id: "tribe-clusters",
          data: liveLayerData.tribeClusters,
          pickable: true,
          stroked: true,
          filled: true,
          radiusUnits: "meters",
          getPosition: (d) => [d.longitude, d.latitude],
          getRadius: (d) => 220000 + d.memberCount * 8000,
          getFillColor: (d) => [...d.color, Math.round(230 * opacity)],
          getLineColor: [255, 255, 255, 200],
          getLineWidth: 3,
          radiusMinPixels: 6,
          radiusMaxPixels: 28,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          onClick: (info) => {
            if (!info.object) {
              return
            }

            setSelectedItem({
              type: "tribe",
              id: info.object.id,
              name: info.object.name,
              details: `${info.object.memberCount} members`,
              longitude: info.object.longitude,
              latitude: info.object.latitude,
            })
          },
        }),
      )
    }

    if (layerConfig.profiles) {
      nextLayers.push(
        new ScatterplotLayer<GlobeProfileDot>({
          id: "profile-dots",
          data: liveLayerData.profileDots,
          pickable: true,
          stroked: true,
          filled: true,
          radiusUnits: "meters",
          getPosition: (d) => [d.longitude, d.latitude],
          getRadius: (d) => 45000 + Math.min(d.connectionCount * 280, 120000),
          getFillColor: (d) => {
            const t = Math.min(1, d.connectionCount / 800)
            return [96 + t * 80, 165, 250, Math.round(235 * opacity)]
          },
          getLineColor: [255, 255, 255, 180],
          getLineWidth: 2,
          radiusMinPixels: 4,
          radiusMaxPixels: 18,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 70],
          onClick: (info) => {
            if (!info.object) {
              return
            }

            setSelectedItem({
              type: "profile",
              id: info.object.id,
              name: info.object.name,
              details: `${info.object.headline} | ${info.object.connectionCount} connections`,
              longitude: info.object.longitude,
              latitude: info.object.latitude,
            })
          },
        }),
      )
    }

    if (layerConfig.friends) {
      nextLayers.push(
        new ScatterplotLayer<FriendLocation>({
          id: "friend-locations",
          data: visibleFriends,
          pickable: true,
          stroked: true,
          filled: true,
          radiusUnits: "meters",
          getPosition: (d) => [d.longitude, d.latitude],
          getRadius: 95000,
          getFillColor: [20, 210, 140, Math.round(250 * opacity)],
          getLineColor: [255, 255, 255, 240],
          getLineWidth: 2.5,
          radiusMinPixels: 6,
          radiusMaxPixels: 14,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          onClick: (info) => {
            if (!info.object) {
              return
            }

            setSelectedItem({
              type: "friend",
              id: info.object.id,
              name: info.object.name,
              details: `${info.object.headline} - last seen ${new Date(info.object.lastSeen).toLocaleTimeString()}`,
              longitude: info.object.longitude,
              latitude: info.object.latitude,
            })
          },
        }),
      )
    }

    return nextLayers
  }, [layerConfig, liveLayerData, opacity, visibleFriends])

  const onDeckClick = (info: PickingInfo) => {
    if (!info.object) {
      setSelectedItem(null)
    }
  }

  const onSearch = () => {
    const needle = searchQuery.trim().toLowerCase()
    if (!needle) {
      return
    }

    const matches = [
      ...liveLayerData.profileDots.map((item) => ({
        type: "profile" as const,
        id: item.id,
        name: item.name,
        details: item.headline,
        longitude: item.longitude,
        latitude: item.latitude,
      })),
      ...liveLayerData.tribeClusters.map((item) => ({
        type: "tribe" as const,
        id: item.id,
        name: item.name,
        details: `${item.memberCount} members`,
        longitude: item.longitude,
        latitude: item.latitude,
      })),
      ...liveLayerData.projectArcs.map((item) => ({
        type: "project" as const,
        id: item.id,
        name: item.name,
        details: "Cross-region project arc",
        longitude: (item.sourcePosition[0] + item.targetPosition[0]) / 2,
        latitude: (item.sourcePosition[1] + item.targetPosition[1]) / 2,
      })),
      ...visibleFriends.map((item) => ({
        type: "friend" as const,
        id: item.id,
        name: item.name,
        details: item.headline,
        longitude: item.longitude,
        latitude: item.latitude,
      })),
    ]

    const found = matches.find((item) => item.name.toLowerCase().includes(needle))
    if (!found) {
      return
    }

    setSelectedItem(found)

    setViewState((current) => ({
      ...current,
      longitude: found.longitude,
      latitude: found.latitude,
      zoom: 3.2,
    }))
    mapRef.current?.flyTo({
      center: [found.longitude, found.latitude],
      zoom: 3.2,
      duration: 900,
      essential: true,
    })
  }

  if (webglError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">Globe unavailable</CardTitle>
            <CardDescription>
              WebGL could not be initialized. Try enabling hardware acceleration in your browser
              settings, or use a different browser or device. This can also happen in remote
              sessions or when the GPU is unavailable.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!webglReady) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md border-border bg-card">
          <CardContent className="flex flex-col items-center gap-3 pt-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading globe...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const globeContent = (
    <div className="relative h-full w-full overflow-hidden">
      <DeckGL
        controller
        layers={layers}
        viewState={viewState}
        onClick={onDeckClick}
        onViewStateChange={({ viewState: nextViewState }) => {
          setViewState(nextViewState as MapViewState)
        }}
        onInteractionStateChange={({ isDragging, isPanning, isRotating, isZooming }) => {
          isInteractingRef.current = Boolean(isDragging || isPanning || isRotating || isZooming)
        }}
      >
        <Map
          ref={mapRef}
          reuseMaps
          projection="globe"
          mapStyle={MAP_STYLES[mapStyle]}
          attributionControl={false}
        />
      </DeckGL>

      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="pointer-events-auto absolute left-4 top-4 w-[360px] space-y-3">
          <Card className="border-border/80 bg-background/85 backdrop-blur-sm">
            <CardContent className="space-y-3 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search profile, tribe, project, or friend"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onSearch()
                    }
                  }}
                />
                <Button size="sm" onClick={onSearch} className="shrink-0 gap-1">
                  <Search className="h-3.5 w-3.5" />
                  Find
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(["satellite", "dark", "streets"] as GlobeMapStyle[]).map((style) => (
                  <Button
                    key={style}
                    size="sm"
                    variant={mapStyle === style ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setMapStyle(style)}
                  >
                    {style}
                  </Button>
                ))}
                <EnterXRButton />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Rotation</span>
                <Button
                  size="sm"
                  variant={layerConfig.rotationPaused ? "default" : "outline"}
                  className="h-7 gap-1 text-[11px]"
                  onClick={() =>
                    setLayerConfig((c) => ({ ...c, rotationPaused: !c.rotationPaused }))
                  }
                >
                  {layerConfig.rotationPaused ? (
                    <>
                      <Play className="h-3 w-3" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-3 w-3" />
                      Pause
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {realtimeConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  {realtimeConnected ? "Supabase Realtime" : "Realtime Disconnected"}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {visibleFriends.length} online
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{hasMappedLiveData ? "CRM geography loaded" : "No mapped CRM geography"}</span>
                <Badge variant="outline" className="text-[10px]">
                  {liveLayerData.profileDots.length} profiles
                </Badge>
              </div>

              {isLayerSyncing ? (
                <p className="text-[10px] text-muted-foreground">Syncing profile, tribe, and project layers...</p>
              ) : null}

              {!hasMappedLiveData ? (
                <p className="text-[10px] text-muted-foreground">
                  Sign in and add recognizable profile locations to populate the globe beyond live friends.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="pointer-events-auto absolute right-4 top-4 w-[340px] space-y-3">
          <Card className="border-border/80 bg-background/90 backdrop-blur-md shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Data Layers</CardTitle>
              <CardDescription className="text-[11px]">
                Toggle layers and adjust opacity.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="max-h-[60vh] overflow-y-auto pr-2">
              <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Network
                </p>
                {([
                  ["connections", "Connections", "Links between nodes"],
                  ["projects", "Project arcs", "Cross-region initiatives"],
                ] as const).map(([key, label, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{label}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{desc}</p>
                    </div>
                    <Switch
                      checked={layerConfig[key]}
                      onCheckedChange={(checked) =>
                        setLayerConfig((c) => ({ ...c, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  People & tribes
                </p>
                {([
                  ["profiles", "Profiles", "CRM by connection count"],
                  ["tribes", "Tribes", "Clusters by member count"],
                  ["friends", "Live friends", "Realtime locations"],
                ] as const).map(([key, label, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{label}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{desc}</p>
                    </div>
                    <Switch
                      checked={layerConfig[key]}
                      onCheckedChange={(checked) =>
                        setLayerConfig((c) => ({ ...c, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Sovereign layers
                </p>
                {([
                  ["agenticPulse", "Agentic Pulse", "Active AI workflow arcs"],
                  ["alphaBeacons", "Strength Beacons", "Unique strengths brightness map"],
                  ["tariffHeatmap", "Tariff Heatmap", "Refund activity by region"],
                  ["infrastructure", "Infrastructure", "Basepower, orbital, lunar"],
                ] as const).map(([key, label, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{label}</span>
                      <p className="text-[10px] text-muted-foreground truncate">{desc}</p>
                    </div>
                    <Switch
                      checked={layerConfig[key]}
                      onCheckedChange={(checked) =>
                        setLayerConfig((c) => ({ ...c, [key]: checked }))
                      }
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Governance Arcs</label>
                  <Switch checked={layerConfig.governanceArcs} onCheckedChange={(c) => setLayerConfig((prev) => ({ ...prev, governanceArcs: c }))} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Marketplace Hotspots</label>
                  <Switch checked={layerConfig.marketplaceHotspots} onCheckedChange={(c) => setLayerConfig((prev) => ({ ...prev, marketplaceHotspots: c }))} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Trade Routes</label>
                  <Switch checked={layerConfig.tradeRoutes} onCheckedChange={(c) => setLayerConfig((prev) => ({ ...prev, tradeRoutes: c }))} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Activity Pulse</label>
                  <Switch checked={layerConfig.singularityPulse} onCheckedChange={(c) => setLayerConfig((prev) => ({ ...prev, singularityPulse: c }))} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Imagination Arcs</label>
                  <Switch checked={layerConfig.imaginationArcs} onCheckedChange={(c) => setLayerConfig((prev) => ({ ...prev, imaginationArcs: c }))} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Surprise Monitor</label>
                  <Switch checked={layerConfig.surpriseMonitor} onCheckedChange={(c) => setLayerConfig((prev) => ({ ...prev, surpriseMonitor: c }))} />
                </div>
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Layer opacity</span>
                  <span>{layerConfig.opacity}%</span>
                </div>
                <Slider
                  value={[layerConfig.opacity]}
                  min={20}
                  max={100}
                  step={5}
                  onValueChange={(values) => {
                    const next = values[0]
                    if (typeof next === "number") {
                      setLayerConfig((c) => ({ ...c, opacity: next }))
                    }
                  }}
                />
              </div>
              </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-background/85 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Friend Consent</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Collapsible open={consentListOpen} onOpenChange={setConsentListOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="h-8 w-full justify-between text-xs">
                    Manage friend visibility
                    {consentListOpen ? "Hide" : "Show"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {friendLocations.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1.5">
                      <div>
                        <p className="text-xs font-medium">{friend.name}</p>
                        <p className="text-[10px] text-muted-foreground">{friend.headline}</p>
                      </div>
                      <Switch
                        checked={consentByFriend[friend.id] !== false}
                        onCheckedChange={(checked) => {
                          setConsentByFriend((current) => ({ ...current, [friend.id]: checked }))
                        }}
                      />
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </div>

        {selectedItem ? (
          <div className="pointer-events-auto absolute bottom-4 left-4 w-[380px] animate-in slide-in-from-left-4 duration-200">
            <Card className="border-border/80 bg-background/95 backdrop-blur-md shadow-xl">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      {selectedItem.type === "friend" ? (
                        <UserRound className="h-4 w-4" />
                      ) : selectedItem.type === "tribe" ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        <MapPin className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">{selectedItem.name}</CardTitle>
                      <CardDescription className="text-[11px] truncate">
                        {selectedItem.details}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 uppercase text-[10px]">
                    {selectedItem.type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-0 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setViewState((v) => ({
                      ...v,
                      longitude: selectedItem.longitude,
                      latitude: selectedItem.latitude,
                      zoom: 3.2,
                    }))
                    mapRef.current?.flyTo({
                      center: [selectedItem.longitude, selectedItem.latitude],
                      zoom: 3.2,
                      duration: 800,
                      essential: true,
                    })
                  }}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Focus on map
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Click map background to close.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-border/80 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
          <MapPin className="h-3.5 w-3.5" />
          <span>Interactive 3D Globe</span>
          <Check className="h-3.5 w-3.5 text-green-500" />
        </div>
      </div>
    </div>
  )

  return (
    <GlobeErrorBoundary onError={() => setWebglError(true)}>
      {globeContent}
    </GlobeErrorBoundary>
  )
}
