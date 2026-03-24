# MCP Integration

This app exposes an MCP-compatible JSON-RPC endpoint:

- `POST /api/mcp`
- `GET /api/mcp` (authenticated metadata)
- `POST /api/mcp/subagents/supabase`
- `GET /api/mcp/subagents/supabase`

## Supported MCP Methods

- `initialize`
- `notifications/initialized`
- `tools/list`
- `tools/call`

## Tool Surface

Shared tool registry used across MCP, chat, and realtime:

- LinkedIn tools (`lib/linkedin-tools.ts`)
- Includes analytics tools for CRM/tribe/group intelligence:
  - `analyzeCrmPortfolio`
  - `analyzeTribeComposition`
  - `analyzeGroupTalentOpportunities`
- Supabase Rapid Fire DB tools (`lib/supabase-llm-db-tools.ts`) when bearer auth is valid

## Supabase Sub-Agent Scope

Scope via query parameter:

- `GET/POST /api/mcp?subagent=supabase`

Or use alias endpoints:

- `/api/mcp/subagents/supabase`

When sub-agent mode is active, only these tools are listed/callable:

- `createRapidFireDb`
- `listRapidFireDbs`
- `createRapidFireCollection`
- `upsertRapidFireDocument`
- `queryRapidFireDocuments`

A valid Supabase bearer token is required in this mode.

## Security Model

- MCP endpoint requires bearer auth.
- Unauthorized requests return `401` with `WWW-Authenticate: Bearer ... resource_metadata=...`.
- OAuth Protected Resource Metadata is exposed at `/.well-known/oauth-protected-resource`.
- Optional introspection mode is supported.
- Optional issuer/audience/scope enforcement is supported.
- HTTPS is required in production by default (unless explicitly disabled).
- Request body limits and rate limits are configurable.
- Tool calls are validated server-side (policy, scope, schema).
- Suspicious tool arguments can be blocked before execution.
- Tool audit events are persisted in `mcp_tool_audit_events`.
- SENTINEL risk and approval workflow is enforced at shared execution chokepoint.

## Approval-Gated Tool Calls

For privileged, DLP-flagged, or vetoed calls, execution returns an approval-required response.

Retry `tools/call` with one of:

- `params.approvalId`
- `params.approval_id`
- `params._meta.approvalId`

Approval is owner-bound, argument-bound, and single-use (consumed on successful replay).

## SENTINEL Behavior in MCP

`tools/call` runs through `executeRealtimeTool` pipeline:

1. sub-agent and policy checks
2. auth scope checks
3. injection inspection
4. risk scoring
5. privileged + DLP + veto approval checks
6. manifest generation (C2PA-style chaining)
7. audit persistence

If execution is paused for approval, MCP returns `isError: true` with structured details including approval metadata.

## OAuth Discovery

- `GET /.well-known/oauth-protected-resource`
  - resource metadata (`resource`, `authorization_servers`, `scopes_supported`)
- `GET /api/mcp` (authenticated)
  - MCP capabilities + active auth configuration

## Example Flow

### Initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "clientInfo": { "name": "my-client", "version": "0.1.0" }
  }
}
```

### List Tools

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### Call Tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "searchProfiles",
    "arguments": {
      "keywords": "senior backend engineer",
      "location": "San Francisco",
      "limit": 5
    }
  }
}
```

### Replay With Approval ID

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "sendMessage",
    "arguments": {
      "conversationId": "abc123",
      "message": "Approved outbound update"
    },
    "approvalId": "11111111-2222-4333-8444-555555555555"
  }
}
```

## Environment Variables

Common MCP auth/runtime vars:

- `MCP_PROTOCOL_VERSION`
- `MCP_SERVER_NAME`
- `MCP_SERVER_VERSION`
- `MCP_SERVER_INSTRUCTIONS`
- `MCP_DEFAULT_SUBAGENT`
- `MCP_RESOURCE_URL`
- `MCP_RESOURCE_METADATA_URL`
- `MCP_AUTHORIZATION_SERVERS`
- `MCP_SCOPES_SUPPORTED`
- `MCP_ENFORCE_SCOPES`
- `MCP_REQUIRED_SCOPES`
- `MCP_ENFORCE_AUDIENCE`
- `MCP_EXPECTED_AUDIENCES`
- `MCP_ENFORCE_ISSUER`
- `MCP_EXPECTED_ISSUER`
- `MCP_TOOL_SCOPE_MAP_JSON`
- `MCP_REQUIRE_HTTPS`
- `MCP_AUTH_MODE`
- `MCP_INTROSPECTION_URL`
- `MCP_INTROSPECTION_CLIENT_ID`
- `MCP_INTROSPECTION_CLIENT_SECRET`
- `MCP_INTROSPECTION_AUTH_METHOD`
- `MCP_INTROSPECTION_TIMEOUT_MS`
- `MCP_MAX_BODY_BYTES`
- `MCP_RATE_LIMIT_MAX`
- `MCP_RATE_LIMIT_WINDOW_MS`

Security-hardening vars are documented in detail in `docs/mcp-security-hardening.md`.

## Related

- `docs/mcp-security-hardening.md`
- `docs/sentinel-control-plane.md`
- `docs/realtime-tools.md`
- `docs/supabase-llm-db-tools.md`
