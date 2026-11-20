-- 032: Favorites, Quiver-compatible sitewide blocks, and profile reports.
-- An existing first-time messaging block remains a first strike; lifting it
-- consumes the only unblock. Blocking the same account again is permanent.
-- Counts of inbound favorites/blocks reveal numbers ONLY, never identities.
ALTER TABLE app_private.member_message_blocks ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE app_private.member_message_blocks ADD COLUMN IF NOT EXISTS block_count smallint NOT NULL DEFAULT 1;
ALTER TABLE app_private.member_message_blocks ADD CONSTRAINT member_block_count_limit CHECK (block_count BETWEEN 1 AND 2);
REVOKE INSERT, DELETE ON app_private.member_message_blocks FROM ogcupid_member_api;
DROP POLICY IF EXISTS message_block_owner_insert ON app_private.member_message_blocks;
DROP POLICY IF EXISTS message_block_owner_delete ON app_private.member_message_blocks;

CREATE OR REPLACE FUNCTION app_private.member_pair_blocked(a uuid,b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
  SELECT CASE WHEN a IS NULL OR b IS NULL THEN true
    WHEN a=b THEN false
    ELSE EXISTS (SELECT 1 FROM app_private.member_message_blocks m
      WHERE m.active AND ((m.blocker_id=a AND m.blocked_id=b)
        OR (m.blocker_id=b AND m.blocked_id=a))) END;
$$;
REVOKE ALL ON FUNCTION app_private.member_pair_blocked(uuid,uuid) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.member_pair_blocked(uuid,uuid) TO ogcupid_member_api;

CREATE OR REPLACE FUNCTION app_private.set_site_block(target uuid, block boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE actor uuid:=nullif(current_setting('app.current_user_id',true),'')::uuid;
  old_active boolean; strikes smallint; result_count smallint;
BEGIN
  IF actor IS NULL OR target IS NULL OR actor=target OR block IS NULL
    OR NOT app_private.current_member_is_active()
  THEN RAISE EXCEPTION 'Invalid block request' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.member_profile_routes WHERE user_id=target)
  THEN RAISE EXCEPTION 'Member unavailable' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||target::text,3199));
  SELECT active,block_count INTO old_active,strikes
    FROM app_private.member_message_blocks
    WHERE blocker_id=actor AND blocked_id=target FOR UPDATE;
  IF block THEN
    IF strikes IS NULL THEN
      INSERT INTO app_private.member_message_blocks(blocker_id,blocked_id,active,block_count)
        VALUES(actor,target,true,1);
      result_count:=1;
    ELSIF NOT old_active THEN
      UPDATE app_private.member_message_blocks
        SET active=true,block_count=least(2,strikes+1),created_at=now()
        WHERE blocker_id=actor AND blocked_id=target;
      result_count:=least(2,strikes+1);
    ELSE result_count:=strikes;
    END IF;
    RETURN jsonb_build_object('blocked',true,'permanent',result_count=2);
  END IF;
  IF strikes IS NULL OR NOT old_active
  THEN RETURN jsonb_build_object('blocked',false,'permanent',false); END IF;
  IF strikes>=2
  THEN RAISE EXCEPTION 'Permanent block cannot be lifted' USING ERRCODE='22023'; END IF;
  UPDATE app_private.member_message_blocks SET active=false
    WHERE blocker_id=actor AND blocked_id=target;
  RETURN jsonb_build_object('blocked',false,'permanent',false);
END; $$;
REVOKE ALL ON FUNCTION app_private.set_site_block(uuid,boolean) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.set_site_block(uuid,boolean) TO ogcupid_member_api;

