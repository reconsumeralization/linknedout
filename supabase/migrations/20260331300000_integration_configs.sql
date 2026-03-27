-- Integration Configs: stores user-specific integration settings and credentials
-- Env-var keys are stored here so users can configure integrations in-app

begin;

create table if not exists public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                    -- matches integration catalog id (e.g., 'supabase', 'openai')
  display_name text not null,                -- human-readable name
  category text not null,                    -- ai, storage, observability, etc.
  status text not null default 'disconnected', -- disconnected | connected | error | pending
  config jsonb not null default '{}'::jsonb, -- non-sensitive config (project IDs, regions, etc.)
  -- Sensitive keys stored encrypted; in prod use Supabase Vault
  encrypted_keys jsonb default '{}'::jsonb,  -- { "API_KEY": "enc:...", "SECRET": "enc:..." }
  oauth_token_ref text,                      -- reference to oauth token in secure storage
  scopes text[] default '{}',               -- granted OAuth scopes
  last_health_check timestamptz,
  health_status text default 'unknown',      -- healthy | degraded | down | unknown
  tool_count integer default 0,
  enabled boolean not null default true,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_configs_unique unique (user_id, provider)
);

create index if not exists integration_configs_user_idx on integration_configs(user_id);
create index if not exists integration_configs_provider_idx on integration_configs(provider);
create index if not exists integration_configs_category_idx on integration_configs(category);
create index if not exists integration_configs_status_idx on integration_configs(status);

-- RLS
alter table integration_configs enable row level security;

create policy integration_configs_owner_read on integration_configs
  for select to authenticated
  using (user_id = auth.uid());

create policy integration_configs_owner_insert on integration_configs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy integration_configs_owner_update on integration_configs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy integration_configs_owner_delete on integration_configs
  for delete to authenticated
  using (user_id = auth.uid());

-- Anonymous users cannot manage integrations
create policy anon_no_write_integrations on integration_configs
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Integration usage log — tracks tool calls per integration for billing/audit
create table if not exists public.integration_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  tool_name text not null,
  agent_id text,                             -- which agent used it
  status text not null default 'success',    -- success | error | rate_limited
  latency_ms integer,
  tokens_used integer,
  cost_usd numeric,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists usage_log_user_idx on integration_usage_log(user_id);
create index if not exists usage_log_provider_idx on integration_usage_log(provider);
create index if not exists usage_log_created_idx on integration_usage_log(created_at desc);

alter table integration_usage_log enable row level security;

create policy usage_log_owner on integration_usage_log
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Updated_at trigger
drop trigger if exists set_integration_configs_updated_at on integration_configs;
create trigger set_integration_configs_updated_at
  before update on integration_configs
  for each row execute function set_updated_at();

commit;
