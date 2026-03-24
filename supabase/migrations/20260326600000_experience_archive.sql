-- =============================================================================
-- Echoes of Experience Archive: Persistent Mentor Ledger
-- =============================================================================

-- 1. Hard-won advice and verified experiences
create table if not exists public.experience_entries (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  tribe_id text,
  entry_type text not null,  -- 'moores_block_overcome' | 'launch_win' | 'career_pivot' | 'technical_breakthrough' | 'leadership_lesson' | 'failure_postmortem'
  title text not null,
  narrative text not null,
  hard_won_advice text,
  context_tags text[] default '{}',
  difficulty_level text default 'intermediate',  -- 'beginner' | 'intermediate' | 'advanced' | 'expert'
  verification_count integer default 0,
  verified_by_user_ids jsonb default '[]'::jsonb,
  upvote_count integer default 0,
  is_archived boolean default false,
  attestation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experience_entries_type_idx on experience_entries(entry_type);
create index if not exists experience_entries_author_idx on experience_entries(author_user_id);
create index if not exists experience_entries_tribe_idx on experience_entries(tribe_id);

-- 2. Tribal validation endorsements
create table if not exists public.experience_endorsements (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references experience_entries(id) on delete cascade,
  endorser_user_id uuid not null references auth.users(id) on delete cascade,
  endorsement_type text not null,  -- 'verified_witnessed' | 'valuable_advice' | 'applied_successfully'
  comment text,
  created_at timestamptz not null default now(),
  unique (experience_id, endorser_user_id)
);

-- 3. RLS policies
alter table experience_entries enable row level security;
create policy experience_entries_owner_rw on experience_entries for all using (author_user_id = auth.uid());
create policy experience_entries_authenticated_read on experience_entries for select using (
  is_archived = false and auth.uid() is not null
);

alter table experience_endorsements enable row level security;
create policy experience_endorsements_read on experience_endorsements for select using (auth.uid() is not null);
create policy experience_endorsements_owner_insert on experience_endorsements for insert with check (endorser_user_id = auth.uid());

-- 4. Triggers
drop trigger if exists set_experience_entries_updated_at on experience_entries;
create trigger set_experience_entries_updated_at before update on experience_entries for each row execute function set_updated_at();
