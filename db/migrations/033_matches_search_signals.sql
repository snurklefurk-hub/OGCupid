-- 033: Search-only coarse distance and genuine recent member activity.
-- Never expose raw locality coordinates or identify who viewed a profile.
CREATE TABLE IF NOT EXISTS app_private.member_activity (
  user_id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.member_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_activity FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.member_activity FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

-- One deliberate, authenticated heartbeat; avoid a write on every chat poll.
CREATE OR REPLACE FUNCTION app_private.touch_member_activity()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private
AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.current_user_id',true),'')::uuid;
  seen timestamptz;
BEGIN
  IF actor IS NULL OR NOT app_private.current_member_is_active() THEN
    RAISE EXCEPTION 'Member account unavailable';
  END IF;
  INSERT INTO app_private.member_activity(user_id,last_seen_at)
  VALUES(actor,now())
  ON CONFLICT(user_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at
    WHERE app_private.member_activity.last_seen_at < now() - interval '60 seconds';
  SELECT last_seen_at INTO seen FROM app_private.member_activity WHERE user_id=actor;
  RETURN seen;
END;
$$;
REVOKE ALL ON FUNCTION app_private.touch_member_activity() FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.touch_member_activity() TO ogcupid_member_api;

-- Returns only integer miles between *saved, validated city centroids* and
-- a genuine last activity timestamp. Exact coordinates stay private.
-- The actor comes from transaction-local verified JWT identity, never from input.
CREATE OR REPLACE FUNCTION app_private.discovery_member_signals(target_user uuid)
RETURNS TABLE(distance_miles integer,last_seen_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private
AS $$
  SELECT CASE
    WHEN viewer.locality_id IS NOT NULL AND peer.locality_id IS NOT NULL
      AND coalesce(viewer.search_origin_lat,viewer.locality_lat) IS NOT NULL
      AND coalesce(viewer.search_origin_lon,viewer.locality_lon) IS NOT NULL
    THEN round(app_private.locality_distance_miles(
      coalesce(viewer.search_origin_lat,viewer.locality_lat),
      coalesce(viewer.search_origin_lon,viewer.locality_lon),
      peer.locality_lat,peer.locality_lon))::integer
    ELSE NULL END AS distance_miles,
    activity.last_seen_at
  FROM app_private.member_profiles p
  LEFT JOIN app_private.member_localities viewer
    ON viewer.user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  LEFT JOIN app_private.member_localities peer
    ON peer.user_id=p.user_id
  LEFT JOIN app_private.member_activity activity
    ON activity.user_id=p.user_id
  WHERE p.user_id=target_user
    AND target_user<>NULLIF(current_setting('app.current_user_id',true),'')::uuid
    AND app_private.current_member_is_active()
    AND app_private.is_discoverable_member(target_user)
    AND NOT app_private.member_pair_blocked(
      NULLIF(current_setting('app.current_user_id',true),'')::uuid,target_user);
$$;
REVOKE ALL ON FUNCTION app_private.discovery_member_signals(uuid)
  FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.discovery_member_signals(uuid)
  TO ogcupid_member_api;
COMMENT ON FUNCTION app_private.discovery_member_signals(uuid) IS
 'Authenticated peer-only rounded locality distance and genuinely recorded activity; never raw coordinates.';
