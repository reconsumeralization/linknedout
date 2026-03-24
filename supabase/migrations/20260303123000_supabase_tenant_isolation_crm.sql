-- Supabase tenant isolation hardening for legacy CRM / analytics tables.
--
-- Goals:
-- 1) Remove authenticated-wide read policies that are not tenant-isolated.
-- 2) Restrict project_positions reads to the owning project's user.
-- 3) Leave service-role / internal access paths unaffected (RLS bypass).
--
-- Tables in scope:
-- - public.tribes
-- - public.activity_log
-- - public.csv_uploads
-- - public.friend_locations
-- - public.project_positions

do $$
begin
  -- ─────────────────────────────────────────────────────────────────────────────
  -- 1) tribes: drop authenticated-wide read policy
  --    (owner-scoped read will be introduced once an owner column is available).
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tribes'
      and policyname = 'tribes_authenticated_read'
  ) then
    drop policy tribes_authenticated_read on public.tribes;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 2) activity_log: drop authenticated-wide read policy
  --    Activity log becomes internal/service-role only for now.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_log'
      and policyname = 'activity_log_authenticated_read'
  ) then
    drop policy activity_log_authenticated_read on public.activity_log;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 3) csv_uploads: drop authenticated-wide read policy
  --    Upload previews become internal/service-role only until owner-scoped
  --    columns + policies are introduced.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'csv_uploads'
      and policyname = 'csv_uploads_authenticated_read'
  ) then
    drop policy csv_uploads_authenticated_read on public.csv_uploads;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 4) friend_locations: drop authenticated-wide read policy
  --    Location data becomes internal/service-role only until a clear ownership
  --    model is defined.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'friend_locations'
      and policyname = 'friend_locations_authenticated_read'
  ) then
    drop policy friend_locations_authenticated_read on public.friend_locations;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────────
  -- 5) project_positions: replace authenticated-wide read with owner-scoped read
  --
  --    Previous policy:
  --      create policy project_positions_read_authenticated
  --        on public.project_positions
  --        for select to authenticated
  --        using (true);
  --
  --    New policy:
  --      - Only allow reads when the associated project is owned by auth.uid().
  --      - Mirrors the existing write policy, but for SELECT.
  -- ─────────────────────────────────────────────────────────────────────────────
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_positions'
      and policyname = 'project_positions_read_authenticated'
  ) then
    drop policy project_positions_read_authenticated on public.project_positions;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_positions'
      and policyname = 'project_positions_read_owner'
  ) then
    create policy project_positions_read_owner
      on public.project_positions
      for select to authenticated
      using (
        exists (
          select 1
          from public.projects p
          where p.id = project_id
            and p.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

