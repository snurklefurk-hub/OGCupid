/**
 * Signed-in account section navigation. The welcome checklist is intentionally
 * independent of Account Settings and can always be revisited by members.
 *
 * Signup uses a dedicated destination rather than reusing whichever section
 * happens to be open during verification.
 */
export const SIGNUP_WELCOME_HASH = "#welcome-title";

export function memberSectionFromHash(hash) {
  if (hash === SIGNUP_WELCOME_HASH) return "welcome";
  if (hash === "#profile-title" || hash === "#preview-title") return "profile";
  if (hash === "#photos-title") return "photos";
  if (hash === "#question-title") return "questions";
  if (hash === "#settings-title") return "settings";
  return "home";
}

export function welcomeQuestionStatus(answeredCount) {
  const count = Number.isSafeInteger(answeredCount) && answeredCount > 0 ? answeredCount : 0;
  return count === 1 ? "1 match question answered" : count + " match questions answered";
}
