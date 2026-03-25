-- DNS Sovereign Resolver + RSI Singularity Ascent

-- 1. Sovereign DNS zones
create table if not exists public.sovereign_dns_zones (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  zone_name text not null,
  zone_type text not null default 'primary' check (zone_type in ('primary','secondary','rpz','forward')),
  encryption_protocol text default 'doq' check (encryption_protocol in ('dot','doh','doq','plain')),
  dnssec_enabled boolean default true,
  signing_algorithm text default 'ed25519',
  artifact_signer_id uuid,
  rpz_threat_count integer default 0,
  dangling_records_culled integer default 0,
  status text default 'active' check (status in ('active','disabled','culled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sovereign_dns_zones enable row level security;
create policy "owner_dns_zones" on public.sovereign_dns_zones for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- 2. Agent parallel workloads (million-agent scaling)
create table if not exists public.agent_parallel_workloads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sprint_name text not null,
  agent_count integer not null default 1,
  max_agents integer default 10000,
  evaluation_function text,
  evaluation_threshold numeric default 0.95,
  basepower_watts_allocated numeric default 0,
  status text default 'provisioning' check (status in ('provisioning','running','completed','failed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  results jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_parallel_workloads enable row level security;
create policy "owner_agent_workloads" on public.agent_parallel_workloads for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- 3. RSI learning slope (recursive self-improvement tracking)
create table if not exists public.rsi_learning_slope (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  measurement_date date not null default current_date,
  reasoning_depth_score numeric default 0,
  tokens_per_insight numeric default 0,
  self_improvement_rate numeric default 0,
  human_direction_rate numeric default 100,
  autonomy_pct numeric default 0,
  singularity_distance_estimate text,
  slope_status text default 'linear' check (slope_status in ('linear','accelerating','exponential','vertical')),
  created_at timestamptz not null default now()
);
alter table public.rsi_learning_slope enable row level security;
create policy "owner_rsi_slope" on public.rsi_learning_slope for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_rsi_slope_date on public.rsi_learning_slope (owner_user_id, measurement_date desc);

-- 4. Hardware competitiveness index
create table if not exists public.hardware_competitiveness_index (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('actuators','lithography','photonics','batteries','compute','robotics','sensors')),
  tribal_capability_score integer default 0,
  global_benchmark_score integer default 0,
  delta_pct numeric default 0,
  supply_chain_risk text default 'medium' check (supply_chain_risk in ('low','medium','high','critical')),
  notes text,
  assessed_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.hardware_competitiveness_index enable row level security;
create policy "owner_hardware_index" on public.hardware_competitiveness_index for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
