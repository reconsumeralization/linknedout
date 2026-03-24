-- =============================================================================
-- Energy Sovereignty (One-Charge) + Spatial Sovereignty (Autonomous Vehicles)
-- Nuclear Diamond Batteries, Sovereign Fleets, Mobile Neo Labs
-- =============================================================================

-- 1. ONE-CHARGE DEVICES: Atomic/solid-state battery asset tracking
create table if not exists public.one_charge_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_type text not null,             -- artifact | phone | home_storage | vehicle | compute_node | satellite
  device_name text not null,
  battery_tech text not null,            -- nuclear_diamond | solid_state | graphene | hybrid
  capacity_wh numeric,
  lifespan_years numeric default 20,
  current_health_pct numeric default 100,
  years_remaining numeric,
  always_on_ai_enabled boolean default false,
  energy_staked_to_tribe numeric default 0,
  sovereign_pulse_active boolean default false, -- for artifact heartbeat
  created_at timestamptz not null default now()
);
create index if not exists one_charge_user_idx on one_charge_devices(user_id);

-- 2. TRIBAL ENERGY LEDGER: Decentralized energy trading
create table if not exists public.tribal_energy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null,               -- staked | consumed | traded | donated
  amount_kwh numeric not null,
  counterparty text,                     -- tribe_pool | lunar_forge | orbital_lab | member_id
  settlement_method text default 'agentic_tokens',
  token_value numeric,
  created_at timestamptz not null default now()
);
create index if not exists energy_user_idx on tribal_energy_ledger(user_id);

-- 3. SOVEREIGN VEHICLES: Autonomous fleet tracking
create table if not exists public.sovereign_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_name text not null,
  vehicle_type text default 'sedan',     -- sedan | suv | van | truck | pod | delivery_drone
  powertrain text default 'one_charge',  -- one_charge | solid_state | ev_standard
  autonomy_level integer default 5,      -- SAE 0-5
  lifespan_years numeric default 20,
  xenobot_self_healing boolean default false,
  fleet_available boolean default false,  -- available for tribal leasing
  fleet_earnings_usd numeric default 0,
  artifact_key_required boolean default true,
  fortress_mode_enabled boolean default true,
  mobile_neo_lab_active boolean default false,
  driving_hours_reclaimed numeric default 0,
  created_at timestamptz not null default now()
);
create index if not exists vehicle_owner_idx on sovereign_vehicles(owner_user_id);

-- 4. FLEET SESSIONS: Tribal mobility mesh usage
create table if not exists public.fleet_sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references sovereign_vehicles(id) on delete cascade,
  rider_user_id uuid not null references auth.users(id) on delete cascade,
  artifact_verified boolean default false,
  human_alpha_score_required numeric default 50,
  route_type text default 'optimized',   -- optimized | high_signal | scenic | tribal_hub
  duration_minutes integer,
  deep_work_minutes integer default 0,
  settlement_tokens numeric,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- 5. RLS
alter table one_charge_devices enable row level security;
create policy charge_owner on one_charge_devices for all using (user_id = auth.uid());

alter table tribal_energy_ledger enable row level security;
create policy energy_owner on tribal_energy_ledger for all using (user_id = auth.uid());

alter table sovereign_vehicles enable row level security;
create policy vehicle_owner on sovereign_vehicles for all using (owner_user_id = auth.uid());
