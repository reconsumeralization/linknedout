# API Authentication and Route Protection

This document defines which API routes require authentication and how to keep new routes secure.

## Auth Mechanism

- Protected routes expect a valid Supabase JWT in `Authorization: Bearer <access_token>`.
- Auth is resolved per request via `resolveSupabaseAuthContextFromRequest()` in `lib/supabase-auth.ts`.
- There is no global Next.js auth middleware; each route (or shared helper) enforces auth.
- For new protected routes, use `requireSupabaseAuth(req)` from `lib/require-auth.ts`.

## Public Routes

| Route | Purpose |
|---|---|
| `GET/POST /.well-known/oauth-protected-resource` | OAuth/MCP discovery metadata. |
| `GET /api/globe/layers` | Public layer catalog (IP rate-limited). |
| `GET /api/email/oauth?action=status` | Email OAuth provider readiness status. |
| `GET /api/linkedin/oauth?action=status` | LinkedIn OAuth provider readiness status. |
| `GET /api/auth/ai/status` | AI provider readiness flags only. |

All other API routes below require a Supabase bearer token unless noted.

## Protected Routes

| Area | Routes | Notes |
|---|---|---|
| Chat | `POST /api/chat`, `GET /api/chat?action=metrics` | `CHAT_REQUIRE_AUTH=false` can disable chat auth (not recommended in production). Metrics require `METRICS_API_KEY` unless `CHAT_METRICS_REQUIRE_AUTH=false`. |
| Realtime | `POST /api/realtime/session`, `POST /api/realtime/client-secret`, `POST /api/realtime/tools` | `REALTIME_REQUIRE_AUTH=false` can disable auth (not recommended in production). |
| MCP | `POST /api/mcp` | Also enforces issuer/audience/scope logic from `lib/mcp-auth.ts`. |
| Agents | `GET/POST /api/agents/control-plane` | Bearer required. |
| Agents cron | `POST /api/agents/control-plane/cron` | Either bearer auth, or `x-cron-secret` / bearer matching `AGENT_CONTROL_PLANE_CRON_SECRET`. |
| Email | `GET/POST /api/email/integrations`, `GET/POST/PATCH/DELETE /api/email/integrations/[integrationId]`, `POST /api/email/integrations/[integrationId]/sync`, `GET/POST /api/email/drafts`, `DELETE /api/email/drafts/[draftId]`, `GET/POST /api/email/messages`, `GET /api/email/oauth?action=start` | OAuth callback validates state and user-binding cookies set during authenticated start. |
| Sentinel | `GET/POST /api/sentinel` | POST supports `resolve_veto`, `dismiss_threat`, `create_incident`, `update_incident`. |
| Sentinel cron | `GET/POST /api/sentinel/cron` | `x-cron-secret` or bearer token matching `SENTINEL_CRON_SECRET`; used for KPI webhook dispatch runs. |
| Drones | `POST /api/drones/compliance` | Bearer required. |
| Network | `GET /api/network/insights` | Bearer required. |

## Approval Replay Quick Reference

When a privileged, DLP-flagged, or vetoed tool call requires human approval, retry with an approved `approvalId`.

- Realtime (`POST /api/realtime/tools`):
  - body fields: `approvalId` or `approval_id`
  - headers: `x-sentinel-approval-id`, `sentinel-approval-id`, or `x-approval-id`
  - argument alias support in shared execution path: `__sentinelApprovalId` and `sentinelApprovalId`
- MCP (`POST /api/mcp`, `tools/call` params):
  - `approvalId`
  - `approval_id`
  - `_meta.approvalId` (and related aliases)

## Adding a New Route Safely

1. If route is public, document it in the public table and return no sensitive data.
2. If route is protected, call `requireSupabaseAuth(req)` immediately and return `result.response` when auth fails.
3. Validate all inputs with Zod.
4. Validate dynamic route IDs with `lib/route-params.ts` (UUID validation, IDOR guard).
5. Add per-route body-size limits and rate limits where applicable.
6. Update this file and `docs/README.md` when auth posture changes.

## CORS

- Set `CORS_ALLOWED_ORIGIN` in production to the exact app origin (for example `https://app.example.com`).
- Do not use `*` for protected APIs.
- Chat, MCP, and realtime routes respect this configuration.

## Related

- `lib/require-auth.ts`
- `lib/supabase-auth.ts`
- `lib/route-params.ts`
- `docs/mcp-security-hardening.md`
- `docs/sentinel-control-plane.md`
