-- 018: Stable member-only profile URLs and scoped cross-member viewing.
-- Additive migration; no personal data or passwords are published anonymously.
-- Apply through reviewed Neon migration workflow AFTER verifying on a branch.
-- Profile display_name is immutable under the current owner-only profile editor.
CREATE TABLE IF NOT EXISTS app_private.member_profile_slugs (
  user_id uuid PRIMARY KEY REFERENCES app_private.member_profiles(user_id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$')
);
REVOKE ALL ON app_private.member_profile_slugs FROM PUBLIC;
GRANT SELECT ON app_private.member_profile_slugs TO ogcupid_member_api;
ALTER TABLE app_private.member_profile_slugs ENABLE ROW LEVEL SECURITY;
-- Do not FORCE RLS here: the private SECURITY DEFINER allocation trigger
-- requires owner rights to reserve a unique slug during profile creation.
CREATE POLICY profile_slugs_member_select ON app_private.member_profile_slugs
  FOR SELECT TO ogcupid_member_api
  USING (app_private.current_member_is_active());

CREATE OR REPLACE FUNCTION app_private.allocate_profile_slug(p_user_id uuid, p_display_name text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
DECLARE stem text; candidate text; existing_slug text; n integer;
BEGIN
  SELECT slug INTO existing_slug
    FROM app_private.member_profile_slugs WHERE user_id = p_user_id;
  IF existing_slug IS NOT NULL THEN RETURN existing_slug; END IF;
  stem := trim(both '-' from regexp_replace(lower(coalesce(p_display_name,'')),
       '[^a-z0-9]+', '-', 'g'));
  stem := trim(both '-' from left(stem, 48));
  IF stem = '' THEN stem := 'member'; END IF;
  IF stem = ANY (ARRAY['me','admin','api','account','profiles','profile','login',
          'signup','join','settings','photos','questions','quiz','ogtrends',
          'terms','privacy','contact','deleted','undefined']) THEN
    stem := 'member-' || stem;
  END IF;
  FOR n IN 1..100000 LOOP
    candidate := CASE WHEN n=1 THEN stem
      ELSE left(stem, 58-length(n::text)) || '-' || n::text END;
    INSERT INTO app_private.member_profile_slugs (user_id,slug)
       VALUES (p_user_id,candidate) ON CONFLICT DO NOTHING
       RETURNING slug INTO existing_slug;
    IF existing_slug IS NOT NULL THEN RETURN existing_slug; END IF;
    -- Concurrent insert for the same user can win before another attempt.
    SELECT slug INTO existing_slug
      FROM app_private.member_profile_slugs WHERE user_id = p_user_id;
    IF existing_slug IS NOT NULL THEN RETURN existing_slug; END IF;
  END LOOP;
  RAISE EXCEPTION 'Could not assign member profile URL';
END $fn$;
REVOKE ALL ON FUNCTION app_private.allocate_profile_slug(uuid,text) FROM PUBLIC, ogcupid_member_api;

CREATE OR REPLACE FUNCTION app_private.reserve_profile_slug_after_insert()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
BEGIN
  PERFORM app_private.allocate_profile_slug(NEW.user_id, NEW.display_name);
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION app_private.reserve_profile_slug_after_insert() FROM PUBLIC;
CREATE TRIGGER reserve_new_member_profile_slug
  AFTER INSERT ON app_private.member_profiles
  FOR EACH ROW EXECUTE FUNCTION app_private.reserve_profile_slug_after_insert();

-- Deterministic backfill for existing saved profiles; unique constraints and
-- ON CONFLICT ensure collisions receive -2, -3 etc, not overwritten entries.
DO $fn$
DECLARE profile_row record;
BEGIN
  FOR profile_row IN
    SELECT user_id, display_name FROM app_private.member_profiles
    ORDER BY created_at, user_id
  LOOP
    PERFORM app_private.allocate_profile_slug(profile_row.user_id,profile_row.display_name);
  END LOOP;
END $fn$;

-- View permissions permit authenticated active members to read *profile*
-- rows and photo metadata; existing owner-only policies still protect writes.
-- The public-facing endpoint below explicitly whitelists response fields.
CREATE POLICY member_profile_read_for_members ON app_private.member_profiles
  FOR SELECT TO ogcupid_member_api
  USING (app_private.current_member_is_active());

CREATE POLICY member_photo_read_for_members ON app_private.member_photos
  FOR SELECT TO ogcupid_member_api
  USING (app_private.current_member_is_active());

-- Explicitly private Q&A remain owner-only; non-private chosen answers may
-- appear on a member profile. Never share acceptable partner answers or notes.
CREATE POLICY nonprivate_answer_read_for_members ON app_private.member_match_answers
  FOR SELECT TO ogcupid_member_api
  USING (NOT is_private AND app_private.current_member_is_active());

CREATE OR REPLACE FUNCTION app_private.member_profile_for_slug(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
  SELECT jsonb_build_object(
    'userId', p.user_id,
    'slug', s.slug,
    'isOwner', p.user_id::text = nullif(current_setting('app.current_user_id',true),''),
    'displayName', p.display_name,
    'aboutMe', p.about_me,
    'age', p.age,
    'cityRegion', p.city_region,
    'gender', p.gender,
    'pronouns', p.pronouns,
    'orientation', p.orientation,
    'interestedIn', p.interested_in,
    'relationshipGoal', p.relationship_goal,
    'lookingFor', p.looking_for,
    'work', p.work,
    'education', p.education,
    'height', p.height,
    'kids', p.kids,
    'pets', p.pets,
    'smoking', p.smoking,
    'drinking', p.drinking,
    'diet', p.diet,
    'languages', p.languages,
    'lifeDirection', p.life_direction,
    'goodAt', p.good_at,
    'favorites', p.favorites,
    'sixThings', p.six_things,
    'fridayNight', p.friday_night,
    'messageMeIf', p.message_me_if,
    'ethnicity', p.ethnicity,
    'bodyType', p.body_type,
    'vaping', p.vaping,
    'drugs', p.drugs,
    'religion', p.religion,
    'sign', p.sign,
    'income', p.income,
    'status', p.status,
    'relationshipType', p.relationship_type,
    'personaCode', o.persona_code,
    'photos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', ph.id, 'isPrimary', ph.is_primary, 'sortOrder', ph.sort_order,
          'width', ph.width, 'height', ph.height
        ) ORDER BY ph.is_primary DESC, ph.sort_order, ph.created_at)
      FROM app_private.member_photos ph
      WHERE ph.user_id=p.user_id), '[]'::jsonb),
    'answers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'questionId', a.question_id, 'optionId', a.option_id
        ) ORDER BY a.updated_at DESC)
      FROM app_private.member_match_answers a
      WHERE a.user_id=p.user_id AND
        (NOT a.is_private OR
          p.user_id::text = nullif(current_setting('app.current_user_id',true),''))
      ), '[]'::jsonb)
  )
  FROM app_private.member_profile_slugs s
  JOIN app_private.member_profiles p ON p.user_id = s.user_id
  LEFT JOIN app_private.member_onboarding o ON o.user_id=p.user_id
  WHERE s.slug=p_slug
    AND nullif(current_setting('app.current_user_id',true),'') IS NOT NULL
    AND app_private.current_member_is_active()
  LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION app_private.member_profile_for_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.member_profile_for_slug(text) TO ogcupid_member_api;

-- The current member can retrieve only their own already-assigned slug.
CREATE OR REPLACE FUNCTION app_private.current_member_profile_slug()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
  SELECT s.slug FROM app_private.member_profile_slugs s
  WHERE s.user_id::text = nullif(current_setting('app.current_user_id',true),'')
    AND app_private.current_member_is_active();
$fn$;
REVOKE ALL ON FUNCTION app_private.current_member_profile_slug() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_member_profile_slug() TO ogcupid_member_api;

-- Server-side photo bytes stay in private Neon storage. This function returns
-- a storage key ONLY to the authenticated API process, never in profile JSON.
CREATE OR REPLACE FUNCTION app_private.member_viewable_photo_key(p_photo_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $fn$
  SELECT ph.object_key
  FROM app_private.member_photos ph
  JOIN app_private.member_profile_slugs s ON s.user_id=ph.user_id
  WHERE ph.id=p_photo_id
    AND nullif(current_setting('app.current_user_id',true),'') IS NOT NULL
    AND app_private.current_member_is_active()
  LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION app_private.member_viewable_photo_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.member_viewable_photo_key(uuid) TO ogcupid_member_api;
