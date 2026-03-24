import { z } from "zod"

export const GlobeLayerGeometryTypeSchema = z.enum([
  "point",
  "line",
  "polygon",
  "heatmap",
  "volume",
])

export type GlobeLayerGeometryType = z.infer<typeof GlobeLayerGeometryTypeSchema>

export const GlobeLayerContractSchema = z.object({
  id: z.string().min(2).max(120),
  domain: z.enum(["drones", "agents", "trust", "economics"]),
  label: z.string().min(2).max(240),
  description: z.string().min(2).max(1200),
  version: z.string().min(1).max(40),
  geometryType: GlobeLayerGeometryTypeSchema,
  timeSeries: z.boolean(),
  requiresAuth: z.boolean(),
  payloadSchema: z.record(z.string(), z.unknown()),
})

export type GlobeLayerContract = z.infer<typeof GlobeLayerContractSchema>

export const DRONE_GOVERNANCE_LAYER_CONTRACTS: GlobeLayerContract[] = [
  {
    id: "drone_live_positions",
    domain: "drones",
    label: "Drone Live Positions",
    description: "Current drone locations, status, and battery snapshots.",
    version: "1.0.0",
    geometryType: "point",
    timeSeries: true,
    requiresAuth: true,
    payloadSchema: {
      id: "string",
      missionId: "string",
      droneId: "string",
      longitude: "number",
      latitude: "number",
      status: "ready|in_flight|charging|maintenance|offline",
      batteryPct: "number(0-100)",
      recordedAt: "iso-timestamp",
    },
  },
  {
    id: "drone_flight_paths",
    domain: "drones",
    label: "Drone Flight Paths",
    description: "Planned and actual mission path segments per mission.",
    version: "1.0.0",
    geometryType: "line",
    timeSeries: true,
    requiresAuth: true,
    payloadSchema: {
      id: "string",
      missionId: "string",
      source: "planned|actual",
      coordinates: "array<[longitude, latitude]>",
      startedAt: "iso-timestamp",
      completedAt: "iso-timestamp?",
    },
  },
  {
    id: "drone_risk_clouds",
    domain: "trust",
    label: "Drone Risk Clouds",
    description: "Probabilistic risk volumes and tail-risk overlays for active missions.",
    version: "1.0.0",
    geometryType: "volume",
    timeSeries: true,
    requiresAuth: true,
    payloadSchema: {
      id: "string",
      missionId: "string",
      riskScore: "number(0-1)",
      tailRisk: "number(0-1)",
      confidence: "number(0-1)",
      policyResult: "allow|warn|hold|block",
      center: "{ longitude:number, latitude:number }",
      radiusMeters: "number",
      assessedAt: "iso-timestamp",
    },
  },
  {
    id: "drone_signoff_events",
    domain: "trust",
    label: "Drone Sign-off Events",
    description: "Human approval/rejection events for high-risk mission actions.",
    version: "1.0.0",
    geometryType: "point",
    timeSeries: true,
    requiresAuth: true,
    payloadSchema: {
      id: "string",
      missionId: "string",
      status: "pending|approved|rejected|expired",
      riskLevel: "low|medium|high|critical",
      approverUserId: "string?",
      reason: "string",
      requestedAt: "iso-timestamp",
      resolvedAt: "iso-timestamp?",
    },
  },
  {
    id: "drone_provenance_seals",
    domain: "trust",
    label: "Drone Provenance Seals",
    description: "Cryptographic provenance markers anchored to mission timeline events.",
    version: "1.0.0",
    geometryType: "point",
    timeSeries: true,
    requiresAuth: true,
    payloadSchema: {
      id: "string",
      missionId: "string",
      eventType: "string",
      actorType: "human|agent|drone|system",
      integrityHash: "sha256:*",
      previousHash: "sha256:*?",
      manifestRef: "string?",
      recordedAt: "iso-timestamp",
    },
  },
]

export function getGlobeLayerContracts(domain?: string): GlobeLayerContract[] {
  if (!domain) {
    return [...DRONE_GOVERNANCE_LAYER_CONTRACTS]
  }
  const normalized = domain.trim().toLowerCase()
  return DRONE_GOVERNANCE_LAYER_CONTRACTS.filter((layer) => layer.domain === normalized)
}
