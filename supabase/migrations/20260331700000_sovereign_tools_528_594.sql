-- =============================================================================
-- Sovereign Tools #528-594 — 16 new tables for 8 tool families
-- =============================================================================

begin;

-- ─── Strategic Sovereign (#528-532) ─────────────────────────────────────────

create table if not exists public.sovereign_canvas (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  canvas_name text not null,
  strategy_json jsonb not null default '{}',
  judgment_density_score numeric default 0,
  overnight_retraining_status text default 'idle',
  revision_count int default 0,
  created_at timestamptz not null default now()
);
alter table public.sovereign_canvas enable row level security;
create policy "owner_canvas" on public.sovereign_canvas for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_canvas_owner on public.sovereign_canvas(owner_user_id);

create table if not exists public.tribal_ip_licenses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  asset_name text not null,
  license_type text default 'standard',
  royalty_pct numeric default 0,
  targeting_integrity_score numeric default 0,
  status text default 'active',
  created_at timestamptz not null default now()
);
alter table public.tribal_ip_licenses enable row level security;
create policy "owner_ip" on public.tribal_ip_licenses for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.judgment_density_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  decisions_per_hour numeric default 0,
  quality_score numeric default 0,
  density_rank int default 0,
  created_at timestamptz not null default now()
);
alter table public.judgment_density_log enable row level security;
create policy "owner_jdl" on public.judgment_density_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── Protector Sovereign (#533-537) ─────────────────────────────────────────

create table if not exists public.biometric_vetting_results (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subject_name text not null,
  vetting_type text default 'standard',
  confidence_pct numeric default 0,
  signal_triage_priority text default 'normal',
  status text default 'pending',
  created_at timestamptz not null default now()
);
alter table public.biometric_vetting_results enable row level security;
create policy "owner_bvr" on public.biometric_vetting_results for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.incident_sync_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  incident_id text,
  source_system text not null,
  target_system text not null,
  sync_status text default 'pending',
  repression_neutralized boolean default false,
  created_at timestamptz not null default now()
);
alter table public.incident_sync_log enable row level security;
create policy "owner_isl" on public.incident_sync_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.defense_audit_results (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  audit_scope text not null,
  threat_level text default 'low',
  vulnerabilities_found int default 0,
  remediation_plan text,
  score numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.defense_audit_results enable row level security;
create policy "owner_dar" on public.defense_audit_results for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── Global Human (#538-542) ────────────────────────────────────────────────

create table if not exists public.sovereign_enterprises (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  enterprise_name text not null,
  enterprise_type text default 'startup',
  legal_status text default 'provisioning',
  capital_required_usd numeric default 0,
  artisanship_domain text,
  divide_refund_score numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.sovereign_enterprises enable row level security;
create policy "owner_se" on public.sovereign_enterprises for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.latent_artisanship_results (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  skill_domain text not null,
  latent_score numeric default 0,
  blockers jsonb default '[]',
  recommendations jsonb default '[]',
  reasoning_audit_passed boolean default true,
  created_at timestamptz not null default now()
);
alter table public.latent_artisanship_results enable row level security;
create policy "owner_lar" on public.latent_artisanship_results for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.resonance_sanctuaries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sanctuary_name text not null,
  mode text default 'comfort',
  biometric_trigger text,
  active boolean default true,
  session_count int default 0,
  created_at timestamptz not null default now()
);
alter table public.resonance_sanctuaries enable row level security;
create policy "owner_rs" on public.resonance_sanctuaries for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── Psychological Sovereign (#576-580) ─────────────────────────────────────

create table if not exists public.algo_brain_maps (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  attention_map_json jsonb default '{}',
  tech_fence_active boolean default false,
  subconscious_patterns_detected int default 0,
  risk_level text default 'low',
  created_at timestamptz not null default now()
);
alter table public.algo_brain_maps enable row level security;
create policy "owner_abm" on public.algo_brain_maps for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.psych_dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  digital_fence_score numeric default 0,
  attention_reclaimed_pct numeric default 0,
  pattern_alerts jsonb default '[]',
  created_at timestamptz not null default now()
);
alter table public.psych_dashboard_snapshots enable row level security;
create policy "owner_pds" on public.psych_dashboard_snapshots for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── Identity Sovereign (#581-584) ──────────────────────────────────────────

create table if not exists public.identity_decommissions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  interface_name text not null,
  decommission_type text default 'soft',
  artifact_mfa_enabled boolean default false,
  carrier_integrity_score numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.identity_decommissions enable row level security;
create policy "owner_id" on public.identity_decommissions for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.plugin_sovereignty_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  plugin_name text not null,
  vendor text,
  sovereignty_status text default 'auditing',
  risk_score numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.plugin_sovereignty_records enable row level security;
create policy "owner_psr" on public.plugin_sovereignty_records for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── Thermodynamic Sovereign (#585-589) ─────────────────────────────────────

create table if not exists public.charging_substrate_audits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  substrate_type text not null,
  efficiency_pct numeric default 0,
  sabotage_risk text default 'low',
  compliance_blindspot_count int default 0,
  artifact_time_signature text,
  created_at timestamptz not null default now()
);
alter table public.charging_substrate_audits enable row level security;
create policy "owner_csa" on public.charging_substrate_audits for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.vehicle_energy_stakes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id text,
  staked_kwh numeric default 0,
  yield_pct numeric default 0,
  frequency_sabotage_detected boolean default false,
  artifact_time_signature text,
  created_at timestamptz not null default now()
);
alter table public.vehicle_energy_stakes enable row level security;
create policy "owner_ves" on public.vehicle_energy_stakes for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── Project Genesis (#590-594) ─────────────────────────────────────────────

create table if not exists public.genesis_protocols (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  protocol_name text not null,
  protocol_type text not null default 'genesis',
  chain_delegation_target text,
  devotion_signature text,
  memory_vault_ref uuid,
  status text default 'active',
  created_at timestamptz not null default now()
);
alter table public.genesis_protocols enable row level security;
create policy "owner_gp" on public.genesis_protocols for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.atlantis_memory_vaults (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  vault_name text not null,
  entry_type text default 'ancestral',
  encrypted_payload_ref text,
  chain_id text,
  created_at timestamptz not null default now()
);
alter table public.atlantis_memory_vaults enable row level security;
create policy "owner_amv" on public.atlantis_memory_vaults for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── Civic Sovereign (#467-471) — legislative/sanctuary tables ──────────────

create table if not exists public.civic_legislative_actions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  jurisdiction text,
  bill_reference text,
  safety_physics_score numeric default 0,
  lobby_exposure_pct numeric default 0,
  fulfillment_dividend numeric default 0,
  status text default 'pending',
  created_at timestamptz not null default now()
);
alter table public.civic_legislative_actions enable row level security;
create policy "owner_cla" on public.civic_legislative_actions for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.sanctuary_shields (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  shield_name text not null,
  scope text default 'local',
  active boolean default true,
  threat_blocked_count int default 0,
  created_at timestamptz not null default now()
);
alter table public.sanctuary_shields enable row level security;
create policy "owner_ss" on public.sanctuary_shields for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

commit;
