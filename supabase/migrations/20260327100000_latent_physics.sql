-- =============================================================================
-- LeWorldModel: Latent Physics Engine — Tools #136-139
-- =============================================================================

-- 1. WORLD MODELS: trained LeWM instances
create table if not exists public.world_models (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  model_name text not null,
  environment_type text not null default 'custom',
  parameter_count integer default 15000000,
  latent_dim integer default 192,
  gaussian_prior jsonb default '{}'::jsonb,
  training_status text not null default 'untrained', -- untrained | collecting_data | training | evaluating | deployed | failed
  training_data_frames integer default 0,
  training_hours numeric default 0,
  hardware_used text,
  accuracy_pct numeric,
  surprise_threshold numeric default 0.85,
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists world_models_owner_env_idx on world_models(owner_user_id, environment_type);

-- 2. IMAGINARY SIMULATIONS: CEM rollout results
create table if not exists public.imaginary_simulations (
  id uuid primary key default gen_random_uuid(),
  world_model_id uuid not null references public.world_models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_description text not null,
  terminal_state jsonb,
  num_rollouts integer default 1000,
  best_trajectory_cost numeric,
  planning_time_ms integer,
  speedup_factor numeric,
  selected_action_sequence jsonb default '[]'::jsonb,
  status text not null default 'planned',            -- planned | simulating | complete | executed | abandoned
  created_at timestamptz not null default now()
);
create index if not exists imaginary_simulations_model_idx on imaginary_simulations(world_model_id);
create index if not exists imaginary_simulations_status_idx on imaginary_simulations(status);

-- 3. SURPRISE EVENTS: violation-of-expectation detections
create table if not exists public.surprise_events (
  id uuid primary key default gen_random_uuid(),
  world_model_id uuid not null references public.world_models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,                          -- object_teleport | color_change | physics_violation | trajectory_divergence | sensor_anomaly | deepfake_detected
  predicted_state jsonb,
  actual_state jsonb,
  surprise_delta numeric not null,
  severity text default 'medium',                    -- low | medium | high | critical
  auto_response text default 'logged',               -- logged | alert_sent | actuators_frozen | sentinel_triggered
  related_incident_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists surprise_events_model_time_idx on surprise_events(world_model_id, created_at desc);
create index if not exists surprise_events_severity_idx on surprise_events(severity);

-- 4. LATENT PROBES: extracted physical quantities
create table if not exists public.latent_probes (
  id uuid primary key default gen_random_uuid(),
  world_model_id uuid not null references public.world_models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  probe_type text not null,                          -- position | orientation | velocity | temperature | pressure | custom
  probe_label text,
  extracted_value jsonb not null default '{}'::jsonb,
  ground_truth_value jsonb,
  accuracy_pct numeric,
  created_at timestamptz not null default now()
);
create index if not exists latent_probes_model_type_idx on latent_probes(world_model_id, probe_type);

-- 5. ROW LEVEL SECURITY

-- world_models: owner owns
alter table world_models enable row level security;

create policy world_models_owner_all on world_models
  for all using (owner_user_id = auth.uid());

-- imaginary_simulations: user owns
alter table imaginary_simulations enable row level security;

create policy imaginary_simulations_owner_all on imaginary_simulations
  for all using (user_id = auth.uid());

-- surprise_events: user owns; all authenticated can read critical
alter table surprise_events enable row level security;

create policy surprise_events_owner_all on surprise_events
  for all using (user_id = auth.uid());

create policy surprise_events_read_critical on surprise_events
  for select using (severity = 'critical');

-- latent_probes: user owns
alter table latent_probes enable row level security;

create policy latent_probes_owner_all on latent_probes
  for all using (user_id = auth.uid());
