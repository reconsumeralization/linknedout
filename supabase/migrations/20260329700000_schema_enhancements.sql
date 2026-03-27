-- Schema Enhancements: indexes, views, functions, RPC endpoints
-- Optimizes the 230-table schema for production query patterns

create extension if not exists pg_trgm;

-- ============================================================
-- 1. PERFORMANCE INDEXES (high-traffic query patterns)
-- ============================================================

-- Profiles: full-text search on name + headline + company
create index if not exists idx_profiles_fts on public.profiles
  using gin (to_tsvector('english', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(company,'')));

-- Profiles: compound filter for CRM views
create index if not exists idx_profiles_owner_industry on public.profiles (owner_user_id, industry) where industry is not null;
create index if not exists idx_profiles_owner_seniority on public.profiles (owner_user_id, seniority) where seniority is not null;

-- Tribes: owner lookup + name search
create index if not exists idx_tribes_owner on public.tribes (owner_user_id) where owner_user_id is not null;
create index if not exists idx_tribes_name_trgm on public.tribes using gin (name gin_trgm_ops);

-- Connection scoring: quick bot detection
create index if not exists idx_conn_scoring_bot_high on public.connection_scoring (owner_user_id)
  where bot_probability > 0.7;

-- Feed intelligence: unread high-importance items
create index if not exists idx_feed_intel_important on public.feed_intelligence (owner_user_id, importance desc)
  where importance >= 7;

-- Agent workflow states: active workflows
create index if not exists idx_agent_workflows_active on public.agent_workflow_states (owner_user_id, status)
  where status in ('running', 'pending');

-- Invitation tracking: reinvite candidates
create index if not exists idx_invitations_reinvite on public.invitation_tracking (owner_user_id, reinvite_at)
  where invitation_status = 'pending' and reinvite_at is not null;

-- RSI learning slope: latest measurements
create index if not exists idx_rsi_slope_latest on public.rsi_learning_slope (owner_user_id, measurement_date desc);

-- Sentinel activity events: recent events
-- sentinel_activity_events index applied if table exists
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='sentinel_activity_events') then
    execute 'create index if not exists idx_sentinel_events_recent on public.sentinel_activity_events (user_id, created_at desc)';
  end if;
end $$;

-- ============================================================
-- 2. MATERIALIZED VIEWS (dashboard aggregates)
-- ============================================================

-- Dashboard KPIs per user
create materialized view if not exists public.mv_user_dashboard_kpis as
select
  p.owner_user_id as user_id,
  count(distinct p.id) as total_profiles,
  count(distinct t.id) as total_tribes,
  count(distinct pr.id) as total_projects,
  count(distinct cs.id) as scored_connections,
  coalesce(avg(cs.value_score), 0)::numeric(10,2) as avg_connection_value,
  coalesce(avg(cs.alignment_score), 0)::numeric(10,2) as avg_alignment_score,
  count(distinct cs.id) filter (where cs.bot_probability > 0.7) as bot_flagged_count
from public.profiles p
left join public.tribes t on t.owner_user_id = p.owner_user_id
left join public.projects pr on pr.owner_user_id = p.owner_user_id
left join public.connection_scoring cs on cs.owner_user_id = p.owner_user_id
group by p.owner_user_id;

create unique index if not exists idx_mv_dashboard_kpis_user on public.mv_user_dashboard_kpis (user_id);

-- Tool usage summary
create materialized view if not exists public.mv_tool_usage_summary as
select
  owner_user_id as user_id,
  count(*) as total_actions,
  count(*) filter (where created_at > now() - interval '24 hours') as actions_24h,
  count(*) filter (where created_at > now() - interval '7 days') as actions_7d,
  max(created_at) as last_action_at
from public.activity_log
group by owner_user_id;

create unique index if not exists idx_mv_tool_usage_user on public.mv_tool_usage_summary (user_id);

-- ============================================================
-- 3. DATABASE FUNCTIONS (RPC endpoints)
-- ============================================================

