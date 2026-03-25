-- LinkedOut Bootstrap Schema (2026-03-25T02:44:31Z)
-- === 20260228123000_baseline_schema.sql ===
-- LinkedOut baseline schema for app-wide Supabase integration.
-- Apply in Supabase SQL editor or your migration pipeline.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id text primary key,
  name text,
  first_name text,
  last_name text,
  headline text,
  company text,
  location text,
  industry text,
  connections integer default 0,
  connections_count integer default 0,
  skills jsonb not null default '[]'::jsonb,
  match_score numeric default 75,
  seniority text,
  tribe text,
  tribe_name text,
  linkedin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tribes (
  id text primary key,
  name text not null,
  description text,
  status text default 'active',
  cohesion numeric default 8,
  complementarity numeric default 7.5,
  avg_experience numeric default 5,
  industry_focus text,
  members jsonb not null default '[]'::jsonb,
  common_skills jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  radar_data jsonb not null default '[]'::jsonb,
  skill_dist jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  name text not null,
  description text,
  type text default 'team-building',
  status text default 'active',
  progress integer default 0,
  profiles integer default 0,
  profile_count integer default 0,
  tribe text,
  target_date date,
  tags jsonb not null default '[]'::jsonb,
  milestones jsonb not null default '[]'::jsonb,
  next_action text,
  aspirations jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  priority text,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  message text,
  type text default 'event',
  created_at timestamptz not null default now()
);

create table if not exists public.csv_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  row_count integer default 0,
  preview text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.chat_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  event_type text not null,
  model_id text,
  persona_id text,
  message_count integer,
  has_csv_data boolean,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.friend_locations (
  id text primary key,
  name text not null,
  headline text,
  longitude double precision not null,
  latitude double precision not null,
  consent_given boolean not null default true,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_tribes_updated_at on public.tribes;
create trigger set_tribes_updated_at
before update on public.tribes
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_friend_locations_updated_at on public.friend_locations;
create trigger set_friend_locations_updated_at
before update on public.friend_locations
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.tribes enable row level security;
alter table public.projects enable row level security;
alter table public.activity_log enable row level security;
alter table public.csv_uploads enable row level security;
alter table public.friend_locations enable row level security;

do $$
begin
  drop policy if exists profiles_public_rw on public.profiles;
  drop policy if exists projects_public_rw on public.projects;
  drop policy if exists tribes_public_rw on public.tribes;
  drop policy if exists activity_log_public_rw on public.activity_log;
  drop policy if exists csv_uploads_public_insert on public.csv_uploads;
  drop policy if exists friend_locations_public_rw on public.friend_locations;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'tribes' and policyname = 'tribes_authenticated_read'
  ) then
    create policy tribes_authenticated_read
      on public.tribes
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_log' and policyname = 'activity_log_authenticated_read'
  ) then
    create policy activity_log_authenticated_read
      on public.activity_log
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'csv_uploads' and policyname = 'csv_uploads_authenticated_insert'
  ) then
    create policy csv_uploads_authenticated_insert
      on public.csv_uploads
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'csv_uploads' and policyname = 'csv_uploads_authenticated_read'
  ) then
    create policy csv_uploads_authenticated_read
      on public.csv_uploads
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'friend_locations' and policyname = 'friend_locations_authenticated_read'
  ) then
    create policy friend_locations_authenticated_read
      on public.friend_locations
      for select to authenticated
      using (true);
  end if;
end $$;

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);
create index if not exists tribes_updated_at_idx on public.tribes (updated_at desc);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);
create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists chat_events_created_at_idx on public.chat_events (created_at desc);
create index if not exists friend_locations_last_seen_idx on public.friend_locations (last_seen desc);

-- Secure LLM database tool tables (MCP-style, user-scoped, no raw SQL required)
create table if not exists public.llm_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, slug)
);

create table if not exists public.llm_collections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.llm_workspaces(id) on delete cascade,
  name text not null,
  schema_definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.llm_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.llm_workspaces(id) on delete cascade,
  collection_id uuid not null references public.llm_collections(id) on delete cascade,
  document_key text not null,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, document_key)
);

drop trigger if exists set_llm_workspaces_updated_at on public.llm_workspaces;
create trigger set_llm_workspaces_updated_at
before update on public.llm_workspaces
for each row execute function public.set_updated_at();

drop trigger if exists set_llm_collections_updated_at on public.llm_collections;
create trigger set_llm_collections_updated_at
before update on public.llm_collections
for each row execute function public.set_updated_at();

drop trigger if exists set_llm_documents_updated_at on public.llm_documents;
create trigger set_llm_documents_updated_at
before update on public.llm_documents
for each row execute function public.set_updated_at();

alter table public.llm_workspaces enable row level security;
alter table public.llm_collections enable row level security;
alter table public.llm_documents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'llm_workspaces' and policyname = 'llm_workspaces_owner_rw'
  ) then
    create policy llm_workspaces_owner_rw on public.llm_workspaces
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'llm_collections' and policyname = 'llm_collections_owner_rw'
  ) then
    create policy llm_collections_owner_rw on public.llm_collections
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.llm_workspaces w
          where w.id = workspace_id and w.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.llm_workspaces w
          where w.id = workspace_id and w.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'llm_documents' and policyname = 'llm_documents_owner_rw'
  ) then
    create policy llm_documents_owner_rw on public.llm_documents
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.llm_workspaces w
          where w.id = workspace_id and w.owner_user_id = auth.uid()
        )
        and exists (
          select 1 from public.llm_collections c
          where c.id = collection_id and c.workspace_id = workspace_id and c.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.llm_workspaces w
          where w.id = workspace_id and w.owner_user_id = auth.uid()
        )
        and exists (
          select 1 from public.llm_collections c
          where c.id = collection_id and c.workspace_id = workspace_id and c.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create index if not exists llm_workspaces_owner_updated_idx on public.llm_workspaces (owner_user_id, updated_at desc);
create index if not exists llm_collections_workspace_updated_idx on public.llm_collections (workspace_id, updated_at desc);
create index if not exists llm_documents_collection_updated_idx on public.llm_documents (collection_id, updated_at desc);

-- Project hiring and applicant ranking correlated to CRM users
alter table public.profiles add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.projects add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  drop policy if exists profiles_owner_rw on public.profiles;
  drop policy if exists projects_owner_rw on public.projects;

  create policy profiles_owner_rw
    on public.profiles
    for all to authenticated
    using (
      owner_user_id = auth.uid()
      or auth_user_id = auth.uid()
    )
    with check (
      owner_user_id = auth.uid()
      and (auth_user_id is null or auth_user_id = auth.uid())
    );

  create policy projects_owner_rw
    on public.projects
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());
end $$;

create table if not exists public.project_positions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  required_skills jsonb not null default '[]'::jsonb,
  seniority text,
  location text,
  openings integer not null default 1,
  status text not null default 'open',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_applications (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  position_id uuid not null references public.project_positions(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  applicant_profile_id text references public.profiles(id) on delete set null,
  cover_note text,
  status text not null default 'submitted',
  ai_score numeric not null default 0,
  ai_summary text,
  ranked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (position_id, applicant_user_id)
);

drop trigger if exists set_project_positions_updated_at on public.project_positions;
create trigger set_project_positions_updated_at
before update on public.project_positions
for each row execute function public.set_updated_at();

drop trigger if exists set_project_applications_updated_at on public.project_applications;
create trigger set_project_applications_updated_at
before update on public.project_applications
for each row execute function public.set_updated_at();

alter table public.project_positions enable row level security;
alter table public.project_applications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'project_positions' and policyname = 'project_positions_read_authenticated'
  ) then
    create policy project_positions_read_authenticated
      on public.project_positions
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'project_positions' and policyname = 'project_positions_write_owner'
  ) then
    create policy project_positions_write_owner
      on public.project_positions
      for all to authenticated
      using (
        exists (
          select 1 from public.projects p
          where p.id = project_id and p.owner_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.projects p
          where p.id = project_id and p.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'project_applications' and policyname = 'project_applications_insert_self'
  ) then
    create policy project_applications_insert_self
      on public.project_applications
      for insert to authenticated
      with check (applicant_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'project_applications' and policyname = 'project_applications_select_own_or_owner'
  ) then
    create policy project_applications_select_own_or_owner
      on public.project_applications
      for select to authenticated
      using (
        applicant_user_id = auth.uid()
        or exists (
          select 1 from public.projects p
          where p.id = project_id and p.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'project_applications' and policyname = 'project_applications_update_own_or_owner'
  ) then
    create policy project_applications_update_own_or_owner
      on public.project_applications
      for update to authenticated
      using (
        applicant_user_id = auth.uid()
        or exists (
          select 1 from public.projects p
          where p.id = project_id and p.owner_user_id = auth.uid()
        )
      )
      with check (
        applicant_user_id = auth.uid()
        or exists (
          select 1 from public.projects p
          where p.id = project_id and p.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create index if not exists profiles_owner_user_idx on public.profiles (owner_user_id);
create unique index if not exists profiles_auth_user_uidx on public.profiles (auth_user_id) where auth_user_id is not null;
create index if not exists projects_owner_user_idx on public.projects (owner_user_id);
create index if not exists project_positions_project_status_idx on public.project_positions (project_id, status);
create index if not exists project_applications_project_position_idx on public.project_applications (project_id, position_id);
create index if not exists project_applications_applicant_idx on public.project_applications (applicant_user_id);

-- Secure email integrations (encrypted credentials, owner-scoped data, sync runs)
create table if not exists public.email_integrations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  provider text not null,
  status text not null default 'pending',
  sync_enabled boolean not null default false,
  sync_error text,
  sync_error_count integer not null default 0,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  last_failed_sync_attempt timestamptz,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, email, provider),
  check (provider in ('gmail', 'outlook', 'imap', 'other')),
  check (status in ('connected', 'disconnected', 'syncing', 'error', 'pending'))
);

create table if not exists public.email_integration_secrets (
  integration_id uuid primary key references public.email_integrations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_credentials text not null,
  key_version text not null default 'v1',
  last_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.email_integrations(id) on delete cascade,
  external_id text,
  name text not null,
  kind text not null default 'folder',
  mailbox_type text not null default 'user',
  color text,
  message_count integer,
  unread_count integer,
  parent_id uuid references public.email_mailboxes(id) on delete set null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, name),
  check (kind in ('label', 'folder')),
  check (mailbox_type in ('system', 'user', 'custom'))
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.email_integrations(id) on delete cascade,
  mailbox_ids uuid[] not null default '{}'::uuid[],
  thread_id text,
  message_id text,
  in_reply_to text,
  reference_ids text[] not null default '{}'::text[],
  subject text not null default '',
  from_address jsonb not null default '{}'::jsonb,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  bcc_addresses jsonb not null default '[]'::jsonb,
  reply_to_address jsonb,
  body text not null default '',
  html_body text,
  snippet text,
  received_at timestamptz not null default now(),
  sent_at timestamptz,
  is_read boolean not null default false,
  is_starred boolean not null default false,
  is_archived boolean not null default false,
  is_draft boolean not null default false,
  is_spam boolean not null default false,
  is_trash boolean not null default false,
  priority text,
  headers jsonb not null default '{}'::jsonb,
  raw_size integer,
  provider_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (priority is null or priority in ('high', 'normal', 'low'))
);

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.email_integrations(id) on delete cascade,
  message_row_id uuid not null references public.email_messages(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size bigint not null default 0,
  content_id text,
  is_inline boolean not null default false,
  content_disposition text,
  url text,
  thumbnail_url text,
  checksum text,
  storage_location text,
  virus_scan_status text,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (content_disposition is null or content_disposition in ('inline', 'attachment')),
  check (storage_location is null or storage_location in ('local', 's3', 'external')),
  check (virus_scan_status is null or virus_scan_status in ('clean', 'infected', 'pending', 'failed'))
);

create table if not exists public.email_sync_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.email_integrations(id) on delete cascade,
  provider text not null,
  status text not null default 'syncing',
  total_items integer not null default 0,
  processed_items integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  current_page_token text,
  next_page_token text,
  sync_token text,
  last_history_id text,
  is_partial_sync boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('gmail', 'outlook', 'imap', 'other')),
  check (status in ('idle', 'syncing', 'completed', 'failed'))
);

drop trigger if exists set_email_integrations_updated_at on public.email_integrations;
create trigger set_email_integrations_updated_at
before update on public.email_integrations
for each row execute function public.set_updated_at();

drop trigger if exists set_email_integration_secrets_updated_at on public.email_integration_secrets;
create trigger set_email_integration_secrets_updated_at
before update on public.email_integration_secrets
for each row execute function public.set_updated_at();

drop trigger if exists set_email_mailboxes_updated_at on public.email_mailboxes;
create trigger set_email_mailboxes_updated_at
before update on public.email_mailboxes
for each row execute function public.set_updated_at();

drop trigger if exists set_email_messages_updated_at on public.email_messages;
create trigger set_email_messages_updated_at
before update on public.email_messages
for each row execute function public.set_updated_at();

drop trigger if exists set_email_attachments_updated_at on public.email_attachments;
create trigger set_email_attachments_updated_at
before update on public.email_attachments
for each row execute function public.set_updated_at();

drop trigger if exists set_email_sync_runs_updated_at on public.email_sync_runs;
create trigger set_email_sync_runs_updated_at
before update on public.email_sync_runs
for each row execute function public.set_updated_at();

alter table public.email_integrations enable row level security;
alter table public.email_integration_secrets enable row level security;
alter table public.email_mailboxes enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_attachments enable row level security;
alter table public.email_sync_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'email_integrations' and policyname = 'email_integrations_owner_rw'
  ) then
    create policy email_integrations_owner_rw
      on public.email_integrations
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'email_mailboxes' and policyname = 'email_mailboxes_owner_rw'
  ) then
    create policy email_mailboxes_owner_rw
      on public.email_mailboxes
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'email_messages' and policyname = 'email_messages_owner_rw'
  ) then
    create policy email_messages_owner_rw
      on public.email_messages
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'email_attachments' and policyname = 'email_attachments_owner_rw'
  ) then
    create policy email_attachments_owner_rw
      on public.email_attachments
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'email_sync_runs' and policyname = 'email_sync_runs_owner_rw'
  ) then
    create policy email_sync_runs_owner_rw
      on public.email_sync_runs
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
end $$;

-- Secrets are never directly readable/writable from anon/authenticated clients.
revoke all on table public.email_integration_secrets from anon;
revoke all on table public.email_integration_secrets from authenticated;

create unique index if not exists email_messages_owner_integration_message_uidx
  on public.email_messages (owner_user_id, integration_id, message_id)
  where message_id is not null;
create index if not exists email_integrations_owner_updated_idx on public.email_integrations (owner_user_id, updated_at desc);
create index if not exists email_messages_owner_received_idx on public.email_messages (owner_user_id, received_at desc);
create index if not exists email_messages_owner_draft_idx on public.email_messages (owner_user_id, is_draft, updated_at desc);
create index if not exists email_messages_integration_idx on public.email_messages (integration_id, updated_at desc);
create index if not exists email_mailboxes_integration_idx on public.email_mailboxes (integration_id, updated_at desc);
create index if not exists email_sync_runs_integration_started_idx on public.email_sync_runs (integration_id, started_at desc);

-- Agent control plane (no-code builder, scoped connectors, versioning, economics)
create table if not exists public.agent_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  purpose text not null default '',
  soul_file text not null default '',
  skills jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  preferred_model_id text not null default 'gpt-4.1-mini',
  fallback_model_ids jsonb not null default '[]'::jsonb,
  connector_ids jsonb not null default '[]'::jsonb,
  recursive_improvement_enabled boolean not null default true,
  token_budget_usd_monthly numeric not null default 500,
  weekly_efficiency_gain_pct numeric not null default 10,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'active', 'paused', 'archived'))
);

create table if not exists public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agent_definitions(id) on delete cascade,
  version_number integer not null,
  change_note text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (agent_id, version_number)
);

create table if not exists public.agent_tool_connectors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected',
  permission_mode text not null default 'read_only',
  scopes jsonb not null default '[]'::jsonb,
  approval_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, provider),
  check (status in ('connected', 'degraded', 'not_connected')),
  check (permission_mode in ('read_only', 'write_with_approval', 'scheduled_only', 'disabled'))
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agent_definitions(id) on delete cascade,
  template_id text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  token_input integer not null default 0,
  token_output integer not null default 0,
  estimated_cost_usd numeric not null default 0,
  efficiency_gain_pct numeric not null default 0,
  summary text not null default '',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('running', 'completed', 'failed', 'paused'))
);

drop trigger if exists set_agent_definitions_updated_at on public.agent_definitions;
create trigger set_agent_definitions_updated_at
before update on public.agent_definitions
for each row execute function public.set_updated_at();

drop trigger if exists set_agent_tool_connectors_updated_at on public.agent_tool_connectors;
create trigger set_agent_tool_connectors_updated_at
before update on public.agent_tool_connectors
for each row execute function public.set_updated_at();

drop trigger if exists set_agent_runs_updated_at on public.agent_runs;
create trigger set_agent_runs_updated_at
before update on public.agent_runs
for each row execute function public.set_updated_at();

alter table public.agent_definitions enable row level security;
alter table public.agent_versions enable row level security;
alter table public.agent_tool_connectors enable row level security;
alter table public.agent_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_definitions' and policyname = 'agent_definitions_owner_rw'
  ) then
    create policy agent_definitions_owner_rw
      on public.agent_definitions
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_versions' and policyname = 'agent_versions_owner_rw'
  ) then
    create policy agent_versions_owner_rw
      on public.agent_versions
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_tool_connectors' and policyname = 'agent_tool_connectors_owner_rw'
  ) then
    create policy agent_tool_connectors_owner_rw
      on public.agent_tool_connectors
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_runs' and policyname = 'agent_runs_owner_rw'
  ) then
    create policy agent_runs_owner_rw
      on public.agent_runs
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create index if not exists agent_definitions_owner_updated_idx on public.agent_definitions (owner_user_id, updated_at desc);
create index if not exists agent_versions_agent_created_idx on public.agent_versions (agent_id, created_at desc);
create index if not exists agent_tool_connectors_owner_updated_idx on public.agent_tool_connectors (owner_user_id, updated_at desc);
create index if not exists agent_runs_agent_started_idx on public.agent_runs (agent_id, started_at desc);

-- Recursive self-improvement and shadow-tool tracking
create table if not exists public.agent_skill_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agent_definitions(id) on delete cascade,
  source text not null,
  skill text not null,
  note text,
  test_status text not null default 'pending',
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  check (test_status in ('passed', 'failed', 'pending'))
);

create table if not exists public.agent_shadow_tools (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'draft',
  mapped_agent_id uuid references public.agent_definitions(id) on delete set null,
  coverage_pct numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'active', 'paused', 'retired')),
  check (coverage_pct >= 0 and coverage_pct <= 100)
);

drop trigger if exists set_agent_shadow_tools_updated_at on public.agent_shadow_tools;
create trigger set_agent_shadow_tools_updated_at
before update on public.agent_shadow_tools
for each row execute function public.set_updated_at();

alter table public.agent_skill_events enable row level security;
alter table public.agent_shadow_tools enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_skill_events' and policyname = 'agent_skill_events_owner_rw'
  ) then
    create policy agent_skill_events_owner_rw
      on public.agent_skill_events
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_shadow_tools' and policyname = 'agent_shadow_tools_owner_rw'
  ) then
    create policy agent_shadow_tools_owner_rw
      on public.agent_shadow_tools
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and (
          mapped_agent_id is null
          or exists (
            select 1 from public.agent_definitions d
            where d.id = mapped_agent_id and d.owner_user_id = auth.uid()
          )
        )
      )
      with check (
        owner_user_id = auth.uid()
        and (
          mapped_agent_id is null
          or exists (
            select 1 from public.agent_definitions d
            where d.id = mapped_agent_id and d.owner_user_id = auth.uid()
          )
        )
      );
  end if;
end $$;

create index if not exists agent_skill_events_agent_created_idx on public.agent_skill_events (agent_id, created_at desc);
create index if not exists agent_shadow_tools_owner_updated_idx on public.agent_shadow_tools (owner_user_id, updated_at desc);

-- Scheduled runs and evaluation harness
create table if not exists public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agent_definitions(id) on delete cascade,
  kind text not null default 'workflow_run',
  frequency text not null default 'daily',
  interval_minutes integer not null default 1440,
  enabled boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_status text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, agent_id, kind),
  check (kind in ('workflow_run', 'self_improvement', 'evaluation')),
  check (frequency in ('hourly', 'daily', 'weekly', 'custom')),
  check (interval_minutes >= 15 and interval_minutes <= 43200),
  check (last_status is null or last_status in ('running', 'completed', 'failed', 'skipped'))
);

create table if not exists public.agent_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agent_definitions(id) on delete cascade,
  benchmark_name text not null,
  score_pct numeric not null default 0,
  threshold_pct numeric not null default 85,
  status text not null default 'pending',
  summary text not null default '',
  created_at timestamptz not null default now(),
  check (score_pct >= 0 and score_pct <= 100),
  check (threshold_pct >= 0 and threshold_pct <= 100),
  check (status in ('passed', 'failed', 'pending'))
);

alter table public.agent_schedules
  drop constraint if exists agent_schedules_last_status_check;
alter table public.agent_schedules
  add constraint agent_schedules_last_status_check
  check (last_status is null or last_status in ('running', 'completed', 'failed', 'skipped'));

drop trigger if exists set_agent_schedules_updated_at on public.agent_schedules;
create trigger set_agent_schedules_updated_at
before update on public.agent_schedules
for each row execute function public.set_updated_at();

alter table public.agent_schedules enable row level security;
alter table public.agent_evaluations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_schedules' and policyname = 'agent_schedules_owner_rw'
  ) then
    create policy agent_schedules_owner_rw
      on public.agent_schedules
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_evaluations' and policyname = 'agent_evaluations_owner_rw'
  ) then
    create policy agent_evaluations_owner_rw
      on public.agent_evaluations
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create index if not exists agent_schedules_owner_next_run_idx on public.agent_schedules (owner_user_id, next_run_at asc);
create index if not exists agent_schedules_agent_updated_idx on public.agent_schedules (agent_id, updated_at desc);
create index if not exists agent_evaluations_agent_created_idx on public.agent_evaluations (agent_id, created_at desc);

-- Human approval queue for risky agent actions
create table if not exists public.agent_approval_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references public.agent_definitions(id) on delete cascade,
  connector_id uuid references public.agent_tool_connectors(id) on delete set null,
  action_type text not null,
  payload_summary text not null default '',
  risk_level text not null default 'medium',
  status text not null default 'pending',
  requested_by_user_id uuid references auth.users(id) on delete set null,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolver_note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (risk_level in ('low', 'medium', 'high')),
  check (status in ('pending', 'approved', 'rejected'))
);

drop trigger if exists set_agent_approval_requests_updated_at on public.agent_approval_requests;
create trigger set_agent_approval_requests_updated_at
before update on public.agent_approval_requests
for each row execute function public.set_updated_at();

alter table public.agent_approval_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_approval_requests' and policyname = 'agent_approval_requests_owner_rw'
  ) then
    create policy agent_approval_requests_owner_rw
      on public.agent_approval_requests
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
        and (
          connector_id is null
          or exists (
            select 1 from public.agent_tool_connectors c
            where c.id = connector_id and c.owner_user_id = auth.uid()
          )
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.agent_definitions d
          where d.id = agent_id and d.owner_user_id = auth.uid()
        )
        and (
          connector_id is null
          or exists (
            select 1 from public.agent_tool_connectors c
            where c.id = connector_id and c.owner_user_id = auth.uid()
          )
        )
      );
  end if;
end $$;

create index if not exists agent_approval_requests_owner_status_idx on public.agent_approval_requests (owner_user_id, status, requested_at desc);
create index if not exists agent_approval_requests_agent_requested_idx on public.agent_approval_requests (agent_id, requested_at desc);

-- Drone delivery governance and accreditation (ADGAP)
create table if not exists public.drone_fleets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  operator_name text,
  certificate_number text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('active', 'paused', 'retired'))
);

create table if not exists public.drone_units (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.drone_fleets(id) on delete cascade,
  external_id text,
  name text not null,
  vendor text,
  model text,
  aircraft_type text not null default 'multirotor',
  status text not null default 'ready',
  battery_pct numeric not null default 100,
  current_longitude double precision,
  current_latitude double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (aircraft_type in ('multirotor', 'fixed_wing', 'hybrid')),
  check (status in ('ready', 'in_flight', 'charging', 'maintenance', 'offline')),
  check (battery_pct >= 0 and battery_pct <= 100)
);

create table if not exists public.drone_docks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.drone_fleets(id) on delete cascade,
  name text not null,
  status text not null default 'ready',
  longitude double precision,
  latitude double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('ready', 'loading', 'charging', 'offline', 'maintenance'))
);

create table if not exists public.drone_missions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid not null references public.drone_fleets(id) on delete cascade,
  drone_unit_id uuid references public.drone_units(id) on delete set null,
  dock_id uuid references public.drone_docks(id) on delete set null,
  external_order_id text,
  mission_type text not null default 'delivery',
  status text not null default 'draft',
  risk_level text not null default 'medium',
  planned_route jsonb not null default '{}'::jsonb,
  package_manifest jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mission_type in ('delivery', 'restock', 'inspection', 'emergency', 'other')),
  check (status in ('draft', 'planned', 'pending_signoff', 'dispatched', 'in_flight', 'delivered', 'failed', 'aborted', 'returned')),
  check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create table if not exists public.drone_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.drone_missions(id) on delete cascade,
  risk_score numeric not null default 0,
  confidence numeric not null default 0.5,
  tail_risk numeric not null default 0,
  policy_result text not null default 'allow',
  factors jsonb not null default '[]'::jsonb,
  requires_signoff boolean not null default false,
  assessed_by text,
  created_at timestamptz not null default now(),
  check (risk_score >= 0 and risk_score <= 1),
  check (confidence >= 0 and confidence <= 1),
  check (tail_risk >= 0 and tail_risk <= 1),
  check (policy_result in ('allow', 'warn', 'hold', 'block'))
);

create table if not exists public.drone_signoff_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.drone_missions(id) on delete cascade,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  risk_level text not null default 'medium',
  reason text not null default '',
  resolver_note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'approved', 'rejected', 'expired')),
  check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create table if not exists public.drone_provenance_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid not null references public.drone_missions(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id text,
  payload jsonb not null default '{}'::jsonb,
  integrity_hash text not null,
  previous_hash text,
  manifest_ref text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (actor_type in ('human', 'agent', 'drone', 'system'))
);

drop trigger if exists set_drone_fleets_updated_at on public.drone_fleets;
create trigger set_drone_fleets_updated_at
before update on public.drone_fleets
for each row execute function public.set_updated_at();

drop trigger if exists set_drone_units_updated_at on public.drone_units;
create trigger set_drone_units_updated_at
before update on public.drone_units
for each row execute function public.set_updated_at();

drop trigger if exists set_drone_docks_updated_at on public.drone_docks;
create trigger set_drone_docks_updated_at
before update on public.drone_docks
for each row execute function public.set_updated_at();

drop trigger if exists set_drone_missions_updated_at on public.drone_missions;
create trigger set_drone_missions_updated_at
before update on public.drone_missions
for each row execute function public.set_updated_at();

drop trigger if exists set_drone_signoff_requests_updated_at on public.drone_signoff_requests;
create trigger set_drone_signoff_requests_updated_at
before update on public.drone_signoff_requests
for each row execute function public.set_updated_at();

