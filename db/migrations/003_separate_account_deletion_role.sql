-- Strict separation: profile API may only throttle deletion requests, not erase.
-- Requires branch-local SQL/Neon role ogcupid_delete_api (NO BYPASSRLS).
-- Store its generated Postgres URI only as a Neon Functions server secret.
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth()
  FROM ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.erase_current_member_after_reauth()
  TO ogcupid_delete_api;

-- A minimal account-deletion role needs no table or sequence reads/writes.
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM ogcupid_delete_api;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_private FROM ogcupid_delete_api;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA app_private
  REVOKE SELECT ON TABLES FROM ogcupid_delete_api;
-- Keep schema usage for resolving the one SECURITY DEFINER function.
GRANT USAGE ON SCHEMA app_private TO ogcupid_delete_api;
