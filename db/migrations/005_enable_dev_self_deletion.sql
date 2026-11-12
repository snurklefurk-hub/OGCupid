-- OG Cupid — normal member self-deletion (isolated DEVELOPMENT branch).
-- Removes the obsolete single-disposable-ID test allowlist.
-- This migration replaces the earlier dev-only override and must NOT be
-- applied to production without a separate release/security review.
--
-- The API (1) validates the bearer JWT, (2) throttles deletion attempts,
-- (3) reauthenticates the exact same user with their current password,
-- and (4) opens a transaction with a JWT-derived app.current_user_id
-- before calling this no-argument function through the dedicated role.
-- PostgreSQL custom GUCs are not themselves authentication; the
-- ogcupid_delete_api credential must remain server-only.
--
-- ON DELETE CASCADE cleans up the current account, session and private
-- profile tables. Any future user-owned data must have explicit deletion
-- behavior before release; this migration cannot anticipate future tables.

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

  -- No caller-supplied target account ID: only the verified session's user.
  DELETE FROM neon_auth."user" WHERE id = member_id;
  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.erase_current_member_after_reauth() TO ogcupid_delete_api;
