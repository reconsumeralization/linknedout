-- Nuance & Resilience: supporting schema for circuit breakers #208-214

create table if not exists public.thermodynamic_policy (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  max_token_burn_rate numeric not null default 1000,
  max_basepower_watts numeric not null default 5000,
  cooldown_minutes integer default 15,
  joules_per_outcome_threshold numeric default 100,
  low_inference_mode boolean default false,
  policy_status text default 'active' check (policy_status in ('active','paused','emergency')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.thermodynamic_policy enable row level security;
create policy "owner_thermo_policy" on public.thermodynamic_policy for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.shadow_decision_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_scope text not null check (decision_scope in ('routine','moderate','strategic')),
  decision_summary text not null,
  alignment_confidence numeric default 0,
  auto_executed boolean default false,
  requires_review boolean default false,
  chairman_verdict text,
  created_at timestamptz not null default now()
);
alter table public.shadow_decision_logs enable row level security;
create policy "owner_shadow_decisions" on public.shadow_decision_logs for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_shadow_decisions_review on public.shadow_decision_logs (owner_user_id, requires_review) where requires_review = true;

create table if not exists public.fulfillment_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid,
  happiness_score numeric default 50,
  meaning_score numeric default 50,
  purpose_alignment_pct numeric default 0,
  notes text,
  measured_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.fulfillment_ledger enable row level security;
create policy "owner_fulfillment" on public.fulfillment_ledger for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.ghost_state_reconciliation (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  command_id text not null,
  predicted_result jsonb default '{}',
  actual_result jsonb,
  latency_ms integer default 2500,
  reconciled boolean default false,
  reconciled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ghost_state_reconciliation enable row level security;
create policy "owner_ghost_state" on public.ghost_state_reconciliation for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
