import {nextCompatibilityQuestion} from "../../member-app/question-flow.js";

// The legacy and React member experiences share the exact same published bank,
// selection algorithm and persisted Neon answer schema. Never use localStorage.
export const IMPORTANCE = Object.freeze([
  {value:1, label:"A little"},
  {value:10, label:"Somewhat"},
  {value:50, label:"Very"},
  {value:250, label:"Dealbreaker"}
]);
const VALID_IMPORTANCE = new Set([0,1,10,50,250]);
const QUESTION_ID = /^vault-[0-9]{1,25}$/;
const OPTION_ID = /^option-[0-9]{1,20}$/;

export function publishedQuestions(bank) {
  if (!Array.isArray(bank?.questions)) throw new Error("Published question catalog is unavailable.");
  const seen = new Set();
  return bank.questions.filter(q => {
    if (!q || !QUESTION_ID.test(q.id) || seen.has(q.id) ||
        ![10,50,100,250].includes(q.tier) ||
        typeof q.prompt !== "string" || !q.prompt.trim() ||
        !Array.isArray(q.options) || !Array.isArray(q.optionIds) ||
        !q.options.length || q.options.length !== q.optionIds.length ||
        q.options.length > 20 || q.hidden || q.dismissed || q.dogshit ||
        !q.optionIds.every(id => OPTION_ID.test(id)) ||
        new Set(q.optionIds).size !== q.optionIds.length) return false;
    seen.add(q.id);
    return true;
  });
}

// Only the current owner's records belong in this view. Reject malformed API
// containers and omit individual stale records no longer in the published bank.
export function savedAnswerMap(data, questions) {
  if (!Array.isArray(data?.answers)) throw new Error("Invalid saved question response.");
  const byQuestion = new Map(questions.map(q => [q.id,q]));
  const answers = new Map();
  for (const record of data.answers) {
    const q = byQuestion.get(record?.questionId);
    if (!q || !q.optionIds.includes(record.optionId) ||
        !Array.isArray(record.acceptableOptions) ||
        !record.acceptableOptions.every(id => q.optionIds.includes(id)) ||
        !VALID_IMPORTANCE.has(record.importance) ||
        typeof record.isPrivate !== "boolean" ||
        typeof record.note !== "string") continue;
    answers.set(q.id, {
      questionId:q.id, optionId:record.optionId,
      acceptableOptions:[...new Set(record.acceptableOptions)],
      importance:record.importance, isPrivate:record.isPrivate,
      note:record.note.slice(0,400)
    });
  }
  return answers;
}

export function answerDraft(question, saved = null) {
  if (saved) return {
    optionId:saved.optionId, acceptableOptions:[...saved.acceptableOptions],
    importance:saved.importance, isPrivate:saved.isPrivate, note:saved.note
  };
  return {optionId:"",acceptableOptions:[],importance:1,isPrivate:false,note:""};
}

export function answerPayload(question,draft) {
  if (!question || !QUESTION_ID.test(question.id) ||
      !question.optionIds.includes(draft?.optionId) ||
      !Array.isArray(draft.acceptableOptions) || !draft.acceptableOptions.length ||
      !draft.acceptableOptions.every(id => question.optionIds.includes(id)) ||
      !VALID_IMPORTANCE.has(draft.importance) ||
      typeof draft.isPrivate !== "boolean" || typeof draft.note !== "string" ||
      draft.note.length > 400) {
    throw new Error("Choose your answer, at least one acceptable answer and an importance level.");
  }
  return {
    questionId:question.id, optionId:draft.optionId,
    acceptableOptions:[...new Set(draft.acceptableOptions)],
    importance:draft.importance, isPrivate:draft.isPrivate,
    note:draft.note.trim()
  };
}

export function pickUnanswered(questions, saved, skipped = new Set(), random = Math.random) {
  const filtered = questions.filter(q => !skipped.has(q.id));
  // A series of skips must not make uncompleted questions disappear forever.
  return nextCompatibilityQuestion(filtered,saved.keys(),random) ||
    nextCompatibilityQuestion(questions,saved.keys(),random);
}
