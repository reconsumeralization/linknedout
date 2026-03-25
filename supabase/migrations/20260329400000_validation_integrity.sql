-- Validation & Integrity: objective functions, reasoning audit, physical verification, human gates

create table if not exists public.objective_functions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_name text not null,
  target_variables jsonb not null default '[]',
  constraints jsonb default '[]',
  optimization_direction text default 'maximize' check (optimization_direction in ('maximize','minimize','target','pareto')),
  success_threshold numeric default 0.95,
  current_best_score numeric default 0,
  iterations_completed integer default 0,
  status text default 'draft' check (status in ('draft','active','converging','solved','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.objective_functions enable row level security;
create policy "owner_obj_functions" on public.objective_functions for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.reasoning_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  solution_id text,
  reasoning_chain jsonb not null default '[]',
  adversarial_critique text,
  purity_score numeric default 0,
  is_genuine_reasoning boolean default true,
  shortcut_detected boolean default false,
  reproducible_by_quarantine boolean,
  audited_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.reasoning_audit_logs enable row level security;
create policy "owner_reasoning_audit" on public.reasoning_audit_logs for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_reasoning_audit_purity on public.reasoning_audit_logs (owner_user_id, purity_score desc);

create table if not exists public.physical_verification_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  device_type text not null check (device_type in ('xenobot','vehicle','smr','drone','industrial','neo_lab')),
  proposed_action text not null,
  simulation_result jsonb default '{}',
  safety_score numeric default 0,
  physics_violation_detected boolean default false,
  approved boolean default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.physical_verification_states enable row level security;
create policy "owner_phys_verify" on public.physical_verification_states for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.human_alpha_gates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  gate_type text not null check (gate_type in ('mission_approval','physical_actuation','budget_release','tribal_decision','emergency_override')),
  artifact_signature_hash text,
  biometric_confirmed boolean default false,
  validation_summary text,
  decision text check (decision in ('approved','rejected','deferred')),
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.human_alpha_gates enable row level security;
create policy "owner_alpha_gates" on public.human_alpha_gates for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_alpha_gates_type on public.human_alpha_gates (owner_user_id, gate_type, signed_at desc);
