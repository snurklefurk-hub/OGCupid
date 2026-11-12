-- 009: Private canonical locality and match-distance preferences.
-- Owner-linked and FORCE RLS: neither another member nor an anonymous visitor
-- can view or change these settings. No public member discovery is added.
-- Existing city_region free text is preserved; new data is opt-in.
CREATE TABLE IF NOT EXISTS app_private.member_localities (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  locality_id bigint,
  locality_shard text,
  locality_lat double precision,
  locality_lon double precision,
  search_origin_id bigint,
  search_origin_shard text,
  search_origin_label text,
  search_origin_lat double precision,
  search_origin_lon double precision,
  search_radius_miles smallint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_locality_pair CHECK (
    (locality_id IS NULL AND locality_shard IS NULL AND locality_lat IS NULL AND locality_lon IS NULL)
    OR (locality_id > 0 AND locality_shard ~ '^[a-z0-9_]{2}$'
        AND locality_lat BETWEEN -90 AND 90 AND locality_lon BETWEEN -180 AND 180)
  ),
  CONSTRAINT member_origin_pair CHECK (
    (search_origin_id IS NULL AND search_origin_shard IS NULL AND search_origin_label IS NULL AND search_origin_lat IS NULL AND search_origin_lon IS NULL)
    OR (search_origin_id > 0 AND search_origin_shard ~ '^[a-z0-9_]{2}$'
        AND char_length(search_origin_label) BETWEEN 1 AND 100
        AND search_origin_lat BETWEEN -90 AND 90 AND search_origin_lon BETWEEN -180 AND 180)
  ),
  CONSTRAINT member_radius_choice CHECK (
    search_radius_miles IS NULL OR search_radius_miles IN (10, 25, 50, 100, 250)
  )
);
ALTER TABLE app_private.member_localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_localities FORCE ROW LEVEL SECURITY;
CREATE POLICY member_localities_owner_only
  ON app_private.member_localities
  FOR ALL TO ogcupid_member_api
  USING (user_id::text = NULLIF(current_setting('app.current_user_id', true), ''))
  WITH CHECK (user_id::text = NULLIF(current_setting('app.current_user_id', true), ''));
REVOKE ALL ON app_private.member_localities FROM PUBLIC;
REVOKE ALL ON app_private.member_localities FROM ogcupid_delete_api;
GRANT SELECT, INSERT, UPDATE ON app_private.member_localities TO ogcupid_member_api;
COMMENT ON TABLE app_private.member_localities IS
  'Opt-in canonical city centroid and private matching radius; GeoNames cities1000, CC BY 4.0. No precise address/GPS or public member search.';
