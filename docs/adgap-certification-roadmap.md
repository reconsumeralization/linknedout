# ADGAP Phased Certification Roadmap

## Purpose
Provide a practical path to certify AgentForge drone operations with auditable governance, safety, and liability controls.

## Assumptions
- Operator holds or is pursuing required flight authority.
- AgentForge is deployed as a tooling/orchestration provider.
- Globe + provenance ledger are enabled for all production missions.

## Phase 0: Control Baseline (Weeks 0-4)
### Deliverables
- ADGAP policy pack (risk thresholds, sign-off matrix, incident runbooks).
- Provenance minimum schema (order, plan, flight, delivery, learning events).
- RLS and tenant isolation for drone tables.

### Exit Criteria
- Every critical mission event produces immutable signed record.
- High-risk actions are blocked without human sign-off.

## Phase 1: Pilot Compliance Readiness (Weeks 4-10)
### Deliverables
- Safety case for one corridor/region.
- UTM integration and no-fly enforcement evidence.
- Internal audit of mission lifecycle controls.

### Exit Criteria
- Controlled pilot meets safety and traceability KPI targets.
- Incident response drill completed successfully.

## Phase 2: Independent Assurance (Weeks 10-18)
### Deliverables
- SOC 2 Type II scope definition and evidence automation.
- Third-party red-team assessment (agent misuse, provenance tamper paths).
- Insurance review package (controls + loss-prevention evidence).

### Exit Criteria
- External findings remediated to agreed risk level.
- Carrier approves coverage profile for scaled operations.

## Phase 3: Operational Certification Alignment (Weeks 18-30)
### Deliverables
- FAA operations package support artifacts (operator-led filing).
- Continuous airworthiness and maintenance evidence hooks.
- Human oversight and emergency takeover procedure validation.

### Exit Criteria
- Operator demonstrates sustained procedural compliance in production-like ops.
- Regulator-facing evidence export is one-click reproducible.

## Phase 4: ISO 21384-3 Alignment (Weeks 30-42)
### Deliverables
- Formal mapping from ADGAP controls to ISO 21384-3 requirements.
- Corrective action plans for any control gaps.
- Certification audit preparation binder.

### Exit Criteria
- Audit readiness confirmed.
- Non-conformities (if any) tracked with due dates and owners.

## Phase 5: Scale and Federation Governance (Weeks 42+)
### Deliverables
- Cross-organization handoff governance for partner fleets.
- Marketplace allocation policy and liability boundaries.
- Regional compliance profiles (privacy, retention, notification requirements).

### Exit Criteria
- External partner missions maintain full provenance continuity.
- No cross-tenant or policy-violating actions in federation mode.

## Evidence Matrix (Minimum)
- Mission intent and approval logs.
- Risk assessment outputs and policy outcomes.
- Telemetry integrity and route deviation records.
- Delivery confirmation evidence and dispute packet.
- Learning/update validation records and rollback logs.
- Incident timeline, root cause, and mitigation artifacts.

## Recommended KPIs
- `% missions with complete provenance chain`
- `% high-risk missions with valid sign-off before dispatch`
- `mean time to incident detection`
- `mean time to safe hold/abort`
- `% model/skill updates with pre-deploy validation`
- `% disputes resolved with provenance bundle only`

## Governance Cadence
- Daily: safety exceptions and unresolved sign-off queue.
- Weekly: control drift review, top risks, near-misses.
- Monthly: compliance steering committee + insurance/claims review.
- Quarterly: external audit checkpoint and tabletop incident simulation.
