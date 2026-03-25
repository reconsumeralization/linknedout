-- Economic Sovereign: hedonic regression, effective wealth, workflow decomposition, tribal amenities

create table if not exists public.effective_wealth_index (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  measurement_date date default current_date,
  nominal_wealth_usd numeric default 0,
  quality_adjustment_factor numeric default 1.0,
  effective_wealth_usd numeric default 0,
  productivity_multiplier numeric default 1.0,
  tool_quality_score numeric default 0,
  inflation_offset_pct numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.effective_wealth_index enable row level security;
create policy "owner_eff_wealth" on public.effective_wealth_index for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_eff_wealth_date on public.effective_wealth_index (owner_user_id, measurement_date desc);

create table if not exists public.workflow_hedonic_decomposition (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workflow_name text not null,
  total_hours_per_week numeric default 0,
  alpha_hours numeric default 0,
  mechanical_hours numeric default 0,
  alpha_value_pct numeric default 0,
  mechanical_value_pct numeric default 0,
  automatable_pct numeric default 0,
  career_reset_recommended boolean default false,
  decomposed_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.workflow_hedonic_decomposition enable row level security;
create policy "owner_workflow_hedonic" on public.workflow_hedonic_decomposition for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.tribal_amenity_scores (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  node_profile_id text,
  node_name text,
  amenity_type text default 'expertise' check (amenity_type in ('expertise','infrastructure','energy','capital','research','legal','creative','leadership')),
  amenity_description text,
  proximity_score numeric default 0,
  contributory_value_usd numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.tribal_amenity_scores enable row level security;
create policy "owner_tribal_amenity" on public.tribal_amenity_scores for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.brand_alpha_valuations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  generic_ai_value_usd numeric default 0,
  human_alpha_premium_usd numeric default 0,
  brand_multiplier numeric default 1.0,
  proof_of_build_count integer default 0,
  reputation_score numeric default 0,
  valued_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.brand_alpha_valuations enable row level security;
create policy "owner_brand_alpha" on public.brand_alpha_valuations for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
