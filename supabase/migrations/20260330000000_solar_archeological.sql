-- Solar Sovereign + Archeological Sovereign: fusion economics, tribal plasma, legacy transmutation, geological forensics

create table if not exists public.fusion_yield_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workflow_name text not null,
  tasks_merged integer default 2,
  labor_hours_removed numeric default 0,
  energy_tokens_generated numeric default 0,
  missing_mass_pct numeric default 0,
  fusion_grade text default 'hydrogen' check (fusion_grade in ('hydrogen','helium','carbon','iron','supernova')),
  created_at timestamptz not null default now()
);
alter table public.fusion_yield_ledger enable row level security;
create policy "owner_fusion_yield" on public.fusion_yield_ledger for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.tribal_plasma_state (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  plasma_temperature numeric default 0,
  ionization_pct numeric default 0,
  free_electron_count integer default 0,
  mission_pressure text,
  state text default 'gas' check (state in ('solid','liquid','gas','plasma','supercritical')),
  ignited_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.tribal_plasma_state enable row level security;
create policy "owner_plasma_state" on public.tribal_plasma_state for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.execution_path_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  intent_description text not null,
  original_bounce_count integer default 0,
  straightened_path_steps integer default 1,
  time_saved_hours numeric default 0,
  brownian_eliminated boolean default true,
  execution_speed text default 'light' check (execution_speed in ('brownian','convective','radiative','light','instant')),
  created_at timestamptz not null default now()
);
alter table public.execution_path_log enable row level security;
create policy "owner_exec_path" on public.execution_path_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.equilibrium_monitors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  monitor_name text not null,
  gravity_force numeric default 50,
  fusion_force numeric default 50,
  balance_delta numeric default 0,
  equilibrium_status text default 'stable' check (equilibrium_status in ('stable','expanding','contracting','critical','collapse')),
  throttle_applied boolean default false,
  measured_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.equilibrium_monitors enable row level security;
create policy "owner_equilibrium" on public.equilibrium_monitors for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- Archeological Sovereign tables
create table if not exists public.historical_incongruity_audits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  standard_timeline text,
  detected_anomaly text,
  evidence_type text default 'geological' check (evidence_type in ('geological','architectural','linguistic','genetic','astronomical','oral_tradition')),
  incongruity_score numeric default 0,
  verified boolean default false,
  created_at timestamptz not null default now()
);
alter table public.historical_incongruity_audits enable row level security;
create policy "owner_hist_audit" on public.historical_incongruity_audits for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.sealed_memory_basins (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  basin_name text not null,
  data_source text,
  sealed boolean default true,
  alkalinity_score numeric default 7,
  preservation_years_estimate integer default 100,
  outlet_blocked boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sealed_memory_basins enable row level security;
create policy "owner_sealed_basins" on public.sealed_memory_basins for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
