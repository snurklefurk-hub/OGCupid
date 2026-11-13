-- 014: structured private profile details. Additive only; no existing member is
-- scanned, altered, banned, or deleted by this migration.
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS ethnicity text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS body_type text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS vaping text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS drugs text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS religion text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS sign text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS income text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS relationship_type text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS interested_in text;

-- display_name is account identity once a profile has been saved. Profile PUTs
-- may not rename an existing account/profile.
COMMENT ON COLUMN app_private.member_profiles.display_name IS
  'Set when the first profile is created from signup identity; immutable through profile editing.';

-- The member API must never accept a display name from a profile-edit request.
-- This SECURITY DEFINER helper returns only the authenticated caller's
-- already-verified Neon Auth name. It has no argument and is gated by the
-- transaction-local identity set by the API after JWT verification.
CREATE OR REPLACE FUNCTION app_private.current_member_display_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, neon_auth, app_private
AS $$
  SELECT u.name
  FROM neon_auth."user" AS u
  WHERE u.id::text = NULLIF(current_setting('app.current_user_id', true), '')
$$;

REVOKE ALL ON FUNCTION app_private.current_member_display_name() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_member_display_name() TO ogcupid_member_api;
