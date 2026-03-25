-- Blockade Bypass: Vendor Openness Audit & Sovereign MCP Infrastructure
-- Tools #165-168

-- Vendor openness audit
create table if not exists public.vendor_openness_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  vendor_name text not null,
  product_name text not null,
  api_availability text not null default 'none' check (api_availability in ('full','partial','read_only','none','deprecated')),
  mcp_support boolean default false,
  rate_limit_hits_monthly integer default 0,
  monthly_cost_usd numeric default 0,
  friction_score numeric default 0,
  lock_in_tariff_usd numeric default 0,
  bypass_method text check (bypass_method in ('api','visual','mcp_local','hybrid','none')),
  bypass_success_rate numeric default 0,
  last_audit_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.vendor_openness_audit enable row level security;
create policy "Users manage own vendor audits" on public.vendor_openness_audit for all using (user_id = auth.uid());
create index idx_vendor_friction on public.vendor_openness_audit(friction_score desc);

-- Sovereign MCP node registry
create table if not exists public.sovereign_mcp_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  node_name text not null,
  hardware_type text not null default 'cloud' check (hardware_type in ('one_charge','lambda','cloud','edge','sovereign_stone','custom')),
  endpoint_url text,
  connected_apps jsonb default '[]',
  uptime_pct numeric default 100,
  requests_served integer default 0,
  last_health_check_at timestamptz,
  status text not null default 'provisioning' check (status in ('provisioning','online','degraded','offline','decommissioned')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sovereign_mcp_nodes enable row level security;
create policy "Users manage own MCP nodes" on public.sovereign_mcp_nodes for all using (user_id = auth.uid());
create index idx_mcp_status on public.sovereign_mcp_nodes(status);

-- Visual bypass registry
create table if not exists public.visual_bypass_registry (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid references auth.users(id) on delete cascade,
  target_app text not null,
  target_workflow text not null,
  interaction_blueprint jsonb not null default '[]',
  steps_count integer default 0,
  success_rate numeric default 0,
  avg_execution_time_ms integer default 0,
  model_used text default 'molmo-8b',
  tribal_shared boolean default false,
  usage_count integer default 0,
  status text not null default 'draft' check (status in ('draft','tested','verified','deprecated')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.visual_bypass_registry enable row level security;
create policy "Users manage own visual bypasses" on public.visual_bypass_registry for all using (creator_user_id = auth.uid());
create policy "Authenticated read shared bypasses" on public.visual_bypass_registry for select using (tribal_shared = true and auth.role() = 'authenticated');
create index idx_visual_bypass_app on public.visual_bypass_registry(target_app);

-- Agentic intent certificates
create table if not exists public.agentic_intent_certs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  agent_name text not null,
  intent_description text not null,
  biometric_pulse_hash text,
  artifact_id text,
  certification_level text not null default 'standard' check (certification_level in ('standard','verified','sovereign','tribal_broadcast')),
  is_certified boolean default false,
  outgoing_target text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

alter table public.agentic_intent_certs enable row level security;
create policy "Users manage own intent certs" on public.agentic_intent_certs for all using (user_id = auth.uid());
create index idx_intent_cert_level on public.agentic_intent_certs(certification_level);
