-- 022: Private one-to-one member messages, contact blocking and abuse reports.
-- Additive only. Validate on the isolated Neon development branch before rollout.
-- No messages, reports, or blocks are visible to the public or deletion API role.

CREATE TABLE IF NOT EXISTS app_private.member_message_blocks (
  blocker_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT message_block_not_self CHECK (blocker_id <> blocked_id)
);
REVOKE ALL ON app_private.member_message_blocks FROM PUBLIC, ogcupid_delete_api;
GRANT SELECT, INSERT, DELETE ON app_private.member_message_blocks TO ogcupid_member_api;
ALTER TABLE app_private.member_message_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_message_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY message_block_owner_read ON app_private.member_message_blocks
  FOR SELECT TO ogcupid_member_api
  USING (blocker_id::text = nullif(current_setting('app.current_user_id', true), ''));
CREATE POLICY message_block_owner_insert ON app_private.member_message_blocks
  FOR INSERT TO ogcupid_member_api
  WITH CHECK (blocker_id::text = nullif(current_setting('app.current_user_id', true), ''));
CREATE POLICY message_block_owner_delete ON app_private.member_message_blocks
  FOR DELETE TO ogcupid_member_api
  USING (blocker_id::text = nullif(current_setting('app.current_user_id', true), ''));

-- A boolean predicate evaluated by the database. It checks both directions
-- without revealing whether the other person has blocked the sender.
CREATE OR REPLACE FUNCTION app_private.can_message_member(peer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
  SELECT app_private.current_member_is_active()
    AND app_private.is_discoverable_member(nullif(current_setting('app.current_user_id', true), '')::uuid)
    AND app_private.is_discoverable_member(peer)
    AND peer <> nullif(current_setting('app.current_user_id', true), '')::uuid
    AND NOT EXISTS (
      SELECT 1 FROM app_private.member_message_blocks AS b
      WHERE (b.blocker_id = nullif(current_setting('app.current_user_id', true), '')::uuid AND b.blocked_id = peer)
         OR (b.blocker_id = peer AND b.blocked_id = nullif(current_setting('app.current_user_id', true), '')::uuid)
    );
$$;
REVOKE ALL ON FUNCTION app_private.can_message_member(uuid) FROM PUBLIC, ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.can_message_member(uuid) TO ogcupid_member_api;

CREATE TABLE IF NOT EXISTS app_private.member_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000 AND btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_not_self CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS member_messages_sender_time
  ON app_private.member_messages(sender_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS member_messages_recipient_time
  ON app_private.member_messages(recipient_id, created_at DESC, id DESC);
REVOKE ALL ON app_private.member_messages FROM PUBLIC, ogcupid_delete_api;
GRANT SELECT, INSERT ON app_private.member_messages TO ogcupid_member_api;
ALTER TABLE app_private.member_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY message_participants_read ON app_private.member_messages
  FOR SELECT TO ogcupid_member_api
  USING (
    app_private.current_member_is_active()
    AND (sender_id::text = nullif(current_setting('app.current_user_id', true), '')
       OR recipient_id::text = nullif(current_setting('app.current_user_id', true), ''))
  );
CREATE POLICY message_sender_insert ON app_private.member_messages
  FOR INSERT TO ogcupid_member_api
  WITH CHECK (
    sender_id::text = nullif(current_setting('app.current_user_id', true), '')
    AND app_private.can_message_member(recipient_id)
  );

-- Reports are member-submitted evidence only. The normal member API has
-- INSERT permission but cannot list/read/change/delete any report.
CREATE TABLE IF NOT EXISTS app_private.member_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES app_private.member_messages(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'harassment', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, message_id)
);
REVOKE ALL ON app_private.member_message_reports FROM PUBLIC, ogcupid_delete_api;
GRANT INSERT ON app_private.member_message_reports TO ogcupid_member_api;
ALTER TABLE app_private.member_message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_message_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY received_message_report_only ON app_private.member_message_reports
  FOR INSERT TO ogcupid_member_api
  WITH CHECK (
    reporter_id::text = nullif(current_setting('app.current_user_id', true), '')
    AND EXISTS (
      SELECT 1 FROM app_private.member_messages AS m
      WHERE m.id = message_id AND m.recipient_id = reporter_id
    )
  );
COMMENT ON TABLE app_private.member_messages IS
  'Private one-to-one messages visible only to sender and recipient; user deletion cascades.';
COMMENT ON TABLE app_private.member_message_reports IS
  'Restricted abuse-report evidence for owner-led review; no public or member read access.';
