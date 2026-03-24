export type DroneFleetStatus = "active" | "paused" | "retired"
export type DroneUnitStatus = "ready" | "in_flight" | "charging" | "maintenance" | "offline"
export type DroneDockStatus = "ready" | "loading" | "charging" | "offline" | "maintenance"
export type DroneMissionStatus =
  | "draft"
  | "planned"
  | "pending_signoff"
  | "dispatched"
  | "in_flight"
  | "delivered"
  | "failed"
  | "aborted"
  | "returned"
export type DroneRiskLevel = "low" | "medium" | "high" | "critical"
export type DronePolicyResult = "allow" | "warn" | "hold" | "block"
export type DroneSignoffStatus = "pending" | "approved" | "rejected" | "expired"
export type DroneActorType = "human" | "agent" | "drone" | "system"

export interface DroneFleetRecord {
  id: string
  name: string
  operatorName?: string
  certificateNumber?: string
  status: DroneFleetStatus
  createdAt: string
  updatedAt: string
}

export interface DroneUnitRecord {
  id: string
  fleetId: string
  externalId?: string
  name: string
  vendor?: string
  model?: string
  aircraftType: "multirotor" | "fixed_wing" | "hybrid"
  status: DroneUnitStatus
  batteryPct: number
  longitude?: number
  latitude?: number
  createdAt: string
  updatedAt: string
}

export interface DroneDockRecord {
  id: string
  fleetId: string
  name: string
  status: DroneDockStatus
  longitude?: number
  latitude?: number
  createdAt: string
  updatedAt: string
}

