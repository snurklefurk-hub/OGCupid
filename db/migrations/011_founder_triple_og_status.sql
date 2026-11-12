-- 011: First 250 persistent OG Cupid profiles receive lifetime Triple OG Status.
-- On INSERT only; profile edits never consume an extra slot. Concurrency-safe,
-- with a monotonic counter so deleting an account never reopens a founder slot.
-- Only the narrowly scoped authenticated member API may read its own award
-- through the SECURITY DEFINER getter (no direct table access).
-- Personality award badge is a future UI marker; no billing/award UI is enabled.

CREATE TABLE IF NOT EXISTS app_private.founder_profile_slots (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  issued_count smallint NOT NULL DEFAULT 0 CHECK (issued_count BETWEEN 0 AND 250),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_private.founder_profile_slots (singleton_id,issued_count) VALUES (1,0) ON CONFLICT (singleton_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_private.founder_profile_awards (
  user_id uuid PRIMARY KEY REFERENCES app_private.member_profiles(user_id) ON DELETE CASCADE,
  founder_number smallint NOT NULL UNIQUE CHECK (founder_number BETWEEN 1 AND 250),
  entitlement_code text NOT NULL DEFAULT 'TRIPLE_OG_LIFETIME' CHECK (entitlement_code = 'TRIPLE_OG_LIFETIME'),
  og_status_multiplier smallint NOT NULL DEFAULT 3 CHECK (og_status_multiplier = 3),
  lifetime_og_status boolean NOT NULL DEFAULT true CHECK (lifetime_og_status),
  personality_award_badge_code text NOT NULL DEFAULT 'FOUNDER_PROFILE' CHECK (personality_award_badge_code = 'FOUNDER_PROFILE'),
  awarded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_private.founder_profile_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE app_private.founder_profile_awards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON app_private.founder_profile_slots FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

REVOKE ALL ON app_private.founder_profile_awards FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

CREATE OR REPLACE FUNCTION app_private.grant_founder_profile_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $founder$
DECLARE new_number smallint;
BEGIN
  UPDATE app_private.founder_profile_slots SET issued_count=issued_count+1, updated_at=now()
    WHERE singleton_id=1 AND issued_count < 250 RETURNING issued_count INTO new_number;
  IF new_number IS NOT NULL THEN
    INSERT INTO app_private.founder_profile_awards (user_id,founder_number)
      VALUES (NEW.user_id,new_number);
  END IF;
  RETURN NEW;
END;
$founder$;

REVOKE ALL ON FUNCTION app_private.grant_founder_profile_on_insert() FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api;

CREATE TRIGGER founder_status_first_250_profiles
AFTER INSERT ON app_private.member_profiles
FOR EACH ROW EXECUTE FUNCTION app_private.grant_founder_profile_on_insert();

CREATE OR REPLACE FUNCTION app_private.current_member_founder_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $founder$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'isFounderProfile',true,
      'founderNumber',founder_number,
      'entitlementCode',entitlement_code,
      'ogStatusMultiplier',og_status_multiplier,
      'lifetimeOgStatus',lifetime_og_status,
      'personalityAwardBadgeCode',personality_award_badge_code,
      'awardedAt',awarded_at
    ) FROM app_private.founder_profile_awards
    WHERE user_id = NULLIF(current_setting('app.current_user_id',true),'')::uuid),
    jsonb_build_object(
      'isFounderProfile',false,
      'founderNumber',null,
      'entitlementCode',null,
      'ogStatusMultiplier',null,
      'lifetimeOgStatus',false,
      'personalityAwardBadgeCode',null,
      'awardedAt',null
    )
  )
$founder$;

REVOKE ALL ON FUNCTION app_private.current_member_founder_status() FROM PUBLIC, ogcupid_delete_api;

GRANT EXECUTE ON FUNCTION app_private.current_member_founder_status() TO ogcupid_member_api;

COMMENT ON TABLE app_private.founder_profile_awards IS 'Irrevocable lifetime triple OG entitlement for the first 250 successfully inserted member profiles. Founder badge token reserved for future personality-awards UI. Private system-managed rows; no public grants.';

COMMENT ON TABLE app_private.founder_profile_slots IS 'Monotonic 0..250 founder profile allocation counter. Deleted profiles never free an issued ordinal. Atomic updates prevent duplicate issuance.';

COMMENT ON FUNCTION app_private.current_member_founder_status() IS 'Owner-only entitlement lookup keyed to transaction-local verified member ID. No caller-provided user ID.';
