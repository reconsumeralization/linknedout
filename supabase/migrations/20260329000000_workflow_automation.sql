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
