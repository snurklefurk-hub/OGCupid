-- 007: Account email preferences (production and isolated dev branches).
-- Explicit opt-in only; existing members default to necessary-only emails.
-- These settings do not send any email. An eventual notification worker MUST
-- respect them and cap nonessential sends to one between actual logins.
-- The temporary signup choice is persisted via authenticated member API
-- after email verification / successful sign-in.
CREATE TABLE IF NOT EXISTS app_private.member_email_preferences (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  unread_messages boolean NOT NULL DEFAULT false,
  unseen_activity boolean NOT NULL DEFAULT false,
  site_updates boolean NOT NULL DEFAULT false,
  necessary_only boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_email_preferences_consistent CHECK (
    (necessary_only AND NOT unread_messages AND NOT unseen_activity AND NOT site_updates)
    OR (NOT necessary_only AND (unread_messages OR unseen_activity OR site_updates))
  )
);

ALTER TABLE app_private.member_email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_email_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_email_preferences_owner_only
  ON app_private.member_email_preferences;
CREATE POLICY member_email_preferences_owner_only
  ON app_private.member_email_preferences
  FOR ALL TO ogcupid_member_api
  USING (
    user_id::text = NULLIF(current_setting('app.current_user_id', true), '')
  )
  WITH CHECK (
    user_id::text = NULLIF(current_setting('app.current_user_id', true), '')
  );

REVOKE ALL ON app_private.member_email_preferences FROM PUBLIC;
REVOKE ALL ON app_private.member_email_preferences FROM ogcupid_delete_api;
GRANT SELECT, INSERT, UPDATE ON app_private.member_email_preferences TO ogcupid_member_api;

COMMENT ON TABLE app_private.member_email_preferences IS
  'Email alert opt-ins for signed-in members. Necessary emails remain allowed. '
  'Future notification delivery must cap all optional alert categories to one '
  'email per member between actual sign-ins, not one per event/category.';

-- Intentionally do not insert preference rows for existing members:
-- absent row = necessary_only true; all optional categories false.
-- Never modify or erase any pre-existing member record in this migration.
