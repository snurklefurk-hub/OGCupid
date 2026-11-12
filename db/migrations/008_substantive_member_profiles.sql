-- 008: Substantive classic-OkCupid-inspired profile content.
-- Non-destructive additive columns on the already owner-RLS-protected
-- private member_profiles table. No public profile read endpoint is added.
-- Existing member profiles remain intact; new fields are blank/null.
-- Member photos/references and discoverability are deliberately out of scope.
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS age smallint;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS city_region text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS pronouns text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS orientation text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS relationship_goal text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS looking_for text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS work text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS height text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS kids text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS pets text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS smoking text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS drinking text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS diet text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS languages text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS life_direction text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS good_at text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS favorites text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS six_things text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS friday_night text;
ALTER TABLE app_private.member_profiles ADD COLUMN IF NOT EXISTS message_me_if text;
ALTER TABLE app_private.member_profiles
  ADD CONSTRAINT member_profiles_age_18_plus CHECK (age IS NULL OR age BETWEEN 18 AND 120);

COMMENT ON COLUMN app_private.member_profiles.city_region IS 'Broad self-reported city/region only; never precise GPS or residence.';
COMMENT ON COLUMN app_private.member_profiles.looking_for IS 'Freeform self-description; no discoverability until future consent-controlled release.';
