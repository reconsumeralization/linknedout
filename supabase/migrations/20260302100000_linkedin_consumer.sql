-- LinkedIn Consumer Solutions (Sign In + Share) identity and audit tables.
-- See lib/linkedin-identity-server.ts and app/api/linkedin/share/route.ts.
--
-- This migration sets up the core LinkedIn OAuth integration tables with:
--   - linkedin_identities: stores OAuth tokens and profile data per user
--   - linkedin_share_audit: immutable audit log for content sharing
--   - linkedin_oauth_states: CSRF protection for OAuth flow
--   - linkedin_rate_limits: per-user rate limiting for API calls
--   - linkedin_connection_events: tracks connection lifecycle events
--   - linkedin_token_refresh_log: audit trail for token refresh operations

-- linkedin_identities: one row per user, populated after OAuth callback when user is signed in.
CREATE TABLE IF NOT EXISTS linkedin_identities (
  user_id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject     text        NOT NULL UNIQUE,
  display_name         text,
  picture_url          text,
  email                text,
  email_verified       boolean     DEFAULT false,
  locale               text,
  vanity_name          text,
  headline             text,
  industry             text,
  location_name        text,
  profile_url          text,
  access_token         text        NOT NULL,
  refresh_token        text,
  token_type           text        DEFAULT 'Bearer',
  expires_at           timestamptz NOT NULL,
  refresh_expires_at   timestamptz,
  scopes               text[],
  granted_scopes       text[],
  last_introspect_at   timestamptz,
  introspect_active    boolean,
  last_token_refresh   timestamptz,
  token_refresh_count  int         DEFAULT 0,
  consecutive_refresh_failures int DEFAULT 0,
  connection_status    text        DEFAULT 'active' CHECK (connection_status IN ('active', 'expired', 'revoked', 'error', 'pending_reauth')),
  last_error           text,
  last_error_at        timestamptz,
  last_error_code      text,
  last_successful_api_call timestamptz,
  total_api_calls      bigint      DEFAULT 0,
  total_shares         bigint      DEFAULT 0,
  metadata             jsonb       DEFAULT '{}'::jsonb,
  feature_flags        jsonb       DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS linkedin_identities_linkedin_subject_idx 
  ON linkedin_identities(linkedin_subject);
CREATE INDEX IF NOT EXISTS linkedin_identities_expires_at_idx 
  ON linkedin_identities(expires_at) WHERE connection_status = 'active';
CREATE INDEX IF NOT EXISTS linkedin_identities_connection_status_idx 
  ON linkedin_identities(connection_status);
CREATE INDEX IF NOT EXISTS linkedin_identities_refresh_expires_at_idx 
  ON linkedin_identities(refresh_expires_at) WHERE refresh_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_identities_email_idx 
  ON linkedin_identities(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_identities_pending_reauth_idx 
  ON linkedin_identities(user_id) WHERE connection_status = 'pending_reauth';

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_linkedin_identities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS linkedin_identities_updated_at_trigger ON linkedin_identities;
CREATE TRIGGER linkedin_identities_updated_at_trigger
  BEFORE UPDATE ON linkedin_identities
  FOR EACH ROW
  EXECUTE FUNCTION update_linkedin_identities_updated_at();

-- RLS: service role used in callback; anon can read own row via GET /api/linkedin/identity (server uses service role for read).
ALTER TABLE linkedin_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own LinkedIn identity"
  ON linkedin_identities FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages LinkedIn identities"
  ON linkedin_identities FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_oauth_states: CSRF protection for OAuth flow
CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
  state                text        PRIMARY KEY,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri         text        NOT NULL,
  scopes_requested     text[],
  code_verifier        text,
  nonce                text,
  ip_address           inet,
  user_agent           text,
  origin_page          text,
  flow_type            text        DEFAULT 'signin' CHECK (flow_type IN ('signin', 'reauth', 'scope_upgrade', 'link_account')),
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at          timestamptz,
  error_code           text,
  error_description    text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_oauth_states_expires_at_idx 
  ON linkedin_oauth_states(expires_at) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS linkedin_oauth_states_user_id_idx 
  ON linkedin_oauth_states(user_id);
CREATE INDEX IF NOT EXISTS linkedin_oauth_states_created_at_idx 
  ON linkedin_oauth_states(created_at DESC);

ALTER TABLE linkedin_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages OAuth states"
  ON linkedin_oauth_states FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_share_audit: immutable log of share requests and responses.
CREATE TABLE IF NOT EXISTS linkedin_share_audit (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject       text        NOT NULL,
  share_type             text        NOT NULL DEFAULT 'text' CHECK (share_type IN ('text', 'article', 'image', 'video', 'document', 'carousel')),
  visibility             text        DEFAULT 'connections' CHECK (visibility IN ('public', 'connections', 'logged_in')),
  request_text           text        NOT NULL,
  request_media_url      text,
  request_media_urls     text[],
  request_link_url       text,
  request_title          text,
  request_description    text,
  request_hash           text,
  request_size_bytes     int,
  response_status        int         NOT NULL,
  response_ugc_post_id   text,
  response_share_id      text,
  response_activity_urn  text,
  response_error_code    text,
  response_error_message text,
  response_rate_limit_remaining int,
  response_rate_limit_reset timestamptz,
  latency_ms             int,
  client_ip              inet,
  user_agent             text,
  idempotency_key        text        UNIQUE,
  retry_count            int         DEFAULT 0,
  parent_share_id        uuid        REFERENCES linkedin_share_audit(id),
  is_reshare             boolean     DEFAULT false,
  scheduled_at           timestamptz,
  published_at           timestamptz,
  metadata               jsonb       DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_share_audit_user_id_idx 
  ON linkedin_share_audit(user_id);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_created_at_idx 
  ON linkedin_share_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_linkedin_subject_idx 
  ON linkedin_share_audit(linkedin_subject);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_response_status_idx 
  ON linkedin_share_audit(response_status) WHERE response_status >= 400;
CREATE INDEX IF NOT EXISTS linkedin_share_audit_idempotency_key_idx 
  ON linkedin_share_audit(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_share_audit_user_created_idx 
  ON linkedin_share_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_share_audit_ugc_post_id_idx 
  ON linkedin_share_audit(response_ugc_post_id) WHERE response_ugc_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS linkedin_share_audit_scheduled_idx 
  ON linkedin_share_audit(scheduled_at) WHERE scheduled_at IS NOT NULL AND published_at IS NULL;

ALTER TABLE linkedin_share_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own share audit"
  ON linkedin_share_audit FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts share audit"
  ON linkedin_share_audit FOR INSERT WITH CHECK (
    current_setting('role', true) = 'service_role'
  );

CREATE POLICY "Service role updates share audit"
  ON linkedin_share_audit FOR UPDATE USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_rate_limits: per-user rate limiting for LinkedIn API calls
CREATE TABLE IF NOT EXISTS linkedin_rate_limits (
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint_category    text        NOT NULL CHECK (endpoint_category IN ('share', 'profile', 'connections', 'messages', 'search', 'media_upload', 'analytics')),
  window_start         timestamptz NOT NULL,
  request_count        int         NOT NULL DEFAULT 1,
  last_request_at      timestamptz NOT NULL DEFAULT now(),
  rate_limit_hit       boolean     DEFAULT false,
  rate_limit_reset_at  timestamptz,
  PRIMARY KEY (user_id, endpoint_category, window_start)
);

CREATE INDEX IF NOT EXISTS linkedin_rate_limits_window_start_idx 
  ON linkedin_rate_limits(window_start);
CREATE INDEX IF NOT EXISTS linkedin_rate_limits_user_category_idx 
  ON linkedin_rate_limits(user_id, endpoint_category);
CREATE INDEX IF NOT EXISTS linkedin_rate_limits_hit_idx 
  ON linkedin_rate_limits(user_id) WHERE rate_limit_hit = true;

ALTER TABLE linkedin_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits"
  ON linkedin_rate_limits FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_connection_events: tracks connection lifecycle events
CREATE TABLE IF NOT EXISTS linkedin_connection_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject     text        NOT NULL,
  event_type           text        NOT NULL CHECK (event_type IN (
    'connected', 'disconnected', 'token_refreshed', 'token_expired', 
    'token_revoked', 'scope_upgraded', 'reauth_required', 'reauth_completed',
    'error_occurred', 'rate_limited'
  )),
  previous_status      text,
  new_status           text,
  scopes_before        text[],
  scopes_after         text[],
  error_code           text,
  error_message        text,
  ip_address           inet,
  user_agent           text,
  metadata             jsonb       DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_connection_events_user_id_idx 
  ON linkedin_connection_events(user_id);
CREATE INDEX IF NOT EXISTS linkedin_connection_events_created_at_idx 
  ON linkedin_connection_events(created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_connection_events_event_type_idx 
  ON linkedin_connection_events(event_type);
CREATE INDEX IF NOT EXISTS linkedin_connection_events_linkedin_subject_idx 
  ON linkedin_connection_events(linkedin_subject);

ALTER TABLE linkedin_connection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own connection events"
  ON linkedin_connection_events FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages connection events"
  ON linkedin_connection_events FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- linkedin_token_refresh_log: audit trail for token refresh operations
CREATE TABLE IF NOT EXISTS linkedin_token_refresh_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_subject     text        NOT NULL,
  refresh_trigger      text        NOT NULL CHECK (refresh_trigger IN ('proactive', 'expired', 'api_error', 'manual', 'scheduled')),
  success              boolean     NOT NULL,
  old_expires_at       timestamptz,
  new_expires_at       timestamptz,
  old_scopes           text[],
  new_scopes           text[],
  error_code           text,
  error_message        text,
  latency_ms           int,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_user_id_idx 
  ON linkedin_token_refresh_log(user_id);
CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_created_at_idx 
  ON linkedin_token_refresh_log(created_at DESC);
CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_success_idx 
  ON linkedin_token_refresh_log(success);
CREATE INDEX IF NOT EXISTS linkedin_token_refresh_log_trigger_idx 
  ON linkedin_token_refresh_log(refresh_trigger);

ALTER TABLE linkedin_token_refresh_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own token refresh log"
  ON linkedin_token_refresh_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages token refresh log"
  ON linkedin_token_refresh_log FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- Cleanup function for expired OAuth states and old rate limit windows
CREATE OR REPLACE FUNCTION cleanup_linkedin_oauth_states()
RETURNS void AS $$
DECLARE
  deleted_states int;
  deleted_rate_limits int;
  deleted_refresh_logs int;
BEGIN
  DELETE FROM linkedin_oauth_states WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS deleted_states = ROW_COUNT;
  
  DELETE FROM linkedin_rate_limits WHERE window_start < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_rate_limits = ROW_COUNT;
  
  DELETE FROM linkedin_token_refresh_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_refresh_logs = ROW_COUNT;
  
  RAISE NOTICE 'LinkedIn cleanup: % oauth states, % rate limits, % refresh logs deleted',
    deleted_states, deleted_rate_limits, deleted_refresh_logs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and update connection status based on token expiry
CREATE OR REPLACE FUNCTION check_linkedin_token_expiry()
RETURNS void AS $$
BEGIN
  UPDATE linkedin_identities
  SET 
    connection_status = 'expired',
    updated_at = now()
  WHERE 
    connection_status = 'active'
    AND expires_at < now()
    AND (refresh_token IS NULL OR refresh_expires_at < now());
    
  UPDATE linkedin_identities
  SET 
    connection_status = 'pending_reauth',
    updated_at = now()
  WHERE 
    connection_status = 'active'
    AND expires_at < now()
    AND refresh_token IS NOT NULL
    AND refresh_expires_at >= now()
    AND consecutive_refresh_failures >= 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get share statistics for a user
CREATE OR REPLACE FUNCTION get_linkedin_share_stats(p_user_id uuid, p_days int DEFAULT 30)
RETURNS TABLE (
  total_shares bigint,
  successful_shares bigint,
  failed_shares bigint,
  share_types jsonb,
  avg_latency_ms numeric,
  last_share_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as total_shares,
    COUNT(*) FILTER (WHERE response_status >= 200 AND response_status < 300)::bigint as successful_shares,
    COUNT(*) FILTER (WHERE response_status >= 400)::bigint as failed_shares,
    jsonb_object_agg(share_type, type_count) as share_types,
    AVG(latency_ms)::numeric as avg_latency_ms,
    MAX(created_at) as last_share_at
  FROM linkedin_share_audit
  CROSS JOIN LATERAL (
    SELECT share_type, COUNT(*) as type_count
    FROM linkedin_share_audit sa2
    WHERE sa2.user_id = p_user_id
      AND sa2.created_at > now() - (p_days || ' days')::interval
    GROUP BY share_type
  ) type_counts
  WHERE user_id = p_user_id
    AND created_at > now() - (p_days || ' days')::interval;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Comments for documentation
COMMENT ON TABLE linkedin_identities IS 'Stores LinkedIn OAuth credentials and profile data for authenticated users';
COMMENT ON TABLE linkedin_oauth_states IS 'Temporary CSRF tokens for OAuth flow security';
COMMENT ON TABLE linkedin_share_audit IS 'Immutable audit log of all content sharing attempts';
COMMENT ON TABLE linkedin_rate_limits IS 'Per-user rate limiting windows for LinkedIn API calls';
COMMENT ON TABLE linkedin_connection_events IS 'Event log tracking LinkedIn connection lifecycle changes';
COMMENT ON TABLE linkedin_token_refresh_log IS 'Audit trail for all token refresh operations';
COMMENT ON COLUMN linkedin_identities.linkedin_subject IS 'LinkedIn member URN (unique identifier)';
COMMENT ON COLUMN linkedin_identities.connection_status IS 'Current state of OAuth connection';
COMMENT ON COLUMN linkedin_identities.consecutive_refresh_failures IS 'Count of consecutive failed token refreshes';
COMMENT ON COLUMN linkedin_identities.feature_flags IS 'User-specific feature flags for LinkedIn integration';
COMMENT ON COLUMN linkedin_share_audit.idempotency_key IS 'Client-provided key to prevent duplicate shares';
COMMENT ON COLUMN linkedin_share_audit.parent_share_id IS 'Reference to original share for reshares';
COMMENT ON COLUMN linkedin_connection_events.event_type IS 'Type of connection lifecycle event';
COMMENT ON COLUMN linkedin_token_refresh_log.refresh_trigger IS 'What triggered the token refresh attempt';
COMMENT ON FUNCTION cleanup_linkedin_oauth_states() IS 'Periodic cleanup of expired OAuth states, rate limits, and old logs';
COMMENT ON FUNCTION check_linkedin_token_expiry() IS 'Updates connection status for expired tokens';
COMMENT ON FUNCTION get_linkedin_share_stats(uuid, int) IS 'Returns sharing statistics for a user over the specified period';