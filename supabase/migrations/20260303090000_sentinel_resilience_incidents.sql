-- SENTINEL resilience incidents with business-impact tagging
create table if not exists public.sentinel_incidents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_event_id uuid references public.mcp_tool_audit_events(id) on delete set null,
  title text not null,
  summary text,
  severity text not null default 'medium',
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  containment_started_at timestamptz,
  contained_at timestamptz,
  resolved_at timestamptz,
  impacted_routes text[] not null default '{}'::text[],
  impacted_features text[] not null default '{}'::text[],
  impacted_users_estimate integer,
  estimated_revenue_impact_usd numeric(14,2),
  blast_radius text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (severity in ('low', 'medium', 'high', 'critical')),
  check (status in ('open', 'investigating', 'contained', 'resolved')),
  check (impacted_users_estimate is null or impacted_users_estimate >= 0),
  check (estimated_revenue_impact_usd is null or estimated_revenue_impact_usd >= 0)
);

drop trigger if exists set_sentinel_incidents_updated_at on public.sentinel_incidents;
create trigger set_sentinel_incidents_updated_at
before update on public.sentinel_incidents
for each row execute function public.set_updated_at();

alter table public.sentinel_incidents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sentinel_incidents' and policyname = 'sentinel_incidents_owner_rw'
  ) then
    create policy sentinel_incidents_owner_rw
      on public.sentinel_incidents
      for all to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;
end $$;

create index if not exists sentinel_incidents_owner_detected_idx on public.sentinel_incidents (owner_user_id, detected_at desc);
create index if not exists sentinel_incidents_owner_status_idx on public.sentinel_incidents (owner_user_id, status, severity);
create index if not exists sentinel_incidents_source_event_idx on public.sentinel_incidents (source_event_id);
