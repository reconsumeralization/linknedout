-- RLS Hardening: Tribe tables, agentic_breeds, missing indexes, anonymous auth restrictions
-- Fixes: tribe_knowledge_base, tribe_signal_feed, tribe_sprints have RLS enabled but NO policies
-- Fixes: agentic_breeds has no RLS at all
-- Adds: anonymous user restrictive write policies on sensitive tables
-- Adds: missing indexes for performance

begin;

-- ===========================================================================
-- 1. TRIBE INTELLIGENCE TABLES — Add RLS + ownership policies
-- ===========================================================================

-- tribe_knowledge_base: contributed_by is the owner column
alter table if exists public.tribe_knowledge_base enable row level security;

create policy tribe_kb_read on public.tribe_knowledge_base
  for select to authenticated
  using (true);  -- all authenticated users can read tribal knowledge

create policy tribe_kb_write on public.tribe_knowledge_base
  for insert to authenticated
  with check (contributed_by = auth.uid()::text);

create policy tribe_kb_update on public.tribe_knowledge_base
  for update to authenticated
  using (contributed_by = auth.uid()::text)
  with check (contributed_by = auth.uid()::text);

create policy tribe_kb_delete on public.tribe_knowledge_base
  for delete to authenticated
  using (contributed_by = auth.uid()::text);

-- tribe_signal_feed: author_id is the owner column
alter table if exists public.tribe_signal_feed enable row level security;

create policy tribe_feed_read on public.tribe_signal_feed
  for select to authenticated
  using (true);  -- all authenticated users can read signals

create policy tribe_feed_write on public.tribe_signal_feed
  for insert to authenticated
  with check (author_id = auth.uid()::text);

create policy tribe_feed_update on public.tribe_signal_feed
  for update to authenticated
  using (author_id = auth.uid()::text)
  with check (author_id = auth.uid()::text);

create policy tribe_feed_delete on public.tribe_signal_feed
  for delete to authenticated
  using (author_id = auth.uid()::text);

-- tribe_sprints: tribe-scoped, any authenticated member can read;
-- write restricted to squad members (checked via squad_member_ids jsonb array)
alter table if exists public.tribe_sprints enable row level security;

create policy tribe_sprints_read on public.tribe_sprints
  for select to authenticated
  using (true);  -- all authenticated users can view sprints

create policy tribe_sprints_insert on public.tribe_sprints
  for insert to authenticated
  with check (true);  -- any authenticated user can create a sprint

create policy tribe_sprints_update on public.tribe_sprints
  for update to authenticated
  using (squad_member_ids ? auth.uid()::text);  -- only squad members can update

create policy tribe_sprints_delete on public.tribe_sprints
  for delete to authenticated
  using (squad_member_ids ? auth.uid()::text);

-- ===========================================================================
-- 2. AGENTIC BREEDS — Enable RLS + ownership policies
-- ===========================================================================

alter table if exists public.agentic_breeds enable row level security;

create policy breeds_read on public.agentic_breeds
  for select to authenticated
  using (true);  -- all authenticated users can view breeds

create policy breeds_write on public.agentic_breeds
  for insert to authenticated
  with check (created_by = auth.uid());

create policy breeds_update on public.agentic_breeds
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy breeds_delete on public.agentic_breeds
  for delete to authenticated
  using (created_by = auth.uid());

-- ===========================================================================
-- 3. MISSING INDEXES — Performance optimization
-- ===========================================================================

-- agentic_breeds: lookup by creator and parent agents
create index if not exists breeds_created_by_idx on public.agentic_breeds(created_by);
create index if not exists breeds_status_idx on public.agentic_breeds(status);
create index if not exists breeds_parents_idx on public.agentic_breeds(parent_agent_a, parent_agent_b);

-- tribe_sprints: lookup by status for active sprint queries
create index if not exists tribe_sprints_status_idx on public.tribe_sprints(status);

-- tribe_signal_feed: lookup by author
create index if not exists tribe_feed_author_idx on public.tribe_signal_feed(author_id);

-- tribe_knowledge_base: lookup by contributor
create index if not exists tribe_kb_contributor_idx on public.tribe_knowledge_base(contributed_by);

-- ===========================================================================
-- 4. ANONYMOUS AUTH — Restrictive write policies on sensitive tables
-- Per Supabase docs: use "as restrictive" to ensure anonymous users cannot write
-- even when other permissive policies would allow it
-- ===========================================================================

-- Profiles: anonymous users can read but NOT write
create policy anon_no_write_profiles on public.profiles
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

create policy anon_no_update_profiles on public.profiles
  as restrictive for update to authenticated
  using ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

create policy anon_no_delete_profiles on public.profiles
  as restrictive for delete to authenticated
  using ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Agent definitions: anonymous users cannot create/modify agents
create policy anon_no_write_agents on public.agent_definitions
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

create policy anon_no_update_agents on public.agent_definitions
  as restrictive for update to authenticated
  using ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Agent runs: anonymous users cannot trigger agent executions
create policy anon_no_write_runs on public.agent_runs
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Agent messages: anonymous users cannot publish messages
create policy anon_no_write_messages on public.agent_messages
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Tribes: anonymous users cannot create tribes
create policy anon_no_write_tribes on public.tribes
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

create policy anon_no_update_tribes on public.tribes
  as restrictive for update to authenticated
  using ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Projects: anonymous users cannot create projects
create policy anon_no_write_projects on public.projects
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Cognitive stakes: anonymous users cannot publish stakes
create policy anon_no_write_stakes on public.cognitive_stakes
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Governance delegations: anonymous users cannot delegate
create policy anon_no_write_delegations on public.governance_delegations
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

-- Marketplace listings: anonymous users cannot list
create policy anon_no_write_marketplace on public.marketplace_listings
  as restrictive for insert to authenticated
  with check ((select (auth.jwt()->>'is_anonymous')::boolean) is not true);

commit;
