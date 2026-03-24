# MCP Security Hardening

This project includes an MCP hardening layer designed to reduce prompt-injection and tool abuse risk in agent workflows.

## Controls Implemented

- Tool policy gates (`allowlist` / `blocklist`) before tool execution.
- Suspicious argument inspection for instruction-hijack and secret-exfil patterns.
- Sanitized tool descriptions to suppress hidden instruction payloads.
- Optional bearer-token requirement for realtime tool endpoints.
- SENTINEL mode-aware risk scoring and veto decisions (`shadow`/`soft`/`enforce`).
- Privileged tool class enforcement with explicit human approval at execution time.
- Critical destructive workflow verification policy (`off`/`warn`/`enforce`) with verify-after-write tracking.
- Data-egress DLP review for outbound tools (`send/post/publish/share`) with approval-gated replay.
- Workflow-shaped egress approval for oversized payloads, large attachment sets, or long threads.
- RAG poisoning and source-trust checks on Supabase LLM document upserts and query results.
- Dedicated LLM guard-model classification pass before tool execution (`pre_tool`) and before response generation (`pre_response`), with `shadow`/`enforce` behavior.
- Externalized security-pattern registry (`config/security-patterns.json`) loaded at startup by chat/MCP/web/Supabase tooling.
- C2PA-style hash manifests chained by session/owner for provenance validation.
- Immutable-style server audit events for allowed/blocked/failed/vetoed tool calls.

## Environment Controls

