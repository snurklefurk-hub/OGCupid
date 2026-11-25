-- Private drafts for new signup steps and independent weed/religion importance profile fields.
-- Existing profiles and previous answers are not rewritten.
ALTER TABLE app_private.member_onboarding
  ADD COLUMN signup5_details jsonb,
  ADD COLUMN signup6_details jsonb,
  ADD COLUMN signup7_details jsonb,
  ADD CONSTRAINT member_onboarding_signup5_object CHECK (signup5_details IS NULL OR jsonb_typeof(signup5_details)='object'),
  ADD CONSTRAINT member_onboarding_signup6_object CHECK (signup6_details IS NULL OR jsonb_typeof(signup6_details)='object'),
  ADD CONSTRAINT member_onboarding_signup7_object CHECK (signup7_details IS NULL OR jsonb_typeof(signup7_details)='object');
ALTER TABLE app_private.member_profiles
  ADD COLUMN weed text NOT NULL DEFAULT '',
  ADD COLUMN religion_importance text NOT NULL DEFAULT '',
  ADD CONSTRAINT member_profiles_weed_check CHECK (weed IN ('','Often','Sometimes','Rarely','Never','Trying to quit')),
  ADD CONSTRAINT member_profiles_religion_importance_check CHECK (religion_importance IN ('','but it doesn''t matter','and it''s kinda important','and it''s really important'));
