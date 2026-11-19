-- 028: One shared, signed-in-only OG Cupid community chatroom.
-- Separate from private DMs. A signed-in account may read/post before onboarding.
-- No public/table access, no anonymous access, no automated moderation.
-- Reported messages are kept as evidence and hide only after human review.

CREATE TABLE IF NOT EXISTS app_private.community_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500 AND btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at timestamptz,
  hidden_by uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
  hidden_reason text
);
CREATE INDEX IF NOT EXISTS community_messages_sender_recent
  ON app_private.community_messages(sender_id,created_at DESC);
REVOKE ALL ON app_private.community_messages FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
ALTER TABLE app_private.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.community_messages FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app_private.community_message_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id bigint NOT NULL REFERENCES app_private.community_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('harassment','spam','sexual','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','resolved')),
  reviewed_by uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  UNIQUE(reporter_id,message_id)
);
CREATE INDEX IF NOT EXISTS community_reports_pending_idx
  ON app_private.community_message_reports(review_status,created_at DESC);
REVOKE ALL ON app_private.community_message_reports FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
ALTER TABLE app_private.community_message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.community_message_reports FORCE ROW LEVEL SECURITY;

-- Chat is publicly readable WITHIN the authenticated community only.
-- A restricted member-role caller cannot SELECT the underlying tables.
-- The function returns only user-facing display names and optional public slug.
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
    WHERE m.hidden_at IS NULL AND (p_after IS NULL OR m.id>p_after)
    ORDER BY CASE WHEN p_after IS NULL THEN -m.id ELSE m.id END
    LIMIT 100
  ) msg;
  RETURN result;
END; $$;

-- The server owns the sender identity. Serialize sends so parallel requests
-- cannot bypass throttling. Enter-to-send: single line, <=500 characters.
CREATE OR REPLACE FUNCTION app_private.community_send(p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id',true),'')::uuid;
  cleaned text; too_fast boolean; minute_count int; hour_count int;
  saved_id bigint;
BEGIN
  IF actor IS NULL OR NOT app_private.current_member_is_active() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
  END IF;
  cleaned := btrim(regexp_replace(coalesce(p_body,''),'[[:cntrl:]]+',' ','g'));
  IF length(cleaned) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Message must be 1 to 500 characters' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,6181));
  SELECT coalesce(bool_or(created_at > now()-interval '2 seconds'),false),
         count(*) FILTER (WHERE created_at > now()-interval '1 minute')::int,
         count(*)::int
    INTO too_fast,minute_count,hour_count
    FROM app_private.community_messages
    WHERE sender_id=actor AND created_at>now()-interval '1 hour';
  IF too_fast OR minute_count>=12 OR hour_count>=180 THEN
    RAISE EXCEPTION 'Slow down before sending another message' USING ERRCODE='P0001';
  END IF;
  INSERT INTO app_private.community_messages(sender_id,body)
    VALUES(actor,cleaned) RETURNING id INTO saved_id;
  RETURN jsonb_build_object('sent',true,'id',saved_id);
END; $$;

CREATE OR REPLACE FUNCTION app_private.community_report(p_message bigint,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id',true),'')::uuid;
  author uuid;
BEGIN
  IF actor IS NULL OR NOT app_private.current_member_is_active() THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE='42501';
  END IF;
  IF p_reason NOT IN ('harassment','spam','sexual','other') THEN
    RAISE EXCEPTION 'Invalid reason' USING ERRCODE='22023';
  END IF;
  SELECT sender_id INTO author FROM app_private.community_messages
    WHERE id=p_message AND hidden_at IS NULL;
  IF author IS NULL OR author=actor THEN
    RAISE EXCEPTION 'Message unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.community_message_reports(message_id,reporter_id,reason)
  VALUES(p_message,actor,p_reason)
  ON CONFLICT (reporter_id,message_id) DO NOTHING;
  RETURN true;
END; $$;

-- Admin reports are not exposed to members or embedded in community feed.
CREATE OR REPLACE FUNCTION app_private.admin_community_reports()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'messageId',q.message_id,'reason',q.reason,
    'body',q.body,'authorId',q.sender_id,'authorName',q.author_name,
    'reporterId',q.reporter_id,'createdAt',q.created_at,
    'messageAt',q.message_at,'hidden',q.hidden_at IS NOT NULL
  ) ORDER BY q.created_at DESC),'[]'::jsonb) INTO result
  FROM (
    SELECT rep.id,rep.message_id,rep.reason,rep.reporter_id,rep.created_at,
      m.body,m.sender_id,m.created_at AS message_at,m.hidden_at,
      left(coalesce(nullif(btrim(p.display_name),''),nullif(btrim(author.name),''),'Member'),60) AS author_name
    FROM app_private.community_message_reports rep
    JOIN app_private.community_messages m ON m.id=rep.message_id
    JOIN neon_auth."user" author ON author.id=m.sender_id
    LEFT JOIN app_private.member_profiles p ON p.user_id=m.sender_id
    WHERE rep.review_status='pending'
    ORDER BY rep.created_at DESC LIMIT 100
  ) q;
  RETURN result;
END; $$;

-- Human-only moderation: dismiss a report or hide offending chat text.
-- Hide preserves evidence and records moderator/reason, not silent deletion.
CREATE OR REPLACE FUNCTION app_private.admin_community_moderate(
  p_report bigint,p_action text,p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id',true),'')::uuid;
  message_id bigint; author uuid; author_role text;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('hide','dismiss') OR
     length(btrim(coalesce(p_reason,''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Invalid moderation request' USING ERRCODE='22023';
  END IF;
  SELECT rep.message_id,m.sender_id INTO message_id,author
    FROM app_private.community_message_reports rep
    JOIN app_private.community_messages m ON m.id=rep.message_id
    WHERE rep.id=p_report AND rep.review_status='pending'
    FOR UPDATE OF rep,m;
  IF message_id IS NULL THEN
    RAISE EXCEPTION 'Report already reviewed or unavailable' USING ERRCODE='22023';
  END IF;
  SELECT role INTO author_role FROM neon_auth."user" WHERE id=author;
  IF actor=author OR author_role='admin' THEN
    RAISE EXCEPTION 'Cannot moderate administrators' USING ERRCODE='42501';
  END IF;
  IF p_action='hide' THEN
    UPDATE app_private.community_messages
      SET hidden_at=now(),hidden_by=actor,hidden_reason=btrim(p_reason)
      WHERE id=message_id;
    UPDATE app_private.community_message_reports
      SET review_status='resolved',reviewed_by=actor,reviewed_at=now()
      WHERE message_id=message_id AND review_status='pending';
  ELSE
    UPDATE app_private.community_message_reports
      SET review_status='resolved',reviewed_by=actor,reviewed_at=now()
      WHERE id=p_report;
  END IF;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION app_private.community_feed(bigint) FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.community_send(text) FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.community_report(bigint,text) FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_community_reports() FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_community_moderate(bigint,text,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.community_feed(bigint) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.community_send(text) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.community_report(bigint,text) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_community_reports() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_community_moderate(bigint,text,text) TO ogcupid_member_api;

COMMENT ON TABLE app_private.community_messages IS
  'Member-only single-room chat posts; original sender and reports retained for human review. Account deletion cascades.';
COMMENT ON TABLE app_private.community_message_reports IS
  'Private reports available only via administrator-only RPC; reporting does not auto-delete content.';