- `MCP_ENFORCE_TOOL_ALLOWLIST=true|false`
- `MCP_ALLOWED_TOOLS=tool_a,tool_b`
- `MCP_BLOCKED_TOOLS=tool_x,tool_y`
- `MCP_BLOCK_SUSPICIOUS_TOOL_ARGS=true|false`
- `REALTIME_TOOLS_REQUIRE_AUTH=true|false`
- `SUPABASE_MCP_AUDIT_TABLE=mcp_tool_audit_events`
- `SENTINEL_MODE=shadow|soft|enforce`
- `SENTINEL_VETO_THRESHOLD=70`
- `SENTINEL_ALERT_THRESHOLD=50`
- `SENTINEL_VETO_ENABLED=true|false`
- `SENTINEL_ALERT_WEBHOOK_ENABLED=true|false`
- `SENTINEL_ALERT_WEBHOOK_URL=https://...`
- `SENTINEL_ALERT_WEBHOOK_BEARER_TOKEN=...`
- `SENTINEL_ALERT_WEBHOOK_TIMEOUT_MS=5000`
- `SENTINEL_ALERT_WEBHOOK_COOLDOWN_SECONDS=900`
- `SENTINEL_ALERT_KPI_TASK_REALITY_MISMATCH_THRESHOLD=1`
- `SENTINEL_ALERT_KPI_CRITICAL_VERIFICATION_MISSED_THRESHOLD=1`
- `SENTINEL_ALERT_KPI_UNRESOLVED_HIGH_RISK_EVENTS_THRESHOLD=5`
- `SENTINEL_ALERT_KPI_OPEN_INCIDENTS_THRESHOLD=3`
- `SENTINEL_ALERT_KPI_HIGH_SEVERITY_ANOMALY_THRESHOLD=1`
- `SENTINEL_CRON_SECRET=...`
- `SENTINEL_ALERT_OWNER_LOOKBACK_HOURS=24`
- `SENTINEL_ALERT_MAX_OWNERS_PER_RUN=100`
- `SENTINEL_CRON_RATE_LIMIT_MAX=30`
- `SENTINEL_CRON_RATE_LIMIT_WINDOW_MS=60000`
- `MCP_REQUIRE_PRIVILEGED_TOOL_APPROVAL=true|false`
- `MCP_PRIVILEGED_TOOLS=tool_a,tool_b`
- `MCP_NON_PRIVILEGED_TOOLS=tool_x,tool_y`
- `MCP_AUTO_CLASSIFY_PRIVILEGED_TOOLS=true|false`
- `MCP_CRITICAL_WORKFLOW_VERIFY_MODE=off|warn|enforce`
- `MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS=120`
- `MCP_ENFORCE_DATA_EGRESS_DLP=true|false`
- `MCP_DATA_EGRESS_TOOLS=tool_a,tool_b`
- `MCP_NON_DATA_EGRESS_TOOLS=tool_x,tool_y`
- `MCP_AUTO_CLASSIFY_DATA_EGRESS_TOOLS=true|false`
- `MCP_ENFORCE_DATA_EGRESS_TOOL_ALLOWLIST=true|false`
- `MCP_EGRESS_SHAPE_APPROVAL_ENABLED=true|false`
- `MCP_EGRESS_APPROVAL_PAYLOAD_BYTES_THRESHOLD=65536`
- `MCP_EGRESS_APPROVAL_ATTACHMENT_COUNT_THRESHOLD=3`
- `MCP_EGRESS_APPROVAL_THREAD_MESSAGE_COUNT_THRESHOLD=10`
- `MCP_DATA_EGRESS_TOOL_ALLOWLIST=tool_a,tool_b`
- `MCP_DATA_EGRESS_TOOL_RATE_LIMIT_PER_MINUTE=20`
- `MCP_DATA_EGRESS_TOOL_RATE_LIMIT_WINDOW_MS=60000`
- `MCP_DATA_EGRESS_TOOL_RATE_LIMITS=sendMessage:5,postContent:2`
- `WEB_TOOLS_ALLOWED_DOMAINS=example.com,docs.example.com` (optional; when set, web tools will only fetch from these hostnames or their subdomains)
- `WEB_TOOLS_ENFORCE_DNS_REBINDING_PROTECTION=true|false`
- `WEB_TOOLS_DNS_LOOKUP_TIMEOUT_MS=2500`
- `REALTIME_ALLOW_PRIVATE_UPSTREAM_HOST=true|false` (default secure: block private/local metadata hosts in production)
- `SENTINEL_APPROVAL_DEDUPE_WINDOW_MINUTES=10`
- `SENTINEL_APPROVAL_EXECUTION_WINDOW_MINUTES=120`
- `LLM_GUARD_ENABLED=true|false`
- `LLM_GUARD_ENFORCE=true|false`
- `LLM_GUARD_FAIL_CLOSED=true|false`
- `LLM_GUARD_MODEL=gpt-4o-mini`
- `LLM_GUARD_TIMEOUT_MS=6000`
- `LLM_GUARD_MAX_CONTEXT_CHARS=6000`
- `SUPABASE_LLM_BLOCK_POISONED_DOCUMENTS=true|false`
- `SUPABASE_LLM_REQUIRE_TRUSTED_SOURCE_FOR_UPSERT=true|false`
- `SUPABASE_LLM_TRUSTED_SOURCES=wiki,notion,sharepoint`
- `SUPABASE_LLM_FILTER_UNTRUSTED_QUERY_RESULTS=true|false`
- `SUPABASE_LLM_REDACT_SENSITIVE_QUERY_FIELDS=true|false`

## External Pattern Registry and Refresh

Runtime pattern consumers read from:

- `config/security-patterns.json`
- startup loader: `lib/security-patterns.ts`

Consumer modules:

- `app/api/chat/route.ts` (jailbreak prefilter)
- `lib/mcp-tool-security.ts` (suspicious text, injection categories, egress DLP)
- `lib/supabase-llm-db-tools.ts` (RAG poison + sensitive query redaction)
- `lib/web-search-tools.ts` (prompt-injection + suspicious web content patterns)

At startup, each consumer logs a compact health line with registry metadata:

- ruleset hash
- version
- pattern counts by section

Refresh automation:

- Local/private scheduler: `security-cron` service in `docker-compose.yml`
  - runs `node scripts/update-security-patterns-from-openai.js`
  - interval via `SECURITY_PATTERNS_INTERVAL_SECONDS` (default `604800`, 7 days)
  - requires `OPENAI_API_KEY` (optional `SECURITY_PATTERNS_OPENAI_MODEL`, default `gpt-4o-mini`)
