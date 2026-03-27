-- Sovereign Functions: The "Autonomic Intelligence" layer
-- Moves the database from "Data Store" to "Living Nervous System"
-- Supports the 466+ Tool Registry with thermodynamic, forensic, geometric,
-- biological, discovery, and failover functions.

begin;

-- ===========================================================================
-- 0. SUPPORTING TABLES (must be created before functions that reference them)
-- ===========================================================================

-- Artifact sessions: biometric pulse tracking
create table if not exists public.artifact_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  biometric_hash text not null,
  device_type text default 'sovereign_stone',
  last_pulse_at timestamptz not null default now(),
  pulse_count integer default 1,
  trust_level text default 'sovereign',
  created_at timestamptz not null default now()
);
create index if not exists artifact_sessions_user_idx on artifact_sessions(user_id);

alter table artifact_sessions enable row level security;
create policy artifact_sessions_owner on artifact_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Barter exchanges: sovereign swap marketplace
create table if not exists public.barter_exchanges (
  id uuid primary key default gen_random_uuid(),
  party_a_tribe_id text not null,
  party_b_tribe_id text not null,
  resource_id text,
  resource_description text not null,
  offer_value numeric not null default 0,
  counter_value numeric default 0,
  status text not null default 'proposed' check (status in ('proposed','negotiating','completed','cancelled','expired')),
  initiated_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists barter_exchanges_parties_idx on barter_exchanges(party_a_tribe_id, party_b_tribe_id);
create index if not exists barter_exchanges_status_idx on barter_exchanges(status);

alter table barter_exchanges enable row level security;
create policy barter_exchanges_read on barter_exchanges
  for select to authenticated using (true);
create policy barter_exchanges_write on barter_exchanges
  for all to authenticated
  using (initiated_by = auth.uid())
  with check (initiated_by = auth.uid());

-- Add last_artifact_sync to sovereignty_profile if missing
alter table public.sovereignty_profile
  add column if not exists last_artifact_sync timestamptz;

-- Dependency lineage: supply chain verification
create table if not exists public.dependency_lineage (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  package_name text not null,
  version_pinned text not null,
  sha256_hash text,
  verified_by text,
  verified_at timestamptz,
  is_compromised boolean default false,
  risk_score numeric default 0,
  created_at timestamptz not null default now(),
  constraint dep_lineage_unique unique (owner_user_id, package_name, version_pinned)
);
create index if not exists dep_lineage_user_idx on dependency_lineage(owner_user_id);
create index if not exists dep_lineage_package_idx on dependency_lineage(package_name);

alter table dependency_lineage enable row level security;
create policy dep_lineage_owner on dependency_lineage
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ===========================================================================
-- 1. THERMODYNAMIC LAYER — Energy-to-Insight ROI
-- ===========================================================================

-- Calculate joule efficiency: joins basepower telemetry with refund ledger
-- to detect agents "over-heating" the economy (Jevons Paradox detection)
create or replace function public.calculate_joule_efficiency(
  p_user_id uuid,
  p_tool_id text default null
)
returns table (
  tool_name text,
  total_runs bigint,
  total_tokens_used bigint,
  estimated_joules numeric,
  total_refund_value numeric,
  joule_efficiency numeric,
  jevons_risk boolean
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(ar.template_id, 'unknown') as tool_name,
    count(*) as total_runs,
    sum(coalesce(ar.token_input, 0) + coalesce(ar.token_output, 0))::bigint as total_tokens_used,
    -- Estimate joules: ~0.001 kWh per 1000 tokens (rough GPU inference estimate)
    (sum(coalesce(ar.token_input, 0) + coalesce(ar.token_output, 0)))::numeric * 0.0036 as estimated_joules,
    coalesce(sum(ar.estimated_cost_usd), 0) as total_refund_value,
    case
      when sum(coalesce(ar.token_input, 0) + coalesce(ar.token_output, 0)) > 0
      then sum(coalesce(ar.estimated_cost_usd, 0)) / ((sum(coalesce(ar.token_input, 0) + coalesce(ar.token_output, 0)))::numeric * 0.0036)
      else 0
    end as joule_efficiency,
    -- Jevons risk: efficiency gains leading to MORE consumption
    (count(*) > 50 and sum(coalesce(ar.estimated_cost_usd, 0)) > 10) as jevons_risk
  from public.agent_runs ar
  where ar.owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and (p_tool_id is null or ar.template_id = p_tool_id)
    and ar.created_at >= now() - interval '30 days'
  group by ar.template_id
  order by total_runs desc;
$$;

-- ===========================================================================
-- 2. FORENSIC & ADVERSARY LAYER — SENTINEL Intelligence
-- ===========================================================================

-- Sentinel threat intel table (for adversary fingerprinting)
create table if not exists public.sentinel_threat_intel (
  id uuid primary key default gen_random_uuid(),
  threat_type text not null default 'unknown',
  description text,
  source text,
  embedding vector(1536),
  attack_count bigint default 1,
  severity text default 'medium',
  created_at timestamptz not null default now()
);
create index if not exists threat_intel_type_idx on sentinel_threat_intel(threat_type);

alter table sentinel_threat_intel enable row level security;
create policy threat_intel_read on sentinel_threat_intel
  for select to authenticated using (true);

-- Match adversary fingerprint: similarity search against tribal threat intel pool
create or replace function public.match_adversary_fingerprint(
  p_user_id uuid,
  p_artifact_vector vector(1536),
  p_threshold real default 0.75,
  p_limit integer default 10
)
returns table (
  threat_id text,
  threat_type text,
  similarity real,
  first_seen timestamptz,
  attack_count bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    id::text as threat_id,
    threat_type,
    (1 - (embedding <=> p_artifact_vector))::real as similarity,
    created_at as first_seen,
    coalesce(attack_count, 1) as attack_count
  from public.sentinel_threat_intel
  where (1 - (embedding <=> p_artifact_vector)) >= p_threshold
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
  order by similarity desc
  limit greatest(1, least(p_limit, 50));
$$;

-- Audit dependency lineage: check for compromised packages in the supply chain
create or replace function public.audit_dependency_lineage(
  p_user_id uuid,
  p_package_name text default null
)
returns table (
  package_name text,
  version_pinned text,
  sha256_hash text,
  verified_by text,
  verification_date timestamptz,
  is_compromised boolean,
  risk_score numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    dl.package_name,
    dl.version_pinned,
    dl.sha256_hash,
    dl.verified_by,
    dl.verified_at as verification_date,
    dl.is_compromised,
    dl.risk_score
  from public.dependency_lineage dl
  where dl.owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and (p_package_name is null or dl.package_name = p_package_name)
  order by dl.risk_score desc nulls last;
$$;

-- ===========================================================================
-- 3. BIOLOGICAL ROOT — Artifact Verification
-- ===========================================================================

-- Verify artifact pulse: Dead-Man's Switch + biometric air-gap verification
-- Freezes all agentic token movements if heartbeat missing > threshold
create or replace function public.verify_artifact_pulse(
  p_user_id uuid,
  p_biometric_hash text
)
returns table (
  pulse_valid boolean,
  last_heartbeat timestamptz,
  seconds_since_pulse numeric,
  freeze_triggered boolean,
  trust_level text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_last_pulse timestamptz;
  v_seconds_gap numeric;
  v_threshold_seconds numeric := 86400; -- 24 hours = "Chernobyl Threshold"
  v_is_valid boolean;
  v_freeze boolean;
  v_trust text;
begin
  if auth.role() != 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  -- Find last heartbeat
  select max(last_pulse_at) into v_last_pulse
    from public.artifact_sessions
    where user_id = p_user_id
      and biometric_hash = p_biometric_hash;

  if v_last_pulse is null then
    -- No pulse record found — check sovereignty profile
    select max(last_artifact_sync) into v_last_pulse
      from public.sovereignty_profile
      where user_id = p_user_id;
  end if;

  v_seconds_gap := extract(epoch from (now() - coalesce(v_last_pulse, now() - interval '999 days')));
  v_is_valid := v_seconds_gap < v_threshold_seconds;
  v_freeze := v_seconds_gap >= v_threshold_seconds;

  v_trust := case
    when v_seconds_gap < 3600 then 'sovereign'        -- < 1 hour
    when v_seconds_gap < 43200 then 'trusted'          -- < 12 hours
    when v_seconds_gap < 86400 then 'degraded'         -- < 24 hours
    else 'frozen'                                       -- Dead-Man's Switch
  end;

  return query select v_is_valid, v_last_pulse, v_seconds_gap, v_freeze, v_trust;
end;
$$;

-- ===========================================================================
-- 4. DISCOVERY LAYER — Sovereign Swap Negotiation
-- ===========================================================================

-- Negotiate sovereign swap: calculate trade value between tribal resources
-- using hedonic regression without centralized pricing
create or replace function public.negotiate_sovereign_swap(
  p_tribe_a text,
  p_tribe_b text,
  p_resource_id text default null
)
returns table (
  resource_name text,
  tribe_a_valuation numeric,
  tribe_b_valuation numeric,
  hedonic_midpoint numeric,
  swap_fair boolean,
  fairness_score numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    be.resource_description as resource_name,
    be.offer_value as tribe_a_valuation,
    be.counter_value as tribe_b_valuation,
    (be.offer_value + be.counter_value) / 2 as hedonic_midpoint,
    abs(be.offer_value - be.counter_value) / greatest(be.offer_value, be.counter_value, 0.01) < 0.3 as swap_fair,
    1 - (abs(be.offer_value - be.counter_value) / greatest(be.offer_value, be.counter_value, 0.01)) as fairness_score
  from public.barter_exchanges be
  where be.party_a_tribe_id = p_tribe_a
    and be.party_b_tribe_id = p_tribe_b
    and (p_resource_id is null or be.resource_id = p_resource_id)
    and be.status in ('proposed', 'negotiating', 'completed')
  order by be.created_at desc;
$$;

-- ===========================================================================
-- 5. RESILIENCE LAYER — Baha Blast & Signal Processing
-- ===========================================================================

-- Trigger Baha Blast: escalates system state from Code Red to Confidence
create or replace function public.trigger_baha_blast(
  p_user_id uuid,
  p_threat_level text default 'code_red'
)
returns table (
  blast_id uuid,
  frozen_agents integer,
  rotated_keys integer,
  quarantined_deps integer,
  status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_blast_id uuid := gen_random_uuid();
  v_frozen integer := 0;
  v_rotated integer := 0;
  v_quarantined integer := 0;
begin
  if auth.role() != 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  -- Freeze all non-essential agent runs
  update public.agent_runs
    set status = 'frozen'
    where owner_user_id = p_user_id
      and status in ('running', 'pending');
  get diagnostics v_frozen = row_count;

  -- Mark all integration keys for rotation
  update public.integration_configs
    set health_status = 'rotation_needed',
        status = 'pending'
    where user_id = p_user_id
      and status = 'connected';
  get diagnostics v_rotated = row_count;

  -- Log the blast event
  insert into public.sentinel_incidents (
    id, owner_user_id, title, summary, severity, status, detected_at, created_at
  ) values (
    v_blast_id, p_user_id, 'Baha Blast Protocol',
    'Baha Blast triggered: ' || v_frozen || ' agents frozen, ' || v_rotated || ' keys queued for rotation',
    p_threat_level, 'investigating', now(), now()
  );

  return query select v_blast_id, v_frozen, v_rotated, v_quarantined, 'blast_active'::text;
end;
$$;

-- Calculate signal redshift: prune "tired" global news for "blue-shifted" tribal data
create or replace function public.calculate_signal_redshift(
  p_user_id uuid,
  p_days integer default 7
)
returns table (
  signal_id text,
  source text,
  content_summary text,
  redshift_score numeric,
  is_tribal boolean,
  freshness_hours numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    sf.id as signal_id,
    sf.author_id as source,
    left(sf.result_summary, 200) as content_summary,
    -- Redshift: older + external = higher redshift = less relevant
    extract(epoch from (now() - sf.created_at)) / 3600.0 *
      case when sf.tribe_id is not null then 0.1 else 1.0 end as redshift_score,
    sf.tribe_id is not null as is_tribal,
    extract(epoch from (now() - sf.created_at)) / 3600.0 as freshness_hours
  from public.tribe_signal_feed sf
  where sf.created_at >= now() - (p_days || ' days')::interval
  order by redshift_score asc  -- Blue-shifted (tribal, fresh) first
  limit 100;
$$;

-- ===========================================================================
-- 6. MEANING LAYER — Grand Mission Generation
-- ===========================================================================

-- Generate grand mission: calculates "Fulfillment Gap" to prevent boredom
create or replace function public.generate_grand_mission(
  p_user_id uuid
)
returns table (
  current_fulfillment numeric,
  target_fulfillment numeric,
  fulfillment_gap numeric,
  suggested_domain text,
  urgency_level text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(fy.combined_fulfillment_yield, 0) as current_fulfillment,
    0.95 as target_fulfillment,
    greatest(0, 0.95 - coalesce(fy.combined_fulfillment_yield, 0)) as fulfillment_gap,
    case
      when coalesce(fy.avg_seller_fulfillment, 0) < coalesce(fy.avg_buyer_fulfillment, 0)
      then 'creation'  -- Need to create more
      else 'consumption'  -- Need to consume more experiences
    end as suggested_domain,
    case
      when coalesce(fy.combined_fulfillment_yield, 0) < 0.3 then 'critical'
      when coalesce(fy.combined_fulfillment_yield, 0) < 0.6 then 'moderate'
      when coalesce(fy.combined_fulfillment_yield, 0) < 0.8 then 'healthy'
      else 'sovereign'
    end as urgency_level
  from (select 1) _
  left join public.fulfillment_yield_scores fy on fy.user_id = p_user_id
  where auth.role() = 'service_role' or p_user_id = auth.uid();
$$;

-- ===========================================================================
-- 7. ENTROPY REFUND — Energy-to-Fulfillment Accounting (#438)
-- ===========================================================================

create or replace function public.calculate_entropy_refund(
  p_user_id uuid,
  p_period_days integer default 30
)
returns table (
  total_joules_consumed numeric,
  total_fulfillment_generated numeric,
  entropy_ratio numeric,
  entropy_debt numeric,
  energy_efficiency_grade text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(sum((coalesce(ar.token_input, 0) + coalesce(ar.token_output, 0))::numeric * 0.0036), 0) as total_joules_consumed,
    coalesce(fy.combined_fulfillment_yield, 0) as total_fulfillment_generated,
    case
      when coalesce(fy.combined_fulfillment_yield, 0) > 0
      then coalesce(sum((coalesce(ar.token_input, 0) + coalesce(ar.token_output, 0))::numeric * 0.0036), 0) / greatest(fy.combined_fulfillment_yield, 0.01)
      else 999
    end as entropy_ratio,
    greatest(0, coalesce(sum((coalesce(ar.token_input, 0) + coalesce(ar.token_output, 0))::numeric * 0.0036), 0) - coalesce(fy.combined_fulfillment_yield, 0) * 100) as entropy_debt,
    case
      when coalesce(fy.combined_fulfillment_yield, 0) > 0.8 then 'A — Sovereign'
      when coalesce(fy.combined_fulfillment_yield, 0) > 0.6 then 'B — Efficient'
      when coalesce(fy.combined_fulfillment_yield, 0) > 0.3 then 'C — Leaking'
      else 'D — Burning'
    end as energy_efficiency_grade
  from public.agent_runs ar
  left join public.fulfillment_yield_scores fy on fy.user_id = p_user_id
  where ar.owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and ar.created_at >= now() - (p_period_days || ' days')::interval
  group by fy.combined_fulfillment_yield;
$$;

-- Revoke public access, grant to authenticated
revoke all on function public.calculate_joule_efficiency(uuid, text) from public;
revoke all on function public.verify_artifact_pulse(uuid, text) from public;
revoke all on function public.trigger_baha_blast(uuid, text) from public;
revoke all on function public.calculate_signal_redshift(uuid, integer) from public;
revoke all on function public.generate_grand_mission(uuid) from public;
revoke all on function public.calculate_entropy_refund(uuid, integer) from public;
revoke all on function public.negotiate_sovereign_swap(text, text, text) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.calculate_joule_efficiency(uuid, text) to authenticated;
    grant execute on function public.verify_artifact_pulse(uuid, text) to authenticated;
    grant execute on function public.trigger_baha_blast(uuid, text) to authenticated;
    grant execute on function public.calculate_signal_redshift(uuid, integer) to authenticated;
    grant execute on function public.generate_grand_mission(uuid) to authenticated;
    grant execute on function public.calculate_entropy_refund(uuid, integer) to authenticated;
    grant execute on function public.negotiate_sovereign_swap(text, text, text) to authenticated;
  end if;
end $$;

commit;
