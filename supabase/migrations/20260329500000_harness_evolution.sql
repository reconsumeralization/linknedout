-- Harness Evolution: aesthetic calibration, verification contracts, scaffold pruning, visual QA

create table if not exists public.aesthetic_calibrations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  taste_criteria jsonb not null default '[]',
  penalty_patterns text[] default '{}',
  reward_patterns text[] default '{}',
  chairman_vector_ref uuid,
  calibration_score numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.aesthetic_calibrations enable row level security;
create policy "owner_aesthetics" on public.aesthetic_calibrations for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.verification_contracts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contract_name text not null,
  generator_agent text default 'cto',
  evaluator_agent text default 'cco',
  edge_cases jsonb not null default '[]',
  acceptance_criteria jsonb not null default '[]',
  generator_signed boolean default false,
  evaluator_signed boolean default false,
  status text default 'draft' check (status in ('draft','negotiating','signed','executing','completed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.verification_contracts enable row level security;
create policy "owner_contracts" on public.verification_contracts for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.scaffold_audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  scaffold_name text not null,
  was_load_bearing boolean default true,
  model_version_tested text,
  test_passed_without boolean default false,
  pruned boolean default false,
  pruned_at timestamptz,
  token_overhead_saved integer default 0,
  created_at timestamptz not null default now()
);
alter table public.scaffold_audit_log enable row level security;
create policy "owner_scaffold_audit" on public.scaffold_audit_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.visual_qa_results (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  build_id text,
  test_url text,
  screenshots_taken integer default 0,
  interactions_tested integer default 0,
  bugs_found integer default 0,
  bug_details jsonb default '[]',
  overall_score numeric default 0,
  passed boolean default false,
  tested_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.visual_qa_results enable row level security;
create policy "owner_visual_qa" on public.visual_qa_results for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
