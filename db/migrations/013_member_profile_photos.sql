-- OG Cupid: up to five cropped JPEG profile pictures per saved member profile.
-- Apply to an isolated development Neon branch and verify RLS before
-- applying to production. Object blobs remain in the PRIVATE 'uploads' bucket.
-- This migration does not change privacy for textual member profile fields.
CREATE TABLE IF NOT EXISTS app_private.member_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_private.member_profiles(user_id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  photo_bytes integer NOT NULL CHECK (photo_bytes > 0 AND photo_bytes <= 2500000),
  width smallint NOT NULL CHECK (width BETWEEN 240 AND 2000),
  height smallint NOT NULL CHECK (height BETWEEN 240 AND 2000),
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 1 AND 5),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_key_matches_owner CHECK (
    object_key = 'profile-photos/' || user_id::text || '/' || id::text || '.jpg'
  )
);
REVOKE ALL ON app_private.member_photos FROM PUBLIC, ogcupid_delete_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_private.member_photos TO ogcupid_member_api;
ALTER TABLE app_private.member_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_photos FORCE ROW LEVEL SECURITY;
-- All active, JWT-verified members can view other members' *photo metadata*
-- and request JPEG bytes through the API. No guest or anonymous access.
CREATE POLICY member_photo_read ON app_private.member_photos FOR SELECT
TO ogcupid_member_api
USING (app_private.current_member_is_active());
CREATE POLICY member_photo_insert ON app_private.member_photos FOR INSERT
TO ogcupid_member_api
WITH CHECK (user_id::text = NULLIF(current_setting('app.current_user_id',true),''));
CREATE POLICY member_photo_update ON app_private.member_photos FOR UPDATE
TO ogcupid_member_api
USING (user_id::text = NULLIF(current_setting('app.current_user_id',true),''))
WITH CHECK (user_id::text = NULLIF(current_setting('app.current_user_id',true),''));
CREATE POLICY member_photo_delete ON app_private.member_photos FOR DELETE
TO ogcupid_member_api
USING (user_id::text = NULLIF(current_setting('app.current_user_id',true),''));

CREATE INDEX IF NOT EXISTS member_photos_owner_order
ON app_private.member_photos (user_id,sort_order,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS one_primary_photo_per_member
ON app_private.member_photos(user_id) WHERE is_primary;

-- Safety net: a member cannot bypass the 5-photo limit through concurrent
-- API uploads. Serialize count checks on the owner's persistent profile row.
CREATE OR REPLACE FUNCTION app_private.enforce_photo_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $photo$
DECLARE current_count integer;
BEGIN
  PERFORM 1 FROM app_private.member_profiles
    WHERE user_id=NEW.user_id FOR UPDATE;
  SELECT count(*) INTO current_count FROM app_private.member_photos
    WHERE user_id=NEW.user_id;
  IF current_count >= 5 THEN
    RAISE EXCEPTION 'Profile photo limit is five' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$photo$;
REVOKE ALL ON FUNCTION app_private.enforce_photo_limit() FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;
CREATE TRIGGER enforce_member_photo_count
BEFORE INSERT ON app_private.member_photos
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_photo_limit();

COMMENT ON TABLE app_private.member_photos IS
  'Cropped, metadata-stripped JPEG profile pictures. Photos are accessible to authenticated members only; content blobs live in private Neon storage. Private DM attachments use a different policy and table.';
