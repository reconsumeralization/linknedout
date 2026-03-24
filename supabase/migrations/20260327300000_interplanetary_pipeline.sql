-- =============================================================================
-- Interplanetary Pipeline: NASA Ignition & SR1 Freedom — Tools #146-149
-- =============================================================================

-- 1. DEREGULATED POLICY LEDGER: bureaucratic blocks mapped to logical execution paths
create table if not exists public.deregulated_policy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_section text not null,
  original_regulation text,
  deregulation_status text default 'identified',    -- identified | analyzed | automated | executed | archived
  execution_path jsonb default '{}'::jsonb,
  compliance_agent_id uuid,
  time_saved_hours numeric default 0,
  cost_saved_usd numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deregulated_policy_ledger_status_idx on deregulated_policy_ledger(deregulation_status);

-- 2. LUNAR BUILD PHASES: tribal staking in moon base construction phases
create table if not exists public.lunar_build_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase text not null default 'experimentation',    -- experimentation | infrastructure | permanence
  mission_name text not null,
  staked_tokens numeric default 0,
  contribution_type text,                           -- compute | design | engineering | science | logistics
  deliverable_description text,
  status text default 'proposed',                   -- proposed | funded | in_progress | delivered | verified
  verification_proof jsonb,
  cosmic_equity_pct numeric default 0,
  created_at timestamptz not null default now()
);
create index if not exists lunar_build_phases_phase_status_idx on lunar_build_phases(phase, status);
create index if not exists lunar_build_phases_user_idx on lunar_build_phases(user_id);

-- 3. FISSION POWER TELEMETRY: SR1 Freedom and tribal SMR telemetry sync
create table if not exists public.fission_power_telemetry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'tribal_smr',   -- sr1_freedom | tribal_smr | lunar_rtg | orbital_relay
  power_output_kw numeric,
  thermal_efficiency_pct numeric,
  fuel_remaining_pct numeric,
  uptime_hours numeric default 0,
  telemetry_data jsonb default '{}'::jsonb,
  alert_level text default 'nominal',               -- nominal | advisory | caution | warning | critical
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists fission_power_telemetry_source_alert_idx on fission_power_telemetry(source_type, alert_level);

-- 4. SUPPLY CHAIN MONITORS: vendor velocity and slippage tracking
create table if not exists public.supply_chain_monitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_name text not null,
  contract_description text,
  critical_path_item text,
  scheduled_delivery_date date,
  projected_delivery_date date,
  slippage_days integer default 0,
  status text default 'on_track',                   -- on_track | at_risk | slipping | blocked | resolved | bypassed
  uncomfortable_action_triggered boolean default false,
  reallocation_target text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists supply_chain_monitors_status_idx on supply_chain_monitors(status);
create index if not exists supply_chain_monitors_slippage_idx on supply_chain_monitors(slippage_days desc);

-- 5. ROW LEVEL SECURITY

-- deregulated_policy_ledger: all authenticated can read; user owns insert/update
alter table deregulated_policy_ledger enable row level security;

create policy deregulated_policy_ledger_read on deregulated_policy_ledger
  for select using (true);

create policy deregulated_policy_ledger_insert on deregulated_policy_ledger
  for insert with check (user_id = auth.uid());

create policy deregulated_policy_ledger_update on deregulated_policy_ledger
  for update using (user_id = auth.uid());

-- lunar_build_phases: user owns; all authenticated can read
alter table lunar_build_phases enable row level security;

create policy lunar_build_phases_read on lunar_build_phases
  for select using (true);

create policy lunar_build_phases_owner_insert on lunar_build_phases
  for insert with check (user_id = auth.uid());

create policy lunar_build_phases_owner_update on lunar_build_phases
  for update using (user_id = auth.uid());

-- fission_power_telemetry: user owns
alter table fission_power_telemetry enable row level security;

create policy fission_power_telemetry_owner_all on fission_power_telemetry
  for all using (user_id = auth.uid());

-- supply_chain_monitors: user owns; all authenticated can read
alter table supply_chain_monitors enable row level security;

create policy supply_chain_monitors_read on supply_chain_monitors
  for select using (true);

create policy supply_chain_monitors_owner_insert on supply_chain_monitors
  for insert with check (user_id = auth.uid());

create policy supply_chain_monitors_owner_update on supply_chain_monitors
  for update using (user_id = auth.uid());