- External-feed script: `node scripts/update-security-patterns.mjs`
- GitHub workflow (optional): `.github/workflows/security-patterns-refresh.yml`
  - default schedule: daily at `03:00 UTC` (`0 3 * * *`)
  - optional feed secrets:
  - `SECURITY_PATTERNS_FEED_URL`
  - `SECURITY_PATTERNS_FEED_BEARER`

Both updater paths normalize to the same schema, validate regex syntax before write, de-duplicate patterns, and only bump `version`/`updatedAt` when effective ruleset content changes.

## Audit Table

Table: `mcp_tool_audit_events`

Captures:

- actor/user context
- tool name and transport (`mcp`, `realtime-tools`, `chat`)
- execution status (`allowed`, `blocked`, `failed`, `vetoed`)
- argument hash/size and redacted preview
- reason or error details
- risk score + risk level
- manifest id/hash + parent hash
- injection signature matches
- credential-access detection flag

Access model:

- production-hardening keeps this table internal (service-role/API access), not direct client-table reads.
- owner-scoped visibility is exposed through `GET /api/sentinel` rather than direct table grants.

## Recommended Production Defaults

- `MCP_ENFORCE_TOOL_ALLOWLIST=true`
- `MCP_BLOCK_SUSPICIOUS_TOOL_ARGS=true`
- `REALTIME_TOOLS_REQUIRE_AUTH=true`
- `REALTIME_ALLOW_PRIVATE_UPSTREAM_HOST=false`
- `WEB_TOOLS_ENFORCE_DNS_REBINDING_PROTECTION=true`
- `MCP_ENFORCE_DATA_EGRESS_TOOL_ALLOWLIST=true` with explicit `MCP_DATA_EGRESS_TOOL_ALLOWLIST`
- `SENTINEL_MODE=shadow` for initial rollout, then `soft`, then `enforce`
- populate `MCP_ALLOWED_TOOLS` with least-privilege set only (when allowlist is enforced, include only the tools the chat agent should use: e.g. `webSearch`, `fetchPage`, `searchProfiles`, `getProfileDetails`, `createTribe`, `listTribes`, `getProjectCrmInsights`, plus any Supabase LLM DB tool names if using that sub-agent)

## Production Strict-Mode Checklist

After validating in `shadow`/`soft`, set these for full enforcement:

| Env var | Value | Purpose |
|---|---|---|
| `MCP_ENFORCE_DATA_EGRESS_DLP` | `true` | Require explicit human approval before send/post/publish/share-style tool execution (outbound LLM egress DLP). |
| `MCP_CRITICAL_WORKFLOW_VERIFY_MODE` | `warn` | Critical destructive write policy: `off` (disabled), `warn` (audit only), `enforce` (block next destructive action until verification is resolved). |
| `MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS` | `120` | Verification deadline for critical writes. |
| `MCP_ENFORCE_DATA_EGRESS_TOOL_ALLOWLIST` | `true` | Enforce per-tool allowlist for egress-classified tools before execution. |
| `MCP_EGRESS_SHAPE_APPROVAL_ENABLED` | `true` | Require approval for workflow-shaped egress threshold breaches. |
| `MCP_EGRESS_APPROVAL_PAYLOAD_BYTES_THRESHOLD` | `65536` | Approval threshold for outbound payload size (bytes). |
| `MCP_EGRESS_APPROVAL_ATTACHMENT_COUNT_THRESHOLD` | `3` | Approval threshold for attachment/media count. |
| `MCP_EGRESS_APPROVAL_THREAD_MESSAGE_COUNT_THRESHOLD` | `10` | Approval threshold for thread/conversation message count. |
| `MCP_DATA_EGRESS_TOOL_ALLOWLIST` | Comma-separated list | Explicit list of egress tools allowed to execute (example: `sendMessage,postContent`). |
| `MCP_DATA_EGRESS_TOOL_RATE_LIMIT_PER_MINUTE` | `20` | Default egress-tool execution cap per actor/window. |
| `MCP_DATA_EGRESS_TOOL_RATE_LIMIT_WINDOW_MS` | `60000` | Egress rate-limit window duration in ms. |
| `MCP_DATA_EGRESS_TOOL_RATE_LIMITS` | `tool:limit` list | Optional per-tool override map (example: `sendMessage:5,postContent:2`). |
| `SUPABASE_LLM_BLOCK_POISONED_DOCUMENTS` | `true` | Block poisoned document upserts in RAG (policy-based). |
| `SUPABASE_LLM_FILTER_UNTRUSTED_QUERY_RESULTS` | `true` | Exclude untrusted/poisoned docs from query results. |
| `SUPABASE_LLM_TRUSTED_SOURCES` | Comma-separated list | Example: `wiki,notion,sharepoint` for allowed ingestion sources. |

