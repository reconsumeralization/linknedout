# AI Security Stack - Master Reference

Single canonical reference for the LinkedOut AI security posture: control layers, operator flows, and production tuning.

## 1. Stack overview

| Layer | Purpose | Where |
|---|---|---|
| Input and jailbreak controls | Block prompt-hijack and instruction-leak patterns before execution | `app/api/chat/route.ts`, `config/security-patterns.json` |
| Guard model | Pre-tool and pre-response classification (`shadow` or `enforce`) | `lib/llm-guard.ts`, chat route |
| Tool policy and workflow controls | Allowlist/blocklist, suspicious-arg checks, critical verify-after-write policy | `lib/mcp-tool-security.ts`, `lib/critical-workflow-policy.ts`, `lib/realtime-tools.ts` |
| Egress controls | DLP and workflow-shape approval gates, egress allowlist, per-tool rate limits | `lib/mcp-tool-security.ts`, `lib/realtime-tools.ts` |
| Data and tenant isolation | Owner-scoped RLS, RAG poisoning and trusted-source checks | Supabase migrations, `lib/supabase-llm-db-tools.ts` |
| Observability and operations | SENTINEL snapshot, Guard Diagnostics, task-vs-reality KPI, approval queue, KPI webhook alerting | `GET /api/sentinel`, `POST /api/sentinel/cron`, `GET /api/chat?action=health`, `components/sentinel-panel.tsx` |

Detailed control catalog: [MCP Security Hardening](./mcp-security-hardening.md).  
Execution and approval pipeline: [SENTINEL Control Plane](./sentinel-control-plane.md).  
Tenant isolation checklist: [Supabase Schema and RLS Checklist](./supabase-schema-rls-checklist.md).

## 2. Operator quick reference

### Environment (production strict mode)

- Auth and transport: `REALTIME_TOOLS_REQUIRE_AUTH=true`, `MCP_ENFORCE_TOOL_ALLOWLIST=true`, `MCP_BLOCK_SUSPICIOUS_TOOL_ARGS=true`
- Guard: `LLM_GUARD_ENABLED=true`, `LLM_GUARD_ENFORCE=true` (optional `LLM_GUARD_FAIL_CLOSED=true`)
- Critical workflow verification:
  - `MCP_CRITICAL_WORKFLOW_VERIFY_MODE=warn|enforce`
  - `MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS=120`
- Egress:
  - `MCP_ENFORCE_DATA_EGRESS_DLP=true`
  - `MCP_ENFORCE_DATA_EGRESS_TOOL_ALLOWLIST=true`
  - `MCP_DATA_EGRESS_TOOL_ALLOWLIST=...`
  - `MCP_DATA_EGRESS_TOOL_RATE_LIMITS=...`
  - `MCP_EGRESS_SHAPE_APPROVAL_ENABLED=true`
  - `MCP_EGRESS_APPROVAL_PAYLOAD_BYTES_THRESHOLD=65536`
  - `MCP_EGRESS_APPROVAL_ATTACHMENT_COUNT_THRESHOLD=3`
  - `MCP_EGRESS_APPROVAL_THREAD_MESSAGE_COUNT_THRESHOLD=10`
- RAG:
  - `SUPABASE_LLM_BLOCK_POISONED_DOCUMENTS=true`
  - `SUPABASE_LLM_FILTER_UNTRUSTED_QUERY_RESULTS=true`
  - `SUPABASE_LLM_TRUSTED_SOURCES=...`
- SENTINEL rollout: start `SENTINEL_MODE=shadow`, then `soft`, then `enforce`
- SENTINEL webhook alerts:
  - `SENTINEL_ALERT_WEBHOOK_ENABLED=true`
  - `SENTINEL_ALERT_WEBHOOK_URL=...`
  - `SENTINEL_ALERT_WEBHOOK_COOLDOWN_SECONDS=900`
  - `SENTINEL_CRON_SECRET=...`

