-- Cosmological Nuance: admin orchestration, paleo-inference, shadow signals, stealth accretion, signal redshift

create table if not exists public.shadow_signal_map (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  signal_name text not null,
  signal_source text,
  signal_type text default 'shadow' check (signal_type in ('shadow','terminator_line','early_adopter','moores_block','dark_gravity')),
  signal_strength numeric default 0,
  redshift_score numeric default 0,
  is_blue_shifted boolean default false,
  discovery_method text,
  related_profile_ids text[] default '{}',
  detected_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.shadow_signal_map enable row level security;
create policy "owner_shadow_signals" on public.shadow_signal_map for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_shadow_signal_strength on public.shadow_signal_map (owner_user_id, signal_strength desc);

create table if not exists public.stealth_accretion_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('talent','saas_tool','compute','data_source','partnership','inefficiency')),
  resource_name text not null,
  absorption_method text default 'cool' check (absorption_method in ('cool','warm','hot')),
  value_absorbed_usd numeric default 0,
  heat_generated numeric default 0,
  detected_by_competitors boolean default false,
  accreted_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.stealth_accretion_log enable row level security;
create policy "owner_stealth_accretion" on public.stealth_accretion_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.intelligence_rent_locks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  energy_source text not null check (energy_source in ('smr','solar','geothermal','grid','lunar','basepower_syndicate')),
  locked_cost_per_kwh_usd numeric not null,
  lock_duration_years integer default 20,
  compute_capacity_tflops numeric default 0,
  lock_start_date date default current_date,
  lock_end_date date,
  status text default 'active' check (status in ('active','expiring','expired','renewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.intelligence_rent_locks enable row level security;
create policy "owner_rent_locks" on public.intelligence_rent_locks for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
