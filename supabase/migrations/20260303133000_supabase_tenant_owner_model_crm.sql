-- Supabase tenant isolation follow-up:
-- Add explicit ownership columns and owner-scoped policies for legacy CRM tables.
--
-- Tables:
-- - public.tribes
-- - public.activity_log
-- - public.csv_uploads
-- - public.friend_locations

alter table public.tribes
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.activity_log
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.csv_uploads
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.friend_locations
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.tribes alter column owner_user_id set default auth.uid();
alter table public.activity_log alter column owner_user_id set default auth.uid();
alter table public.csv_uploads alter column owner_user_id set default auth.uid();
alter table public.friend_locations alter column owner_user_id set default auth.uid();

create index if not exists tribes_owner_updated_idx
  on public.tribes (owner_user_id, updated_at desc);

create index if not exists activity_log_owner_created_idx
  on public.activity_log (owner_user_id, created_at desc);

create index if not exists csv_uploads_owner_uploaded_idx
  on public.csv_uploads (owner_user_id, uploaded_at desc);

create index if not exists friend_locations_owner_seen_idx
  on public.friend_locations (owner_user_id, last_seen desc);

-- Backfill tribes.owner_user_id for rows where a single owner can be inferred.
with project_owner_candidates as (
  select
    t.id as tribe_id,
    p.owner_user_id
  from public.tribes t
  join public.projects p
    on p.owner_user_id is not null
   and (p.tribe = t.id or p.tribe = t.name)
),
project_owner_resolved as (
  select
    tribe_id,
    min(owner_user_id) as owner_user_id
  from project_owner_candidates
  group by tribe_id
  having count(distinct owner_user_id) = 1
)
update public.tribes t
set owner_user_id = r.owner_user_id
from project_owner_resolved r
where t.id = r.tribe_id
  and t.owner_user_id is null;

with member_owner_candidates as (
  select
    t.id as tribe_id,
    p.owner_user_id
  from public.tribes t
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(t.members, '[]'::jsonb)) = 'array'
        then coalesce(t.members, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as member_row
  join public.profiles p
    on p.owner_user_id is not null
   and p.id = coalesce(
     member_row ->> 'personId',
     member_row ->> 'person_id',
     member_row ->> 'id'
   )
),
member_owner_resolved as (
  select
    tribe_id,
    min(owner_user_id) as owner_user_id
  from member_owner_candidates
  group by tribe_id
  having count(distinct owner_user_id) = 1
)
update public.tribes t
set owner_user_id = r.owner_user_id
from member_owner_resolved r
where t.id = r.tribe_id
  and t.owner_user_id is null;

create or replace function public.set_owner_user_id_from_auth()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists set_tribes_owner_user_id on public.tribes;
create trigger set_tribes_owner_user_id
before insert on public.tribes
for each row execute function public.set_owner_user_id_from_auth();

drop trigger if exists set_activity_log_owner_user_id on public.activity_log;
create trigger set_activity_log_owner_user_id
before insert on public.activity_log
for each row execute function public.set_owner_user_id_from_auth();

drop trigger if exists set_csv_uploads_owner_user_id on public.csv_uploads;
create trigger set_csv_uploads_owner_user_id
before insert on public.csv_uploads
for each row execute function public.set_owner_user_id_from_auth();

drop trigger if exists set_friend_locations_owner_user_id on public.friend_locations;
create trigger set_friend_locations_owner_user_id
before insert on public.friend_locations
for each row execute function public.set_owner_user_id_from_auth();

do $$
begin
  drop policy if exists tribes_authenticated_read on public.tribes;
  drop policy if exists tribes_owner_rw on public.tribes;

  create policy tribes_owner_rw
    on public.tribes
    for all to authenticated
    using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());

  drop policy if exists activity_log_authenticated_read on public.activity_log;
  drop policy if exists activity_log_owner_read on public.activity_log;

  create policy activity_log_owner_read
    on public.activity_log
    for select to authenticated
    using (owner_user_id = auth.uid());

  drop policy if exists csv_uploads_authenticated_read on public.csv_uploads;
  drop policy if exists csv_uploads_authenticated_insert on public.csv_uploads;
  drop policy if exists csv_uploads_owner_read on public.csv_uploads;
  drop policy if exists csv_uploads_owner_insert on public.csv_uploads;

  create policy csv_uploads_owner_read
    on public.csv_uploads
    for select to authenticated
    using (owner_user_id = auth.uid());

  create policy csv_uploads_owner_insert
    on public.csv_uploads
    for insert to authenticated
    with check (owner_user_id = auth.uid());

  drop policy if exists friend_locations_authenticated_read on public.friend_locations;
  drop policy if exists friend_locations_owner_read on public.friend_locations;

  create policy friend_locations_owner_read
    on public.friend_locations
    for select to authenticated
    using (owner_user_id = auth.uid());
end $$;
