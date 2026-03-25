-- Diplomatic Integrity: Proxy Influence Auditing & Handshake Sovereignty
-- Tools #161-164

-- Proxy influence tracking
create table if not exists public.proxy_influence_audit (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid references auth.users(id) on delete cascade,
  subject_name text not null,
  relationship_type text not null default 'friend',
  external_financial_incentives jsonb default '[]',
  bias_indicators jsonb default '{}',
  influence_score numeric default 0,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  linked_entity text,
  linked_country text,
  verification_status text not null default 'pending' check (verification_status in ('pending','investigating','verified_clean','verified_compromised','archived')),
  evidence_refs jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.proxy_influence_audit enable row level security;
create policy "Users manage own proxy audits" on public.proxy_influence_audit for all using (analyst_user_id = auth.uid());
create index idx_proxy_influence_risk on public.proxy_influence_audit(risk_level);
create index idx_proxy_influence_status on public.proxy_influence_audit(verification_status);

-- Diplomatic lure verification
create table if not exists public.diplomatic_lure_registry (
  id uuid primary key default gen_random_uuid(),
  reviewer_user_id uuid references auth.users(id) on delete cascade,
  lure_label text not null,
  lure_type text not null default 'document' check (lure_type in ('document','meeting_request','introduction','proposal','letter','gift','invitation')),
  claimed_intent text,
  semantic_validity_score numeric default 0,
  proof_of_build_present boolean default false,
  proof_details jsonb default '{}',
  source_entity text,
  source_country text,
  verdict text not null default 'unreviewed' check (verdict in ('unreviewed','legitimate','suspicious','confirmed_lure','rejected')),
  time_saved_minutes integer default 0,
  created_at timestamptz default now()
);

alter table public.diplomatic_lure_registry enable row level security;
create policy "Users manage own lure reviews" on public.diplomatic_lure_registry for all using (reviewer_user_id = auth.uid());
create index idx_diplomatic_lure_verdict on public.diplomatic_lure_registry(verdict);

-- Diplomatic refund ledger
create table if not exists public.diplomatic_refund_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  incident_label text not null,
  time_lost_minutes integer default 0,
  reputational_cost_score numeric default 0,
  financial_exposure_usd numeric default 0,
  root_cause text,
  proxy_audit_id uuid references public.proxy_influence_audit(id),
  lure_id uuid references public.diplomatic_lure_registry(id),
  refund_status text not null default 'calculated' check (refund_status in ('calculated','acknowledged','mitigated','closed')),
  lessons_learned text,
  created_at timestamptz default now()
);

alter table public.diplomatic_refund_ledger enable row level security;
create policy "Users manage own diplomatic refunds" on public.diplomatic_refund_ledger for all using (user_id = auth.uid());

-- Handshake sovereignty gates
create table if not exists public.handshake_sovereignty_gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_label text not null,
  participants jsonb not null default '[]',
  artifact_verified boolean default false,
  artifact_id text,
  biometric_pulse_confirmed boolean default false,
  stakes_level text not null default 'standard' check (stakes_level in ('standard','elevated','high','critical','sovereign')),
  sovereignty_score numeric default 0,
  session_status text not null default 'pending' check (session_status in ('pending','verified','in_progress','completed','rejected','escalated')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.handshake_sovereignty_gates enable row level security;
create policy "Users manage own handshake gates" on public.handshake_sovereignty_gates for all using (user_id = auth.uid());
create index idx_handshake_stakes on public.handshake_sovereignty_gates(stakes_level);
