-- Geopolitical Integrity: narrative auditing, primary source ingest, border monitoring

create table if not exists public.narrative_audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  headline text not null,
  source_outlet text,
  source_url text,
  primary_source_url text,
  bias_delta_score numeric default 0,
  pruned_facts jsonb default '[]',
  language_sources_checked text[] default '{}',
  narrative_classification text default 'neutral' check (narrative_classification in ('neutral','selective_framing','omission','propaganda','verified')),
  audited_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.narrative_audit_log enable row level security;
create policy "owner_narrative_audit" on public.narrative_audit_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.geopolitical_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  conflict_name text not null,
  region text,
  capital_cost_usd numeric default 0,
  human_cost_estimate integer default 0,
  infrastructure_destroyed_pct numeric default 0,
  tribal_exposure_pct numeric default 0,
  tariff_classification text default 'moderate' check (tariff_classification in ('minimal','moderate','severe','catastrophic')),
  assessment_date date default current_date,
  created_at timestamptz not null default now()
);
alter table public.geopolitical_cost_ledger enable row level security;
create policy "owner_geo_cost" on public.geopolitical_cost_ledger for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
