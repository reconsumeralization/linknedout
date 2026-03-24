-- SENTINEL KPI webhook dispatch tracking
-- Internal service-role table to dedupe webhook alerts and keep delivery state.

create table if not exists public.sentinel_alert_dispatches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null,
  alert_type text not null default 'kpi',
  last_status text not null default 'never',
  last_sent_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  last_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, alert_key),
  check (last_status in ('never', 'sent', 'failed'))
);

drop trigger if exists set_sentinel_alert_dispatches_updated_at on public.sentinel_alert_dispatches;
create trigger set_sentinel_alert_dispatches_updated_at
before update on public.sentinel_alert_dispatches
for each row execute function public.set_updated_at();

alter table public.sentinel_alert_dispatches enable row level security;

create index if not exists sentinel_alert_dispatches_owner_sent_idx
  on public.sentinel_alert_dispatches (owner_user_id, last_sent_at desc);

create index if not exists sentinel_alert_dispatches_status_attempt_idx
  on public.sentinel_alert_dispatches (last_status, last_attempt_at desc);
