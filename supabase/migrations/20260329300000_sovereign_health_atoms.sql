do $$
begin
  create table if not exists public.atomic_inventory (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    element_name text not null,
    element_symbol text,
    category text default 'raw' check (category in ('raw', 'refined', 'composite', 'isotope', 'synthetic')),
    quantity_kg numeric default 0,
    source_location text,
    supply_chain_status text default 'available' check (supply_chain_status in ('available', 'scarce', 'critical', 'embargo', 'lunar')),
    estimated_cost_per_kg_usd numeric,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  alter table public.atomic_inventory enable row level security;
  drop policy if exists "owner_atomic_inv" on public.atomic_inventory;
  create policy "owner_atomic_inv" on public.atomic_inventory for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

  create table if not exists public.temporal_map (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    system_epoch_ms bigint not null,
    biological_timestamp timestamptz not null default now(),
    agent_actions_batched integer default 0,
    compression_ratio numeric default 1,
    review_status text default 'pending' check (review_status in ('pending', 'reviewed', 'skipped')),
    summary text,
    created_at timestamptz not null default now()
  );
  alter table public.temporal_map enable row level security;
  drop policy if exists "owner_temporal_map" on public.temporal_map;
  create policy "owner_temporal_map" on public.temporal_map for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

  create table if not exists public.fulfillment_metrics (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    project_id uuid,
    mission_name text,
    purpose_increased boolean default false,
    fulfillment_yield numeric default 0,
    burnout_risk numeric default 0,
    rest_recommended boolean default false,
    biometric_stress_level numeric default 0,
    created_at timestamptz not null default now()
  );
  alter table public.fulfillment_metrics enable row level security;
  drop policy if exists "owner_fulfillment_metrics" on public.fulfillment_metrics;
  create policy "owner_fulfillment_metrics" on public.fulfillment_metrics for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

  create table if not exists public.zk_reputation_vault (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    credential_type text not null check (credential_type in ('proof_of_build', 'skill_level', 'tribal_rank', 'mission_complete', 'trade_certification')),
    credential_name text not null,
    credential_level integer default 1,
    proof_hash text,
    verifiable boolean default true,
    issued_at timestamptz default now(),
    expires_at timestamptz,
    created_at timestamptz not null default now()
  );
  alter table public.zk_reputation_vault enable row level security;
  drop policy if exists "owner_zk_vault" on public.zk_reputation_vault;
  create policy "owner_zk_vault" on public.zk_reputation_vault for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
end $$;
