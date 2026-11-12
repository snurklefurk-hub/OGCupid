-- OG Cupid production self-service deletion — November 12, 2026.
-- Authorized by site owner. Applied to the Neon "production" branch only.
-- No account or profile is deleted when this migration is applied.
-- The isolated dev branch uses its own prior migrations.
--
-- Prerequisite: create a LOGIN role named ogcupid_delete_api in this branch
-- with NO BYPASSRLS / no admin privileges, using Neon Role APIs. Its
-- connection URI must be stored ONLY in Neon Functions server environment
-- as OGC_DELETION_DATABASE_URL (never in Git, frontend or Notion).
--
-- The server validates the signed user's JWT, rate-limits by that subject,
-- checks the current password using Neon Auth, requires the confirmed Auth
-- user's ID to match the JWT subject, then calls the no-argument eraser on
-- a separate credential in a transaction with the verified user context.
-- Never expose ogcupid_delete_api credentials to users or external SQL tools.

CREATE TABLE IF NOT EXISTS app_private.member_deletion_attempts (
  user_id UUID PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1)
);

CREATE OR REPLACE FUNCTION app_private.reserve_member_deletion_attempt()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
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
END
$fn$;

CREATE OR REPLACE FUNCTION app_private.erase_current_member_after_reauth()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
DECLARE
  member_id UUID;
BEGIN
  member_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  IF member_id IS NULL THEN RETURN FALSE; END IF;
  -- Cascading FK relations erase Auth account/session and current owner data.
  DELETE FROM neon_auth."user" WHERE id = member_id;
  RETURN FOUND;
END
$fn$;

REVOKE ALL ON TABLE app_private.member_deletion_attempts FROM PUBLIC;
REVOKE ALL ON TABLE app_private.member_deletion_attempts FROM ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.reserve_member_deletion_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.reserve_member_deletion_attempt() FROM ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM ogcupid_member_api;

GRANT EXECUTE ON FUNCTION app_private.reserve_member_deletion_attempt()
  TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.erase_current_member_after_reauth()
  TO ogcupid_delete_api;

-- Remove broader read-only grants the Neon-created role may initially have.
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM ogcupid_delete_api;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_private FROM ogcupid_delete_api;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA app_private
  REVOKE ALL ON TABLES FROM ogcupid_delete_api;
GRANT USAGE ON SCHEMA app_private TO ogcupid_delete_api;

-- Reference checks, all read-only:
-- SELECT has_function_privilege('ogcupid_delete_api',
--   'app_private.erase_current_member_after_reauth()', 'EXECUTE');
-- SELECT has_table_privilege('ogcupid_delete_api',
--   'app_private.member_profiles', 'SELECT'); -- must be false
--
-- The helper deletes ONLY the verified current member. Reauth, JWT checks,
-- rate limiting, origin controls, and the feature flag are in the API.
-- New user-owned tables/media must add explicit cascade/retention policy.
