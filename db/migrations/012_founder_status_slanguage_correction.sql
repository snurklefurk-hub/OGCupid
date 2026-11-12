-- 012: "Triple OG" is founder slang, NOT a multiplier or premium tier.
-- Correct the previous founder entitlement model without changing the
-- first-250 allocation trigger, lifetime grant, or founder badge marker.
-- Effective entitlement is regular OG Status for life.
-- Original 011 is retained as migration history; this fixes it in-place.

ALTER TABLE app_private.founder_profile_awards
  DROP CONSTRAINT founder_profile_awards_entitlement_code_check;

ALTER TABLE app_private.founder_profile_awards
  ALTER COLUMN entitlement_code SET DEFAULT 'OG_STATUS_LIFETIME';

UPDATE app_private.founder_profile_awards
  SET entitlement_code = 'OG_STATUS_LIFETIME'
  WHERE entitlement_code = 'TRIPLE_OG_LIFETIME';

ALTER TABLE app_private.founder_profile_awards
  ADD CONSTRAINT founder_profile_awards_entitlement_code_check
  CHECK (entitlement_code = 'OG_STATUS_LIFETIME');

-- There is no numerical multiplier. The awards table was empty before
-- this correction, so no member record or value is lost.
ALTER TABLE app_private.founder_profile_awards
  DROP COLUMN og_status_multiplier;

CREATE OR REPLACE FUNCTION app_private.current_member_founder_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app_private AS $founder$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'isFounderProfile',true,
      'founderNumber',founder_number,
      'entitlementCode',entitlement_code,
      'lifetimeOgStatus',lifetime_og_status,
      'personalityAwardBadgeCode',personality_award_badge_code,
      'awardedAt',awarded_at
    ) FROM app_private.founder_profile_awards
    WHERE user_id = NULLIF(current_setting('app.current_user_id',true),'')::uuid),
    jsonb_build_object(
      'isFounderProfile',false,
      'founderNumber',null,
      'entitlementCode',null,
      'lifetimeOgStatus',false,
      'personalityAwardBadgeCode',null,
      'awardedAt',null
    )
  )
$founder$;

COMMENT ON TABLE app_private.founder_profile_awards IS
  'First 250 saved profiles receive ordinary OG Status for life and a Founder Profile badge token. "Triple OG" is founder slang, not a multiplier or separate tier. Owner-only getter; no public table access.';
