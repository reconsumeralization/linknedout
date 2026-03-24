-- =============================================================================
-- Operating System for Agents: 6 Prime Directives
-- Trust Score, Sprint Loop, Content Multiplier, Knowledge GPU,
-- Skill Futures, Sovereignty Infrastructure
-- =============================================================================

-- 1. TRUST SCORE: Verified Log of Judgment (Proof of Human-in-the-Loop)
-- Every decision a user makes (validate, reject, direct) is logged as a
-- "judgment event" that builds their trust score over time.
create table if not exists public.judgment_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,         -- 'tool_validation' | 'output_review' | 'tribe_decision' | 'sprint_review' | 'signal_validation' | 'workflow_direction'
  context_type text not null,       -- 'profile' | 'tribe' | 'project' | 'content' | 'workflow' | 'signal'
  context_id text,                  -- ID of the entity being judged
  judgment text not null,           -- 'approved' | 'rejected' | 'modified' | 'escalated' | 'directed'
  ai_output_hash text,              -- hash of the AI output being judged (proves what was reviewed)
  ai_model_used text,               -- which model produced the output
  modification_summary text,        -- what the human changed (if modified)
  confidence_score numeric,         -- user's self-reported confidence (0-100)
  time_spent_seconds integer,       -- time between AI output and human judgment
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists judgment_ledger_user_idx on judgment_ledger(user_id);
create index if not exists judgment_ledger_type_idx on judgment_ledger(event_type);
create index if not exists judgment_ledger_created_idx on judgment_ledger(created_at desc);

-- Trust score materialized per user (updated by triggers or cron)
create table if not exists public.trust_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_judgments integer not null default 0,
  approval_rate numeric not null default 0,
  modification_rate numeric not null default 0,
  rejection_rate numeric not null default 0,
  avg_response_time_seconds numeric default 0,
  decision_layer_score numeric not null default 0,  -- 0-100, weighted composite
  judgment_streak integer default 0,                -- consecutive days with judgments
  domains_judged jsonb default '[]'::jsonb,         -- unique context_types
  last_judgment_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 2. AGENTIC SPRINT-LOOP: Linear-style task manager with AI-first assignment
-- Tasks are assigned to AI agents first. If agent fails, escalates to human.
create table if not exists public.sprint_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  sprint_id text,                   -- optional: links to tribe_sprints
  project_id text,                  -- optional: links to projects
  title text not null,
  description text,
  status text not null default 'backlog', -- backlog | ai_assigned | ai_in_progress | ai_completed | human_review | human_in_progress | done | failed
  priority text default 'medium',   -- low | medium | high | critical
  assigned_to text default 'ai',    -- 'ai' | user_id
  ai_agent_id text,                 -- which AI agent is working on it
  ai_model_used text,
  ai_attempt_count integer default 0,
  ai_output jsonb,                  -- the AI's work product
  ai_confidence numeric,            -- AI's self-reported confidence (0-100)
  human_feedback text,              -- human's review notes
  escalation_reason text,           -- why AI couldn't complete
  estimated_minutes integer,
  actual_minutes integer,
  force_multiplier numeric,         -- actual time saved vs manual estimate
  tags jsonb default '[]'::jsonb,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sprint_tasks_owner_idx on sprint_tasks(owner_user_id);
create index if not exists sprint_tasks_status_idx on sprint_tasks(status);
create index if not exists sprint_tasks_sprint_idx on sprint_tasks(sprint_id);

