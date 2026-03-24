-- =============================================================================
-- Latency Buffer: Offline Sync & Conflict Resolution Engine
-- Queue, shadow state snapshots, and conflict logging for offline-first agents
-- =============================================================================

-- 1. LATENCY BUFFER QUEUE: Offline operation queue with priority and retry
create table if not exists public.latency_buffer_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_type text not null,        -- 'workflow_step' | 'vote' | 'trade_round' | 'attestation' | 'heartbeat' | 'marketplace_action'
  payload jsonb not null,
  target_table text,
  priority integer not null default 0,
  status text not null default 'queued', -- 'queued' | 'syncing' | 'synced' | 'conflict' | 'failed'
  created_offline_at timestamptz,
  synced_at timestamptz,
  conflict_resolution jsonb,
  retry_count integer not null default 0,
  max_retries integer not null default 5,
  created_at timestamptz not null default now()
);
create index if not exists buffer_queue_user_status_idx on latency_buffer_queue(user_id, status);
create index if not exists buffer_queue_status_priority_idx on latency_buffer_queue(status, priority desc);

-- 2. SHADOW STATE SNAPSHOTS: Local-first state cache per user
create table if not exists public.shadow_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_type text not null,            -- 'workflow' | 'governance' | 'trade' | 'token_balance'
  state_key text not null,
  snapshot_data jsonb,
  version integer not null default 1,
  is_stale boolean not null default false,
  source_updated_at timestamptz,
  snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, state_type, state_key)
);

-- 3. SYNC CONFLICT LOG: Record of conflicts and their resolutions
create table if not exists public.sync_conflict_log (
  id uuid primary key default gen_random_uuid(),
  buffer_queue_id uuid not null references latency_buffer_queue(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conflict_type text not null,         -- 'version_mismatch' | 'concurrent_edit' | 'state_divergence'
  local_state jsonb,
  remote_state jsonb,
  resolution text,                     -- 'local_wins' | 'remote_wins' | 'merged' | 'manual'
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. RLS POLICIES
alter table latency_buffer_queue enable row level security;
create policy buffer_queue_owner_rw on latency_buffer_queue for all using (user_id = auth.uid());

alter table shadow_state_snapshots enable row level security;
create policy shadow_state_owner_rw on shadow_state_snapshots for all using (user_id = auth.uid());

alter table sync_conflict_log enable row level security;
create policy sync_conflict_owner_rw on sync_conflict_log for all using (user_id = auth.uid());
