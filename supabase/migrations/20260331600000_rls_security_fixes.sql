-- =============================================================================
-- RLS Security Fixes — Close 2 policy bugs + add missing index
-- =============================================================================

begin;

-- Bug 1: whistleblower_submissions INSERT policy too permissive
-- Was: with check (true) — allows any user to insert rows with any user_id
-- Fix: enforce ownership or anonymous (user_id is null)
drop policy if exists whistleblower_insert on public.whistleblower_submissions;
create policy whistleblower_insert on public.whistleblower_submissions
  for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

-- Bug 2: regulatory_watch INSERT policy has `or true` bypass
-- Was: with check (auth.role() = 'service_role' or true) — always allows
-- Fix: service_role only
drop policy if exists reg_watch_write on public.regulatory_watch;
create policy reg_watch_service_write on public.regulatory_watch
  for all to service_role
  using (true)
  with check (true);

-- Missing index: whistleblower user_id for "my submissions" queries
create index if not exists whistleblower_user_idx on public.whistleblower_submissions(user_id);

commit;
