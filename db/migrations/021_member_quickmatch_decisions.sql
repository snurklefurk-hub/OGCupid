-- 021: Owner-only persistent Quickmatch decisions.
-- Rollout: apply and review on a nonproduction Neon branch first.
-- The frontend must not enable Like/Dislike if this table/Function is unavailable.
CREATE TABLE IF NOT EXISTS app_private.member_quickmatch_decisions (
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('like', 'dislike')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_user_id),
  CONSTRAINT quickmatch_not_self CHECK (user_id <> target_user_id)
);
REVOKE ALL ON app_private.member_quickmatch_decisions FROM PUBLIC, ogcupid_delete_api;
GRANT SELECT, INSERT, UPDATE ON app_private.member_quickmatch_decisions TO ogcupid_member_api;
ALTER TABLE app_private.member_quickmatch_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_quickmatch_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY quickmatch_owner_read ON app_private.member_quickmatch_decisions
  FOR SELECT TO ogcupid_member_api
  USING (user_id::text = nullif(current_setting('app.current_user_id', true), ''));
CREATE POLICY quickmatch_owner_insert ON app_private.member_quickmatch_decisions
  FOR INSERT TO ogcupid_member_api
  WITH CHECK (user_id::text = nullif(current_setting('app.current_user_id', true), ''));
CREATE POLICY quickmatch_owner_update ON app_private.member_quickmatch_decisions
  FOR UPDATE TO ogcupid_member_api
  USING (user_id::text = nullif(current_setting('app.current_user_id', true), ''))
  WITH CHECK (user_id::text = nullif(current_setting('app.current_user_id', true), ''));
COMMENT ON TABLE app_private.member_quickmatch_decisions IS
  'Private owner-only Like/Dislike decisions; not mutual matches, conversations, or public activity.';
