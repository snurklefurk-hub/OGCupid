-- 027: Protected OG Cupid administrator review API and moderation audit.
-- All reads/writes occur through SECURITY DEFINER RPCs after JWT identity
-- is established by the member Function and SET LOCAL app.current_user_id.
-- Ordinary members retain no SELECT on reports, private conversation data,
-- Neon Auth users, or the audit table. No automatic punishment on report creation.
ALTER TABLE app_private.member_message_reports
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','under_review','resolved'));
ALTER TABLE app_private.member_message_reports
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE app_private.member_message_reports
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS app_private.member_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES app_private.member_message_reports(id) ON DELETE SET NULL,
  subject_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'start_review','dismiss','warn','suspend_24h','suspend_7d',
    'suspend_30d','ban','reinstate'
  )),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_actions_subject_recent
  ON app_private.member_moderation_actions(subject_id, created_at DESC);
REVOKE ALL ON app_private.member_moderation_actions
  FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;
ALTER TABLE app_private.member_moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_moderation_actions FORCE ROW LEVEL SECURITY;

-- Auth-role membership is looked up afresh on every call, never inferred
-- from a client-side flag or a JWT's optional role claim.
CREATE OR REPLACE FUNCTION app_private.admin_is_authorized()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM neon_auth."user" u
    WHERE u.id = nullif(current_setting('app.current_user_id', true),'')::uuid
      AND u.role = 'admin'
      AND u."emailVerified" = true
      AND (coalesce(u.banned,false) = false
        OR (u."banExpires" IS NOT NULL AND u."banExpires" <= now()))
  );
$$;

