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
