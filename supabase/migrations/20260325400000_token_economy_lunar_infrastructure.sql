-- =============================================================================
-- Agentic Token Economy + Lunar/Petawatt Infrastructure
-- Compute-as-Equity, Tribal Compute Pools, Lunar Forge, Orbital Assets
-- =============================================================================

-- 1. AGENTIC TOKEN LEDGER: Compute-as-equity tracking
create table if not exists public.agentic_token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_type text not null,              -- compute_credit | cognitive_royalty | tribal_pool | lunar_compute
  amount numeric not null,
  direction text not null,               -- earned | spent | staked | pooled | refunded
  source text,                           -- agent_lab | cognitive_stake | tribal_mission | nvidia_grant | lunar_forge
  description text,
  balance_after numeric,
  created_at timestamptz not null default now()
);
create index if not exists token_user_idx on agentic_token_ledger(user_id);

-- 2. TRIBAL COMPUTE POOLS: Shared compute across 30K network
create table if not exists public.tribal_compute_pools (
  id uuid primary key default gen_random_uuid(),
  pool_name text not null,
  tribe_id text,
  contributor_count integer default 0,
  total_tokens numeric default 0,
  allocated_to text,                     -- mission_id or project description
  infrastructure text default 'cloud',   -- cloud | edge | lunar | photonic
  status text default 'active',          -- active | depleted | archived
  created_at timestamptz not null default now()
);

-- 3. LUNAR INFRASTRUCTURE: Orbital and lunar asset tracking
create table if not exists public.lunar_infrastructure (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null,              -- mass_driver | vacuum_fab | petawatt_node | tribal_satellite | compute_relay
  asset_name text not null,
  location text not null,                -- lunar_surface | earth_orbit | lagrange_point | deep_space
  operational_status text default 'planned', -- planned | under_construction | operational | decommissioned
  compute_capacity_pflops numeric,
  energy_source text,                    -- solar | nuclear | electromagnetic
  gravity_tariff_savings_pct numeric,
  thermal_tariff_savings_pct numeric,
  owned_by text default 'tribal_collective',
  created_at timestamptz not null default now()
);

-- 4. RLS
alter table agentic_token_ledger enable row level security;
create policy token_owner on agentic_token_ledger for all using (user_id = auth.uid());
