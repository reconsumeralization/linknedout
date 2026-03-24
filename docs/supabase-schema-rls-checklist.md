# Supabase Schema and RLS Checklist

This checklist is derived from the live repo schema/migrations and maps directly to the hardening work for MCP/SENTINEL, LinkedIn identity, and CRM/tribe/project analytics.

## Scope

- `supabase/migrations/20260228123000_baseline_schema.sql`
- `supabase/migrations/20260302000000_linkedout.sql`
- `supabase/migrations/20260302100000_linkedin_consumer.sql`
- `supabase/migrations/20260303090000_sentinel_resilience_incidents.sql`
- `supabase/migrations/20260303113000_supabase_security_hardening.sql`
- `supabase/migrations/20260303123000_supabase_tenant_isolation_crm.sql`
- `supabase/migrations/20260303133000_supabase_tenant_owner_model_crm.sql`
- `supabase/migrations/20260303170000_critical_workflow_verification_and_egress_shape.sql`
- `supabase/migrations/20260303193000_sentinel_kpi_webhook_alerts.sql`

## 1) LinkedIn identity tables

Tables:

- `linkedin_identities`
- `linkedin_share_audit`

Current controls:

- RLS enabled on both tables.
- `SELECT` policy scoped to `auth.uid() = user_id` on both tables.
- Write path is server-side OAuth callback using service role in `lib/linkedin-identity-server.ts`.

Hardening status:

- Added integrity constraints for non-empty `linkedin_subject` and `access_token`.
- Added unique index on `linkedin_subject` to prevent duplicate principal bindings.
- Added `updated_at` trigger (`set_updated_at`) for immutable timestamp hygiene.

Production checks:

- Confirm no client-side code writes directly to these tables.
- Confirm access tokens are never returned in API payloads.

## 2) MCP/SENTINEL audit tables

Tables:

- `mcp_tool_audit_events` (`SUPABASE_MCP_AUDIT_TABLE`)
- `sentinel_veto_approvals`
- `sentinel_threat_dismissals`
- `sentinel_incidents` (`SENTINEL_INCIDENTS_TABLE`)
- `sentinel_alert_dispatches` (`SENTINEL_ALERT_DISPATCHES_TABLE`)

Current controls:

- Audit writes use server-side service role via `lib/mcp-tool-audit.ts`.
- SENTINEL reads/writes are owner-scoped in server code via `lib/sentinel-data.ts`.

Hardening status:

- Removed direct authenticated read policy from `mcp_tool_audit_events`.
- Revoked direct `anon`/`authenticated` table privileges for `mcp_tool_audit_events`.
- Access pattern is now internal API/service-role only.
- `sentinel_alert_dispatches` is internal service-role telemetry for webhook dedupe/delivery state (RLS enabled, no direct client policy).

Production checks:

- Verify `GET /api/sentinel` still returns owner-scoped data via server route.
- Verify no client-side direct Supabase queries target `mcp_tool_audit_events`.

## 3) Supabase LLM DB (RAG) tables

Tables:

- `llm_workspaces` (`SUPABASE_LLM_WORKSPACES_TABLE`)
- `llm_collections` (`SUPABASE_LLM_COLLECTIONS_TABLE`)
- `llm_documents` (`SUPABASE_LLM_DOCUMENTS_TABLE`)

Current controls:

- RLS enabled with owner-scoped policies and parent relation checks.
- Tool layer enforces auth context, payload caps, poisoning detection, trusted sources, and redaction flags (`lib/supabase-llm-db-tools.ts`).

Hardening status:

- Added DB triggers that enforce owner/workspace/collection consistency on insert/update:
  - `enforce_llm_collection_owner_consistency`
  - `enforce_llm_document_owner_consistency`
- These guard against accidental privilege drift if any write path ever bypasses RLS checks.

Production checks:

- Keep `SUPABASE_LLM_BLOCK_POISONED_DOCUMENTS=true`.
- Keep `SUPABASE_LLM_FILTER_UNTRUSTED_QUERY_RESULTS=true`.
- Define `SUPABASE_LLM_TRUSTED_SOURCES` before enforcing trusted-source-only upserts.

## 4) CRM / tribes / projects data

Core tables used by analytics tools:

- `profiles`, `tribes`, `projects`, `project_positions`, `project_applications`

Current state:

- `profiles` and `projects` have owner-scoped policies (`owner_user_id = auth.uid()` with guarded checks).
- `project_applications` has scoped applicant/owner policies.
- `project_positions` read access is now owner-scoped via the parent `projects.owner_user_id`.
- `tribes`, `activity_log`, `csv_uploads`, and `friend_locations` now include `owner_user_id` columns.
- `tribes` now has owner-scoped read/write policy (`tribes_owner_rw`) so users can only access their own tribe rows.
- `csv_uploads` now has owner-scoped read + insert policies (`csv_uploads_owner_read`, `csv_uploads_owner_insert`).
- `activity_log` and `friend_locations` now have owner-scoped read policies (`*_owner_read`); authenticated-wide reads remain removed.
- Insert triggers auto-populate `owner_user_id` from `auth.uid()` when omitted.

Risk note:

- Previous authenticated-wide read (`USING (true)`) on these tables was not tenant-isolated and could leak cross-workspace data in multi-tenant production.
- After `20260303123000_supabase_tenant_isolation_crm.sql` and `20260303133000_supabase_tenant_owner_model_crm.sql`, cross-tenant reads through these tables are blocked for `authenticated` clients; user access is now scoped by `owner_user_id` where policies are defined.

Remaining hardening:

1. Backfill any legacy rows where `owner_user_id` is still `null` (especially `activity_log`, `csv_uploads`, `friend_locations`) if those rows must be visible to end users.
2. If needed by product behavior, add owner-scoped write policies for `activity_log` and `friend_locations` (currently read-only for authenticated users).
3. Keep app write paths setting owner from auth context even though insert triggers also auto-fill.

## Quick SQL verification

Run in SQL editor to validate key posture:

```sql
select schemaname, tablename, policyname, permissive, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'linkedin_identities',
    'linkedin_share_audit',
    'mcp_tool_audit_events',
    'llm_workspaces',
    'llm_collections',
    'llm_documents',
    'profiles',
    'tribes',
    'projects',
    'project_positions',
    'project_applications'
  )
order by tablename, policyname;
```

```sql
-- Verify no authenticated-wide read policies remain on legacy CRM tables.
select schemaname, tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('tribes', 'activity_log', 'csv_uploads', 'friend_locations')
order by tablename, policyname;
```

```sql
-- Check ownership backfill coverage on legacy CRM tables.
select 'tribes' as table_name, count(*) as total_rows, count(*) filter (where owner_user_id is null) as owner_null_rows
from public.tribes
union all
select 'activity_log' as table_name, count(*) as total_rows, count(*) filter (where owner_user_id is null) as owner_null_rows
from public.activity_log
union all
select 'csv_uploads' as table_name, count(*) as total_rows, count(*) filter (where owner_user_id is null) as owner_null_rows
from public.csv_uploads
union all
select 'friend_locations' as table_name, count(*) as total_rows, count(*) filter (where owner_user_id is null) as owner_null_rows
from public.friend_locations;
```

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'mcp_tool_audit_events'
order by grantee, privilege_type;
```
