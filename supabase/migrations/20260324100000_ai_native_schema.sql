-- =============================================================================
-- AI-Native Schema Evolution: From File Cabinet to Brain
-- Adds: vector embeddings, agent workflow states, lineage tracking, JSONB indexes
-- =============================================================================

-- 1. Enable pgvector extension for semantic search / RAG
create extension if not exists vector;

-- 2. Vector Embeddings: Profile Intelligence Layer
-- Enables "Instant Recall on the Edge" — semantic search across all profiles
alter table profiles add column if not exists embedding vector(1536);
alter table profiles add column if not exists embedding_model text;
alter table profiles add column if not exists embedding_updated_at timestamptz;

create index if not exists profiles_embedding_idx
  on profiles using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 3. Vector Embeddings: Knowledge Base (Tribal RAG)
alter table tribe_knowledge_base add column if not exists embedding vector(1536);
alter table tribe_knowledge_base add column if not exists embedding_model text;

create index if not exists tribe_kb_embedding_idx
  on tribe_knowledge_base using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- 4. Agent Workflow States: Persistent Agentic Memory
-- Tracks where an AI agent is in a long-running workflow
create table if not exists public.agent_workflow_states (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workflow_type text not null,          -- 'onboarding_discovery' | 'tribe_formation' | 'skill_audit' | 'outreach_campaign'
  workflow_name text not null,
  status text not null default 'running', -- running | paused | completed | failed | cancelled
  current_step text not null,           -- current step identifier
  total_steps integer not null default 1,
  completed_steps integer not null default 0,

  -- Agent identity
  ai_agent_id text,                     -- which AI model/persona executed this
  ai_model_used text,                   -- 'gpt-4o' | 'claude-4.6' | etc.
  persona_id text,                      -- persona used for this workflow

  -- State persistence (the "brain")
  context jsonb not null default '{}'::jsonb,   -- accumulated context from all steps
  step_history jsonb not null default '[]'::jsonb, -- ordered array of step results
  pending_input jsonb,                  -- what the workflow is waiting for (user input, approval, etc.)

  -- Lineage & validation
  initiated_by text not null default 'user', -- 'user' | 'agent' | 'cron' | 'system'
  validated_by uuid,                    -- user who approved/validated the output
  validated_at timestamptz,
  validation_notes text,

  -- Lifecycle
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,

  -- Metadata
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_workflows_owner_idx on agent_workflow_states(owner_user_id);
create index if not exists agent_workflows_status_idx on agent_workflow_states(status);
create index if not exists agent_workflows_type_idx on agent_workflow_states(workflow_type);

-- 5. Lineage Tracking: Human ↔ AI Pair Audit
-- Extends mcp_tool_audit_events with explicit AI/Human tracking
alter table mcp_tool_audit_events add column if not exists ai_agent_id text;
alter table mcp_tool_audit_events add column if not exists ai_model_used text;
alter table mcp_tool_audit_events add column if not exists persona_id text;
alter table mcp_tool_audit_events add column if not exists validated_by uuid;
alter table mcp_tool_audit_events add column if not exists validated_at timestamptz;
alter table mcp_tool_audit_events add column if not exists workflow_id uuid;
alter table mcp_tool_audit_events add column if not exists lineage_chain jsonb default '[]'::jsonb;

-- 6. User Discovery Profiles: "Human Alpha" Identification
-- Stores the output of AI-driven onboarding discovery sessions
create table if not exists public.user_discovery_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Discovery outputs
  human_alpha jsonb not null default '{}'::jsonb,
    -- { "uniqueStrengths": [], "domainExpertise": [], "decisionLayerSkills": [], "craftOrientation": "" }
  suggested_workflows jsonb not null default '[]'::jsonb,
    -- [{ "name": "", "description": "", "tools": [], "estimatedTimeMultiplier": "" }]
  career_trajectory jsonb default '{}'::jsonb,
    -- { "currentLayer": "execution|decision|design", "targetLayer": "", "pivotRecommendations": [] }
  engagement_profile jsonb default '{}'::jsonb,
    -- { "passionSignals": [], "curiosityIndex": 0, "domainFit": "" }

  -- First workflow template (built during onboarding)
  first_workflow_id uuid,               -- references agent_workflow_states.id
  first_workflow_name text,

  -- AI that conducted the discovery
  discovery_agent_id text,
  discovery_model text,
  discovery_completed_at timestamptz,

  -- Metadata
  raw_inputs jsonb default '{}'::jsonb, -- original user inputs during discovery
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_discovery_profiles_unique unique (user_id)
);

-- 7. GIN Indexes on JSONB columns for fast containment queries
create index if not exists profiles_skills_gin on profiles using gin (skills jsonb_path_ops);
create index if not exists tribes_members_gin on tribes using gin (members jsonb_path_ops);
create index if not exists tribes_common_skills_gin on tribes using gin (common_skills jsonb_path_ops);
create index if not exists projects_tags_gin on projects using gin (tags jsonb_path_ops);
create index if not exists projects_milestones_gin on projects using gin (milestones jsonb_path_ops);
create index if not exists tribe_kb_tags_gin on tribe_knowledge_base using gin (tags jsonb_path_ops);
create index if not exists agent_workflows_context_gin on agent_workflow_states using gin (context jsonb_path_ops);
create index if not exists user_discovery_human_alpha_gin on user_discovery_profiles using gin (human_alpha jsonb_path_ops);

-- 8. Semantic search helper function
-- Usage: SELECT * FROM profiles ORDER BY embedding <=> query_embedding LIMIT 10;
-- The <=> operator uses cosine distance with the ivfflat index above.

-- 9. Triggers for updated_at
drop trigger if exists set_agent_workflows_updated_at on agent_workflow_states;
create trigger set_agent_workflows_updated_at
  before update on agent_workflow_states
  for each row execute function set_updated_at();

drop trigger if exists set_user_discovery_updated_at on user_discovery_profiles;
create trigger set_user_discovery_updated_at
  before update on user_discovery_profiles
  for each row execute function set_updated_at();

-- 10. RLS for new tables
alter table agent_workflow_states enable row level security;
create policy agent_workflows_owner_rw on agent_workflow_states
  for all using (owner_user_id = auth.uid());

alter table user_discovery_profiles enable row level security;
create policy user_discovery_owner_rw on user_discovery_profiles
  for all using (user_id = auth.uid());
