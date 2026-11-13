// Presentation-only helpers for the classic match-question screen.
// The tier serving algorithm and persisted answer values live elsewhere.
export const QUESTION_TIER_NAMES = Object.freeze({
  first10: "FIRST 10",
  next50: "NEXT 50",
  next100: "NEXT 100",
  next250: "NEXT 250",
  other: "MORE QUESTIONS",
});

export function displayQuestionProgress(answeredCount, questionCount, focusTier, editing = false) {
  const total = Number.isSafeInteger(questionCount) && questionCount > 0 ? questionCount : 1;
  const answered = Number.isSafeInteger(answeredCount)
    ? Math.max(0, Math.min(answeredCount, total))
    : 0;
  return {
    answered,
    total,
    label: answered + " of " + total + " questions answered",
    tier: editing ? "REVIEWING AN ANSWER" : QUESTION_TIER_NAMES[focusTier] || "MORE QUESTIONS",
  };
}

export function acceptedAnswerSuggestion(answerId, alreadyAccepted) {
  // When entering the first answer, preselect that same answer as acceptable.
  // Never overwrite any existing acceptable choices or review-state selections.
  if (typeof answerId !== "string" || !answerId ||
      !Array.isArray(alreadyAccepted) || alreadyAccepted.length) return null;
  return answerId;
}
