-- =============================================================================
-- Legal Sovereign Module: The Harvey/Legora Killer
-- Sovereign Legal Stacks, Client Trust Portals, Dependency Audits
-- =============================================================================

-- 1. SOVEREIGN LEGAL STACKS: Pre-configured agent factory for law firms
create table if not exists public.sovereign_legal_stacks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  stack_name text not null,
  firm_name text,
  stack_type text not null,              -- due_diligence | contract_synthesis | judgment_modeling | litigation_strategy | full_sovereign
  model_provider text default 'local_slm', -- local_slm | claude | gpt4 | gemini
  persistent_memory_location text default 'sovereign', -- sovereign | cloud | hybrid
  agent_count integer default 0,
  cases_processed integer default 0,
  dependency_score numeric default 0,     -- 0=fully sovereign, 100=fully dependent on third party
  monthly_savings_usd numeric default 0,
  status text default 'provisioning',     -- provisioning | active | migrating | archived
  created_at timestamptz not null default now()
);
create index if not exists legal_stack_owner_idx on sovereign_legal_stacks(owner_user_id);

-- 2. CLIENT TRUST PORTALS: Verified Proof of Human Judgment sharing
create table if not exists public.client_trust_portals (
  id uuid primary key default gen_random_uuid(),
  firm_user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  portal_type text default 'judgment_verified', -- judgment_verified | full_transparency | read_only
  matters jsonb default '[]'::jsonb,
    -- [{ matterId, title, humanJudgmentScore, aiExecutionPct, verifiedAt }]
  human_judgment_certificates integer default 0,
  ai_execution_percentage numeric default 0,
  artifact_handshake_required boolean default true,
  portal_status text default 'active',
  created_at timestamptz not null default now()
);
create index if not exists trust_portal_firm_idx on client_trust_portals(firm_user_id);

-- 3. LEGAL DEPENDENCY AUDITS: Harvey/Legora migration planning
create table if not exists public.legal_dependency_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_name text not null,           -- harvey | legora | casetext | westlaw | lexisnexis | custom
  annual_cost_usd numeric not null,
  data_lock_in_risk text,                -- low | medium | high | critical
  migration_complexity text,             -- simple | moderate | complex
  sovereign_alternative text,            -- what to replace it with
  estimated_migration_days integer,
  annual_savings_usd numeric,
  intelligence_tax_pct numeric,          -- % of value extracted by the platform
  audit_status text default 'pending',   -- pending | completed | action_taken
  created_at timestamptz not null default now()
);
create index if not exists legal_audit_user_idx on legal_dependency_audits(user_id);

-- 4. RLS
alter table sovereign_legal_stacks enable row level security;
create policy legal_stack_owner on sovereign_legal_stacks for all using (owner_user_id = auth.uid());

alter table client_trust_portals enable row level security;
create policy trust_portal_owner on client_trust_portals for all using (firm_user_id = auth.uid());

alter table legal_dependency_audits enable row level security;
create policy legal_audit_owner on legal_dependency_audits for all using (user_id = auth.uid());
