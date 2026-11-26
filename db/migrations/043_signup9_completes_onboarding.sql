-- Signup9 is the last required signup step. Keep explored_at as the
-- server-owned completion flag consumed by the existing member access gates.
BEGIN;
CREATE OR REPLACE FUNCTION app_private.complete_signup9_onboarding()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO pg_catalog, app_private
AS $$
BEGIN
  IF NEW.signup9_completed_at IS NOT NULL AND NEW.explored_at IS NULL
     AND NEW.details_complete AND NEW.gender IS NOT NULL AND NEW.orientation IS NOT NULL
     AND NEW.birth_date BETWEEN (CURRENT_DATE - interval '120 years')::date AND (CURRENT_DATE - interval '18 years')::date
     AND NEW.locality_id IS NOT NULL AND NEW.locality_shard IS NOT NULL
     AND NEW.signup5_details IS NOT NULL AND NEW.signup6_details IS NOT NULL
     AND NEW.signup7_details IS NOT NULL AND NEW.signup8_details IS NOT NULL
     AND EXISTS (SELECT 1 FROM app_private.member_profiles p
                 WHERE p.user_id=NEW.user_id AND length(btrim(p.about_me))>=15)
     AND EXISTS (SELECT 1 FROM app_private.member_photos ph
                 WHERE ph.user_id=NEW.user_id AND ph.id=NEW.primary_self_photo_id AND ph.is_primary)
  THEN
    NEW.explored_at := NEW.signup9_completed_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER complete_signup9_onboarding
BEFORE UPDATE OF signup9_completed_at ON app_private.member_onboarding
FOR EACH ROW EXECUTE FUNCTION app_private.complete_signup9_onboarding();
-- Reconcile already confirmed signup9 accounts, without touching incomplete
-- accounts or changing existing members' completion dates.
UPDATE app_private.member_onboarding
SET signup9_completed_at=signup9_completed_at
WHERE signup9_completed_at IS NOT NULL AND explored_at IS NULL;
COMMIT;
