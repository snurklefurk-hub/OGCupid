// Server-side, reviewed projection of the 40-question Dating Persona Quiz V2.
// Source of question IDs, axes, answer-order and score weights:
// member-app/persona.html — test checks every row against that source.
// Do not trust a persona type supplied by the browser without recomputing it.
export const PERSONA_V2_RUBRIC = Object.freeze([
  { id: "statement-1", axis: 0, scores: [-2,-1,1,2] },
  { id: "scenario-1", axis: 0, scores: [2,1,-1,-2] },
  { id: "statement-2", axis: 1, scores: [-2,-1,1,2] },
  { id: "scenario-2", axis: 1, scores: [2,1,-1,-2] },
  { id: "statement-3", axis: 2, scores: [-2,-1,1,2] },
  { id: "scenario-3", axis: 2, scores: [2,1,-1,-2,0] },
  { id: "statement-4", axis: 3, scores: [-2,-1,1,2] },
  { id: "scenario-4", axis: 3, scores: [2,1,-1,-2] },
  { id: "statement-5", axis: 0, scores: [2,1,-1,-2] },
  { id: "historic-parents", axis: null, scores: [0,0,0] },
  { id: "statement-6", axis: 1, scores: [2,1,-1,-2] },
  { id: "scenario-5", axis: 0, scores: [2,1,-1,-2] },
  { id: "statement-7", axis: 2, scores: [2,1,-1,-2] },
  { id: "scenario-6", axis: 1, scores: [2,1,-1,-2] },
  { id: "statement-8", axis: 3, scores: [2,1,-1,-2] },
  { id: "scenario-7", axis: 2, scores: [2,1,-1,-2,0] },
  { id: "statement-9", axis: 0, scores: [-2,-1,1,2] },
  { id: "scenario-8", axis: 3, scores: [2,1,-1,-2,0] },
  { id: "statement-10", axis: 1, scores: [-2,-1,1,2] },
  { id: "historic-logic", axis: null, scores: [0,0,0,0] },
  { id: "statement-11", axis: 2, scores: [-2,-1,1,2] },
  { id: "scenario-9", axis: 0, scores: [2,1,-1,-2] },
  { id: "statement-12", axis: 3, scores: [-2,-1,1,2] },
  { id: "scenario-10", axis: 1, scores: [2,1,-1,-2] },
  { id: "statement-13", axis: 0, scores: [2,1,-1,-2] },
  { id: "scenario-11", axis: 2, scores: [2,1,-1,-2,0] },
  { id: "statement-14", axis: 1, scores: [2,1,-1,-2] },
  { id: "scenario-12", axis: 3, scores: [2,1,-1,-2,0] },
  { id: "statement-15", axis: 2, scores: [2,1,-1,-2] },
  { id: "historic-commitment", axis: 1, scores: [2,1,-1,-2,0] },
  { id: "statement-16", axis: 3, scores: [2,1,-1,-2] },
  { id: "scenario-13", axis: 0, scores: [2,1,-1,-2,0] },
  { id: "statement-17", axis: 0, scores: [-2,-1,1,2] },
  { id: "scenario-14", axis: 1, scores: [2,1,-1,-2] },
  { id: "statement-18", axis: 1, scores: [-2,-1,1,2] },
  { id: "scenario-15", axis: 2, scores: [2,1,-1,-2,0] },
  { id: "statement-19", axis: 2, scores: [-2,-1,1,2] },
  { id: "scenario-16", axis: 3, scores: [2,1,-1,-2,0] },
  { id: "statement-20", axis: 3, scores: [-2,-1,1,2] },
  { id: "historic-sacrifice", axis: null, scores: [0,0,0,0] },
]);

const TRAIT_CODES = [["D", "R"], ["G", "B"], ["L", "S"], ["D", "M"]];

export function scorePersonaV2(answers) {
  if (!Array.isArray(answers) || answers.length !== PERSONA_V2_RUBRIC.length) return null;
  const sum = [0, 0, 0, 0], majority = [0, 0, 0, 0], strongest = [0, 0, 0, 0];
  for (let i = 0; i < PERSONA_V2_RUBRIC.length; i++) {
    const question = PERSONA_V2_RUBRIC[i];
    const index = answers[i];
    if (!Number.isInteger(index) || index < 0 || index >= question.scores.length) return null;
    if (question.axis === null) continue; // Historical prompts have no scoring weight.
    const value = question.scores[index];
    sum[question.axis] += value;
    majority[question.axis] += Math.sign(value);
    if (Math.abs(value) > Math.abs(strongest[question.axis])) strongest[question.axis] = value;
  }
  return TRAIT_CODES.map((side, i) =>
    side[(sum[i] || majority[i] || strongest[i]) >= 0 ? 0 : 1]).join("");
}