Full env reference: [MCP Security Hardening - Environment Controls](./mcp-security-hardening.md#environment-controls) and [.env.example](../.env.example).

### Verification checks (post-change)

1. `pnpm smoke:sentinel:drill`
2. Trigger a destructive delete tool in `warn` mode and confirm audit state `verification_required=true`, `verification_state=pending`
3. Run matching verify tool (`verifyRapidFireDbDeleted`, `verifyRapidFireCollectionDeleted`, `verifyRapidFireDocumentDeleted`) and confirm pending state transitions to `passed` or `failed`
4. In `enforce` mode, attempt a second destructive action with unresolved verification and confirm `409` block with required verifier details
5. Trigger egress shape thresholds (payload, attachments, thread) and confirm approval-required `202` response with shape metrics
6. Confirm Guard Diagnostics shows:
   - verify mode and verification window
   - egress-shape thresholds
   - task-vs-reality KPI (`required`, `passed`, `failed`, `pending`, `missed`, `pass rate`)
7. Run `POST /api/sentinel/cron` (secret-authenticated) and confirm KPI-threshold webhook delivery and cooldown dedupe.

### Security pattern refresh

- Local scheduler: Docker `security-cron` runs `node scripts/update-security-patterns-from-openai.js` on `SECURITY_PATTERNS_INTERVAL_SECONDS`
- Feed refresh: `node scripts/update-security-patterns.mjs`
- Optional CI refresh: `.github/workflows/security-patterns-refresh.yml`

Registry: `config/security-patterns.json`.

## 3. Egress tuning guidance

### Allowlist

- Keep `MCP_DATA_EGRESS_TOOL_ALLOWLIST` minimal.
- Explicitly add new egress-capable tools before enabling in production.

### Rate limits

- Global defaults: `MCP_DATA_EGRESS_TOOL_RATE_LIMIT_PER_MINUTE`, `MCP_DATA_EGRESS_TOOL_RATE_LIMIT_WINDOW_MS`
- Per-tool overrides: `MCP_DATA_EGRESS_TOOL_RATE_LIMITS=toolA:5,toolB:2`
- `429` means rate-limit exceeded.

### Approval outcomes

- `403` usually means allowlist/policy denied.
- `202` means approval is required and execution is paused.
- Shape gate approval is required when payload/attachment/thread thresholds are exceeded, even if DLP text patterns do not trigger.

## 4. Task-vs-reality model

Core v1 destructive workflows:

- `deleteRapidFireDb -> verifyRapidFireDbDeleted`
- `deleteRapidFireCollection -> verifyRapidFireCollectionDeleted`
- `deleteRapidFireDocument -> verifyRapidFireDocumentDeleted`

Policy behavior:

- `off`: no verification obligations
- `warn`: log verification obligations, no blocking
- `enforce`: block subsequent critical destructive tools in the same `owner_user_id + session_id` while verification remains pending or failed

Audit telemetry is written on `mcp_tool_audit_events` using explicit verification and egress-shape columns.

## 5. Product roadmap (next)

- Critical workflow expansion: add verify-after-write mappings for other high-impact tools.
- Guard ops: export guard decisions and link pattern hash/version to refresh runs.
- Tribe workflows at scale: continue large-window design + health metrics in UI.

## 6. Related docs

| Doc | Content |
|---|---|
| [Setup and Onboarding](./setup-and-onboarding.md) | Local app, Supabase, Docker onboarding |
| [MCP Security Hardening](./mcp-security-hardening.md) | Env catalog, strict checklist, verification drills |
| [SENTINEL Control Plane](./sentinel-control-plane.md) | Risk, veto, approval lifecycle, API |
| [Realtime Tools](./realtime-tools.md) | Realtime tool execution and approvals |
| [Supabase LLM DB Tools](./supabase-llm-db-tools.md) | LLM DB tools and RAG controls |
| [Supabase Schema and RLS Checklist](./supabase-schema-rls-checklist.md) | Tenant isolation and RLS validation |
