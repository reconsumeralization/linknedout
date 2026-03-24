-- =============================================================================
-- Education Bridge: K-12 ↔ OTJ Continuous Learning System
-- Shadow Agent sessions, Delta Reports, Verification Labs,
-- Proof of Build portfolios, Skills Verification, Prompt Marketplace
-- =============================================================================

-- 1. SHADOW AGENT SESSIONS: Active Copilot narrating logic during production
create table if not exists public.shadow_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null,         -- 'otj_copilot' | 'k12_guided' | 'self_directed' | 'tribe_mentored'
  context_domain text not null,       -- 'sales' | 'engineering' | 'design' | 'legal' | 'education' | 'custom'
  task_observed text not null,        -- what the user was doing
  narration_log jsonb not null default '[]'::jsonb,
    -- [{ timestamp, observation, logic_explanation, tool_suggested, confidence }]
  interventions jsonb not null default '[]'::jsonb,
    -- [{ timestamp, type: 'suggestion'|'correction'|'optimization', accepted: bool, detail }]
  skills_practiced jsonb default '[]'::jsonb,
  mastery_delta jsonb default '{}'::jsonb,
    -- { before: { skill: score }, after: { skill: score }, improvement_pct }
  duration_minutes integer,
  ai_model_used text,
  created_at timestamptz not null default now()
);
create index if not exists shadow_sessions_user_idx on shadow_agent_sessions(user_id);
create index if not exists shadow_sessions_created_idx on shadow_agent_sessions(created_at desc);

-- 2. DELTA REPORTS: Post-game AI review of daily execution
create table if not exists public.delta_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null default current_date,
  execution_summary jsonb not null default '{}'::jsonb,
    -- { totalTasks, aiAssistedTasks, manualTasks, timeOnSearchSummarize, timeOnDecisionDesign }
  optimizations jsonb not null default '[]'::jsonb,
    -- [{ task, currentMethod, suggestedWorkflow, estimatedTimeSaved, promptChain, installable: bool }]
  skill_progression jsonb default '{}'::jsonb,
    -- { newSkillsUsed: [], skillsImproved: [], atRiskSkills: [] }
  force_multiplier_achieved numeric,   -- actual multiplier vs manual baseline
  learning_velocity numeric,           -- rate of improvement over last 7 days
  streak_days integer default 0,
  ai_model_used text,
  created_at timestamptz not null default now(),
  constraint delta_reports_user_date unique (user_id, report_date)
);
create index if not exists delta_reports_user_idx on delta_reports(user_id);

