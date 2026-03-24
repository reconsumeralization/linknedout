-- =============================================================================
-- Economic Operating System: 5-Pillar Platform Success Layer
-- KPI tracking, Career Flight Simulator, Anti-Algorithm feed,
-- Velocity Scores, Sovereignty milestones
-- =============================================================================

-- 1. HIGH-AGENCY KPIs: Platform-wide and per-user success metrics
create table if not exists public.platform_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,

  -- Velocity of Value: time from join to first shipped project
  first_collaboration_hours numeric,      -- hours until first tribe/squad join
  first_project_shipped_hours numeric,    -- hours until first proof of build
  velocity_of_value_score numeric,        -- composite (lower = better)

  -- Skill-Pivot Rate: movement from execution to decision layer
  execution_layer_pct numeric default 100,  -- % time on execution tasks
  decision_layer_pct numeric default 0,     -- % time on decision/design
  pivot_velocity numeric default 0,         -- rate of improvement (delta per week)
  skill_pivot_achieved boolean default false,

  -- Tribe Multiplier: output boost from tribal membership
  solo_output_score numeric default 0,      -- pre-tribe output metric
  tribal_output_score numeric default 0,    -- post-tribe output metric
  tribe_multiplier numeric default 1.0,     -- tribal/solo ratio

  -- Trust & Engagement
  trust_score_current numeric default 0,
  signal_density_score numeric default 0,   -- ratio of implementations vs noise
  judgment_events_count integer default 0,
  streak_days integer default 0,

  -- Sovereignty Progress
  sovereignty_tier text default 'explorer', -- explorer | builder | operator | sovereign
  tools_mastered integer default 0,
  workflows_created integer default 0,
  prompts_published integer default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_kpis_user_period unique (user_id, period_start)
);
create index if not exists platform_kpis_user_idx on platform_kpis(user_id);

-- 2. CAREER FLIGHT SIMULATOR: Predictive obsolescence alerts
create table if not exists public.career_flight_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null,             -- 'obsolescence_warning' | 'opportunity_detected' | 'pivot_recommended' | 'skill_expiring'
  severity text not null default 'info', -- info | warning | critical
  title text not null,
  description text not null,
  affected_skills jsonb default '[]'::jsonb,
  automation_threat_pct numeric,         -- % of current workflow now automatable
  pivot_paths jsonb default '[]'::jsonb,
    -- [{ targetRole, requiredSkills, estimatedPivotWeeks, bridgeCourse, forceMultiplierGain }]
  market_signal jsonb default '{}'::jsonb,
    -- { source, trend, confidence, dataPoints }
  status text default 'active',          -- active | acknowledged | acting | resolved | dismissed
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists career_alerts_user_idx on career_flight_alerts(user_id);
create index if not exists career_alerts_status_idx on career_flight_alerts(status);

-- 3. ANTI-ALGORITHM FEED: Implementation-weighted content scoring
create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  content_type text not null,           -- 'implementation' | 'insight' | 'signal' | 'proof_of_build' | 'prompt_share' | 'verification_result'
  title text not null,
  body text not null,
  implementation_evidence jsonb,         -- { toolUsed, promptChain, timeSaved, errorRate, beforeAfter }
  ai_synthesis jsonb,                    -- { keyTakeaways: [], actionablePrompt: string }

  -- Anti-Algorithm scoring (no likes, only implementations)
  implementation_count integer default 0,  -- how many people installed/used this
  verification_count integer default 0,    -- how many verified the results
  fork_count integer default 0,            -- how many adapted it for their domain
  signal_score numeric default 0,          -- composite: implementations * 10 + verifications * 5 + forks * 8
  noise_penalty numeric default 0,         -- deduction for generic/unverified content

  tags jsonb default '[]'::jsonb,
  is_featured boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists feed_items_signal_idx on feed_items(signal_score desc);
create index if not exists feed_items_tribe_idx on feed_items(tribe_id);
create index if not exists feed_items_type_idx on feed_items(content_type);
create index if not exists feed_items_tags_gin on feed_items using gin (tags jsonb_path_ops);

-- 4. VELOCITY SCORES: API-verified output metrics
create table if not exists public.velocity_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_type text not null,       -- 'github' | 'linear' | 'figma' | 'vercel' | 'manual'
  metric_name text not null,            -- 'commits_per_week' | 'deployments' | 'designs_shipped' | 'tasks_completed'
  metric_value numeric not null,
  human_judgment_ratio numeric,          -- % of decisions made by human vs AI
  measurement_period_days integer default 30,
  verified_at timestamptz not null default now(),
  raw_data jsonb default '{}'::jsonb,
  constraint velocity_scores_unique unique (user_id, integration_type, metric_name)
);
create index if not exists velocity_scores_user_idx on velocity_scores(user_id);

-- 5. RLS
alter table platform_kpis enable row level security;
create policy platform_kpis_owner_rw on platform_kpis for all using (user_id = auth.uid());

alter table career_flight_alerts enable row level security;
create policy career_alerts_owner_rw on career_flight_alerts for all using (user_id = auth.uid());

alter table feed_items enable row level security;
create policy feed_items_read on feed_items for select using (true);
create policy feed_items_author_write on feed_items for insert with check (author_user_id = auth.uid());

alter table velocity_scores enable row level security;
create policy velocity_scores_owner_rw on velocity_scores for all using (user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_platform_kpis_updated_at on platform_kpis;
create trigger set_platform_kpis_updated_at before update on platform_kpis for each row execute function set_updated_at();
