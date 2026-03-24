import "server-only"

import { createClient } from "@supabase/supabase-js"
import {
  type DroneActorType,
  type DroneComplianceSnapshot,
  type DroneDockRecord,
  type DroneDockStatus,
  type DroneFleetRecord,
  type DroneFleetStatus,
  type DroneMissionRecord,
  type DroneMissionStatus,
  type DronePolicyResult,
  type DroneProvenanceRecord,
  type DroneRiskAssessmentRecord,
  type DroneRiskLevel,
  type DroneSignoffRequestRecord,
  type DroneSignoffStatus,
  type DroneUnitRecord,
  type DroneUnitStatus,
  createEmptyDroneComplianceSnapshot,
} from "@/lib/shared/drone-delivery-types"

type Row = Record<string, unknown>
type QueryClient = {
  from: (table: string) => {
    select: (...args: unknown[]) => any
    insert: (...args: unknown[]) => any
    update: (...args: unknown[]) => any
  }
  auth: {
    getUser: (token?: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>
  }
}

const TABLES = {
  fleets: process.env.SUPABASE_DRONE_FLEETS_TABLE || "drone_fleets",
  units: process.env.SUPABASE_DRONE_UNITS_TABLE || "drone_units",
  docks: process.env.SUPABASE_DRONE_DOCKS_TABLE || "drone_docks",
  missions: process.env.SUPABASE_DRONE_MISSIONS_TABLE || "drone_missions",
  riskAssessments: process.env.SUPABASE_DRONE_RISK_ASSESSMENTS_TABLE || "drone_risk_assessments",
  signoffRequests: process.env.SUPABASE_DRONE_SIGNOFF_REQUESTS_TABLE || "drone_signoff_requests",
  provenanceRecords: process.env.SUPABASE_DRONE_PROVENANCE_TABLE || "drone_provenance_records",
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    return value !== 0
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true" || normalized === "1") return true
    if (normalized === "false" || normalized === "0") return false
  }
  return fallback
}

function asObject(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Row
      }
    } catch {
      return {}
    }
  }
  return {}
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function nowIso(): string {
  return new Date().toISOString()
}

function createUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !accessToken) {
    return null
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

async function resolveUser(client: ReturnType<typeof createUserScopedClient>, accessToken: string) {
  if (!client) {
    return null
  }

  const { data, error } = await client.auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }
  return data.user
}

function normalizeFleetStatus(value: string): DroneFleetStatus {
  if (value === "active" || value === "paused" || value === "retired") return value
  return "active"
}

function normalizeUnitStatus(value: string): DroneUnitStatus {
  if (value === "ready" || value === "in_flight" || value === "charging" || value === "maintenance" || value === "offline") {
    return value
  }
  return "ready"
}

function normalizeDockStatus(value: string): DroneDockStatus {
  if (value === "ready" || value === "loading" || value === "charging" || value === "offline" || value === "maintenance") {
    return value
  }
  return "ready"
}

function normalizeMissionStatus(value: string): DroneMissionStatus {
  if (
    value === "draft" ||
    value === "planned" ||
    value === "pending_signoff" ||
    value === "dispatched" ||
    value === "in_flight" ||
    value === "delivered" ||
    value === "failed" ||
    value === "aborted" ||
    value === "returned"
  ) {
    return value
  }
  return "draft"
}

function normalizeRiskLevel(value: string): DroneRiskLevel {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value
  }
  return "medium"
}

function normalizeSignoffStatus(value: string): DroneSignoffStatus {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "expired") {
    return value
  }
  return "pending"
}

function normalizePolicyResult(value: string): DronePolicyResult {
  if (value === "allow" || value === "warn" || value === "hold" || value === "block") {
    return value
  }
  return "allow"
}

function normalizeActorType(value: string): DroneActorType {
  if (value === "human" || value === "agent" || value === "drone" || value === "system") {
    return value
  }
  return "system"
}

