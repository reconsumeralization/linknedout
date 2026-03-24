-- =============================================================================
-- Critical Safeguards: 6 Failure Point Defenses
-- Liability Firewall, Graceful Degradation, Tribal Missions,
-- Agentic Quarantine, Biological Heartbeat, Primary Source Enforcement
-- =============================================================================

-- 1. LIABILITY FIREWALL: Insurance-as-Code for autonomous agent decisions
create table if not exists public.liability_firewall_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_source text not null,            -- which AI executive triggered this
  action_type text not null,             -- financial_transaction | contract_signing | data_sharing | api_call
  risk_tier text not null,               -- low | medium | high | critical
  estimated_value_usd numeric,
  human_alpha_required boolean default false,
  human_approved boolean,
  approval_timestamp timestamptz,
  insurance_bond_id text,                -- reference to insurance/bond if bonded
  blocked boolean default false,         -- was this action blocked by the firewall?
  block_reason text,
  audit_trail jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists liability_user_idx on liability_firewall_events(user_id);
create index if not exists liability_risk_idx on liability_firewall_events(risk_tier);

-- 2. GRACEFUL DEGRADATION: Multi-cloud failover and sovereign server mirroring
create table if not exists public.sovereign_failover_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_name text not null,            -- notion | ramp | railway | vercel | turbopuffer | supabase
  status text default 'healthy',         -- healthy | degraded | offline | failover_active
  last_health_check timestamptz default now(),
  failover_target text,                  -- local_server | backup_cloud | cold_storage
  local_mirror_status text default 'not_configured', -- synced | stale | not_configured
  last_sync_at timestamptz,
  data_freshness_hours numeric,
  recovery_plan jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint failover_unique unique (user_id, service_name)
);

-- 3. TRIBAL MISSIONS: Shared multi-agent missions preventing fragmentation
create table if not exists public.tribal_missions (
  id uuid primary key default gen_random_uuid(),
  tribe_id text,
  mission_name text not null,
  objective text not null,               -- the Moore's Block to solve
  required_participants integer default 10,
  current_participants integer default 0,
  participant_ids jsonb default '[]'::jsonb,
  pooled_agent_count integer default 0,
  status text default 'recruiting',      -- recruiting | active | completed | failed
  difficulty text default 'hard',        -- moderate | hard | legendary
  reward_type text default 'cognitive_royalty', -- cognitive_royalty | tribal_honor | skill_unlock
  outcomes jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. AGENTIC QUARANTINE: Adversarial testing before shared lab acceptance
create table if not exists public.agentic_quarantine (
  id uuid primary key default gen_random_uuid(),
  stake_id text not null,                -- cognitive stake being quarantined
  submitted_by uuid references auth.users(id) on delete set null,
  quarantine_status text default 'pending', -- pending | testing | passed | failed | banned
  adversarial_tests_run integer default 0,
  vulnerabilities_found jsonb default '[]'::jsonb,
    -- [{ type, severity, description, apiCallAttempted }]
  hidden_intent_detected boolean default false,
  unauthorized_api_calls jsonb default '[]'::jsonb,
  data_exfiltration_attempt boolean default false,
  bias_score numeric default 0,          -- 0-100, higher = more biased
  reviewer_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  quarantine_started_at timestamptz default now(),
  quarantine_ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quarantine_status_idx on agentic_quarantine(quarantine_status);

-- 5. BIOLOGICAL HEARTBEAT: Dead-man's switch for incapacitation detection
create table if not exists public.biological_heartbeat (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_biological_signal timestamptz default now(),
  signal_source text default 'manual_checkin', -- artifact_nfc | wearable | manual_checkin | app_activity
  consecutive_missed_hours numeric default 0,
  stewardship_mode_active boolean default false,
  stewardship_triggered_at timestamptz,
  stewardship_notified_elders jsonb default '[]'::jsonb,
  frozen_actions jsonb default '[]'::jsonb, -- high-risk actions frozen during stewardship
  wellness_check_requested boolean default false,
  wellness_check_responded boolean default false,
  threshold_hours integer default 48,    -- hours before stewardship activates
  updated_at timestamptz default now()
);

-- 6. PRIMARY SOURCE REGISTRY: First-principles data enforcement
create table if not exists public.primary_source_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,             -- interview | handwritten_note | physical_experiment | field_observation | original_research
  title text not null,
  description text not null,
  raw_data_reference text,               -- file path, URL, or physical location
  domain text,
  verified_non_digital boolean default true, -- confirms this is NOT AI-generated
  contributed_to_tribal_graph boolean default false,
  craftsman_reward_points integer default 10,
  created_at timestamptz not null default now()
);
create index if not exists primary_source_user_idx on primary_source_registry(user_id);

-- 7. RLS
alter table liability_firewall_events enable row level security;
create policy liability_owner on liability_firewall_events for all using (user_id = auth.uid());

alter table sovereign_failover_state enable row level security;
create policy failover_owner on sovereign_failover_state for all using (user_id = auth.uid());

alter table biological_heartbeat enable row level security;
create policy heartbeat_owner on biological_heartbeat for all using (user_id = auth.uid());

alter table primary_source_registry enable row level security;
create policy primary_source_owner on primary_source_registry for all using (user_id = auth.uid());