alter table public.drone_fleets enable row level security;
alter table public.drone_units enable row level security;
alter table public.drone_docks enable row level security;
alter table public.drone_missions enable row level security;
alter table public.drone_risk_assessments enable row level security;
alter table public.drone_signoff_requests enable row level security;
alter table public.drone_provenance_records enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drone_fleets' and policyname = 'drone_fleets_owner_rw'
  ) then
    create policy drone_fleets_owner_rw
      on public.drone_fleets
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drone_units' and policyname = 'drone_units_owner_rw'
  ) then
    create policy drone_units_owner_rw
      on public.drone_units
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_fleets f
          where f.id = fleet_id and f.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_fleets f
          where f.id = fleet_id and f.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drone_docks' and policyname = 'drone_docks_owner_rw'
  ) then
    create policy drone_docks_owner_rw
      on public.drone_docks
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_fleets f
          where f.id = fleet_id and f.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_fleets f
          where f.id = fleet_id and f.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drone_missions' and policyname = 'drone_missions_owner_rw'
  ) then
    create policy drone_missions_owner_rw
      on public.drone_missions
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_fleets f
          where f.id = fleet_id and f.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_fleets f
          where f.id = fleet_id and f.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drone_risk_assessments' and policyname = 'drone_risk_assessments_owner_rw'
  ) then
    create policy drone_risk_assessments_owner_rw
      on public.drone_risk_assessments
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_missions m
          where m.id = mission_id and m.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_missions m
          where m.id = mission_id and m.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drone_signoff_requests' and policyname = 'drone_signoff_requests_owner_rw'
  ) then
    create policy drone_signoff_requests_owner_rw
      on public.drone_signoff_requests
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_missions m
          where m.id = mission_id and m.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_missions m
          where m.id = mission_id and m.owner_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'drone_provenance_records' and policyname = 'drone_provenance_records_owner_rw'
  ) then
    create policy drone_provenance_records_owner_rw
      on public.drone_provenance_records
      for all to authenticated
      using (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_missions m
          where m.id = mission_id and m.owner_user_id = auth.uid()
        )
      )
      with check (
        owner_user_id = auth.uid()
        and exists (
          select 1 from public.drone_missions m
          where m.id = mission_id and m.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create index if not exists drone_fleets_owner_updated_idx on public.drone_fleets (owner_user_id, updated_at desc);
create index if not exists drone_units_owner_status_idx on public.drone_units (owner_user_id, status, updated_at desc);
create index if not exists drone_docks_owner_status_idx on public.drone_docks (owner_user_id, status, updated_at desc);
create index if not exists drone_missions_owner_status_idx on public.drone_missions (owner_user_id, status, updated_at desc);
create index if not exists drone_missions_owner_created_idx on public.drone_missions (owner_user_id, created_at desc);
create index if not exists drone_risk_assessments_mission_created_idx on public.drone_risk_assessments (mission_id, created_at desc);
create index if not exists drone_signoff_requests_owner_status_idx on public.drone_signoff_requests (owner_user_id, status, requested_at desc);
create index if not exists drone_provenance_mission_recorded_idx on public.drone_provenance_records (mission_id, recorded_at desc);

-- MCP tool execution audit trail
create table if not exists public.mcp_tool_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  session_id text,
  client_address text,
  transport text not null default 'mcp',
  tool_name text not null,
  status text not null default 'allowed',
  blocked_reason text,
  arg_hash text,
  arg_size_bytes integer,
  arg_preview text,
  error_message text,
  auth_issuer text,
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (transport in ('mcp', 'realtime-tools')),
  check (status in ('allowed', 'blocked', 'failed'))
);

alter table public.mcp_tool_audit_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'mcp_tool_audit_events' and policyname = 'mcp_tool_audit_events_owner_read'
  ) then
    create policy mcp_tool_audit_events_owner_read
      on public.mcp_tool_audit_events
      for select to authenticated
      using (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists mcp_tool_audit_owner_created_idx on public.mcp_tool_audit_events (owner_user_id, created_at desc);
create index if not exists mcp_tool_audit_transport_created_idx on public.mcp_tool_audit_events (transport, created_at desc);
create index if not exists mcp_tool_audit_tool_created_idx on public.mcp_tool_audit_events (tool_name, created_at desc);

-- SENTINEL security control-plane extensions
alter table public.mcp_tool_audit_events
  add column if not exists risk_score smallint,
  add column if not exists risk_level text,
  add column if not exists manifest_id text,
  add column if not exists manifest_hash text,
  add column if not exists parent_hash text,
  add column if not exists injection_matches text[] not null default '{}'::text[],
  add column if not exists credential_access_detected boolean not null default false,
  add column if not exists vetoed boolean not null default false;

alter table public.mcp_tool_audit_events
  drop constraint if exists mcp_tool_audit_events_transport_check;
alter table public.mcp_tool_audit_events
  add constraint mcp_tool_audit_events_transport_check
  check (transport in ('mcp', 'realtime-tools', 'chat'));

alter table public.mcp_tool_audit_events
  drop constraint if exists mcp_tool_audit_events_status_check;
alter table public.mcp_tool_audit_events
  add constraint mcp_tool_audit_events_status_check
  check (status in ('allowed', 'blocked', 'failed', 'vetoed'));

create index if not exists mcp_tool_audit_risk_created_idx on public.mcp_tool_audit_events (risk_score, created_at desc);
create index if not exists mcp_tool_audit_veto_created_idx on public.mcp_tool_audit_events (vetoed, created_at desc);
create index if not exists mcp_tool_audit_session_created_idx on public.mcp_tool_audit_events (session_id, created_at desc);

create table if not exists public.sentinel_veto_approvals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  session_id text,
  transport text not null default 'realtime-tools',
  tool_name text not null,
  actor_id text,
  risk_score smallint not null default 0,
  risk_level text not null default 'medium',
  arg_preview text,
  manifest_id text,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolver_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (transport in ('mcp', 'realtime-tools', 'chat')),
  check (status in ('pending', 'approved', 'rejected', 'expired'))
);

drop trigger if exists set_sentinel_veto_approvals_updated_at on public.sentinel_veto_approvals;
create trigger set_sentinel_veto_approvals_updated_at
before update on public.sentinel_veto_approvals
for each row execute function public.set_updated_at();

alter table public.sentinel_veto_approvals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sentinel_veto_approvals' and policyname = 'sentinel_veto_approvals_owner_rw'
  ) then
    create policy sentinel_veto_approvals_owner_rw
      on public.sentinel_veto_approvals
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists sentinel_veto_approvals_status_requested_idx on public.sentinel_veto_approvals (status, requested_at desc);
create index if not exists sentinel_veto_approvals_owner_status_idx on public.sentinel_veto_approvals (owner_user_id, status);

create table if not exists public.sentinel_threat_dismissals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  threat_id text not null,
  dismissed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, threat_id)
);

drop trigger if exists set_sentinel_threat_dismissals_updated_at on public.sentinel_threat_dismissals;
create trigger set_sentinel_threat_dismissals_updated_at
before update on public.sentinel_threat_dismissals
for each row execute function public.set_updated_at();

alter table public.sentinel_threat_dismissals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sentinel_threat_dismissals' and policyname = 'sentinel_threat_dismissals_owner_rw'
  ) then
    create policy sentinel_threat_dismissals_owner_rw
      on public.sentinel_threat_dismissals
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists sentinel_threat_dismissals_owner_idx on public.sentinel_threat_dismissals (owner_user_id, dismissed_at desc);
create index if not exists sentinel_threat_dismissals_owner_threat_idx on public.sentinel_threat_dismissals (owner_user_id, threat_id);

-- === 20260302000000_linkedout.sql ===
-- linkedout_objectives: persisted custom scoring objectives per user
CREATE TABLE IF NOT EXISTS linkedout_objectives (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  label       text        NOT NULL,
  keywords    text[]      NOT NULL DEFAULT '{}',
  industries  text[]      NOT NULL DEFAULT '{}',
  skills      text[]      NOT NULL DEFAULT '{}',
  note_prefix text        NOT NULL DEFAULT '',
  is_active   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedout_objectives_user_id_idx
  ON linkedout_objectives(user_id);

-- linkedout_contact_states: persisted queue status per contact per objective
CREATE TABLE IF NOT EXISTS linkedout_contact_states (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text        NOT NULL,
  profile_id            text        NOT NULL,
  objective_id          text        NOT NULL,
  queue_status          text        NOT NULL CHECK (queue_status IN ('intro', 'nurture', 'curate', 'archived', 'whitelisted')),
  score                 integer,
  intent_fit            integer,
  relationship_strength integer,
  freshness             integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, profile_id, objective_id)
);

CREATE INDEX IF NOT EXISTS linkedout_contact_states_user_objective_idx
  ON linkedout_contact_states(user_id, objective_id);

-- linkedout_outreach_events: audit log for notes copied, profiles opened, intros generated
CREATE TABLE IF NOT EXISTS linkedout_outreach_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,
  profile_id   text        NOT NULL,
  event_type   text        NOT NULL CHECK (event_type IN ('note_copied', 'profile_opened', 'intro_generated', 'cull_exported')),
  objective_id text,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedout_outreach_events_user_id_idx
  ON linkedout_outreach_events(user_id);
CREATE INDEX IF NOT EXISTS linkedout_outreach_events_profile_id_idx
  ON linkedout_outreach_events(user_id, profile_id);

-- linkedout_curation_actions: batch cull/whitelist/archive audit trail
CREATE TABLE IF NOT EXISTS linkedout_curation_actions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  profile_ids text[]      NOT NULL,
  action      text        NOT NULL CHECK (action IN ('cull', 'whitelist', 'archive', 'restore')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedout_curation_actions_user_id_idx
  ON linkedout_curation_actions(user_id);

-- Row Level Security
ALTER TABLE linkedout_objectives       ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedout_contact_states   ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedout_outreach_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedout_curation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own objectives"
  ON linkedout_objectives FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Users manage own contact states"
  ON linkedout_contact_states FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Users manage own outreach events"
  ON linkedout_outreach_events FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Users manage own curation actions"
  ON linkedout_curation_actions FOR ALL USING (auth.uid()::text = user_id);

-- === 20260302100000_linkedin_consumer.sql ===
-- LinkedIn Consumer Solutions (Sign In + Share) identity and audit tables.
-- See lib/linkedin-identity-server.ts and app/api/linkedin/share/route.ts.
--
-- This migration sets up the core LinkedIn OAuth integration tables with:
--   - linkedin_identities: stores OAuth tokens and profile data per user
--   - linkedin_share_audit: immutable audit log for content sharing
--   - linkedin_oauth_states: CSRF protection for OAuth flow
--   - linkedin_rate_limits: per-user rate limiting for API calls
--   - linkedin_connection_events: tracks connection lifecycle events
--   - linkedin_token_refresh_log: audit trail for token refresh operations

-- linkedin_identities: one row per user, populated after OAuth callback when user is signed in.
CREATE TABLE IF NOT EXISTS linkedin_identities (
  user_id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject     text        NOT NULL UNIQUE,
  display_name         text,
  picture_url          text,
  email                text,
  email_verified       boolean     DEFAULT false,
  locale               text,
  vanity_name          text,
  headline             text,
  industry             text,
  location_name        text,
  profile_url          text,
  access_token         text        NOT NULL,
  refresh_token        text,
  token_type           text        DEFAULT 'Bearer',
  expires_at           timestamptz NOT NULL,
  refresh_expires_at   timestamptz,
  scopes               text[],
  granted_scopes       text[],
  last_introspect_at   timestamptz,
  introspect_active    boolean,
  last_token_refresh   timestamptz,
  token_refresh_count  int         DEFAULT 0,
  consecutive_refresh_failures int DEFAULT 0,
  connection_status    text        DEFAULT 'active' CHECK (connection_status IN ('active', 'expired', 'revoked', 'error', 'pending_reauth')),
  last_error           text,
  last_error_at        timestamptz,
  last_error_code      text,
  last_successful_api_call timestamptz,
  total_api_calls      bigint      DEFAULT 0,
  total_shares         bigint      DEFAULT 0,
  metadata             jsonb       DEFAULT '{}'::jsonb,
  feature_flags        jsonb       DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS linkedin_identities_linkedin_subject_idx 
  ON linkedin_identities(linkedin_subject);
CREATE INDEX IF NOT EXISTS linkedin_identities_expires_at_idx 
  ON linkedin_identities(expires_at) WHERE connection_status = 'active';
CREATE INDEX IF NOT EXISTS linkedin_identities_connection_status_idx 
  ON linkedin_identities(connection_status);
CREATE INDEX IF NOT EXISTS linkedin_identities_refresh_expires_at_idx 
  ON linkedin_identities(refresh_expires_at) WHERE refresh_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_identities_email_idx 
  ON linkedin_identities(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_identities_pending_reauth_idx 
  ON linkedin_identities(user_id) WHERE connection_status = 'pending_reauth';

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_linkedin_identities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS linkedin_identities_updated_at_trigger ON linkedin_identities;
CREATE TRIGGER linkedin_identities_updated_at_trigger
  BEFORE UPDATE ON linkedin_identities
  FOR EACH ROW
  EXECUTE FUNCTION update_linkedin_identities_updated_at();

-- RLS: service role used in callback; anon can read own row via GET /api/linkedin/identity (server uses service role for read).
ALTER TABLE linkedin_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own LinkedIn identity"
  ON linkedin_identities FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages LinkedIn identities"
  ON linkedin_identities FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_oauth_states: CSRF protection for OAuth flow
CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
  state                text        PRIMARY KEY,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri         text        NOT NULL,
  scopes_requested     text[],
  code_verifier        text,
  nonce                text,
  ip_address           inet,
  user_agent           text,
  origin_page          text,
  flow_type            text        DEFAULT 'signin' CHECK (flow_type IN ('signin', 'reauth', 'scope_upgrade', 'link_account')),
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at          timestamptz,
  error_code           text,
  error_description    text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_oauth_states_expires_at_idx 
  ON linkedin_oauth_states(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS linkedin_oauth_states_user_id_idx 
  ON linkedin_oauth_states(user_id);
CREATE INDEX IF NOT EXISTS linkedin_oauth_states_created_at_idx 
  ON linkedin_oauth_states(created_at DESC);

ALTER TABLE linkedin_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages OAuth states"
  ON linkedin_oauth_states FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_share_audit: immutable log of share requests and responses.
CREATE TABLE IF NOT EXISTS linkedin_share_audit (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject       text        NOT NULL,
  share_type             text        NOT NULL DEFAULT 'text' CHECK (share_type IN ('text', 'article', 'image', 'video', 'document', 'carousel')),
  visibility             text        DEFAULT 'connections' CHECK (visibility IN ('public', 'connections', 'logged_in')),
  request_text           text        NOT NULL,
  request_media_url      text,
  request_media_urls     text[],
  request_link_url       text,
  request_title          text,
  request_description    text,
  request_hash           text,
  request_size_bytes     int,
  response_status        int         NOT NULL,
  response_ugc_post_id   text,
  response_share_id      text,
  response_activity_urn  text,
  response_error_code    text,
  response_error_message text,
  response_rate_limit_remaining int,
  response_rate_limit_reset timestamptz,
  latency_ms             int,
  client_ip              inet,
  user_agent             text,
  idempotency_key        text        UNIQUE,
  retry_count            int         DEFAULT 0,
  parent_share_id        uuid        REFERENCES linkedin_share_audit(id),
  is_reshare             boolean     DEFAULT false,
  scheduled_at           timestamptz,
  published_at           timestamptz,
  metadata               jsonb       DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_share_audit_user_id_idx 
  ON linkedin_share_audit(user_id);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_created_at_idx 
  ON linkedin_share_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_linkedin_subject_idx 
  ON linkedin_share_audit(linkedin_subject);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_response_status_idx 
  ON linkedin_share_audit(response_status) WHERE response_status >= 400;
CREATE INDEX IF NOT EXISTS linkedin_share_audit_idempotency_key_idx 
  ON linkedin_share_audit(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_share_audit_user_created_idx 
  ON linkedin_share_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_ugc_post_id_idx 
  ON linkedin_share_audit(response_ugc_post_id) WHERE response_ugc_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_share_audit_scheduled_idx 
  ON linkedin_share_audit(scheduled_at) WHERE scheduled_at IS NOT NULL AND published_at IS NULL;

ALTER TABLE linkedin_share_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own share audit"
  ON linkedin_share_audit FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts share audit"
  ON linkedin_share_audit FOR INSERT WITH CHECK (
    current_setting('role', true) = 'service_role'
  );

CREATE POLICY "Service role updates share audit"
  ON linkedin_share_audit FOR UPDATE USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_rate_limits: per-user rate limiting for LinkedIn API calls
CREATE TABLE IF NOT EXISTS linkedin_rate_limits (
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint_category    text        NOT NULL CHECK (endpoint_category IN ('share', 'profile', 'connections', 'messages', 'search', 'media_upload', 'analytics')),
  window_start         timestamptz NOT NULL,
  request_count        int         NOT NULL DEFAULT 1,
  last_request_at      timestamptz NOT NULL DEFAULT now(),
  rate_limit_hit       boolean     DEFAULT false,
  rate_limit_reset_at  timestamptz,
  PRIMARY KEY (user_id, endpoint_category, window_start)
);

CREATE INDEX IF NOT EXISTS linkedin_rate_limits_window_start_idx 
  ON linkedin_rate_limits(window_start);
CREATE INDEX IF NOT EXISTS linkedin_rate_limits_user_category_idx 
  ON linkedin_rate_limits(user_id, endpoint_category);
CREATE INDEX IF NOT EXISTS linkedin_rate_limits_hit_idx 
  ON linkedin_rate_limits(user_id) WHERE rate_limit_hit = true;

ALTER TABLE linkedin_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits"
  ON linkedin_rate_limits FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_connection_events: tracks connection lifecycle events
CREATE TABLE IF NOT EXISTS linkedin_connection_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject     text        NOT NULL,
  event_type           text        NOT NULL CHECK (event_type IN (
    'connected', 'disconnected', 'token_refreshed', 'token_expired', 
    'token_revoked', 'scope_upgraded', 'reauth_required', 'reauth_completed',
    'error_occurred', 'rate_limited'
  )),
  previous_status      text,
  new_status           text,
  scopes_before        text[],
  scopes_after         text[],
  error_code           text,
  error_message        text,
  ip_address           inet,
  user_agent           text,
  metadata             jsonb       DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_connection_events_user_id_idx 
  ON linkedin_connection_events(user_id);
CREATE INDEX IF NOT EXISTS linkedin_connection_events_created_at_idx 
  ON linkedin_connection_events(created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_connection_events_event_type_idx 
  ON linkedin_connection_events(event_type);
CREATE INDEX IF NOT EXISTS linkedin_connection_events_linkedin_subject_idx 
  ON linkedin_connection_events(linkedin_subject);

ALTER TABLE linkedin_connection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own connection events"
  ON linkedin_connection_events FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages connection events"
  ON linkedin_connection_events FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_token_refresh_log: audit trail for token refresh operations
CREATE TABLE IF NOT EXISTS linkedin_token_refresh_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject     text        NOT NULL,
  refresh_trigger      text        NOT NULL CHECK (refresh_trigger IN ('proactive', 'expired', 'api_error', 'manual', 'scheduled')),
  success              boolean     NOT NULL,
  old_expires_at       timestamptz,
  new_expires_at       timestamptz,
  old_scopes           text[],
  new_scopes           text[],
  error_code           text,
  error_message        text,
  latency_ms           int,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_user_id_idx 
  ON linkedin_token_refresh_log(user_id);
CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_created_at_idx 
  ON linkedin_token_refresh_log(created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_success_idx 
  ON linkedin_token_refresh_log(success);
CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_trigger_idx 
  ON linkedin_token_refresh_log(refresh_trigger);

ALTER TABLE linkedin_token_refresh_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own token refresh log"
  ON linkedin_token_refresh_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages token refresh log"
  ON linkedin_token_refresh_log FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- Cleanup function for expired OAuth states and old rate limit windows
CREATE OR REPLACE FUNCTION cleanup_linkedin_oauth_states()
RETURNS void AS $$
DECLARE
  deleted_states int;
  deleted_rate_limits int;
  deleted_refresh_logs int;
BEGIN
  DELETE FROM linkedin_oauth_states WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS deleted_states = ROW_COUNT;
  
  DELETE FROM linkedin_rate_limits WHERE window_start < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_rate_limits = ROW_COUNT;
  
  DELETE FROM linkedin_token_refresh_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_refresh_logs = ROW_COUNT;
  
  RAISE NOTICE 'LinkedIn cleanup: % oauth states, % rate limits, % refresh logs deleted',
    deleted_states, deleted_rate_limits, deleted_refresh_logs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and update connection status based on token expiry
CREATE OR REPLACE FUNCTION check_linkedin_token_expiry()
RETURNS void AS $$
BEGIN
  UPDATE linkedin_identities
  SET 
    connection_status = 'expired',
    updated_at = now()
  WHERE 
    connection_status = 'active'
    AND expires_at < now()
    AND (refresh_token IS NULL OR refresh_expires_at < now());
    
  UPDATE linkedin_identities
  SET 
    connection_status = 'pending_reauth',
    updated_at = now()
  WHERE 
    connection_status = 'active'
    AND expires_at < now()
    AND refresh_token IS NOT NULL
    AND refresh_expires_at >= now()
    AND consecutive_refresh_failures >= 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get share statistics for a user
CREATE OR REPLACE FUNCTION get_linkedin_share_stats(p_user_id uuid, p_days int DEFAULT 30)
RETURNS TABLE (
  total_shares bigint,
  successful_shares bigint,
  failed_shares bigint,
  share_types jsonb,
  avg_latency_ms numeric,
  last_share_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as total_shares,
    COUNT(*) FILTER (WHERE response_status >= 200 AND response_status < 300)::bigint as successful_shares,
    COUNT(*) FILTER (WHERE response_status >= 400)::bigint as failed_shares,
    jsonb_object_agg(share_type, type_count) as share_types,
    AVG(latency_ms)::numeric as avg_latency_ms,
    MAX(created_at) as last_share_at
  FROM linkedin_share_audit
  CROSS JOIN LATERAL (
    SELECT share_type, COUNT(*) as type_count
    FROM linkedin_share_audit sa2
    WHERE sa2.user_id = p_user_id
      AND sa2.created_at > now() - (p_days || ' days')::interval
    GROUP BY share_type
  ) type_counts
  WHERE user_id = p_user_id
    AND created_at > now() - (p_days || ' days')::interval;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Comments for documentation
COMMENT ON TABLE linkedin_identities IS 'Stores LinkedIn OAuth credentials and profile data for authenticated users';
COMMENT ON TABLE linkedin_oauth_states IS 'Temporary CSRF tokens for OAuth flow security';
COMMENT ON TABLE linkedin_share_audit IS 'Immutable audit log of all content sharing attempts';
COMMENT ON TABLE linkedin_rate_limits IS 'Per-user rate limiting windows for LinkedIn API calls';
COMMENT ON TABLE linkedin_connection_events IS 'Event log tracking LinkedIn connection lifecycle changes';
COMMENT ON TABLE linkedin_token_refresh_log IS 'Audit trail for all token refresh operations';
COMMENT ON COLUMN linkedin_identities.linkedin_subject IS 'LinkedIn member URN (unique identifier)';
COMMENT ON COLUMN linkedin_identities.connection_status IS 'Current state of OAuth connection';
COMMENT ON COLUMN linkedin_identities.consecutive_refresh_failures IS 'Count of consecutive failed token refreshes';
COMMENT ON COLUMN linkedin_identities.feature_flags IS 'User-specific feature flags for LinkedIn integration';
COMMENT ON COLUMN linkedin_share_audit.idempotency_key IS 'Client-provided key to prevent duplicate shares';
COMMENT ON COLUMN linkedin_share_audit.parent_share_id IS 'Reference to original share for reshares';
COMMENT ON COLUMN linkedin_connection_events.event_type IS 'Type of connection lifecycle event';
COMMENT ON COLUMN linkedin_token_refresh_log.refresh_trigger IS 'What triggered the token refresh attempt';
COMMENT ON FUNCTION cleanup_linkedin_oauth_states() IS 'Periodic cleanup of expired OAuth states, rate limits, and old logs';
COMMENT ON FUNCTION check_linkedin_token_expiry() IS 'Updates connection status for expired tokens';
COMMENT ON FUNCTION get_linkedin_share_stats(uuid, int) IS 'Returns sharing statistics for a user over the specified period';
-- === 20260303090000_sentinel_resilience_incidents.sql ===
-- SENTINEL resilience incidents with business-impact tagging
create table if not exists public.sentinel_incidents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_event_id uuid references public.mcp_tool_audit_events(id) on delete set null,
  title text not null,
  summary text,
  severity text not null default 'medium',
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  containment_started_at timestamptz,
  contained_at timestamptz,
  resolved_at timestamptz,
  impacted_routes text[] not null default '{}'::text[],
  impacted_features text[] not null default '{}'::text[],
  impacted_users_estimate integer,
  estimated_revenue_impact_usd numeric(14,2),
  blast_radius text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (severity in ('low', 'medium', 'high', 'critical')),
  check (status in ('open', 'investigating', 'contained', 'resolved')),
  check (impacted_users_estimate is null or impacted_users_estimate >= 0),
  check (estimated_revenue_impact_usd is null or estimated_revenue_impact_usd >= 0)
);

drop trigger if exists set_sentinel_incidents_updated_at on public.sentinel_incidents;
create trigger set_sentinel_incidents_updated_at
before update on public.sentinel_incidents
for each row execute function public.set_updated_at();

alter table public.sentinel_incidents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sentinel_incidents' and policyname = 'sentinel_incidents_owner_rw'
  ) then
    create policy sentinel_incidents_owner_rw
      on public.sentinel_incidents
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists sentinel_incidents_owner_detected_idx on public.sentinel_incidents (owner_user_id, detected_at desc);
create index if not exists sentinel_incidents_owner_status_idx on public.sentinel_incidents (owner_user_id, status, severity);
create index if not exists sentinel_incidents_source_event_idx on public.sentinel_incidents (source_event_id);

-- === 20260303113000_supabase_security_hardening.sql ===
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

-- === 20260303123000_supabase_tenant_isolation_crm.sql ===
-- Supabase tenant isolation hardening for legacy CRM / analytics tables.
--
-- Goals:
-- 1) Remove authenticated-wide read policies that are not tenant-isolated.
-- 2) Restrict project_positions reads to the owning project's user.
-- 3) Leave service-role / internal access paths unaffected (RLS bypass).
--
-- Tables in scope:
-- - public.tribes
-- - public.activity_log
-- - public.csv_uploads
-- - public.friend_locations
-- - public.project_positions

do $$
begin
  -- ─────────────────────────────────────────────────────────────────────────────
  -- 1) tribes: drop authenticated-wide read policy
  --    (owner-scoped read will be introduced once an owner column is available).
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tribes'
      and policyname = 'tribes_authenticated_read'
  ) then
    drop policy tribes_authenticated_read on public.tribes;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 2) activity_log: drop authenticated-wide read policy
  --    Activity log becomes internal/service-role only for now.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_log'
      and policyname = 'activity_log_authenticated_read'
  ) then
    drop policy activity_log_authenticated_read on public.activity_log;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 3) csv_uploads: drop authenticated-wide read policy
  --    Upload previews become internal/service-role only until owner-scoped
  --    columns + policies are introduced.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'csv_uploads'
      and policyname = 'csv_uploads_authenticated_read'
  ) then
    drop policy csv_uploads_authenticated_read on public.csv_uploads;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 4) friend_locations: drop authenticated-wide read policy
  --    Location data becomes internal/service-role only until a clear ownership
  --    model is defined.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'friend_locations'
      and policyname = 'friend_locations_authenticated_read'
  ) then
    drop policy friend_locations_authenticated_read on public.friend_locations;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 5) project_positions: replace authenticated-wide read with owner-scoped read
  --
  --    Previous policy:
  --      create policy project_positions_read_authenticated
  --        on public.project_positions
  --        for select to authenticated
  --        using (true);
  --
  --    New policy:
  --      - Only allow reads when the associated project is owned by auth.uid().
  --      - Mirrors the existing write policy, but for SELECT.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_positions'
      and policyname = 'project_positions_read_authenticated'
  ) then
    drop policy project_positions_read_authenticated on public.project_positions;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_positions'
      and policyname = 'project_positions_read_owner'
  ) then
    create policy project_positions_read_owner
      on public.project_positions
      for select to authenticated
      using (
        exists (
          select 1
          from public.projects p
          where p.id = project_id
            and p.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;


-- === 20260303133000_supabase_tenant_owner_model_crm.sql ===
-- Supabase tenant isolation follow-up:
-- Add explicit ownership columns and owner-scoped policies for legacy CRM tables.
--
-- Tables:
-- - public.tribes
-- - public.activity_log
-- - public.csv_uploads
-- - public.friend_locations

alter table public.tribes
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.activity_log
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.csv_uploads
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.friend_locations
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.tribes alter column owner_user_id set default auth.uid();
alter table public.activity_log alter column owner_user_id set default auth.uid();
alter table public.csv_uploads alter column owner_user_id set default auth.uid();
alter table public.friend_locations alter column owner_user_id set default auth.uid();

create index if not exists tribes_owner_updated_idx
  on public.tribes (owner_user_id, updated_at desc);

create index if not exists activity_log_owner_created_idx
  on public.activity_log (owner_user_id, created_at desc);

create index if not exists csv_uploads_owner_uploaded_idx
  on public.csv_uploads (owner_user_id, uploaded_at desc);

create index if not exists friend_locations_owner_seen_idx
  on public.friend_locations (owner_user_id, last_seen desc);

-- Backfill tribes.owner_user_id for rows where a single owner can be inferred.
with project_owner_candidates as (
  select
    t.id as tribe_id,
    p.owner_user_id
  from public.tribes t
  join public.projects p
    on p.owner_user_id is not null
   and (p.tribe = t.id or p.tribe = t.name)
),
project_owner_resolved as (
  select
    tribe_id,
    min(owner_user_id::text)::uuid as owner_user_id
  from project_owner_candidates
  group by tribe_id
  having count(distinct owner_user_id) = 1
)
update public.tribes t
set owner_user_id = r.owner_user_id
from project_owner_resolved r
where t.id = r.tribe_id
  and t.owner_user_id is null;

with member_owner_candidates as (
  select
    t.id as tribe_id,
    p.owner_user_id
  from public.tribes t
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(t.members, '[]'::jsonb)) = 'array'
        then coalesce(t.members, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as member_row
  join public.profiles p
    on p.owner_user_id is not null
   and p.id = coalesce(
     member_row ->> 'personId',
     member_row ->> 'person_id',
     member_row ->> 'id'
   )
),
member_owner_resolved as (
  select
    tribe_id,
    min(owner_user_id::text)::uuid as owner_user_id
  from member_owner_candidates
  group by tribe_id
  having count(distinct owner_user_id) = 1
)
update public.tribes t
set owner_user_id = r.owner_user_id
from member_owner_resolved r
where t.id = r.tribe_id
  and t.owner_user_id is null;

create or replace function public.set_owner_user_id_from_auth()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_tribes_owner_user_id on public.tribes;
create trigger set_tribes_owner_user_id
before insert on public.tribes
for each row execute function public.set_owner_user_id_from_auth();

drop trigger if exists set_activity_log_owner_user_id on public.activity_log;
create trigger set_activity_log_owner_user_id
before insert on public.activity_log
for each row execute function public.set_owner_user_id_from_auth();

drop trigger if exists set_csv_uploads_owner_user_id on public.csv_uploads;
create trigger set_csv_uploads_owner_user_id
before insert on public.csv_uploads
for each row execute function public.set_owner_user_id_from_auth();

drop trigger if exists set_friend_locations_owner_user_id on public.friend_locations;
create trigger set_friend_locations_owner_user_id
before insert on public.friend_locations
for each row execute function public.set_owner_user_id_from_auth();

do $$
begin
  drop policy if exists tribes_authenticated_read on public.tribes;
  drop policy if exists tribes_owner_rw on public.tribes;

  create policy tribes_owner_rw
    on public.tribes
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());

  drop policy if exists activity_log_authenticated_read on public.activity_log;
  drop policy if exists activity_log_owner_read on public.activity_log;

  create policy activity_log_owner_read
    on public.activity_log
    for select to authenticated
    using (owner_user_id = auth.uid());

  drop policy if exists csv_uploads_authenticated_read on public.csv_uploads;
  drop policy if exists csv_uploads_authenticated_insert on public.csv_uploads;
  drop policy if exists csv_uploads_owner_read on public.csv_uploads;
  drop policy if exists csv_uploads_owner_insert on public.csv_uploads;

  create policy csv_uploads_owner_read
    on public.csv_uploads
    for select to authenticated
    using (owner_user_id = auth.uid());

  create policy csv_uploads_owner_insert
    on public.csv_uploads
    for insert to authenticated
    with check (owner_user_id = auth.uid());

  drop policy if exists friend_locations_authenticated_read on public.friend_locations;
  drop policy if exists friend_locations_owner_read on public.friend_locations;

  create policy friend_locations_owner_read
    on public.friend_locations
    for select to authenticated
    using (owner_user_id = auth.uid());
end $$;

-- === 20260303170000_critical_workflow_verification_and_egress_shape.sql ===
-- Critical workflow verification + workflow-shaped egress telemetry
-- Adds auditable verification lifecycle columns and egress-shape metadata.

alter table public.mcp_tool_audit_events
  add column if not exists critical_workflow_class text not null default 'none',
  add column if not exists verification_required boolean not null default false,
  add column if not exists verification_state text not null default 'not_required',
  add column if not exists verification_target_tool text,
  add column if not exists verification_subject text,
  add column if not exists verification_due_at timestamptz,
  add column if not exists verification_checked_at timestamptz,
  add column if not exists egress_payload_bytes integer,
  add column if not exists egress_attachment_count integer,
  add column if not exists egress_thread_message_count integer,
  add column if not exists egress_shape_approval_required boolean not null default false;

alter table public.mcp_tool_audit_events
  drop constraint if exists mcp_tool_audit_events_critical_workflow_class_check;
alter table public.mcp_tool_audit_events
  add constraint mcp_tool_audit_events_critical_workflow_class_check
  check (critical_workflow_class in ('none', 'destructive', 'egress'));

alter table public.mcp_tool_audit_events
  drop constraint if exists mcp_tool_audit_events_verification_state_check;
alter table public.mcp_tool_audit_events
  add constraint mcp_tool_audit_events_verification_state_check
  check (verification_state in ('not_required', 'pending', 'passed', 'failed'));

create index if not exists mcp_tool_audit_verification_owner_session_idx
  on public.mcp_tool_audit_events (owner_user_id, session_id, verification_state, created_at desc);

create index if not exists mcp_tool_audit_critical_workflow_class_idx
  on public.mcp_tool_audit_events (critical_workflow_class, created_at desc);

create index if not exists mcp_tool_audit_egress_shape_approval_idx
  on public.mcp_tool_audit_events (egress_shape_approval_required, created_at desc);

-- === 20260303193000_sentinel_kpi_webhook_alerts.sql ===
-- SENTINEL KPI webhook dispatch tracking
-- Internal service-role table to dedupe webhook alerts and keep delivery state.

create table if not exists public.sentinel_alert_dispatches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null,
  alert_type text not null default 'kpi',
  last_status text not null default 'never',
  last_sent_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  last_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, alert_key),
  check (last_status in ('never', 'sent', 'failed'))
);

