-- Owner-private signup8 draft. Existing profiles remain unchanged.
ALTER TABLE app_private.member_onboarding ADD COLUMN signup8_details jsonb,
  ADD CONSTRAINT member_onboarding_signup8_object CHECK (signup8_details IS NULL OR jsonb_typeof(signup8_details)='object');
