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
