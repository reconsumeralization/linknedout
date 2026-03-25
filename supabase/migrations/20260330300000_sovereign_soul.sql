-- Sovereign Soul: epistemic sovereignty, vertical perception, life review, state independence

create table if not exists public.epistemic_audits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  constraint_type text default 'materialist_bias' check (constraint_type in ('materialist_bias','reductionist','institutional_dogma','cultural_filter','self_imposed')),
  constraint_description text not null,
  data_suppressed text,
  signal_type_ignored text,
  severity numeric default 50,
  resolved boolean default false,
  resolution_notes text,
  created_at timestamptz not null default now()
);
alter table public.epistemic_audits enable row level security;
create policy "owner_epistemic" on public.epistemic_audits for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.vertical_perception_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  perception_type text default 'intuition' check (perception_type in ('intuition','precognition','felt_presence','synchronicity','non_local','dream','flow_state')),
  description text not null,
  signal_strength numeric default 50,
  verified_outcome boolean,
  outcome_description text,
  artifact_captured boolean default false,
  created_at timestamptz not null default now()
);
alter table public.vertical_perception_log enable row level security;
create policy "owner_vertical" on public.vertical_perception_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.life_review_simulations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  intent_description text not null,
  affected_members_count integer default 0,
  love_score numeric default 0,
  harm_score numeric default 0,
  net_fulfillment numeric default 0,
  relational_impact jsonb default '[]',
  recommendation text,
  simulated_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.life_review_simulations enable row level security;
create policy "owner_life_review" on public.life_review_simulations for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.state_independence_proofs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  state_type text default 'agentic' check (state_type in ('agentic','memory','values','identity','legacy')),
  primary_store text not null,
  mirror_store text,
  mirrored boolean default false,
  last_sync_at timestamptz,
  integrity_hash text,
  hardware_independent boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.state_independence_proofs enable row level security;
create policy "owner_state_proofs" on public.state_independence_proofs for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
