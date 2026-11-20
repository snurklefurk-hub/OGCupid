-- Admin content changes no longer require a written reason.
-- Preserve the action/actor/subject/detail/timestamp audit record and keep
-- moderation ban/report reasons separately mandatory and unchanged.
ALTER TABLE app_private.member_admin_content_edits
  ALTER COLUMN reason DROP NOT NULL;

CREATE OR REPLACE FUNCTION app_private.admin_record_content_edit(
  p_subject uuid,p_action text,p_detail text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE actor uuid := nullif(current_setting('app.current_user_id',true),'')::uuid;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_subject IS NULL OR NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=p_subject)
    OR char_length(coalesce(p_detail,'')) NOT BETWEEN 1 AND 120
    OR (p_reason IS NOT NULL AND
        char_length(btrim(p_reason)) NOT BETWEEN 8 AND 500) THEN
    RAISE EXCEPTION 'Invalid content edit' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.member_admin_content_edits
    (moderator_id,subject_id,action,detail,reason)
  VALUES(actor,p_subject,p_action,p_detail,CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END);
END; $$;
REVOKE ALL ON FUNCTION app_private.admin_record_content_edit(uuid,text,text,text)
  FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