drop trigger if exists set_sentinel_alert_dispatches_updated_at on public.sentinel_alert_dispatches;
create trigger set_sentinel_alert_dispatches_updated_at
before update on public.sentinel_alert_dispatches
for each row execute function public.set_updated_at();

alter table public.sentinel_alert_dispatches enable row level security;

create index if not exists sentinel_alert_dispatches_owner_sent_idx
  on public.sentinel_alert_dispatches (owner_user_id, last_sent_at desc);

create index if not exists sentinel_alert_dispatches_status_attempt_idx
  on public.sentinel_alert_dispatches (last_status, last_attempt_at desc);

-- === 20260305180000_fundraising.sql ===
-- Fundraising: campaigns, donors, donations, and goals (owner-scoped, RLS).

create table if not exists public.fundraising_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  goal_amount numeric not null default 0,
  currency text not null default 'USD',
  status text not null default 'draft',
  start_date date,
  end_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (goal_amount >= 0),
  check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'OTHER')),
  check (status in ('draft', 'active', 'paused', 'completed', 'archived'))
);

create table if not exists public.fundraising_donors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.fundraising_campaigns(id) on delete set null,
  name text not null,
  email text,
  company text,
  phone text,
  notes text,
  total_donated numeric not null default 0,
  donation_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_donated >= 0),
  check (donation_count >= 0)
);

create table if not exists public.fundraising_donations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.fundraising_campaigns(id) on delete cascade,
  donor_id uuid references public.fundraising_donors(id) on delete set null,
  amount numeric not null,
  currency text not null default 'USD',
  status text not null default 'pledged',
  donated_at timestamptz not null default now(),
  note text,
  payment_method text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount > 0),
  check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'OTHER')),
  check (status in ('pledged', 'received', 'recurring', 'refunded', 'cancelled'))
);

create table if not exists public.fundraising_goals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.fundraising_campaigns(id) on delete cascade,
  title text not null,
  description text,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  currency text not null default 'USD',
  due_date date,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_amount >= 0),
  check (current_amount >= 0),
  check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'OTHER')),
  check (status in ('active', 'met', 'missed', 'cancelled'))
);

drop trigger if exists set_fundraising_campaigns_updated_at on public.fundraising_campaigns;
create trigger set_fundraising_campaigns_updated_at
before update on public.fundraising_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists set_fundraising_donors_updated_at on public.fundraising_donors;
create trigger set_fundraising_donors_updated_at
before update on public.fundraising_donors
for each row execute function public.set_updated_at();

drop trigger if exists set_fundraising_donations_updated_at on public.fundraising_donations;
create trigger set_fundraising_donations_updated_at
before update on public.fundraising_donations
for each row execute function public.set_updated_at();

drop trigger if exists set_fundraising_goals_updated_at on public.fundraising_goals;
create trigger set_fundraising_goals_updated_at
before update on public.fundraising_goals
for each row execute function public.set_updated_at();

alter table public.fundraising_campaigns enable row level security;
alter table public.fundraising_donors enable row level security;
alter table public.fundraising_donations enable row level security;
alter table public.fundraising_goals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_campaigns' and policyname = 'fundraising_campaigns_owner_rw') then
    create policy fundraising_campaigns_owner_rw on public.fundraising_campaigns
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_donors' and policyname = 'fundraising_donors_owner_rw') then
    create policy fundraising_donors_owner_rw on public.fundraising_donors
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_donations' and policyname = 'fundraising_donations_owner_rw') then
    create policy fundraising_donations_owner_rw on public.fundraising_donations
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_goals' and policyname = 'fundraising_goals_owner_rw') then
    create policy fundraising_goals_owner_rw on public.fundraising_goals
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists fundraising_campaigns_owner_updated_idx on public.fundraising_campaigns (owner_user_id, updated_at desc);
create index if not exists fundraising_campaigns_owner_status_idx on public.fundraising_campaigns (owner_user_id, status);
create index if not exists fundraising_donors_owner_updated_idx on public.fundraising_donors (owner_user_id, updated_at desc);
create index if not exists fundraising_donors_campaign_idx on public.fundraising_donors (campaign_id) where campaign_id is not null;
create index if not exists fundraising_donations_campaign_donated_idx on public.fundraising_donations (campaign_id, donated_at desc);
create index if not exists fundraising_donations_donor_idx on public.fundraising_donations (donor_id) where donor_id is not null;
create index if not exists fundraising_goals_campaign_order_idx on public.fundraising_goals (campaign_id, sort_order, id);

-- === 20260305190000_fundraising_outreach.sql ===
-- Fundraising outreach: email and LinkedIn campaigns (owner-scoped, RLS).

create table if not exists public.fundraising_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fundraising_campaign_id uuid not null references public.fundraising_campaigns(id) on delete cascade,
  channel text not null,
  name text not null,
  subject text,
  body_text text not null default '',
  status text not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  linkedin_post_id text,
  email_integration_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel in ('email', 'linkedin')),
  check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed'))
);

create table if not exists public.fundraising_outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  outreach_campaign_id uuid not null references public.fundraising_outreach_campaigns(id) on delete cascade,
  donor_id uuid references public.fundraising_donors(id) on delete set null,
  email text not null,
  name text,
  status text not null default 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  check (status in ('pending', 'sent', 'failed'))
);

drop trigger if exists set_fundraising_outreach_campaigns_updated_at on public.fundraising_outreach_campaigns;
create trigger set_fundraising_outreach_campaigns_updated_at
before update on public.fundraising_outreach_campaigns
for each row execute function public.set_updated_at();

alter table public.fundraising_outreach_campaigns enable row level security;
alter table public.fundraising_outreach_recipients enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_outreach_campaigns' and policyname = 'fundraising_outreach_campaigns_owner_rw') then
    create policy fundraising_outreach_campaigns_owner_rw on public.fundraising_outreach_campaigns
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_outreach_recipients' and policyname = 'fundraising_outreach_recipients_owner_via_campaign') then
    create policy fundraising_outreach_recipients_owner_via_campaign on public.fundraising_outreach_recipients
      for all to authenticated
      using (
        exists (
          select 1 from public.fundraising_outreach_campaigns c
          where c.id = outreach_campaign_id and c.owner_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.fundraising_outreach_campaigns c
          where c.id = outreach_campaign_id and c.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create index if not exists fundraising_outreach_campaigns_owner_updated_idx on public.fundraising_outreach_campaigns (owner_user_id, updated_at desc);
create index if not exists fundraising_outreach_campaigns_fundraising_campaign_idx on public.fundraising_outreach_campaigns (fundraising_campaign_id);
create index if not exists fundraising_outreach_recipients_outreach_status_idx on public.fundraising_outreach_recipients (outreach_campaign_id, status);

-- === 20260305200000_storage_linkedout_assets.sql ===
-- LinkedOut branded storage: one app bucket for files and assets (campaign images, avatars, etc.).
-- Apply in Supabase SQL editor or migration pipeline.

-- Create bucket (private; access via RLS)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'linkedout-assets',
  'linkedout-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'application/json']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow authenticated users to read/list objects in this bucket
create policy "linkedout_assets_select"
on storage.objects for select
to authenticated
using ( bucket_id = 'linkedout-assets' );

-- Allow authenticated users to upload
create policy "linkedout_assets_insert"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'linkedout-assets' );

-- Allow authenticated users to update (e.g. metadata)
create policy "linkedout_assets_update"
on storage.objects for update
to authenticated
using ( bucket_id = 'linkedout-assets' );

-- Allow authenticated users to delete
create policy "linkedout_assets_delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'linkedout-assets' );

-- === 20260305213000_linkedin_manual_outreach.sql ===
-- Manual LinkedIn outreach persistence for AI-assisted drafts and follow-up tracking.

create table if not exists public.linkedin_message_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  channel text not null default 'message',
  subject text,
  body_text text not null,
  delivery_status text not null default 'draft_ready',
  last_manual_sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel in ('message', 'inmail')),
  check (delivery_status in ('draft_ready', 'manual_sent', 'archived'))
);

create table if not exists public.linkedin_connection_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  note text,
  request_status text not null default 'draft_ready',
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (request_status in ('draft_ready', 'manual_sent', 'withdrawn', 'archived'))
);

drop trigger if exists set_linkedin_message_drafts_updated_at on public.linkedin_message_drafts;
create trigger set_linkedin_message_drafts_updated_at
before update on public.linkedin_message_drafts
for each row execute function public.set_updated_at();

drop trigger if exists set_linkedin_connection_requests_updated_at on public.linkedin_connection_requests;
create trigger set_linkedin_connection_requests_updated_at
before update on public.linkedin_connection_requests
for each row execute function public.set_updated_at();

alter table public.linkedin_message_drafts enable row level security;
alter table public.linkedin_connection_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'linkedin_message_drafts'
      and policyname = 'linkedin_message_drafts_owner_rw'
  ) then
    create policy linkedin_message_drafts_owner_rw on public.linkedin_message_drafts
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'linkedin_connection_requests'
      and policyname = 'linkedin_connection_requests_owner_rw'
  ) then
    create policy linkedin_connection_requests_owner_rw on public.linkedin_connection_requests
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists linkedin_message_drafts_owner_updated_idx
  on public.linkedin_message_drafts (owner_user_id, updated_at desc);
create index if not exists linkedin_message_drafts_owner_profile_idx
  on public.linkedin_message_drafts (owner_user_id, profile_id);
create index if not exists linkedin_connection_requests_owner_updated_idx
  on public.linkedin_connection_requests (owner_user_id, updated_at desc);
create index if not exists linkedin_connection_requests_owner_profile_idx
  on public.linkedin_connection_requests (owner_user_id, profile_id);

-- === 20260324000000_tribe_intelligence.sql ===
-- Tribe Intelligence: High-Bandwidth Intelligence Syndicate
-- Adds knowledge base, signal feed, sprints, and extended tribe metadata

-- 1. Collective Edge: Tribal Knowledge Base
create table if not exists public.tribe_knowledge_base (
  id text primary key default gen_random_uuid()::text,
  tribe_id text not null,
  contributed_by text not null,
  content_type text not null default 'insight',
  title text not null,
  content text not null,
  tags jsonb not null default '[]'::jsonb,
  tool_chain jsonb default null,
  metrics jsonb default null,
  upvotes integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tribe_kb_tribe_idx on tribe_knowledge_base(tribe_id);
create index if not exists tribe_kb_created_idx on tribe_knowledge_base(created_at desc);

-- 2. Signal-Only Feed: Validated Use Cases
create table if not exists public.tribe_signal_feed (
  id text primary key default gen_random_uuid()::text,
  tribe_id text not null,
  author_id text not null,
  tool_used text not null,
  task_description text not null,
  prompt_chain text,
  result_summary text not null,
  error_rate numeric,
  time_saved_minutes integer,
  validated_by jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tribe_feed_tribe_idx on tribe_signal_feed(tribe_id);
create index if not exists tribe_feed_created_idx on tribe_signal_feed(created_at desc);

-- 3. Liquid Micro-Squad Sprints
create table if not exists public.tribe_sprints (
  id text primary key default gen_random_uuid()::text,
  tribe_id text not null,
  name text not null,
  objective text not null,
  squad_member_ids jsonb not null default '[]'::jsonb,
  status text default 'forming',
  duration_hours integer default 48,
  skill_requirements jsonb default '[]'::jsonb,
  outcomes jsonb default null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tribe_sprints_tribe_idx on tribe_sprints(tribe_id);

-- 4. Extended tribe columns for syndicate features
alter table tribes add column if not exists tribe_doctrine text default 'syndicate';
alter table tribes add column if not exists entry_requirements jsonb default '{"proofOfAgency": true, "minBuildComplexity": "solo-replaces-team"}'::jsonb;
alter table tribes add column if not exists engagement_threshold numeric default 0.6;
alter table tribes add column if not exists shared_resources jsonb default '{"apiCredits": {}, "datasets": [], "tools": []}'::jsonb;
alter table tribes add column if not exists next_review_date timestamptz;
alter table tribes add column if not exists automation_risk_alerts jsonb default '[]'::jsonb;

-- 5. Triggers for updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_tribe_kb_updated_at on tribe_knowledge_base;
create trigger set_tribe_kb_updated_at
  before update on tribe_knowledge_base
  for each row execute function set_updated_at();

-- === 20260324100000_ai_native_schema.sql ===
-- =============================================================================
-- AI-Native Schema Evolution: From File Cabinet to Brain
-- Adds: vector embeddings, agent workflow states, lineage tracking, JSONB indexes
-- =============================================================================

-- 1. Enable pgvector extension for semantic search / RAG
create extension if not exists vector;

-- 2. Vector Embeddings: Profile Intelligence Layer
-- Enables "Instant Recall on the Edge" — semantic search across all profiles
alter table profiles add column if not exists embedding vector(1536);
alter table profiles add column if not exists embedding_model text;
alter table profiles add column if not exists embedding_updated_at timestamptz;

create index if not exists profiles_embedding_idx
  on profiles using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 3. Vector Embeddings: Knowledge Base (Tribal RAG)
alter table tribe_knowledge_base add column if not exists embedding vector(1536);
alter table tribe_knowledge_base add column if not exists embedding_model text;

create index if not exists tribe_kb_embedding_idx
  on tribe_knowledge_base using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- 4. Agent Workflow States: Persistent Agentic Memory
-- Tracks where an AI agent is in a long-running workflow
create table if not exists public.agent_workflow_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workflow_type text not null,          -- 'onboarding_discovery' | 'tribe_formation' | 'skill_audit' | 'outreach_campaign'
  workflow_name text not null,
  status text not null default 'running', -- running | paused | completed | failed | cancelled
  current_step text not null,           -- current step identifier
  total_steps integer not null default 1,
  completed_steps integer not null default 0,

  -- Agent identity
  ai_agent_id text,                     -- which AI model/persona executed this
  ai_model_used text,                   -- 'gpt-4o' | 'claude-4.6' | etc.
  persona_id text,                      -- persona used for this workflow

  -- State persistence (the "brain")
  context jsonb not null default '{}'::jsonb,   -- accumulated context from all steps
  step_history jsonb not null default '[]'::jsonb, -- ordered array of step results
  pending_input jsonb,                  -- what the workflow is waiting for (user input, approval, etc.)

  -- Lineage & validation
  initiated_by text not null default 'user', -- 'user' | 'agent' | 'cron' | 'system'
  validated_by uuid,                    -- user who approved/validated the output
  validated_at timestamptz,
  validation_notes text,

  -- Lifecycle
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,

  -- Metadata
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_workflows_owner_idx on agent_workflow_states(owner_user_id);
create index if not exists agent_workflows_status_idx on agent_workflow_states(status);
create index if not exists agent_workflows_type_idx on agent_workflow_states(workflow_type);

-- 5. Lineage Tracking: Human ↔ AI Pair Audit
-- Extends mcp_tool_audit_events with explicit AI/Human tracking
alter table mcp_tool_audit_events add column if not exists ai_agent_id text;
alter table mcp_tool_audit_events add column if not exists ai_model_used text;
alter table mcp_tool_audit_events add column if not exists persona_id text;
alter table mcp_tool_audit_events add column if not exists validated_by uuid;
alter table mcp_tool_audit_events add column if not exists validated_at timestamptz;
alter table mcp_tool_audit_events add column if not exists workflow_id uuid;
alter table mcp_tool_audit_events add column if not exists lineage_chain jsonb default '[]'::jsonb;

-- 6. User Discovery Profiles: "Human Alpha" Identification
-- Stores the output of AI-driven onboarding discovery sessions
create table if not exists public.user_discovery_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Discovery outputs
  human_alpha jsonb not null default '{}'::jsonb,
    -- { "uniqueStrengths": [], "domainExpertise": [], "decisionLayerSkills": [], "craftOrientation": "" }
  suggested_workflows jsonb not null default '[]'::jsonb,
    -- [{ "name": "", "description": "", "tools": [], "estimatedTimeMultiplier": "" }]
  career_trajectory jsonb default '{}'::jsonb,
    -- { "currentLayer": "execution|decision|design", "targetLayer": "", "pivotRecommendations": [] }
  engagement_profile jsonb default '{}'::jsonb,
    -- { "passionSignals": [], "curiosityIndex": 0, "domainFit": "" }

  -- First workflow template (built during onboarding)
  first_workflow_id uuid,               -- references agent_workflow_states.id
  first_workflow_name text,

  -- AI that conducted the discovery
  discovery_agent_id text,
  discovery_model text,
  discovery_completed_at timestamptz,

  -- Metadata
  raw_inputs jsonb default '{}'::jsonb, -- original user inputs during discovery
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_discovery_profiles_unique unique (user_id)
);

-- 7. GIN Indexes on JSONB columns for fast containment queries
create index if not exists profiles_skills_gin on profiles using gin (skills jsonb_path_ops);
create index if not exists tribes_members_gin on tribes using gin (members jsonb_path_ops);
create index if not exists tribes_common_skills_gin on tribes using gin (common_skills jsonb_path_ops);
create index if not exists projects_tags_gin on projects using gin (tags jsonb_path_ops);
create index if not exists projects_milestones_gin on projects using gin (milestones jsonb_path_ops);
create index if not exists tribe_kb_tags_gin on tribe_knowledge_base using gin (tags jsonb_path_ops);
create index if not exists agent_workflows_context_gin on agent_workflow_states using gin (context jsonb_path_ops);
create index if not exists user_discovery_human_alpha_gin on user_discovery_profiles using gin (human_alpha jsonb_path_ops);

-- 8. Semantic search helper function
-- Usage: SELECT * FROM profiles ORDER BY embedding <=> query_embedding LIMIT 10;
-- The <=> operator uses cosine distance with the ivfflat index above.

-- 9. Triggers for updated_at
drop trigger if exists set_agent_workflows_updated_at on agent_workflow_states;
create trigger set_agent_workflows_updated_at
  before update on agent_workflow_states
  for each row execute function set_updated_at();

drop trigger if exists set_user_discovery_updated_at on user_discovery_profiles;
create trigger set_user_discovery_updated_at
  before update on user_discovery_profiles
  for each row execute function set_updated_at();

-- 10. RLS for new tables
alter table agent_workflow_states enable row level security;
create policy agent_workflows_owner_rw on agent_workflow_states
  for all using (owner_user_id = auth.uid());

alter table user_discovery_profiles enable row level security;
create policy user_discovery_owner_rw on user_discovery_profiles
  for all using (user_id = auth.uid());

-- === 20260324200000_operating_system_for_agents.sql ===
-- =============================================================================
-- Operating System for Agents: 6 Prime Directives
-- Trust Score, Sprint Loop, Content Multiplier, Knowledge GPU,
-- Skill Futures, Sovereignty Infrastructure
-- =============================================================================

-- 1. TRUST SCORE: Verified Log of Judgment (Proof of Human-in-the-Loop)
-- Every decision a user makes (validate, reject, direct) is logged as a
-- "judgment event" that builds their trust score over time.
create table if not exists public.judgment_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,         -- 'tool_validation' | 'output_review' | 'tribe_decision' | 'sprint_review' | 'signal_validation' | 'workflow_direction'
  context_type text not null,       -- 'profile' | 'tribe' | 'project' | 'content' | 'workflow' | 'signal'
  context_id text,                  -- ID of the entity being judged
  judgment text not null,           -- 'approved' | 'rejected' | 'modified' | 'escalated' | 'directed'
  ai_output_hash text,              -- hash of the AI output being judged (proves what was reviewed)
  ai_model_used text,               -- which model produced the output
  modification_summary text,        -- what the human changed (if modified)
  confidence_score numeric,         -- user's self-reported confidence (0-100)
  time_spent_seconds integer,       -- time between AI output and human judgment
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists judgment_ledger_user_idx on judgment_ledger(user_id);
create index if not exists judgment_ledger_type_idx on judgment_ledger(event_type);
create index if not exists judgment_ledger_created_idx on judgment_ledger(created_at desc);

-- Trust score materialized per user (updated by triggers or cron)
create table if not exists public.trust_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_judgments integer not null default 0,
  approval_rate numeric not null default 0,
  modification_rate numeric not null default 0,
  rejection_rate numeric not null default 0,
  avg_response_time_seconds numeric default 0,
  decision_layer_score numeric not null default 0,  -- 0-100, weighted composite
  judgment_streak integer default 0,                -- consecutive days with judgments
  domains_judged jsonb default '[]'::jsonb,         -- unique context_types
  last_judgment_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 2. AGENTIC SPRINT-LOOP: Linear-style task manager with AI-first assignment
-- Tasks are assigned to AI agents first. If agent fails, escalates to human.
create table if not exists public.sprint_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sprint_id text,                   -- optional: links to tribe_sprints
  project_id text,                  -- optional: links to projects
  title text not null,
  description text,
  status text not null default 'backlog', -- backlog | ai_assigned | ai_in_progress | ai_completed | human_review | human_in_progress | done | failed
  priority text default 'medium',   -- low | medium | high | critical
  assigned_to text default 'ai',    -- 'ai' | user_id
  ai_agent_id text,                 -- which AI agent is working on it
  ai_model_used text,
  ai_attempt_count integer default 0,
  ai_output jsonb,                  -- the AI's work product
  ai_confidence numeric,            -- AI's self-reported confidence (0-100)
  human_feedback text,              -- human's review notes
  escalation_reason text,           -- why AI couldn't complete
  estimated_minutes integer,
  actual_minutes integer,
  force_multiplier numeric,         -- actual time saved vs manual estimate
  tags jsonb default '[]'::jsonb,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sprint_tasks_owner_idx on sprint_tasks(owner_user_id);
create index if not exists sprint_tasks_status_idx on sprint_tasks(status);
create index if not exists sprint_tasks_sprint_idx on sprint_tasks(sprint_id);

-- 3. CONTENT MULTIPLIER: One insight → multi-format pipeline
create table if not exists public.content_amplifications (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,        -- 'insight' | 'signal' | 'knowledge_entry' | 'project_update'
  source_id text,                   -- ID of source content
  source_text text not null,        -- the original insight text
  outputs jsonb not null default '[]'::jsonb,
    -- [{ format: 'linkedin_post' | 'thread' | 'podcast_script' | 'design_brief' | 'newsletter',
    --    content: string, generated_by: string, status: 'draft'|'approved'|'published', published_at?: string }]
  distribution_channels jsonb default '[]'::jsonb,
    -- [{ channel: 'linkedin' | 'tribal_feed' | 'email' | 'podcast', status: 'pending'|'sent', sent_at?: string }]
  amplification_score numeric default 0, -- reach × engagement estimate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_amp_owner_idx on content_amplifications(owner_user_id);

-- 4. PERSONAL KNOWLEDGE GPU: Private vector space per user
-- Already have user-scoped llm_workspaces + llm_documents with vector support.
-- Add vector columns to existing documents table for semantic retrieval.
alter table llm_documents add column if not exists embedding vector(1536);
alter table llm_documents add column if not exists embedding_model text;
alter table llm_documents add column if not exists embedding_updated_at timestamptz;

create index if not exists llm_documents_embedding_idx
  on llm_documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 5. SKILL-FUTURES: Project betting and judgment marketplace
create table if not exists public.skill_futures (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,                    -- optional tribe scope
  prediction_type text not null,    -- 'project_success' | 'tool_adoption' | 'skill_demand' | 'member_growth'
  title text not null,
  description text,
  resolution_criteria text not null, -- how the outcome will be measured
  resolution_date timestamptz not null,
  status text default 'open',       -- open | locked | resolved_yes | resolved_no | cancelled
  stakes jsonb default '[]'::jsonb, -- [{ user_id, position: 'yes'|'no', confidence: 0-100, staked_at }]
  resolution_evidence text,         -- what proved the outcome
  resolved_by uuid,                 -- who resolved it
  resolved_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists skill_futures_status_idx on skill_futures(status);
create index if not exists skill_futures_tribe_idx on skill_futures(tribe_id);

-- 6. SOVEREIGNTY INFRASTRUCTURE: Auto-compliance tracking
-- Lightweight compliance/entity tracking for sovereign artisans
create table if not exists public.sovereignty_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entity_type text,                 -- 'sole_proprietor' | 'llc' | 'corp' | 'freelancer' | 'not_set'
  entity_name text,
  jurisdiction text,                -- state/country
  tax_classification text,
  compliance_checklist jsonb default '[]'::jsonb,
    -- [{ item: string, status: 'done'|'pending'|'overdue', due_date?: string, completed_at?: string }]
  auto_compliance_enabled boolean default false,
  tools_budget_monthly numeric,     -- shared agentic infrastructure budget
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. RLS for all new tables
alter table judgment_ledger enable row level security;
create policy judgment_ledger_owner_rw on judgment_ledger for all using (user_id = auth.uid());

alter table trust_scores enable row level security;
create policy trust_scores_owner_read on trust_scores for select using (user_id = auth.uid());

alter table sprint_tasks enable row level security;
create policy sprint_tasks_owner_rw on sprint_tasks for all using (owner_user_id = auth.uid());

alter table content_amplifications enable row level security;
create policy content_amp_owner_rw on content_amplifications for all using (owner_user_id = auth.uid());

alter table skill_futures enable row level security;
create policy skill_futures_read on skill_futures for select using (true);
create policy skill_futures_create on skill_futures for insert with check (creator_user_id = auth.uid());

alter table sovereignty_profile enable row level security;
create policy sovereignty_owner_rw on sovereignty_profile for all using (user_id = auth.uid());

-- 8. Triggers
drop trigger if exists set_sprint_tasks_updated_at on sprint_tasks;
create trigger set_sprint_tasks_updated_at before update on sprint_tasks for each row execute function set_updated_at();

drop trigger if exists set_content_amp_updated_at on content_amplifications;
create trigger set_content_amp_updated_at before update on content_amplifications for each row execute function set_updated_at();

drop trigger if exists set_sovereignty_updated_at on sovereignty_profile;
create trigger set_sovereignty_updated_at before update on sovereignty_profile for each row execute function set_updated_at();

-- === 20260324300000_education_bridge.sql ===
-- =============================================================================
-- Education Bridge: K-12 ↔ OTJ Continuous Learning System
-- Shadow Agent sessions, Delta Reports, Verification Labs,
-- Proof of Build portfolios, Skills Verification, Prompt Marketplace
-- =============================================================================

-- 1. SHADOW AGENT SESSIONS: Active Copilot narrating logic during production
create table if not exists public.shadow_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null,         -- 'otj_copilot' | 'k12_guided' | 'self_directed' | 'tribe_mentored'
  context_domain text not null,       -- 'sales' | 'engineering' | 'design' | 'legal' | 'education' | 'custom'
  task_observed text not null,        -- what the user was doing
  narration_log jsonb not null default '[]'::jsonb,
    -- [{ timestamp, observation, logic_explanation, tool_suggested, confidence }]
  interventions jsonb not null default '[]'::jsonb,
    -- [{ timestamp, type: 'suggestion'|'correction'|'optimization', accepted: bool, detail }]
  skills_practiced jsonb default '[]'::jsonb,
  mastery_delta jsonb default '{}'::jsonb,
    -- { before: { skill: score }, after: { skill: score }, improvement_pct }
  duration_minutes integer,
  ai_model_used text,
  created_at timestamptz not null default now()
);
create index if not exists shadow_sessions_user_idx on shadow_agent_sessions(user_id);
create index if not exists shadow_sessions_created_idx on shadow_agent_sessions(created_at desc);

-- 2. DELTA REPORTS: Post-game AI review of daily execution
create table if not exists public.delta_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null default current_date,
  execution_summary jsonb not null default '{}'::jsonb,
    -- { totalTasks, aiAssistedTasks, manualTasks, timeOnSearchSummarize, timeOnDecisionDesign }
  optimizations jsonb not null default '[]'::jsonb,
    -- [{ task, currentMethod, suggestedWorkflow, estimatedTimeSaved, promptChain, installable: bool }]
  skill_progression jsonb default '{}'::jsonb,
    -- { newSkillsUsed: [], skillsImproved: [], atRiskSkills: [] }
  force_multiplier_achieved numeric,   -- actual multiplier vs manual baseline
  learning_velocity numeric,           -- rate of improvement over last 7 days
  streak_days integer default 0,
  ai_model_used text,
  created_at timestamptz not null default now(),
  constraint delta_reports_user_date unique (user_id, report_date)
);
create index if not exists delta_reports_user_idx on delta_reports(user_id);

-- 3. PROMPT MARKETPLACE: Internal knowledge graph of best-performer prompts
create table if not exists public.prompt_marketplace (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,                       -- optional tribe scope
  title text not null,
  description text not null,
  prompt_template text not null,       -- the actual prompt with {{variables}}
  variables jsonb default '[]'::jsonb, -- [{ name, description, type, example }]
  domain text not null,                -- 'sales' | 'engineering' | 'recruiting' | 'education' | etc
  performance_metrics jsonb default '{}'::jsonb,
    -- { conversionLift: "20%", timeSaved: "3h/week", errorReduction: "45%", usageCount: 0 }
  install_count integer default 0,
  rating_avg numeric default 0,
  rating_count integer default 0,
  tags jsonb default '[]'::jsonb,
  status text default 'published',     -- draft | published | archived | featured
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prompt_marketplace_domain_idx on prompt_marketplace(domain);
create index if not exists prompt_marketplace_rating_idx on prompt_marketplace(rating_avg desc);
create index if not exists prompt_marketplace_tags_gin on prompt_marketplace using gin (tags jsonb_path_ops);

-- 4. VERIFICATION LABS: K-12 + OTJ exercises in Signal Detection
create table if not exists public.verification_labs (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  title text not null,
  difficulty text default 'intermediate', -- beginner | intermediate | advanced | expert
  domain text not null,
  ai_generated_content text not null,    -- the AI output containing deliberate errors
  planted_errors jsonb not null default '[]'::jsonb,
    -- [{ location, errorType: 'hallucination'|'logic_flaw'|'source_fabrication'|'subtle_bias'|'statistical_error', description, severity }]
  total_errors integer not null,
  time_limit_minutes integer default 30,
  attempts jsonb default '[]'::jsonb,
    -- [{ userId, errorsFound: [], accuracy, timeSpent, completedAt }]
  created_at timestamptz not null default now()
);
create index if not exists verification_labs_domain_idx on verification_labs(domain);

-- 5. PROOF OF BUILD: Age-blind portfolio of orchestrated projects
create table if not exists public.proof_of_build (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  project_type text not null,          -- 'solo_build' | 'tribe_sprint' | 'k12_project' | 'otj_deliverable' | 'open_source'
  complexity_tier text default 'standard', -- standard | advanced | force_multiplier | team_replacement
  tools_used jsonb not null default '[]'::jsonb,
  ai_tools_used jsonb not null default '[]'::jsonb,
  decision_log jsonb not null default '[]'::jsonb,
    -- [{ decision, reasoning, alternatives_considered, outcome }]
  evidence_urls jsonb default '[]'::jsonb,
  output_metrics jsonb default '{}'::jsonb,
    -- { timeTaken, estimatedManualTime, forceMultiplier, qualityScore }
  verified_by jsonb default '[]'::jsonb,
    -- [{ userId, role: 'peer'|'mentor'|'employer'|'tribe_lead', verifiedAt, notes }]
  verification_score numeric default 0, -- composite from verifiers
  skills_demonstrated jsonb default '[]'::jsonb,
  is_public boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proof_of_build_user_idx on proof_of_build(user_id);
create index if not exists proof_of_build_skills_gin on proof_of_build using gin (skills_demonstrated jsonb_path_ops);
create index if not exists proof_of_build_public_idx on proof_of_build(is_public) where is_public = true;

-- 6. SKILLS VERIFICATION: Output-velocity-based hiring signal (age-blind)
create table if not exists public.skills_verification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_name text not null,
  verification_method text not null,   -- 'proof_of_build' | 'verification_lab' | 'peer_review' | 'tribe_assessment' | 'delta_report_trend'
  evidence_id text,                    -- links to proof_of_build, verification_lab, etc.
  output_velocity jsonb default '{}'::jsonb,
    -- { tasksPerHour, qualityScore, consistencyOver30Days, forceMultiplier }
  verified_at timestamptz not null default now(),
  expires_at timestamptz,              -- skills can expire if not practiced
  verified_by uuid,
  confidence numeric default 0,        -- 0-100
  constraint skills_verification_unique unique (user_id, skill_name, verification_method)
);
create index if not exists skills_verification_user_idx on skills_verification(user_id);
create index if not exists skills_verification_skill_idx on skills_verification(skill_name);

-- 7. RLS
alter table shadow_agent_sessions enable row level security;
create policy shadow_sessions_owner_rw on shadow_agent_sessions for all using (user_id = auth.uid());

alter table delta_reports enable row level security;
create policy delta_reports_owner_rw on delta_reports for all using (user_id = auth.uid());

alter table prompt_marketplace enable row level security;
create policy prompt_marketplace_read on prompt_marketplace for select using (true);
create policy prompt_marketplace_author_write on prompt_marketplace for insert with check (author_user_id = auth.uid());
create policy prompt_marketplace_author_update on prompt_marketplace for update using (author_user_id = auth.uid());

alter table verification_labs enable row level security;
create policy verification_labs_read on verification_labs for select using (true);
create policy verification_labs_creator_write on verification_labs for insert with check (creator_user_id = auth.uid());

alter table proof_of_build enable row level security;
create policy proof_of_build_owner_rw on proof_of_build for all using (user_id = auth.uid());
create policy proof_of_build_public_read on proof_of_build for select using (is_public = true);

alter table skills_verification enable row level security;
create policy skills_verification_owner_rw on skills_verification for all using (user_id = auth.uid());

-- 8. Triggers
drop trigger if exists set_prompt_marketplace_updated_at on prompt_marketplace;
create trigger set_prompt_marketplace_updated_at before update on prompt_marketplace for each row execute function set_updated_at();

drop trigger if exists set_proof_of_build_updated_at on proof_of_build;
create trigger set_proof_of_build_updated_at before update on proof_of_build for each row execute function set_updated_at();

-- === 20260324400000_economic_operating_system.sql ===
-- =============================================================================
-- Economic Operating System: 5-Pillar Platform Success Layer
-- KPI tracking, Career Flight Simulator, Anti-Algorithm feed,
-- Velocity Scores, Sovereignty milestones
-- =============================================================================

-- 1. HIGH-AGENCY KPIs: Platform-wide and per-user success metrics
create table if not exists public.platform_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,

  -- Velocity of Value: time from join to first shipped project
  first_collaboration_hours numeric,      -- hours until first tribe/squad join
  first_project_shipped_hours numeric,    -- hours until first proof of build
  velocity_of_value_score numeric,        -- composite (lower = better)

  -- Skill-Pivot Rate: movement from execution to decision layer
  execution_layer_pct numeric default 100,  -- % time on execution tasks
  decision_layer_pct numeric default 0,     -- % time on decision/design
  pivot_velocity numeric default 0,         -- rate of improvement (delta per week)
  skill_pivot_achieved boolean default false,

  -- Tribe Multiplier: output boost from tribal membership
  solo_output_score numeric default 0,      -- pre-tribe output metric
  tribal_output_score numeric default 0,    -- post-tribe output metric
  tribe_multiplier numeric default 1.0,     -- tribal/solo ratio

  -- Trust & Engagement
  trust_score_current numeric default 0,
  signal_density_score numeric default 0,   -- ratio of implementations vs noise
  judgment_events_count integer default 0,
  streak_days integer default 0,

  -- Sovereignty Progress
  sovereignty_tier text default 'explorer', -- explorer | builder | operator | sovereign
  tools_mastered integer default 0,
  workflows_created integer default 0,
  prompts_published integer default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_kpis_user_period unique (user_id, period_start)
);
create index if not exists platform_kpis_user_idx on platform_kpis(user_id);

-- 2. CAREER FLIGHT SIMULATOR: Predictive obsolescence alerts
create table if not exists public.career_flight_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null,             -- 'obsolescence_warning' | 'opportunity_detected' | 'pivot_recommended' | 'skill_expiring'
  severity text not null default 'info', -- info | warning | critical
  title text not null,
  description text not null,
  affected_skills jsonb default '[]'::jsonb,
  automation_threat_pct numeric,         -- % of current workflow now automatable
  pivot_paths jsonb default '[]'::jsonb,
    -- [{ targetRole, requiredSkills, estimatedPivotWeeks, bridgeCourse, forceMultiplierGain }]
  market_signal jsonb default '{}'::jsonb,
    -- { source, trend, confidence, dataPoints }
  status text default 'active',          -- active | acknowledged | acting | resolved | dismissed
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists career_alerts_user_idx on career_flight_alerts(user_id);
create index if not exists career_alerts_status_idx on career_flight_alerts(status);

-- 3. ANTI-ALGORITHM FEED: Implementation-weighted content scoring
create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  content_type text not null,           -- 'implementation' | 'insight' | 'signal' | 'proof_of_build' | 'prompt_share' | 'verification_result'
  title text not null,
  body text not null,
  implementation_evidence jsonb,         -- { toolUsed, promptChain, timeSaved, errorRate, beforeAfter }
  ai_synthesis jsonb,                    -- { keyTakeaways: [], actionablePrompt: string }

  -- Anti-Algorithm scoring (no likes, only implementations)
  implementation_count integer default 0,  -- how many people installed/used this
  verification_count integer default 0,    -- how many verified the results
  fork_count integer default 0,            -- how many adapted it for their domain
  signal_score numeric default 0,          -- composite: implementations * 10 + verifications * 5 + forks * 8
  noise_penalty numeric default 0,         -- deduction for generic/unverified content

  tags jsonb default '[]'::jsonb,
  is_featured boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists feed_items_signal_idx on feed_items(signal_score desc);
create index if not exists feed_items_tribe_idx on feed_items(tribe_id);
create index if not exists feed_items_type_idx on feed_items(content_type);
create index if not exists feed_items_tags_gin on feed_items using gin (tags jsonb_path_ops);

-- 4. VELOCITY SCORES: API-verified output metrics
create table if not exists public.velocity_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_type text not null,       -- 'github' | 'linear' | 'figma' | 'vercel' | 'manual'
  metric_name text not null,            -- 'commits_per_week' | 'deployments' | 'designs_shipped' | 'tasks_completed'
  metric_value numeric not null,
  human_judgment_ratio numeric,          -- % of decisions made by human vs AI
  measurement_period_days integer default 30,
  verified_at timestamptz not null default now(),
  raw_data jsonb default '{}'::jsonb,
  constraint velocity_scores_unique unique (user_id, integration_type, metric_name)
);
create index if not exists velocity_scores_user_idx on velocity_scores(user_id);

-- 5. RLS
alter table platform_kpis enable row level security;
create policy platform_kpis_owner_rw on platform_kpis for all using (user_id = auth.uid());

alter table career_flight_alerts enable row level security;
create policy career_alerts_owner_rw on career_flight_alerts for all using (user_id = auth.uid());

alter table feed_items enable row level security;
create policy feed_items_read on feed_items for select using (true);
create policy feed_items_author_write on feed_items for insert with check (author_user_id = auth.uid());

alter table velocity_scores enable row level security;
create policy velocity_scores_owner_rw on velocity_scores for all using (user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_platform_kpis_updated_at on platform_kpis;
create trigger set_platform_kpis_updated_at before update on platform_kpis for each row execute function set_updated_at();

-- === 20260324500000_network_intelligence_engine.sql ===
-- =============================================================================
-- Network Intelligence Engine: Super-Connector Tools for 30K+ Networks
-- Active Network Index, Agentic Triage, Skill Heat Maps,
-- Micro-Tribe Segmentation, Human Ranking, Network Wealth
-- =============================================================================

-- 1. ACTIVE NETWORK INDEX: Semantic search over people
-- Enriched profile data with embeddings for "Query My Network"
alter table profiles add column if not exists last_activity_summary text;
alter table profiles add column if not exists activity_velocity numeric default 0;
alter table profiles add column if not exists proof_of_build_count integer default 0;
alter table profiles add column if not exists human_alpha_score numeric default 0;
alter table profiles add column if not exists last_indexed_at timestamptz;
alter table profiles add column if not exists is_between_projects boolean default false;
alter table profiles add column if not exists recent_tools jsonb default '[]'::jsonb;
alter table profiles add column if not exists skill_evolution jsonb default '[]'::jsonb;

create index if not exists profiles_activity_velocity_idx on profiles(activity_velocity desc);
create index if not exists profiles_human_alpha_idx on profiles(human_alpha_score desc);
create index if not exists profiles_recent_tools_gin on profiles using gin (recent_tools jsonb_path_ops);

-- 2. AGENTIC TRIAGE: AI gatekeeper for inbound requests
create table if not exists public.network_triage_rules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  rule_name text not null,
  rule_type text not null,              -- 'auto_respond' | 'require_proof' | 'priority_pass' | 'decline' | 'queue'
  conditions jsonb not null default '{}'::jsonb,
    -- { minTrustScore, requiresProofOfBuild, requiredSkills, fromTribe, hasVerifiedOutput }
  auto_response_template text,          -- template for AI to use when responding
  priority integer default 0,           -- higher = checked first
  is_active boolean default true,
  matches_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists triage_rules_owner_idx on network_triage_rules(owner_user_id);

create table if not exists public.network_triage_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sender_profile_id text,
  sender_name text,
  message_preview text,
  triage_result text not null,          -- 'passed' | 'queued' | 'auto_responded' | 'declined'
  matched_rule_id uuid,
  sender_trust_score numeric,
  sender_proof_of_builds integer,
  ai_reasoning text,
  created_at timestamptz not null default now()
);
create index if not exists triage_log_owner_idx on network_triage_log(owner_user_id);
create index if not exists triage_log_created_idx on network_triage_log(created_at desc);

-- 3. MICRO-TRIBE SEGMENTS: Auto-clustered interest squads
create table if not exists public.network_segments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  segment_name text not null,
  segment_type text default 'auto',     -- 'auto' | 'manual' | 'ai_suggested'
  clustering_basis text,                -- 'recent_tools' | 'skill_evolution' | 'activity_velocity' | 'industry' | 'custom'
  member_profile_ids jsonb not null default '[]'::jsonb,
  member_count integer default 0,
  avg_activity_velocity numeric default 0,
  avg_human_alpha numeric default 0,
  top_skills jsonb default '[]'::jsonb,
  description text,
  last_broadcast_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists network_segments_owner_idx on network_segments(owner_user_id);

-- 4. NETWORK WEALTH: Economic potential of the connection graph
create table if not exists public.network_wealth_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_connections integer default 0,
  active_connections integer default 0,   -- active in last 30 days
  high_agency_count integer default 0,    -- human_alpha_score > 70
  between_projects_count integer default 0,
  combined_proof_of_builds integer default 0,
  estimated_network_value_usd numeric,
  top_segments jsonb default '[]'::jsonb,
  talent_availability jsonb default '{}'::jsonb,
    -- { bySkill: { "AI/ML": 12, "Engineering": 45 }, byAvailability: { available: 15, busy: 200 } }
  deployment_readiness numeric default 0, -- % of network ready for immediate squad formation
  created_at timestamptz not null default now(),
  constraint network_wealth_user_date unique (owner_user_id, snapshot_date)
);
create index if not exists network_wealth_owner_idx on network_wealth_snapshots(owner_user_id);

