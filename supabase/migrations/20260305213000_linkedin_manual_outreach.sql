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
