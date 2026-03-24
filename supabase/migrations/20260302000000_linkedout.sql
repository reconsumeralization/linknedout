-- linkedout_objectives: persisted custom scoring objectives per user
CREATE TABLE IF NOT EXISTS linkedout_objectives (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  label       text        NOT NULL,
  keywords    text[]      NOT NULL DEFAULT '{}',
  industries  text[]      NOT NULL DEFAULT '{}',
  skills      text[]      NOT NULL DEFAULT '{}',
  note_prefix text        NOT NULL DEFAULT '',
  is_active   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedout_objectives_user_id_idx
  ON linkedout_objectives(user_id);

-- linkedout_contact_states: persisted queue status per contact per objective
CREATE TABLE IF NOT EXISTS linkedout_contact_states (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text        NOT NULL,
  profile_id            text        NOT NULL,
  objective_id          text        NOT NULL,
  queue_status          text        NOT NULL CHECK (queue_status IN ('intro', 'nurture', 'curate', 'archived', 'whitelisted')),
  score                 integer,
  intent_fit            integer,
  relationship_strength integer,
  freshness             integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, profile_id, objective_id)
);

CREATE INDEX IF NOT EXISTS linkedout_contact_states_user_objective_idx
  ON linkedout_contact_states(user_id, objective_id);

-- linkedout_outreach_events: audit log for notes copied, profiles opened, intros generated
CREATE TABLE IF NOT EXISTS linkedout_outreach_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,
  profile_id   text        NOT NULL,
  event_type   text        NOT NULL CHECK (event_type IN ('note_copied', 'profile_opened', 'intro_generated', 'cull_exported')),
  objective_id text,
  payload      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedout_outreach_events_user_id_idx
  ON linkedout_outreach_events(user_id);
CREATE INDEX IF NOT EXISTS linkedout_outreach_events_profile_id_idx
  ON linkedout_outreach_events(user_id, profile_id);

-- linkedout_curation_actions: batch cull/whitelist/archive audit trail
CREATE TABLE IF NOT EXISTS linkedout_curation_actions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  profile_ids text[]      NOT NULL,
  action      text        NOT NULL CHECK (action IN ('cull', 'whitelist', 'archive', 'restore')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedout_curation_actions_user_id_idx
  ON linkedout_curation_actions(user_id);

-- Row Level Security
ALTER TABLE linkedout_objectives       ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedout_contact_states   ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedout_outreach_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedout_curation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own objectives"
  ON linkedout_objectives FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Users manage own contact states"
  ON linkedout_contact_states FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Users manage own outreach events"
  ON linkedout_outreach_events FOR ALL USING (auth.uid()::text = user_id);

CREATE POLICY "Users manage own curation actions"
  ON linkedout_curation_actions FOR ALL USING (auth.uid()::text = user_id);
