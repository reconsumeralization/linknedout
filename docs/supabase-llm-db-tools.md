# Secure Supabase LLM DB Tools

This app exposes a restricted Supabase toolset for chat/realtime/MCP use.

## Design Goals

- no raw SQL exposure to model tools
- no service-role writes from model tool execution
- user-scoped auth context for every operation
- RLS-enforced data isolation

## Available Tools

- `createRapidFireDb`
- `listRapidFireDbs`
- `createRapidFireCollection`
- `upsertRapidFireDocument`
- `queryRapidFireDocuments`

## Sub-Agent Scope

These tools can be isolated with Supabase sub-agent scope:

- `GET/POST /api/mcp/subagents/supabase`
- `/api/mcp?subagent=supabase`
- `/api/chat?subagent=supabase` and `/api/chat/subagents/supabase`
- `/api/realtime/tools?subagent=supabase` and `/api/realtime/tools/subagents/supabase`
- `/api/realtime/session?subagent=supabase` and `/api/realtime/session/subagents/supabase`
- `/api/realtime/client-secret?subagent=supabase` and `/api/realtime/client-secret/subagents/supabase`

## Tables

Logical database operations use:

- `llm_workspaces`
- `llm_collections`
- `llm_documents`

## Security Controls

Baseline:

- Feature flag gate: `ENABLE_SUPABASE_LLM_DB_TOOLS=true`
- Auth required for tool access
- Identifier validation and payload size limits
- Ownership checks and RLS isolation

RAG hardening:

- Prompt-poisoning pattern scan on upsert payloads
- Optional block mode for poisoned documents
- Optional trusted-source requirement on upsert
- Optional filter of untrusted/poisoned documents at query time
- Optional sensitive-field redaction in query response payloads
- Security metadata attached to stored document metadata (`_security` block)

## RAG Hardening Environment Flags

- `SUPABASE_LLM_BLOCK_POISONED_DOCUMENTS=true|false`
- `SUPABASE_LLM_REQUIRE_TRUSTED_SOURCE_FOR_UPSERT=true|false`
- `SUPABASE_LLM_TRUSTED_SOURCES=wiki,notion,sharepoint`
- `SUPABASE_LLM_FILTER_UNTRUSTED_QUERY_RESULTS=true|false`
- `SUPABASE_LLM_REDACT_SENSITIVE_QUERY_FIELDS=true|false`

## Query Response Security Fields

`queryRapidFireDocuments` may return a `security` object with:

- `trustedSourceAllowlistEnabled`
- `filterUntrustedQueryResults`
- `redactSensitiveQueryFields`
- `filteredPoisonedDocuments`
- `filteredUntrustedDocuments`
- `redactedSensitiveFields`

## Setup

1. Start local Supabase: `pnpm supabase:local:start`
2. Reset/apply schema: `pnpm supabase:local:reset`
3. Set `.env.local` values:
  - `ENABLE_SUPABASE_LLM_DB_TOOLS=true`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Send `Authorization: Bearer <supabase_access_token>` on tool routes.

## SENTINEL Integration

All tool calls pass through unified SENTINEL pipeline:

- risk scoring
- veto/approval logic
- C2PA-style provenance chain
- owner-scoped audit persistence

SENTINEL API:

- `GET /api/sentinel`
- `POST /api/sentinel` with `resolve_veto`, `dismiss_threat`, `create_incident`, `update_incident`

## App Views and Supabase Features

The app exposes all Supabase features (Auth, Database, Storage, Realtime) through branded front-ends. Chat and the assistant drawer are view-aware; page context includes Data hub, Fundraising, and Files & assets (Storage). See [Supabase features and front-ends](./supabase-features-and-frontends.md) for the full map.

## Related

- [Supabase features and front-ends](./supabase-features-and-frontends.md) - Auth, Database, Storage, Data hub, and panel map
- `docs/mcp-integration.md`
- `docs/realtime-tools.md`
- `docs/mcp-security-hardening.md`
- `docs/sentinel-control-plane.md`

