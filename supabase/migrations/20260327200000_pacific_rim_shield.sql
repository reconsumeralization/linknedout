-- =============================================================================
-- Pacific Rim Shield: Agentic Immunity — Tools #140-145
-- =============================================================================

-- 1. TRAFFIC ENTROPY LEDGER: covert-channel & timing-attack detection
create table if not exists public.traffic_entropy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_ip text,
  port_distribution jsonb default '{}'::jsonb,
  timing_pattern jsonb default '{}'::jsonb,
  entropy_score numeric not null,
  is_anomalous boolean default false,
  anomaly_type text default 'normal',             -- covert_channel | coded_instructions | timing_attack | normal
  related_surprise_event_id uuid,
  analyzed_packets integer default 0,
  analysis_window_seconds integer default 300,
  created_at timestamptz not null default now()
);
create index if not exists traffic_entropy_ledger_user_anomalous_idx on traffic_entropy_ledger(user_id, is_anomalous);

-- 2. ADVERSARY STYLOMETRY: threat-actor linguistic fingerprints
create table if not exists public.adversary_stylometry (
  id uuid primary key default gen_random_uuid(),
  analyst_user_id uuid not null references auth.users(id) on delete cascade,
  profile_name text not null,
  stylometric_features jsonb not null default '{}'::jsonb,
  confidence_score numeric default 0,
  linked_narrative_ids jsonb default '[]'::jsonb,
  linked_ttp_ids jsonb default '[]'::jsonb,
  threat_actor_group text,
  status text default 'draft',                    -- draft | active | confirmed | archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists adversary_stylometry_group_idx on adversary_stylometry(threat_actor_group);
create index if not exists adversary_stylometry_status_idx on adversary_stylometry(status);

-- 3. DEVICE LIFECYCLE STATES: heartbeat tracking & zombie culling
create table if not exists public.device_lifecycle_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_type text not null,                      -- server | firewall | router | vehicle | smr | iot_sensor | one_charge | custom
  last_heartbeat_at timestamptz,
  heartbeat_source text,                          -- artifact_nfc | wearable | network_ping | manual
  consecutive_missed_days integer default 0,
  lifecycle_status text default 'active',         -- active | warning | zombie | culled | decommissioned
  cull_threshold_days integer default 30,
  auto_cull_enabled boolean default true,
  cull_executed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists device_lifecycle_states_status_idx on device_lifecycle_states(lifecycle_status);
create index if not exists device_lifecycle_states_user_type_idx on device_lifecycle_states(user_id, device_type);

-- 4. BIOMETRIC ENCRYPTION GATES: artifact-proximity data access
create table if not exists public.biometric_encryption_gates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_label text not null,
  data_classification text default 'sensitive',   -- public | internal | sensitive | critical | sovereign
  artifact_id uuid,
  encryption_method text default 'artifact_proximity', -- artifact_proximity | biometric_confirm | dual_key | sovereign_enclave
  last_access_at timestamptz,
  access_count integer default 0,
  breach_attempts integer default 0,
  status text default 'active',                   -- active | locked | revoked
  created_at timestamptz not null default now()
);
create index if not exists biometric_encryption_gates_user_class_idx on biometric_encryption_gates(user_id, data_classification);

-- 5. ROW LEVEL SECURITY

-- traffic_entropy_ledger: user owns
alter table traffic_entropy_ledger enable row level security;

create policy traffic_entropy_ledger_owner_all on traffic_entropy_ledger
  for all using (user_id = auth.uid());

-- adversary_stylometry: analyst owns; all authenticated read active/confirmed
alter table adversary_stylometry enable row level security;

create policy adversary_stylometry_owner_all on adversary_stylometry
  for all using (analyst_user_id = auth.uid());

create policy adversary_stylometry_read_active on adversary_stylometry
  for select using (status in ('active', 'confirmed'));

-- device_lifecycle_states: user owns
alter table device_lifecycle_states enable row level security;

create policy device_lifecycle_states_owner_all on device_lifecycle_states
  for all using (user_id = auth.uid());

-- biometric_encryption_gates: user owns
alter table biometric_encryption_gates enable row level security;

create policy biometric_encryption_gates_owner_all on biometric_encryption_gates
  for all using (user_id = auth.uid());
