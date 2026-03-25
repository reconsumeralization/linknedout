-- Forensic Accountability: Justice Tariff Refund & Network Hygiene
-- Tools #169-172

-- Accountability gap tracking
create table if not exists public.accountability_gap_audit (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid references auth.users(id) on delete cascade,
  subject_label text not null,
  gap_type text not null default 'prosecution_stall' check (gap_type in ('prosecution_stall','regulatory_capture','institutional_latency','evidence_suppression','jurisdictional_void','whistleblower_retaliation')),
  institutional_body text,
  evidence_sources jsonb default '[]',
  severity_score numeric default 0,
  estimated_delay_years numeric default 0,
  financial_exposure_usd numeric default 0,
  linked_proxy_audit_id uuid,
  status text not null default 'identified' check (status in ('identified','investigating','documented','escalated','resolved','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.accountability_gap_audit enable row level security;
create policy "Users manage own accountability audits" on public.accountability_gap_audit for all using (analyst_user_id = auth.uid());
create index idx_accountability_severity on public.accountability_gap_audit(severity_score desc);
create index idx_accountability_status on public.accountability_gap_audit(status);

-- Economic sanction ledger
create table if not exists public.economic_sanction_ledger (
  id uuid primary key default gen_random_uuid(),
  enforcer_user_id uuid references auth.users(id) on delete cascade,
  target_node_label text not null,
  sanction_type text not null default 'token_freeze' check (sanction_type in ('token_freeze','compute_revoke','tribal_exclusion','staking_suspend','full_lockout')),
  reason text not null,
  linked_proxy_audit_id uuid,
  linked_accountability_id uuid references public.accountability_gap_audit(id),
  frozen_token_amount numeric default 0,
  sanction_status text not null default 'pending' check (sanction_status in ('pending','active','appealed','lifted','permanent')),
  appeal_deadline_at timestamptz,
  enforced_at timestamptz,
  lifted_at timestamptz,
  created_at timestamptz default now()
);

alter table public.economic_sanction_ledger enable row level security;
create policy "Users manage own sanctions" on public.economic_sanction_ledger for all using (enforcer_user_id = auth.uid());
create index idx_sanction_status on public.economic_sanction_ledger(sanction_status);

-- Hidden narrative reconstructions
create table if not exists public.hidden_narrative_reconstructions (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid references auth.users(id) on delete cascade,
  dataset_label text not null,
  original_redaction_pct numeric default 0,
  reconstruction_confidence numeric default 0,
  predicted_entities jsonb default '[]',
  predicted_connections jsonb default '[]',
  predicted_timeline jsonb default '[]',
  lewm_model_used text default 'latent-narrative-v1',
  verification_status text not null default 'draft' check (verification_status in ('draft','low_confidence','medium_confidence','high_confidence','verified','retracted')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.hidden_narrative_reconstructions enable row level security;
create policy "Users manage own reconstructions" on public.hidden_narrative_reconstructions for all using (analyst_user_id = auth.uid());

-- Network hygiene reports
create table if not exists public.network_hygiene_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  network_size integer default 0,
  high_risk_nodes integer default 0,
  medium_risk_nodes integer default 0,
  low_risk_nodes integer default 0,
  risk_categories jsonb default '{}',
  separation_degrees_to_risk numeric default 0,
  human_alpha_impact_score numeric default 0,
  recommendations jsonb default '[]',
  report_status text not null default 'generated' check (report_status in ('generated','reviewed','actioned','archived')),
  created_at timestamptz default now()
);

alter table public.network_hygiene_reports enable row level security;
create policy "Users manage own hygiene reports" on public.network_hygiene_reports for all using (user_id = auth.uid());
