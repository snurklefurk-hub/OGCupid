-- OG Cupid: reject profile access after account deletion, even if a signed
-- access token/JWT has not yet expired. Development migration; no
-- production deployment authorized by this test.
--
-- The member API database role cannot SELECT neon_auth."user". This narrow
-- SECURITY DEFINER function allows a yes/no liveness check on the member
-- identity already placed in the transaction-local database context by the
-- JWT-verifying Function. It accepts NO arbitrary user ID parameter.
--
-- This is defense-in-depth for deleted identities, not token/session
-- revocation. The JWT must still be cryptographically verified upstream.

CREATE OR REPLACE FUNCTION app_private.current_member_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM neon_auth."user" u
    WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
$func$;

REVOKE ALL ON FUNCTION app_private.current_member_is_active() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.current_member_is_active() FROM ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.current_member_is_active() TO ogcupid_member_api;
