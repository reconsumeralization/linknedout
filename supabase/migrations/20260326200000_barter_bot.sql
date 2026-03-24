-- =============================================================================
-- Barter Bot: P2P Inter-Sovereign Trade Engine
-- Trade offers, negotiation sessions, and escrow for sovereign asset exchange
-- =============================================================================

-- 1. SOVEREIGN TRADE OFFERS: Listings for P2P asset exchange
create table if not exists public.sovereign_trade_offers (
  id uuid primary key default gen_random_uuid(),
  offerer_user_id uuid not null references auth.users(id) on delete cascade,
  offer_type text not null,            -- 'energy_credits' | 'compute_tokens' | 'xenobot_blueprint' | 'marketplace_listing' | 'custom_asset'
  asset_description text,
  quantity numeric,
  min_acceptable_return jsonb,         -- { asset_type, min_quantity, flexible: bool }
  status text not null default 'open', -- 'open' | 'in_negotiation' | 'accepted' | 'withdrawn' | 'expired'
  visibility text not null default 'public', -- 'public' | 'tribe_only' | 'direct'
  target_user_id uuid references auth.users(id) on delete set null,
  target_tribe_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trade_offers_status_type_idx on sovereign_trade_offers(status, offer_type);
create index if not exists trade_offers_offerer_idx on sovereign_trade_offers(offerer_user_id);

-- 2. SOVEREIGN TRADE SESSIONS: Agent-mediated negotiation rounds
create table if not exists public.sovereign_trade_sessions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references sovereign_trade_offers(id) on delete cascade,
  party_a_user_id uuid not null references auth.users(id) on delete cascade,
  party_b_user_id uuid not null references auth.users(id) on delete cascade,
  party_a_agent_config jsonb,          -- agent model, strategy, constraints
  party_b_agent_config jsonb,
  negotiation_rounds jsonb not null default '[]'::jsonb,
  current_round integer not null default 0,
  max_rounds integer not null default 10,
  status text not null default 'initializing', -- 'initializing' | 'negotiating' | 'agreement_reached' | 'failed' | 'ratified' | 'cancelled'
  agreed_terms jsonb,
  sandbox_security_log jsonb,
  governance_ratification_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists trade_sessions_party_a_idx on sovereign_trade_sessions(party_a_user_id);
create index if not exists trade_sessions_party_b_idx on sovereign_trade_sessions(party_b_user_id);

-- 3. SOVEREIGN TRADE ESCROW: Held assets during trade execution
create table if not exists public.sovereign_trade_escrow (
  id uuid primary key default gen_random_uuid(),
  trade_session_id uuid not null references sovereign_trade_sessions(id) on delete cascade,
  depositor_user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null,
  amount numeric not null,
  status text not null default 'held', -- 'held' | 'released' | 'returned' | 'disputed'
  released_to_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz
);

-- 4. RLS POLICIES
alter table sovereign_trade_offers enable row level security;
create policy trade_offers_owner_rw on sovereign_trade_offers for all using (offerer_user_id = auth.uid());
create policy trade_offers_public_read on sovereign_trade_offers for select using (visibility = 'public');

alter table sovereign_trade_sessions enable row level security;
create policy trade_sessions_party_rw on sovereign_trade_sessions for all
  using (party_a_user_id = auth.uid() or party_b_user_id = auth.uid());

alter table sovereign_trade_escrow enable row level security;
create policy trade_escrow_party_read on sovereign_trade_escrow for select
  using (
    depositor_user_id = auth.uid()
    or trade_session_id in (
      select id from sovereign_trade_sessions
      where party_a_user_id = auth.uid() or party_b_user_id = auth.uid()
    )
  );
