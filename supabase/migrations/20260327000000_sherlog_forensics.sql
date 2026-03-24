-- =============================================================================
-- Project SherLog: Forensic Intelligence Pipeline — Tools #132-135
-- =============================================================================

-- 1. MALWARE ARTIFACTS: mid-heist selfies and system logs
create table if not exists public.malware_artifacts (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null,              -- screenshot | process_log | browser_history | sysinfo | installer_binary
  storage_ref text,
  raw_data jsonb default '{}'::jsonb,
  file_hash_sha256 text,
  source_description text,
  classification text default 'unknown',    -- web_lure | file_lure | hybrid | unknown
  infection_status text default 'suspected', -- suspected | confirmed | benign | false_positive
  related_incident_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists malware_artifacts_reporter_idx on malware_artifacts(reporter_user_id);
create index if not exists malware_artifacts_class_status_idx on malware_artifacts(classification, infection_status);

-- 2. FORENSIC NARRATIVES: 2-layer LLM pipeline output
create table if not exists public.forensic_narratives (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.malware_artifacts(id) on delete cascade,
  analyst_user_id uuid not null references auth.users(id) on delete cascade,
  layer1_visual jsonb not null default '{}'::jsonb,
  layer2_vector jsonb not null default '{}'::jsonb,
  combined_narrative text,
  iocs_extracted jsonb default '[]'::jsonb,
  threat_actor_profile jsonb,
  time_to_analysis_seconds integer,
  status text default 'analyzing',          -- analyzing | complete | needs_review | disputed
  created_at timestamptz not null default now()
);
create index if not exists forensic_narratives_artifact_idx on forensic_narratives(artifact_id);
create index if not exists forensic_narratives_status_idx on forensic_narratives(status);

-- 3. TRIBAL HERD IMMUNITY: verified malicious IOC blacklist
create table if not exists public.tribal_herd_immunity (
  id uuid primary key default gen_random_uuid(),
  source_narrative_id uuid,
  ioc_type text not null,                   -- url | domain | ip | file_hash | ad_id | installer_name
  ioc_value text not null,
  threat_category text default 'infostealer', -- infostealer | ransomware | phishing | cryptominer | rat | custom
  severity text default 'high',             -- low | medium | high | critical
  reported_by_count integer default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean default true,
  tribal_propagation_count integer default 0,
  created_at timestamptz not null default now(),
  unique (ioc_type, ioc_value)
);
create index if not exists tribal_herd_immunity_ioc_idx on tribal_herd_immunity(ioc_type, ioc_value);
create index if not exists tribal_herd_immunity_active_sev_idx on tribal_herd_immunity(is_active, severity);

-- 4. SANDBOX DETONATIONS: lure detonation results
create table if not exists public.sandbox_detonations (
  id uuid primary key default gen_random_uuid(),
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  lure_url text not null,
  lure_type text default 'custom',          -- youtube_redirect | mega_download | google_ad | sponsored_link | direct_download | custom
  detonation_environment text default 'headless_browser',
  status text default 'queued',             -- queued | detonating | analyzing | complete | failed
  result_verdict text,                      -- clean | suspicious | malicious | inconclusive
  artifacts_collected jsonb default '[]'::jsonb,
  network_iocs jsonb default '[]'::jsonb,
  behavior_summary text,
  detonation_duration_seconds integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists sandbox_detonations_lure_url_idx on sandbox_detonations(lure_url);
create index if not exists sandbox_detonations_status_idx on sandbox_detonations(status);

-- 5. ROW LEVEL SECURITY

-- malware_artifacts: reporter owns all; all authenticated can read confirmed
alter table malware_artifacts enable row level security;

create policy malware_artifacts_owner_all on malware_artifacts
  for all using (reporter_user_id = auth.uid());

create policy malware_artifacts_read_confirmed on malware_artifacts
  for select using (infection_status = 'confirmed');

-- forensic_narratives: analyst owns; all authenticated read complete
alter table forensic_narratives enable row level security;

create policy forensic_narratives_owner_all on forensic_narratives
  for all using (analyst_user_id = auth.uid());

create policy forensic_narratives_read_complete on forensic_narratives
  for select using (status = 'complete');

-- tribal_herd_immunity: all authenticated can read; all authenticated can insert
alter table tribal_herd_immunity enable row level security;

create policy tribal_herd_immunity_read_all on tribal_herd_immunity
  for select using (auth.uid() is not null);

create policy tribal_herd_immunity_insert_all on tribal_herd_immunity
  for insert with check (auth.uid() is not null);

-- sandbox_detonations: submitter owns; all authenticated read complete
alter table sandbox_detonations enable row level security;

create policy sandbox_detonations_owner_all on sandbox_detonations
  for all using (submitted_by_user_id = auth.uid());

create policy sandbox_detonations_read_complete on sandbox_detonations
  for select using (status = 'complete');
