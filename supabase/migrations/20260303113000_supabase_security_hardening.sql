-- Supabase security hardening for LinkedIn identity, SENTINEL audit access,
-- and LLM workspace/collection/document ownership integrity.

-- ============================================================================
-- LinkedIn identity hardening
-- ============================================================================

do $$
begin
  if to_regclass('public.linkedin_identities') is null then
    return;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'linkedin_identities_linkedin_subject_nonempty'
       and conrelid = 'public.linkedin_identities'::regclass
  ) then
    alter table public.linkedin_identities
      add constraint linkedin_identities_linkedin_subject_nonempty
      check (char_length(btrim(linkedin_subject)) > 0);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'linkedin_identities_access_token_nonempty'
       and conrelid = 'public.linkedin_identities'::regclass
  ) then
    alter table public.linkedin_identities
      add constraint linkedin_identities_access_token_nonempty
      check (char_length(btrim(access_token)) > 0);
  end if;
end $$;

create unique index if not exists linkedin_identities_linkedin_subject_uidx
  on public.linkedin_identities (linkedin_subject);

drop trigger if exists set_linkedin_identities_updated_at on public.linkedin_identities;
create trigger set_linkedin_identities_updated_at
before update on public.linkedin_identities
for each row execute function public.set_updated_at();

-- ============================================================================
-- MCP/SENTINEL audit access hardening
-- Internal dashboards/API should access through service-role server code.
-- ============================================================================

drop policy if exists mcp_tool_audit_events_owner_read on public.mcp_tool_audit_events;

revoke all on table public.mcp_tool_audit_events from anon;
revoke all on table public.mcp_tool_audit_events from authenticated;

-- ============================================================================
-- LLM table cross-reference integrity hardening
-- Enforce owner/workspace/collection consistency even if RLS is bypassed.
-- ============================================================================

create or replace function public.enforce_llm_collection_owner_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  workspace_owner uuid;
begin
  select w.owner_user_id
    into workspace_owner
    from public.llm_workspaces w
   where w.id = new.workspace_id;

  if workspace_owner is null then
    raise exception 'Invalid llm_collections.workspace_id: %', new.workspace_id
      using errcode = '23503';
  end if;

  if new.owner_user_id is distinct from workspace_owner then
    raise exception 'llm_collections.owner_user_id must match llm_workspaces.owner_user_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_llm_document_owner_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  workspace_owner uuid;
  collection_owner uuid;
  collection_workspace uuid;
begin
  select w.owner_user_id
    into workspace_owner
    from public.llm_workspaces w
   where w.id = new.workspace_id;

  if workspace_owner is null then
    raise exception 'Invalid llm_documents.workspace_id: %', new.workspace_id
      using errcode = '23503';
  end if;

  select c.owner_user_id, c.workspace_id
    into collection_owner, collection_workspace
    from public.llm_collections c
   where c.id = new.collection_id;

  if collection_owner is null then
    raise exception 'Invalid llm_documents.collection_id: %', new.collection_id
      using errcode = '23503';
  end if;

  if collection_workspace is distinct from new.workspace_id then
    raise exception 'llm_documents.workspace_id must match parent llm_collections.workspace_id'
      using errcode = '23514';
  end if;

  if new.owner_user_id is distinct from workspace_owner
     or new.owner_user_id is distinct from collection_owner then
    raise exception 'llm_documents.owner_user_id must match workspace and collection owner'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_llm_collection_owner_consistency on public.llm_collections;
create trigger enforce_llm_collection_owner_consistency
before insert or update on public.llm_collections
for each row execute function public.enforce_llm_collection_owner_consistency();

drop trigger if exists enforce_llm_document_owner_consistency on public.llm_documents;
create trigger enforce_llm_document_owner_consistency
before insert or update on public.llm_documents
for each row execute function public.enforce_llm_document_owner_consistency();
