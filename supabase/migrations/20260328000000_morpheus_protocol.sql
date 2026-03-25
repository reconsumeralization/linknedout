-- Morpheus Protocol: Biometric Sovereignty & Vibe-Hardened Security
-- Tools #177-180

-- Biometric masking sessions
create table if not exists public.biometric_masking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  masking_type text not null default 'iris' check (masking_type in ('iris','facial','gait','voice','fingerprint','multi_modal')),
  threat_source text,
  frequency_band text,
  masking_method text default 'adversarial_glint' check (masking_method in ('adversarial_glint','noise_injection','pattern_disruption','frequency_shift','holographic')),
  effectiveness_score numeric default 0,
  duration_minutes integer default 0,
  hardware_used text,
  status text not null default 'active' check (status in ('active','completed','failed','archived')),
  created_at timestamptz default now()
);

alter table public.biometric_masking_sessions enable row level security;
create policy "Users manage own masking sessions" on public.biometric_masking_sessions for all using (user_id = auth.uid());

-- Ethical deadlock resolutions
create table if not exists public.ethical_deadlock_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  scenario_label text not null,
  red_flag_type text not null default 'violence' check (red_flag_type in ('violence','self_harm','exploitation','fraud','terrorism','other')),
  tribal_ethical_code_ref text,
  action_taken text not null,
  resolution_time_ms integer default 0,
  escalated_to_human boolean default false,
  human_override_applied boolean default false,
  outcome text default 'resolved' check (outcome in ('resolved','escalated','overridden','logged_only','false_positive')),
  created_at timestamptz default now()
);

alter table public.ethical_deadlock_resolutions enable row level security;
create policy "Users manage own ethical resolutions" on public.ethical_deadlock_resolutions for all using (user_id = auth.uid());

-- Vibe code security audits
create table if not exists public.vibe_code_security_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  codebase_label text not null,
  scan_engine text default 'claude_code_security',
  total_files_scanned integer default 0,
  high_severity_count integer default 0,
  medium_severity_count integer default 0,
  low_severity_count integer default 0,
  auto_fixed_count integer default 0,
  vulnerabilities jsonb default '[]',
  scan_duration_seconds integer default 0,
  passed boolean default false,
  created_at timestamptz default now()
);

alter table public.vibe_code_security_audits enable row level security;
create policy "Users manage own security audits" on public.vibe_code_security_audits for all using (user_id = auth.uid());
create index idx_vibe_audit_passed on public.vibe_code_security_audits(passed);

-- Solid-state power configs (Donut Labs)
create table if not exists public.solid_state_power_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_label text not null,
  battery_type text not null default 'solid_state' check (battery_type in ('solid_state','donut_labs','sodium_ion','graphene','lithium_solid','experimental')),
  capacity_kwh numeric default 0,
  charge_time_minutes numeric default 0,
  cooling_method text default 'air' check (cooling_method in ('air','liquid','passive','phase_change','cryogenic')),
  weight_reduction_kg numeric default 0,
  runtime_hours numeric default 0,
  target_device text,
  operational_status text not null default 'configured' check (operational_status in ('configured','charging','operational','degraded','replaced')),
  created_at timestamptz default now()
);

alter table public.solid_state_power_configs enable row level security;
create policy "Users manage own power configs" on public.solid_state_power_configs for all using (user_id = auth.uid());
