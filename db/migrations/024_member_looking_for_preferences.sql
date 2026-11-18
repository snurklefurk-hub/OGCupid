-- 024: Owner-approved four-group "I'm looking for" preferences.
-- Keep existing canonical gender/intent columns and validated locality radius.
-- No parallel preference store, coordinates exposed, or fabricated defaults for existing rows.
ALTER TABLE app_private.member_profiles
  ADD COLUMN IF NOT EXISTS preferred_age_min smallint,
  ADD COLUMN IF NOT EXISTS preferred_age_max smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
      conrelid='app_private.member_profiles'::regclass
      AND conname='member_preferred_age_range_ck') THEN
    ALTER TABLE app_private.member_profiles
      ADD CONSTRAINT member_preferred_age_range_ck CHECK (
        (preferred_age_min IS NULL AND preferred_age_max IS NULL)
        OR (preferred_age_min BETWEEN 18 AND 99
            AND preferred_age_max BETWEEN 18 AND 99
            AND preferred_age_max >= preferred_age_min)
      );
  END IF;
END
$$;

-- A zero radius means an explicitly chosen "Anywhere". NULL on older rows
-- remains "not yet set". New validated locality rows default to 50 miles.
ALTER TABLE app_private.member_localities
  DROP CONSTRAINT IF EXISTS member_radius_choice;
ALTER TABLE app_private.member_localities
  ADD CONSTRAINT member_radius_choice CHECK (
    search_radius_miles IS NULL
    OR search_radius_miles IN (0,10,25,50,100,250,500)
  );
ALTER TABLE app_private.member_localities
  ALTER COLUMN search_radius_miles SET DEFAULT 50;

-- Expose *only* the member-visible distance choice, never private coordinates,
-- search-origin data, or a radius for a non-discoverable account. The member API
-- runs this function with a transaction-local authenticated identity.
CREATE OR REPLACE FUNCTION app_private.visible_member_search_radius(target_user uuid)
RETURNS smallint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private
AS $$
  SELECT CASE WHEN app_private.current_member_is_active()
     AND app_private.is_discoverable_member(target_user)
    THEN (SELECT l.search_radius_miles
          FROM app_private.member_localities l
          WHERE l.user_id=target_user AND l.locality_id IS NOT NULL)
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION app_private.visible_member_search_radius(uuid)
  FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.visible_member_search_radius(uuid)
  TO ogcupid_member_api;
COMMENT ON FUNCTION app_private.visible_member_search_radius(uuid) IS
  'Member-only safe display of saved radius, never a location, address or coordinates.';
