-- 023 — canonical ten-essay profile parity (Nov 18, 2026).
-- The approved About sequence includes three essays omitted by the old API:
-- first things noticed; thinking about; most private thing. The existing
-- message_me_if remains the tenth and continues to be shared live with
-- any future restricted Quickmatch detail view. No duplicate essay store.
-- Additive and repeatable; old clients may omit these fields on PUT.
ALTER TABLE app_private.member_profiles
  ADD COLUMN IF NOT EXISTS first_things text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS thinking_about text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS private_thing text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'app_private.member_profiles'::regclass
      AND conname = 'member_profiles_extra_essays_length_ck'
  ) THEN
    ALTER TABLE app_private.member_profiles
      ADD CONSTRAINT member_profiles_extra_essays_length_ck
      CHECK (
        char_length(first_things) <= 1500
        AND char_length(thinking_about) <= 1500
        AND char_length(private_thing) <= 1500
      );
  END IF;
END
$$;
