-- Broaden controlled identity choices and hold signup preferences privately
-- until the existing age, locality and profile onboarding steps are completed.
ALTER TABLE app_private.member_onboarding
  DROP CONSTRAINT member_onboarding_gender_check,
  DROP CONSTRAINT member_onboarding_orientation_check,
  ADD CONSTRAINT member_onboarding_gender_check CHECK (gender IN ('Man','Woman','Transman','Transwoman','Intersex','Enby','Something else')),
  ADD CONSTRAINT member_onboarding_orientation_check CHECK (orientation IN ('Straight','Gay','Bi','Ace','Something else')),
  ADD COLUMN signup_interested_in text[],
  ADD COLUMN signup_intentions text[],
  ADD CONSTRAINT member_onboarding_signup_genders_check CHECK (signup_interested_in IS NULL OR (cardinality(signup_interested_in)<=7 AND array_position(signup_interested_in,NULL) IS NULL AND signup_interested_in <@ ARRAY['Man','Woman','Transman','Transwoman','Intersex','Enby','Something else']::text[])),
  ADD CONSTRAINT member_onboarding_signup_intentions_check CHECK (signup_intentions IS NULL OR (cardinality(signup_intentions)<=4 AND array_position(signup_intentions,NULL) IS NULL AND signup_intentions <@ ARRAY['long-term dating','short-term dating','new friends','casual sex']::text[]));
