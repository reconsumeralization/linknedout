-- =============================================================================
-- MITRE ATT&CK Immune System: Automated Defensive Architecture
-- Agentic Red Team, Tribal Herd Immunity, Deterministic Hardening
-- =============================================================================

-- 1. MITRE TTP REGISTRY: Known tactics/techniques/procedures mapped to defenses
create table if not exists public.mitre_ttp_registry (
  id text primary key,                   -- MITRE ID e.g. T1566, T1021
  tactic text not null,                  -- reconnaissance | initial_access | execution | persistence | etc
  technique text not null,
  subtechnique text,
  description text not null,
  risk_score numeric default 50,         -- 0-100 platform-specific risk
  automated_defense_status text default 'none', -- none | partial | full
  counter_agent_id text,                 -- agent built to counter this TTP
  last_seen_in_tribe timestamptz,
  tribal_incident_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. RED TEAM EXERCISES: Adversary agent simulations against our own systems
create table if not exists public.red_team_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  target_system text not null,           -- sovereign_sanctuary | agent_lab | api_layer | data_store
  ttps_tested jsonb not null default '[]'::jsonb,  -- MITRE IDs tested
  findings jsonb default '[]'::jsonb,
    -- [{ ttpId, result: 'blocked'|'detected'|'bypassed', details, severity }]
  overall_score numeric,                 -- 0-100 defense score
  counter_agents_deployed jsonb default '[]'::jsonb,
  status text default 'running',         -- running | completed | aborted
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists red_team_user_idx on red_team_exercises(user_id);

-- 3. TRIBAL THREAT INTEL: Anonymized threat sharing across 30K network
create table if not exists public.tribal_threat_intel (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid references auth.users(id) on delete set null,
  mitre_ttp_id text,
  threat_type text not null,             -- known_ttp | zero_day | anomaly | social_engineering
  behavior_signature jsonb not null,     -- anonymized behavioral pattern
  severity text default 'medium',
  tribal_alert_count integer default 0,  -- how many tribe members received this
  counter_measure text,                  -- recommended defense
  human_alpha_required boolean default false, -- true for zero-days needing human judgment
  created_at timestamptz not null default now()
);
create index if not exists threat_ttp_idx on tribal_threat_intel(mitre_ttp_id);

-- 4. DEFENSE POSTURE: Live security state per user
create table if not exists public.defense_posture (
  user_id uuid primary key references auth.users(id) on delete cascade,
  overall_score numeric default 50,      -- 0-100
  ttps_covered integer default 0,
  ttps_total integer default 200,
  last_red_team_at timestamptz,
  last_threat_intel_at timestamptz,
  auto_hardened_count integer default 0,
  manual_review_pending integer default 0,
  herd_immunity_active boolean default true,
  updated_at timestamptz default now()
);

-- 5. RLS
alter table red_team_exercises enable row level security;
create policy red_team_owner on red_team_exercises for all using (user_id = auth.uid());

alter table defense_posture enable row level security;
create policy posture_owner on defense_posture for all using (user_id = auth.uid());
