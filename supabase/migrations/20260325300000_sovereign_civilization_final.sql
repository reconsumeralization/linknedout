-- =============================================================================
-- Sovereign Civilization Final: TEACHER Codex, Hard-Tech Awakening,
-- Xenobots / Biological Sovereignty, AI Moment Wave Tracker
-- =============================================================================

-- 1. TEACHER CLASSROOMS: AI Chief of Staff for educators
create table if not exists public.teacher_classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  classroom_name text not null,
  student_count integer default 0,
  ai_chief_of_staff_config jsonb default '{}'::jsonb,
    -- { model, autoGrading, pathOptimization, reportFrequency }
  learning_paths_active integer default 0,
  passion_domains_detected jsonb default '[]'::jsonb,
  cognitive_refund_hours numeric default 0,
  parental_bios_config jsonb default '{}'::jsonb,
    -- { ethicsLevel, contentFilters, communityOverrides, forbiddenTopics }
  edge_inference_enabled boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists teacher_user_idx on teacher_classrooms(teacher_user_id);

-- 2. TEACHER STUDENT PROFILES: Persistent memory palace per learner
create table if not exists public.teacher_student_profiles (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references teacher_classrooms(id) on delete cascade,
  student_alias text not null,
  human_alpha_identified text,
  passion_domain text,
  learning_style text,                   -- visual | auditory | kinesthetic | reading | multimodal
  memory_palace jsonb default '{}'::jsonb,
    -- { yearlySnapshots: [{ age, breakthroughs, struggles, styleShifts }] }
  proof_of_builds jsonb default '[]'::jsonb,
  trade_path text,                       -- agentic_orchestrator | hybrid_artisan | sovereign_entrepreneur | silicon_collar | bio_architect
  sovereignty_readiness numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_classroom_idx on teacher_student_profiles(classroom_id);

-- 3. HARD-TECH REGISTRY: Silicon Valley awakening milestones
create table if not exists public.hardtech_registry (
  id uuid primary key default gen_random_uuid(),
  tech_domain text not null,             -- lithography | quantum | photonics | xenobots
  milestone_name text not null,
  description text not null,
  impact_on_energy_tariff numeric default 0,
  impact_on_cognitive_yield numeric default 1,
  silicon_lineage jsonb default '{}'::jsonb,
    -- { fab, node_nm, chip_family, euv_generation }
  available_via text,                    -- lambda | qiskit | local_edge | photonic_dc
  announced_at date,
  created_at timestamptz not null default now()
);
create index if not exists hardtech_domain_idx on hardtech_registry(tech_domain);

-- 4. XENOBOT DEPLOYMENTS: Biological agent tracking
create table if not exists public.xenobot_deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_name text not null,
  target_environment text not null,
  deployment_type text not null,         -- environmental | medical | agricultural | research
  cell_count integer default 3000,
  self_destruct_timer_days integer default 7,
  status text default 'designing',       -- designing | culturing | deployed | active | self_destructed
  outcomes jsonb,
  bio_ethics_cleared boolean default false,
  tribal_blueprint_staked boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists xenobot_user_idx on xenobot_deployments(user_id);

-- 5. SOVEREIGN WAVE TRACKER: AI Moment timeline per user
create table if not exists public.sovereign_wave_tracker (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_wave integer default 2,        -- 1=Mirror, 2=Agentic, 3=Sovereign
  wave1_milestones jsonb default '{"chatUsed":true,"searchReplaced":false}'::jsonb,
  wave2_milestones jsonb default '{"agentDeployed":false,"mooresBlockSmashed":false,"tariffRefundClaimed":false,"durableWorkflowLaunched":false}'::jsonb,
  wave3_milestones jsonb default '{"edgeInferenceActive":false,"tribalMissionCompleted":false,"xenobotDeployed":false,"quantumOracleUsed":false,"sovereignArtifactOwned":false}'::jsonb,
  economic_refund_total_usd numeric default 0,
  cognitive_refund_hours numeric default 0,
  agency_score numeric default 0,
  sovereignty_percentage numeric default 0,
  updated_at timestamptz default now()
);

-- 6. RLS
alter table teacher_classrooms enable row level security;
create policy teacher_owner on teacher_classrooms for all using (teacher_user_id = auth.uid());

alter table teacher_student_profiles enable row level security;
create policy student_via_teacher on teacher_student_profiles for all
  using (classroom_id in (select id from teacher_classrooms where teacher_user_id = auth.uid()));

alter table xenobot_deployments enable row level security;
create policy xenobot_owner on xenobot_deployments for all using (user_id = auth.uid());

alter table sovereign_wave_tracker enable row level security;
create policy wave_owner on sovereign_wave_tracker for all using (user_id = auth.uid());
