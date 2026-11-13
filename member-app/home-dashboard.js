/**
 * Pure view-state model for the signed-in homepage.
 *
 * The three initial homework milestones are a presentation rule, not an
 * account gate. Everything uses persisted profile, photo and answer data.
 * Editorial question tiers are private and never appear in member-facing UI.
 */
/**
 * A saved row by itself is not a usable starter profile.
 * These are deliberately light onboarding milestones, not API or discovery gates.
 * City, essays, and optional details can be added later.
 */
export function starterProfileReady(profile) {
  if (!profile?.updatedAt) return false;
  const age = Number(profile.age);
  const filled = value => typeof value === "string" && value.trim().length > 0;
  return filled(profile.displayName) &&
    Number.isInteger(age) && age >= 18 && age <= 120 &&
    (profile.gender === "man" || profile.gender === "woman") &&
    filled(profile.interestedIn) && filled(profile.relationshipGoal);
}

export function memberHomeState({
  profileSaved = false,
  photoCount = 0,
  answeredCount = 0,
} = {}) {
  const validPhotos = Number.isSafeInteger(photoCount) && photoCount > 0
    ? Math.min(photoCount, 5) : 0;
  const validAnswers = Number.isSafeInteger(answeredCount) && answeredCount > 0
    ? answeredCount : 0;
  const hasProfile = profileSaved === true;
  const hasPhoto = validPhotos >= 1;
  const hasAnswers = validAnswers >= 10;
  const completed = Number(hasProfile) + Number(hasPhoto) + Number(hasAnswers);
  return Object.freeze({
    hasProfile,
    hasPhoto,
    hasAnswers,
    photoCount: validPhotos,
    answeredCount: validAnswers,
    completed,
    available: 3,
    showRegularHome: completed === 3,
  });
}