-- 5. RLS
alter table network_triage_rules enable row level security;
create policy triage_rules_owner_rw on network_triage_rules for all using (owner_user_id = auth.uid());

alter table network_triage_log enable row level security;
create policy triage_log_owner_rw on network_triage_log for all using (owner_user_id = auth.uid());

alter table network_segments enable row level security;
create policy network_segments_owner_rw on network_segments for all using (owner_user_id = auth.uid());

alter table network_wealth_snapshots enable row level security;
create policy network_wealth_owner_rw on network_wealth_snapshots for all using (owner_user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_triage_rules_updated_at on network_triage_rules;
create trigger set_triage_rules_updated_at before update on network_triage_rules for each row execute function set_updated_at();

drop trigger if exists set_network_segments_updated_at on network_segments;
create trigger set_network_segments_updated_at before update on network_segments for each row execute function set_updated_at();

-- === 20260324600000_refund_engine.sql ===
-- =============================================================================
-- Refund Engine: Tariff & Efficiency Reclamation System
-- Cognitive Tariff, SaaS Audit, Network ROI, Trade Rebates, R&D Credits
-- + BAHA Blast (Confidence Reinforcement after Code Red alerts)
-- =============================================================================

-- 1. REFUND DASHBOARD: Aggregated value reclaimed per user
create table if not exists public.refund_dashboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_monetary_refund_usd numeric default 0,
  total_hours_reclaimed numeric default 0,
  total_saas_savings_monthly_usd numeric default 0,
  total_network_signal_gain_pct numeric default 0,
  total_rd_credit_estimate_usd numeric default 0,

  -- Breakdown
  tariff_vat_refund_usd numeric default 0,
  cognitive_tariff_hours numeric default 0,
  saas_redundancy_savings_usd numeric default 0,
  network_noise_reduction_pct numeric default 0,
  rd_innovation_hours numeric default 0,

  -- Engagement
  refunds_deployed_to_projects integer default 0,
  last_audit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. COGNITIVE TARIFF AUDITS: Time-tax tracking per period
create table if not exists public.cognitive_tariff_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_period_start date not null,
  audit_period_end date not null,
  total_work_hours numeric not null,
  search_summarize_hours numeric default 0,    -- the "tariff"
  decision_design_hours numeric default 0,     -- the "value"
  automatable_hours numeric default 0,         -- potential refund
  installed_workflows integer default 0,       -- workflows adopted
  hours_reclaimed numeric default 0,           -- actual hours saved
  top_tariff_tasks jsonb default '[]'::jsonb,
    -- [{ task, hoursSpent, automationPotential, suggestedWorkflow }]
  refund_rate_pct numeric default 0,           -- hours_reclaimed / automatable_hours * 100
  created_at timestamptz not null default now()
);
create index if not exists cognitive_audits_user_idx on cognitive_tariff_audits(user_id);

-- 3. SAAS STACK AUDITS: Redundancy detection
create table if not exists public.saas_stack_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_date date not null default current_date,
  total_monthly_spend_usd numeric default 0,
  redundant_tools jsonb default '[]'::jsonb,
    -- [{ toolName, monthlyCost, category, replacedBy, savingsUsd }]
  optimization_suggestions jsonb default '[]'::jsonb,
    -- [{ action, currentTool, suggestedAlternative, monthlySaving, reason }]
  total_potential_savings_usd numeric default 0,
  created_at timestamptz not null default now()
);
create index if not exists saas_audits_user_idx on saas_stack_audits(user_id);

-- 4. NETWORK ROI: Relationship efficiency analysis
create table if not exists public.network_roi_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_date date not null default current_date,
  total_connections integer default 0,
  zero_signal_count integer default 0,
  high_alpha_count integer default 0,
  signal_to_noise_ratio numeric default 0,
  daily_scroll_minutes_saved numeric default 0,
  engagement_rebate_pct numeric default 0,     -- signal improvement %
  recommendations jsonb default '[]'::jsonb,
    -- [{ action: 'mute'|'engage'|'promote', profileIds, reason, impactEstimate }]
  created_at timestamptz not null default now()
);
create index if not exists network_roi_user_idx on network_roi_audits(user_id);

-- 5. BAHA BLASTS: Confidence reinforcement after Code Red alerts
-- Every disruption alert (Code Red) is followed by a BAHA: Build, Adapt, Harden, Amplify
create table if not exists public.baha_blasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  triggered_by text,                   -- 'career_flight_alert' | 'skill_delta' | 'automation_warning' | 'market_shift'
  trigger_alert_id text,               -- references the Code Red alert
  severity_of_trigger text,            -- 'info' | 'warning' | 'critical'

  -- BAHA Framework
  build_action text not null,          -- "Build X to demonstrate new capability"
  adapt_action text not null,          -- "Adapt your workflow by integrating Y"
  harden_action text not null,         -- "Harden your position by deepening Z"
  amplify_action text not null,        -- "Amplify by sharing results via Signal Feed"

  -- Execution tracking
  build_status text default 'pending',  -- pending | in_progress | completed
  adapt_status text default 'pending',
  harden_status text default 'pending',
  amplify_status text default 'pending',
  overall_confidence_boost numeric default 0,  -- 0-100

  -- Outcome
  completed_at timestamptz,
  outcome_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists baha_blasts_user_idx on baha_blasts(user_id);
create index if not exists baha_blasts_trigger_idx on baha_blasts(triggered_by);

-- 6. RLS
alter table refund_dashboard enable row level security;
create policy refund_dashboard_owner_rw on refund_dashboard for all using (user_id = auth.uid());

alter table cognitive_tariff_audits enable row level security;
create policy cognitive_audits_owner_rw on cognitive_tariff_audits for all using (user_id = auth.uid());

alter table saas_stack_audits enable row level security;
create policy saas_audits_owner_rw on saas_stack_audits for all using (user_id = auth.uid());

alter table network_roi_audits enable row level security;
create policy network_roi_owner_rw on network_roi_audits for all using (user_id = auth.uid());

alter table baha_blasts enable row level security;
create policy baha_blasts_owner_rw on baha_blasts for all using (user_id = auth.uid());

-- 7. Triggers
drop trigger if exists set_refund_dashboard_updated_at on refund_dashboard;
create trigger set_refund_dashboard_updated_at before update on refund_dashboard for each row execute function set_updated_at();

drop trigger if exists set_baha_blasts_updated_at on baha_blasts;
create trigger set_baha_blasts_updated_at before update on baha_blasts for each row execute function set_updated_at();

-- === 20260324700000_cyborg_csuite.sql ===
-- =============================================================================
-- Cyborg C-Suite: AI Autonomous Executive Layer
-- CEO, CFO, CTO, CMO, CCO + Executive Review + Chairman Veto
-- =============================================================================

-- 1. EXECUTIVE BRIEFS: Daily strategic recommendations from AI C-Suite
create table if not exists public.executive_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null default current_date,
  brief_type text not null,             -- 'morning_review' | 'priority_shift' | 'emergency' | 'weekly_synthesis'

  -- CEO: Strategic Paths
  ceo_strategic_paths jsonb not null default '[]'::jsonb,
    -- [{ id, title, description, confidence, riskLevel, estimatedImpact, requiredResources, timelineHours }]
  ceo_priority_ranking jsonb default '[]'::jsonb,
  ceo_resource_allocation jsonb default '{}'::jsonb,

  -- CFO: Financial Intelligence
  cfo_cash_position jsonb default '{}'::jsonb,
  cfo_refunds_found jsonb default '{}'::jsonb,
  cfo_burn_rate_alert text,
  cfo_squad_payments_pending integer default 0,

  -- CTO: Technical Health
  cto_system_health jsonb default '{}'::jsonb,
    -- { uptime, errorRate, deploymentsPending, securityAlerts, complianceStatus }
  cto_auto_fixes_applied integer default 0,
  cto_technical_debt_score numeric default 0,

  -- CMO: Growth & Engagement
  cmo_tribal_growth jsonb default '{}'::jsonb,
  cmo_content_pipeline jsonb default '[]'::jsonb,
  cmo_signal_feed_health jsonb default '{}'::jsonb,

  -- CCO: Trust & Safety
  cco_trust_score_avg numeric default 0,
  cco_bots_flagged integer default 0,
  cco_verification_queue integer default 0,
  cco_community_health text default 'stable',

  -- Chairman Decision
  chairman_decision text,               -- which path was chosen
  chairman_veto_notes text,
  chairman_additions text,              -- human intuition additions
  decided_at timestamptz,

  -- Execution Status
  execution_status text default 'pending', -- pending | decided | executing | completed | vetoed
  execution_log jsonb default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executive_briefs_user_date unique (owner_user_id, brief_date, brief_type)
);
create index if not exists executive_briefs_owner_idx on executive_briefs(owner_user_id);
create index if not exists executive_briefs_date_idx on executive_briefs(brief_date desc);

-- 2. AUTONOMOUS ACTIONS: Log of actions taken by AI C-Suite without human approval
create table if not exists public.csuite_autonomous_actions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  executive text not null,              -- 'ceo' | 'cfo' | 'cto' | 'cmo' | 'cco'
  action_type text not null,            -- 'resource_shift' | 'auto_fix' | 'payment' | 'content_publish' | 'bot_ban' | 'compliance_update'
  description text not null,
  impact_summary text,
  confidence numeric default 0,
  requires_chairman_review boolean default false,
  chairman_approved boolean,
  chairman_reviewed_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists csuite_actions_owner_idx on csuite_autonomous_actions(owner_user_id);
create index if not exists csuite_actions_exec_idx on csuite_autonomous_actions(executive);

-- 3. RLS
alter table executive_briefs enable row level security;
create policy executive_briefs_owner_rw on executive_briefs for all using (owner_user_id = auth.uid());

alter table csuite_autonomous_actions enable row level security;
create policy csuite_actions_owner_rw on csuite_autonomous_actions for all using (owner_user_id = auth.uid());

-- 4. Triggers
drop trigger if exists set_executive_briefs_updated_at on executive_briefs;
create trigger set_executive_briefs_updated_at before update on executive_briefs for each row execute function set_updated_at();

-- === 20260324800000_agent_app_factory.sql ===
-- =============================================================================
-- Agent & App Factory: Industrialized Intelligence Assembly Lines
-- Build pipelines, agent assembly, quality gates, factory metrics
-- =============================================================================

-- 1. FACTORY PIPELINES: Deterministic assembly lines for apps and agents
create table if not exists public.factory_pipelines (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  pipeline_type text not null,          -- 'app_build' | 'agent_build' | 'tool_build' | 'workflow_build'
  name text not null,
  intent text not null,                 -- the original requirement/prompt
  status text default 'queued',         -- queued | station_1 | station_2 | station_3 | quality_check | deployed | failed

  -- Station tracking
  stations jsonb not null default '[]'::jsonb,
    -- [{ stationId, name, role, status: 'pending'|'running'|'completed'|'failed',
    --    agentUsed, input, output, startedAt, completedAt, durationMs }]
  current_station integer default 0,
  total_stations integer default 3,

  -- Quality gates
  quality_score numeric default 0,       -- 0-100
  security_scan_passed boolean,
  compliance_check_passed boolean,
  human_review_required boolean default false,
  human_review_notes text,

  -- Output
  output_type text,                     -- 'deployed_app' | 'agent_definition' | 'api_tool' | 'workflow_template'
  output_url text,                      -- deployment URL or artifact location
  output_artifacts jsonb default '{}'::jsonb,

  -- Factory metrics
  total_duration_ms integer,
  estimated_manual_hours numeric,       -- what this would cost manually
  actual_cost_usd numeric default 0,    -- API/compute costs
  force_multiplier numeric,             -- manual_hours / (duration_ms/3600000)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists factory_pipelines_owner_idx on factory_pipelines(owner_user_id);
create index if not exists factory_pipelines_status_idx on factory_pipelines(status);

-- 2. FACTORY AGENTS: Digital employees assembled by the factory
create table if not exists public.factory_agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  pipeline_id uuid references factory_pipelines(id),
  agent_name text not null,
  agent_role text not null,             -- 'cfO_refund_scanner' | 'k12_tutor' | 'network_analyst' | 'custom'
  backstory text,                       -- agent persona/context
  tools_equipped jsonb default '[]'::jsonb,  -- API connections
  memory_type text default 'vector',    -- 'vector' | 'graph' | 'relational' | 'hybrid'
  memory_config jsonb default '{}'::jsonb,
  capabilities jsonb default '[]'::jsonb,
  constraints jsonb default '[]'::jsonb, -- guardrails
  performance_metrics jsonb default '{}'::jsonb,
    -- { tasksCompleted, avgConfidence, avgResponseMs, errorRate }
  status text default 'draft',          -- draft | testing | active | paused | retired
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists factory_agents_owner_idx on factory_agents(owner_user_id);

-- 3. FACTORY METRICS: Assembly line performance over time
create table if not exists public.factory_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  period_date date not null default current_date,
  apps_built integer default 0,
  agents_assembled integer default 0,
  tools_created integer default 0,
  workflows_shipped integer default 0,
  total_compute_cost_usd numeric default 0,
  total_manual_hours_saved numeric default 0,
  avg_quality_score numeric default 0,
  factory_velocity numeric default 0,    -- builds per day
  self_perpetuating_loops integer default 0, -- tools that generated their own demand
  created_at timestamptz not null default now(),
  constraint factory_metrics_user_date unique (owner_user_id, period_date)
);
create index if not exists factory_metrics_owner_idx on factory_metrics(owner_user_id);

-- 4. RLS
alter table factory_pipelines enable row level security;
create policy factory_pipelines_owner_rw on factory_pipelines for all using (owner_user_id = auth.uid());

alter table factory_agents enable row level security;
create policy factory_agents_owner_rw on factory_agents for all using (owner_user_id = auth.uid());

alter table factory_metrics enable row level security;
create policy factory_metrics_owner_rw on factory_metrics for all using (owner_user_id = auth.uid());

-- 5. Triggers
drop trigger if exists set_factory_pipelines_updated_at on factory_pipelines;
create trigger set_factory_pipelines_updated_at before update on factory_pipelines for each row execute function set_updated_at();

drop trigger if exists set_factory_agents_updated_at on factory_agents;
create trigger set_factory_agents_updated_at before update on factory_agents for each row execute function set_updated_at();

-- === 20260324900000_sovereign_civilization.sql ===
-- =============================================================================
-- Sovereign Civilization: 6 Bespoke Elements
-- Human Alpha Oracle, Shadow Negotiator, Sovereign Sanctuary,
-- Agentic Will, Wetware Lab, The Artifact
-- =============================================================================

