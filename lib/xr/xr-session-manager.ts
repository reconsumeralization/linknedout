/**
 * XR Session Manager — Spatial Cockpit (Progressive Enhancement)
 *
 * This module provides WebXR session management for the LinkedOut Spatial
 * Cockpit. It is a progressive enhancement: every function degrades gracefully
 * when WebXR is unavailable (e.g. desktop browsers, SSR, older devices).
 *
 * The Spatial Cockpit projects LinkedOut surfaces (globe, dashboard HUD,
 * workflow timelines, trade boards, governance votes) into AR/VR space so
 * users can interact with their professional network in 3D.
 *
 * All navigator.xr access uses `(navigator as any).xr` because the WebXR
 * Device API types are not always bundled with the default TypeScript DOM lib.
 */

import type {
  SpatialCockpitConfig,
  XRSessionMode,
  XRProjectionType,
  XRProjection,
} from "@/lib/shared/types"

// ---------------------------------------------------------------------------
// Types for WebXR objects (not in default TS lib)
// ---------------------------------------------------------------------------

/** Minimal XRSession surface used by this module. */
interface XRSession {
  end(): Promise<void>
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

interface XRSupportResult {
  ar: boolean
  vr: boolean
  inline: boolean
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/**
 * Probes the browser for WebXR support across the three standard session
 * modes. Returns `{ ar, vr, inline }` booleans. Safe to call during SSR —
 * returns all-false when `navigator` is unavailable.
 */
export async function checkXRSupport(): Promise<XRSupportResult> {
  const noSupport: XRSupportResult = { ar: false, vr: false, inline: false }

  if (typeof navigator === "undefined") return noSupport

  const xr = (navigator as any).xr
  if (!xr || typeof xr.isSessionSupported !== "function") return noSupport

  const [ar, vr, inline] = await Promise.all([
    xr.isSessionSupported("immersive-ar").catch(() => false),
    xr.isSessionSupported("immersive-vr").catch(() => false),
    xr.isSessionSupported("inline").catch(() => false),
  ])

  return { ar: Boolean(ar), vr: Boolean(vr), inline: Boolean(inline) }
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** Feature sets requested per session mode. */
const FEATURES_BY_MODE: Record<XRSessionMode, string[]> = {
  "immersive-ar": ["local-floor", "hand-tracking", "hit-test"],
  "immersive-vr": ["local-floor", "hand-tracking"],
  inline: [],
}

/**
 * Requests a WebXR session from the browser. The caller should have already
 * confirmed support via `checkXRSupport`. Returns `null` when the request
 * fails or WebXR is not available.
 */
export async function initXRSession(
  mode: XRSessionMode,
): Promise<XRSession | null> {
  if (typeof navigator === "undefined") return null

  const xr = (navigator as any).xr
  if (!xr || typeof xr.requestSession !== "function") return null

  const requiredFeatures = FEATURES_BY_MODE[mode] ?? []

  try {
    const session: XRSession = await xr.requestSession(mode, {
      requiredFeatures:
        requiredFeatures.length > 0 ? requiredFeatures : undefined,
      optionalFeatures: ["dom-overlay", "anchors"],
    })
    return session
  } catch (err) {
    console.warn(`[xr-session-manager] Failed to init ${mode} session:`, err)
    return null
  }
}

/**
 * Ends an active XR session. Silently catches errors so callers do not need
 * to wrap this in try/catch.
 */
export async function endXRSession(session: XRSession): Promise<void> {
  try {
    await session.end()
  } catch (err) {
    console.warn("[xr-session-manager] Error ending session:", err)
  }
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/**
 * Returns a sensible default `SpatialCockpitConfig` for the given session
 * mode. AR mode enables passthrough; VR mode enables voice commands.
 */
export function createDefaultCockpitConfig(
  mode: XRSessionMode,
): SpatialCockpitConfig {
  const isAR = mode === "immersive-ar"

  return {
    sessionMode: mode,
    activeProjections: isAR
      ? ["globe", "dashboard_hud"]
      : ["globe", "dashboard_hud", "workflow_timeline", "trade_board"],
    globeScale: isAR ? 0.5 : 1.0,
    hudPosition: "right",
    handTrackingEnabled: mode !== "inline",
    voiceCommandsEnabled: mode === "immersive-vr",
    passthrough: isAR,
  }
}

// ---------------------------------------------------------------------------
// Coordinate mapping
// ---------------------------------------------------------------------------

/** Degrees-to-radians constant. */
const DEG_TO_RAD = Math.PI / 180

/**
 * Maps a DeckGL / Mapbox-style 2D view state into XR 3D world coordinates.
 *
 * - Longitude maps to the X axis (scaled by `globeScale`).
 * - Latitude maps to the Y axis.
 * - Zoom is converted to a Z depth (closer zoom = nearer to user).
 * - Pitch and bearing become X and Y rotations respectively.
 *
 * The returned position and rotation can be fed directly into an XR
 * reference space transform.
 */
export function mapDeckGLViewStateToXR(
  viewState: {
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
  },
  globeScale: number,
): { position: [number, number, number]; rotation: [number, number, number] } {
  const { longitude, latitude, zoom, pitch, bearing } = viewState

  // Normalise longitude [-180, 180] and latitude [-90, 90] into a unit sphere
  // then scale by globeScale to set the world size.
  const x = (longitude / 180) * globeScale
  const y = (latitude / 90) * globeScale

  // Zoom 0 = far away (z ~ -10), zoom 22 = very close (z ~ -0.1).
  // Exponential fall-off keeps the globe readable at all zoom levels.
  const z = -10 * Math.pow(0.85, zoom) * globeScale

  // Pitch (0-60 deg) maps to rotation around X; bearing to rotation around Y.
  const rotX = pitch * DEG_TO_RAD
  const rotY = bearing * DEG_TO_RAD
  const rotZ = 0

  return {
    position: [x, y, z],
    rotation: [rotX, rotY, rotZ],
  }
}

// ---------------------------------------------------------------------------
// HUD projection helpers
// ---------------------------------------------------------------------------

/** Default positions for each projection type (meters from origin). */
const DEFAULT_POSITIONS: Record<
  XRProjectionType,
  { x: number; y: number; z: number }
> = {
  globe: { x: 0, y: 0, z: -2.0 },
  dashboard_hud: { x: 1.2, y: 0.6, z: -1.5 },
  workflow_timeline: { x: -1.2, y: 0.3, z: -1.5 },
  trade_board: { x: 0, y: -0.4, z: -1.8 },
  governance_vote: { x: -0.6, y: 0.8, z: -1.2 },
}

/**
 * Creates an `XRProjection` configuration for a HUD panel. If no explicit
 * position is supplied the function falls back to curated defaults that
 * arrange panels ergonomically around the user.
 */
export function createHUDProjection(
  type: XRProjectionType,
  position?: { x: number; y: number; z: number },
): XRProjection {
  const pos = position ?? DEFAULT_POSITIONS[type]

  return {
    type,
    dataSource: `linkedout://${type}`,
    position: pos,
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1.0,
    opacity: 0.92,
  }
}
