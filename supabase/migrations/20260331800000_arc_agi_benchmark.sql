-- =============================================================================
-- ARC AGI Solver + Self-Improving LLM Benchmark Tables
-- =============================================================================

begin;

-- World rules discovered by the ARC solver during exploration
create table if not exists public.arc_world_rules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id text not null,
  session_id uuid not null,
  rule_text text not null,
  observation text,
  hypothesis text,
  confidence_pct numeric default 50,
  verified boolean default false,
  created_at timestamptz not null default now()
);
alter table public.arc_world_rules enable row level security;
create policy "owner_awr" on public.arc_world_rules for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_arc_rules_session on public.arc_world_rules(session_id);

-- ARC puzzle solving sessions
create table if not exists public.arc_solver_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_id text not null,
  phase text default 'observation',
  total_moves int default 0,
  moves_limit int default 50,
  rules_discovered int default 0,
  win_condition text,
  solved boolean default false,
  solution_moves jsonb default '[]',
  mental_simulations_run int default 0,
  resets_used int default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.arc_solver_sessions enable row level security;
create policy "owner_ass" on public.arc_solver_sessions for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- Self-improving LLM benchmark runs (model vs Opus 4.6 reference)
create table if not exists public.llm_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  challenger_model text not null,
  reference_model text not null default 'claude-opus-4-6',
  task_type text not null,
  task_prompt text not null,
  challenger_response text,
  reference_response text,
  challenger_score numeric default 0,
  reference_score numeric default 0,
  score_delta numeric default 0,
  evaluation_reasoning text,
  improvement_suggestion text,
  latency_challenger_ms int,
  latency_reference_ms int,
  cost_challenger_usd numeric default 0,
  cost_reference_usd numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.llm_benchmark_runs enable row level security;
create policy "owner_lbr" on public.llm_benchmark_runs for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_benchmark_model on public.llm_benchmark_runs(challenger_model);
create index if not exists idx_benchmark_task on public.llm_benchmark_runs(task_type);

-- Improvement plans generated from benchmark analysis
create table if not exists public.llm_improvement_plans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  challenger_model text not null,
  task_type text not null,
  weakness_pattern text not null,
  improvement_strategy text not null,
  prompt_patch text,
  applied boolean default false,
  improvement_pct numeric default 0,
  benchmark_run_ids jsonb default '[]',
  created_at timestamptz not null default now()
);
alter table public.llm_improvement_plans enable row level security;
create policy "owner_lip" on public.llm_improvement_plans for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

commit;