-- 1. HUMAN ALPHA ORACLE: Decision log with biometric/logical state capture
create table if not exists public.human_alpha_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_type text not null,          -- 'ai_override' | 'strategic_direction' | 'veto' | 'creative_divergence' | 'ethical_judgment'
  context text not null,                -- what was happening when the decision was made
  ai_recommendation text,               -- what the AI suggested
  human_decision text not null,         -- what the human actually chose
  divergence_reasoning text,            -- WHY the human diverged from AI
  confidence numeric default 0,         -- human's confidence 0-100
  decision_complexity text,             -- 'routine' | 'complex' | 'novel' | 'high_stakes'
  cognitive_state jsonb default '{}'::jsonb,
    -- { hoursWorked, decisionFatigue, focusLevel, lastBreak }
  outcome_tracked boolean default false,
  outcome_result text,                  -- retrospective: was the human right?
  human_alpha_points numeric default 0, -- points earned for this decision
  created_at timestamptz not null default now()
);
create index if not exists alpha_decisions_user_idx on human_alpha_decisions(user_id);
create index if not exists alpha_decisions_type_idx on human_alpha_decisions(decision_type);

-- 2. SHADOW NEGOTIATOR: Real-time meeting intelligence logs
create table if not exists public.negotiation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null,           -- 'zoom_call' | 'in_person' | 'email_thread' | 'async_negotiation'
  counterparty text,
  context text not null,
  insights_generated jsonb not null default '[]'::jsonb,
    -- [{ timestamp, type: 'contradiction'|'sentiment_shift'|'leverage_point'|'risk_signal', insight, confidence, suggestedAction }]
  key_leverage_points jsonb default '[]'::jsonb,
  sentiment_trajectory jsonb default '[]'::jsonb,
    -- [{ timestamp, sentiment: -1 to 1, topic }]
  outcome text,                         -- 'deal_closed' | 'continued' | 'walked_away' | 'deferred'
  outcome_value_usd numeric,
  human_decisions_made integer default 0,
  ai_whispers_used integer default 0,
  duration_minutes integer,
  created_at timestamptz not null default now()
);
create index if not exists negotiation_user_idx on negotiation_sessions(user_id);

-- 3. SOVEREIGN SANCTUARY: Concentration mode and commander's briefing
create table if not exists public.sanctuary_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,                   -- 'deep_work' | 'creative_flow' | 'strategic_planning' | 'recovery'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer,
  notifications_silenced integer default 0,
  tribal_signals_passed integer default 0, -- only high-signal data got through
  commanders_briefing jsonb,
    -- { totalDMs, actionableDMs, synthesizedBriefing, criticalAlerts }
  focus_score numeric default 0,         -- 0-100, self-reported or tracked
  output_during_session text,           -- what was accomplished
  created_at timestamptz not null default now()
);
create index if not exists sanctuary_user_idx on sanctuary_sessions(user_id);

-- 4. AGENTIC WILL: Legacy protocol and succession planning
create table if not exists public.agentic_wills (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legacy_agent_id uuid,                 -- the trained legacy agent
  succession_type text default 'tribal_transition', -- 'tribal_transition' | 'heir_transfer' | 'foundation' | 'archive'
  heir_user_ids jsonb default '[]'::jsonb,
  tribal_beneficiaries jsonb default '[]'::jsonb,
  decision_history_trained boolean default false,
  training_data_years numeric default 0,
  activation_trigger text default 'inactivity_90_days',
  legacy_mode_config jsonb default '{}'::jsonb,
    -- { autoRunWorkflows, maintainTribes, publishScheduled, budgetLimit }
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 5. WETWARE PERFORMANCE LAB: Biological optimization tracking
create table if not exists public.wetware_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  screen_hours numeric default 0,
  decision_quality_score numeric,        -- tracked via outcome correlation
  biological_tariff jsonb default '{}'::jsonb,
    -- { screenTimeTariff, sleepDebt, movementDeficit, hydrationGap }
  performance_windows jsonb default '[]'::jsonb,
    -- [{ startHour, endHour, qualityScore, taskType }]
  ai_handoff_triggered boolean default false, -- CEO took over when human flagged
  reset_activities jsonb default '[]'::jsonb,
    -- [{ activity, duration, recoveryScore }]
  recommendations jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint wetware_user_date unique (user_id, session_date)
);
create index if not exists wetware_user_idx on wetware_sessions(user_id);

-- 6. THE ARTIFACT: Physical tribal key registry
create table if not exists public.artifact_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text default 'sovereign_stone', -- 'sovereign_stone' | 'tribal_ring' | 'founder_key'
  public_key text not null,             -- NFC/crypto public key
  trust_handshakes integer default 0,   -- how many peer handshakes completed
  last_handshake_at timestamptz,
  verified_encounters jsonb default '[]'::jsonb,
    -- [{ withUserId, location, timestamp, mutualTrustVerified }]
  artifact_status text default 'active', -- active | lost | replaced | decommissioned
  issued_at timestamptz not null default now(),
  constraint artifact_user_unique unique (user_id, artifact_type)
);
create index if not exists artifact_user_idx on artifact_registry(user_id);

-- 7. RLS
alter table human_alpha_decisions enable row level security;
create policy alpha_decisions_owner_rw on human_alpha_decisions for all using (user_id = auth.uid());

alter table negotiation_sessions enable row level security;
create policy negotiation_owner_rw on negotiation_sessions for all using (user_id = auth.uid());

alter table sanctuary_sessions enable row level security;
create policy sanctuary_owner_rw on sanctuary_sessions for all using (user_id = auth.uid());

alter table agentic_wills enable row level security;
create policy agentic_wills_owner_rw on agentic_wills for all using (user_id = auth.uid());

alter table wetware_sessions enable row level security;
create policy wetware_owner_rw on wetware_sessions for all using (user_id = auth.uid());

alter table artifact_registry enable row level security;
create policy artifact_owner_rw on artifact_registry for all using (user_id = auth.uid());

-- === 20260325000000_agent_lab_persistent_memory.sql ===
-- =============================================================================
-- Agent Lab: Cognitive Particle Accelerator + Persistent Agentic Memory
-- Sandbox, Cognitive Staking, Failure Ledger, Agentic Breeding,
-- Tribal RLHF, Three-Tier Memory Palace, Durable Agent Workflows
-- =============================================================================

-- 1. SANDBOX: Virtual branching environments for risk-free innovation
create table if not exists public.agent_lab_sandboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  forked_from text,                      -- source workflow/agent ID
  status text default 'active',          -- active | paused | completed | archived
  environment_config jsonb default '{}'::jsonb,
    -- { runtime, model, maxTokens, timeoutMs, shadowMode }
  experiment_log jsonb default '[]'::jsonb,
    -- [{ timestamp, action, input, output, latencyMs, tokenCost }]
  results_summary jsonb,
  contributed_to_tribal_graph boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sandbox_user_idx on agent_lab_sandboxes(user_id);

-- 2. COGNITIVE STAKING: Intelligence-as-an-asset marketplace
create table if not exists public.cognitive_stakes (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  stake_type text not null,              -- prompt_chain | agent | workflow | dataset
  title text not null,
  description text not null,
  content jsonb not null,                -- the actual staked logic/prompt
  domain text,                           -- legal | finance | engineering | trades | education
  usage_count integer default 0,
  royalty_earned_usd numeric default 0,
  rating numeric default 0,             -- 0-5 stars from users
  rating_count integer default 0,
  validated_by jsonb default '[]'::jsonb,
  status text default 'active',          -- active | deprecated | under_review
  created_at timestamptz not null default now()
);
create index if not exists stakes_creator_idx on cognitive_stakes(creator_user_id);
create index if not exists stakes_domain_idx on cognitive_stakes(domain);

-- 3. FAILURE LEDGER: Anti-hallucination collective intelligence
create table if not exists public.failure_ledger (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references auth.users(id) on delete cascade,
  agent_type text not null,              -- which agent/tool failed
  failure_type text not null,            -- hallucination | timeout | logic_error | api_failure | moores_block
  prompt_chain text,                     -- the chain that failed
  error_details text not null,
  context jsonb default '{}'::jsonb,     -- domain, model used, input data shape
  error_rate numeric,                    -- measured error rate
  resolution text,                       -- how it was fixed (if fixed)
  severity text default 'medium',        -- low | medium | high | critical
  tribal_alert_sent boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists failure_reporter_idx on failure_ledger(reported_by);
create index if not exists failure_type_idx on failure_ledger(failure_type);

-- 4. AGENTIC BREEDING: Cross-domain hybrid agent creation
create table if not exists public.agentic_breeds (
  id uuid primary key default gen_random_uuid(),
  parent_agent_a text not null,          -- source agent/stake ID
  parent_agent_b text not null,          -- second source
  hybrid_name text not null,
  hybrid_description text not null,
  domain_a text not null,
  domain_b text not null,
  merged_capabilities jsonb not null default '[]'::jsonb,
  performance_score numeric default 0,
  created_by uuid references auth.users(id) on delete set null,
  status text default 'experimental',    -- experimental | validated | production | deprecated
  created_at timestamptz not null default now()
);

-- 5. TRIBAL RLHF: Human feedback grading from elders
create table if not exists public.tribal_rlhf_grades (
  id uuid primary key default gen_random_uuid(),
  grader_user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,             -- agent_output | stake | breed | sandbox_result
  target_id text not null,
  grade text not null,                   -- excellent | good | acceptable | poor | dangerous
  judgment_notes text,
  criteria jsonb default '{}'::jsonb,
    -- { accuracy, creativity, safety, efficiency, humanAlphaPreserved }
  grader_expertise_level text,           -- elder | expert | member | apprentice
  created_at timestamptz not null default now()
);
create index if not exists rlhf_grader_idx on tribal_rlhf_grades(grader_user_id);

-- 6. EPISODIC MEMORY: Agent action diary (Tier 1)
create table if not exists public.agent_episodic_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id text not null,
  action_type text not null,             -- read | write | analyze | decide | create | communicate
  source text,                           -- notion | slack | github | ramp | linkedin | internal
  content_summary text not null,
  full_context jsonb,
  importance_score numeric default 50,   -- 0-100
  ttl_days integer,                      -- auto-expire after N days (parental control)
  created_at timestamptz not null default now()
);
create index if not exists episodic_user_idx on agent_episodic_memory(user_id);
create index if not exists episodic_agent_idx on agent_episodic_memory(agent_id);

-- 7. DURABLE WORKFLOWS: Long-running agent state persistence
create table if not exists public.durable_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_name text not null,
  mission text not null,                 -- the original assignment
  current_step integer default 1,
  total_steps integer,
  step_log jsonb default '[]'::jsonb,
    -- [{ step, status, startedAt, completedAt, output, error }]
  status text default 'running',         -- running | paused | completed | failed | waiting_human
  last_pulse_at timestamptz,             -- last "I'm still alive" check-in
  pulse_interval_hours integer default 4,
  next_action text,                      -- what the agent plans to do next
  parental_guardrails jsonb default '{}'::jsonb,
    -- { memoryRetentionDays, forbiddenSources, budgetLimitUsd }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists durable_user_idx on durable_workflows(user_id);

-- 8. ACCELERATION METRICS: Lab-level KPIs
create table if not exists public.lab_acceleration_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,                  -- daily | weekly | monthly
  period_start date not null,
  cognitive_yield numeric default 0,     -- time_saved / api_cost ratio
  pivot_velocity_days numeric,           -- days to switch trades
  tariff_reduction_rate numeric default 0, -- % of bureaucratic friction automated
  failure_refunds_received integer default 0,
  stakes_published integer default 0,
  stakes_royalties_usd numeric default 0,
  tribal_learning_rate numeric default 1, -- multiplier vs solo learning
  created_at timestamptz not null default now(),
  constraint lab_metrics_unique unique (user_id, period, period_start)
);

-- 9. RLS
alter table agent_lab_sandboxes enable row level security;
create policy sandbox_owner on agent_lab_sandboxes for all using (user_id = auth.uid());

alter table cognitive_stakes enable row level security;
create policy stakes_owner on cognitive_stakes for all using (creator_user_id = auth.uid());

alter table failure_ledger enable row level security;
create policy failure_owner on failure_ledger for all using (reported_by = auth.uid());

alter table tribal_rlhf_grades enable row level security;
create policy rlhf_owner on tribal_rlhf_grades for all using (grader_user_id = auth.uid());

alter table agent_episodic_memory enable row level security;
create policy episodic_owner on agent_episodic_memory for all using (user_id = auth.uid());

alter table durable_workflows enable row level security;
create policy durable_owner on durable_workflows for all using (user_id = auth.uid());

alter table lab_acceleration_metrics enable row level security;
create policy metrics_owner on lab_acceleration_metrics for all using (user_id = auth.uid());

-- === 20260325100000_critical_safeguards.sql ===
-- =============================================================================
-- Critical Safeguards: 6 Failure Point Defenses
-- Liability Firewall, Graceful Degradation, Tribal Missions,
-- Agentic Quarantine, Biological Heartbeat, Primary Source Enforcement
-- =============================================================================

-- 1. LIABILITY FIREWALL: Insurance-as-Code for autonomous agent decisions
create table if not exists public.liability_firewall_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_source text not null,            -- which AI executive triggered this
  action_type text not null,             -- financial_transaction | contract_signing | data_sharing | api_call
  risk_tier text not null,               -- low | medium | high | critical
  estimated_value_usd numeric,
  human_alpha_required boolean default false,
  human_approved boolean,
  approval_timestamp timestamptz,
  insurance_bond_id text,                -- reference to insurance/bond if bonded
  blocked boolean default false,         -- was this action blocked by the firewall?
  block_reason text,
  audit_trail jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists liability_user_idx on liability_firewall_events(user_id);
create index if not exists liability_risk_idx on liability_firewall_events(risk_tier);

-- 2. GRACEFUL DEGRADATION: Multi-cloud failover and sovereign server mirroring
create table if not exists public.sovereign_failover_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_name text not null,            -- notion | ramp | railway | vercel | turbopuffer | supabase
  status text default 'healthy',         -- healthy | degraded | offline | failover_active
  last_health_check timestamptz default now(),
  failover_target text,                  -- local_server | backup_cloud | cold_storage
  local_mirror_status text default 'not_configured', -- synced | stale | not_configured
  last_sync_at timestamptz,
  data_freshness_hours numeric,
  recovery_plan jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint failover_unique unique (user_id, service_name)
);

-- 3. TRIBAL MISSIONS: Shared multi-agent missions preventing fragmentation
create table if not exists public.tribal_missions (
  id uuid primary key default gen_random_uuid(),
  tribe_id text,
  mission_name text not null,
  objective text not null,               -- the Moore's Block to solve
  required_participants integer default 10,
  current_participants integer default 0,
  participant_ids jsonb default '[]'::jsonb,
  pooled_agent_count integer default 0,
  status text default 'recruiting',      -- recruiting | active | completed | failed
  difficulty text default 'hard',        -- moderate | hard | legendary
  reward_type text default 'cognitive_royalty', -- cognitive_royalty | tribal_honor | skill_unlock
  outcomes jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. AGENTIC QUARANTINE: Adversarial testing before shared lab acceptance
create table if not exists public.agentic_quarantine (
  id uuid primary key default gen_random_uuid(),
  stake_id text not null,                -- cognitive stake being quarantined
  submitted_by uuid references auth.users(id) on delete set null,
  quarantine_status text default 'pending', -- pending | testing | passed | failed | banned
  adversarial_tests_run integer default 0,
  vulnerabilities_found jsonb default '[]'::jsonb,
    -- [{ type, severity, description, apiCallAttempted }]
  hidden_intent_detected boolean default false,
  unauthorized_api_calls jsonb default '[]'::jsonb,
  data_exfiltration_attempt boolean default false,
  bias_score numeric default 0,          -- 0-100, higher = more biased
  reviewer_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  quarantine_started_at timestamptz default now(),
  quarantine_ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quarantine_status_idx on agentic_quarantine(quarantine_status);

-- 5. BIOLOGICAL HEARTBEAT: Dead-man's switch for incapacitation detection
create table if not exists public.biological_heartbeat (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_biological_signal timestamptz default now(),
  signal_source text default 'manual_checkin', -- artifact_nfc | wearable | manual_checkin | app_activity
  consecutive_missed_hours numeric default 0,
  stewardship_mode_active boolean default false,
  stewardship_triggered_at timestamptz,
  stewardship_notified_elders jsonb default '[]'::jsonb,
  frozen_actions jsonb default '[]'::jsonb, -- high-risk actions frozen during stewardship
  wellness_check_requested boolean default false,
  wellness_check_responded boolean default false,
  threshold_hours integer default 48,    -- hours before stewardship activates
  updated_at timestamptz default now()
);

-- 6. PRIMARY SOURCE REGISTRY: First-principles data enforcement
create table if not exists public.primary_source_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,             -- interview | handwritten_note | physical_experiment | field_observation | original_research
  title text not null,
  description text not null,
  raw_data_reference text,               -- file path, URL, or physical location
  domain text,
  verified_non_digital boolean default true, -- confirms this is NOT AI-generated
  contributed_to_tribal_graph boolean default false,
  craftsman_reward_points integer default 10,
  created_at timestamptz not null default now()
);
create index if not exists primary_source_user_idx on primary_source_registry(user_id);

-- 7. RLS
alter table liability_firewall_events enable row level security;
create policy liability_owner on liability_firewall_events for all using (user_id = auth.uid());

alter table sovereign_failover_state enable row level security;
create policy failover_owner on sovereign_failover_state for all using (user_id = auth.uid());

alter table biological_heartbeat enable row level security;
create policy heartbeat_owner on biological_heartbeat for all using (user_id = auth.uid());

alter table primary_source_registry enable row level security;
create policy primary_source_owner on primary_source_registry for all using (user_id = auth.uid());

-- === 20260325200000_mitre_immune_system.sql ===
-- =============================================================================
-- MITRE ATT&CK Immune System: Automated Defensive Architecture
-- Agentic Red Team, Tribal Herd Immunity, Deterministic Hardening
-- =============================================================================

-- 1. MITRE TTP REGISTRY: Known tactics/techniques/procedures mapped to defenses
create table if not exists public.mitre_ttp_registry (
  id text primary key,                   -- MITRE ID e.g. T1566, T1021
  tactic text not null,                  -- reconnaissance | initial_access | execution | persistence | etc
  technique text not null,
  subtechnique text,
  description text not null,
  risk_score numeric default 50,         -- 0-100 platform-specific risk
  automated_defense_status text default 'none', -- none | partial | full
  counter_agent_id text,                 -- agent built to counter this TTP
  last_seen_in_tribe timestamptz,
  tribal_incident_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. RED TEAM EXERCISES: Adversary agent simulations against our own systems
create table if not exists public.red_team_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  target_system text not null,           -- sovereign_sanctuary | agent_lab | api_layer | data_store
  ttps_tested jsonb not null default '[]'::jsonb,  -- MITRE IDs tested
  findings jsonb default '[]'::jsonb,
    -- [{ ttpId, result: 'blocked'|'detected'|'bypassed', details, severity }]
  overall_score numeric,                 -- 0-100 defense score
  counter_agents_deployed jsonb default '[]'::jsonb,
  status text default 'running',         -- running | completed | aborted
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists red_team_user_idx on red_team_exercises(user_id);

-- 3. TRIBAL THREAT INTEL: Anonymized threat sharing across 30K network
create table if not exists public.tribal_threat_intel (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid references auth.users(id) on delete set null,
  mitre_ttp_id text,
  threat_type text not null,             -- known_ttp | zero_day | anomaly | social_engineering
  behavior_signature jsonb not null,     -- anonymized behavioral pattern
  severity text default 'medium',
  tribal_alert_count integer default 0,  -- how many tribe members received this
  counter_measure text,                  -- recommended defense
  human_alpha_required boolean default false, -- true for zero-days needing human judgment
  created_at timestamptz not null default now()
);
create index if not exists threat_ttp_idx on tribal_threat_intel(mitre_ttp_id);

-- 4. DEFENSE POSTURE: Live security state per user
create table if not exists public.defense_posture (
  user_id uuid primary key references auth.users(id) on delete cascade,
  overall_score numeric default 50,      -- 0-100
  ttps_covered integer default 0,
  ttps_total integer default 200,
  last_red_team_at timestamptz,
  last_threat_intel_at timestamptz,
  auto_hardened_count integer default 0,
  manual_review_pending integer default 0,
  herd_immunity_active boolean default true,
  updated_at timestamptz default now()
);

-- 5. RLS
alter table red_team_exercises enable row level security;
create policy red_team_owner on red_team_exercises for all using (user_id = auth.uid());

alter table defense_posture enable row level security;
create policy posture_owner on defense_posture for all using (user_id = auth.uid());

-- === 20260325300000_sovereign_civilization_final.sql ===
-- =============================================================================
-- Sovereign Civilization Final: TEACHER Codex, Hard-Tech Awakening,
-- Xenobots / Biological Sovereignty, AI Moment Wave Tracker
-- =============================================================================

-- 1. TEACHER CLASSROOMS: AI Chief of Staff for educators
create table if not exists public.teacher_classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  classroom_name text not null,
  student_count integer default 0,
  ai_chief_of_staff_config jsonb default '{}'::jsonb,
    -- { model, autoGrading, pathOptimization, reportFrequency }
  learning_paths_active integer default 0,
  passion_domains_detected jsonb default '[]'::jsonb,
  cognitive_refund_hours numeric default 0,
  parental_bios_config jsonb default '{}'::jsonb,
    -- { ethicsLevel, contentFilters, communityOverrides, forbiddenTopics }
  edge_inference_enabled boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teacher_user_idx on teacher_classrooms(teacher_user_id);

-- 2. TEACHER STUDENT PROFILES: Persistent memory palace per learner
create table if not exists public.teacher_student_profiles (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references teacher_classrooms(id) on delete cascade,
  student_alias text not null,
  human_alpha_identified text,
  passion_domain text,
  learning_style text,                   -- visual | auditory | kinesthetic | reading | multimodal
  memory_palace jsonb default '{}'::jsonb,
    -- { yearlySnapshots: [{ age, breakthroughs, struggles, styleShifts }] }
  proof_of_builds jsonb default '[]'::jsonb,
  trade_path text,                       -- agentic_orchestrator | hybrid_artisan | sovereign_entrepreneur | silicon_collar | bio_architect
  sovereignty_readiness numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_classroom_idx on teacher_student_profiles(classroom_id);

-- 3. HARD-TECH REGISTRY: Silicon Valley awakening milestones
create table if not exists public.hardtech_registry (
  id uuid primary key default gen_random_uuid(),
  tech_domain text not null,             -- lithography | quantum | photonics | xenobots
  milestone_name text not null,
  description text not null,
  impact_on_energy_tariff numeric default 0,
  impact_on_cognitive_yield numeric default 1,
  silicon_lineage jsonb default '{}'::jsonb,
    -- { fab, node_nm, chip_family, euv_generation }
  available_via text,                    -- lambda | qiskit | local_edge | photonic_dc
  announced_at date,
  created_at timestamptz not null default now()
);
create index if not exists hardtech_domain_idx on hardtech_registry(tech_domain);

-- 4. XENOBOT DEPLOYMENTS: Biological agent tracking
create table if not exists public.xenobot_deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_name text not null,
  target_environment text not null,
  deployment_type text not null,         -- environmental | medical | agricultural | research
  cell_count integer default 3000,
  self_destruct_timer_days integer default 7,
  status text default 'designing',       -- designing | culturing | deployed | active | self_destructed
  outcomes jsonb,
  bio_ethics_cleared boolean default false,
  tribal_blueprint_staked boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists xenobot_user_idx on xenobot_deployments(user_id);

-- 5. SOVEREIGN WAVE TRACKER: AI Moment timeline per user
create table if not exists public.sovereign_wave_tracker (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_wave integer default 2,        -- 1=Mirror, 2=Agentic, 3=Sovereign
  wave1_milestones jsonb default '{"chatUsed":true,"searchReplaced":false}'::jsonb,
  wave2_milestones jsonb default '{"agentDeployed":false,"mooresBlockSmashed":false,"tariffRefundClaimed":false,"durableWorkflowLaunched":false}'::jsonb,
  wave3_milestones jsonb default '{"edgeInferenceActive":false,"tribalMissionCompleted":false,"xenobotDeployed":false,"quantumOracleUsed":false,"sovereignArtifactOwned":false}'::jsonb,
  economic_refund_total_usd numeric default 0,
  cognitive_refund_hours numeric default 0,
  agency_score numeric default 0,
  sovereignty_percentage numeric default 0,
  updated_at timestamptz default now()
);

-- 6. RLS
alter table teacher_classrooms enable row level security;
create policy teacher_owner on teacher_classrooms for all using (teacher_user_id = auth.uid());

alter table teacher_student_profiles enable row level security;
create policy student_via_teacher on teacher_student_profiles for all
  using (classroom_id in (select id from teacher_classrooms where teacher_user_id = auth.uid()));

alter table xenobot_deployments enable row level security;
create policy xenobot_owner on xenobot_deployments for all using (user_id = auth.uid());

alter table sovereign_wave_tracker enable row level security;
create policy wave_owner on sovereign_wave_tracker for all using (user_id = auth.uid());

-- === 20260325400000_token_economy_lunar_infrastructure.sql ===
-- =============================================================================
-- Agentic Token Economy + Lunar/Petawatt Infrastructure
-- Compute-as-Equity, Tribal Compute Pools, Lunar Forge, Orbital Assets
-- =============================================================================

-- 1. AGENTIC TOKEN LEDGER: Compute-as-equity tracking
create table if not exists public.agentic_token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_type text not null,              -- compute_credit | cognitive_royalty | tribal_pool | lunar_compute
  amount numeric not null,
  direction text not null,               -- earned | spent | staked | pooled | refunded
  source text,                           -- agent_lab | cognitive_stake | tribal_mission | nvidia_grant | lunar_forge
  description text,
  balance_after numeric,
  created_at timestamptz not null default now()
);
create index if not exists token_user_idx on agentic_token_ledger(user_id);

-- 2. TRIBAL COMPUTE POOLS: Shared compute across 30K network
create table if not exists public.tribal_compute_pools (
  id uuid primary key default gen_random_uuid(),
  pool_name text not null,
  tribe_id text,
  contributor_count integer default 0,
  total_tokens numeric default 0,
  allocated_to text,                     -- mission_id or project description
  infrastructure text default 'cloud',   -- cloud | edge | lunar | photonic
  status text default 'active',          -- active | depleted | archived
  created_at timestamptz not null default now()
);

-- 3. LUNAR INFRASTRUCTURE: Orbital and lunar asset tracking
create table if not exists public.lunar_infrastructure (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null,              -- mass_driver | vacuum_fab | petawatt_node | tribal_satellite | compute_relay
  asset_name text not null,
  location text not null,                -- lunar_surface | earth_orbit | lagrange_point | deep_space
  operational_status text default 'planned', -- planned | under_construction | operational | decommissioned
  compute_capacity_pflops numeric,
  energy_source text,                    -- solar | nuclear | electromagnetic
  gravity_tariff_savings_pct numeric,
  thermal_tariff_savings_pct numeric,
  owned_by text default 'tribal_collective',
  created_at timestamptz not null default now()
);

-- 4. RLS
alter table agentic_token_ledger enable row level security;
create policy token_owner on agentic_token_ledger for all using (user_id = auth.uid());

-- === 20260325500000_decadal_timeline_orbital_pharma.sql ===
-- =============================================================================
-- Decadal Timeline Milestones + Orbital Pharmaceutical Manufacturing
-- Phase tracking, Orbital Neo Labs, Tribal Pharma, Bio-Sovereignty
-- =============================================================================

-- 1. DECADAL MILESTONES: 2026-2036 timeline tracking per user
create table if not exists public.decadal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase integer not null,                -- 1=Decoupling, 2=Tribal Industrial, 3=Hard-Tech, 4=Post-Gravity
  phase_name text not null,
  milestone_key text not null,
  milestone_description text not null,
  status text default 'pending',         -- pending | in_progress | completed | skipped
  target_date date,
  completed_at timestamptz,
  refund_type text,                      -- labor | capital | energy_health | space_compute
  refund_value text,                     -- "20h/week" | "30% cost reduction" | etc
  created_at timestamptz not null default now(),
  constraint milestone_unique unique (user_id, phase, milestone_key)
);
create index if not exists milestone_user_idx on decadal_milestones(user_id);
create index if not exists milestone_phase_idx on decadal_milestones(phase);

-- 2. ORBITAL NEO LABS: Space-based manufacturing capsules
create table if not exists public.orbital_neo_labs (
  id uuid primary key default gen_random_uuid(),
  lab_name text not null,
  lab_type text not null,                -- pharma_crystallization | protein_folding | material_science | xenobot_culture
  orbit_type text default 'LEO',         -- LEO | GEO | lunar_orbit | deep_space
  operational_status text default 'planned',
  capsule_provider text,                 -- varda | spacex | tribal_collective
  launch_vehicle text,
  microgravity_quality numeric,          -- 0-100 purity score
  current_batch text,
  batch_status text,                     -- loading | in_orbit | crystallizing | reentry | delivered
  owned_by text default 'tribal_collective',
  created_at timestamptz not null default now()
);

-- 3. TRIBAL PHARMA MISSIONS: Collective drug manufacturing staking
create table if not exists public.tribal_pharma_missions (
  id uuid primary key default gen_random_uuid(),
  mission_name text not null,
  target_compound text not null,         -- what's being manufactured
  compound_type text not null,           -- cancer_protein | insulin | supplement | vaccine | custom
  stakers_count integer default 0,
  total_staked_usd numeric default 0,
  orbital_lab_id uuid references orbital_neo_labs(id),
  manufacturing_status text default 'staking', -- staking | funded | launched | crystallizing | reentry | distributed
  purity_score numeric,                  -- space-made purity vs earth baseline
  potency_multiplier numeric default 1,  -- how much more effective vs earth-made
  cost_reduction_pct numeric,            -- savings vs big pharma
  doses_produced integer,
  distributed_to_tribe boolean default false,
  created_at timestamptz not null default now()
);

-- 4. RLS
alter table decadal_milestones enable row level security;
create policy milestone_owner on decadal_milestones for all using (user_id = auth.uid());

-- === 20260325600000_energy_spatial_sovereignty.sql ===
-- =============================================================================
-- Energy Sovereignty (One-Charge) + Spatial Sovereignty (Autonomous Vehicles)
-- Nuclear Diamond Batteries, Sovereign Fleets, Mobile Neo Labs
-- =============================================================================

-- 1. ONE-CHARGE DEVICES: Atomic/solid-state battery asset tracking
create table if not exists public.one_charge_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_type text not null,             -- artifact | phone | home_storage | vehicle | compute_node | satellite
  device_name text not null,
  battery_tech text not null,            -- nuclear_diamond | solid_state | graphene | hybrid
  capacity_wh numeric,
  lifespan_years numeric default 20,
  current_health_pct numeric default 100,
  years_remaining numeric,
  always_on_ai_enabled boolean default false,
  energy_staked_to_tribe numeric default 0,
  sovereign_pulse_active boolean default false, -- for artifact heartbeat
  created_at timestamptz not null default now()
);
create index if not exists one_charge_user_idx on one_charge_devices(user_id);

