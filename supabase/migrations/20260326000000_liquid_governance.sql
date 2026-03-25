-- =============================================================================
-- Liquid Governance Protocol: Tribal Consensus via Weighted Liquid Democracy
-- Voting power weighted by Human Alpha + Trust Score + Proof of Build
-- Delegation chains with domain specificity and cycle prevention
-- =============================================================================

-- 1. GOVERNANCE PROPOSALS: The core proposal entity
create table if not exists public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  tribe_id text not null,
  proposer_user_id uuid not null references auth.users(id) on delete cascade,
  proposal_type text not null default 'custom',
    -- 'pivot' | 'policy_change' | 'resource_allocation' | 'member_action' | 'custom'
  title text not null,
  description text not null,
  evidence_ids jsonb default '[]'::jsonb,
    -- links to proof_of_build entries, judgment_ledger entries, etc.
  quorum_threshold numeric not null default 0.5,
    -- fraction of eligible voters (by power) that must participate
  approval_threshold numeric not null default 0.6,
    -- fraction of cast power that must approve
  status text not null default 'draft',
    -- 'draft' | 'open' | 'voting' | 'passed' | 'rejected' | 'executed' | 'expired'
  execution_payload jsonb,
    -- what happens if passed (e.g. { action: 'allocate_tokens', amount: 500, target: 'project_xyz' })
  vote_summary jsonb default '{}'::jsonb,
    -- materialized: { totalPower, approvePower, rejectPower, abstainPower, voterCount }
  expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gov_proposals_tribe_status_idx on governance_proposals(tribe_id, status);
create index if not exists gov_proposals_proposer_idx on governance_proposals(proposer_user_id);

alter table public.governance_proposals enable row level security;
create policy "Users can read proposals for their tribes" on governance_proposals
  for select using (true);
create policy "Users can insert proposals" on governance_proposals
  for insert with check (auth.uid() = proposer_user_id);
create policy "Proposers can update drafts" on governance_proposals
  for update using (auth.uid() = proposer_user_id and status = 'draft');

-- 2. GOVERNANCE VOTES: Individual weighted votes
create table if not exists public.governance_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references governance_proposals(id) on delete cascade,
  voter_user_id uuid not null references auth.users(id) on delete cascade,
  vote text not null,
    -- 'approve' | 'reject' | 'abstain'
  voting_power numeric not null default 1.0,
    -- computed at vote time from trust_score + human_alpha + proof_of_build
  delegation_from_user_id uuid references auth.users(id),
    -- set if voting on behalf of a delegator
  reasoning text,
  created_at timestamptz not null default now(),
  constraint gov_votes_unique unique (proposal_id, voter_user_id)
);
create index if not exists gov_votes_proposal_idx on governance_votes(proposal_id);
create index if not exists gov_votes_voter_idx on governance_votes(voter_user_id);

alter table public.governance_votes enable row level security;
create policy "Users can read votes on proposals" on governance_votes
  for select using (true);
create policy "Users can cast their own votes" on governance_votes
  for insert with check (auth.uid() = voter_user_id);

-- 3. GOVERNANCE DELEGATIONS: Liquid democracy delegation chains
create table if not exists public.governance_delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_user_id uuid not null references auth.users(id) on delete cascade,
  delegate_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text not null,
  domain text not null default 'all',
    -- 'all' | 'technical' | 'financial' | 'operational'
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint gov_delegations_no_self check (delegator_user_id != delegate_user_id)
);
create unique index if not exists gov_delegations_active_unique on governance_delegations(delegator_user_id, tribe_id, domain) where (is_active = true);
create index if not exists gov_delegations_delegate_idx on governance_delegations(delegate_user_id, tribe_id);
create index if not exists gov_delegations_delegator_idx on governance_delegations(delegator_user_id);

alter table public.governance_delegations enable row level security;
create policy "Users can read delegations in their tribes" on governance_delegations
  for select using (true);
create policy "Users can manage their own delegations" on governance_delegations
  for all using (auth.uid() = delegator_user_id);

-- 4. GOVERNANCE EXECUTION LOG: Audit trail of executed proposals
create table if not exists public.governance_execution_log (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references governance_proposals(id) on delete cascade,
  executed_by text not null default 'system',
    -- 'system' | 'ceo_agent' | 'manual'
  execution_result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists gov_exec_log_proposal_idx on governance_execution_log(proposal_id);

alter table public.governance_execution_log enable row level security;
create policy "Users can read execution logs" on governance_execution_log
  for select using (true);

-- 5. COMPUTE VOTING POWER: Weighted composite of trust + alpha + build
create or replace function public.compute_voting_power(
  p_user_id uuid,
  p_tribe_id text
) returns numeric
language plpgsql security definer stable
as $$
declare
  v_trust_score numeric := 0;
  v_alpha_points numeric := 0;
  v_build_count numeric := 0;
  v_power numeric;
begin
  -- Trust score component (0-100, from trust_scores table)
  select coalesce(decision_layer_score, 0) into v_trust_score
    from trust_scores where user_id = p_user_id
    limit 1;

  -- Human Alpha component (sum of alpha points from decisions)
  select coalesce(sum(human_alpha_points), 0) into v_alpha_points
    from human_alpha_decisions where user_id = p_user_id;

  -- Proof of Build component (count of verified velocity scores)
  select coalesce(count(*), 0) into v_build_count
    from velocity_scores where user_id = p_user_id and verified_at is not null;

  -- Weighted composite: 40% trust + 35% alpha (normalized to 100) + 25% builds (capped at 50)
  v_power := (v_trust_score * 0.4)
           + (least(v_alpha_points, 100) * 0.35)
           + (least(v_build_count * 2, 50) * 0.25);

  -- Minimum voting power of 1 for any authenticated user
  return greatest(v_power, 1.0);
end;
$$;

-- 6. RESOLVE DELEGATION CHAIN: Walk chain with cycle detection (max depth 5)
create or replace function public.resolve_delegation_chain(
  p_user_id uuid,
  p_tribe_id text,
  p_domain text default 'all'
) returns uuid
language plpgsql security definer stable
as $$
declare
  v_current uuid := p_user_id;
  v_next uuid;
  v_depth integer := 0;
  v_visited uuid[] := array[p_user_id];
begin
  loop
    select delegate_user_id into v_next
      from governance_delegations
      where delegator_user_id = v_current
        and tribe_id = p_tribe_id
        and (domain = p_domain or domain = 'all')
        and is_active = true
      limit 1;

    -- No delegation found, current user is the final voter
    if v_next is null then
      return v_current;
    end if;

    v_depth := v_depth + 1;

    -- Max depth protection
    if v_depth >= 5 then
      return v_current;
    end if;

    -- Cycle detection
    if v_next = any(v_visited) then
      return v_current;
    end if;

    v_visited := array_append(v_visited, v_next);
    v_current := v_next;
  end loop;
end;
$$;