-- Reuse the existing messaging predicate, with active-only blocks.
CREATE OR REPLACE FUNCTION app_private.can_message_member(peer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
  SELECT app_private.current_member_is_active()
    AND app_private.is_discoverable_member(nullif(current_setting('app.current_user_id',true),'')::uuid)
    AND app_private.is_discoverable_member(peer)
    AND peer <> nullif(current_setting('app.current_user_id',true),'')::uuid
    AND NOT app_private.member_pair_blocked(
      nullif(current_setting('app.current_user_id',true),'')::uuid,peer);
$$;

CREATE TABLE IF NOT EXISTS app_private.member_favorites (
  owner_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id,target_id),
  CONSTRAINT member_favorite_not_self CHECK(owner_id<>target_id)
);
REVOKE ALL ON app_private.member_favorites FROM PUBLIC,ogcupid_delete_api,ogcupid_member_api;
GRANT SELECT,INSERT,DELETE ON app_private.member_favorites TO ogcupid_member_api;
ALTER TABLE app_private.member_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_favorites FORCE ROW LEVEL SECURITY;
CREATE POLICY member_favorites_owner_select ON app_private.member_favorites
  FOR SELECT TO ogcupid_member_api USING
  (owner_id::text=nullif(current_setting('app.current_user_id',true),''));
CREATE POLICY member_favorites_owner_insert ON app_private.member_favorites
  FOR INSERT TO ogcupid_member_api WITH CHECK
  (owner_id::text=nullif(current_setting('app.current_user_id',true),'')
    AND NOT app_private.member_pair_blocked(owner_id,target_id)
    AND app_private.is_discoverable_member(target_id));
CREATE POLICY member_favorites_owner_delete ON app_private.member_favorites
  FOR DELETE TO ogcupid_member_api USING
  (owner_id::text=nullif(current_setting('app.current_user_id',true),''));

CREATE OR REPLACE FUNCTION app_private.member_connections()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE actor uuid:=nullif(current_setting('app.current_user_id',true),'')::uuid;
  favorite_ids jsonb; favorite_members jsonb; quiver_members jsonb; my_blocks jsonb;
  inbound_favorites integer; inbound_blocks integer;
BEGIN
  IF actor IS NULL OR NOT app_private.current_member_is_active()
  THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(f.target_id ORDER BY f.created_at DESC),'[]'::jsonb)
    INTO favorite_ids FROM app_private.member_favorites f
    WHERE f.owner_id=actor AND app_private.is_discoverable_member(f.target_id)
      AND NOT app_private.member_pair_blocked(actor,f.target_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'userId',p.user_id,'slug',r.slug,'displayName',left(p.display_name,60),
      'age',p.age,'cityRegion',p.city_region) ORDER BY f.created_at DESC),'[]'::jsonb)
    INTO favorite_members
    FROM app_private.member_favorites f
    JOIN app_private.member_profiles p ON p.user_id=f.target_id
    JOIN app_private.member_profile_routes r ON r.user_id=p.user_id
    WHERE f.owner_id=actor AND app_private.is_discoverable_member(f.target_id)
      AND NOT app_private.member_pair_blocked(actor,f.target_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'userId',p.user_id,'slug',r.slug,'displayName',left(p.display_name,60),
      'age',p.age,'cityRegion',p.city_region) ORDER BY mine.updated_at DESC),'[]'::jsonb)
    INTO quiver_members
    FROM app_private.member_quickmatch_decisions mine
    JOIN app_private.member_quickmatch_decisions theirs
      ON theirs.user_id=mine.target_user_id AND theirs.target_user_id=actor AND theirs.decision='like'
    JOIN app_private.member_profiles p ON p.user_id=mine.target_user_id
    JOIN app_private.member_profile_routes r ON r.user_id=p.user_id
    WHERE mine.user_id=actor AND mine.decision='like'
      AND app_private.quickmatch_pair_permitted(actor,p.user_id)
      AND NOT app_private.member_pair_blocked(actor,p.user_id);
  SELECT count(*)::integer INTO inbound_favorites
    FROM app_private.member_favorites f
    WHERE f.target_id=actor AND app_private.is_discoverable_member(f.owner_id)
      AND NOT app_private.member_pair_blocked(actor,f.owner_id);
  SELECT count(*)::integer INTO inbound_blocks
    FROM app_private.member_message_blocks b WHERE b.blocked_id=actor AND b.active;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'userId',b.blocked_id,'displayName',left(coalesce(p.display_name,'Member'),60),
      'permanent',b.block_count>=2) ORDER BY b.created_at DESC),'[]'::jsonb)
    INTO my_blocks
    FROM app_private.member_message_blocks b
    LEFT JOIN app_private.member_profiles p ON p.user_id=b.blocked_id
    WHERE b.blocker_id=actor AND b.active;
  RETURN jsonb_build_object('favorites',favorite_ids,'quiver',quiver_members,'favoriteMembers',favorite_members,
    'favoritedByCount',inbound_favorites,'blockedByCount',inbound_blocks,
    'blocks',my_blocks);
