-- =============================================================================
-- Decadal Timeline Milestones + Orbital Pharmaceutical Manufacturing
-- Phase tracking, Orbital Neo Labs, Tribal Pharma, Bio-Sovereignty
-- =============================================================================

-- 1. DECADAL MILESTONES: 2026-2036 timeline tracking per user
create table if not exists public.decadal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase integer not null,                -- 1=Decoupling, 2=Tribal Industrial, 3=Hard-Tech, 4=Post-Gravity
  phase_name text not null,
  milestone_key text not null,
  milestone_description text not null,
  status text default 'pending',         -- pending | in_progress | completed | skipped
  target_date date,
  completed_at timestamptz,
  refund_type text,                      -- labor | capital | energy_health | space_compute
  refund_value text,                     -- "20h/week" | "30% cost reduction" | etc
  created_at timestamptz not null default now(),
  constraint milestone_unique unique (user_id, phase, milestone_key)
);
create index if not exists milestone_user_idx on decadal_milestones(user_id);
create index if not exists milestone_phase_idx on decadal_milestones(phase);

-- 2. ORBITAL NEO LABS: Space-based manufacturing capsules
create table if not exists public.orbital_neo_labs (
  id uuid primary key default gen_random_uuid(),
  lab_name text not null,
  lab_type text not null,                -- pharma_crystallization | protein_folding | material_science | xenobot_culture
  orbit_type text default 'LEO',         -- LEO | GEO | lunar_orbit | deep_space
  operational_status text default 'planned',
  capsule_provider text,                 -- varda | spacex | tribal_collective
  launch_vehicle text,
  microgravity_quality numeric,          -- 0-100 purity score
  current_batch text,
  batch_status text,                     -- loading | in_orbit | crystallizing | reentry | delivered
  owned_by text default 'tribal_collective',
  created_at timestamptz not null default now()
);

-- 3. TRIBAL PHARMA MISSIONS: Collective drug manufacturing staking
create table if not exists public.tribal_pharma_missions (
  id uuid primary key default gen_random_uuid(),
  mission_name text not null,
  target_compound text not null,         -- what's being manufactured
  compound_type text not null,           -- cancer_protein | insulin | supplement | vaccine | custom
  stakers_count integer default 0,
  total_staked_usd numeric default 0,
  orbital_lab_id uuid references orbital_neo_labs(id),
  manufacturing_status text default 'staking', -- staking | funded | launched | crystallizing | reentry | distributed
  purity_score numeric,                  -- space-made purity vs earth baseline
  potency_multiplier numeric default 1,  -- how much more effective vs earth-made
  cost_reduction_pct numeric,            -- savings vs big pharma
  doses_produced integer,
  distributed_to_tribe boolean default false,
  created_at timestamptz not null default now()
);

-- 4. RLS
alter table decadal_milestones enable row level security;
create policy milestone_owner on decadal_milestones for all using (user_id = auth.uid());
