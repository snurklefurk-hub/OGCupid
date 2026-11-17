-- 020: Authenticated discovery eligibility; never expose private onboarding rows.
-- This additive helper is the only capability the member API needs to
-- distinguish fully onboarded member profiles from draft profiles.
-- Applied in production only after staging verification.
CREATE OR REPLACE FUNCTION app_private.is_discoverable_member(member_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
  SELECT app_private.current_member_is_active()
    AND EXISTS (
      SELECT 1 FROM app_private.member_onboarding AS o
      JOIN app_private.member_profiles AS p ON p.user_id = o.user_id
      JOIN app_private.member_profile_routes AS r ON r.user_id = o.user_id
      WHERE o.user_id = member_id
        AND o.explored_at IS NOT NULL
        AND nullif(btrim(p.display_name), '') IS NOT NULL
    );
$$;
REVOKE ALL ON FUNCTION app_private.is_discoverable_member(uuid)
  FROM PUBLIC, ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.is_discoverable_member(uuid)
  TO ogcupid_member_api;
COMMENT ON FUNCTION app_private.is_discoverable_member(uuid)
  IS 'Authenticated boolean-only check for finished member onboarding; no private onboarding data returned.';
