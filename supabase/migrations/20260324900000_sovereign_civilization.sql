-- =============================================================================
-- Sovereign Civilization: 6 Bespoke Elements
-- Human Alpha Oracle, Shadow Negotiator, Sovereign Sanctuary,
-- Agentic Will, Wetware Lab, The Artifact
-- =============================================================================

-- 1. HUMAN ALPHA ORACLE: Decision log with biometric/logical state capture
create table if not exists public.human_alpha_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_type text not null,          -- 'ai_override' | 'strategic_direction' | 'veto' | 'creative_divergence' | 'ethical_judgment'
  context text not null,                -- what was happening when the decision was made
  ai_recommendation text,               -- what the AI suggested
  human_decision text not null,         -- what the human actually chose
  divergence_reasoning text,            -- WHY the human diverged from AI
  confidence numeric default 0,         -- human's confidence 0-100
  decision_complexity text,             -- 'routine' | 'complex' | 'novel' | 'high_stakes'
  cognitive_state jsonb default '{}'::jsonb,
    -- { hoursWorked, decisionFatigue, focusLevel, lastBreak }
  outcome_tracked boolean default false,
  outcome_result text,                  -- retrospective: was the human right?
  human_alpha_points numeric default 0, -- points earned for this decision
  created_at timestamptz not null default now()
);
create index if not exists alpha_decisions_user_idx on human_alpha_decisions(user_id);
create index if not exists alpha_decisions_type_idx on human_alpha_decisions(decision_type);

-- 2. SHADOW NEGOTIATOR: Real-time meeting intelligence logs
create table if not exists public.negotiation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null,           -- 'zoom_call' | 'in_person' | 'email_thread' | 'async_negotiation'
  counterparty text,
  context text not null,
  insights_generated jsonb not null default '[]'::jsonb,
    -- [{ timestamp, type: 'contradiction'|'sentiment_shift'|'leverage_point'|'risk_signal', insight, confidence, suggestedAction }]
  key_leverage_points jsonb default '[]'::jsonb,
  sentiment_trajectory jsonb default '[]'::jsonb,
    -- [{ timestamp, sentiment: -1 to 1, topic }]
  outcome text,                         -- 'deal_closed' | 'continued' | 'walked_away' | 'deferred'
  outcome_value_usd numeric,
  human_decisions_made integer default 0,
  ai_whispers_used integer default 0,
  duration_minutes integer,
  created_at timestamptz not null default now()
);
create index if not exists negotiation_user_idx on negotiation_sessions(user_id);

-- 3. SOVEREIGN SANCTUARY: Concentration mode and commander's briefing
create table if not exists public.sanctuary_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,                   -- 'deep_work' | 'creative_flow' | 'strategic_planning' | 'recovery'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer,
  notifications_silenced integer default 0,
  tribal_signals_passed integer default 0, -- only high-signal data got through
  commanders_briefing jsonb,
    -- { totalDMs, actionableDMs, synthesizedBriefing, criticalAlerts }
  focus_score numeric default 0,         -- 0-100, self-reported or tracked
  output_during_session text,           -- what was accomplished
  created_at timestamptz not null default now()
);
create index if not exists sanctuary_user_idx on sanctuary_sessions(user_id);

-- 4. AGENTIC WILL: Legacy protocol and succession planning
create table if not exists public.agentic_wills (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legacy_agent_id uuid,                 -- the trained legacy agent
  succession_type text default 'tribal_transition', -- 'tribal_transition' | 'heir_transfer' | 'foundation' | 'archive'
  heir_user_ids jsonb default '[]'::jsonb,
  tribal_beneficiaries jsonb default '[]'::jsonb,
  decision_history_trained boolean default false,
  training_data_years numeric default 0,
  activation_trigger text default 'inactivity_90_days',
  legacy_mode_config jsonb default '{}'::jsonb,
    -- { autoRunWorkflows, maintainTribes, publishScheduled, budgetLimit }
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 5. WETWARE PERFORMANCE LAB: Biological optimization tracking
create table if not exists public.wetware_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  screen_hours numeric default 0,
  decision_quality_score numeric,        -- tracked via outcome correlation
  biological_tariff jsonb default '{}'::jsonb,
    -- { screenTimeTariff, sleepDebt, movementDeficit, hydrationGap }
  performance_windows jsonb default '[]'::jsonb,
    -- [{ startHour, endHour, qualityScore, taskType }]
  ai_handoff_triggered boolean default false, -- CEO took over when human flagged
  reset_activities jsonb default '[]'::jsonb,
    -- [{ activity, duration, recoveryScore }]
  recommendations jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint wetware_user_date unique (user_id, session_date)
);
create index if not exists wetware_user_idx on wetware_sessions(user_id);

-- 6. THE ARTIFACT: Physical tribal key registry
create table if not exists public.artifact_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text default 'sovereign_stone', -- 'sovereign_stone' | 'tribal_ring' | 'founder_key'
  public_key text not null,             -- NFC/crypto public key
  trust_handshakes integer default 0,   -- how many peer handshakes completed
  last_handshake_at timestamptz,
  verified_encounters jsonb default '[]'::jsonb,
    -- [{ withUserId, location, timestamp, mutualTrustVerified }]
  artifact_status text default 'active', -- active | lost | replaced | decommissioned
  issued_at timestamptz not null default now(),
  constraint artifact_user_unique unique (user_id, artifact_type)
);
create index if not exists artifact_user_idx on artifact_registry(user_id);

-- 7. RLS
alter table human_alpha_decisions enable row level security;
create policy alpha_decisions_owner_rw on human_alpha_decisions for all using (user_id = auth.uid());

alter table negotiation_sessions enable row level security;
create policy negotiation_owner_rw on negotiation_sessions for all using (user_id = auth.uid());

alter table sanctuary_sessions enable row level security;
create policy sanctuary_owner_rw on sanctuary_sessions for all using (user_id = auth.uid());

alter table agentic_wills enable row level security;
create policy agentic_wills_owner_rw on agentic_wills for all using (user_id = auth.uid());

alter table wetware_sessions enable row level security;
create policy wetware_owner_rw on wetware_sessions for all using (user_id = auth.uid());

alter table artifact_registry enable row level security;
create policy artifact_owner_rw on artifact_registry for all using (user_id = auth.uid());