-- Refresh dashboard KPIs (call periodically or after bulk operations)
create or replace function public.refresh_dashboard_kpis()
returns void
language sql
security definer
as $$
  refresh materialized view concurrently public.mv_user_dashboard_kpis;
  refresh materialized view concurrently public.mv_tool_usage_summary;
$$;

-- Full-text profile search
create or replace function public.search_profiles_fts(
  p_user_id uuid,
  p_query text,
  p_limit integer default 50
)
returns setof public.profiles
language sql
stable
security definer
as $$
  select *
  from public.profiles
  where owner_user_id = p_user_id
    and to_tsvector('english', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(company,''))
        @@ plainto_tsquery('english', p_query)
  order by match_score desc nulls last
  limit p_limit;
$$;

-- Get user's bot-flagged connections
create or replace function public.get_bot_flagged_connections(
  p_user_id uuid,
  p_threshold real default 0.7
)
returns table (
  profile_id text,
  profile_name text,
  bot_probability real,
  bot_signals jsonb,
  value_score integer
)
language sql
stable
security definer
as $$
  select profile_id, profile_name, bot_probability, bot_signals, value_score
  from public.connection_scoring
  where owner_user_id = p_user_id
    and bot_probability >= p_threshold
  order by bot_probability desc;
$$;

-- Get invitation hygiene stats
create or replace function public.get_invitation_stats(p_user_id uuid)
returns table (
  status text,
  count bigint,
  avg_importance numeric
)
language sql
stable
security definer
as $$
  select invitation_status, count(*), avg(importance_score)
  from public.invitation_tracking
  where owner_user_id = p_user_id
  group by invitation_status
  order by count desc;
$$;

-- Get RSI slope trend (last 30 days)
create or replace function public.get_rsi_slope_trend(p_user_id uuid)
returns table (
  measurement_date date,
  reasoning_depth numeric,
  self_improvement_rate numeric,
  autonomy_pct numeric,
  slope_status text
)
language sql
stable
security definer
as $$
  select measurement_date, reasoning_depth_score, self_improvement_rate, autonomy_pct, slope_status
  from public.rsi_learning_slope
  where owner_user_id = p_user_id
    and measurement_date >= current_date - interval '30 days'
  order by measurement_date asc;
$$;

-- Get tribal cohesion score
create or replace function public.get_tribal_cohesion(p_user_id uuid)
returns table (
  tribe_name text,
  member_count bigint,
  avg_value_score numeric,
  avg_alignment numeric
)
language sql
stable
security definer
as $$
  select
    t.name as tribe_name,
    0::bigint as member_count,
    avg(cs.value_score) as avg_value_score,
    avg(cs.alignment_score) as avg_alignment
  from public.tribes t
  left join public.connection_scoring cs on cs.owner_user_id = p_user_id
  where t.owner_user_id = p_user_id
  group by t.name
  order by member_count desc;
$$;

-- ============================================================
-- 4. TRIGGERS (auto-updated timestamps)
-- ============================================================

-- Generic updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to tables that have updated_at but may lack the trigger
do $$
declare
  tbl text;
begin
  for tbl in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
    and table_name not in (
      select event_object_table from information_schema.triggers
      where trigger_schema = 'public' and trigger_name like '%updated_at%'
    )
  loop
    execute format(
      'create trigger set_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      tbl, tbl
    );
  end loop;
end;
$$;

-- ============================================================
-- 5. ROW-LEVEL SECURITY AUDIT (ensure all tables have RLS)
-- ============================================================

do $$
declare
  tbl record;
begin
  for tbl in
    select tablename from pg_tables
    where schemaname = 'public'
    and tablename not like 'mv_%'
    and tablename not in (select relname::text from pg_class where relrowsecurity = true and relnamespace = 'public'::regnamespace)
  loop
    execute format('alter table public.%I enable row level security', tbl.tablename);
    raise notice 'Enabled RLS on: %', tbl.tablename;
  end loop;
end;
$$;