-- 3. PROMPT MARKETPLACE: Internal knowledge graph of best-performer prompts
create table if not exists public.prompt_marketplace (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,                       -- optional tribe scope
  title text not null,
  description text not null,
  prompt_template text not null,       -- the actual prompt with {{variables}}
  variables jsonb default '[]'::jsonb, -- [{ name, description, type, example }]
  domain text not null,                -- 'sales' | 'engineering' | 'recruiting' | 'education' | etc
  performance_metrics jsonb default '{}'::jsonb,
    -- { conversionLift: "20%", timeSaved: "3h/week", errorReduction: "45%", usageCount: 0 }
  install_count integer default 0,
  rating_avg numeric default 0,
  rating_count integer default 0,
  tags jsonb default '[]'::jsonb,
  status text default 'published',     -- draft | published | archived | featured
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prompt_marketplace_domain_idx on prompt_marketplace(domain);
create index if not exists prompt_marketplace_rating_idx on prompt_marketplace(rating_avg desc);
create index if not exists prompt_marketplace_tags_gin on prompt_marketplace using gin (tags jsonb_path_ops);

-- 4. VERIFICATION LABS: K-12 + OTJ exercises in Signal Detection
create table if not exists public.verification_labs (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  title text not null,
  difficulty text default 'intermediate', -- beginner | intermediate | advanced | expert
  domain text not null,
  ai_generated_content text not null,    -- the AI output containing deliberate errors
  planted_errors jsonb not null default '[]'::jsonb,
    -- [{ location, errorType: 'hallucination'|'logic_flaw'|'source_fabrication'|'subtle_bias'|'statistical_error', description, severity }]
  total_errors integer not null,
  time_limit_minutes integer default 30,
  attempts jsonb default '[]'::jsonb,
    -- [{ userId, errorsFound: [], accuracy, timeSpent, completedAt }]
  created_at timestamptz not null default now()
);
create index if not exists verification_labs_domain_idx on verification_labs(domain);

-- 5. PROOF OF BUILD: Age-blind portfolio of orchestrated projects
create table if not exists public.proof_of_build (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  project_type text not null,          -- 'solo_build' | 'tribe_sprint' | 'k12_project' | 'otj_deliverable' | 'open_source'
  complexity_tier text default 'standard', -- standard | advanced | force_multiplier | team_replacement
  tools_used jsonb not null default '[]'::jsonb,
  ai_tools_used jsonb not null default '[]'::jsonb,
  decision_log jsonb not null default '[]'::jsonb,
    -- [{ decision, reasoning, alternatives_considered, outcome }]
  evidence_urls jsonb default '[]'::jsonb,
  output_metrics jsonb default '{}'::jsonb,
    -- { timeTaken, estimatedManualTime, forceMultiplier, qualityScore }
  verified_by jsonb default '[]'::jsonb,
    -- [{ userId, role: 'peer'|'mentor'|'employer'|'tribe_lead', verifiedAt, notes }]
  verification_score numeric default 0, -- composite from verifiers
  skills_demonstrated jsonb default '[]'::jsonb,
  is_public boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proof_of_build_user_idx on proof_of_build(user_id);
create index if not exists proof_of_build_skills_gin on proof_of_build using gin (skills_demonstrated jsonb_path_ops);
create index if not exists proof_of_build_public_idx on proof_of_build(is_public) where is_public = true;

-- 6. SKILLS VERIFICATION: Output-velocity-based hiring signal (age-blind)
create table if not exists public.skills_verification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_name text not null,
  verification_method text not null,   -- 'proof_of_build' | 'verification_lab' | 'peer_review' | 'tribe_assessment' | 'delta_report_trend'
  evidence_id text,                    -- links to proof_of_build, verification_lab, etc.
  output_velocity jsonb default '{}'::jsonb,
    -- { tasksPerHour, qualityScore, consistencyOver30Days, forceMultiplier }
  verified_at timestamptz not null default now(),
  expires_at timestamptz,              -- skills can expire if not practiced
  verified_by uuid,
  confidence numeric default 0,        -- 0-100
  constraint skills_verification_unique unique (user_id, skill_name, verification_method)
);
create index if not exists skills_verification_user_idx on skills_verification(user_id);
create index if not exists skills_verification_skill_idx on skills_verification(skill_name);

-- 7. RLS
alter table shadow_agent_sessions enable row level security;
create policy shadow_sessions_owner_rw on shadow_agent_sessions for all using (user_id = auth.uid());

alter table delta_reports enable row level security;
create policy delta_reports_owner_rw on delta_reports for all using (user_id = auth.uid());

alter table prompt_marketplace enable row level security;
create policy prompt_marketplace_read on prompt_marketplace for select using (true);
create policy prompt_marketplace_author_write on prompt_marketplace for insert with check (author_user_id = auth.uid());
create policy prompt_marketplace_author_update on prompt_marketplace for update using (author_user_id = auth.uid());

alter table verification_labs enable row level security;
create policy verification_labs_read on verification_labs for select using (true);
create policy verification_labs_creator_write on verification_labs for insert with check (creator_user_id = auth.uid());

alter table proof_of_build enable row level security;
create policy proof_of_build_owner_rw on proof_of_build for all using (user_id = auth.uid());
create policy proof_of_build_public_read on proof_of_build for select using (is_public = true);

alter table skills_verification enable row level security;
create policy skills_verification_owner_rw on skills_verification for all using (user_id = auth.uid());

-- 8. Triggers
drop trigger if exists set_prompt_marketplace_updated_at on prompt_marketplace;
create trigger set_prompt_marketplace_updated_at before update on prompt_marketplace for each row execute function set_updated_at();

drop trigger if exists set_proof_of_build_updated_at on proof_of_build;
create trigger set_proof_of_build_updated_at before update on proof_of_build for each row execute function set_updated_at();
