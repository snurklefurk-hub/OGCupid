/**
 * OG Cupid T+E question-only compatibility (v1).
 *
 * Provisional Match% only. This deliberately does NOT claim the later
 * approved Match/Friend/Enemy + traits + Persona model has been implemented.
 *
 * Only mutually answered *public* questions participate. Each direction asks
 * whether the other person's chosen answer is in one's accepted choices,
 * weighted by how important the question is to that person (0,1,10,50,250).
 * The geometric mean prevents a strong one-sided fit hiding a weak reverse fit.
 *
 * A small overlap shrinks the result toward 50%, so one coincidental shared
 * question cannot produce an overconfident 100% match. Zero overlap or
 * all-irrelevant questions = unscored (null), never a manufactured percentage.
 * No answer content or preferences leave the API.
 */
export const SCORING_VERSION = "question-reciprocal-v1";
const VALID_IMPORTANCE = new Set([0,1,10,50,250]);
const ANCHOR_QUESTIONS = 5;

function validAnswer(answer) {
  return answer && typeof answer.question_id === "string" &&
    typeof answer.option_id === "string" &&
    Array.isArray(answer.acceptable_options) &&
    VALID_IMPORTANCE.has(Number(answer.importance)) &&
    answer.is_private === false;
}

export function scoreQuestionCompatibility(viewerAnswers, otherAnswers) {
  const viewer = new Map(
    (Array.isArray(viewerAnswers) ? viewerAnswers : [])
      .filter(validAnswer).map(answer => [answer.question_id, answer])
  );
  const other = new Map(
    (Array.isArray(otherAnswers) ? otherAnswers : [])
      .filter(validAnswer).map(answer => [answer.question_id, answer])
  );

  let commonQuestions = 0, viewerTotal = 0, viewerAccepted = 0;
  let otherTotal = 0, otherAccepted = 0;
  for (const [id, ours] of viewer) {
    const theirs = other.get(id);
    if (!theirs) continue;
    commonQuestions++;
    const viewerWeight = Number(ours.importance);
    const otherWeight = Number(theirs.importance);
    viewerTotal += viewerWeight;
    otherTotal += otherWeight;
    if (ours.acceptable_options.includes(theirs.option_id)) viewerAccepted += viewerWeight;
    if (theirs.acceptable_options.includes(ours.option_id)) otherAccepted += otherWeight;
  }

  const confidence = commonQuestions >= 25 ? "high" : commonQuestions >= 10 ? "medium" : "low";
  if (commonQuestions === 0 || viewerTotal === 0 || otherTotal === 0) {
    return {
      matchPercent: null, commonQuestions,
      confidence: "insufficient", scoringVersion: SCORING_VERSION
    };
  }
  const viewerFit = viewerAccepted / viewerTotal;
  const otherFit = otherAccepted / otherTotal;
  const reciprocal = Math.sqrt(viewerFit * otherFit);
  const overlapFactor = commonQuestions / (commonQuestions + ANCHOR_QUESTIONS);
  const adjusted = 0.5 + (reciprocal - 0.5) * overlapFactor;
  const matchPercent = Math.max(0, Math.min(100, Math.round(adjusted * 100)));
  return { matchPercent, commonQuestions, confidence, scoringVersion: SCORING_VERSION };
}

export function rankDiscoverableProfiles(profiles, viewerAnswers, answersByUser) {
  return (Array.isArray(profiles) ? profiles : []).map(profile => {
    const score = scoreQuestionCompatibility(
      viewerAnswers,
      answersByUser.get(String(profile.user_id)) || []
    );
    return {
      userId: String(profile.user_id), slug: String(profile.slug),
      displayName: String(profile.display_name), ...score
    };
  }).sort((left, right) => {
    if (left.matchPercent === null && right.matchPercent !== null) return 1;
    if (right.matchPercent === null && left.matchPercent !== null) return -1;
    if (left.matchPercent !== right.matchPercent) return (right.matchPercent ?? 0) - (left.matchPercent ?? 0);
    if (left.commonQuestions !== right.commonQuestions) return right.commonQuestions - left.commonQuestions;
    return left.slug.localeCompare(right.slug);
  });
}
