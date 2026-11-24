-- The owner explicitly authorized recurring deletion of exactly test@test.com.
-- No email-verification bypass, no general account deletion authority.
-- UUID-only outbox persists until private media deletion succeeds; no photos,
-- profile content, passwords, tokens, or email addresses are stored here.
CREATE TABLE app_private.disposable_test_photo_cleanup (
  user_id uuid PRIMARY KEY,
  queued_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.disposable_test_photo_cleanup FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;
ALTER TABLE app_private.disposable_test_photo_cleanup ENABLE ROW LEVEL SECURITY;
-- Only the narrowly scoped SECURITY DEFINER routines below can access it.

CREATE FUNCTION app_private.purge_disposable_test_account(p_cutoff timestamptz)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $fn$
DECLARE test_id uuid;
BEGIN
  IF p_cutoff IS NULL OR p_cutoff > now() OR p_cutoff < now()-interval '1 day' THEN
    RAISE EXCEPTION 'Invalid cleanup cutoff';
  END IF;
  -- A retry can never erase a replacement account created after this occurrence.
  PERFORM pg_advisory_xact_lock(721415,15);
  FOR test_id IN SELECT id FROM neon_auth."user"
    WHERE lower(email)='test@test.com' AND "createdAt"<=p_cutoff FOR UPDATE
  LOOP
    INSERT INTO app_private.disposable_test_photo_cleanup(user_id)
      VALUES(test_id) ON CONFLICT DO NOTHING;
    -- Legacy tables without cascading user FKs.
    DELETE FROM app_private.site_feedback WHERE user_id=test_id;
    DELETE FROM app_private.promo_card_events WHERE actor_id=test_id;
    -- Existing owner and relationship FKs cascade profiles, sessions, accounts,
    -- questions, messages, favorites, blocks, photos, reports and onboarding.
    DELETE FROM neon_auth."user" WHERE id=test_id AND lower(email)='test@test.com';
    IF NOT FOUND THEN RAISE EXCEPTION 'Test account changed during cleanup'; END IF;
    DELETE FROM neon_auth.verification
      WHERE lower(identifier) IN ('test@test.com','email-verification:test@test.com','forget-password:test@test.com','password-reset:test@test.com','sign-in:test@test.com')
      OR identifier=test_id::text OR value=test_id::text;
  END LOOP;
  -- The deletion-history marker must not survive this special test identity.
  DELETE FROM app_private.previously_registered_emails WHERE lower(email)='test@test.com';
  RETURN QUERY SELECT q.user_id FROM app_private.disposable_test_photo_cleanup q ORDER BY q.queued_at;
END
$fn$;
REVOKE ALL ON FUNCTION app_private.purge_disposable_test_account(timestamptz) FROM PUBLIC,ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.purge_disposable_test_account(timestamptz) TO ogcupid_delete_api;

CREATE FUNCTION app_private.finish_disposable_test_photo_cleanup(p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $fn$
BEGIN
  -- Keep a short retry window for uploads in flight when the account expired.
  -- The next scheduled run sweeps the same private prefix again.
  DELETE FROM app_private.disposable_test_photo_cleanup
    WHERE user_id=p_user AND queued_at<=now()-interval '15 minutes'
      AND NOT EXISTS(SELECT 1 FROM neon_auth."user" WHERE id=p_user);
  RETURN FOUND;
END
$fn$;
REVOKE ALL ON FUNCTION app_private.finish_disposable_test_photo_cleanup(uuid) FROM PUBLIC,ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.finish_disposable_test_photo_cleanup(uuid) TO ogcupid_delete_api;

-- Preserve normal self-deletion behavior; test identity alone uses the retry
-- outbox rather than the permanent previously-registered-email marker.
CREATE OR REPLACE FUNCTION app_private.erase_current_member_after_reauth()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,app_private AS $fn$
DECLARE member_id uuid; member_email text;
BEGIN
  member_id := nullif(current_setting('app.current_user_id',true),'')::uuid;
  IF member_id IS NULL THEN RETURN false; END IF;
  SELECT email INTO member_email FROM neon_auth."user" WHERE id=member_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF lower(member_email)='test@test.com' THEN
    INSERT INTO app_private.disposable_test_photo_cleanup(user_id)
      VALUES(member_id) ON CONFLICT DO NOTHING;
    DELETE FROM app_private.site_feedback WHERE user_id=member_id;
    DELETE FROM app_private.promo_card_events WHERE actor_id=member_id;
    DELETE FROM app_private.previously_registered_emails WHERE lower(email)='test@test.com';
    DELETE FROM neon_auth.verification
      WHERE lower(identifier) IN ('test@test.com','email-verification:test@test.com','forget-password:test@test.com','password-reset:test@test.com','sign-in:test@test.com')
      OR identifier=member_id::text OR value=member_id::text;
  ELSE
    INSERT INTO app_private.previously_registered_emails(email,previously_registered)
      VALUES(member_email,true) ON CONFLICT(email) DO NOTHING;
  END IF;
  DELETE FROM neon_auth."user" WHERE id=member_id;
  RETURN FOUND;
END
$fn$;
REVOKE ALL ON FUNCTION app_private.erase_current_member_after_reauth() FROM PUBLIC,ogcupid_member_api;
GRANT EXECUTE ON FUNCTION app_private.erase_current_member_after_reauth() TO ogcupid_delete_api;
