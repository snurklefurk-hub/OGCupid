-- OG Cupid member-initiated deletion (reviewed development migration).
-- IMPORTANT: deploy to dev/private-member-accounts only until release approved.
-- The membership API role has no direct DELETE permission on neon_auth."user".
-- These narrowly scoped SECURITY DEFINER functions must be invoked only
-- from a server that verified a signed JWT and a fresh password with Neon Auth.
-- Do not expose the database role password or arbitrary SQL access to clients.

CREATE TABLE IF NOT EXISTS app_private.member_deletion_attempts (
  user_id UUID PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1)
);
REVOKE ALL ON TABLE app_private.member_deletion_attempts FROM PUBLIC;
REVOKE ALL ON TABLE app_private.member_deletion_attempts FROM ogcupid_member_api;

-- PostgreSQL application GUC values are not themselves cryptographic identity:
-- the calling Function MUST set app.current_user_id from a verified JWT,
-- and MUST use a server-only database connection. Do not permit external
-- SQL/connection-string access with ogcupid_member_api credentials.
CREATE OR REPLACE FUNCTION app_private.reserve_member_deletion_attempt()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
DECLARE
  member_id UUID;
  count_now INTEGER;
BEGIN
  member_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  IF member_id IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO app_private.member_deletion_attempts AS a
    (user_id, window_start, attempt_count)
  VALUES (member_id, now(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    window_start = CASE WHEN a.window_start <= now() - interval '1 hour'
      THEN now() ELSE a.window_start END,
    attempt_count = CASE WHEN a.window_start <= now() - interval '1 hour'
      THEN 1 ELSE a.attempt_count + 1 END
  RETURNING attempt_count INTO count_now;
  RETURN count_now <= 5;
END;
$fn$;

-- Only execute after the API verified the *same account's current password*
-- with Managed Neon Auth. The function accepts no arbitrary target user ID.
CREATE OR REPLACE FUNCTION app_private.erase_current_member_after_reauth()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
DECLARE
  member_id UUID;
BEGIN
  member_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  IF member_id IS NULL THEN RETURN FALSE; END IF;
  DELETE FROM neon_auth."user" WHERE id = member_id;
  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION app_private.reserve_member_deletion_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.reserve_member_deletion_attempt() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.erase_current_member_after_reauth() TO ogcupid_member_api;