-- 2. TRIBAL ENERGY LEDGER: Decentralized energy trading
create table if not exists public.tribal_energy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null,               -- staked | consumed | traded | donated
  amount_kwh numeric not null,
  counterparty text,                     -- tribe_pool | lunar_forge | orbital_lab | member_id
  settlement_method text default 'agentic_tokens',
  token_value numeric,
  created_at timestamptz not null default now()
);
create index if not exists energy_user_idx on tribal_energy_ledger(user_id);

-- 3. SOVEREIGN VEHICLES: Autonomous fleet tracking
create table if not exists public.sovereign_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_name text not null,
  vehicle_type text default 'sedan',     -- sedan | suv | van | truck | pod | delivery_drone
  powertrain text default 'one_charge',  -- one_charge | solid_state | ev_standard
  autonomy_level integer default 5,      -- SAE 0-5
  lifespan_years numeric default 20,
  xenobot_self_healing boolean default false,
  fleet_available boolean default false,  -- available for tribal leasing
  fleet_earnings_usd numeric default 0,
  artifact_key_required boolean default true,
  fortress_mode_enabled boolean default true,
  mobile_neo_lab_active boolean default false,
  driving_hours_reclaimed numeric default 0,
  created_at timestamptz not null default now()
);
create index if not exists vehicle_owner_idx on sovereign_vehicles(owner_user_id);

-- 4. FLEET SESSIONS: Tribal mobility mesh usage
create table if not exists public.fleet_sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references sovereign_vehicles(id) on delete cascade,
  rider_user_id uuid not null references auth.users(id) on delete cascade,
  artifact_verified boolean default false,
  human_alpha_score_required numeric default 50,
  route_type text default 'optimized',   -- optimized | high_signal | scenic | tribal_hub
  duration_minutes integer,
  deep_work_minutes integer default 0,
  settlement_tokens numeric,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- 5. RLS
alter table one_charge_devices enable row level security;
create policy charge_owner on one_charge_devices for all using (user_id = auth.uid());

alter table tribal_energy_ledger enable row level security;
create policy energy_owner on tribal_energy_ledger for all using (user_id = auth.uid());

alter table sovereign_vehicles enable row level security;
create policy vehicle_owner on sovereign_vehicles for all using (owner_user_id = auth.uid());

-- === 20260325700000_legal_sovereign.sql ===
-- =============================================================================
-- Legal Sovereign Module: The Harvey/Legora Killer
-- Sovereign Legal Stacks, Client Trust Portals, Dependency Audits
-- =============================================================================

-- 1. SOVEREIGN LEGAL STACKS: Pre-configured agent factory for law firms
create table if not exists public.sovereign_legal_stacks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  stack_name text not null,
  firm_name text,
  stack_type text not null,              -- due_diligence | contract_synthesis | judgment_modeling | litigation_strategy | full_sovereign
  model_provider text default 'local_slm', -- local_slm | claude | gpt4 | gemini
  persistent_memory_location text default 'sovereign', -- sovereign | cloud | hybrid
  agent_count integer default 0,
  cases_processed integer default 0,
  dependency_score numeric default 0,     -- 0=fully sovereign, 100=fully dependent on third party
  monthly_savings_usd numeric default 0,
  status text default 'provisioning',     -- provisioning | active | migrating | archived
  created_at timestamptz not null default now()
);
create index if not exists legal_stack_owner_idx on sovereign_legal_stacks(owner_user_id);

-- 2. CLIENT TRUST PORTALS: Verified Proof of Human Judgment sharing
create table if not exists public.client_trust_portals (
  id uuid primary key default gen_random_uuid(),
  firm_user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  portal_type text default 'judgment_verified', -- judgment_verified | full_transparency | read_only
  matters jsonb default '[]'::jsonb,
    -- [{ matterId, title, humanJudgmentScore, aiExecutionPct, verifiedAt }]
  human_judgment_certificates integer default 0,
  ai_execution_percentage numeric default 0,
  artifact_handshake_required boolean default true,
  portal_status text default 'active',
  created_at timestamptz not null default now()
);
create index if not exists trust_portal_firm_idx on client_trust_portals(firm_user_id);

-- 3. LEGAL DEPENDENCY AUDITS: Harvey/Legora migration planning
create table if not exists public.legal_dependency_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_name text not null,           -- harvey | legora | casetext | westlaw | lexisnexis | custom
  annual_cost_usd numeric not null,
  data_lock_in_risk text,                -- low | medium | high | critical
  migration_complexity text,             -- simple | moderate | complex
  sovereign_alternative text,            -- what to replace it with
  estimated_migration_days integer,
  annual_savings_usd numeric,
  intelligence_tax_pct numeric,          -- % of value extracted by the platform
  audit_status text default 'pending',   -- pending | completed | action_taken
  created_at timestamptz not null default now()
);
create index if not exists legal_audit_user_idx on legal_dependency_audits(user_id);

-- 4. RLS
alter table sovereign_legal_stacks enable row level security;
create policy legal_stack_owner on sovereign_legal_stacks for all using (owner_user_id = auth.uid());

alter table client_trust_portals enable row level security;
create policy trust_portal_owner on client_trust_portals for all using (firm_user_id = auth.uid());

alter table legal_dependency_audits enable row level security;
create policy legal_audit_owner on legal_dependency_audits for all using (user_id = auth.uid());

-- === 20260326000000_liquid_governance.sql ===
-- =============================================================================
-- Liquid Governance Protocol: Tribal Consensus via Weighted Liquid Democracy
-- Voting power weighted by Human Alpha + Trust Score + Proof of Build
-- Delegation chains with domain specificity and cycle prevention
-- =============================================================================

-- 1. GOVERNANCE PROPOSALS: The core proposal entity
create table if not exists public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  tribe_id text not null,
  proposer_user_id uuid not null references auth.users(id) on delete cascade,
  proposal_type text not null default 'custom',
    -- 'pivot' | 'policy_change' | 'resource_allocation' | 'member_action' | 'custom'
  title text not null,
  description text not null,
  evidence_ids jsonb default '[]'::jsonb,
    -- links to proof_of_build entries, judgment_ledger entries, etc.
  quorum_threshold numeric not null default 0.5,
    -- fraction of eligible voters (by power) that must participate
  approval_threshold numeric not null default 0.6,
    -- fraction of cast power that must approve
  status text not null default 'draft',
    -- 'draft' | 'open' | 'voting' | 'passed' | 'rejected' | 'executed' | 'expired'
  execution_payload jsonb,
    -- what happens if passed (e.g. { action: 'allocate_tokens', amount: 500, target: 'project_xyz' })
  vote_summary jsonb default '{}'::jsonb,
    -- materialized: { totalPower, approvePower, rejectPower, abstainPower, voterCount }
  expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gov_proposals_tribe_status_idx on governance_proposals(tribe_id, status);
create index if not exists gov_proposals_proposer_idx on governance_proposals(proposer_user_id);

alter table public.governance_proposals enable row level security;
create policy "Users can read proposals for their tribes" on governance_proposals
  for select using (true);
create policy "Users can insert proposals" on governance_proposals
  for insert with check (auth.uid() = proposer_user_id);
create policy "Proposers can update drafts" on governance_proposals
  for update using (auth.uid() = proposer_user_id and status = 'draft');

-- 2. GOVERNANCE VOTES: Individual weighted votes
create table if not exists public.governance_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references governance_proposals(id) on delete cascade,
  voter_user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null,
    -- 'approve' | 'reject' | 'abstain'
  voting_power numeric not null default 1.0,
    -- computed at vote time from trust_score + human_alpha + proof_of_build
  delegation_from_user_id uuid references auth.users(id),
    -- set if voting on behalf of a delegator
  reasoning text,
  created_at timestamptz not null default now(),
  constraint gov_votes_unique unique (proposal_id, voter_user_id)
);
create index if not exists gov_votes_proposal_idx on governance_votes(proposal_id);
create index if not exists gov_votes_voter_idx on governance_votes(voter_user_id);

alter table public.governance_votes enable row level security;
create policy "Users can read votes on proposals" on governance_votes
  for select using (true);
create policy "Users can cast their own votes" on governance_votes
  for insert with check (auth.uid() = voter_user_id);

-- 3. GOVERNANCE DELEGATIONS: Liquid democracy delegation chains
create table if not exists public.governance_delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_user_id uuid not null references auth.users(id) on delete cascade,
  delegate_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text not null,
  domain text not null default 'all',
    -- 'all' | 'technical' | 'financial' | 'operational'
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint gov_delegations_no_self check (delegator_user_id != delegate_user_id)
);
create unique index if not exists gov_delegations_active_unique on governance_delegations(delegator_user_id, tribe_id, domain) where (is_active = true);
create index if not exists gov_delegations_delegate_idx on governance_delegations(delegate_user_id, tribe_id);
create index if not exists gov_delegations_delegator_idx on governance_delegations(delegator_user_id);

alter table public.governance_delegations enable row level security;
create policy "Users can read delegations in their tribes" on governance_delegations
  for select using (true);
create policy "Users can manage their own delegations" on governance_delegations
  for all using (auth.uid() = delegator_user_id);

