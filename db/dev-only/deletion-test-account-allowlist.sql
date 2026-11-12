-- DEVELOPMENT TEST ONLY. DO NOT APPLY TO PRODUCTION.
-- The member-initiated deletion endpoint is still disabled by default.
-- Temporarily restrict the privileged eraser to the one owner-authorized,
-- disposable dev account. This prevents other dev accounts being deleted
-- even if the frontend/back-end test flags are enabled by accident.
--
-- This overrides db/migrations/002's general eraser until the test is done.
-- Do not carry this test-only allowlist into the production release.

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

  -- Hardcoded allowlist applies solely to one disposable dev user.
  IF member_id <> '5b03f41b-29b7-4a7a-9c72-71744dd8b2f2'::uuid THEN
    RETURN FALSE;
  END IF;

  DELETE FROM neon_auth."user" WHERE id = member_id;
  RETURN FOUND;
END;
$fn$;

-- Retain the split roles and revoke broad execution.
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.erase_current_member_after_reauth() TO ogcupid_delete_api;
