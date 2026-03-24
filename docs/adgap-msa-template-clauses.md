# ADGAP MSA Template Clauses

This document is a commercial template for AgentForge Drone Agentic Governance & Accreditation Protocol (ADGAP).
It is not legal advice. Counsel should finalize jurisdiction-specific language.

## 1. Roles and Responsibilities
1. `Operator` is the certificated UAS operator and retains operational control over all flights.
2. `AgentForge` is a software and automation services provider and is not the certificated air carrier/operator unless expressly stated.
3. `Hardware Provider` remains responsible for hardware airworthiness and manufacturer defects.

## 2. Regulatory Compliance
1. Operator warrants maintenance of required approvals/certifications, including applicable FAA operating authority and maintenance programs.
2. AgentForge will provide compliance-support tooling (policy checks, recordkeeping, alerts), but Operator remains responsible for mission authorization decisions.
3. Parties will cooperate on regulator inquiries and evidence production.

## 3. Human Oversight and High-Risk Gates
1. Operator will define risk thresholds that require human sign-off.
2. AgentForge will enforce configured sign-off workflows and log approver identity, timestamp, reason, and decision outcome.
3. Any mission in `high-risk` status must remain blocked unless approved by an authorized human approver.

## 4. Provenance and Audit Trail
1. All mission-critical events must be recorded in an immutable provenance ledger.
2. Records must include actor identity, model/agent version, input references, decision output, timestamp, and integrity hash.
3. AgentForge will expose exportable mission manifests for audit, insurance, and dispute resolution.

## 5. Data Protection and Privacy
1. Parties will comply with applicable privacy law (including GDPR/CCPA where relevant).
2. Operator is controller/customer for recipient data unless agreed otherwise in a DPA.
3. AgentForge acts as processor/service provider for mission data and will apply least-privilege access controls.
4. Default retention:
   - Operational telemetry: `[X]` days
   - Recipient media evidence: `[Y]` days unless legal hold/dispute
5. Cross-border transfers must follow approved transfer mechanisms.

## 6. Security Controls
1. AgentForge will maintain a security program aligned with SOC 2 Type II controls.
2. Critical controls include MFA, key management, secret rotation, logging, vulnerability management, and incident response.
3. Customer must secure credentials, endpoints, docks, and local networking under its control.

## 7. Recursive Learning and Model Change Control
1. Autonomous model/skill updates must be gated by validation policy.
2. Production updates require auditable promotion workflow and rollback capability.
3. Unsafe or unvalidated learning outputs are prohibited from direct autonomous deployment.

## 8. Incident Response and Notification
1. Security or safety incidents trigger joint incident protocol.
2. Initial notice window: `[24/48]` hours from confirmed detection.
3. Final incident report includes root cause, blast radius, mitigations, and preventive controls.
4. Regulator notifications are led by Operator where required by law or certificate terms.

## 9. Insurance
1. Operator maintains aviation liability and other required flight operations coverage.
2. AgentForge maintains technology E&O/cyber liability and product liability rider.
3. Each party must provide certificates of insurance on request.
4. Optional: dedicated autonomous/agentic rider for swarm decisions.

## 10. Liability Allocation
1. Operator liability includes flight execution and regulatory control obligations.
2. AgentForge liability includes material breach of software security obligations and gross negligence/willful misconduct.
3. Hardware Provider liability includes product defects and manufacturing non-conformance.
4. Mutual exclusions for indirect/consequential damages except as required by law.
5. Aggregate liability cap: `[fees paid in prior 12 months]` or negotiated fixed cap.

## 11. Indemnification
1. Operator indemnifies AgentForge for claims arising from unlawful operations, unauthorized cargo, or misuse outside documented controls.
2. AgentForge indemnifies Operator for third-party IP infringement by the platform and for breaches of contractual security duties.
3. Hardware Provider indemnifies for hardware defect claims.
4. Indemnity process includes prompt notice, cooperation, and defense control terms.

## 12. Audit Rights
1. Operator may audit ADGAP controls annually with reasonable notice.
2. AgentForge may satisfy audits via third-party reports where suitable.
3. Regulator-directed evidence production takes priority over ordinary audit timelines.

## 13. Suspension and Termination
1. AgentForge may suspend unsafe or non-compliant operations where imminent harm or legal violation is likely.
2. Either party may terminate for uncured material breach.
3. On termination, data export/deletion and key revocation occur per agreed transition plan.

## 14. Step-by-Step Responsibility Schedule (Annex A)
Use this matrix in the executed MSA SOW.

| Step | Primary Responsible Party | Shared Controls | Evidence Artifact |
|---|---|---|---|
| Order Trigger | Operator | Human approval rules, identity checks | Signed order intent record |
| Planning & Optimization | Shared | Risk engine, policy gates | Risk assessment + sign-off log |
| Autonomous Loading | Operator/Hardware Provider | Sensor checks, chain-of-custody controls | Loading attestations + media |
| BVLOS Flight | Operator | UTM, detect-and-avoid, emergency procedures | Telemetry stream + flight log |
| Delivery Confirmation | Operator | Recipient protocol, privacy policy | Signed delivery evidence bundle |
| Return/Relearn | Shared | Validation and rollback policy | Learning-change provenance report |

