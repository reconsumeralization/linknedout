# AgentForge Drone Agentic Delivery Spec

## 1. Scope
- Add drones as first-class agents in AgentForge.
- Integrate with AgentForge Globe for real-time mission visibility.
- Enforce safety, compliance, provenance, and human sign-off for high-risk actions.

## 2. System Architecture

### 2.1 Control Plane
- `Drone Orchestrator`: Creates missions, assigns drones, tracks execution state.
- `Safety/Compliance Swarm`: Validates airspace, geofences, weather, battery reserve, and mission risk.
- `Dock Orchestrator`: Manages drone-in-a-box loading, charging, package handoff.
- `Marketplace Allocator`: Optional bidding layer for multi-fleet assignment.

### 2.2 Drone Agent SDK (hardware-agnostic)
- Provider adapters:
  - `px4Adapter`
  - `djiAdapter`
  - `auterionAdapter`
  - `ziplineLikeFixedWingAdapter`
- Unified interface:
  - `connect()`
  - `getCapabilities()`
  - `planMission()`
  - `startMission()`
  - `pauseMission()`
  - `abortMission()`
  - `returnToDock()`
  - `streamTelemetry()`

### 2.3 Globe Rendering Pipeline
- Telemetry/event ingestion -> geo-normalization (WGS84) -> time-sliced layer cache.
- Rendered layers:
  - Drone positions and tracks
  - Mission confidence clouds
  - Risk zones and no-fly overlays
  - Dock status/throughput
  - Energy and carbon impact heatmaps

## 3. Data Model (Supabase)

### 3.1 Core tables
- `drone_fleets`
- `drone_units`
- `drone_docks`
- `drone_missions`
- `drone_mission_legs`
- `drone_telemetry_points`
- `drone_events`
- `drone_risk_assessments`
- `drone_signoff_requests`
- `drone_provenance_records`

### 3.2 Security
- RLS by `owner_user_id` / tenant.
- Signed provenance hash per mission transition.
- Separate service-role workers for ingestion and compliance checks.

## 4. API Surface

### 4.1 Mission APIs
- `POST /api/drones/missions`
- `GET /api/drones/missions`
- `GET /api/drones/missions/:id`
- `POST /api/drones/missions/:id/dispatch`
- `POST /api/drones/missions/:id/pause`
- `POST /api/drones/missions/:id/abort`
- `POST /api/drones/missions/:id/signoff`

### 4.2 Fleet APIs
- `GET /api/drones/fleets`
- `GET /api/drones/units`
- `GET /api/drones/docks`

### 4.3 Globe APIs
- `GET /api/globe/layers?domain=drones`
- `GET /api/globe/timeseries?layer=drone_tracks`

## 5. Safety and Governance Gates
- Hard preflight checks:
  - Weather and wind limits
  - Geofence/no-fly compliance
  - Minimum reserve battery
  - Payload and center-of-gravity validation
- Runtime checks:
  - Tail-risk score updated continuously
  - Automatic hold/return on threshold breach
- Human-in-loop:
  - Required sign-off for high-risk regions, medical payloads, or degraded comms.

## 6. Phased Rollout

### Phase 0: Simulation-only (2-4 weeks)
- Build mission state machine and SDK interface.
- Use simulated drones and synthetic telemetry only.
- Exit criteria: mission lifecycle works end-to-end with Globe playback.

### Phase 1: Single Dock Pilot (4-8 weeks)
- One dock, one region, one mission type.
- Manual sign-off required for every dispatch.
- Exit criteria: >95% successful missions in controlled corridor.

### Phase 2: Multi-Drone Ops (6-10 weeks)
- Multiple simultaneous missions and auto-assignment.
- Dynamic rerouting and exception handling live.
- Exit criteria: stable operations with low intervention rate.

### Phase 3: Marketplace + Federation (8-12 weeks)
- Optional partner capacity routing and cost-based bidding.
- Cross-org provenance and policy guardrails.
- Exit criteria: auditable external fleet handoff with policy compliance.

## 7. Command Center UI Flows

### Flow A: Create and Dispatch Mission
1. User enters destination + payload + priority.
2. System proposes candidate routes with confidence/risk bands.
3. User reviews and approves.
4. Mission dispatch starts and appears on Globe.

### Flow B: Live Operations
1. Operator sees active missions and dock status.
2. Alerts panel shows anomalies (weather, battery, comms).
3. Operator can issue NL commands: reroute, hold, return-to-dock.

### Flow C: Exception + Sign-off
1. Risk threshold breach creates sign-off request.
2. Mission transitions to hold.
3. Reviewer approves/rejects with reason.
4. Full audit trail is appended to provenance log.

### Flow D: Post-Mission Review
1. Delivery proof, telemetry replay, and confidence calibration summary.
2. Recursive skill update suggestions for affected drone agents.
3. Impact card: time saved, carbon delta, human-hours shifted.

## 8. MVP Acceptance Criteria
- Mission creation/dispatch/pause/abort works through API and UI.
- Globe shows live drone tracks + playback timeline.
- Safety gate blocks high-risk dispatch without sign-off.
- Provenance record generated for each mission stage.
- RLS prevents cross-tenant mission data access.

## 9. Immediate Build Tasks (repo-aligned)
1. Add migration: `supabase/migrations/*_drone_delivery.sql`.
2. Add server module: `lib/drone-delivery-server.ts`.
3. Add API routes: `app/api/drones/**`.
4. Add Globe layer adapter: `lib/globe-drone-layers.ts`.
5. Add panel: `components/drone-command-center.tsx`.

## 10. Governance Pack (ADGAP)
- MSA template clauses: `docs/adgap-msa-template-clauses.md`
- C2PA-style manifest example: `docs/adgap-c2pa-manifest-example.json`
- Certification roadmap: `docs/adgap-certification-roadmap.md`
