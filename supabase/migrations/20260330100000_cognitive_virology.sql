-- Cognitive Virology: memetic triage, integrous memes, identity air-gaps, viral R0

create table if not exists public.memetic_audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  content_source text,
  content_preview text,
  viral_shortcuts_detected text[] default '{}',
  receptor_matches text[] default '{}',
  infection_stage text default 'attach' check (infection_stage in ('attach','enter','replicate','defend','transmit','neutralized')),
  threat_score numeric default 0,
  identity_anchor_detected boolean default false,
  action_taken text default 'flagged' check (action_taken in ('flagged','quarantined','neutralized','passed','escalated')),
  audited_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.memetic_audit_log enable row level security;
create policy "owner_memetic_audit" on public.memetic_audit_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_memetic_threat on public.memetic_audit_log (owner_user_id, threat_score desc);

create table if not exists public.integrous_memes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  meme_title text not null,
  content text not null,
  hook_type text default 'unfinished_business' check (hook_type in ('unfinished_business','validation_function','curiosity_gap','tribal_signal','proof_of_build')),
  target_audience text,
  predicted_r0 numeric default 1.0,
  actual_spread_count integer default 0,
  integrity_score numeric default 100,
  status text default 'draft' check (status in ('draft','minted','spreading','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integrous_memes enable row level security;
create policy "owner_integrous_memes" on public.integrous_memes for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.identity_airgap_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  trigger_idea text not null,
  passion_level numeric default 0,
  binary_lock_detected boolean default false,
  chairman_veto_triggered boolean default false,
  decoupled boolean default false,
  outcome text,
  created_at timestamptz not null default now()
);
alter table public.identity_airgap_events enable row level security;
create policy "owner_id_airgap" on public.identity_airgap_events for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
