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
