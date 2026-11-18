-- 025: Member-visible answered questions. Own private answers stay owner-only
-- under existing FORCE RLS. This narrowly scoped function projects only the
-- three approved public fields and never private answers/acceptable choices.
CREATE OR REPLACE FUNCTION app_private.visible_member_public_answers(target_member uuid)
RETURNS TABLE(question_id text, option_id text, note text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,app_private
AS $$
  SELECT a.question_id,a.option_id,a.note
  FROM app_private.member_match_answers a
  WHERE a.user_id=target_member AND a.is_private=false
    AND app_private.current_member_is_active()
    AND app_private.is_discoverable_member(target_member)
  ORDER BY a.question_id
  LIMIT 410;
$$;
REVOKE ALL ON FUNCTION app_private.visible_member_public_answers(uuid)
 FROM PUBLIC,ogcupid_delete_api;
GRANT EXECUTE ON FUNCTION app_private.visible_member_public_answers(uuid)
 TO ogcupid_member_api;
COMMENT ON FUNCTION app_private.visible_member_public_answers(uuid) IS
  'Authenticated member-visible public question answer and explanation only. No private answer, scoring weights or accepted-answer choices.';
