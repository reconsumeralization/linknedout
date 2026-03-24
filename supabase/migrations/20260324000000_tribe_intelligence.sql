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
