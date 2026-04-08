-- =============================================================================
-- Multi-Company Orchestration — 1 person runs 5-8 companies
-- =============================================================================

begin;

-- Portfolio: the companies a single operator runs
create table if not exists public.company_portfolio (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  company_type text not null default 'startup',
  domain text not null,
  status text not null default 'active',
  autopilot_enabled boolean default false,
  autopilot_agent_id text,
  monthly_revenue_usd numeric default 0,
  monthly_cost_usd numeric default 0,
  burn_rate_months numeric default 0,
  health_score numeric default 50,
  last_pulse_at timestamptz,
  config jsonb default '{}',
  created_at timestamptz not null default now()
);
alter table public.company_portfolio enable row level security;
create policy "owner_cp" on public.company_portfolio for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_cp_owner on public.company_portfolio(owner_user_id);

-- Per-company agent assignments (which agents run which company)
create table if not exists public.company_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_portfolio(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_role text not null,
  agent_definition_id text not null,
  status text default 'active',
  last_run_at timestamptz,
  runs_today int default 0,
  total_runs int default 0,
  avg_cost_per_run_usd numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.company_agents enable row level security;
create policy "owner_ca" on public.company_agents for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_ca_company on public.company_agents(company_id);

-- Cross-company decision log (the operator's judgment trail)
create table if not exists public.operator_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.company_portfolio(id) on delete cascade,
  decision_type text not null,
  context text,
  decision text not null,
  impact_usd numeric default 0,
  delegated_to_agent boolean default false,
  agent_id text,
  created_at timestamptz not null default now()
);
alter table public.operator_decisions enable row level security;
create policy "owner_od" on public.operator_decisions for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- Daily company pulse (auto-generated health snapshot)
create table if not exists public.company_daily_pulse (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_portfolio(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  pulse_date date not null default current_date,
  revenue_usd numeric default 0,
  cost_usd numeric default 0,
  customers_active int default 0,
  customers_new int default 0,
  customers_churned int default 0,
  agent_runs int default 0,
  agent_cost_usd numeric default 0,
  issues_open int default 0,
  issues_resolved int default 0,
  health_score numeric default 50,
  alerts jsonb default '[]',
  created_at timestamptz not null default now(),
  unique(company_id, pulse_date)
);
alter table public.company_daily_pulse enable row level security;
create policy "owner_cdp" on public.company_daily_pulse for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- Cross-company resource sharing (agents/tools/data shared between portfolio companies)
create table if not exists public.portfolio_shared_resources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_company_id uuid not null references public.company_portfolio(id) on delete cascade,
  target_company_id uuid not null references public.company_portfolio(id) on delete cascade,
  resource_type text not null,
  resource_ref text not null,
  status text default 'active',
  created_at timestamptz not null default now()
);
alter table public.portfolio_shared_resources enable row level security;
create policy "owner_psr2" on public.portfolio_shared_resources for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

commit;
