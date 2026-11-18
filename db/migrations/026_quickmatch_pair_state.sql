-- 026: Quickmatch pair state, preserving owner-approved November 18 semantics.
-- Additive columns preserve early staging votes and their original timestamps.
-- All cross-member state transitions run in SECURITY DEFINER helpers with
-- actor identity verified against the transaction-local JWT subject.
ALTER TABLE app_private.member_quickmatch_decisions
  ADD COLUMN IF NOT EXISTS dislike_count smallint NOT NULL DEFAULT 0
    CHECK (dislike_count BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS first_disliked_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_penalty_points smallint NOT NULL DEFAULT 0
    CHECK (match_penalty_points IN (0, 5, 10)),
  ADD COLUMN IF NOT EXISTS friend_penalty_points smallint NOT NULL DEFAULT 0
    CHECK (friend_penalty_points IN (0, 5));

-- Existing basic-staging dislikes, if any, become first-strike history.
UPDATE app_private.member_quickmatch_decisions
SET dislike_count=1, first_disliked_at=updated_at, match_penalty_points=5
WHERE decision='dislike' AND dislike_count=0;

-- Null represents an outgoing Like canceled by the other member's Dislike.
-- It is NOT a Dislike by the person whose Like was canceled.
ALTER TABLE app_private.member_quickmatch_decisions
  ALTER COLUMN decision DROP NOT NULL;

-- The member role can still SELECT only its own rows via RLS. Cross-user
-- pair mutations are forbidden except through the identity-checked helpers.
REVOKE INSERT, UPDATE ON app_private.member_quickmatch_decisions FROM ogcupid_member_api;
DROP POLICY IF EXISTS quickmatch_owner_insert ON app_private.member_quickmatch_decisions;
DROP POLICY IF EXISTS quickmatch_owner_update ON app_private.member_quickmatch_decisions;
-- Keep FORCE ROW LEVEL SECURITY in place for the decision table: the
-- SECURITY DEFINER owner has BYPASSRLS on Neon and can process pair transitions
-- without globally weakening the table's original authenticated-owner RLS.
ALTER TABLE app_private.member_quickmatch_decisions FORCE ROW LEVEL SECURITY;

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
  SELECT coalesce(sum(dislike_count),0)::integer,min(first_disliked_at)
    INTO strikes,first_at
  FROM app_private.member_quickmatch_decisions
  WHERE (user_id=viewer AND target_user_id=target)
     OR (user_id=target AND target_user_id=viewer);
  RETURN strikes<2 AND (strikes=0 OR
    (first_at IS NOT NULL AND now()>=first_at+interval '30 days'));
END;
$q$;

CREATE OR REPLACE FUNCTION app_private.quickmatch_can_show(viewer uuid, target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $q$
  SELECT app_private.quickmatch_pair_permitted(viewer,target)
    AND NOT EXISTS (
      SELECT 1 FROM app_private.member_quickmatch_decisions
      WHERE user_id=viewer AND target_user_id=target AND decision='like'
    );
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

-- Incoming likes are intentionally revealed only to their own recipient.
-- Other people's Dislikes and preference details are never returned.
CREATE OR REPLACE FUNCTION app_private.quickmatch_incoming_likes(viewer uuid)
RETURNS TABLE(target_user_id uuid,liked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $q$
  SELECT d.user_id,d.updated_at
  FROM app_private.member_quickmatch_decisions d
  WHERE viewer::text=nullif(current_setting('app.current_user_id',true),'')
    AND d.target_user_id=viewer AND d.decision='like'
    AND app_private.quickmatch_pair_permitted(viewer,d.user_id)
  ORDER BY d.updated_at DESC
  LIMIT 5000;
$q$;

REVOKE ALL ON FUNCTION app_private.quickmatch_pair_permitted(uuid,uuid)
  FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.quickmatch_can_show(uuid,uuid)
  FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.quickmatch_decide(uuid,uuid,text)
  FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.quickmatch_incoming_likes(uuid)
  FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.quickmatch_pair_permitted(uuid,uuid)
  TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.quickmatch_can_show(uuid,uuid)
  TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.quickmatch_decide(uuid,uuid,text)
  TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.quickmatch_incoming_likes(uuid)
  TO ogcupid_member_api;

COMMENT ON FUNCTION app_private.quickmatch_decide(uuid,uuid,text) IS
  'JWT-subject-scoped pair state: first dislike 30-day bilateral cooldown, second pair dislike permanent, actor-only penalties, bilateral Like cancellation.';
