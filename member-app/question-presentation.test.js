import test from "node:test";
import assert from "node:assert/strict";
import { displayQuestionProgress, acceptedAnswerSuggestion } from "./question-presentation.js";

test("question progress labels are accurate, not invented onboarding percentages", () => {
  assert.deepEqual(displayQuestionProgress(2, 410, "first10"), {
    answered:2,total:410,label:"2 of 410 questions answered",tier:"FIRST 10",
  });
  assert.equal(displayQuestionProgress(63,410,"next100").tier, "NEXT 100");
  assert.equal(displayQuestionProgress(11,410,"next50").tier, "NEXT 50");
  assert.equal(displayQuestionProgress(169,410,"next250").tier, "NEXT 250");
  assert.equal(displayQuestionProgress(410,410,"other").answered,410);
  assert.equal(displayQuestionProgress(12,410,"first10",true).tier,"REVIEWING AN ANSWER");
});
test("untrusted counts cannot make progress exceed its actual question total",()=>{
  assert.equal(displayQuestionProgress(999,410,"first10").answered,410);
  assert.equal(displayQuestionProgress(-9,410,"first10").answered,0);
  assert.equal(displayQuestionProgress(NaN,410,"first10").answered,0);
});
test("accept-own-answer suggestion never overwrites existing acceptable choices",()=>{
  assert.equal(acceptedAnswerSuggestion("option-0", []),"option-0");
  assert.equal(acceptedAnswerSuggestion("option-0", ["option-2"]),null);
  assert.equal(acceptedAnswerSuggestion("",[]),null);
  assert.equal(acceptedAnswerSuggestion("option-0",null),null);
});
