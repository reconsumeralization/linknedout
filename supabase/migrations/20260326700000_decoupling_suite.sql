-- =============================================================================
-- Handcuff Cutter: Golden Handcuff Analysis & Sovereignty Break-Even
-- =============================================================================

-- 1. Golden handcuff analysis audits
create table if not exists public.decoupling_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  current_salary_usd numeric,
  vesting_schedule jsonb default '[]'::jsonb,
  benefits_value_usd numeric default 0,
  stock_options_value_usd numeric default 0,
  total_handcuff_value_usd numeric default 0,
  sovereignty_income_usd numeric default 0,
  breakeven_months integer,
  sovereign_income_sources jsonb default '[]'::jsonb,
  recommended_exit_date date,
  confidence_score numeric default 0,
  six_month_plan jsonb default '[]'::jsonb,
  status text not null default 'draft',  -- 'draft' | 'active' | 'on_track' | 'achieved' | 'paused'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decoupling_audits_user_status_idx on decoupling_audits(user_id, status);

-- 2. Monthly progress tracking milestones
create table if not exists public.decoupling_milestones (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references decoupling_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month_number integer not null,
  milestone_description text,
  income_target_usd numeric,
  actual_income_usd numeric,
  actions_completed text[] default '{}',
  status text not null default 'pending',  -- 'pending' | 'in_progress' | 'achieved' | 'missed'
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists decoupling_milestones_audit_month_idx on decoupling_milestones(audit_id, month_number);

-- 3. RLS policies
alter table decoupling_audits enable row level security;
create policy decoupling_audits_owner_rw on decoupling_audits for all using (user_id = auth.uid());

alter table decoupling_milestones enable row level security;
create policy decoupling_milestones_owner_rw on decoupling_milestones for all using (user_id = auth.uid());

-- 4. Triggers
drop trigger if exists set_decoupling_audits_updated_at on decoupling_audits;
create trigger set_decoupling_audits_updated_at before update on decoupling_audits for each row execute function set_updated_at();
