"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  checkXRSupport,
  initXRSession,
  endXRSession,
  createDefaultCockpitConfig,
} from "@/lib/xr/xr-session-manager"
import type { SpatialCockpitConfig, XRSessionMode } from "@/lib/shared/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Glasses, MonitorSmartphone, X, Maximize2 } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface XRSupport {
  ar: boolean
  vr: boolean
}

interface EnterXRButtonProps {
  onSessionStart?: (session: unknown) => void
  onSessionEnd?: () => void
}

interface SpatialCockpitProps {
  isActive: boolean
  onClose: () => void
  globeViewState?: {
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
  }
}

// ---------------------------------------------------------------------------
// Hook: useXRSupport
// ---------------------------------------------------------------------------

function useXRSupport() {
  const [support, setSupport] = useState<XRSupport>({ ar: false, vr: false })
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function probe() {
      try {
        const result = await checkXRSupport()
        if (!cancelled) {
          setSupport(result)
          setChecked(true)
        }
      } catch {
        if (!cancelled) setChecked(true)
      }
    }
    probe()
    return () => {
      cancelled = true
    }
  }, [])

  return { support, checked }
}

// ---------------------------------------------------------------------------
// XRAvailabilityBadge
// ---------------------------------------------------------------------------

export function XRAvailabilityBadge() {
  const { support, checked } = useXRSupport()

  if (!checked || (!support.ar && !support.vr)) return null

  const label = support.ar && support.vr
    ? "AR + VR"
    : support.ar
      ? "AR Ready"
      : "VR Ready"

  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <Glasses className="h-3 w-3" />
      {label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// EnterXRButton
// ---------------------------------------------------------------------------

export function EnterXRButton({ onSessionStart, onSessionEnd }: EnterXRButtonProps) {
  const { support, checked } = useXRSupport()
  const [loading, setLoading] = useState(false)

  const isSupported = support.ar || support.vr
  const preferredMode: XRSessionMode = support.ar ? "immersive-ar" : "immersive-vr"

  const handleClick = useCallback(async () => {
    if (!isSupported || loading) return
    setLoading(true)
    try {
      const session = await initXRSession(preferredMode)
      onSessionStart?.(session)

      // Listen for session end if the runtime supports it
      if (session && typeof (session as { addEventListener?: unknown }).addEventListener === "function") {
        (session as unknown as EventTarget).addEventListener("end", () => {
          onSessionEnd?.()
        }, { once: true })
      }
    } catch (err) {
      console.error("[SpatialCockpit] Failed to start XR session:", err)
    } finally {
      setLoading(false)
    }
  }, [isSupported, loading, preferredMode, onSessionStart, onSessionEnd])

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!checked || !isSupported || loading}
      onClick={handleClick}
      className="gap-1.5"
    >
      <Glasses className="h-4 w-4" />
      {!checked
        ? "Checking XR..."
        : loading
          ? "Starting..."
          : support.ar
            ? "Enter AR"
            : support.vr
              ? "Enter VR"
              : "No XR"}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// SpatialCockpit (default export)
// ---------------------------------------------------------------------------

export default function SpatialCockpit({
  isActive,
  onClose,
  globeViewState,
}: SpatialCockpitProps) {
  const [config, setConfig] = useState<SpatialCockpitConfig>(() => createDefaultCockpitConfig("immersive-ar"))
  const [sessionActive, setSessionActive] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xrSessionRef = useRef<any>(null)

  // Sync active state
  useEffect(() => {
    setSessionActive(isActive)
  }, [isActive])

  const handleExit = useCallback(async () => {
    try {
      if (xrSessionRef.current) {
        await endXRSession(xrSessionRef.current)
        xrSessionRef.current = null
      }
    } catch (err) {
      console.error("[SpatialCockpit] Error ending XR session:", err)
    }
    setSessionActive(false)
    onClose()
  }, [onClose])

  const toggleHandTracking = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      handTrackingEnabled: !prev.handTrackingEnabled,
    }))
  }, [])

  if (!isActive) return null

  const modeLabel =
    config.sessionMode === "immersive-ar"
      ? "AR"
      : config.sessionMode === "immersive-vr"
        ? "VR"
        : "Inline"

  return (
    <Card className="fixed right-4 top-4 z-50 w-72 border border-white/10 bg-black/70 text-white shadow-2xl backdrop-blur-lg">
      <CardContent className="space-y-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Maximize2 className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">Spatial Cockpit</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-white/70 hover:text-white"
            onClick={handleExit}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Session status */}
        <div className="flex items-center gap-2">
          <Badge
            variant={sessionActive ? "default" : "secondary"}
            className={sessionActive ? "bg-green-600 text-white" : ""}
          >
            {sessionActive ? "Connected to XR" : "Disconnected"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {modeLabel}
          </Badge>
        </div>

        {/* Active projections */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-white/60">Active Projections</p>
          <div className="flex flex-wrap gap-1">
            {config.activeProjections.length === 0 ? (
              <span className="text-xs text-white/40">None</span>
            ) : (
              config.activeProjections.map((proj) => (
                <Badge key={proj} variant="outline" className="text-[10px]">
                  {proj.replace(/_/g, " ")}
                </Badge>
              ))
            )}
          </div>
        </div>

        {/* Hand tracking toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5 text-white/60" />
            <span className="text-xs text-white/80">Hand Tracking</span>
          </div>
          <Button
            size="sm"
            variant={config.handTrackingEnabled ? "default" : "outline"}
            className="h-6 px-2 text-[10px]"
            onClick={toggleHandTracking}
          >
            {config.handTrackingEnabled ? "On" : "Off"}
          </Button>
        </div>

        {/* Globe view state (debug info for v1) */}
        {globeViewState && (
          <div className="space-y-1 rounded bg-white/5 p-2">
            <p className="text-[10px] font-medium text-white/50">Globe View</p>
            <p className="font-mono text-[10px] text-white/40">
              {globeViewState.latitude.toFixed(2)}, {globeViewState.longitude.toFixed(2)} z{globeViewState.zoom.toFixed(1)}
            </p>
          </div>
        )}

        {/* Exit */}
        <Button
          size="sm"
          variant="destructive"
          className="w-full gap-1.5"
          onClick={handleExit}
        >
          <X className="h-3.5 w-3.5" />
          Exit XR Session
        </Button>
      </CardContent>
    </Card>
  )
}
