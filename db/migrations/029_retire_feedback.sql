-- 029: Retire the sitewide beta feedback submission function.
-- Keep app_private.site_feedback and its historical submissions for
-- privacy-request handling. No account or chat data is changed.
REVOKE ALL ON FUNCTION app_private.submit_site_feedback(text,text)
  FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api;
DROP FUNCTION IF EXISTS app_private.submit_site_feedback(text,text);
COMMENT ON TABLE app_private.site_feedback IS
  'Historical pre-2026-11-19 beta feedback only. Submissions retired; Community chat is the active public discussion feature.';