CREATE OR REPLACE FUNCTION app_private.admin_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $$
BEGIN
  IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'accounts', (SELECT count(*) FROM neon_auth."user"),
    'profiles', (SELECT count(*) FROM app_private.member_profiles),
    'onboarded', (SELECT count(*) FROM app_private.member_onboarding WHERE explored_at IS NOT NULL),
    'photos', (SELECT count(*) FROM app_private.member_photos),
    'messages', (SELECT count(*) FROM app_private.member_messages),
    'openReports', (SELECT count(*) FROM app_private.member_message_reports WHERE review_status <> 'resolved'),
    'suspended', (SELECT count(*) FROM neon_auth."user" WHERE banned = true AND "banExpires" > now()),
    'permanentlyBanned', (SELECT count(*) FROM neon_auth."user" WHERE banned = true AND "banExpires" IS NULL),
    'recentActions', (SELECT coalesce(jsonb_agg(
      jsonb_build_object('action',a.action,'reason',a.reason,'createdAt',a.created_at,
        'subjectId',a.subject_id,'moderatorId',a.moderator_id)
      ORDER BY a.created_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM app_private.member_moderation_actions ORDER BY created_at DESC LIMIT 15) a)
  );
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_members(p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $$
DECLARE q text := left(btrim(coalesce(p_search,'')),80); result jsonb;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',u.id,'name',u.name,'email',u.email,'role',coalesce(u.role,'user'),
    'verified',u."emailVerified",'createdAt',u."createdAt",
    'profile',p.display_name,'slug',r.slug,
    'onboarded',o.explored_at IS NOT NULL,
    'banned',coalesce(u.banned,false),
    'banReason',u."banReason",'banExpires',u."banExpires")
    ORDER BY u."createdAt" DESC,u.id),'[]'::jsonb)
  INTO result
  FROM (SELECT * FROM neon_auth."user" a
        WHERE q='' OR position(lower(q) IN lower(a.email)) > 0
          OR position(lower(q) IN lower(a.name)) > 0
        ORDER BY a."createdAt" DESC LIMIT 100) u
  LEFT JOIN app_private.member_profiles p ON p.user_id=u.id
  LEFT JOIN app_private.member_profile_routes r ON r.user_id=u.id
  LEFT JOIN app_private.member_onboarding o ON o.user_id=u.id;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_reports()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'reason',r.reason,'createdAt',r.created_at,'status',r.review_status,
    'reportedId',m.sender_id,'reportedName',sender.name,
    'reporterId',r.reporter_id,'reporterName',reporter.name,
    'messageId',m.id,'messageTime',m.created_at,
    'reviewedAt',r.reviewed_at)
    ORDER BY r.created_at DESC),'[]'::jsonb)
  INTO result
  FROM (SELECT * FROM app_private.member_message_reports ORDER BY created_at DESC LIMIT 100) r
  JOIN app_private.member_messages m ON m.id=r.message_id
  JOIN neon_auth."user" sender ON sender.id=m.sender_id
  JOIN neon_auth."user" reporter ON reporter.id=r.reporter_id;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_report_evidence(p_report uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $$
DECLARE target RECORD; evidence jsonb;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  SELECT r.id,r.reporter_id,r.reason,r.review_status,r.created_at,
    m.id AS message_id,m.sender_id,m.recipient_id,m.created_at AS message_time
  INTO target
  FROM app_private.member_message_reports r
  JOIN app_private.member_messages m ON m.id=r.message_id
  WHERE r.id=p_report;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',msg.id,'senderId',msg.sender_id,'body',msg.body,
    'createdAt',msg.created_at,'reported',msg.id=target.message_id)
    ORDER BY msg.created_at,msg.id),'[]'::jsonb)
  INTO evidence
  FROM (
    SELECT id,sender_id,body,created_at
    FROM app_private.member_messages
    WHERE (sender_id=target.sender_id AND recipient_id=target.recipient_id)
       OR (sender_id=target.recipient_id AND recipient_id=target.sender_id)
    ORDER BY abs(extract(epoch FROM (created_at-target.message_time))),id
    LIMIT 40
  ) msg;
  RETURN jsonb_build_object('id',target.id,'reason',target.reason,
    'status',target.review_status,'createdAt',target.created_at,
    'reporterId',target.reporter_id,'reportedId',target.sender_id,
    'messages',evidence);
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_review_report(
 p_report uuid,p_action text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id',true),'')::uuid;
  subject uuid; subject_role text; final_status text; expires timestamptz;
  clean_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('start_review','dismiss','warn','suspend_24h','suspend_7d','suspend_30d','ban')
    OR length(clean_reason) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Invalid moderation action' USING ERRCODE = '22023';
  END IF;
  SELECT m.sender_id INTO subject
  FROM app_private.member_message_reports r
  JOIN app_private.member_messages m ON m.id=r.message_id
  WHERE r.id=p_report FOR UPDATE OF r;
  IF subject IS NULL THEN RAISE EXCEPTION 'Report not found' USING ERRCODE = '22023'; END IF;
  SELECT role INTO subject_role FROM neon_auth."user" WHERE id=subject FOR UPDATE;
  IF subject=actor OR subject_role='admin' THEN
    RAISE EXCEPTION 'Administrators cannot moderate themselves or other administrators' USING ERRCODE = '42501';
  END IF;
  IF (SELECT review_status FROM app_private.member_message_reports WHERE id=p_report)='resolved' THEN
    RAISE EXCEPTION 'Report already resolved' USING ERRCODE = '22023';
  END IF;
  final_status := CASE WHEN p_action='start_review' THEN 'under_review' ELSE 'resolved' END;
  expires := CASE p_action
    WHEN 'suspend_24h' THEN now()+interval '24 hours'
    WHEN 'suspend_7d' THEN now()+interval '7 days'
    WHEN 'suspend_30d' THEN now()+interval '30 days' ELSE NULL END;
  IF p_action LIKE 'suspend_%' OR p_action='ban' THEN
    UPDATE neon_auth."user" SET banned=true,
      "banReason"=clean_reason,"banExpires"=expires,"updatedAt"=now()
    WHERE id=subject;
  END IF;
  UPDATE app_private.member_message_reports
  SET review_status=final_status,reviewed_by=actor,reviewed_at=now()
  WHERE id=p_report;
  INSERT INTO app_private.member_moderation_actions
    (report_id,subject_id,moderator_id,action,reason,expires_at)
  VALUES(p_report,subject,actor,p_action,clean_reason,expires);
  RETURN jsonb_build_object('status',final_status,'action',p_action,'subjectId',subject);
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_reinstate_member(p_subject uuid,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id',true),'')::uuid;
  clean_reason text := btrim(coalesce(p_reason,'')); matched boolean;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE = '42501'; END IF;
  IF p_subject=actor OR length(clean_reason) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Invalid reinstatement' USING ERRCODE = '22023';
  END IF;
  UPDATE neon_auth."user" SET banned=false,"banReason"=NULL,
    "banExpires"=NULL,"updatedAt"=now()
  WHERE id=p_subject AND coalesce(role,'user')<>'admin'
    AND banned=true AND "banExpires" IS NULL;
  matched := FOUND;
  IF matched THEN
    INSERT INTO app_private.member_moderation_actions
      (subject_id,moderator_id,action,reason)
    VALUES(p_subject,actor,'reinstate',clean_reason);
  END IF;
  RETURN matched;
END; $$;

-- Apply the restriction to already-issued member JWTs and every discovery
-- surface consuming these shared predicates, not just the admin UI.
CREATE OR REPLACE FUNCTION app_private.current_member_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
  SELECT EXISTS (SELECT 1 FROM neon_auth."user" u
    WHERE u.id=nullif(current_setting('app.current_user_id',true),'')::uuid
      AND (coalesce(u.banned,false)=false
        OR (u."banExpires" IS NOT NULL AND u."banExpires"<=now())));
$$;
CREATE OR REPLACE FUNCTION app_private.is_discoverable_member(member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private
AS $$
  SELECT app_private.current_member_is_active()
    AND EXISTS (
      SELECT 1 FROM app_private.member_onboarding o
      JOIN app_private.member_profiles p ON p.user_id=o.user_id
      JOIN app_private.member_profile_routes r ON r.user_id=o.user_id
      JOIN neon_auth."user" u ON u.id=o.user_id
      WHERE o.user_id=member_id AND o.explored_at IS NOT NULL
        AND nullif(btrim(p.display_name),'') IS NOT NULL
        AND (coalesce(u.banned,false)=false
          OR (u."banExpires" IS NOT NULL AND u."banExpires"<=now()))
    );
$$;

REVOKE ALL ON FUNCTION app_private.admin_is_authorized() FROM PUBLIC, ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_dashboard() FROM PUBLIC, ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_members(text) FROM PUBLIC, ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_reports() FROM PUBLIC, ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_report_evidence(uuid) FROM PUBLIC, ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_review_report(uuid,text,text) FROM PUBLIC, ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_reinstate_member(uuid,text) FROM PUBLIC, ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_is_authorized() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_dashboard() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_members(text) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_reports() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_report_evidence(uuid) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_review_report(uuid,text,text) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.admin_reinstate_member(uuid,text) TO ogcupid_member_api;