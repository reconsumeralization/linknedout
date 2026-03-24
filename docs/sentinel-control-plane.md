# SENTINEL Control Plane

SENTINEL is the security control plane for MCP, realtime, and chat tool execution.

## Objectives

- unify risk and veto decisions across tool transports
- persist C2PA-style provenance manifests for each tool attempt
- maintain owner-scoped review and approval workflows
- support staged rollout (`shadow` -> `soft` -> `enforce`)
- expose policy and telemetry for governance review

## Execution Pipeline

All tool execution routes through `executeRealtimeTool`:

1. sub-agent and policy checks
2. egress allowlist and per-tool egress rate-limit checks
3. argument injection inspection
4. risk scoring (`computeToolRiskScore`)
5. privileged/destructive-tool, data-egress DLP + workflow-shape, and veto approval checks
6. critical destructive verify-after-write policy (`off`/`warn`/`enforce`)
7. manifest generation (`generateC2PAManifest`) with parent-hash resolution
8. audit write to `mcp_tool_audit_events`
9. approval queue insert and one-time execution consumption via `sentinel_veto_approvals`

## Governance Mapping

- Prompt/tool injection:
  - controls: suspicious-pattern inspection + risk scoring + veto gate
  - evidence: `injection_matches`, `risk_score`, `risk_level`
- Credential exfiltration:
  - controls: argument redaction + credential detection + approval workflow
  - evidence: `credential_access_detected`, `arg_hash`, `arg_preview`
- Silent policy bypass:
  - controls: transport-wide execution chokepoint + mandatory audit write
  - evidence: `transport`, `tool_name`, `status`, `blocked_reason`
- Provenance tampering:
  - controls: manifest hashing + parent-hash chaining
  - evidence: `manifest_hash`, `parent_hash`

## Current Gaps

- no external key-signing/HSM for manifests yet (hash-chain only)
- approval replay remains manual by design (no auto-retry queue)
- approved execution grants are single-use and expire after `SENTINEL_APPROVAL_EXECUTION_WINDOW_MINUTES`
- RAG ingestion/query guardrails are enforced at tool layer, not yet with separate independent policy service

For production strict-mode flags (egress DLP and RAG poisoning/source-trust), see `docs/mcp-security-hardening.md#production-strict-mode-checklist`.
Pattern signatures are now externalized in `config/security-patterns.json` and refreshed via `scripts/update-security-patterns.mjs` / `.github/workflows/security-patterns-refresh.yml`.

## Modes

- `SENTINEL_MODE=shadow`: evaluate and log, no blocking
- `SENTINEL_MODE=soft`: block only critical risk
- `SENTINEL_MODE=enforce`: block at `SENTINEL_VETO_THRESHOLD`

`SENTINEL_VETO_ENABLED=false` disables blocking while preserving telemetry.

## API

- `GET /api/sentinel`
  - bearer auth required
  - owner-scoped snapshot (`events`, `approvals`, `threats`, `incidents`, `stats`, `kpis`, `anomalies`, `policy`)
- `POST /api/sentinel`
  - `resolve_veto`
  - `dismiss_threat`
  - `create_incident`
  - `update_incident`
- `POST /api/mcp` (`tools/call`) and `POST /api/realtime/tools`
  - privileged/vetoed calls return `approvalId` in details
  - replay supports `approvalId` / `approval_id` / `_meta.approvalId`
  - argument aliases (`__sentinelApprovalId`, `sentinelApprovalId`) also work in shared execution path
- `GET`/`POST /api/sentinel/cron`
  - secret-authenticated cron endpoint (`SENTINEL_CRON_SECRET`)
  - evaluates active-owner snapshots and dispatches KPI-threshold webhook alerts

## Database

`mcp_tool_audit_events` includes:

- `risk_score`, `risk_level`
- `manifest_id`, `manifest_hash`, `parent_hash`
- `injection_matches`
- `credential_access_detected`
- `vetoed`
- `transport` includes `chat`
- `status` includes `vetoed`
- `critical_workflow_class`, `verification_required`, `verification_state`
- `verification_target_tool`, `verification_subject`, `verification_due_at`, `verification_checked_at`
- `egress_payload_bytes`, `egress_attachment_count`, `egress_thread_message_count`, `egress_shape_approval_required`

Additional tables:

- `sentinel_veto_approvals`
- `sentinel_threat_dismissals`
- `sentinel_incidents`
- `sentinel_alert_dispatches` (webhook dedupe and delivery state for KPI alerts)

## Metrics and Policy Flags

`SentinelSnapshot` includes:

