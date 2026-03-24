-- =============================================================================
-- Authenticity Oracle: Anti-Deepfake Content Provenance System
-- Attestations, challenges, and biological heartbeat verification
-- =============================================================================

-- 1. AUTHENTICITY ATTESTATIONS: Proof-of-human content provenance
create table if not exists public.authenticity_attestations (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null,          -- 'text' | 'image' | 'video' | 'audio' | 'data' | 'code'
  content_hash text not null,
  artifact_signature text,
  biological_signal jsonb,             -- { source, signal_hash, verified_at }
  c2pa_manifest_id text,
  attestation_method text not null,    -- 'artifact_nfc' | 'wearable_confirmed' | 'manual_oath' | 'ai_verified'
  trust_chain jsonb not null default '[]'::jsonb,
  verification_count integer not null default 0,
  dispute_count integer not null default 0,
  status text not null default 'pending', -- 'pending' | 'verified' | 'disputed' | 'revoked'
  created_at timestamptz not null default now()
);
create index if not exists attestations_content_hash_idx on authenticity_attestations(content_hash);
create index if not exists attestations_creator_idx on authenticity_attestations(creator_user_id);
create index if not exists attestations_status_idx on authenticity_attestations(status);

-- 2. AUTHENTICITY CHALLENGES: Dispute mechanism for suspicious content
create table if not exists public.authenticity_challenges (
  id uuid primary key default gen_random_uuid(),
  attestation_id uuid not null references authenticity_attestations(id) on delete cascade,
  challenger_user_id uuid not null references auth.users(id) on delete cascade,
  challenge_type text not null,        -- 'deepfake_suspected' | 'provenance_mismatch' | 'signature_invalid' | 'plagiarism'
  evidence text,
  status text not null default 'open', -- 'open' | 'investigating' | 'upheld' | 'dismissed'
  cco_agent_analysis jsonb,            -- AI agent investigation results
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. BIOLOGICAL HEARTBEAT LOG: Continuous proof-of-human signals
create table if not exists public.biological_heartbeat_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_source text not null,         -- 'artifact_nfc' | 'wearable' | 'app_activity' | 'manual_checkin'
  signal_hash text,
  device_id uuid,
  is_valid boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists heartbeat_user_created_idx on biological_heartbeat_log(user_id, created_at desc);

-- 4. RLS POLICIES
alter table authenticity_attestations enable row level security;
create policy attestations_owner_rw on authenticity_attestations for all using (creator_user_id = auth.uid());
create policy attestations_authenticated_read on authenticity_attestations for select using (true);

alter table authenticity_challenges enable row level security;
create policy challenges_owner_rw on authenticity_challenges for all using (challenger_user_id = auth.uid());
create policy challenges_attestation_creator_read on authenticity_challenges for select
  using (
    attestation_id in (
      select id from authenticity_attestations where creator_user_id = auth.uid()
    )
  );

alter table biological_heartbeat_log enable row level security;
create policy heartbeat_owner_rw on biological_heartbeat_log for all using (user_id = auth.uid());
