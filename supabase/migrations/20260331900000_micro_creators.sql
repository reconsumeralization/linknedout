-- =============================================================================
-- Micro-Creators & Offshoots — Approved creator ecosystem
-- =============================================================================

begin;

-- Creator profiles with approval workflow
create table if not exists public.micro_creators (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  creator_name text not null,
  creator_type text not null default 'individual',
  domain text not null,
  bio text,
  portfolio_url text,
  approval_status text not null default 'pending',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  reputation_score numeric default 0,
  total_offshoots int default 0,
  total_revenue_usd numeric default 0,
  created_at timestamptz not null default now()
);
alter table public.micro_creators enable row level security;
create policy "owner_mc" on public.micro_creators for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_mc_status on public.micro_creators(approval_status);
create index if not exists idx_mc_domain on public.micro_creators(domain);

-- Offshoots: derivative works / micro-products created by approved creators
create table if not exists public.creator_offshoots (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.micro_creators(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  offshoot_name text not null,
  offshoot_type text not null default 'tool',
  description text,
  parent_tool_ref text,
  source_sovereign_tool text,
  license_type text default 'standard',
  royalty_pct numeric default 10,
  price_usd numeric default 0,
  status text not null default 'draft',
  downloads int default 0,
  rating_avg numeric default 0,
  rating_count int default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
alter table public.creator_offshoots enable row level security;
create policy "owner_co" on public.creator_offshoots for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create index if not exists idx_co_creator on public.creator_offshoots(creator_id);
create index if not exists idx_co_status on public.creator_offshoots(status);

-- Offshoot reviews from the community
create table if not exists public.offshoot_reviews (
  id uuid primary key default gen_random_uuid(),
  offshoot_id uuid not null references public.creator_offshoots(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating >= 1 and rating <= 5),
  review_text text,
  created_at timestamptz not null default now(),
  unique(offshoot_id, reviewer_user_id)
);
alter table public.offshoot_reviews enable row level security;
create policy "owner_or" on public.offshoot_reviews for all using (auth.uid() = reviewer_user_id) with check (auth.uid() = reviewer_user_id);

-- Revenue ledger for creator payouts
create table if not exists public.creator_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.micro_creators(id) on delete cascade,
  offshoot_id uuid not null references public.creator_offshoots(id) on delete cascade,
  buyer_user_id uuid references auth.users(id),
  amount_usd numeric not null default 0,
  royalty_usd numeric not null default 0,
  platform_fee_usd numeric not null default 0,
  status text default 'settled',
  created_at timestamptz not null default now()
);
alter table public.creator_revenue_ledger enable row level security;
create policy "owner_crl" on public.creator_revenue_ledger for all
  using (creator_id in (select id from public.micro_creators where owner_user_id = auth.uid()))
  with check (creator_id in (select id from public.micro_creators where owner_user_id = auth.uid()));

-- Creator approval queue (for admins/reviewers)
create table if not exists public.creator_approval_queue (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.micro_creators(id) on delete cascade,
  reviewer_user_id uuid references auth.users(id),
  decision text default 'pending',
  review_notes text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.creator_approval_queue enable row level security;
create policy "owner_caq" on public.creator_approval_queue for select using (
  creator_id in (select id from public.micro_creators where owner_user_id = auth.uid())
);

commit;
