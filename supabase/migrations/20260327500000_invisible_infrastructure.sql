-- =============================================================================
-- Invisible Infrastructure: MolmoWeb Vision + WebAssembly Sandbox — Tools #156-160
-- =============================================================================

-- 1. wasm_artifacts — sandboxed WebAssembly binary states
create table if not exists public.wasm_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_name text not null,
  intent_description text,
  wasm_binary_hash text,
  source_tool_name text,
  sandbox_status text not null default 'provisioned', -- provisioned | running | completed | vaporized | failed
  isolation_level text not null default 'strict', -- strict | permissive | quarantine
  memory_limit_mb integer default 256,
  execution_time_ms integer,
  vanta_compliant boolean default false,
  sentry_tested boolean default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists wasm_artifacts_user_status_idx on wasm_artifacts(user_id, sandbox_status);

-- 2. visual_web_logs — Molmo agent browsing session snapshots
create table if not exists public.visual_web_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_name text,
  target_url text,
  navigation_steps jsonb default '[]'::jsonb,
  semantic_snapshots jsonb default '[]'::jsonb,
  elements_interacted integer default 0,
  model_used text default 'molmo-8b',
  hardware_node text,
  processing_time_ms integer,
  status text not null default 'active', -- active | completed | failed | archived
  created_at timestamptz not null default now()
);
create index if not exists visual_web_logs_user_status_idx on visual_web_logs(user_id, status);

-- 3. consultant_blueprints — tribal strategy agent library
create table if not exists public.consultant_blueprints (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  blueprint_name text not null,
  expertise_domain text not null,
  description text,
  skill_definition jsonb default '{}'::jsonb,
  hourly_rate_equivalent_usd numeric default 0,
  usage_count integer default 0,
  avg_rating numeric,
  tribal_verified boolean default false,
  status text not null default 'draft', -- draft | published | verified | deprecated
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists consultant_blueprints_domain_idx on consultant_blueprints(expertise_domain);
create index if not exists consultant_blueprints_status_idx on consultant_blueprints(status);

-- 4. observability_refund_ledger — data sanitization savings tracking
create table if not exists public.observability_refund_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_system text not null,
  original_data_volume_mb numeric,
  sanitized_data_volume_mb numeric,
  reduction_pct numeric,
  garbage_categories_pruned jsonb default '[]'::jsonb,
  vendor_cost_before_usd numeric,
  vendor_cost_after_usd numeric,
  monthly_savings_usd numeric,
  sanitization_rules_applied integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists observability_refund_ledger_user_source_idx on observability_refund_ledger(user_id, source_system);

-- 5. RLS
alter table wasm_artifacts enable row level security;
create policy wasm_artifacts_owner_rw on wasm_artifacts for all using (user_id = auth.uid());

alter table visual_web_logs enable row level security;
create policy visual_web_logs_owner_rw on visual_web_logs for all using (user_id = auth.uid());

alter table consultant_blueprints enable row level security;
create policy consultant_blueprints_creator_rw on consultant_blueprints for all using (creator_user_id = auth.uid());
create policy consultant_blueprints_read_published on consultant_blueprints for select using (auth.role() = 'authenticated' and status in ('published', 'verified'));

alter table observability_refund_ledger enable row level security;
create policy observability_refund_ledger_owner_rw on observability_refund_ledger for all using (user_id = auth.uid());

-- 6. Triggers
drop trigger if exists set_consultant_blueprints_updated_at on consultant_blueprints;
create trigger set_consultant_blueprints_updated_at before update on consultant_blueprints for each row execute function set_updated_at();
