-- Fundraising: campaigns, donors, donations, and goals (owner-scoped, RLS).

create table if not exists public.fundraising_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  goal_amount numeric not null default 0,
  currency text not null default 'USD',
  status text not null default 'draft',
  start_date date,
  end_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (goal_amount >= 0),
  check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'OTHER')),
  check (status in ('draft', 'active', 'paused', 'completed', 'archived'))
);

create table if not exists public.fundraising_donors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.fundraising_campaigns(id) on delete set null,
  name text not null,
  email text,
  company text,
  phone text,
  notes text,
  total_donated numeric not null default 0,
  donation_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_donated >= 0),
  check (donation_count >= 0)
);

create table if not exists public.fundraising_donations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.fundraising_campaigns(id) on delete cascade,
  donor_id uuid references public.fundraising_donors(id) on delete set null,
  amount numeric not null,
  currency text not null default 'USD',
  status text not null default 'pledged',
  donated_at timestamptz not null default now(),
  note text,
  payment_method text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount > 0),
  check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'OTHER')),
  check (status in ('pledged', 'received', 'recurring', 'refunded', 'cancelled'))
);

create table if not exists public.fundraising_goals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.fundraising_campaigns(id) on delete cascade,
  title text not null,
  description text,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  currency text not null default 'USD',
  due_date date,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_amount >= 0),
  check (current_amount >= 0),
  check (currency in ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'OTHER')),
  check (status in ('active', 'met', 'missed', 'cancelled'))
);

drop trigger if exists set_fundraising_campaigns_updated_at on public.fundraising_campaigns;
create trigger set_fundraising_campaigns_updated_at
before update on public.fundraising_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists set_fundraising_donors_updated_at on public.fundraising_donors;
create trigger set_fundraising_donors_updated_at
before update on public.fundraising_donors
for each row execute function public.set_updated_at();

drop trigger if exists set_fundraising_donations_updated_at on public.fundraising_donations;
create trigger set_fundraising_donations_updated_at
before update on public.fundraising_donations
for each row execute function public.set_updated_at();

drop trigger if exists set_fundraising_goals_updated_at on public.fundraising_goals;
create trigger set_fundraising_goals_updated_at
before update on public.fundraising_goals
for each row execute function public.set_updated_at();

alter table public.fundraising_campaigns enable row level security;
alter table public.fundraising_donors enable row level security;
alter table public.fundraising_donations enable row level security;
alter table public.fundraising_goals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_campaigns' and policyname = 'fundraising_campaigns_owner_rw') then
    create policy fundraising_campaigns_owner_rw on public.fundraising_campaigns
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_donors' and policyname = 'fundraising_donors_owner_rw') then
    create policy fundraising_donors_owner_rw on public.fundraising_donors
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_donations' and policyname = 'fundraising_donations_owner_rw') then
    create policy fundraising_donations_owner_rw on public.fundraising_donations
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_goals' and policyname = 'fundraising_goals_owner_rw') then
    create policy fundraising_goals_owner_rw on public.fundraising_goals
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists fundraising_campaigns_owner_updated_idx on public.fundraising_campaigns (owner_user_id, updated_at desc);
create index if not exists fundraising_campaigns_owner_status_idx on public.fundraising_campaigns (owner_user_id, status);
create index if not exists fundraising_donors_owner_updated_idx on public.fundraising_donors (owner_user_id, updated_at desc);
create index if not exists fundraising_donors_campaign_idx on public.fundraising_donors (campaign_id) where campaign_id is not null;
create index if not exists fundraising_donations_campaign_donated_idx on public.fundraising_donations (campaign_id, donated_at desc);
create index if not exists fundraising_donations_donor_idx on public.fundraising_donations (donor_id) where donor_id is not null;
create index if not exists fundraising_goals_campaign_order_idx on public.fundraising_goals (campaign_id, sort_order, id);