- `policy.mode`, `policy.vetoEnabled`, `policy.alertThreshold`, `policy.vetoThreshold`
- `stats.vetoRatePercent`, `stats.criticalRiskCount`
- `stats.threatCategoryCounts`
- `kpis.mttdMinutes`, `kpis.mttcMinutes`, `kpis.meanApprovalResolutionMinutes`
- `kpis.criticalVerificationRequired`, `kpis.criticalVerificationPassed`, `kpis.criticalVerificationFailed`
- `kpis.criticalVerificationPending`, `kpis.criticalVerificationMissed`
- `kpis.taskRealityMismatchCount`, `kpis.taskRealityPassRatePercent`
- `anomalies[]` for OAuth failures, blocked-tool spikes, rate-limit spikes, and stale high-impact incidents

Webhook alerting can be enabled from KPI thresholds (`taskRealityMismatchCount`, `criticalVerificationMissed`, `unresolvedHighRiskEvents`, `openIncidents`, high-severity anomaly count) and routed via:

- `SENTINEL_ALERT_WEBHOOK_ENABLED`
- `SENTINEL_ALERT_WEBHOOK_URL`
- `SENTINEL_ALERT_WEBHOOK_BEARER_TOKEN`
- `SENTINEL_ALERT_WEBHOOK_COOLDOWN_SECONDS`
- threshold env vars in `.env.example`

## One-command scheduler (repo-managed cron)

Operators can run the KPI webhook cron without configuring an external scheduler:

1. **Docker (recommended)**  
   With `docker compose up`, the `sentinel-cron` service runs automatically. It calls `POST /api/sentinel/cron` on the app every `SENTINEL_CRON_INTERVAL_SECONDS` (default 600 = 10 minutes). Set `SENTINEL_CRON_SECRET` in `.env.local` (or host env); optional: `SENTINEL_CRON_DRY_RUN=true`, `SENTINEL_CRON_MAX_OWNERS`, `SENTINEL_CRON_LOOKBACK_HOURS`.

2. **Manual / OS scheduler**  
   From the repo root with `SENTINEL_CRON_SECRET` and (if needed) `SENTINEL_CRON_APP_URL` set:
   - One-off: `pnpm sentinel:cron:invoke`
   - Or: `node scripts/sentinel-cron-invoke.mjs`  
   Wire this into cron (Linux/macOS) or Task Scheduler (Windows) at your desired interval (e.g. every 5–15 minutes).

3. **Smoke-test before enabling for real**  
   ```bash
   curl -X POST "http://127.0.0.1:3000/api/sentinel/cron" \
     -H "x-cron-secret: $SENTINEL_CRON_SECRET" \
     -H "content-type: application/json" \
     -d '{"dryRun":true,"maxOwners":50,"lookbackHours":24}'
   ```  
   Then set `dryRun` to `false` and schedule (or rely on the Docker `sentinel-cron` service).

## Incident Drill

Use the scripted drill to validate incident workflow:

- `pnpm smoke:sentinel:drill`
- optional auto-resolution: `pnpm smoke:sentinel:drill -- --AutoResolve`

## UI

`components/sentinel-panel.tsx` includes:

- Activity Monitor
- Provenance Chain view
- Approval Queue resolution actions
- Threat Intel signature view
- policy badges (mode, thresholds, veto enabled)
- category summary chips

Sidebar entry: `SENTINEL` (`SEC` badge).

## Option 3 Verification Checklist

Use this checklist to verify SENTINEL operator polish (Guard Diagnostics allowlist visibility + Recent alerts mini-panel).

1. Verify Guard Diagnostics per-tool allowlist
- Set `MCP_DATA_EGRESS_TOOL_ALLOWLIST` (and optionally `MCP_DATA_EGRESS_TOOL_RATE_LIMITS`) in environment.
- Open `GET /api/chat?action=health` and confirm:
  - `strictMode.egressAllowlistTools` is present and non-empty.
  - `strictMode.egressToolRateLimits` contains expected per-tool overrides (if configured).
- In the SENTINEL panel, open `Guard Diagnostics` and confirm:
  - `Per-tool allowlist (N tools)` block is visible.
  - Tool badges render with optional `(<limit>/min)` suffix when overrides exist.

2. Verify Recent alerts mini-panel
- Ensure `sentinel_alert_dispatches` has rows (via `POST /api/sentinel/cron` or `GET /api/sentinel` on active snapshots).
- Call `GET /api/sentinel` and confirm `recentAlertDispatches` is returned.
- In the SENTINEL panel, confirm `Recent alerts` appears above the tab strip and each row shows:
  - `alertKey`
  - status badge (`lastStatus`)
  - timestamp (`lastSentAt` or `lastAttemptAt` or `updatedAt`)
  - optional truncated `lastError`

3. Missing-table behavior
- If `sentinel_alert_dispatches` is unavailable, `recentAlertDispatches` resolves to `[]` and the UI card remains hidden.

## Related

- `docs/README.md`
- `docs/aegis-doctrine.md`
- `docs/aegis-non-hardware.md`
- `docs/agentic-risk-claims-2026.md`
- `docs/mcp-security-hardening.md`
