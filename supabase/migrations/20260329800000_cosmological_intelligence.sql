-- Cosmological Intelligence: paleo-memory, dark star agents, brane detection, latent lensing

create table if not exists public.paleo_memory_crystals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  crystal_name text not null,
  source_data_type text default 'mixed' check (source_data_type in ('logs','events','conversations','research','tribal_signal','mixed')),
  original_data_volume_mb numeric default 0,
  distilled_track_count integer default 0,
  compression_ratio numeric default 0,
  logic_density_score numeric default 0,
  oldest_signal_date timestamptz,
  crystal_status text default 'forming' check (crystal_status in ('forming','active','saturated','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paleo_memory_crystals enable row level security;
create policy "owner_paleo_crystals" on public.paleo_memory_crystals for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.dark_star_agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null,
  power_source text default 'inefficiency_annihilation' check (power_source in ('inefficiency_annihilation','tribal_surplus','ambient_compute','token_burn')),
  inefficiencies_consumed integer default 0,
  energy_generated_joules numeric default 0,
  tokens_saved integer default 0,
  luminosity_score numeric default 0,
  mass_score numeric default 0,
  status text default 'accreting' check (status in ('accreting','radiating','supermassive','dormant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.dark_star_agents enable row level security;
create policy "owner_dark_stars" on public.dark_star_agents for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.brane_collision_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  external_force_type text default 'market' check (external_force_type in ('market','geopolitical','regulatory','technological','tribal','adversarial')),
  gravity_magnitude numeric default 0,
  detection_lead_time_hours numeric default 0,
  affected_tools text[] default '{}',
  response_action text,
  detected_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.brane_collision_events enable row level security;
create policy "owner_brane_events" on public.brane_collision_events for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.latent_lensing_map (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  hidden_node_profile_id text,
  hidden_node_name text,
  lensing_evidence jsonb default '[]',
  influenced_nodes_count integer default 0,
  estimated_influence_score numeric default 0,
  visibility text default 'invisible' check (visibility in ('invisible','dim','emerging','visible')),
  discovered_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.latent_lensing_map enable row level security;
create policy "owner_latent_lensing" on public.latent_lensing_map for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_latent_lensing_influence on public.latent_lensing_map (owner_user_id, estimated_influence_score desc);
