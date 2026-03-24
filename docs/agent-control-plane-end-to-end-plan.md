# Agent Control Plane End-to-End Plan

## Goal
Deliver a secure, production-ready platform where non-technical users can build, deploy, chain, monitor, and evolve agents that automate internal workflows and replace portions of SaaS tooling.

## Completion Matrix

### 1) Core agent creation and training
- [x] Natural-language agent drafting (`create_agent_from_prompt`)
- [x] Soul + skills persistence (`soul_file`, `skills`)
- [x] Model selector + fallback chain
- [x] Versioning + rollback
- [x] Fleet lifecycle controls (active/paused)
- [x] Recursive improvement event log (`agent_skill_events`)
- [x] Automated scheduled self-improvement workers (secure cron execution)
- [x] Prompt eval harness with pass/fail benchmarks per agent

### 2) Tool connectors and scoped permissions
- [x] Connector registry + per-connector permission modes
- [x] Permission mutation API (`update_connector_permissions`)
- [x] Approval-required semantics reflected in governance metrics
- [ ] OAuth onboarding flows per provider (Gmail, Slack, HubSpot, etc.)
- [x] Secret vault-backed token rotation + connector health checks
- [x] Per-tool allowlists and deny-by-default execution policies

### 3) Workflow execution and templates
- [x] Built-in workflow template catalog
- [x] Manual run orchestration endpoint (`run_agent_workflow`)
- [x] Run audit records (`agent_runs`)
- [ ] Queue-backed execution engine (retry, dead-letter, backoff)
- [ ] Tool-call trace visualization and per-step latency/cost telemetry

### 4) Shadow SaaS and procurement leverage
- [x] Shadow tool registry (`agent_shadow_tools`)
- [x] Negotiation playbook generator UI
- [ ] Side-by-side functional parity scoring against vendor stack
- [ ] Renewal timeline and contract risk tracker

### 5) Economics and scaling
- [x] Token burn and budget utilization dashboard
- [x] OPEX compression and compute-share estimates
- [ ] Department/process-level efficiency attribution model
- [ ] Cost anomaly detector with alert routing (Slack/email/webhook)

### 6) Governance and change management
- [x] Owner-scoped RLS policies for control-plane tables
- [x] Authenticated mutation-only API with request validation and rate limits
- [x] Rollback-ready snapshot policy
- [x] Human approval queue with explicit approve/reject workflows
- [ ] Change-management pack generator (rollout docs, adoption scorecards)

### 7) Portability and future-proofing
- [x] Exportable chain JSON
- [ ] One-click script/container package generation
- [ ] On-prem runtime launcher profiles (local model targets)

## Implementation Order (next sprints)
1. Queue worker hardening (retry policy, dead-letter, backoff) on top of cron baseline.
2. OAuth connector onboarding and secure secret rotation.
3. Human approval queue hardening (policy automation + escalations).
4. Tool-call traces + step-level run diagnostics.
5. Portability packaging (script + Docker artifact).

## Definition of Done
- All major workflows run with persistent state in Supabase.
- RLS + authenticated mutation paths enforced.
- Every mutating path has rollback/audit traceability.
- Cost and efficiency metrics are visible at run, agent, and fleet levels.
- At least one production connector flow is fully OAuth-backed end to end.
