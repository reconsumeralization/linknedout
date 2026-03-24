-- =============================================================================
-- Cyborg C-Suite: AI Autonomous Executive Layer
-- CEO, CFO, CTO, CMO, CCO + Executive Review + Chairman Veto
-- =============================================================================

-- 1. EXECUTIVE BRIEFS: Daily strategic recommendations from AI C-Suite
create table if not exists public.executive_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null default current_date,
  brief_type text not null,             -- 'morning_review' | 'priority_shift' | 'emergency' | 'weekly_synthesis'

  -- CEO: Strategic Paths
  ceo_strategic_paths jsonb not null default '[]'::jsonb,
    -- [{ id, title, description, confidence, riskLevel, estimatedImpact, requiredResources, timelineHours }]
  ceo_priority_ranking jsonb default '[]'::jsonb,
  ceo_resource_allocation jsonb default '{}'::jsonb,

  -- CFO: Financial Intelligence
  cfo_cash_position jsonb default '{}'::jsonb,
  cfo_refunds_found jsonb default '{}'::jsonb,
  cfo_burn_rate_alert text,
  cfo_squad_payments_pending integer default 0,

  -- CTO: Technical Health
  cto_system_health jsonb default '{}'::jsonb,
    -- { uptime, errorRate, deploymentsPending, securityAlerts, complianceStatus }
  cto_auto_fixes_applied integer default 0,
  cto_technical_debt_score numeric default 0,

  -- CMO: Growth & Engagement
  cmo_tribal_growth jsonb default '{}'::jsonb,
  cmo_content_pipeline jsonb default '[]'::jsonb,
  cmo_signal_feed_health jsonb default '{}'::jsonb,

  -- CCO: Trust & Safety
  cco_trust_score_avg numeric default 0,
  cco_bots_flagged integer default 0,
  cco_verification_queue integer default 0,
  cco_community_health text default 'stable',

  -- Chairman Decision
  chairman_decision text,               -- which path was chosen
  chairman_veto_notes text,
  chairman_additions text,              -- human intuition additions
  decided_at timestamptz,

  -- Execution Status
  execution_status text default 'pending', -- pending | decided | executing | completed | vetoed
  execution_log jsonb default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executive_briefs_user_date unique (owner_user_id, brief_date, brief_type)
);
create index if not exists executive_briefs_owner_idx on executive_briefs(owner_user_id);
create index if not exists executive_briefs_date_idx on executive_briefs(brief_date desc);

-- 2. AUTONOMOUS ACTIONS: Log of actions taken by AI C-Suite without human approval
create table if not exists public.csuite_autonomous_actions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  executive text not null,              -- 'ceo' | 'cfo' | 'cto' | 'cmo' | 'cco'
  action_type text not null,            -- 'resource_shift' | 'auto_fix' | 'payment' | 'content_publish' | 'bot_ban' | 'compliance_update'
  description text not null,
  impact_summary text,
  confidence numeric default 0,
  requires_chairman_review boolean default false,
  chairman_approved boolean,
  chairman_reviewed_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists csuite_actions_owner_idx on csuite_autonomous_actions(owner_user_id);
create index if not exists csuite_actions_exec_idx on csuite_autonomous_actions(executive);

-- 3. RLS
alter table executive_briefs enable row level security;
create policy executive_briefs_owner_rw on executive_briefs for all using (owner_user_id = auth.uid());

alter table csuite_autonomous_actions enable row level security;
create policy csuite_actions_owner_rw on csuite_autonomous_actions for all using (owner_user_id = auth.uid());

-- 4. Triggers
drop trigger if exists set_executive_briefs_updated_at on executive_briefs;
create trigger set_executive_briefs_updated_at before update on executive_briefs for each row execute function set_updated_at();
