-- Security schema hardening:
-- 1) lock down SECURITY DEFINER RPCs
-- 2) close RLS write gaps by adding WITH CHECK
-- 3) tighten broad-read policies
-- 4) make internal tables explicitly service-role only

begin;

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER hardening
-- ---------------------------------------------------------------------------

create or replace function public.search_profiles_fts(
  p_user_id uuid,
  p_query text,
  p_limit integer default 50
)
returns setof public.profiles
language sql
stable
security definer
set search_path = public, auth
as $$
  select *
  from public.profiles
  where owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and to_tsvector('english', coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(company,''))
        @@ plainto_tsquery('english', p_query)
  order by match_score desc nulls last
  limit greatest(1, least(p_limit, 200));
$$;

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
set search_path = public, auth
as $$
  select profile_id, profile_name, bot_probability, bot_signals, value_score
  from public.connection_scoring
  where owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and bot_probability >= p_threshold
  order by bot_probability desc;
$$;

create or replace function public.get_invitation_stats(p_user_id uuid)
returns table (
  status text,
  count bigint,
  avg_importance numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select invitation_status, count(*), avg(importance_score)
  from public.invitation_tracking
  where owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
  group by invitation_status
  order by count desc;
$$;

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
set search_path = public, auth
as $$
  select measurement_date, reasoning_depth_score, self_improvement_rate, autonomy_pct, slope_status
  from public.rsi_learning_slope
  where owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
    and measurement_date >= current_date - interval '30 days'
  order by measurement_date asc;
$$;

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
set search_path = public, auth
as $$
  select
    t.name as tribe_name,
    0::bigint as member_count,
    avg(cs.value_score) as avg_value_score,
    avg(cs.alignment_score) as avg_alignment
  from public.tribes t
  left join public.connection_scoring cs on cs.owner_user_id = p_user_id
  where t.owner_user_id = p_user_id
    and (auth.role() = 'service_role' or p_user_id = auth.uid())
  group by t.name
  order by member_count desc;
$$;

create or replace function public.compute_voting_power(
  p_user_id uuid,
  p_tribe_id text
) returns numeric
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_trust_score numeric := 0;
  v_alpha_points numeric := 0;
  v_build_count numeric := 0;
  v_power numeric;
begin
  if auth.role() != 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  select coalesce(decision_layer_score, 0) into v_trust_score
    from trust_scores where user_id = p_user_id
    limit 1;

  select coalesce(sum(human_alpha_points), 0) into v_alpha_points
    from human_alpha_decisions where user_id = p_user_id;

  select coalesce(count(*), 0) into v_build_count
    from velocity_scores where user_id = p_user_id and verified_at is not null;

  v_power := (v_trust_score * 0.4)
           + (least(v_alpha_points, 100) * 0.35)
           + (least(v_build_count * 2, 50) * 0.25);

  return greatest(v_power, 1.0);
end;
$$;

create or replace function public.resolve_delegation_chain(
  p_user_id uuid,
  p_tribe_id text,
  p_domain text default 'all'
) returns uuid
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_current uuid := p_user_id;
  v_next uuid;
  v_depth integer := 0;
  v_visited uuid[] := array[p_user_id];
begin
  if auth.role() != 'service_role' and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  loop
    select delegate_user_id into v_next
      from governance_delegations
      where delegator_user_id = v_current
        and tribe_id = p_tribe_id
        and (domain = p_domain or domain = 'all')
        and is_active = true
      limit 1;

    if v_next is null then
      return v_current;
    end if;

    v_depth := v_depth + 1;
    if v_depth >= 5 then
      return v_current;
    end if;

    if v_next = any(v_visited) then
      return v_current;
    end if;

    v_visited := array_append(v_visited, v_next);
    v_current := v_next;
  end loop;
end;
$$;

create or replace function public.update_fulfillment_yield()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() != 'service_role' and auth.uid() is distinct from NEW.buyer_user_id and auth.uid() is distinct from NEW.seller_user_id then
    raise exception 'forbidden';
  end if;

  if NEW.status = 'completed' and NEW.buyer_fulfillment_yield is not null then
    insert into fulfillment_yield_scores (user_id, total_experiences_bought, avg_buyer_fulfillment, combined_fulfillment_yield, last_activity_at, updated_at)
    values (NEW.buyer_user_id, 1, NEW.buyer_fulfillment_yield, NEW.buyer_fulfillment_yield, now(), now())
    on conflict (user_id) do update set
      total_experiences_bought = fulfillment_yield_scores.total_experiences_bought + 1,
      avg_buyer_fulfillment = (
        (fulfillment_yield_scores.avg_buyer_fulfillment * fulfillment_yield_scores.total_experiences_bought + NEW.buyer_fulfillment_yield)
        / (fulfillment_yield_scores.total_experiences_bought + 1)
      ),
      combined_fulfillment_yield = (
        (fulfillment_yield_scores.avg_seller_fulfillment + (
          (fulfillment_yield_scores.avg_buyer_fulfillment * fulfillment_yield_scores.total_experiences_bought + NEW.buyer_fulfillment_yield)
          / (fulfillment_yield_scores.total_experiences_bought + 1)
        )) / 2
      ),
      last_activity_at = now(),
      updated_at = now();
  end if;

  if NEW.status = 'completed' and NEW.seller_fulfillment_yield is not null then
    insert into fulfillment_yield_scores (user_id, total_experiences_sold, avg_seller_fulfillment, combined_fulfillment_yield, last_activity_at, updated_at)
    values (NEW.seller_user_id, 1, NEW.seller_fulfillment_yield, NEW.seller_fulfillment_yield, now(), now())
    on conflict (user_id) do update set
      total_experiences_sold = fulfillment_yield_scores.total_experiences_sold + 1,
      avg_seller_fulfillment = (
        (fulfillment_yield_scores.avg_seller_fulfillment * fulfillment_yield_scores.total_experiences_sold + NEW.seller_fulfillment_yield)
        / (fulfillment_yield_scores.total_experiences_sold + 1)
      ),
      combined_fulfillment_yield = (
        ((
          (fulfillment_yield_scores.avg_seller_fulfillment * fulfillment_yield_scores.total_experiences_sold + NEW.seller_fulfillment_yield)
          / (fulfillment_yield_scores.total_experiences_sold + 1)
        ) + fulfillment_yield_scores.avg_buyer_fulfillment) / 2
      ),
      last_activity_at = now(),
      updated_at = now();
  end if;

  return NEW;
end;
$$;

revoke all on function public.refresh_dashboard_kpis() from public;
revoke all on function public.search_profiles_fts(uuid, text, integer) from public;
revoke all on function public.get_bot_flagged_connections(uuid, real) from public;
revoke all on function public.get_invitation_stats(uuid) from public;
revoke all on function public.get_rsi_slope_trend(uuid) from public;
revoke all on function public.get_tribal_cohesion(uuid) from public;
revoke all on function public.compute_voting_power(uuid, text) from public;
revoke all on function public.resolve_delegation_chain(uuid, text, text) from public;
revoke all on function public.update_fulfillment_yield() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.search_profiles_fts(uuid, text, integer) to authenticated;
    grant execute on function public.get_bot_flagged_connections(uuid, real) to authenticated;
    grant execute on function public.get_invitation_stats(uuid) to authenticated;
    grant execute on function public.get_rsi_slope_trend(uuid) to authenticated;
    grant execute on function public.get_tribal_cohesion(uuid) to authenticated;
    grant execute on function public.compute_voting_power(uuid, text) to authenticated;
    grant execute on function public.resolve_delegation_chain(uuid, text, text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS write checks (FOR ALL policies need WITH CHECK mirrors)
-- ---------------------------------------------------------------------------

drop policy if exists "Users can manage their own delegations" on public.governance_delegations;
create policy "Users can manage their own delegations" on public.governance_delegations
  for all using (auth.uid() = delegator_user_id) with check (auth.uid() = delegator_user_id);

drop policy if exists "Sellers manage own listings" on public.marketplace_listings;
create policy "Sellers manage own listings" on public.marketplace_listings
  for all using (auth.uid() = seller_user_id) with check (auth.uid() = seller_user_id);

drop policy if exists "Users manage own scores" on public.fulfillment_yield_scores;
create policy "Users manage own scores" on public.fulfillment_yield_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own masking sessions" on public.biometric_masking_sessions;
create policy "Users manage own masking sessions" on public.biometric_masking_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own ethical resolutions" on public.ethical_deadlock_resolutions;
create policy "Users manage own ethical resolutions" on public.ethical_deadlock_resolutions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own security audits" on public.vibe_code_security_audits;
create policy "Users manage own security audits" on public.vibe_code_security_audits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own power configs" on public.solid_state_power_configs;
create policy "Users manage own power configs" on public.solid_state_power_configs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own accountability audits" on public.accountability_gap_audit;
create policy "Users manage own accountability audits" on public.accountability_gap_audit
  for all using (analyst_user_id = auth.uid()) with check (analyst_user_id = auth.uid());

drop policy if exists "Users manage own sanctions" on public.economic_sanction_ledger;
create policy "Users manage own sanctions" on public.economic_sanction_ledger
  for all using (enforcer_user_id = auth.uid()) with check (enforcer_user_id = auth.uid());

drop policy if exists "Users manage own reconstructions" on public.hidden_narrative_reconstructions;
create policy "Users manage own reconstructions" on public.hidden_narrative_reconstructions
  for all using (analyst_user_id = auth.uid()) with check (analyst_user_id = auth.uid());

drop policy if exists "Users manage own hygiene reports" on public.network_hygiene_reports;
create policy "Users manage own hygiene reports" on public.network_hygiene_reports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists judgment_ledger_owner_rw on public.judgment_ledger;
create policy judgment_ledger_owner_rw on public.judgment_ledger
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sprint_tasks_owner_rw on public.sprint_tasks;
create policy sprint_tasks_owner_rw on public.sprint_tasks
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists content_amp_owner_rw on public.content_amplifications;
create policy content_amp_owner_rw on public.content_amplifications
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists sovereignty_owner_rw on public.sovereignty_profile;
create policy sovereignty_owner_rw on public.sovereignty_profile
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists shadow_sessions_owner_rw on public.shadow_agent_sessions;
create policy shadow_sessions_owner_rw on public.shadow_agent_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists delta_reports_owner_rw on public.delta_reports;
create policy delta_reports_owner_rw on public.delta_reports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists proof_of_build_owner_rw on public.proof_of_build;
create policy proof_of_build_owner_rw on public.proof_of_build
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists skills_verification_owner_rw on public.skills_verification;
create policy skills_verification_owner_rw on public.skills_verification
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists platform_kpis_owner_rw on public.platform_kpis;
create policy platform_kpis_owner_rw on public.platform_kpis
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists career_alerts_owner_rw on public.career_flight_alerts;
create policy career_alerts_owner_rw on public.career_flight_alerts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists velocity_scores_owner_rw on public.velocity_scores;
create policy velocity_scores_owner_rw on public.velocity_scores
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Tighten broad read policies to authenticated users only
-- ---------------------------------------------------------------------------

drop policy if exists skill_futures_read on public.skill_futures;
create policy skill_futures_read on public.skill_futures
  for select using (auth.role() = 'authenticated');

drop policy if exists prompt_marketplace_read on public.prompt_marketplace;
create policy prompt_marketplace_read on public.prompt_marketplace
  for select using (auth.role() = 'authenticated');

drop policy if exists verification_labs_read on public.verification_labs;
create policy verification_labs_read on public.verification_labs
  for select using (auth.role() = 'authenticated');

drop policy if exists feed_items_read on public.feed_items;
create policy feed_items_read on public.feed_items
  for select using (auth.role() = 'authenticated');

drop policy if exists attestations_authenticated_read on public.authenticity_attestations;
create policy attestations_authenticated_read on public.authenticity_attestations
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Internal-only table access model
-- ---------------------------------------------------------------------------

alter table if exists public.chat_events enable row level security;
revoke all on table public.chat_events from anon, authenticated;

alter table if exists public.sentinel_alert_dispatches enable row level security;
revoke all on table public.sentinel_alert_dispatches from anon, authenticated;

commit;
