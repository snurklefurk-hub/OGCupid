-- 017: Member-only, stable /profiles/{display-name-slug} routes.
-- No data is made accessible to unauthenticated visitors. JWT/liveness remains
-- enforced in the Neon Function; only narrowly authorized member DB roles can
-- select profile routes and non-private profile/answer content.
CREATE TABLE IF NOT EXISTS app_private.member_profile_routes (
  user_id uuid PRIMARY KEY REFERENCES app_private.member_profiles(user_id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 96),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.member_profile_routes FROM PUBLIC, ogcupid_delete_api;
GRANT SELECT ON app_private.member_profile_routes TO ogcupid_member_api;
ALTER TABLE app_private.member_profile_routes ENABLE ROW LEVEL SECURITY;
-- Deliberately not FORCE: the locked, SECURITY DEFINER slug assigner needs to
-- create rows. The member API cannot INSERT/UPDATE/DELETE this table.
DROP POLICY IF EXISTS profile_routes_member_read ON app_private.member_profile_routes;
CREATE POLICY profile_routes_member_read ON app_private.member_profile_routes
  FOR SELECT TO ogcupid_member_api
  USING (app_private.current_member_is_active());

CREATE OR REPLACE FUNCTION app_private.profile_slug_base(display_name text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog AS $$
  SELECT CASE WHEN safe IN ('admin','api','account','assets','auth','contact','help',
    'login','members','ogtrends','privacy','profiles','questions','quiz',
    'settings','signup','terms','www','null') THEN 'member-'||safe ELSE safe END
  FROM (
    SELECT coalesce(nullif(btrim(regexp_replace(lower(display_name),
        '[^a-z0-9]+', '-', 'g'),'-'),''),'member') AS safe
  ) AS candidate;
$$;
REVOKE ALL ON FUNCTION app_private.profile_slug_base(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.profile_slug_base(text) TO ogcupid_member_api;

CREATE OR REPLACE FUNCTION app_private.claim_member_profile_route(member_id uuid, name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE base text; candidate text; previous text; suffix integer := 1;
BEGIN
  SELECT slug INTO previous FROM app_private.member_profile_routes WHERE user_id=member_id;
  IF previous IS NOT NULL THEN RETURN previous; END IF;
  base := app_private.profile_slug_base(name);
  -- Serialize same-name signup, including parallel profile saves.
  PERFORM pg_advisory_xact_lock(hashtextextended(base, 0));
  LOOP
    candidate := CASE WHEN suffix = 1 THEN base ELSE base||'-'||suffix::text END;
    BEGIN
      INSERT INTO app_private.member_profile_routes(user_id,slug)
      VALUES(member_id,candidate);
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      SELECT slug INTO previous FROM app_private.member_profile_routes WHERE user_id=member_id;
      IF previous IS NOT NULL THEN RETURN previous; END IF;
      suffix := suffix + 1;
      IF suffix > 100000 THEN RAISE EXCEPTION 'Profile slug space exhausted'; END IF;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION app_private.claim_member_profile_route(uuid,text) FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

CREATE OR REPLACE FUNCTION app_private.profile_route_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
BEGIN
  PERFORM app_private.claim_member_profile_route(NEW.user_id, NEW.display_name);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.profile_route_on_insert() FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;
DROP TRIGGER IF EXISTS assign_member_profile_route ON app_private.member_profiles;
CREATE TRIGGER assign_member_profile_route
AFTER INSERT ON app_private.member_profiles
FOR EACH ROW EXECUTE FUNCTION app_private.profile_route_on_insert();

-- Existing profiles receive stable, deterministic first-available slugs.
-- This backfill does not alter the source display name or any profile contents.
DO $backfill$
DECLARE member record;
BEGIN
  FOR member IN SELECT user_id,display_name FROM app_private.member_profiles
    ORDER BY created_at,user_id LOOP
    PERFORM app_private.claim_member_profile_route(member.user_id,member.display_name);
  END LOOP;
END $backfill$;

-- Member-authenticated reads; the server still whitelists fields before JSON
-- serialization. Existing owner-only ALL/UPDATE policies remain unchanged.
DROP POLICY IF EXISTS member_profiles_authenticated_read ON app_private.member_profiles;
CREATE POLICY member_profiles_authenticated_read ON app_private.member_profiles
FOR SELECT TO ogcupid_member_api
USING (app_private.current_member_is_active());

-- Public-facing answered questions exclude is_private=true and NEVER return
-- answer notes, acceptable partner choices or importance weights.
DROP POLICY IF EXISTS member_answers_authenticated_public_read ON app_private.member_match_answers;
CREATE POLICY member_answers_authenticated_public_read ON app_private.member_match_answers
FOR SELECT TO ogcupid_member_api
USING (is_private = false AND app_private.current_member_is_active());

-- Member-only public persona code. Onboarding rows remain owner-only, including
-- DOB, postal code and unpublished test data.
CREATE OR REPLACE FUNCTION app_private.visible_member_persona(member_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
  SELECT CASE WHEN app_private.current_member_is_active()
    THEN (SELECT persona_code::text FROM app_private.member_onboarding
      WHERE user_id=member_id AND explored_at IS NOT NULL)
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION app_private.visible_member_persona(uuid) FROM PUBLIC, ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.visible_member_persona(uuid) TO ogcupid_member_api;

COMMENT ON TABLE app_private.member_profile_routes IS
  'Stable human-readable member-only URLs; immutable after creation and deleted with profiles.';
