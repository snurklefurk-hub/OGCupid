-- 034: administrator-controlled visual design drafts and immutable published releases.
-- Apply to the intended Neon branch before deploying the corresponding member Function.
-- No direct table privileges are granted to the runtime member role.
CREATE TABLE IF NOT EXISTS app_private.ui_design_releases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document jsonb NOT NULL,
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_from bigint REFERENCES app_private.ui_design_releases(id)
);
CREATE TABLE IF NOT EXISTS app_private.ui_design_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  draft jsonb NOT NULL,
  draft_version bigint NOT NULL DEFAULT 0,
  published_id bigint REFERENCES app_private.ui_design_releases(id),
  modified_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_private.ui_design_state(singleton,draft)
VALUES (true,'{"version":2,"tokens":{},"areas":{},"pages":{},"texts":{}}'::jsonb)
ON CONFLICT (singleton) DO NOTHING;

REVOKE ALL ON app_private.ui_design_releases FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;
REVOKE ALL ON app_private.ui_design_state FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;
REVOKE ALL ON SEQUENCE app_private.ui_design_releases_id_seq FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

-- Deliberately public: only the approved, currently published JSON, never drafts
-- or unpublished history. The calling role still cannot query underlying tables.
CREATE OR REPLACE FUNCTION app_private.ui_design_public()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('revision',r.id,'document',r.document)
       FROM app_private.ui_design_state s
       JOIN app_private.ui_design_releases r ON r.id=s.published_id
      WHERE s.singleton),
    jsonb_build_object('revision',null,
      'document','{"version":2,"tokens":{},"areas":{},"pages":{},"texts":{}}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION app_private.ui_design_admin_state()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE result jsonb;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('draft',s.draft,'draftVersion',s.draft_version,
    'publishedRevision',s.published_id,'modifiedAt',s.modified_at,
    'history',COALESCE((SELECT jsonb_agg(to_jsonb(h))
      FROM (SELECT id AS "revision",created_at AS "publishedAt",
        author_id AS "authorId",restored_from AS "restoredFrom"
        FROM app_private.ui_design_releases ORDER BY id DESC LIMIT 25) h),'[]'::jsonb))
    INTO result FROM app_private.ui_design_state s WHERE s.singleton;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ui_design_save_draft(p_document jsonb,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE next_version bigint;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR
     p_document->>'version'<>'2' OR length(p_document::text)>120000 OR
     p_expected_version IS NULL OR p_expected_version<0 THEN
    RAISE EXCEPTION 'Invalid design document' USING ERRCODE='22023';
  END IF;
  UPDATE app_private.ui_design_state
     SET draft=p_document,draft_version=draft_version+1,modified_at=now()
   WHERE singleton=true AND draft_version=p_expected_version
   RETURNING draft_version INTO next_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft changed; reload before editing' USING ERRCODE='22023';
  END IF;
  RETURN app_private.ui_design_admin_state();
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ui_design_publish(p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE state_row app_private.ui_design_state%ROWTYPE; new_id bigint;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO state_row FROM app_private.ui_design_state WHERE singleton FOR UPDATE;
  IF p_expected_version IS NULL OR state_row.draft_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Draft changed; reload before publishing' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.ui_design_releases(document,author_id)
  VALUES (state_row.draft,nullif(current_setting('app.current_user_id',true),'')::uuid)
  RETURNING id INTO new_id;
  UPDATE app_private.ui_design_state SET published_id=new_id,modified_at=now()
  WHERE singleton;
  RETURN app_private.ui_design_admin_state();
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ui_design_rollback(p_release bigint,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $$
DECLARE state_row app_private.ui_design_state%ROWTYPE; restored jsonb; new_id bigint;
BEGIN
  IF NOT app_private.admin_is_authorized() THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO state_row FROM app_private.ui_design_state WHERE singleton FOR UPDATE;
  IF p_expected_version IS NULL OR state_row.draft_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Draft changed; reload before rolling back' USING ERRCODE='22023';
  END IF;
  SELECT document INTO restored FROM app_private.ui_design_releases WHERE id=p_release;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown release' USING ERRCODE='22023'; END IF;
  INSERT INTO app_private.ui_design_releases(document,author_id,restored_from)
  VALUES (restored,nullif(current_setting('app.current_user_id',true),'')::uuid,p_release)
  RETURNING id INTO new_id;
  UPDATE app_private.ui_design_state SET published_id=new_id,draft=restored,
    draft_version=draft_version+1,modified_at=now() WHERE singleton;
  RETURN app_private.ui_design_admin_state();
END;
$$;

REVOKE ALL ON FUNCTION app_private.ui_design_public() FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.ui_design_admin_state() FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.ui_design_save_draft(jsonb,bigint) FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.ui_design_publish(bigint) FROM PUBLIC,ogcupid_delete_api;
REVOKE ALL ON FUNCTION app_private.ui_design_rollback(bigint,bigint) FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.ui_design_public() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.ui_design_admin_state() TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.ui_design_save_draft(jsonb,bigint) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.ui_design_publish(bigint) TO ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.ui_design_rollback(bigint,bigint) TO ogcupid_member_api;