END; $$;
REVOKE ALL ON FUNCTION app_private.member_connections() FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.member_connections() TO ogcupid_member_api;

CREATE TABLE IF NOT EXISTS app_private.member_profile_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(reason IN('spam','harassment','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reporter_id,target_id)
);
REVOKE ALL ON app_private.member_profile_reports FROM PUBLIC,ogcupid_delete_api,ogcupid_member_api;
ALTER TABLE app_private.member_profile_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_profile_reports FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION app_private.report_member_profile(target uuid,why text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE actor uuid:=nullif(current_setting('app.current_user_id',true),'')::uuid;
BEGIN
  IF actor IS NULL OR target IS NULL OR target=actor OR why NOT IN ('spam','harassment','other')
      OR NOT app_private.current_member_is_active()
      OR NOT EXISTS(SELECT 1 FROM app_private.member_profile_routes WHERE user_id=target)
  THEN RAISE EXCEPTION 'Invalid report' USING ERRCODE='22023'; END IF;
  INSERT INTO app_private.member_profile_reports(reporter_id,target_id,reason)
    VALUES(actor,target,why)
    ON CONFLICT(reporter_id,target_id) DO UPDATE SET reason=EXCLUDED.reason,created_at=now();
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION app_private.report_member_profile(uuid,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.report_member_profile(uuid,text) TO ogcupid_member_api;

-- Blocked peers disappear from Quickmatch and shared Community chat feeds.
CREATE OR REPLACE FUNCTION app_private.quickmatch_pair_permitted(viewer uuid, target uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $q$
DECLARE strikes integer; first_at timestamptz;
BEGIN
  IF viewer IS NULL OR target IS NULL OR viewer=target OR
     viewer::text IS DISTINCT FROM nullif(current_setting('app.current_user_id',true),'')
  THEN RETURN false; END IF;
  IF NOT app_private.is_discoverable_member(viewer)
     OR NOT app_private.is_discoverable_member(target)
  THEN RETURN false; END IF;
  IF app_private.member_pair_blocked(viewer,target) THEN RETURN false; END IF;
  SELECT coalesce(sum(dislike_count),0)::integer,min(first_disliked_at)
    INTO strikes,first_at
  FROM app_private.member_quickmatch_decisions
  WHERE (user_id=viewer AND target_user_id=target)
     OR (user_id=target AND target_user_id=viewer);
  RETURN strikes<2 AND (strikes=0 OR
    (first_at IS NOT NULL AND now()>=first_at+interval '30 days'));
END;
$q$;


CREATE OR REPLACE FUNCTION app_private.quickmatch_decide(actor uuid, target uuid, choice text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $q$
DECLARE strikes integer; first_at timestamptz;
BEGIN
  IF actor IS NULL OR target IS NULL OR actor=target
     OR actor::text IS DISTINCT FROM nullif(current_setting('app.current_user_id',true),'')
     OR choice IS NULL OR choice NOT IN ('like','dislike')
  THEN RETURN false; END IF;
  IF NOT app_private.is_discoverable_member(actor)
     OR NOT app_private.is_discoverable_member(target)
  THEN RETURN false; END IF;
  IF app_private.member_pair_blocked(actor,target) THEN RETURN false; END IF;

  -- Serialize competing actions in either direction on the same pair.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    least(actor::text,target::text)||':'||greatest(actor::text,target::text),22));
  SELECT coalesce(sum(dislike_count),0)::integer,min(first_disliked_at)
    INTO strikes,first_at
  FROM app_private.member_quickmatch_decisions
  WHERE (user_id=actor AND target_user_id=target)
     OR (user_id=target AND target_user_id=actor);
  IF strikes>=2 OR (strikes=1 AND
      (first_at IS NULL OR now()<first_at+interval '30 days'))
  THEN RETURN false; END IF;

  IF choice='like' THEN
    INSERT INTO app_private.member_quickmatch_decisions
      (user_id,target_user_id,decision,dislike_count,match_penalty_points,friend_penalty_points)
    VALUES(actor,target,'like',0,0,0)
    ON CONFLICT(user_id,target_user_id) DO UPDATE SET
      decision='like',match_penalty_points=0,friend_penalty_points=0,updated_at=now();
    RETURN true;
  END IF;

  -- Any Dislike cancels BOTH existing likes; it does not invent a Dislike
  -- on the other person's behalf. Preserve each person's dislike history.
  UPDATE app_private.member_quickmatch_decisions SET decision=NULL,updated_at=now()
  WHERE ((user_id=actor AND target_user_id=target)
      OR (user_id=target AND target_user_id=actor))
    AND decision='like';

  INSERT INTO app_private.member_quickmatch_decisions AS d
    (user_id,target_user_id,decision,dislike_count,first_disliked_at,
     match_penalty_points,friend_penalty_points)
  VALUES(actor,target,'dislike',1,now(),5,0)
  ON CONFLICT(user_id,target_user_id) DO UPDATE SET
    decision='dislike',
    dislike_count=d.dislike_count+1,
    first_disliked_at=coalesce(d.first_disliked_at,now()),
    match_penalty_points=5*(d.dislike_count+1),
    friend_penalty_points=CASE WHEN d.dislike_count+1>=2 THEN 5 ELSE 0 END,
    updated_at=now();
  RETURN true;
END;
$q$;


CREATE OR REPLACE FUNCTION app_private.community_feed(p_after bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app_private.current_member_is_active() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
  END IF;
  IF p_after IS NOT NULL AND p_after < 0 THEN
    RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',msg.id,'senderId',msg.sender_id,'name',msg.display_name,
    'slug',msg.slug,'body',msg.body,'createdAt',msg.created_at
  ) ORDER BY msg.id ASC),'[]'::jsonb) INTO result
  FROM (
    SELECT m.id,m.sender_id,m.body,m.created_at,
      left(coalesce(nullif(btrim(p.display_name),''),nullif(btrim(u.name),''),'Member'),60) AS display_name,
      CASE WHEN o.explored_at IS NOT NULL THEN r.slug ELSE NULL END AS slug
    FROM app_private.community_messages m
    JOIN neon_auth."user" u ON u.id=m.sender_id
    LEFT JOIN app_private.member_profiles p ON p.user_id=m.sender_id
    LEFT JOIN app_private.member_onboarding o ON o.user_id=m.sender_id
    LEFT JOIN app_private.member_profile_routes r ON r.user_id=m.sender_id
    WHERE m.hidden_at IS NULL
      AND NOT app_private.member_pair_blocked(nullif(current_setting('app.current_user_id',true),'')::uuid,m.sender_id)
      AND (p_after IS NULL OR m.id>p_after)
    ORDER BY CASE WHEN p_after IS NULL THEN -m.id ELSE m.id END
    LIMIT 100
  ) msg;
  RETURN result;
END; $$;


COMMENT ON TABLE app_private.member_profile_reports IS 'Private member-submitted profile reports; administrator review only.';