Optional stricter RAG settings:

- `SUPABASE_LLM_REQUIRE_TRUSTED_SOURCE_FOR_UPSERT=true`
- `SUPABASE_LLM_REDACT_SENSITIVE_QUERY_FIELDS=true`

Define `SUPABASE_LLM_TRUSTED_SOURCES` before enabling require-trusted-source.
For strict prompt-injection posture, set `LLM_GUARD_ENABLED=true` and `LLM_GUARD_ENFORCE=true` (and optionally `LLM_GUARD_FAIL_CLOSED=true`).

## Post-Change Verification

After enabling strict-mode flags, run these checks:

1. `pnpm smoke:sentinel:drill`
2. Call a send/post style tool without approval and confirm `202` with approval-required details.
3. Call an egress tool that is not in `MCP_DATA_EGRESS_TOOL_ALLOWLIST` and confirm it is blocked (`403`).
4. Burst-call an allowed egress tool above configured limits and confirm rate-limit block (`429`) with retry metadata.
5. Execute a critical destructive tool (for example `deleteRapidFireDocument`) and confirm:
   - `warn` mode creates `verification_required=true` with `verification_state=pending`.
   - `enforce` mode blocks subsequent destructive writes with `409` until verification succeeds.
6. Run matching verify tool (`verifyRapidFireDbDeleted`, `verifyRapidFireCollectionDeleted`, or `verifyRapidFireDocumentDeleted`) and confirm state transitions to `passed` or `failed`.
7. Trigger workflow-shaped egress thresholds (large payload, attachments, or thread size) and confirm approval-required behavior (`202`) with shape metrics in details.
8. Resolve approval in SENTINEL, replay with `approvalId`, confirm single-use execution.
9. Upsert a test document containing known poisoning markers and confirm policy behavior.
10. Query documents and verify untrusted/poisoned filtering and sensitive-field redaction counters.
11. Run `node scripts/update-security-patterns.mjs` and confirm either:
   - `no changes` with current hash/counts, or
   - updated file with incremented `version` and refreshed `updatedAt`.
12. Send a known jailbreak prompt and verify chat returns `LLM_GUARD_PRE_TOOL_BLOCKED` or `LLM_GUARD_PRE_RESPONSE_BLOCKED` when enforce mode is on.
13. Run adversarial regression tests locally (`pnpm -s exec vitest run lib/security-patterns.test.ts lib/mcp-tool-security.test.ts lib/llm-guard.test.ts`) or via CI (`.github/workflows/security-adversarial-tests.yml`).
14. If webhook alerting is enabled, run `POST /api/sentinel/cron` (secret-authenticated) and verify webhook delivery + dedupe cooldown behavior.

Recommended API checks:

- `GET /api/sentinel` (owner-scoped snapshot and anomaly visibility)
- `POST /api/sentinel` (`resolve_veto`, `create_incident`, `update_incident`)
- `POST /api/sentinel/cron` (secret-authenticated KPI webhook dispatch sweep)
- `GET /api/subagents/supabase/health` (sub-agent readiness)

## Operational Guidance

- review blocked audit events daily
- treat repeated blocked attempts as possible compromise signals
- keep tool descriptions short and operational
- for privileged/vetoed actions, resolve approval in SENTINEL and replay with `approvalId`
- for RAG ingestion, enforce trusted sources and block poisoned documents before retrieval
