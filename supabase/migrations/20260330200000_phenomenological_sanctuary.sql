-- Phenomenological Sanctuary: chimera defense, hedonic budgets, urge shielding, wildtype preservation

create table if not exists public.chimera_risk_audits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  audit_scope text default 'full_factory',
  tools_analyzed integer default 0,
  cross_tool_interactions_tested integer default 0,
  emergent_risks_found integer default 0,
  risk_details jsonb default '[]',
  highest_risk_score numeric default 0,
  remediation_applied boolean default false,
  audited_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.chimera_risk_audits enable row level security;
create policy "owner_chimera_audits" on public.chimera_risk_audits for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.hedonic_budgets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  notification_max_per_hour integer default 5,
  reward_variance_max numeric default 0.3,
  salience_escalation_max_pct numeric default 20,
  emotional_repetition_max integer default 3,
  session_cooldown_threshold integer default 5,
  cooldown_duration_minutes integer default 30,
  budget_status text default 'active' check (budget_status in ('active','paused','emergency','sabbatical')),
  violations_today integer default 0,
  last_violation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hedonic_budgets enable row level security;
create policy "owner_hedonic_budgets" on public.hedonic_budgets for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.urge_contagion_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  urge_description text not null,
  suspected_source text,
  contagion_type text default 'ambient' check (contagion_type in ('ambient','direct','algorithmic','tribal_cascade','self_generated')),
  intensity numeric default 50,
  biometric_anomaly_detected boolean default false,
  reflective_endorsement boolean,
  shielded boolean default false,
  created_at timestamptz not null default now()
);
alter table public.urge_contagion_events enable row level security;
create policy "owner_urge_events" on public.urge_contagion_events for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.cognitive_graffiti_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  phrase_or_overlay text not null,
  source_system text,
  persistence_days integer default 0,
  emotional_charge numeric default 0,
  blacklisted boolean default false,
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.cognitive_graffiti_log enable row level security;
create policy "owner_cog_graffiti" on public.cognitive_graffiti_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.authorship_scores (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  measurement_date date default current_date,
  self_prediction_accuracy numeric default 0,
  narrative_stability numeric default 0,
  value_consistency numeric default 0,
  agency_perception numeric default 0,
  boundary_clarity numeric default 0,
  overall_authorship_score numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.authorship_scores enable row level security;
create policy "owner_authorship" on public.authorship_scores for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index idx_authorship_date on public.authorship_scores (owner_user_id, measurement_date desc);

create table if not exists public.wildtype_sabbaticals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sabbatical_type text default '7day' check (sabbatical_type in ('24hour','3day','7day','30day','90day')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  pre_sabbatical_values jsonb default '{}',
  post_sabbatical_values jsonb,
  drift_detected boolean,
  drift_magnitude numeric,
  completed boolean default false,
  created_at timestamptz not null default now()
);
alter table public.wildtype_sabbaticals enable row level security;
create policy "owner_sabbaticals" on public.wildtype_sabbaticals for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
