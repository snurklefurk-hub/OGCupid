-- Canonical onboarding state belongs to the Auth user and disappears with it.
-- Apply to an isolated branch and verify role grants/RLS before production.
CREATE TABLE app_private.member_onboarding (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  gender text CHECK (gender IN ('Man','Woman','Transman','Transwoman','Something else')),
  orientation text CHECK (orientation IN ('Gay','Straight','Bi','Something else')),
  birth_date date,
  country_code char(2),
  zip_code text,
  locality_id integer,
  locality_shard text,
  city_label text,
  details_complete boolean NOT NULL DEFAULT false,
  match_age_min integer NOT NULL DEFAULT 18 CHECK (match_age_min BETWEEN 18 AND 120),
  match_age_max integer NOT NULL DEFAULT 99 CHECK (match_age_max BETWEEN 18 AND 120),
  explored_at timestamptz,
  primary_self_photo_id uuid,
  persona_code char(4),
  persona_answers smallint[],
  CHECK (match_age_min <= match_age_max),
  CHECK (birth_date IS NULL OR birth_date <= (CURRENT_DATE - INTERVAL '18 years')::date),
  CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{5}$'),
  CHECK (persona_code IS NULL OR persona_code ~ '^[DR][GB][LS][DM]$'),
  CHECK (persona_answers IS NULL OR array_length(persona_answers, 1) = 28)
);
REVOKE ALL ON app_private.member_onboarding FROM PUBLIC, ogcupid_delete_api;
GRANT SELECT, INSERT, UPDATE ON app_private.member_onboarding TO ogcupid_member_api;
ALTER TABLE app_private.member_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_onboarding FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_owner ON app_private.member_onboarding FOR ALL TO ogcupid_member_api
  USING (user_id::text = nullif(current_setting('app.current_user_id', true), ''))
  WITH CHECK (user_id::text = nullif(current_setting('app.current_user_id', true), ''));

-- Exactly two fields. This remains personal data and is never exposed to members.
CREATE TABLE app_private.previously_registered_emails (
  email text PRIMARY KEY,
  previously_registered boolean NOT NULL DEFAULT true CHECK (previously_registered)
);
REVOKE ALL ON app_private.previously_registered_emails FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

-- The deletion role still calls a no-argument function after JWT/password checks.
CREATE OR REPLACE FUNCTION app_private.erase_current_member_after_reauth()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $fn$
DECLARE member_id uuid; member_email text;
BEGIN
  member_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
  IF member_id IS NULL THEN RETURN false; END IF;
  SELECT email INTO member_email FROM neon_auth."user" WHERE id = member_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO app_private.previously_registered_emails(email, previously_registered)
    VALUES (member_email, true) ON CONFLICT (email) DO NOTHING;
  DELETE FROM neon_auth."user" WHERE id = member_id;
  RETURN FOUND;
END $fn$;
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM PUBLIC, ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.erase_current_member_after_reauth() TO ogcupid_delete_api;

-- Until a tested server-side publication endpoint exists, the owner alone
-- may read their album. This closes the former peer-read of draft photos.
CREATE FUNCTION app_private.current_member_email_verified()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $fn$
  SELECT COALESCE((SELECT u."emailVerified" FROM neon_auth."user" u
    WHERE u.id = nullif(current_setting('app.current_user_id', true), '')::uuid), false);
$fn$;
REVOKE ALL ON FUNCTION app_private.current_member_email_verified() FROM PUBLIC, ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.current_member_email_verified() TO ogcupid_member_api;
DROP POLICY member_photo_read ON app_private.member_photos;
CREATE POLICY member_photo_read ON app_private.member_photos FOR SELECT TO ogcupid_member_api
USING (app_private.current_member_is_active() AND
       user_id::text = nullif(current_setting('app.current_user_id', true), ''));
