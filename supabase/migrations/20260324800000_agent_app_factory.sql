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
