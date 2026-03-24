# Realtime Tools

This app includes secure server routes for OpenAI Realtime with tool execution.

## Endpoints

- `POST /api/realtime/client-secret`
  - mints short-lived Realtime client tokens
  - injects available tool definitions
- `POST /api/realtime/session`
  - performs server-side WebRTC SDP exchange
  - injects tool definitions
- `POST /api/realtime/tools`
  - executes tool calls on server
  - returns `conversation.item.create` payload for function output replay

Each endpoint supports `?subagent=supabase` and alias routes under `/api/realtime/*/subagents/supabase`.

## Client Tool Loop

`lib/realtime-client.ts`:

- extracts function-call events from Realtime server events
- calls `/api/realtime/tools`
- sends `function_call_output` + `response.create` events back to model
- de-duplicates tool call events (`call_id` + tool name)

## Security Model

- `OPENAI_API_KEY` remains server-only.
- Tool execution path is unified with MCP/chat (`executeRealtimeTool`).
- Tool names are constrained and policy-checked.
- Tool arguments are schema-validated.
- Suspicious argument patterns can be blocked.
- SENTINEL performs risk scoring, provenance manifest generation, and audit logging.
- Privileged, destructive, DLP-flagged, workflow-shape egress, and vetoed actions require explicit approval before execution.
- Critical destructive workflows can require verify-after-write obligations (`off`/`warn`/`enforce`).

## Critical Workflow Verification (Core v1)

Mapped destructive tools:

- `deleteRapidFireDb -> verifyRapidFireDbDeleted`
- `deleteRapidFireCollection -> verifyRapidFireCollectionDeleted`
- `deleteRapidFireDocument -> verifyRapidFireDocumentDeleted`

Modes (`MCP_CRITICAL_WORKFLOW_VERIFY_MODE`):

- `off`: no verification obligations
- `warn`: destructive success logs `verification_state=pending`; no blocking
- `enforce`: before executing another destructive action in the same session, unresolved (`pending`/`failed`) verification blocks with `409`

Window:

- `MCP_CRITICAL_WORKFLOW_VERIFY_WINDOW_SECONDS` controls verification due-at deadline in audit telemetry.

In chat/realtime tool usage, call the mapped `verify*` tool after destructive writes before claiming completion.

## Workflow-Shaped Egress Approval

In addition to DLP text inspection, egress actions are shape-inspected from tool args:

- payload byte size
- attachment/media count
- thread/conversation message count

When enabled (`MCP_EGRESS_SHAPE_APPROVAL_ENABLED=true`), threshold breaches trigger approval-required behavior:

- `MCP_EGRESS_APPROVAL_PAYLOAD_BYTES_THRESHOLD` (default `65536`)
- `MCP_EGRESS_APPROVAL_ATTACHMENT_COUNT_THRESHOLD` (default `3`)
- `MCP_EGRESS_APPROVAL_THREAD_MESSAGE_COUNT_THRESHOLD` (default `10`)

If approval is required, the tool call returns `202` with shape reasons and metrics.

## Approval Replay (Realtime)

When tool execution pauses for approval (`202` response), replay with approved ID:

- body: `approvalId` or `approval_id`
- header: `x-sentinel-approval-id` (also supports `sentinel-approval-id` and `x-approval-id`)
- argument aliases supported in shared execution path: `__sentinelApprovalId`, `sentinelApprovalId`

Approval grants are single-use and owner-bound.

## Minimal Browser Flow

1. Create WebRTC offer.
2. Send SDP offer to `POST /api/realtime/session`.
3. Apply returned SDP answer.
4. Listen for server events.
5. Pass events to `processRealtimeToolCallsFromServerEvent(...)`.

```ts
import { processRealtimeToolCallsFromServerEvent } from "@/lib/realtime-client"

dataChannel.onmessage = async (msg) => {
  const event = JSON.parse(msg.data)

  await processRealtimeToolCallsFromServerEvent(event, {
    accessToken: supabaseAccessTokenOrNull,
    subagent: "supabase",
    sendClientEvent: (clientEvent) => {
      dataChannel.send(JSON.stringify(clientEvent))
    },
    onToolError: (error) => console.error(error),
  })
}
```

## Environment Variables

Required:

- `OPENAI_API_KEY`

Common optional:

- `OPENAI_REALTIME_MODEL` (default `gpt-realtime`)
- `OPENAI_REALTIME_VOICE`
- `OPENAI_REALTIME_EXPIRES_AFTER_SECONDS` (default `600`)
- `OPENAI_API_BASE_URL` (default `https://api.openai.com`)
- `REALTIME_ALLOW_INSECURE_UPSTREAM` (default `false` in production behavior)
- `REALTIME_ALLOW_PRIVATE_UPSTREAM_HOST` (default `false`; blocks localhost/private/metadata upstream hosts in production)
- `REALTIME_TOOLS_MAX_BODY_BYTES`
- `REALTIME_TOOLS_RATE_LIMIT_MAX`
- `REALTIME_TOOLS_RATE_LIMIT_WINDOW_MS`
- `REALTIME_SESSION_MAX_BODY_BYTES`
- `REALTIME_SESSION_MAX_SDP_BYTES`
- `REALTIME_SESSION_RATE_LIMIT_MAX`
- `REALTIME_SESSION_RATE_LIMIT_WINDOW_MS`
- `REALTIME_CLIENT_SECRET_MAX_BODY_BYTES`
- `REALTIME_CLIENT_SECRET_RATE_LIMIT_MAX`
- `REALTIME_CLIENT_SECRET_RATE_LIMIT_WINDOW_MS`

Security-hardening vars for approval, DLP, and SENTINEL behavior are documented in `docs/mcp-security-hardening.md` and `docs/sentinel-control-plane.md`.

## Related

- `docs/mcp-integration.md`
- `docs/mcp-security-hardening.md`
- `docs/sentinel-control-plane.md`
- `docs/supabase-llm-db-tools.md`