-- 4. GOVERNANCE EXECUTION LOG: Audit trail of executed proposals
create table if not exists public.governance_execution_log (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references governance_proposals(id) on delete cascade,
  executed_by text not null default 'system',
    -- 'system' | 'ceo_agent' | 'manual'
  execution_result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists gov_exec_log_proposal_idx on governance_execution_log(proposal_id);

alter table public.governance_execution_log enable row level security;
create policy "Users can read execution logs" on governance_execution_log
  for select using (true);

-- 5. COMPUTE VOTING POWER: Weighted composite of trust + alpha + build
create or replace function public.compute_voting_power(
  p_user_id uuid,
  p_tribe_id text
) returns numeric
language plpgsql security definer stable
as $$
declare
  v_trust_score numeric := 0;
  v_alpha_points numeric := 0;
  v_build_count numeric := 0;
  v_power numeric;
begin
  -- Trust score component (0-100, from trust_scores table)
  select coalesce(decision_layer_score, 0) into v_trust_score
    from trust_scores where user_id = p_user_id
    limit 1;

  -- Human Alpha component (sum of alpha points from decisions)
  select coalesce(sum(human_alpha_points), 0) into v_alpha_points
    from human_alpha_decisions where user_id = p_user_id;

  -- Proof of Build component (count of verified velocity scores)
  select coalesce(count(*), 0) into v_build_count
    from velocity_scores where user_id = p_user_id and verified_at is not null;

  -- Weighted composite: 40% trust + 35% alpha (normalized to 100) + 25% builds (capped at 50)
  v_power := (v_trust_score * 0.4)
           + (least(v_alpha_points, 100) * 0.35)
           + (least(v_build_count * 2, 50) * 0.25);

  -- Minimum voting power of 1 for any authenticated user
  return greatest(v_power, 1.0);
end;
$$;

-- 6. RESOLVE DELEGATION CHAIN: Walk chain with cycle detection (max depth 5)
create or replace function public.resolve_delegation_chain(
  p_user_id uuid,
  p_tribe_id text,
  p_domain text default 'all'
) returns uuid
language plpgsql security definer stable
as $$
declare
  v_current uuid := p_user_id;
  v_next uuid;
  v_depth integer := 0;
  v_visited uuid[] := array[p_user_id];
begin
  loop
    select delegate_user_id into v_next
      from governance_delegations
      where delegator_user_id = v_current
        and tribe_id = p_tribe_id
        and (domain = p_domain or domain = 'all')
        and is_active = true
      limit 1;

    -- No delegation found, current user is the final voter
    if v_next is null then
      return v_current;
    end if;

    v_depth := v_depth + 1;

    -- Max depth protection
    if v_depth >= 5 then
      return v_current;
    end if;

    -- Cycle detection
    if v_next = any(v_visited) then
      return v_current;
    end if;

    v_visited := array_append(v_visited, v_next);
    v_current := v_next;
  end loop;
end;
$$;

-- === 20260326100000_labor_of_love_marketplace.sql ===
-- =============================================================================
-- Labor of Love Marketplace: Non-Scalable Human Experiences
-- Post-work economy where success = Fulfillment Yield, not Profit
-- =============================================================================

-- 1. MARKETPLACE LISTINGS: Offerings of non-scalable human experiences
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  listing_type text not null default 'custom',
    -- 'philosophy_session' | 'handcrafted_art' | 'physical_mentorship' |
    -- 'live_performance' | 'culinary_experience' | 'custom'
  title text not null,
  description text not null,
  delivery_method text not null default 'video_call',
    -- 'in_person' | 'video_call' | 'shipped_physical' | 'hybrid'
  location text,
  latitude numeric,
  longitude numeric,
  max_capacity integer,
  price_tokens numeric,
  price_usd numeric,
  fulfillment_yield numeric default 0,
    -- seller's self-reported satisfaction with offering this experience (0-100)
  authenticity_proof jsonb default '{}'::jsonb,
    -- { artifactVerified?: boolean, photoUrls?: string[], videoUrl?: string }
  human_alpha_required text[] default '{}',
    -- skills/qualities needed to appreciate this experience
  status text not null default 'draft',
    -- 'draft' | 'active' | 'paused' | 'sold_out' | 'archived'
  avg_rating numeric,
  rating_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_listings_type_status_idx on marketplace_listings(listing_type, status);
create index if not exists mkt_listings_seller_idx on marketplace_listings(seller_user_id);
create index if not exists mkt_listings_location_idx on marketplace_listings(latitude, longitude)
  where latitude is not null and longitude is not null;

alter table public.marketplace_listings enable row level security;
create policy "Anyone can browse active listings" on marketplace_listings
  for select using (status = 'active' or auth.uid() = seller_user_id);
create policy "Sellers manage own listings" on marketplace_listings
  for all using (auth.uid() = seller_user_id);

-- 2. MARKETPLACE ORDERS: Purchase/booking records
create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
    -- 'pending' | 'confirmed' | 'in_progress' | 'delivered' | 'completed' | 'disputed' | 'refunded'
  payment_method text not null default 'tokens',
    -- 'tokens' | 'usd' | 'barter'
  amount_tokens numeric,
  amount_usd numeric,
  fulfillment_date timestamptz,
  buyer_fulfillment_yield numeric,
    -- buyer's fulfillment score for this experience (0-100)
  seller_fulfillment_yield numeric,
    -- seller's fulfillment from delivering this experience (0-100)
  review_text text,
  rating numeric,
    -- 1-5 stars
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists mkt_orders_buyer_idx on marketplace_orders(buyer_user_id);
create index if not exists mkt_orders_seller_idx on marketplace_orders(seller_user_id);
create index if not exists mkt_orders_status_idx on marketplace_orders(status);

alter table public.marketplace_orders enable row level security;
create policy "Parties can view their orders" on marketplace_orders
  for select using (auth.uid() = buyer_user_id or auth.uid() = seller_user_id);
create policy "Buyers can create orders" on marketplace_orders
  for insert with check (auth.uid() = buyer_user_id);
create policy "Parties can update their orders" on marketplace_orders
  for update using (auth.uid() = buyer_user_id or auth.uid() = seller_user_id);

-- 3. FULFILLMENT YIELD SCORES: Aggregated per-user fulfillment metrics
create table if not exists public.fulfillment_yield_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_experiences_sold integer default 0,
  total_experiences_bought integer default 0,
  avg_seller_fulfillment numeric default 0,
  avg_buyer_fulfillment numeric default 0,
  combined_fulfillment_yield numeric default 0,
    -- weighted average of selling + buying fulfillment
  top_domains text[] default '{}',
  last_activity_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.fulfillment_yield_scores enable row level security;
create policy "Users can read fulfillment scores" on fulfillment_yield_scores
  for select using (true);
create policy "Users manage own scores" on fulfillment_yield_scores
  for all using (auth.uid() = user_id);

-- 4. FUNCTION: Update fulfillment scores after order completion
create or replace function public.update_fulfillment_yield()
returns trigger
language plpgsql security definer
as $$
begin
  -- Update buyer's score
  if NEW.status = 'completed' and NEW.buyer_fulfillment_yield is not null then
    insert into fulfillment_yield_scores (user_id, total_experiences_bought, avg_buyer_fulfillment, combined_fulfillment_yield, last_activity_at, updated_at)
    values (NEW.buyer_user_id, 1, NEW.buyer_fulfillment_yield, NEW.buyer_fulfillment_yield, now(), now())
    on conflict (user_id) do update set
      total_experiences_bought = fulfillment_yield_scores.total_experiences_bought + 1,
      avg_buyer_fulfillment = (
        (fulfillment_yield_scores.avg_buyer_fulfillment * fulfillment_yield_scores.total_experiences_bought + NEW.buyer_fulfillment_yield)
        / (fulfillment_yield_scores.total_experiences_bought + 1)
      ),
      combined_fulfillment_yield = (
        (fulfillment_yield_scores.avg_seller_fulfillment + (
          (fulfillment_yield_scores.avg_buyer_fulfillment * fulfillment_yield_scores.total_experiences_bought + NEW.buyer_fulfillment_yield)
          / (fulfillment_yield_scores.total_experiences_bought + 1)
        )) / 2
      ),
      last_activity_at = now(),
      updated_at = now();
  end if;

  -- Update seller's score
  if NEW.status = 'completed' and NEW.seller_fulfillment_yield is not null then
    insert into fulfillment_yield_scores (user_id, total_experiences_sold, avg_seller_fulfillment, combined_fulfillment_yield, last_activity_at, updated_at)
    values (NEW.seller_user_id, 1, NEW.seller_fulfillment_yield, NEW.seller_fulfillment_yield, now(), now())
    on conflict (user_id) do update set
      total_experiences_sold = fulfillment_yield_scores.total_experiences_sold + 1,
      avg_seller_fulfillment = (
        (fulfillment_yield_scores.avg_seller_fulfillment * fulfillment_yield_scores.total_experiences_sold + NEW.seller_fulfillment_yield)
        / (fulfillment_yield_scores.total_experiences_sold + 1)
      ),
      combined_fulfillment_yield = (
        ((
          (fulfillment_yield_scores.avg_seller_fulfillment * fulfillment_yield_scores.total_experiences_sold + NEW.seller_fulfillment_yield)
          / (fulfillment_yield_scores.total_experiences_sold + 1)
        ) + fulfillment_yield_scores.avg_buyer_fulfillment) / 2
      ),
      last_activity_at = now(),
      updated_at = now();
  end if;

  return NEW;
end;
$$;

create trigger marketplace_order_fulfillment_trigger
  after update on marketplace_orders
  for each row
  when (NEW.status = 'completed' and OLD.status != 'completed')
  execute function update_fulfillment_yield();

-- === 20260326200000_barter_bot.sql ===
-- =============================================================================
-- Barter Bot: P2P Inter-Sovereign Trade Engine
-- Trade offers, negotiation sessions, and escrow for sovereign asset exchange
-- =============================================================================

-- 1. SOVEREIGN TRADE OFFERS: Listings for P2P asset exchange
create table if not exists public.sovereign_trade_offers (
  id uuid primary key default gen_random_uuid(),
  offerer_user_id uuid not null references auth.users(id) on delete cascade,
  offer_type text not null,            -- 'energy_credits' | 'compute_tokens' | 'xenobot_blueprint' | 'marketplace_listing' | 'custom_asset'
  asset_description text,
  quantity numeric,
  min_acceptable_return jsonb,         -- { asset_type, min_quantity, flexible: bool }
  status text not null default 'open', -- 'open' | 'in_negotiation' | 'accepted' | 'withdrawn' | 'expired'
  visibility text not null default 'public', -- 'public' | 'tribe_only' | 'direct'
  target_user_id uuid references auth.users(id) on delete set null,
  target_tribe_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trade_offers_status_type_idx on sovereign_trade_offers(status, offer_type);
create index if not exists trade_offers_offerer_idx on sovereign_trade_offers(offerer_user_id);

-- 2. SOVEREIGN TRADE SESSIONS: Agent-mediated negotiation rounds
create table if not exists public.sovereign_trade_sessions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references sovereign_trade_offers(id) on delete cascade,
  party_a_user_id uuid not null references auth.users(id) on delete cascade,
  party_b_user_id uuid not null references auth.users(id) on delete cascade,
  party_a_agent_config jsonb,          -- agent model, strategy, constraints
  party_b_agent_config jsonb,
  negotiation_rounds jsonb not null default '[]'::jsonb,
  current_round integer not null default 0,
  max_rounds integer not null default 10,
  status text not null default 'initializing', -- 'initializing' | 'negotiating' | 'agreement_reached' | 'failed' | 'ratified' | 'cancelled'
  agreed_terms jsonb,
  sandbox_security_log jsonb,
  governance_ratification_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists trade_sessions_party_a_idx on sovereign_trade_sessions(party_a_user_id);
create index if not exists trade_sessions_party_b_idx on sovereign_trade_sessions(party_b_user_id);

-- 3. SOVEREIGN TRADE ESCROW: Held assets during trade execution
create table if not exists public.sovereign_trade_escrow (
  id uuid primary key default gen_random_uuid(),
  trade_session_id uuid not null references sovereign_trade_sessions(id) on delete cascade,
  depositor_user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null,
  amount numeric not null,
  status text not null default 'held', -- 'held' | 'released' | 'returned' | 'disputed'
  released_to_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

-- 4. RLS POLICIES
alter table sovereign_trade_offers enable row level security;
create policy trade_offers_owner_rw on sovereign_trade_offers for all using (offerer_user_id = auth.uid());
create policy trade_offers_public_read on sovereign_trade_offers for select using (visibility = 'public');

alter table sovereign_trade_sessions enable row level security;
create policy trade_sessions_party_rw on sovereign_trade_sessions for all
  using (party_a_user_id = auth.uid() or party_b_user_id = auth.uid());

alter table sovereign_trade_escrow enable row level security;
create policy trade_escrow_party_read on sovereign_trade_escrow for select
  using (
    depositor_user_id = auth.uid()
    or trade_session_id in (
      select id from sovereign_trade_sessions
      where party_a_user_id = auth.uid() or party_b_user_id = auth.uid()
    )
  );

-- === 20260326300000_authenticity_oracle.sql ===
-- =============================================================================
-- Authenticity Oracle: Anti-Deepfake Content Provenance System
-- Attestations, challenges, and biological heartbeat verification
-- =============================================================================

-- 1. AUTHENTICITY ATTESTATIONS: Proof-of-human content provenance
create table if not exists public.authenticity_attestations (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null,          -- 'text' | 'image' | 'video' | 'audio' | 'data' | 'code'
  content_hash text not null,
  artifact_signature text,
  biological_signal jsonb,             -- { source, signal_hash, verified_at }
  c2pa_manifest_id text,
  attestation_method text not null,    -- 'artifact_nfc' | 'wearable_confirmed' | 'manual_oath' | 'ai_verified'
  trust_chain jsonb not null default '[]'::jsonb,
  verification_count integer not null default 0,
  dispute_count integer not null default 0,
  status text not null default 'pending', -- 'pending' | 'verified' | 'disputed' | 'revoked'
  created_at timestamptz not null default now()
);
create index if not exists attestations_content_hash_idx on authenticity_attestations(content_hash);
create index if not exists attestations_creator_idx on authenticity_attestations(creator_user_id);
create index if not exists attestations_status_idx on authenticity_attestations(status);

-- 2. AUTHENTICITY CHALLENGES: Dispute mechanism for suspicious content
create table if not exists public.authenticity_challenges (
  id uuid primary key default gen_random_uuid(),
  attestation_id uuid not null references authenticity_attestations(id) on delete cascade,
  challenger_user_id uuid not null references auth.users(id) on delete cascade,
  challenge_type text not null,        -- 'deepfake_suspected' | 'provenance_mismatch' | 'signature_invalid' | 'plagiarism'
  evidence text,
  status text not null default 'open', -- 'open' | 'investigating' | 'upheld' | 'dismissed'
  cco_agent_analysis jsonb,            -- AI agent investigation results
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. BIOLOGICAL HEARTBEAT LOG: Continuous proof-of-human signals
create table if not exists public.biological_heartbeat_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_source text not null,         -- 'artifact_nfc' | 'wearable' | 'app_activity' | 'manual_checkin'
  signal_hash text,
  device_id uuid,
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists heartbeat_user_created_idx on biological_heartbeat_log(user_id, created_at desc);

-- 4. RLS POLICIES
alter table authenticity_attestations enable row level security;
create policy attestations_owner_rw on authenticity_attestations for all using (creator_user_id = auth.uid());
create policy attestations_authenticated_read on authenticity_attestations for select using (true);

alter table authenticity_challenges enable row level security;
create policy challenges_owner_rw on authenticity_challenges for all using (challenger_user_id = auth.uid());
create policy challenges_attestation_creator_read on authenticity_challenges for select
  using (
    attestation_id in (
      select id from authenticity_attestations where creator_user_id = auth.uid()
    )
  );

alter table biological_heartbeat_log enable row level security;
create policy heartbeat_owner_rw on biological_heartbeat_log for all using (user_id = auth.uid());

-- === 20260326400000_latency_buffer.sql ===
-- =============================================================================
-- Latency Buffer: Offline Sync & Conflict Resolution Engine
-- Queue, shadow state snapshots, and conflict logging for offline-first agents
-- =============================================================================

-- 1. LATENCY BUFFER QUEUE: Offline operation queue with priority and retry
create table if not exists public.latency_buffer_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_type text not null,        -- 'workflow_step' | 'vote' | 'trade_round' | 'attestation' | 'heartbeat' | 'marketplace_action'
  payload jsonb not null,
  target_table text,
  priority integer not null default 0,
  status text not null default 'queued', -- 'queued' | 'syncing' | 'synced' | 'conflict' | 'failed'
  created_offline_at timestamptz,
  synced_at timestamptz,
  conflict_resolution jsonb,
  retry_count integer not null default 0,
  max_retries integer not null default 5,
  created_at timestamptz not null default now()
);
create index if not exists buffer_queue_user_status_idx on latency_buffer_queue(user_id, status);
create index if not exists buffer_queue_status_priority_idx on latency_buffer_queue(status, priority desc);

-- 2. SHADOW STATE SNAPSHOTS: Local-first state cache per user
create table if not exists public.shadow_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_type text not null,            -- 'workflow' | 'governance' | 'trade' | 'token_balance'
  state_key text not null,
  snapshot_data jsonb,
  version integer not null default 1,
  is_stale boolean not null default false,
  source_updated_at timestamptz,
  snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, state_type, state_key)
);

-- 3. SYNC CONFLICT LOG: Record of conflicts and their resolutions
create table if not exists public.sync_conflict_log (
  id uuid primary key default gen_random_uuid(),
  buffer_queue_id uuid not null references latency_buffer_queue(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conflict_type text not null,         -- 'version_mismatch' | 'concurrent_edit' | 'state_divergence'
  local_state jsonb,
  remote_state jsonb,
  resolution text,                     -- 'local_wins' | 'remote_wins' | 'merged' | 'manual'
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. RLS POLICIES
alter table latency_buffer_queue enable row level security;
create policy buffer_queue_owner_rw on latency_buffer_queue for all using (user_id = auth.uid());

alter table shadow_state_snapshots enable row level security;
create policy shadow_state_owner_rw on shadow_state_snapshots for all using (user_id = auth.uid());

alter table sync_conflict_log enable row level security;
create policy sync_conflict_owner_rw on sync_conflict_log for all using (user_id = auth.uid());

-- === 20260326500000_a2a_protocol.sql ===
-- =============================================================================
-- A2A Protocol: Inter-Tribe Agent Intelligence Exchange
-- =============================================================================

-- 1. Discoverable agent "business cards"
create table if not exists public.a2a_agent_cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_definition_id uuid,
  display_name text not null,
  capabilities text[] not null default '{}',
  pricing_tokens_per_task numeric default 0,
  availability text not null default 'available',  -- 'available' | 'busy' | 'offline'
  trust_score_minimum numeric default 0,
  max_concurrent_tasks integer default 3,
  total_tasks_completed integer default 0,
  avg_rating numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists a2a_agent_cards_capabilities_idx on a2a_agent_cards using gin (capabilities);
create index if not exists a2a_agent_cards_availability_idx on a2a_agent_cards(availability);

-- 2. Cross-factory agent task requests (handshakes)
create table if not exists public.a2a_handshakes (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  requester_agent_id uuid,
  provider_agent_card_id uuid references a2a_agent_cards(id) on delete cascade,
  task_description text not null,
  task_payload jsonb default '{}'::jsonb,
  agreed_price_tokens numeric,
  status text not null default 'requested',  -- 'requested' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'rejected' | 'cancelled'
  escrow_id uuid,
  result_payload jsonb,
  quality_rating numeric,
  requester_feedback text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists a2a_handshakes_requester_idx on a2a_handshakes(requester_user_id);
create index if not exists a2a_handshakes_provider_idx on a2a_handshakes(provider_user_id);
create index if not exists a2a_handshakes_status_idx on a2a_handshakes(status);

-- 3. Structured inter-agent messages
create table if not exists public.a2a_message_log (
  id uuid primary key default gen_random_uuid(),
  handshake_id uuid not null references a2a_handshakes(id) on delete cascade,
  sender text not null,        -- 'requester_agent' | 'provider_agent' | 'system'
  message_type text not null,  -- 'task_clarification' | 'progress_update' | 'result_delivery' | 'error_report'
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists a2a_message_log_handshake_created_idx on a2a_message_log(handshake_id, created_at);

-- 4. RLS policies
alter table a2a_agent_cards enable row level security;
create policy a2a_agent_cards_owner_rw on a2a_agent_cards for all using (owner_user_id = auth.uid());
create policy a2a_agent_cards_public_read on a2a_agent_cards for select using (availability != 'offline' and auth.uid() is not null);

alter table a2a_handshakes enable row level security;
create policy a2a_handshakes_participant_select on a2a_handshakes for select using (
  requester_user_id = auth.uid() or provider_user_id = auth.uid()
);
create policy a2a_handshakes_participant_update on a2a_handshakes for update using (
  requester_user_id = auth.uid() or provider_user_id = auth.uid()
);
create policy a2a_handshakes_requester_insert on a2a_handshakes for insert with check (requester_user_id = auth.uid());

alter table a2a_message_log enable row level security;
create policy a2a_message_log_participant_read on a2a_message_log for select using (
  exists (
    select 1 from a2a_handshakes h
    where h.id = handshake_id
      and (h.requester_user_id = auth.uid() or h.provider_user_id = auth.uid())
  )
);
create policy a2a_message_log_participant_insert on a2a_message_log for insert with check (
  exists (
    select 1 from a2a_handshakes h
    where h.id = handshake_id
      and (h.requester_user_id = auth.uid() or h.provider_user_id = auth.uid())
  )
);

-- 5. Triggers
drop trigger if exists set_a2a_agent_cards_updated_at on a2a_agent_cards;
create trigger set_a2a_agent_cards_updated_at before update on a2a_agent_cards for each row execute function set_updated_at();

-- === 20260326600000_experience_archive.sql ===
-- =============================================================================
-- Echoes of Experience Archive: Persistent Mentor Ledger
-- =============================================================================

-- 1. Hard-won advice and verified experiences
create table if not exists public.experience_entries (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  entry_type text not null,  -- 'moores_block_overcome' | 'launch_win' | 'career_pivot' | 'technical_breakthrough' | 'leadership_lesson' | 'failure_postmortem'
  title text not null,
  narrative text not null,
  hard_won_advice text,
  context_tags text[] default '{}',
  difficulty_level text default 'intermediate',  -- 'beginner' | 'intermediate' | 'advanced' | 'expert'
  verification_count integer default 0,
  verified_by_user_ids jsonb default '[]'::jsonb,
  upvote_count integer default 0,
  is_archived boolean default false,
  attestation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experience_entries_type_idx on experience_entries(entry_type);
create index if not exists experience_entries_author_idx on experience_entries(author_user_id);
create index if not exists experience_entries_tribe_idx on experience_entries(tribe_id);

-- 2. Tribal validation endorsements
create table if not exists public.experience_endorsements (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experience_entries(id) on delete cascade,
  endorser_user_id uuid not null references auth.users(id) on delete cascade,
  endorsement_type text not null,  -- 'verified_witnessed' | 'valuable_advice' | 'applied_successfully'
  comment text,
  created_at timestamptz not null default now(),
  unique (experience_id, endorser_user_id)
);

-- 3. RLS policies
alter table experience_entries enable row level security;
create policy experience_entries_owner_rw on experience_entries for all using (author_user_id = auth.uid());
create policy experience_entries_authenticated_read on experience_entries for select using (
  is_archived = false and auth.uid() is not null
);

alter table experience_endorsements enable row level security;
create policy experience_endorsements_read on experience_endorsements for select using (auth.uid() is not null);
create policy experience_endorsements_owner_insert on experience_endorsements for insert with check (endorser_user_id = auth.uid());

-- 4. Triggers
drop trigger if exists set_experience_entries_updated_at on experience_entries;
create trigger set_experience_entries_updated_at before update on experience_entries for each row execute function set_updated_at();

-- === 20260326700000_decoupling_suite.sql ===
-- =============================================================================
-- Handcuff Cutter: Golden Handcuff Analysis & Sovereignty Break-Even
-- =============================================================================

-- 1. Golden handcuff analysis audits
create table if not exists public.decoupling_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  current_salary_usd numeric,
  vesting_schedule jsonb default '[]'::jsonb,
  benefits_value_usd numeric default 0,
  stock_options_value_usd numeric default 0,
  total_handcuff_value_usd numeric default 0,
  sovereignty_income_usd numeric default 0,
  breakeven_months integer,
  sovereign_income_sources jsonb default '[]'::jsonb,
  recommended_exit_date date,
  confidence_score numeric default 0,
  six_month_plan jsonb default '[]'::jsonb,
  status text not null default 'draft',  -- 'draft' | 'active' | 'on_track' | 'achieved' | 'paused'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decoupling_audits_user_status_idx on decoupling_audits(user_id, status);

-- 2. Monthly progress tracking milestones
create table if not exists public.decoupling_milestones (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references decoupling_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month_number integer not null,
  milestone_description text,
  income_target_usd numeric,
  actual_income_usd numeric,
  actions_completed text[] default '{}',
  status text not null default 'pending',  -- 'pending' | 'in_progress' | 'achieved' | 'missed'
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists decoupling_milestones_audit_month_idx on decoupling_milestones(audit_id, month_number);

-- 3. RLS policies
alter table decoupling_audits enable row level security;
create policy decoupling_audits_owner_rw on decoupling_audits for all using (user_id = auth.uid());

alter table decoupling_milestones enable row level security;
create policy decoupling_milestones_owner_rw on decoupling_milestones for all using (user_id = auth.uid());

-- 4. Triggers
drop trigger if exists set_decoupling_audits_updated_at on decoupling_audits;
create trigger set_decoupling_audits_updated_at before update on decoupling_audits for each row execute function set_updated_at();

-- === 20260326800000_bounty_hunter.sql ===
-- =============================================================================
-- Bounty Hunter: External Market Challenge Submission Pipeline
-- =============================================================================

-- 1. Discovered external challenges
create table if not exists public.bounty_opportunities (
  id uuid primary key default gen_random_uuid(),
  discovered_by text not null default 'user',  -- 'system' | 'user' | 'agent'
  source_platform text,       -- 'devto' | 'notion' | 'github' | 'producthunt' | 'custom'
  source_url text,
  title text not null,
  description text,
  prize_description text,
  prize_value_usd numeric,
  deadline timestamptz,
  required_skills text[] default '{}',
  matching_factory_builds jsonb default '[]'::jsonb,
  match_confidence numeric default 0,
  status text not null default 'discovered',  -- 'discovered' | 'evaluating' | 'targeting' | 'submitted' | 'won' | 'lost' | 'expired'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bounty_opportunities_status_deadline_idx on bounty_opportunities(status, deadline);
create index if not exists bounty_opportunities_platform_idx on bounty_opportunities(source_platform);

-- 2. Our submissions to bounties
create table if not exists public.bounty_submissions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references bounty_opportunities(id) on delete cascade,
  submitter_user_id uuid not null references auth.users(id) on delete cascade,
  factory_build_id text,
  submission_url text,
  documentation_generated jsonb default '{}'::jsonb,
  packaging_status text not null default 'drafting',  -- 'drafting' | 'packaged' | 'submitted' | 'accepted' | 'revision_requested'
  submission_date timestamptz,
  result text default 'pending',  -- 'pending' | 'shortlisted' | 'winner' | 'runner_up' | 'not_selected'
  prize_earned_usd numeric,
  token_reward numeric,
  created_at timestamptz not null default now()
);
create index if not exists bounty_submissions_opportunity_idx on bounty_submissions(opportunity_id);
create index if not exists bounty_submissions_result_idx on bounty_submissions(result);

-- 3. RLS policies
alter table bounty_opportunities enable row level security;
create policy bounty_opportunities_authenticated_read on bounty_opportunities for select using (auth.uid() is not null);
create policy bounty_opportunities_authenticated_insert on bounty_opportunities for insert with check (auth.uid() is not null);

alter table bounty_submissions enable row level security;
create policy bounty_submissions_owner_rw on bounty_submissions for all using (submitter_user_id = auth.uid());

-- 4. Triggers
drop trigger if exists set_bounty_opportunities_updated_at on bounty_opportunities;
create trigger set_bounty_opportunities_updated_at before update on bounty_opportunities for each row execute function set_updated_at();

-- === 20260326900000_recursive_evolution.sql ===
-- =============================================================================
-- Recursive Self-Improvement: Intelligence Explosion Infrastructure — Tools #129-131
-- =============================================================================

-- 1. Frontier vs local model cost tracking
create table if not exists public.intelligence_tariff_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_domain text not null,
  frontier_model text,
  frontier_cost_per_task_usd numeric,
  frontier_accuracy_pct numeric,
  local_model text,
  local_accuracy_pct numeric default 0,
  parity_threshold_pct numeric default 95,
  training_data_size integer default 0,
  fine_tune_status text not null default 'pending',  -- 'pending' | 'generating_data' | 'training' | 'evaluating' | 'deployed' | 'failed'
  monthly_savings_usd numeric default 0,
  is_replacement_active boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intelligence_tariff_audits_user_domain_idx on intelligence_tariff_audits(user_id, task_domain);

-- 2. Self-improvement cycle logs
create table if not exists public.agent_harness_evolutions (
  id uuid primary key default gen_random_uuid(),
  agent_definition_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  evolution_type text not null,  -- 'performance_optimization' | 'error_fix' | 'capability_expansion' | 'cost_reduction'
  trigger_source text,  -- 'failure_pattern' | 'benchmark_regression' | 'cost_spike' | 'schedule'
  diagnosis text,
  proposed_fix text,
  experiment_branch text,
  before_metrics jsonb default '{}',
  after_metrics jsonb default '{}',
  improvement_pct numeric,
  status text not null default 'diagnosed',  -- 'diagnosed' | 'experimenting' | 'validated' | 'merged' | 'rejected'
  auto_merged boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists agent_harness_evolutions_agent_status_idx on agent_harness_evolutions(agent_definition_id, status);

-- 3. Coordinated research campaigns
create table if not exists public.tribal_auto_research_campaigns (
  id uuid primary key default gen_random_uuid(),
  tribe_id text not null,
  initiator_user_id uuid not null references auth.users(id) on delete cascade,
  research_goal text not null,
  hypothesis text,
  experiment_spec jsonb default '{}',
  participant_count integer default 0,
  max_participants integer default 100,
  status text not null default 'recruiting',  -- 'recruiting' | 'running' | 'collecting' | 'analyzing' | 'completed' | 'cancelled'
  winning_experiment_id uuid,
  results_summary jsonb,
  total_compute_tokens_spent numeric default 0,
  breakthrough_achieved boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tribal_auto_research_campaigns_tribe_status_idx on tribal_auto_research_campaigns(tribe_id, status);

-- 4. Individual runs within campaigns
create table if not exists public.auto_research_experiments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references tribal_auto_research_campaigns(id) on delete cascade,
  participant_user_id uuid not null references auth.users(id) on delete cascade,
  agent_sandbox_id uuid,
  experiment_config jsonb default '{}',
  result_metrics jsonb default '{}',
  score numeric,
  is_winner boolean default false,
  compute_tokens_used numeric default 0,
  git_commit_hash text,
  status text not null default 'queued',  -- 'queued' | 'running' | 'completed' | 'failed'
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists auto_research_experiments_campaign_score_idx on auto_research_experiments(campaign_id, score desc);

-- 5. RLS policies
alter table intelligence_tariff_audits enable row level security;
create policy intelligence_tariff_audits_owner_rw on intelligence_tariff_audits for all using (user_id = auth.uid());

alter table agent_harness_evolutions enable row level security;
create policy agent_harness_evolutions_owner_rw on agent_harness_evolutions for all using (user_id = auth.uid());

alter table tribal_auto_research_campaigns enable row level security;
create policy tribal_auto_research_campaigns_authenticated_read on tribal_auto_research_campaigns for select using (auth.uid() is not null);
create policy tribal_auto_research_campaigns_initiator_insert on tribal_auto_research_campaigns for insert with check (initiator_user_id = auth.uid());
create policy tribal_auto_research_campaigns_initiator_update on tribal_auto_research_campaigns for update using (initiator_user_id = auth.uid());

alter table auto_research_experiments enable row level security;
create policy auto_research_experiments_authenticated_read on auto_research_experiments for select using (auth.uid() is not null);
create policy auto_research_experiments_participant_insert on auto_research_experiments for insert with check (participant_user_id = auth.uid());
create policy auto_research_experiments_participant_update on auto_research_experiments for update using (participant_user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_intelligence_tariff_audits_updated_at on intelligence_tariff_audits;
create trigger set_intelligence_tariff_audits_updated_at before update on intelligence_tariff_audits for each row execute function set_updated_at();

drop trigger if exists set_tribal_auto_research_campaigns_updated_at on tribal_auto_research_campaigns;
create trigger set_tribal_auto_research_campaigns_updated_at before update on tribal_auto_research_campaigns for each row execute function set_updated_at();

-- === 20260327000000_sherlog_forensics.sql ===
-- =============================================================================
-- Project SherLog: Forensic Intelligence Pipeline — Tools #132-135
-- =============================================================================

-- 1. MALWARE ARTIFACTS: mid-heist selfies and system logs
create table if not exists public.malware_artifacts (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null,              -- screenshot | process_log | browser_history | sysinfo | installer_binary
  storage_ref text,
  raw_data jsonb default '{}'::jsonb,
  file_hash_sha256 text,
  source_description text,
  classification text default 'unknown',    -- web_lure | file_lure | hybrid | unknown
  infection_status text default 'suspected', -- suspected | confirmed | benign | false_positive
  related_incident_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists malware_artifacts_reporter_idx on malware_artifacts(reporter_user_id);
create index if not exists malware_artifacts_class_status_idx on malware_artifacts(classification, infection_status);

-- 2. FORENSIC NARRATIVES: 2-layer LLM pipeline output
create table if not exists public.forensic_narratives (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.malware_artifacts(id) on delete cascade,
  analyst_user_id uuid not null references auth.users(id) on delete cascade,
  layer1_visual jsonb not null default '{}'::jsonb,
  layer2_vector jsonb not null default '{}'::jsonb,
  combined_narrative text,
  iocs_extracted jsonb default '[]'::jsonb,
  threat_actor_profile jsonb,
  time_to_analysis_seconds integer,
  status text default 'analyzing',          -- analyzing | complete | needs_review | disputed
  created_at timestamptz not null default now()
);
create index if not exists forensic_narratives_artifact_idx on forensic_narratives(artifact_id);
create index if not exists forensic_narratives_status_idx on forensic_narratives(status);

-- 3. TRIBAL HERD IMMUNITY: verified malicious IOC blacklist
create table if not exists public.tribal_herd_immunity (
  id uuid primary key default gen_random_uuid(),
  source_narrative_id uuid,
  ioc_type text not null,                   -- url | domain | ip | file_hash | ad_id | installer_name
  ioc_value text not null,
  threat_category text default 'infostealer', -- infostealer | ransomware | phishing | cryptominer | rat | custom
  severity text default 'high',             -- low | medium | high | critical
  reported_by_count integer default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean default true,
  tribal_propagation_count integer default 0,
  created_at timestamptz not null default now(),
  unique (ioc_type, ioc_value)
);
create index if not exists tribal_herd_immunity_ioc_idx on tribal_herd_immunity(ioc_type, ioc_value);
create index if not exists tribal_herd_immunity_active_sev_idx on tribal_herd_immunity(is_active, severity);

-- 4. SANDBOX DETONATIONS: lure detonation results
create table if not exists public.sandbox_detonations (
  id uuid primary key default gen_random_uuid(),
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  lure_url text not null,
  lure_type text default 'custom',          -- youtube_redirect | mega_download | google_ad | sponsored_link | direct_download | custom
  detonation_environment text default 'headless_browser',
  status text default 'queued',             -- queued | detonating | analyzing | complete | failed
  result_verdict text,                      -- clean | suspicious | malicious | inconclusive
  artifacts_collected jsonb default '[]'::jsonb,
  network_iocs jsonb default '[]'::jsonb,
  behavior_summary text,
  detonation_duration_seconds integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists sandbox_detonations_lure_url_idx on sandbox_detonations(lure_url);
create index if not exists sandbox_detonations_status_idx on sandbox_detonations(status);

-- 5. ROW LEVEL SECURITY

-- malware_artifacts: reporter owns all; all authenticated can read confirmed
alter table malware_artifacts enable row level security;

create policy malware_artifacts_owner_all on malware_artifacts
  for all using (reporter_user_id = auth.uid());

create policy malware_artifacts_read_confirmed on malware_artifacts
  for select using (infection_status = 'confirmed');

-- forensic_narratives: analyst owns; all authenticated read complete
alter table forensic_narratives enable row level security;

create policy forensic_narratives_owner_all on forensic_narratives
  for all using (analyst_user_id = auth.uid());

create policy forensic_narratives_read_complete on forensic_narratives
  for select using (status = 'complete');

-- tribal_herd_immunity: all authenticated can read; all authenticated can insert
alter table tribal_herd_immunity enable row level security;

create policy tribal_herd_immunity_read_all on tribal_herd_immunity
  for select using (auth.uid() is not null);

create policy tribal_herd_immunity_insert_all on tribal_herd_immunity
  for insert with check (auth.uid() is not null);

-- sandbox_detonations: submitter owns; all authenticated read complete
alter table sandbox_detonations enable row level security;

create policy sandbox_detonations_owner_all on sandbox_detonations
  for all using (submitted_by_user_id = auth.uid());

create policy sandbox_detonations_read_complete on sandbox_detonations
  for select using (status = 'complete');

-- === 20260327100000_latent_physics.sql ===
-- =============================================================================
-- LeWorldModel: Latent Physics Engine — Tools #136-139
-- =============================================================================

-- 1. WORLD MODELS: trained LeWM instances
create table if not exists public.world_models (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  model_name text not null,
  environment_type text not null default 'custom',
  parameter_count integer default 15000000,
  latent_dim integer default 192,
  gaussian_prior jsonb default '{}'::jsonb,
  training_status text not null default 'untrained', -- untrained | collecting_data | training | evaluating | deployed | failed
  training_data_frames integer default 0,
  training_hours numeric default 0,
  hardware_used text,
  accuracy_pct numeric,
  surprise_threshold numeric default 0.85,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists world_models_owner_env_idx on world_models(owner_user_id, environment_type);

-- 2. IMAGINARY SIMULATIONS: CEM rollout results
create table if not exists public.imaginary_simulations (
  id uuid primary key default gen_random_uuid(),
  world_model_id uuid not null references public.world_models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_description text not null,
  terminal_state jsonb,
  num_rollouts integer default 1000,
  best_trajectory_cost numeric,
  planning_time_ms integer,
  speedup_factor numeric,
  selected_action_sequence jsonb default '[]'::jsonb,
  status text not null default 'planned',            -- planned | simulating | complete | executed | abandoned
  created_at timestamptz not null default now()
);
create index if not exists imaginary_simulations_model_idx on imaginary_simulations(world_model_id);
create index if not exists imaginary_simulations_status_idx on imaginary_simulations(status);

-- 3. SURPRISE EVENTS: violation-of-expectation detections
create table if not exists public.surprise_events (
  id uuid primary key default gen_random_uuid(),
  world_model_id uuid not null references public.world_models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,                          -- object_teleport | color_change | physics_violation | trajectory_divergence | sensor_anomaly | deepfake_detected
  predicted_state jsonb,
  actual_state jsonb,
  surprise_delta numeric not null,
  severity text default 'medium',                    -- low | medium | high | critical
  auto_response text default 'logged',               -- logged | alert_sent | actuators_frozen | sentinel_triggered
  related_incident_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists surprise_events_model_time_idx on surprise_events(world_model_id, created_at desc);
create index if not exists surprise_events_severity_idx on surprise_events(severity);

-- 4. LATENT PROBES: extracted physical quantities
create table if not exists public.latent_probes (
  id uuid primary key default gen_random_uuid(),
  world_model_id uuid not null references public.world_models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  probe_type text not null,                          -- position | orientation | velocity | temperature | pressure | custom
  probe_label text,
  extracted_value jsonb not null default '{}'::jsonb,
  ground_truth_value jsonb,
  accuracy_pct numeric,
  created_at timestamptz not null default now()
);
create index if not exists latent_probes_model_type_idx on latent_probes(world_model_id, probe_type);

-- 5. ROW LEVEL SECURITY

-- world_models: owner owns
alter table world_models enable row level security;

create policy world_models_owner_all on world_models
  for all using (owner_user_id = auth.uid());

-- imaginary_simulations: user owns
alter table imaginary_simulations enable row level security;

create policy imaginary_simulations_owner_all on imaginary_simulations
  for all using (user_id = auth.uid());

-- surprise_events: user owns; all authenticated can read critical
alter table surprise_events enable row level security;

create policy surprise_events_owner_all on surprise_events
  for all using (user_id = auth.uid());

create policy surprise_events_read_critical on surprise_events
  for select using (severity = 'critical');

-- latent_probes: user owns
alter table latent_probes enable row level security;

create policy latent_probes_owner_all on latent_probes
  for all using (user_id = auth.uid());

-- === 20260327200000_pacific_rim_shield.sql ===
-- =============================================================================
-- Pacific Rim Shield: Agentic Immunity — Tools #140-145
-- =============================================================================

-- 1. TRAFFIC ENTROPY LEDGER: covert-channel & timing-attack detection
create table if not exists public.traffic_entropy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_ip text,
  port_distribution jsonb default '{}'::jsonb,
  timing_pattern jsonb default '{}'::jsonb,
  entropy_score numeric not null,
  is_anomalous boolean default false,
  anomaly_type text default 'normal',             -- covert_channel | coded_instructions | timing_attack | normal
  related_surprise_event_id uuid,
  analyzed_packets integer default 0,
  analysis_window_seconds integer default 300,
  created_at timestamptz not null default now()
);
create index if not exists traffic_entropy_ledger_user_anomalous_idx on traffic_entropy_ledger(user_id, is_anomalous);

-- 2. ADVERSARY STYLOMETRY: threat-actor linguistic fingerprints
create table if not exists public.adversary_stylometry (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid not null references auth.users(id) on delete cascade,
  profile_name text not null,
  stylometric_features jsonb not null default '{}'::jsonb,
  confidence_score numeric default 0,
  linked_narrative_ids jsonb default '[]'::jsonb,
  linked_ttp_ids jsonb default '[]'::jsonb,
  threat_actor_group text,
  status text default 'draft',                    -- draft | active | confirmed | archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists adversary_stylometry_group_idx on adversary_stylometry(threat_actor_group);
create index if not exists adversary_stylometry_status_idx on adversary_stylometry(status);

-- 3. DEVICE LIFECYCLE STATES: heartbeat tracking & zombie culling
create table if not exists public.device_lifecycle_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_type text not null,                      -- server | firewall | router | vehicle | smr | iot_sensor | one_charge | custom
  last_heartbeat_at timestamptz,
  heartbeat_source text,                          -- artifact_nfc | wearable | network_ping | manual
  consecutive_missed_days integer default 0,
  lifecycle_status text default 'active',         -- active | warning | zombie | culled | decommissioned
  cull_threshold_days integer default 30,
  auto_cull_enabled boolean default true,
  cull_executed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists device_lifecycle_states_status_idx on device_lifecycle_states(lifecycle_status);
create index if not exists device_lifecycle_states_user_type_idx on device_lifecycle_states(user_id, device_type);

-- 4. BIOMETRIC ENCRYPTION GATES: artifact-proximity data access
create table if not exists public.biometric_encryption_gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_label text not null,
  data_classification text default 'sensitive',   -- public | internal | sensitive | critical | sovereign
  artifact_id uuid,
  encryption_method text default 'artifact_proximity', -- artifact_proximity | biometric_confirm | dual_key | sovereign_enclave
  last_access_at timestamptz,
  access_count integer default 0,
  breach_attempts integer default 0,
  status text default 'active',                   -- active | locked | revoked
  created_at timestamptz not null default now()
);
create index if not exists biometric_encryption_gates_user_class_idx on biometric_encryption_gates(user_id, data_classification);

-- 5. ROW LEVEL SECURITY

-- traffic_entropy_ledger: user owns
alter table traffic_entropy_ledger enable row level security;

create policy traffic_entropy_ledger_owner_all on traffic_entropy_ledger
  for all using (user_id = auth.uid());

-- adversary_stylometry: analyst owns; all authenticated read active/confirmed
alter table adversary_stylometry enable row level security;

create policy adversary_stylometry_owner_all on adversary_stylometry
  for all using (analyst_user_id = auth.uid());

create policy adversary_stylometry_read_active on adversary_stylometry
  for select using (status in ('active', 'confirmed'));

-- device_lifecycle_states: user owns
alter table device_lifecycle_states enable row level security;

create policy device_lifecycle_states_owner_all on device_lifecycle_states
  for all using (user_id = auth.uid());

-- biometric_encryption_gates: user owns
alter table biometric_encryption_gates enable row level security;

create policy biometric_encryption_gates_owner_all on biometric_encryption_gates
  for all using (user_id = auth.uid());

-- === 20260327300000_interplanetary_pipeline.sql ===
-- =============================================================================
-- Interplanetary Pipeline: NASA Ignition & SR1 Freedom — Tools #146-149
-- =============================================================================

-- 1. DEREGULATED POLICY LEDGER: bureaucratic blocks mapped to logical execution paths
create table if not exists public.deregulated_policy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_section text not null,
  original_regulation text,
  deregulation_status text default 'identified',    -- identified | analyzed | automated | executed | archived
  execution_path jsonb default '{}'::jsonb,
  compliance_agent_id uuid,
  time_saved_hours numeric default 0,
  cost_saved_usd numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deregulated_policy_ledger_status_idx on deregulated_policy_ledger(deregulation_status);

-- 2. LUNAR BUILD PHASES: tribal staking in moon base construction phases
create table if not exists public.lunar_build_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase text not null default 'experimentation',    -- experimentation | infrastructure | permanence
  mission_name text not null,
  staked_tokens numeric default 0,
  contribution_type text,                           -- compute | design | engineering | science | logistics
  deliverable_description text,
  status text default 'proposed',                   -- proposed | funded | in_progress | delivered | verified
  verification_proof jsonb,
  cosmic_equity_pct numeric default 0,
  created_at timestamptz not null default now()
);
create index if not exists lunar_build_phases_phase_status_idx on lunar_build_phases(phase, status);
create index if not exists lunar_build_phases_user_idx on lunar_build_phases(user_id);

-- 3. FISSION POWER TELEMETRY: SR1 Freedom and tribal SMR telemetry sync
create table if not exists public.fission_power_telemetry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'tribal_smr',   -- sr1_freedom | tribal_smr | lunar_rtg | orbital_relay
  power_output_kw numeric,
  thermal_efficiency_pct numeric,
  fuel_remaining_pct numeric,
  uptime_hours numeric default 0,
  telemetry_data jsonb default '{}'::jsonb,
  alert_level text default 'nominal',               -- nominal | advisory | caution | warning | critical
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists fission_power_telemetry_source_alert_idx on fission_power_telemetry(source_type, alert_level);

-- 4. SUPPLY CHAIN MONITORS: vendor velocity and slippage tracking
create table if not exists public.supply_chain_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_name text not null,
  contract_description text,
  critical_path_item text,
  scheduled_delivery_date date,
  projected_delivery_date date,
  slippage_days integer default 0,
  status text default 'on_track',                   -- on_track | at_risk | slipping | blocked | resolved | bypassed
  uncomfortable_action_triggered boolean default false,
  reallocation_target text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists supply_chain_monitors_status_idx on supply_chain_monitors(status);
create index if not exists supply_chain_monitors_slippage_idx on supply_chain_monitors(slippage_days desc);

-- 5. ROW LEVEL SECURITY

-- deregulated_policy_ledger: all authenticated can read; user owns insert/update
alter table deregulated_policy_ledger enable row level security;

create policy deregulated_policy_ledger_read on deregulated_policy_ledger
  for select using (true);

create policy deregulated_policy_ledger_insert on deregulated_policy_ledger
  for insert with check (user_id = auth.uid());

create policy deregulated_policy_ledger_update on deregulated_policy_ledger
  for update using (user_id = auth.uid());

-- lunar_build_phases: user owns; all authenticated can read
alter table lunar_build_phases enable row level security;

create policy lunar_build_phases_read on lunar_build_phases
  for select using (true);

create policy lunar_build_phases_owner_insert on lunar_build_phases
  for insert with check (user_id = auth.uid());

create policy lunar_build_phases_owner_update on lunar_build_phases
  for update using (user_id = auth.uid());

-- fission_power_telemetry: user owns
alter table fission_power_telemetry enable row level security;

create policy fission_power_telemetry_owner_all on fission_power_telemetry
  for all using (user_id = auth.uid());

-- supply_chain_monitors: user owns; all authenticated can read
alter table supply_chain_monitors enable row level security;

create policy supply_chain_monitors_read on supply_chain_monitors
  for select using (true);

create policy supply_chain_monitors_owner_insert on supply_chain_monitors
  for insert with check (user_id = auth.uid());

create policy supply_chain_monitors_owner_update on supply_chain_monitors
  for update using (user_id = auth.uid());

-- === 20260327400000_recursive_meta_agent.sql ===
-- =============================================================================
-- Recursive Meta-Agent: Agent #0 — Tools #150-155
-- =============================================================================

-- 1. evolution_logs — before/after of every agentic refactor
create table if not exists public.evolution_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid,
  tool_name text,
  mutation_type text not null default 'optimization', -- optimization | refactor | distillation | security_hardening | alignment_shift
  before_state jsonb default '{}'::jsonb,
  after_state jsonb default '{}'::jsonb,
  improvement_pct numeric,
  energy_delta_kwh numeric,
  token_delta numeric,
  auto_applied boolean default false,
  approved_by_chairman boolean,
  created_at timestamptz not null default now()
);
create index if not exists evolution_logs_user_mutation_idx on evolution_logs(user_id, mutation_type);

-- 2. performance_mutations — efficiency diffs for all tools
create table if not exists public.performance_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  metric_name text not null, -- latency_ms | token_count | energy_kwh | error_rate | accuracy_pct
  before_value numeric,
  after_value numeric,
  improvement_pct numeric,
  mutation_source text default 'meta_agent', -- meta_agent | tribal_sync | manual | auto_research
  applied_at timestamptz,
  reverted boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists performance_mutations_tool_metric_idx on performance_mutations(tool_name, metric_name);

-- 3. tribal_dna_registry — winning commits from tribal auto research
create table if not exists public.tribal_dna_registry (
  id uuid primary key default gen_random_uuid(),
  contributor_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid,
  commit_hash text,
  optimization_domain text not null,
  description text,
  improvement_pct numeric,
  adoption_count integer default 0,
  tribal_reward_tokens numeric default 0,
  status text default 'submitted', -- submitted | verified | adopted | superseded | rejected
  created_at timestamptz not null default now()
);
create index if not exists tribal_dna_domain_status_idx on tribal_dna_registry(optimization_domain, status);

-- 4. chairman_alignment_vectors — human alpha preference map
create table if not exists public.chairman_alignment_vectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dimension text not null, -- energy_priority | security_priority | speed_priority | cost_priority | creativity_priority | ethics_weight | risk_tolerance | photonic_bias | lunar_bias | tribal_density
  weight numeric not null default 0.5,
  last_calibrated_from text, -- veto | approval | explicit_direction | behavioral_inference
  calibration_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, dimension)
);
create index if not exists chairman_alignment_user_idx on chairman_alignment_vectors(user_id);

-- 5. RLS
alter table evolution_logs enable row level security;
create policy evolution_logs_owner_rw on evolution_logs for all using (user_id = auth.uid());

alter table performance_mutations enable row level security;
create policy performance_mutations_owner_rw on performance_mutations for all using (user_id = auth.uid());

alter table tribal_dna_registry enable row level security;
create policy tribal_dna_read on tribal_dna_registry for select using (auth.role() = 'authenticated');
create policy tribal_dna_insert on tribal_dna_registry for insert with check (contributor_user_id = auth.uid());

alter table chairman_alignment_vectors enable row level security;
create policy chairman_alignment_owner_rw on chairman_alignment_vectors for all using (user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_chairman_alignment_updated_at on chairman_alignment_vectors;
create trigger set_chairman_alignment_updated_at before update on chairman_alignment_vectors for each row execute function set_updated_at();

-- === 20260327500000_invisible_infrastructure.sql ===
-- =============================================================================
-- Invisible Infrastructure: MolmoWeb Vision + WebAssembly Sandbox — Tools #156-160
-- =============================================================================

-- 1. wasm_artifacts — sandboxed WebAssembly binary states
create table if not exists public.wasm_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_name text not null,
  intent_description text,
  wasm_binary_hash text,
  source_tool_name text,
  sandbox_status text not null default 'provisioned', -- provisioned | running | completed | vaporized | failed
  isolation_level text not null default 'strict', -- strict | permissive | quarantine
  memory_limit_mb integer default 256,
  execution_time_ms integer,
  vanta_compliant boolean default false,
  sentry_tested boolean default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists wasm_artifacts_user_status_idx on wasm_artifacts(user_id, sandbox_status);

-- 2. visual_web_logs — Molmo agent browsing session snapshots
create table if not exists public.visual_web_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_name text,
  target_url text,
  navigation_steps jsonb default '[]'::jsonb,
  semantic_snapshots jsonb default '[]'::jsonb,
  elements_interacted integer default 0,
  model_used text default 'molmo-8b',
  hardware_node text,
  processing_time_ms integer,
  status text not null default 'active', -- active | completed | failed | archived
  created_at timestamptz not null default now()
);
create index if not exists visual_web_logs_user_status_idx on visual_web_logs(user_id, status);

-- 3. consultant_blueprints — tribal strategy agent library
create table if not exists public.consultant_blueprints (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_name text not null,
  expertise_domain text not null,
  description text,
  skill_definition jsonb default '{}'::jsonb,
  hourly_rate_equivalent_usd numeric default 0,
  usage_count integer default 0,
  avg_rating numeric,
  tribal_verified boolean default false,
  status text not null default 'draft', -- draft | published | verified | deprecated
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists consultant_blueprints_domain_idx on consultant_blueprints(expertise_domain);
create index if not exists consultant_blueprints_status_idx on consultant_blueprints(status);

-- 4. observability_refund_ledger — data sanitization savings tracking
create table if not exists public.observability_refund_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_system text not null,
  original_data_volume_mb numeric,
  sanitized_data_volume_mb numeric,
  reduction_pct numeric,
  garbage_categories_pruned jsonb default '[]'::jsonb,
  vendor_cost_before_usd numeric,
  vendor_cost_after_usd numeric,
  monthly_savings_usd numeric,
  sanitization_rules_applied integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists observability_refund_ledger_user_source_idx on observability_refund_ledger(user_id, source_system);

-- 5. RLS
alter table wasm_artifacts enable row level security;
create policy wasm_artifacts_owner_rw on wasm_artifacts for all using (user_id = auth.uid());

alter table visual_web_logs enable row level security;
create policy visual_web_logs_owner_rw on visual_web_logs for all using (user_id = auth.uid());

alter table consultant_blueprints enable row level security;
create policy consultant_blueprints_creator_rw on consultant_blueprints for all using (creator_user_id = auth.uid());
create policy consultant_blueprints_read_published on consultant_blueprints for select using (auth.role() = 'authenticated' and status in ('published', 'verified'));

alter table observability_refund_ledger enable row level security;
create policy observability_refund_ledger_owner_rw on observability_refund_ledger for all using (user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_consultant_blueprints_updated_at on consultant_blueprints;
create trigger set_consultant_blueprints_updated_at before update on consultant_blueprints for each row execute function set_updated_at();

-- === 20260327600000_diplomatic_integrity.sql ===
-- Diplomatic Integrity: Proxy Influence Auditing & Handshake Sovereignty
-- Tools #161-164

-- Proxy influence tracking
create table if not exists public.proxy_influence_audit (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid references auth.users(id) on delete cascade,
  subject_name text not null,
  relationship_type text not null default 'friend',
  external_financial_incentives jsonb default '[]',
  bias_indicators jsonb default '{}',
  influence_score numeric default 0,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  linked_entity text,
  linked_country text,
  verification_status text not null default 'pending' check (verification_status in ('pending','investigating','verified_clean','verified_compromised','archived')),
  evidence_refs jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.proxy_influence_audit enable row level security;
create policy "Users manage own proxy audits" on public.proxy_influence_audit for all using (analyst_user_id = auth.uid());
create index idx_proxy_influence_risk on public.proxy_influence_audit(risk_level);
create index idx_proxy_influence_status on public.proxy_influence_audit(verification_status);

-- Diplomatic lure verification
create table if not exists public.diplomatic_lure_registry (
  id uuid primary key default gen_random_uuid(),
  reviewer_user_id uuid references auth.users(id) on delete cascade,
  lure_label text not null,
  lure_type text not null default 'document' check (lure_type in ('document','meeting_request','introduction','proposal','letter','gift','invitation')),
  claimed_intent text,
  semantic_validity_score numeric default 0,
  proof_of_build_present boolean default false,
  proof_details jsonb default '{}',
  source_entity text,
  source_country text,
  verdict text not null default 'unreviewed' check (verdict in ('unreviewed','legitimate','suspicious','confirmed_lure','rejected')),
  time_saved_minutes integer default 0,
  created_at timestamptz default now()
);

alter table public.diplomatic_lure_registry enable row level security;
create policy "Users manage own lure reviews" on public.diplomatic_lure_registry for all using (reviewer_user_id = auth.uid());
create index idx_diplomatic_lure_verdict on public.diplomatic_lure_registry(verdict);

-- Diplomatic refund ledger
create table if not exists public.diplomatic_refund_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  incident_label text not null,
  time_lost_minutes integer default 0,
  reputational_cost_score numeric default 0,
  financial_exposure_usd numeric default 0,
  root_cause text,
  proxy_audit_id uuid references public.proxy_influence_audit(id),
  lure_id uuid references public.diplomatic_lure_registry(id),
  refund_status text not null default 'calculated' check (refund_status in ('calculated','acknowledged','mitigated','closed')),
  lessons_learned text,
  created_at timestamptz default now()
);

alter table public.diplomatic_refund_ledger enable row level security;
create policy "Users manage own diplomatic refunds" on public.diplomatic_refund_ledger for all using (user_id = auth.uid());

-- Handshake sovereignty gates
create table if not exists public.handshake_sovereignty_gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_label text not null,
  participants jsonb not null default '[]',
  artifact_verified boolean default false,
  artifact_id text,
  biometric_pulse_confirmed boolean default false,
  stakes_level text not null default 'standard' check (stakes_level in ('standard','elevated','high','critical','sovereign')),
  sovereignty_score numeric default 0,
  session_status text not null default 'pending' check (session_status in ('pending','verified','in_progress','completed','rejected','escalated')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.handshake_sovereignty_gates enable row level security;
create policy "Users manage own handshake gates" on public.handshake_sovereignty_gates for all using (user_id = auth.uid());
create index idx_handshake_stakes on public.handshake_sovereignty_gates(stakes_level);

-- === 20260327700000_blockade_bypass.sql ===
-- Blockade Bypass: Vendor Openness Audit & Sovereign MCP Infrastructure
-- Tools #165-168

-- Vendor openness audit
create table if not exists public.vendor_openness_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  vendor_name text not null,
  product_name text not null,
  api_availability text not null default 'none' check (api_availability in ('full','partial','read_only','none','deprecated')),
  mcp_support boolean default false,
  rate_limit_hits_monthly integer default 0,
  monthly_cost_usd numeric default 0,
  friction_score numeric default 0,
  lock_in_tariff_usd numeric default 0,
  bypass_method text check (bypass_method in ('api','visual','mcp_local','hybrid','none')),
  bypass_success_rate numeric default 0,
  last_audit_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.vendor_openness_audit enable row level security;
create policy "Users manage own vendor audits" on public.vendor_openness_audit for all using (user_id = auth.uid());
create index idx_vendor_friction on public.vendor_openness_audit(friction_score desc);

-- Sovereign MCP node registry
create table if not exists public.sovereign_mcp_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  node_name text not null,
  hardware_type text not null default 'cloud' check (hardware_type in ('one_charge','lambda','cloud','edge','sovereign_stone','custom')),
  endpoint_url text,
  connected_apps jsonb default '[]',
  uptime_pct numeric default 100,
  requests_served integer default 0,
  last_health_check_at timestamptz,
  status text not null default 'provisioning' check (status in ('provisioning','online','degraded','offline','decommissioned')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sovereign_mcp_nodes enable row level security;
create policy "Users manage own MCP nodes" on public.sovereign_mcp_nodes for all using (user_id = auth.uid());
create index idx_mcp_status on public.sovereign_mcp_nodes(status);

-- Visual bypass registry
create table if not exists public.visual_bypass_registry (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  target_app text not null,
  target_workflow text not null,
  interaction_blueprint jsonb not null default '[]',
  steps_count integer default 0,
  success_rate numeric default 0,
  avg_execution_time_ms integer default 0,
  model_used text default 'molmo-8b',
  tribal_shared boolean default false,
  usage_count integer default 0,
  status text not null default 'draft' check (status in ('draft','tested','verified','deprecated')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.visual_bypass_registry enable row level security;
create policy "Users manage own visual bypasses" on public.visual_bypass_registry for all using (creator_user_id = auth.uid());
create policy "Authenticated read shared bypasses" on public.visual_bypass_registry for select using (tribal_shared = true and auth.role() = 'authenticated');
create index idx_visual_bypass_app on public.visual_bypass_registry(target_app);

-- Agentic intent certificates
create table if not exists public.agentic_intent_certs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_name text not null,
  intent_description text not null,
  biometric_pulse_hash text,
  artifact_id text,
  certification_level text not null default 'standard' check (certification_level in ('standard','verified','sovereign','tribal_broadcast')),
  is_certified boolean default false,
  outgoing_target text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

alter table public.agentic_intent_certs enable row level security;
create policy "Users manage own intent certs" on public.agentic_intent_certs for all using (user_id = auth.uid());
create index idx_intent_cert_level on public.agentic_intent_certs(certification_level);

-- === 20260327800000_forensic_accountability.sql ===
-- Forensic Accountability: Justice Tariff Refund & Network Hygiene
-- Tools #169-172

-- Accountability gap tracking
create table if not exists public.accountability_gap_audit (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid references auth.users(id) on delete cascade,
  subject_label text not null,
  gap_type text not null default 'prosecution_stall' check (gap_type in ('prosecution_stall','regulatory_capture','institutional_latency','evidence_suppression','jurisdictional_void','whistleblower_retaliation')),
  institutional_body text,
  evidence_sources jsonb default '[]',
  severity_score numeric default 0,
  estimated_delay_years numeric default 0,
  financial_exposure_usd numeric default 0,
  linked_proxy_audit_id uuid,
  status text not null default 'identified' check (status in ('identified','investigating','documented','escalated','resolved','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.accountability_gap_audit enable row level security;
create policy "Users manage own accountability audits" on public.accountability_gap_audit for all using (analyst_user_id = auth.uid());
create index idx_accountability_severity on public.accountability_gap_audit(severity_score desc);
create index idx_accountability_status on public.accountability_gap_audit(status);

-- Economic sanction ledger
create table if not exists public.economic_sanction_ledger (
  id uuid primary key default gen_random_uuid(),
  enforcer_user_id uuid references auth.users(id) on delete cascade,
  target_node_label text not null,
  sanction_type text not null default 'token_freeze' check (sanction_type in ('token_freeze','compute_revoke','tribal_exclusion','staking_suspend','full_lockout')),
  reason text not null,
  linked_proxy_audit_id uuid,
  linked_accountability_id uuid references public.accountability_gap_audit(id),
  frozen_token_amount numeric default 0,
  sanction_status text not null default 'pending' check (sanction_status in ('pending','active','appealed','lifted','permanent')),
  appeal_deadline_at timestamptz,
  enforced_at timestamptz,
  lifted_at timestamptz,
  created_at timestamptz default now()
);

alter table public.economic_sanction_ledger enable row level security;
create policy "Users manage own sanctions" on public.economic_sanction_ledger for all using (enforcer_user_id = auth.uid());
create index idx_sanction_status on public.economic_sanction_ledger(sanction_status);

-- Hidden narrative reconstructions
create table if not exists public.hidden_narrative_reconstructions (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid references auth.users(id) on delete cascade,
  dataset_label text not null,
  original_redaction_pct numeric default 0,
  reconstruction_confidence numeric default 0,
  predicted_entities jsonb default '[]',
  predicted_connections jsonb default '[]',
  predicted_timeline jsonb default '[]',
  lewm_model_used text default 'latent-narrative-v1',
  verification_status text not null default 'draft' check (verification_status in ('draft','low_confidence','medium_confidence','high_confidence','verified','retracted')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.hidden_narrative_reconstructions enable row level security;
create policy "Users manage own reconstructions" on public.hidden_narrative_reconstructions for all using (analyst_user_id = auth.uid());

-- Network hygiene reports
create table if not exists public.network_hygiene_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  network_size integer default 0,
  high_risk_nodes integer default 0,
  medium_risk_nodes integer default 0,
  low_risk_nodes integer default 0,
  risk_categories jsonb default '{}',
  separation_degrees_to_risk numeric default 0,
  human_alpha_impact_score numeric default 0,
  recommendations jsonb default '[]',
  report_status text not null default 'generated' check (report_status in ('generated','reviewed','actioned','archived')),
  created_at timestamptz default now()
);

alter table public.network_hygiene_reports enable row level security;
create policy "Users manage own hygiene reports" on public.network_hygiene_reports for all using (user_id = auth.uid());

-- === 20260328000000_morpheus_protocol.sql ===
-- Morpheus Protocol: Biometric Sovereignty & Vibe-Hardened Security
-- Tools #177-180

-- Biometric masking sessions
create table if not exists public.biometric_masking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  masking_type text not null default 'iris' check (masking_type in ('iris','facial','gait','voice','fingerprint','multi_modal')),
  threat_source text,
  frequency_band text,
  masking_method text default 'adversarial_glint' check (masking_method in ('adversarial_glint','noise_injection','pattern_disruption','frequency_shift','holographic')),
  effectiveness_score numeric default 0,
  duration_minutes integer default 0,
  hardware_used text,
  status text not null default 'active' check (status in ('active','completed','failed','archived')),
  created_at timestamptz default now()
);

alter table public.biometric_masking_sessions enable row level security;
create policy "Users manage own masking sessions" on public.biometric_masking_sessions for all using (user_id = auth.uid());

-- Ethical deadlock resolutions
create table if not exists public.ethical_deadlock_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  scenario_label text not null,
  red_flag_type text not null default 'violence' check (red_flag_type in ('violence','self_harm','exploitation','fraud','terrorism','other')),
  tribal_ethical_code_ref text,
  action_taken text not null,
  resolution_time_ms integer default 0,
  escalated_to_human boolean default false,
  human_override_applied boolean default false,
  outcome text default 'resolved' check (outcome in ('resolved','escalated','overridden','logged_only','false_positive')),
  created_at timestamptz default now()
);

alter table public.ethical_deadlock_resolutions enable row level security;
create policy "Users manage own ethical resolutions" on public.ethical_deadlock_resolutions for all using (user_id = auth.uid());

-- Vibe code security audits
create table if not exists public.vibe_code_security_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  codebase_label text not null,
  scan_engine text default 'claude_code_security',
  total_files_scanned integer default 0,
  high_severity_count integer default 0,
  medium_severity_count integer default 0,
  low_severity_count integer default 0,
  auto_fixed_count integer default 0,
  vulnerabilities jsonb default '[]',
  scan_duration_seconds integer default 0,
  passed boolean default false,
  created_at timestamptz default now()
);

alter table public.vibe_code_security_audits enable row level security;
create policy "Users manage own security audits" on public.vibe_code_security_audits for all using (user_id = auth.uid());
create index idx_vibe_audit_passed on public.vibe_code_security_audits(passed);

-- Solid-state power configs (Donut Labs)
create table if not exists public.solid_state_power_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_label text not null,
  battery_type text not null default 'solid_state' check (battery_type in ('solid_state','donut_labs','sodium_ion','graphene','lithium_solid','experimental')),
  capacity_kwh numeric default 0,
  charge_time_minutes numeric default 0,
  cooling_method text default 'air' check (cooling_method in ('air','liquid','passive','phase_change','cryogenic')),
  weight_reduction_kg numeric default 0,
  runtime_hours numeric default 0,
  target_device text,
  operational_status text not null default 'configured' check (operational_status in ('configured','charging','operational','degraded','replaced')),
  created_at timestamptz default now()
);

alter table public.solid_state_power_configs enable row level security;
create policy "Users manage own power configs" on public.solid_state_power_configs for all using (user_id = auth.uid());

-- === 20260329000000_workflow_automation.sql ===
-- LinkedIn Workflow Automation: invitation lifecycle, connection scoring,
-- feed intelligence, external contact import, DM response prioritization

-- 1. Invitation Tracking
create table if not exists public.invitation_tracking (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  profile_name text,
  invitation_status text not null default 'pending'
    check (invitation_status in ('pending','accepted','declined','expired','culled','reinvited')),
  sent_at timestamptz not null default now(),
  importance_score integer default 0,
  reinvite_at timestamptz,
  reinvite_note text,
  cull_reason text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.invitation_tracking enable row level security;
create policy "owner_invitation_tracking" on public.invitation_tracking
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_invitation_tracking_status on public.invitation_tracking (owner_user_id, invitation_status);
create index idx_invitation_tracking_reinvite on public.invitation_tracking (owner_user_id, reinvite_at)
  where reinvite_at is not null;

-- 2. Connection Scoring
create table if not exists public.connection_scoring (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  profile_name text,
  value_score integer default 0,
  engagement_score integer default 0,
  alignment_score integer default 0,
  bot_probability real default 0,
  bot_signals jsonb default '{}',
  last_interaction_at timestamptz,
  last_scored_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, profile_id)
);
alter table public.connection_scoring enable row level security;
create policy "owner_connection_scoring" on public.connection_scoring
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_connection_scoring_value on public.connection_scoring (owner_user_id, value_score desc);
create index idx_connection_scoring_bot on public.connection_scoring (owner_user_id, bot_probability desc)
  where bot_probability > 0.5;

-- 3. Feed Intelligence
create table if not exists public.feed_intelligence (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  post_url text,
  author_profile_id text,
  author_name text,
  content_preview text,
  sentiment text default 'neutral'
    check (sentiment in ('positive','negative','neutral','mixed')),
  importance integer default 5,
  action_items jsonb default '[]',
  categories text[] default '{}',
  repost_candidate boolean default false,
  repost_commentary text,
  invite_author boolean default false,
  analyzed_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.feed_intelligence enable row level security;
create policy "owner_feed_intelligence" on public.feed_intelligence
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_feed_intelligence_importance on public.feed_intelligence (owner_user_id, importance desc);
create index idx_feed_intelligence_repost on public.feed_intelligence (owner_user_id, repost_candidate)
  where repost_candidate = true;

-- 4. External Contact Lists
create table if not exists public.external_contact_lists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_name text not null,
  source_url text,
  contact_name text not null,
  contact_title text,
  contact_org text,
  matched_profile_id text,
  match_confidence real default 0,
  match_status text default 'pending'
    check (match_status in ('pending','matched','unmatched','invited','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.external_contact_lists enable row level security;
create policy "owner_external_contact_lists" on public.external_contact_lists
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_external_contacts_status on public.external_contact_lists (owner_user_id, match_status);

-- 5. DM Response Queue
create table if not exists public.dm_response_queue (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text,
  sender_profile_id text,
  sender_name text,
  message_preview text,
  priority integer default 5,
  sentiment text default 'neutral'
    check (sentiment in ('positive','negative','neutral','mixed','urgent')),
  suggested_reply text,
  response_status text default 'pending'
    check (response_status in ('pending','drafted','sent','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dm_response_queue enable row level security;
create policy "owner_dm_response_queue" on public.dm_response_queue
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_dm_response_priority on public.dm_response_queue (owner_user_id, priority desc)
  where response_status = 'pending';

-- === 20260329100000_dns_rsi_ascent.sql ===
-- DNS Sovereign Resolver + RSI Singularity Ascent

-- 1. Sovereign DNS zones
create table if not exists public.sovereign_dns_zones (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  zone_name text not null,
  zone_type text not null default 'primary' check (zone_type in ('primary','secondary','rpz','forward')),
  encryption_protocol text default 'doq' check (encryption_protocol in ('dot','doh','doq','plain')),
  dnssec_enabled boolean default true,
  signing_algorithm text default 'ed25519',
  artifact_signer_id uuid,
  rpz_threat_count integer default 0,
  dangling_records_culled integer default 0,
  status text default 'active' check (status in ('active','disabled','culled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sovereign_dns_zones enable row level security;
create policy "owner_dns_zones" on public.sovereign_dns_zones for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- 2. Agent parallel workloads (million-agent scaling)
create table if not exists public.agent_parallel_workloads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sprint_name text not null,
  agent_count integer not null default 1,
  max_agents integer default 10000,
  evaluation_function text,
  evaluation_threshold numeric default 0.95,
  basepower_watts_allocated numeric default 0,
  status text default 'provisioning' check (status in ('provisioning','running','completed','failed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  results jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_parallel_workloads enable row level security;
create policy "owner_agent_workloads" on public.agent_parallel_workloads for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- 3. RSI learning slope (recursive self-improvement tracking)
create table if not exists public.rsi_learning_slope (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  measurement_date date not null default current_date,
  reasoning_depth_score numeric default 0,
  tokens_per_insight numeric default 0,
  self_improvement_rate numeric default 0,
  human_direction_rate numeric default 100,
  autonomy_pct numeric default 0,
  singularity_distance_estimate text,
  slope_status text default 'linear' check (slope_status in ('linear','accelerating','exponential','vertical')),
  created_at timestamptz not null default now()
);
alter table public.rsi_learning_slope enable row level security;
create policy "owner_rsi_slope" on public.rsi_learning_slope for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_rsi_slope_date on public.rsi_learning_slope (owner_user_id, measurement_date desc);

-- 4. Hardware competitiveness index
create table if not exists public.hardware_competitiveness_index (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('actuators','lithography','photonics','batteries','compute','robotics','sensors')),
  tribal_capability_score integer default 0,
  global_benchmark_score integer default 0,
  delta_pct numeric default 0,
  supply_chain_risk text default 'medium' check (supply_chain_risk in ('low','medium','high','critical')),
  notes text,
  assessed_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.hardware_competitiveness_index enable row level security;
create policy "owner_hardware_index" on public.hardware_competitiveness_index for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- === 20260329200000_nuance_resilience.sql ===
-- Nuance & Resilience: supporting schema for circuit breakers #208-214

create table if not exists public.thermodynamic_policy (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  max_token_burn_rate numeric not null default 1000,
  max_basepower_watts numeric not null default 5000,
  cooldown_minutes integer default 15,
  joules_per_outcome_threshold numeric default 100,
  low_inference_mode boolean default false,
  policy_status text default 'active' check (policy_status in ('active','paused','emergency')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.thermodynamic_policy enable row level security;
create policy "owner_thermo_policy" on public.thermodynamic_policy for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.shadow_decision_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_scope text not null check (decision_scope in ('routine','moderate','strategic')),
  decision_summary text not null,
  alignment_confidence numeric default 0,
  auto_executed boolean default false,
  requires_review boolean default false,
  chairman_verdict text,
  created_at timestamptz not null default now()
);
alter table public.shadow_decision_logs enable row level security;
create policy "owner_shadow_decisions" on public.shadow_decision_logs for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_shadow_decisions_review on public.shadow_decision_logs (owner_user_id, requires_review) where requires_review = true;

create table if not exists public.fulfillment_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid,
  happiness_score numeric default 50,
  meaning_score numeric default 50,
  purpose_alignment_pct numeric default 0,
  notes text,
  measured_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.fulfillment_ledger enable row level security;
create policy "owner_fulfillment" on public.fulfillment_ledger for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.ghost_state_reconciliation (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  command_id text not null,
  predicted_result jsonb default '{}',
  actual_result jsonb,
  latency_ms integer default 2500,
  reconciled boolean default false,
  reconciled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ghost_state_reconciliation enable row level security;
create policy "owner_ghost_state" on public.ghost_state_reconciliation for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- === 20260329300000_sovereign_health_atoms.sql ===
-- Sovereign Health & Atoms: physical supply chain, temporal mapping, credentials

create table if not exists public.atomic_inventory (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  element_name text not null,
  element_symbol text,
  category text default 'raw' check (category in ('raw','refined','composite','isotope','synthetic')),
  quantity_kg numeric default 0,
  source_location text,
  supply_chain_status text default 'available' check (supply_chain_status in ('available','scarce','critical','embargo','lunar')),
  estimated_cost_per_kg_usd numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.atomic_inventory enable row level security;
create policy "owner_atomic_inv" on public.atomic_inventory for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.temporal_map (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  system_epoch_ms bigint not null,
  biological_timestamp timestamptz not null default now(),
  agent_actions_batched integer default 0,
  compression_ratio numeric default 1,
  review_status text default 'pending' check (review_status in ('pending','reviewed','skipped')),
  summary text,
  created_at timestamptz not null default now()
);
alter table public.temporal_map enable row level security;
create policy "owner_temporal_map" on public.temporal_map for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.fulfillment_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  mission_name text,
  purpose_increased boolean default false,
  fulfillment_yield numeric default 0,
  burnout_risk numeric default 0,
  rest_recommended boolean default false,
  biometric_stress_level numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.fulfillment_metrics enable row level security;
create policy "owner_fulfillment_metrics" on public.fulfillment_metrics for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.zk_reputation_vault (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  credential_type text not null check (credential_type in ('proof_of_build','skill_level','tribal_rank','mission_complete','trade_certification')),
  credential_name text not null,
  credential_level integer default 1,
  proof_hash text,
  verifiable boolean default true,
  issued_at timestamptz default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.zk_reputation_vault enable row level security;
create policy "owner_zk_vault" on public.zk_reputation_vault for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- === 20260329400000_validation_integrity.sql ===
-- Validation & Integrity: objective functions, reasoning audit, physical verification, human gates

create table if not exists public.objective_functions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_name text not null,
  target_variables jsonb not null default '[]',
  constraints jsonb default '[]',
  optimization_direction text default 'maximize' check (optimization_direction in ('maximize','minimize','target','pareto')),
  success_threshold numeric default 0.95,
  current_best_score numeric default 0,
  iterations_completed integer default 0,
  status text default 'draft' check (status in ('draft','active','converging','solved','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.objective_functions enable row level security;
create policy "owner_obj_functions" on public.objective_functions for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.reasoning_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  solution_id text,
  reasoning_chain jsonb not null default '[]',
  adversarial_critique text,
  purity_score numeric default 0,
  is_genuine_reasoning boolean default true,
  shortcut_detected boolean default false,
  reproducible_by_quarantine boolean,
  audited_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.reasoning_audit_logs enable row level security;
create policy "owner_reasoning_audit" on public.reasoning_audit_logs for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_reasoning_audit_purity on public.reasoning_audit_logs (owner_user_id, purity_score desc);

create table if not exists public.physical_verification_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  device_type text not null check (device_type in ('xenobot','vehicle','smr','drone','industrial','neo_lab')),
  proposed_action text not null,
  simulation_result jsonb default '{}',
  safety_score numeric default 0,
  physics_violation_detected boolean default false,
  approved boolean default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.physical_verification_states enable row level security;
create policy "owner_phys_verify" on public.physical_verification_states for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.human_alpha_gates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  gate_type text not null check (gate_type in ('mission_approval','physical_actuation','budget_release','tribal_decision','emergency_override')),
  artifact_signature_hash text,
  biometric_confirmed boolean default false,
  validation_summary text,
  decision text check (decision in ('approved','rejected','deferred')),
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.human_alpha_gates enable row level security;
create policy "owner_alpha_gates" on public.human_alpha_gates for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_alpha_gates_type on public.human_alpha_gates (owner_user_id, gate_type, signed_at desc);