-- 3. CONTENT MULTIPLIER: One insight → multi-format pipeline
create table if not exists public.content_amplifications (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,        -- 'insight' | 'signal' | 'knowledge_entry' | 'project_update'
  source_id text,                   -- ID of source content
  source_text text not null,        -- the original insight text
  outputs jsonb not null default '[]'::jsonb,
    -- [{ format: 'linkedin_post' | 'thread' | 'podcast_script' | 'design_brief' | 'newsletter',
    --    content: string, generated_by: string, status: 'draft'|'approved'|'published', published_at?: string }]
  distribution_channels jsonb default '[]'::jsonb,
    -- [{ channel: 'linkedin' | 'tribal_feed' | 'email' | 'podcast', status: 'pending'|'sent', sent_at?: string }]
  amplification_score numeric default 0, -- reach × engagement estimate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_amp_owner_idx on content_amplifications(owner_user_id);

-- 4. PERSONAL KNOWLEDGE GPU: Private vector space per user
-- Already have user-scoped llm_workspaces + llm_documents with vector support.
-- Add vector columns to existing documents table for semantic retrieval.
alter table llm_documents add column if not exists embedding vector(1536);
alter table llm_documents add column if not exists embedding_model text;
alter table llm_documents add column if not exists embedding_updated_at timestamptz;

create index if not exists llm_documents_embedding_idx
  on llm_documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 5. SKILL-FUTURES: Project betting and judgment marketplace
create table if not exists public.skill_futures (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,                    -- optional tribe scope
  prediction_type text not null,    -- 'project_success' | 'tool_adoption' | 'skill_demand' | 'member_growth'
  title text not null,
  description text,
  resolution_criteria text not null, -- how the outcome will be measured
  resolution_date timestamptz not null,
  status text default 'open',       -- open | locked | resolved_yes | resolved_no | cancelled
  stakes jsonb default '[]'::jsonb, -- [{ user_id, position: 'yes'|'no', confidence: 0-100, staked_at }]
  resolution_evidence text,         -- what proved the outcome
  resolved_by uuid,                 -- who resolved it
  resolved_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists skill_futures_status_idx on skill_futures(status);
create index if not exists skill_futures_tribe_idx on skill_futures(tribe_id);

-- 6. SOVEREIGNTY INFRASTRUCTURE: Auto-compliance tracking
-- Lightweight compliance/entity tracking for sovereign artisans
create table if not exists public.sovereignty_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entity_type text,                 -- 'sole_proprietor' | 'llc' | 'corp' | 'freelancer' | 'not_set'
  entity_name text,
  jurisdiction text,                -- state/country
  tax_classification text,
  compliance_checklist jsonb default '[]'::jsonb,
    -- [{ item: string, status: 'done'|'pending'|'overdue', due_date?: string, completed_at?: string }]
  auto_compliance_enabled boolean default false,
  tools_budget_monthly numeric,     -- shared agentic infrastructure budget
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. RLS for all new tables
alter table judgment_ledger enable row level security;
create policy judgment_ledger_owner_rw on judgment_ledger for all using (user_id = auth.uid());

alter table trust_scores enable row level security;
create policy trust_scores_owner_read on trust_scores for select using (user_id = auth.uid());

alter table sprint_tasks enable row level security;
create policy sprint_tasks_owner_rw on sprint_tasks for all using (owner_user_id = auth.uid());

alter table content_amplifications enable row level security;
create policy content_amp_owner_rw on content_amplifications for all using (owner_user_id = auth.uid());

alter table skill_futures enable row level security;
create policy skill_futures_read on skill_futures for select using (true);
create policy skill_futures_create on skill_futures for insert with check (creator_user_id = auth.uid());

alter table sovereignty_profile enable row level security;
create policy sovereignty_owner_rw on sovereignty_profile for all using (user_id = auth.uid());

-- 8. Triggers
drop trigger if exists set_sprint_tasks_updated_at on sprint_tasks;
create trigger set_sprint_tasks_updated_at before update on sprint_tasks for each row execute function set_updated_at();

drop trigger if exists set_content_amp_updated_at on content_amplifications;
create trigger set_content_amp_updated_at before update on content_amplifications for each row execute function set_updated_at();

drop trigger if exists set_sovereignty_updated_at on sovereignty_profile;
create trigger set_sovereignty_updated_at before update on sovereignty_profile for each row execute function set_updated_at();
