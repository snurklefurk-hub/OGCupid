-- Persona Test V2 has 40 questions (37 scored plus 3 neutral historical prompts).
-- Preserve older 28-answer rows without requiring anyone to retake the quiz.
-- Run before publishing the V2 result-saving client/backend.
ALTER TABLE app_private.member_onboarding
  DROP CONSTRAINT member_onboarding_persona_answers_check;
ALTER TABLE app_private.member_onboarding
  ADD CONSTRAINT member_onboarding_persona_answers_check
  CHECK (persona_answers IS NULL OR cardinality(persona_answers) IN (28, 40));
