-- Fundraising outreach: email and LinkedIn campaigns (owner-scoped, RLS).

create table if not exists public.fundraising_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  fundraising_campaign_id uuid not null references public.fundraising_campaigns(id) on delete cascade,
  channel text not null,
  name text not null,
  subject text,
  body_text text not null default '',
  status text not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  linkedin_post_id text,
  email_integration_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel in ('email', 'linkedin')),
  check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed'))
);

create table if not exists public.fundraising_outreach_recipients (
  id uuid primary key default gen_random_uuid(),
  outreach_campaign_id uuid not null references public.fundraising_outreach_campaigns(id) on delete cascade,
  donor_id uuid references public.fundraising_donors(id) on delete set null,
  email text not null,
  name text,
  status text not null default 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  check (status in ('pending', 'sent', 'failed'))
);

drop trigger if exists set_fundraising_outreach_campaigns_updated_at on public.fundraising_outreach_campaigns;
create trigger set_fundraising_outreach_campaigns_updated_at
before update on public.fundraising_outreach_campaigns
for each row execute function public.set_updated_at();

alter table public.fundraising_outreach_campaigns enable row level security;
alter table public.fundraising_outreach_recipients enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_outreach_campaigns' and policyname = 'fundraising_outreach_campaigns_owner_rw') then
    create policy fundraising_outreach_campaigns_owner_rw on public.fundraising_outreach_campaigns
      for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fundraising_outreach_recipients' and policyname = 'fundraising_outreach_recipients_owner_via_campaign') then
    create policy fundraising_outreach_recipients_owner_via_campaign on public.fundraising_outreach_recipients
      for all to authenticated
      using (
        exists (
          select 1 from public.fundraising_outreach_campaigns c
          where c.id = outreach_campaign_id and c.owner_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.fundraising_outreach_campaigns c
          where c.id = outreach_campaign_id and c.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

create index if not exists fundraising_outreach_campaigns_owner_updated_idx on public.fundraising_outreach_campaigns (owner_user_id, updated_at desc);
create index if not exists fundraising_outreach_campaigns_fundraising_campaign_idx on public.fundraising_outreach_campaigns (fundraising_campaign_id);
create index if not exists fundraising_outreach_recipients_outreach_status_idx on public.fundraising_outreach_recipients (outreach_campaign_id, status);
