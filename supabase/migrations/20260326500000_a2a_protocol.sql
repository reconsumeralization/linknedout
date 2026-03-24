-- =============================================================================
-- A2A Protocol: Inter-Tribe Agent Intelligence Exchange
-- =============================================================================

-- 1. Discoverable agent "business cards"
create table if not exists public.a2a_agent_cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  agent_definition_id uuid,
  display_name text not null,
  capabilities text[] not null default '{}',
  pricing_tokens_per_task numeric default 0,
  availability text not null default 'available',  -- 'available' | 'busy' | 'offline'
  trust_score_minimum numeric default 0,
  max_concurrent_tasks integer default 3,
  total_tasks_completed integer default 0,
  avg_rating numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists a2a_agent_cards_capabilities_idx on a2a_agent_cards using gin (capabilities);
create index if not exists a2a_agent_cards_availability_idx on a2a_agent_cards(availability);

-- 2. Cross-factory agent task requests (handshakes)
create table if not exists public.a2a_handshakes (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  requester_agent_id uuid,
  provider_agent_card_id uuid references a2a_agent_cards(id) on delete cascade,
  task_description text not null,
  task_payload jsonb default '{}'::jsonb,
  agreed_price_tokens numeric,
  status text not null default 'requested',  -- 'requested' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'rejected' | 'cancelled'
  escrow_id uuid,
  result_payload jsonb,
  quality_rating numeric,
  requester_feedback text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists a2a_handshakes_requester_idx on a2a_handshakes(requester_user_id);
create index if not exists a2a_handshakes_provider_idx on a2a_handshakes(provider_user_id);
create index if not exists a2a_handshakes_status_idx on a2a_handshakes(status);

-- 3. Structured inter-agent messages
create table if not exists public.a2a_message_log (
  id uuid primary key default gen_random_uuid(),
  handshake_id uuid not null references a2a_handshakes(id) on delete cascade,
  sender text not null,        -- 'requester_agent' | 'provider_agent' | 'system'
  message_type text not null,  -- 'task_clarification' | 'progress_update' | 'result_delivery' | 'error_report'
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists a2a_message_log_handshake_created_idx on a2a_message_log(handshake_id, created_at);

-- 4. RLS policies
alter table a2a_agent_cards enable row level security;
create policy a2a_agent_cards_owner_rw on a2a_agent_cards for all using (owner_user_id = auth.uid());
create policy a2a_agent_cards_public_read on a2a_agent_cards for select using (availability != 'offline' and auth.uid() is not null);

alter table a2a_handshakes enable row level security;
create policy a2a_handshakes_participant_select on a2a_handshakes for select using (
  requester_user_id = auth.uid() or provider_user_id = auth.uid()
);
create policy a2a_handshakes_participant_update on a2a_handshakes for update using (
  requester_user_id = auth.uid() or provider_user_id = auth.uid()
);
create policy a2a_handshakes_requester_insert on a2a_handshakes for insert with check (requester_user_id = auth.uid());

alter table a2a_message_log enable row level security;
create policy a2a_message_log_participant_read on a2a_message_log for select using (
  exists (
    select 1 from a2a_handshakes h
    where h.id = handshake_id
      and (h.requester_user_id = auth.uid() or h.provider_user_id = auth.uid())
  )
);
create policy a2a_message_log_participant_insert on a2a_message_log for insert with check (
  exists (
    select 1 from a2a_handshakes h
    where h.id = handshake_id
      and (h.requester_user_id = auth.uid() or h.provider_user_id = auth.uid())
  )
);

-- 5. Triggers
drop trigger if exists set_a2a_agent_cards_updated_at on a2a_agent_cards;
create trigger set_a2a_agent_cards_updated_at before update on a2a_agent_cards for each row execute function set_updated_at();