export interface DroneMissionRecord {
  id: string
  fleetId: string
  droneUnitId?: string
  dockId?: string
  externalOrderId?: string
  missionType: "delivery" | "restock" | "inspection" | "emergency" | "other"
  status: DroneMissionStatus
  riskLevel: DroneRiskLevel
  plannedRoute: Record<string, unknown>
  packageManifest: Record<string, unknown>
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface DroneRiskAssessmentRecord {
  id: string
  missionId: string
  riskScore: number
  confidence: number
  tailRisk: number
  policyResult: DronePolicyResult
  factors: string[]
  requiresSignoff: boolean
  assessedBy?: string
  createdAt: string
}

export interface DroneSignoffRequestRecord {
  id: string
  missionId: string
  status: DroneSignoffStatus
  riskLevel: DroneRiskLevel
  reason: string
  resolverNote?: string
  requestedByUserId?: string
  resolvedByUserId?: string
  requestedAt: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface DroneProvenanceRecord {
  id: string
  missionId: string
  eventType: string
  actorType: DroneActorType
  actorId?: string
  payload: Record<string, unknown>
  integrityHash: string
  previousHash?: string
  manifestRef?: string
  recordedAt: string
  createdAt: string
}

export interface DroneComplianceSummary {
  pendingSignoffs: number
  criticalMissions: number
  highRiskMissions: number
  provenanceEvents24h: number
}

export interface DroneComplianceSnapshot {
  source: "mock" | "supabase" | "supabase-empty"
  fleets: DroneFleetRecord[]
  units: DroneUnitRecord[]
  docks: DroneDockRecord[]
  missions: DroneMissionRecord[]
  riskAssessments: DroneRiskAssessmentRecord[]
  signoffRequests: DroneSignoffRequestRecord[]
  provenanceRecords: DroneProvenanceRecord[]
  summary: DroneComplianceSummary
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createEmptyDroneComplianceSnapshot(
  source: "supabase" | "supabase-empty" = "supabase-empty",
): DroneComplianceSnapshot {
  return {
    source,
    fleets: [],
    units: [],
    docks: [],
    missions: [],
    riskAssessments: [],
    signoffRequests: [],
    provenanceRecords: [],
    summary: {
      pendingSignoffs: 0,
      criticalMissions: 0,
      highRiskMissions: 0,
      provenanceEvents24h: 0,
    },
  }
}

export function getMockDroneComplianceSnapshot(): DroneComplianceSnapshot {
  const now = nowIso()
  const earlier = new Date(Date.now() - 45 * 60_000).toISOString()
  const fleets: DroneFleetRecord[] = [
    {
      id: "fleet-west-1",
      name: "West Coast Medical Fleet",
      operatorName: "Acme Air Logistics",
      certificateNumber: "FAA-P135-AL-2026-0041",
      status: "active",
      createdAt: earlier,
      updatedAt: now,
    },
  ]

  const units: DroneUnitRecord[] = [
    {
      id: "drone-047",
      fleetId: "fleet-west-1",
      externalId: "PX4-047",
      name: "Drone 047",
      vendor: "PX4",
      model: "Courier-M4",
      aircraftType: "multirotor",
      status: "in_flight",
      batteryPct: 73,
      longitude: -122.4194,
      latitude: 37.7749,
      createdAt: earlier,
      updatedAt: now,
    },
  ]

  const docks: DroneDockRecord[] = [
    {
      id: "dock-sfo-03",
      fleetId: "fleet-west-1",
      name: "SFO Dock 03",
      status: "ready",
      longitude: -122.389,
      latitude: 37.616,
      createdAt: earlier,
      updatedAt: now,
    },
  ]

  const missions: DroneMissionRecord[] = [
    {
      id: "mission-8f1d4c",
      fleetId: "fleet-west-1",
      droneUnitId: "drone-047",
      dockId: "dock-sfo-03",
      externalOrderId: "order-203948",
      missionType: "delivery",
      status: "in_flight",
      riskLevel: "high",
      plannedRoute: {
        waypoints: [
          { longitude: -122.389, latitude: 37.616 },
          { longitude: -122.437, latitude: 37.765 },
        ],
      },
      packageManifest: {
        packageType: "medical_supplies",
        weightKg: 1.4,
      },
      startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      createdAt: earlier,
      updatedAt: now,
    },
  ]

  const riskAssessments: DroneRiskAssessmentRecord[] = [
    {
      id: "risk-1",
      missionId: "mission-8f1d4c",
      riskScore: 0.31,
      confidence: 0.92,
      tailRisk: 0.04,
      policyResult: "warn",
      factors: ["coastal_wind_cell", "school_zone_proximity"],
      requiresSignoff: true,
      assessedBy: "agent_safety_sentinel_v12",
      createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
  ]

  const signoffRequests: DroneSignoffRequestRecord[] = [
    {
      id: "signoff-1",
      missionId: "mission-8f1d4c",
      status: "approved",
      riskLevel: "high",
      reason: "wind fallback route acceptable",
      requestedByUserId: "user-dispatch",
      resolvedByUserId: "user-supervisor",
      requestedAt: new Date(Date.now() - 19 * 60_000).toISOString(),
      resolvedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
      createdAt: new Date(Date.now() - 19 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
    },
  ]

  const provenanceRecords: DroneProvenanceRecord[] = [
    {
      id: "prov-1",
      missionId: "mission-8f1d4c",
      eventType: "order_trigger",
      actorType: "human",
      actorId: "user-dispatch",
      payload: { intent: "restock_medical_supplies", priority: "urgent" },
      integrityHash: "sha256:1c51688ce4f3e8e7f4f74fc9a0de5ec2de42d01b7ae8e73e72a3ed5a590f4b2f",
      manifestRef: "manifest_2026_09_14_flight_8f1d4c",
      recordedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
      createdAt: new Date(Date.now() - 21 * 60_000).toISOString(),
    },
  ]

  return {
    source: "mock",
    fleets,
    units,
    docks,
    missions,
    riskAssessments,
    signoffRequests,
    provenanceRecords,
    summary: {
      pendingSignoffs: signoffRequests.filter((item) => item.status === "pending").length,
      criticalMissions: missions.filter((item) => item.riskLevel === "critical").length,
      highRiskMissions: missions.filter((item) => item.riskLevel === "high" || item.riskLevel === "critical").length,
      provenanceEvents24h: provenanceRecords.length,
    },
  }
}
