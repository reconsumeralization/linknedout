-- Affective Sovereign: hedonic overwriting detection, valence decoding, aversive hardening

create table if not exists public.hedonic_overwrite_audits (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  feature_name text not null,
  appetitive_lure text,
  sensory_risk text,
  overwrite_detected boolean default false,
  hedonic_score numeric default 0,
  risk_score numeric default 0,
  net_judgment numeric default 0,
  recommendation text,
  audited_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.hedonic_overwrite_audits enable row level security;
create policy "owner_hedonic_overwrite" on public.hedonic_overwrite_audits for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.aversive_hardening_log (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  trigger_pattern text not null,
  trigger_source text,
  valence text default 'aversive' check (valence in ('aversive','appetitive','neutral')),
  hardening_level text default 'permanent' check (hardening_level in ('temporary','session','permanent','crystalline')),
  tribal_propagated boolean default false,
  single_exposure boolean default false,
  etched_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.aversive_hardening_log enable row level security;
create policy "owner_aversive" on public.aversive_hardening_log for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

create table if not exists public.affective_refund_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mission_name text not null,
  hedonic_transfer_score numeric default 0,
  fulfillment_yield numeric default 0,
  sensory_cost numeric default 0,
  net_affective_refund numeric default 0,
  valence_classification text default 'neutral' check (valence_classification in ('deeply_fulfilling','fulfilling','neutral','draining','harmful')),
  measured_at timestamptz default now(),
  created_at timestamptz not null default now()
);
alter table public.affective_refund_ledger enable row level security;
create policy "owner_affective_refund" on public.affective_refund_ledger for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
