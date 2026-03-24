-- =============================================================================
-- Refund Engine: Tariff & Efficiency Reclamation System
-- Cognitive Tariff, SaaS Audit, Network ROI, Trade Rebates, R&D Credits
-- + BAHA Blast (Confidence Reinforcement after Code Red alerts)
-- =============================================================================

-- 1. REFUND DASHBOARD: Aggregated value reclaimed per user
create table if not exists public.refund_dashboard (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_monetary_refund_usd numeric default 0,
  total_hours_reclaimed numeric default 0,
  total_saas_savings_monthly_usd numeric default 0,
  total_network_signal_gain_pct numeric default 0,
  total_rd_credit_estimate_usd numeric default 0,

  -- Breakdown
  tariff_vat_refund_usd numeric default 0,
  cognitive_tariff_hours numeric default 0,
  saas_redundancy_savings_usd numeric default 0,
  network_noise_reduction_pct numeric default 0,
  rd_innovation_hours numeric default 0,

  -- Engagement
  refunds_deployed_to_projects integer default 0,
  last_audit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. COGNITIVE TARIFF AUDITS: Time-tax tracking per period
create table if not exists public.cognitive_tariff_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_period_start date not null,
  audit_period_end date not null,
  total_work_hours numeric not null,
  search_summarize_hours numeric default 0,    -- the "tariff"
  decision_design_hours numeric default 0,     -- the "value"
  automatable_hours numeric default 0,         -- potential refund
  installed_workflows integer default 0,       -- workflows adopted
  hours_reclaimed numeric default 0,           -- actual hours saved
  top_tariff_tasks jsonb default '[]'::jsonb,
    -- [{ task, hoursSpent, automationPotential, suggestedWorkflow }]
  refund_rate_pct numeric default 0,           -- hours_reclaimed / automatable_hours * 100
  created_at timestamptz not null default now()
);
create index if not exists cognitive_audits_user_idx on cognitive_tariff_audits(user_id);

-- 3. SAAS STACK AUDITS: Redundancy detection
create table if not exists public.saas_stack_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_date date not null default current_date,
  total_monthly_spend_usd numeric default 0,
  redundant_tools jsonb default '[]'::jsonb,
    -- [{ toolName, monthlyCost, category, replacedBy, savingsUsd }]
  optimization_suggestions jsonb default '[]'::jsonb,
    -- [{ action, currentTool, suggestedAlternative, monthlySaving, reason }]
  total_potential_savings_usd numeric default 0,
  created_at timestamptz not null default now()
);
create index if not exists saas_audits_user_idx on saas_stack_audits(user_id);

-- 4. NETWORK ROI: Relationship efficiency analysis
create table if not exists public.network_roi_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_date date not null default current_date,
  total_connections integer default 0,
  zero_signal_count integer default 0,
  high_alpha_count integer default 0,
  signal_to_noise_ratio numeric default 0,
  daily_scroll_minutes_saved numeric default 0,
  engagement_rebate_pct numeric default 0,     -- signal improvement %
  recommendations jsonb default '[]'::jsonb,
    -- [{ action: 'mute'|'engage'|'promote', profileIds, reason, impactEstimate }]
  created_at timestamptz not null default now()
);
create index if not exists network_roi_user_idx on network_roi_audits(user_id);

-- 5. BAHA BLASTS: Confidence reinforcement after Code Red alerts
-- Every disruption alert (Code Red) is followed by a BAHA: Build, Adapt, Harden, Amplify
create table if not exists public.baha_blasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  triggered_by text,                   -- 'career_flight_alert' | 'skill_delta' | 'automation_warning' | 'market_shift'
  trigger_alert_id text,               -- references the Code Red alert
  severity_of_trigger text,            -- 'info' | 'warning' | 'critical'

  -- BAHA Framework
  build_action text not null,          -- "Build X to demonstrate new capability"
  adapt_action text not null,          -- "Adapt your workflow by integrating Y"
  harden_action text not null,         -- "Harden your position by deepening Z"
  amplify_action text not null,        -- "Amplify by sharing results via Signal Feed"

  -- Execution tracking
  build_status text default 'pending',  -- pending | in_progress | completed
  adapt_status text default 'pending',
  harden_status text default 'pending',
  amplify_status text default 'pending',
  overall_confidence_boost numeric default 0,  -- 0-100

  -- Outcome
  completed_at timestamptz,
  outcome_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists baha_blasts_user_idx on baha_blasts(user_id);
create index if not exists baha_blasts_trigger_idx on baha_blasts(triggered_by);

-- 6. RLS
alter table refund_dashboard enable row level security;
create policy refund_dashboard_owner_rw on refund_dashboard for all using (user_id = auth.uid());

alter table cognitive_tariff_audits enable row level security;
create policy cognitive_audits_owner_rw on cognitive_tariff_audits for all using (user_id = auth.uid());

alter table saas_stack_audits enable row level security;
create policy saas_audits_owner_rw on saas_stack_audits for all using (user_id = auth.uid());

alter table network_roi_audits enable row level security;
create policy network_roi_owner_rw on network_roi_audits for all using (user_id = auth.uid());

alter table baha_blasts enable row level security;
create policy baha_blasts_owner_rw on baha_blasts for all using (user_id = auth.uid());

-- 7. Triggers
drop trigger if exists set_refund_dashboard_updated_at on refund_dashboard;
create trigger set_refund_dashboard_updated_at before update on refund_dashboard for each row execute function set_updated_at();

drop trigger if exists set_baha_blasts_updated_at on baha_blasts;
create trigger set_baha_blasts_updated_at before update on baha_blasts for each row execute function set_updated_at();
