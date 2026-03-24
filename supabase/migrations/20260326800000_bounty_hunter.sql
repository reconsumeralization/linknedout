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
