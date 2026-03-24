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

-- Critical workflow verification + workflow-shaped egress telemetry
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

create index if not exists mcp_tool_audit_verification_owner_session_idx on public.mcp_tool_audit_events (owner_user_id, session_id, verification_state, created_at desc);
create index if not exists mcp_tool_audit_critical_workflow_class_idx on public.mcp_tool_audit_events (critical_workflow_class, created_at desc);
create index if not exists mcp_tool_audit_egress_shape_approval_idx on public.mcp_tool_audit_events (egress_shape_approval_required, created_at desc);

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

create index if not exists sentinel_alert_dispatches_owner_sent_idx on public.sentinel_alert_dispatches (owner_user_id, last_sent_at desc);
create index if not exists sentinel_alert_dispatches_status_attempt_idx on public.sentinel_alert_dispatches (last_status, last_attempt_at desc);
