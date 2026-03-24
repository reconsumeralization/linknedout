-- =============================================================================
-- Network Intelligence Engine: Super-Connector Tools for 30K+ Networks
-- Active Network Index, Agentic Triage, Skill Heat Maps,
-- Micro-Tribe Segmentation, Human Ranking, Network Wealth
-- =============================================================================

-- 1. ACTIVE NETWORK INDEX: Semantic search over people
-- Enriched profile data with embeddings for "Query My Network"
alter table profiles add column if not exists last_activity_summary text;
alter table profiles add column if not exists activity_velocity numeric default 0;
alter table profiles add column if not exists proof_of_build_count integer default 0;
alter table profiles add column if not exists human_alpha_score numeric default 0;
alter table profiles add column if not exists last_indexed_at timestamptz;
alter table profiles add column if not exists is_between_projects boolean default false;
alter table profiles add column if not exists recent_tools jsonb default '[]'::jsonb;
alter table profiles add column if not exists skill_evolution jsonb default '[]'::jsonb;

create index if not exists profiles_activity_velocity_idx on profiles(activity_velocity desc);
create index if not exists profiles_human_alpha_idx on profiles(human_alpha_score desc);
create index if not exists profiles_recent_tools_gin on profiles using gin (recent_tools jsonb_path_ops);

-- 2. AGENTIC TRIAGE: AI gatekeeper for inbound requests
create table if not exists public.network_triage_rules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  rule_name text not null,
  rule_type text not null,              -- 'auto_respond' | 'require_proof' | 'priority_pass' | 'decline' | 'queue'
  conditions jsonb not null default '{}'::jsonb,
    -- { minTrustScore, requiresProofOfBuild, requiredSkills, fromTribe, hasVerifiedOutput }
  auto_response_template text,          -- template for AI to use when responding
  priority integer default 0,           -- higher = checked first
  is_active boolean default true,
  matches_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists triage_rules_owner_idx on network_triage_rules(owner_user_id);

create table if not exists public.network_triage_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sender_profile_id text,
  sender_name text,
  message_preview text,
  triage_result text not null,          -- 'passed' | 'queued' | 'auto_responded' | 'declined'
  matched_rule_id uuid,
  sender_trust_score numeric,
  sender_proof_of_builds integer,
  ai_reasoning text,
  created_at timestamptz not null default now()
);
create index if not exists triage_log_owner_idx on network_triage_log(owner_user_id);
create index if not exists triage_log_created_idx on network_triage_log(created_at desc);

-- 3. MICRO-TRIBE SEGMENTS: Auto-clustered interest squads
create table if not exists public.network_segments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  segment_name text not null,
  segment_type text default 'auto',     -- 'auto' | 'manual' | 'ai_suggested'
  clustering_basis text,                -- 'recent_tools' | 'skill_evolution' | 'activity_velocity' | 'industry' | 'custom'
  member_profile_ids jsonb not null default '[]'::jsonb,
  member_count integer default 0,
  avg_activity_velocity numeric default 0,
  avg_human_alpha numeric default 0,
  top_skills jsonb default '[]'::jsonb,
  description text,
  last_broadcast_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists network_segments_owner_idx on network_segments(owner_user_id);

-- 4. NETWORK WEALTH: Economic potential of the connection graph
create table if not exists public.network_wealth_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_connections integer default 0,
  active_connections integer default 0,   -- active in last 30 days
  high_agency_count integer default 0,    -- human_alpha_score > 70
  between_projects_count integer default 0,
  combined_proof_of_builds integer default 0,
  estimated_network_value_usd numeric,
  top_segments jsonb default '[]'::jsonb,
  talent_availability jsonb default '{}'::jsonb,
    -- { bySkill: { "AI/ML": 12, "Engineering": 45 }, byAvailability: { available: 15, busy: 200 } }
  deployment_readiness numeric default 0, -- % of network ready for immediate squad formation
  created_at timestamptz not null default now(),
  constraint network_wealth_user_date unique (owner_user_id, snapshot_date)
);
create index if not exists network_wealth_owner_idx on network_wealth_snapshots(owner_user_id);

-- 5. RLS
alter table network_triage_rules enable row level security;
create policy triage_rules_owner_rw on network_triage_rules for all using (owner_user_id = auth.uid());

alter table network_triage_log enable row level security;
create policy triage_log_owner_rw on network_triage_log for all using (owner_user_id = auth.uid());

alter table network_segments enable row level security;
create policy network_segments_owner_rw on network_segments for all using (owner_user_id = auth.uid());

alter table network_wealth_snapshots enable row level security;
create policy network_wealth_owner_rw on network_wealth_snapshots for all using (owner_user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_triage_rules_updated_at on network_triage_rules;
create trigger set_triage_rules_updated_at before update on network_triage_rules for each row execute function set_updated_at();

drop trigger if exists set_network_segments_updated_at on network_segments;
create trigger set_network_segments_updated_at before update on network_segments for each row execute function set_updated_at();
