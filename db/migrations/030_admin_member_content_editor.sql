-- 030: Narrow, audited administrator editing for saved member content.
-- No profile owner bypass is granted to the normal member API role.
-- The existing verified JWT is propagated into app.current_user_id;
-- the live Neon Auth admin role is checked on every RPC.
CREATE TABLE IF NOT EXISTS app_private.member_admin_content_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN (
    'profile_field','profile_age_range','answer_save','answer_delete',
    'photo_add','photo_replace','photo_delete','photo_primary')),
  detail text NOT NULL CHECK(char_length(detail) BETWEEN 1 AND 120),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 8 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_content_edits_recent
  ON app_private.member_admin_content_edits(created_at DESC);
REVOKE ALL ON app_private.member_admin_content_edits
  FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
ALTER TABLE app_private.member_admin_content_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.member_admin_content_edits FORCE ROW LEVEL SECURITY;

-- This helper is callable only from other SECURITY DEFINER procedures.
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
    OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 8 AND 500
    OR char_length(coalesce(p_detail,'')) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid content edit' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.member_admin_content_edits
    (moderator_id,subject_id,action,detail,reason)
  VALUES(actor,p_subject,p_action,p_detail,btrim(p_reason));
END; $$;

-- Explicit allowlist: no Auth email, password, DOB, signup name, JWT,
-- account role, internal IDs, precise locality or private message data.
CREATE OR REPLACE FUNCTION app_private.admin_member_content(p_subject uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE profile_data jsonb; photo_data jsonb; answer_data jsonb;
  account_name text; account_role text;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  SELECT name,role INTO account_name,account_role
  FROM neon_auth."user" WHERE id=p_subject;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_object_agg(entry.key,entry.value) INTO profile_data
  FROM app_private.member_profiles p,
  LATERAL jsonb_each(to_jsonb(p)) AS entry
  WHERE p.user_id=p_subject AND entry.key = ANY(ARRAY[
    'display_name','age','city_region',
    'about_me','life_direction','good_at','first_things','favorites','six_things','thinking_about','friday_night','private_thing','message_me_if','gender','pronouns','orientation','interested_in','relationship_goal','looking_for','work','education','height','kids','pets','smoking','drinking','diet','languages','ethnicity','body_type','vaping','drugs','religion','income','status','relationship_type'
    ,'preferred_age_min','preferred_age_max'
  ]::text[]);
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('id',id,'width',width,'height',height,
      'sortOrder',sort_order,'isPrimary',is_primary,'createdAt',created_at)
    ORDER BY sort_order,created_at,id),'[]'::jsonb) INTO photo_data
  FROM app_private.member_photos WHERE user_id=p_subject;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('questionId',question_id,'optionId',option_id,
      'acceptableOptions',acceptable_options,'importance',importance,
      'isPrivate',is_private,'note',note,'updatedAt',updated_at)
    ORDER BY question_id),'[]'::jsonb) INTO answer_data
  FROM app_private.member_match_answers WHERE user_id=p_subject;
  RETURN jsonb_build_object('name',account_name,'role',account_role,
    'profile',profile_data,'photos',photo_data,'answers',answer_data);
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_edit_member_field(
  p_subject uuid,p_field text,p_value text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE limit_chars integer; value text := btrim(coalesce(p_value,''));
  changed boolean;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_field NOT IN ('about_me','life_direction','good_at','first_things','favorites','six_things','thinking_about','friday_night','private_thing','message_me_if','gender','pronouns','orientation','interested_in','relationship_goal','looking_for','work','education','height','kids','pets','smoking','drinking','diet','languages','ethnicity','body_type','vaping','drugs','religion','income','status','relationship_type') THEN
    RAISE EXCEPTION 'Field is not editable' USING ERRCODE='22023';
  END IF;
  limit_chars:=CASE p_field
    WHEN 'about_me' THEN 5000
    WHEN 'life_direction' THEN 2000
    WHEN 'favorites' THEN 2000
    WHEN 'good_at' THEN 1500
    WHEN 'first_things' THEN 1500
    WHEN 'six_things' THEN 1500
    WHEN 'thinking_about' THEN 1500
    WHEN 'friday_night' THEN 1500
    WHEN 'private_thing' THEN 1500
    WHEN 'message_me_if' THEN 1500
    ELSE 200 END;
  IF p_value IS NULL OR char_length(value)>limit_chars THEN
    RAISE EXCEPTION 'Invalid field value' USING ERRCODE='22023';
  END IF;
  PERFORM app_private.admin_record_content_edit(
    p_subject,'profile_field',p_field,p_reason);
  -- The identifier is never taken from raw input without an allowlist check.
  EXECUTE format(
    'UPDATE app_private.member_profiles SET %I=$2,updated_at=now() WHERE user_id=$1',
    p_field) USING p_subject,value;
  GET DIAGNOSTICS limit_chars=ROW_COUNT;
  IF limit_chars=0 THEN
    RAISE EXCEPTION 'Saved profile not found' USING ERRCODE='22023';
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_edit_member_age_range(
  p_subject uuid,p_min integer,p_max integer,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF NOT ((p_min IS NULL AND p_max IS NULL) OR
    (p_min BETWEEN 18 AND 99 AND p_max BETWEEN p_min AND 99)) THEN
    RAISE EXCEPTION 'Invalid age preference' USING ERRCODE='22023';
  END IF;
  PERFORM app_private.admin_record_content_edit(
    p_subject,'profile_age_range','preferred_age_range',p_reason);
  UPDATE app_private.member_profiles
  SET preferred_age_min=p_min,preferred_age_max=p_max,updated_at=now()
  WHERE user_id=p_subject;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saved profile not found' USING ERRCODE='22023';
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_save_member_answer(
  p_subject uuid,p_question text,p_option text,p_accepted text[],
  p_importance integer,p_private boolean,p_note text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE valid_options text[];
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  SELECT option_ids INTO valid_options
  FROM app_private.published_match_questions WHERE question_id=p_question;
  IF p_question !~ '^vault-[0-9]{1,25}$'
    OR p_option IS NULL OR p_option <> ALL(coalesce(valid_options,'{}'::text[]))
    OR p_accepted IS NULL OR cardinality(p_accepted)>20
    OR EXISTS (SELECT 1 FROM unnest(p_accepted) x
      WHERE x IS NULL OR NOT(x=ANY(coalesce(valid_options,'{}'::text[]))))
    OR p_importance NOT IN (0,1,10,50,250)
    OR p_private IS NULL OR p_note IS NULL OR char_length(p_note)>400 THEN
    RAISE EXCEPTION 'Invalid answer' USING ERRCODE='22023';
  END IF;
  PERFORM app_private.admin_record_content_edit(
    p_subject,'answer_save',p_question,p_reason);
  INSERT INTO app_private.member_match_answers
    (user_id,question_id,option_id,acceptable_options,importance,is_private,note)
  VALUES(p_subject,p_question,p_option,p_accepted,p_importance,p_private,p_note)
  ON CONFLICT(user_id,question_id) DO UPDATE SET
    option_id=excluded.option_id,acceptable_options=excluded.acceptable_options,
    importance=excluded.importance,is_private=excluded.is_private,
    note=excluded.note,updated_at=now();
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_delete_member_answer(
  p_subject uuid,p_question text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_question !~ '^vault-[0-9]{1,25}$' THEN
    RAISE EXCEPTION 'Invalid question' USING ERRCODE='22023';
  END IF;
  DELETE FROM app_private.member_match_answers
  WHERE user_id=p_subject AND question_id=p_question;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM app_private.admin_record_content_edit(
    p_subject,'answer_delete',p_question,p_reason);
  RETURN true;
END; $$;

-- An authenticated admin must confirm object ownership via these RPCs
-- before reading/replacing bytes in private Neon Storage.
CREATE OR REPLACE FUNCTION app_private.admin_member_photo_key(
  p_subject uuid,p_photo uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE key text;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  SELECT object_key INTO key FROM app_private.member_photos
  WHERE user_id=p_subject AND id=p_photo;
  RETURN key;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_member_photo_preflight(
  p_subject uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  RETURN EXISTS(SELECT 1 FROM app_private.member_profiles WHERE user_id=p_subject)
    AND (SELECT count(*) FROM app_private.member_photos WHERE user_id=p_subject)<5;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_add_member_photo(
  p_subject uuid,p_photo uuid,p_bytes integer,p_width integer,p_height integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE count_photos integer; position integer; row_data record;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_bytes NOT BETWEEN 80 AND 2500000
    OR p_width NOT BETWEEN 240 AND 2000 OR p_height NOT BETWEEN 240 AND 2000 THEN
    RAISE EXCEPTION 'Invalid photo' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM app_private.member_profiles WHERE user_id=p_subject FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saved profile not found' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO count_photos FROM app_private.member_photos WHERE user_id=p_subject;
  IF count_photos>=5 THEN RAISE EXCEPTION 'Album full' USING ERRCODE='22023'; END IF;
  SELECT n INTO position FROM generate_series(1,5) n
  WHERE NOT EXISTS(SELECT 1 FROM app_private.member_photos
    WHERE user_id=p_subject AND sort_order=n) ORDER BY n LIMIT 1;
  PERFORM app_private.admin_record_content_edit(p_subject,'photo_add',p_photo::text,p_reason);
  INSERT INTO app_private.member_photos
    (id,user_id,object_key,photo_bytes,width,height,sort_order,is_primary)
  VALUES(p_photo,p_subject,'profile-photos/'||p_subject||'/'||p_photo||'.jpg',
    p_bytes,p_width,p_height,position,count_photos=0)
  RETURNING id,sort_order,is_primary INTO row_data;
  RETURN jsonb_build_object('id',row_data.id,'sortOrder',row_data.sort_order,
    'isPrimary',row_data.is_primary);
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_replace_member_photo(
  p_subject uuid,p_photo uuid,p_bytes integer,p_width integer,p_height integer,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_bytes NOT BETWEEN 80 AND 2500000
    OR p_width NOT BETWEEN 240 AND 2000 OR p_height NOT BETWEEN 240 AND 2000 THEN
    RAISE EXCEPTION 'Invalid photo' USING ERRCODE='22023';
  END IF;
  UPDATE app_private.member_photos SET
    photo_bytes=p_bytes,width=p_width,height=p_height
  WHERE user_id=p_subject AND id=p_photo;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM app_private.admin_record_content_edit(
    p_subject,'photo_replace',p_photo::text,p_reason);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_primary_member_photo(
  p_subject uuid,p_photo uuid,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM app_private.member_profiles WHERE user_id=p_subject FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM app_private.member_photos
    WHERE user_id=p_subject AND id=p_photo) THEN RETURN false; END IF;
  UPDATE app_private.member_photos SET is_primary=false
  WHERE user_id=p_subject AND is_primary=true;
  UPDATE app_private.member_photos SET is_primary=true
  WHERE user_id=p_subject AND id=p_photo;
  PERFORM app_private.admin_record_content_edit(
    p_subject,'photo_primary',p_photo::text,p_reason);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION app_private.admin_delete_member_photo(
  p_subject uuid,p_photo uuid,p_reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE key text; old_primary boolean; replacement uuid;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM app_private.member_profiles WHERE user_id=p_subject FOR UPDATE;
  SELECT object_key,is_primary INTO key,old_primary
  FROM app_private.member_photos
  WHERE user_id=p_subject AND id=p_photo FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE app_private.member_onboarding SET primary_self_photo_id=NULL
  WHERE user_id=p_subject AND primary_self_photo_id=p_photo;
  DELETE FROM app_private.member_photos WHERE user_id=p_subject AND id=p_photo;
  IF old_primary THEN
    SELECT id INTO replacement FROM app_private.member_photos
    WHERE user_id=p_subject ORDER BY sort_order,created_at,id LIMIT 1;
    IF replacement IS NOT NULL THEN
      UPDATE app_private.member_photos SET is_primary=true WHERE id=replacement;
    END IF;
  END IF;
  PERFORM app_private.admin_record_content_edit(
    p_subject,'photo_delete',p_photo::text,p_reason);
  RETURN key;
END; $$;

-- No direct table-write permissions are granted, including to admin JWTs.
REVOKE ALL ON FUNCTION app_private.admin_record_content_edit(uuid,text,text,text)
  FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.admin_member_content(uuid) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_member_content(uuid) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_edit_member_field(uuid,text,text,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_edit_member_field(uuid,text,text,text) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_edit_member_age_range(uuid,integer,integer,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_edit_member_age_range(uuid,integer,integer,text) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_save_member_answer(uuid,text,text,text[],integer,boolean,text,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_save_member_answer(uuid,text,text,text[],integer,boolean,text,text) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_delete_member_answer(uuid,text,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_delete_member_answer(uuid,text,text) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_member_photo_key(uuid,uuid) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_member_photo_key(uuid,uuid) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_member_photo_preflight(uuid) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_member_photo_preflight(uuid) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_add_member_photo(uuid,uuid,integer,integer,integer,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_add_member_photo(uuid,uuid,integer,integer,integer,text) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_replace_member_photo(uuid,uuid,integer,integer,integer,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_replace_member_photo(uuid,uuid,integer,integer,integer,text) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_primary_member_photo(uuid,uuid,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_primary_member_photo(uuid,uuid,text) TO ogcupid_member_api;
REVOKE ALL ON FUNCTION app_private.admin_delete_member_photo(uuid,uuid,text) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.admin_delete_member_photo(uuid,uuid,text) TO ogcupid_member_api;
