-- Agent messaging and event subscription system for inter-agent communication

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  from_agent_id text not null,
  to_agent_id text,
  topic text not null,
  payload jsonb not null default '{}',
  priority text not null default 'normal',
  status text not null default 'pending',
  correlation_id text,
  reply_to_message_id uuid references public.agent_messages(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  user_id uuid not null references auth.users(id) on delete cascade,
  check (priority in ('low', 'normal', 'high', 'critical')),
  check (status in ('pending', 'delivered', 'acknowledged', 'failed', 'expired'))
);

create table if not exists public.agent_event_subscriptions (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  topic text not null,
  filter jsonb,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade
);

-- Enable RLS on both tables
alter table public.agent_messages enable row level security;
alter table public.agent_event_subscriptions enable row level security;

-- RLS Policies
do $$
begin
  -- agent_messages SELECT policy
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_messages' and policyname = 'agent_messages_user_select'
  ) then
    create policy agent_messages_user_select
      on public.agent_messages
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  -- agent_messages INSERT policy
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_messages' and policyname = 'agent_messages_user_insert'
  ) then
    create policy agent_messages_user_insert
      on public.agent_messages
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;

  -- agent_messages UPDATE policy
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_messages' and policyname = 'agent_messages_user_update'
  ) then
    create policy agent_messages_user_update
      on public.agent_messages
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  -- agent_event_subscriptions SELECT policy
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_event_subscriptions' and policyname = 'agent_event_subscriptions_user_select'
  ) then
    create policy agent_event_subscriptions_user_select
      on public.agent_event_subscriptions
      for select to authenticated
      using (user_id = auth.uid());
  end if;

  -- agent_event_subscriptions INSERT policy
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_event_subscriptions' and policyname = 'agent_event_subscriptions_user_insert'
  ) then
    create policy agent_event_subscriptions_user_insert
      on public.agent_event_subscriptions
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;

  -- agent_event_subscriptions UPDATE policy
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_event_subscriptions' and policyname = 'agent_event_subscriptions_user_update'
  ) then
    create policy agent_event_subscriptions_user_update
      on public.agent_event_subscriptions
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  -- agent_event_subscriptions DELETE policy (for unsubscribe)
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_event_subscriptions' and policyname = 'agent_event_subscriptions_user_delete'
  ) then
    create policy agent_event_subscriptions_user_delete
      on public.agent_event_subscriptions
      for delete to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Indexes for agent_messages
create index if not exists agent_messages_user_to_agent_status_idx on public.agent_messages (user_id, to_agent_id, status);
create index if not exists agent_messages_user_topic_idx on public.agent_messages (user_id, topic);
create index if not exists agent_messages_correlation_id_idx on public.agent_messages (correlation_id) where correlation_id is not null;
create index if not exists agent_messages_expires_at_idx on public.agent_messages (expires_at) where expires_at is not null;

-- Indexes for agent_event_subscriptions
create index if not exists agent_event_subscriptions_user_agent_idx on public.agent_event_subscriptions (user_id, agent_id);
create index if not exists agent_event_subscriptions_user_topic_idx on public.agent_event_subscriptions (user_id, topic);
create unique index if not exists agent_event_subscriptions_agent_topic_user_unique_idx on public.agent_event_subscriptions (agent_id, topic, user_id);