function riskLevelFromScore(riskScore: number): DroneRiskLevel {
  if (riskScore >= 0.8) return "critical"
  if (riskScore >= 0.6) return "high"
  if (riskScore >= 0.3) return "medium"
  return "low"
}

function mapFleetRow(row: Row): DroneFleetRecord {
  return {
    id: asString(row.id),
    name: asString(row.name, "Drone Fleet"),
    operatorName: asString(row.operator_name ?? row.operatorName, "") || undefined,
    certificateNumber: asString(row.certificate_number ?? row.certificateNumber, "") || undefined,
    status: normalizeFleetStatus(asString(row.status, "active")),
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mapUnitRow(row: Row): DroneUnitRecord {
  return {
    id: asString(row.id),
    fleetId: asString(row.fleet_id ?? row.fleetId),
    externalId: asString(row.external_id ?? row.externalId, "") || undefined,
    name: asString(row.name, "Drone Unit"),
    vendor: asString(row.vendor, "") || undefined,
    model: asString(row.model, "") || undefined,
    aircraftType: ((): "multirotor" | "fixed_wing" | "hybrid" => {
      const value = asString(row.aircraft_type ?? row.aircraftType, "multirotor")
      if (value === "fixed_wing" || value === "hybrid") return value
      return "multirotor"
    })(),
    status: normalizeUnitStatus(asString(row.status, "ready")),
    batteryPct: Math.max(0, Math.min(100, asNumber(row.battery_pct ?? row.batteryPct, 100))),
    longitude: Number.isFinite(asNumber(row.current_longitude ?? row.currentLongitude, Number.NaN))
      ? asNumber(row.current_longitude ?? row.currentLongitude, Number.NaN)
      : undefined,
    latitude: Number.isFinite(asNumber(row.current_latitude ?? row.currentLatitude, Number.NaN))
      ? asNumber(row.current_latitude ?? row.currentLatitude, Number.NaN)
      : undefined,
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mapDockRow(row: Row): DroneDockRecord {
  return {
    id: asString(row.id),
    fleetId: asString(row.fleet_id ?? row.fleetId),
    name: asString(row.name, "Drone Dock"),
    status: normalizeDockStatus(asString(row.status, "ready")),
    longitude: Number.isFinite(asNumber(row.longitude, Number.NaN)) ? asNumber(row.longitude, Number.NaN) : undefined,
    latitude: Number.isFinite(asNumber(row.latitude, Number.NaN)) ? asNumber(row.latitude, Number.NaN) : undefined,
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mapMissionRow(row: Row): DroneMissionRecord {
  return {
    id: asString(row.id),
    fleetId: asString(row.fleet_id ?? row.fleetId),
    droneUnitId: asString(row.drone_unit_id ?? row.droneUnitId, "") || undefined,
    dockId: asString(row.dock_id ?? row.dockId, "") || undefined,
    externalOrderId: asString(row.external_order_id ?? row.externalOrderId, "") || undefined,
    missionType: ((): DroneMissionRecord["missionType"] => {
      const value = asString(row.mission_type ?? row.missionType, "delivery")
      if (value === "restock" || value === "inspection" || value === "emergency" || value === "other") return value
      return "delivery"
    })(),
    status: normalizeMissionStatus(asString(row.status, "draft")),
    riskLevel: normalizeRiskLevel(asString(row.risk_level ?? row.riskLevel, "medium")),
    plannedRoute: asObject(row.planned_route ?? row.plannedRoute),
    packageManifest: asObject(row.package_manifest ?? row.packageManifest),
    startedAt: asString(row.started_at ?? row.startedAt, "") || undefined,
    completedAt: asString(row.completed_at ?? row.completedAt, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mapRiskRow(row: Row): DroneRiskAssessmentRecord {
  return {
    id: asString(row.id),
    missionId: asString(row.mission_id ?? row.missionId),
    riskScore: Math.max(0, Math.min(1, asNumber(row.risk_score ?? row.riskScore, 0))),
    confidence: Math.max(0, Math.min(1, asNumber(row.confidence, 0.5))),
    tailRisk: Math.max(0, Math.min(1, asNumber(row.tail_risk ?? row.tailRisk, 0))),
    policyResult: normalizePolicyResult(asString(row.policy_result ?? row.policyResult, "allow")),
    factors: asStringArray(row.factors),
    requiresSignoff: asBoolean(row.requires_signoff ?? row.requiresSignoff, false),
    assessedBy: asString(row.assessed_by ?? row.assessedBy, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
  }
}

function mapSignoffRow(row: Row): DroneSignoffRequestRecord {
  return {
    id: asString(row.id),
    missionId: asString(row.mission_id ?? row.missionId),
    status: normalizeSignoffStatus(asString(row.status, "pending")),
    riskLevel: normalizeRiskLevel(asString(row.risk_level ?? row.riskLevel, "medium")),
    reason: asString(row.reason, ""),
    resolverNote: asString(row.resolver_note ?? row.resolverNote, "") || undefined,
    requestedByUserId: asString(row.requested_by_user_id ?? row.requestedByUserId, "") || undefined,
    resolvedByUserId: asString(row.resolved_by_user_id ?? row.resolvedByUserId, "") || undefined,
    requestedAt: asString(row.requested_at ?? row.requestedAt, nowIso()),
    resolvedAt: asString(row.resolved_at ?? row.resolvedAt, "") || undefined,
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
    updatedAt: asString(row.updated_at ?? row.updatedAt, nowIso()),
  }
}

function mapProvenanceRow(row: Row): DroneProvenanceRecord {
  return {
    id: asString(row.id),
    missionId: asString(row.mission_id ?? row.missionId),
    eventType: asString(row.event_type ?? row.eventType, "unknown"),
    actorType: normalizeActorType(asString(row.actor_type ?? row.actorType, "system")),
    actorId: asString(row.actor_id ?? row.actorId, "") || undefined,
    payload: asObject(row.payload),
    integrityHash: asString(row.integrity_hash ?? row.integrityHash, ""),
    previousHash: asString(row.previous_hash ?? row.previousHash, "") || undefined,
    manifestRef: asString(row.manifest_ref ?? row.manifestRef, "") || undefined,
    recordedAt: asString(row.recorded_at ?? row.recordedAt, nowIso()),
    createdAt: asString(row.created_at ?? row.createdAt, nowIso()),
  }
}

async function safeSelect(
  client: QueryClient,
  table: string,
  orderBy: string,
  limit: number,
): Promise<{ data: Row[]; fatalError?: boolean }> {
  const { data, error } = await client.from(table).select("*").order(orderBy, { ascending: false }).limit(limit)
  if (error) {
    const code = (error as { code?: string }).code
    if (code === "42P01") {
      return { data: [] }
    }
    return { data: [], fatalError: true }
  }
  return { data: (data || []) as Row[] }
}

export async function fetchDroneComplianceSnapshot(accessToken?: string): Promise<DroneComplianceSnapshot> {
  if (!accessToken) {
    return createEmptyDroneComplianceSnapshot("supabase-empty")
  }

  const client = createUserScopedClient(accessToken)
  const user = await resolveUser(client, accessToken)
  if (!client || !user) {
    return createEmptyDroneComplianceSnapshot("supabase-empty")
  }

  const queryClient = client as unknown as QueryClient
  const [
    fleetResult,
    unitResult,
    dockResult,
    missionResult,
    riskResult,
    signoffResult,
    provenanceResult,
  ] = await Promise.all([
    safeSelect(queryClient, TABLES.fleets, "updated_at", 50),
    safeSelect(queryClient, TABLES.units, "updated_at", 200),
    safeSelect(queryClient, TABLES.docks, "updated_at", 100),
    safeSelect(queryClient, TABLES.missions, "updated_at", 300),
    safeSelect(queryClient, TABLES.riskAssessments, "created_at", 500),
    safeSelect(queryClient, TABLES.signoffRequests, "requested_at", 300),
    safeSelect(queryClient, TABLES.provenanceRecords, "recorded_at", 1000),
  ])

  if (
    fleetResult.fatalError ||
    unitResult.fatalError ||
    dockResult.fatalError ||
    missionResult.fatalError ||
    riskResult.fatalError ||
    signoffResult.fatalError ||
    provenanceResult.fatalError
  ) {
    return createEmptyDroneComplianceSnapshot("supabase-empty")
  }

  const fleets = fleetResult.data.map(mapFleetRow)
  const units = unitResult.data.map(mapUnitRow)
  const docks = dockResult.data.map(mapDockRow)
  const missions = missionResult.data.map(mapMissionRow)
  const riskAssessments = riskResult.data.map(mapRiskRow)
  const signoffRequests = signoffResult.data.map(mapSignoffRow)
  const provenanceRecords = provenanceResult.data.map(mapProvenanceRow)

  if (
    fleets.length === 0 &&
    units.length === 0 &&
    docks.length === 0 &&
    missions.length === 0 &&
    riskAssessments.length === 0 &&
    signoffRequests.length === 0 &&
    provenanceRecords.length === 0
  ) {
    return createEmptyDroneComplianceSnapshot("supabase-empty")
  }

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
  const provenanceEvents24h = provenanceRecords.filter(
    (item) => new Date(item.recordedAt).getTime() >= oneDayAgo,
  ).length

  return {
    source: "supabase",
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
      provenanceEvents24h,
    },
  }
}

async function ensureMissionOwned(
  client: QueryClient,
  missionId: string,
  ownerUserId: string,
): Promise<{ ok: true; mission: Row } | { ok: false }> {
  const { data: mission } = await client
    .from(TABLES.missions)
    .select("id, owner_user_id, status, risk_level")
    .eq("id", missionId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle()

  if (!mission) {
    return { ok: false }
  }

  return { ok: true, mission: mission as Row }
}

export async function createDroneSignoffRequest(
  accessToken: string,
  input: {
    missionId: string
    riskLevel: DroneRiskLevel
    reason: string
  },
): Promise<{ ok: true; signoff: DroneSignoffRequestRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  const user = await resolveUser(client, accessToken)
  if (!client || !user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const queryClient = client as unknown as QueryClient
  const ownership = await ensureMissionOwned(queryClient, input.missionId, user.id)
  if (!ownership.ok) {
    return { ok: false, error: "Mission not found." }
  }

  const now = nowIso()
  const { data, error } = await queryClient
    .from(TABLES.signoffRequests)
    .insert({
      owner_user_id: user.id,
      mission_id: input.missionId,
      requested_by_user_id: user.id,
      status: "pending",
      risk_level: input.riskLevel,
      reason: input.reason.trim(),
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to create sign-off request." }
  }

  await queryClient
    .from(TABLES.missions)
    .update({
      status: "pending_signoff",
      risk_level: input.riskLevel,
      updated_at: now,
    })
    .eq("id", input.missionId)
    .eq("owner_user_id", user.id)

  return { ok: true, signoff: mapSignoffRow(data as Row) }
}

export async function resolveDroneSignoffRequest(
  accessToken: string,
  input: {
    signoffId: string
    decision: "approved" | "rejected"
    resolverNote?: string
  },
): Promise<{ ok: true; signoff: DroneSignoffRequestRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  const user = await resolveUser(client, accessToken)
  if (!client || !user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const queryClient = client as unknown as QueryClient
  const { data: existing } = await queryClient
    .from(TABLES.signoffRequests)
    .select("*")
    .eq("id", input.signoffId)
    .eq("owner_user_id", user.id)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Sign-off request not found." }
  }

  const now = nowIso()
  const { data, error } = await queryClient
    .from(TABLES.signoffRequests)
    .update({
      status: input.decision,
      resolved_by_user_id: user.id,
      resolver_note: input.resolverNote?.trim() || null,
      resolved_at: now,
      updated_at: now,
    })
    .eq("id", input.signoffId)
    .eq("owner_user_id", user.id)
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to resolve sign-off request." }
  }

  const missionId = asString((existing as Row).mission_id)
  if (missionId) {
    await queryClient
      .from(TABLES.missions)
      .update({
        status: input.decision === "approved" ? "planned" : "aborted",
        updated_at: now,
      })
      .eq("id", missionId)
      .eq("owner_user_id", user.id)
  }

  return { ok: true, signoff: mapSignoffRow(data as Row) }
}

export async function appendDroneProvenanceRecord(
  accessToken: string,
  input: {
    missionId: string
    eventType: string
    actorType: DroneActorType
    actorId?: string
    payload?: Record<string, unknown>
    integrityHash: string
    previousHash?: string
    manifestRef?: string
    recordedAt?: string
  },
): Promise<{ ok: true; record: DroneProvenanceRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  const user = await resolveUser(client, accessToken)
  if (!client || !user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const queryClient = client as unknown as QueryClient
  const ownership = await ensureMissionOwned(queryClient, input.missionId, user.id)
  if (!ownership.ok) {
    return { ok: false, error: "Mission not found." }
  }

  const now = nowIso()
  const { data, error } = await queryClient
    .from(TABLES.provenanceRecords)
    .insert({
      owner_user_id: user.id,
      mission_id: input.missionId,
      event_type: input.eventType.trim(),
      actor_type: input.actorType,
      actor_id: input.actorId?.trim() || null,
      payload: input.payload || {},
      integrity_hash: input.integrityHash.trim(),
      previous_hash: input.previousHash?.trim() || null,
      manifest_ref: input.manifestRef?.trim() || null,
      recorded_at: input.recordedAt || now,
      created_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to append provenance record." }
  }

  return { ok: true, record: mapProvenanceRow(data as Row) }
}

export async function createDroneRiskAssessment(
  accessToken: string,
  input: {
    missionId: string
    riskScore: number
    confidence: number
    tailRisk: number
    policyResult: DronePolicyResult
    factors?: string[]
    requiresSignoff?: boolean
    assessedBy?: string
  },
): Promise<{ ok: true; assessment: DroneRiskAssessmentRecord } | { ok: false; error: string }> {
  const client = createUserScopedClient(accessToken)
  const user = await resolveUser(client, accessToken)
  if (!client || !user) {
    return { ok: false, error: "Invalid Supabase session." }
  }

  const queryClient = client as unknown as QueryClient
  const ownership = await ensureMissionOwned(queryClient, input.missionId, user.id)
  if (!ownership.ok) {
    return { ok: false, error: "Mission not found." }
  }

  const now = nowIso()
  const normalizedRiskScore = Math.max(0, Math.min(1, input.riskScore))
  const normalizedConfidence = Math.max(0, Math.min(1, input.confidence))
  const normalizedTailRisk = Math.max(0, Math.min(1, input.tailRisk))
  const missionRiskLevel = riskLevelFromScore(normalizedRiskScore)

  const { data, error } = await queryClient
    .from(TABLES.riskAssessments)
    .insert({
      owner_user_id: user.id,
      mission_id: input.missionId,
      risk_score: normalizedRiskScore,
      confidence: normalizedConfidence,
      tail_risk: normalizedTailRisk,
      policy_result: input.policyResult,
      factors: input.factors || [],
      requires_signoff: input.requiresSignoff === true,
      assessed_by: input.assessedBy?.trim() || null,
      created_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    return { ok: false, error: "Failed to create risk assessment." }
  }

  await queryClient
    .from(TABLES.missions)
    .update({
      risk_level: missionRiskLevel,
      status: input.requiresSignoff ? "pending_signoff" : undefined,
      updated_at: now,
    })
    .eq("id", input.missionId)
    .eq("owner_user_id", user.id)

  return { ok: true, assessment: mapRiskRow(data as Row) }
}
