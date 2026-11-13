// Member-facing question progress. Editorial tiers remain private serving
// logic in question-flow.js and are intentionally absent from the UI.
export function displayQuestionProgress(answeredCount) {
  const answered = Number.isSafeInteger(answeredCount) ? Math.max(0, answeredCount) : 0;
  return {
    answered,
    label: answered === 1 ? "1 question answered" : answered + " questions answered",
  };
}

export function acceptedAnswerSuggestion(answerId, alreadyAccepted) {
  // When entering the first answer, preselect that same answer as acceptable.
  // Never overwrite any existing acceptable choices or review-state selections.
  if (typeof answerId !== "string" || !answerId ||
      !Array.isArray(alreadyAccepted) || alreadyAccepted.length) return null;
  return answerId;
}
