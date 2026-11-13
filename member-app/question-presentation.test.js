import test from "node:test";
import assert from "node:assert/strict";
import { displayQuestionProgress, acceptedAnswerSuggestion } from "./question-presentation.js";

test("questions appear as one continuous pool with count only", () => {
  assert.deepEqual(displayQuestionProgress(0), { answered:0,label:"0 questions answered" });
  assert.deepEqual(displayQuestionProgress(1), { answered:1,label:"1 question answered" });
  assert.deepEqual(displayQuestionProgress(63), { answered:63,label:"63 questions answered" });
  assert.deepEqual(displayQuestionProgress(410), { answered:410,label:"410 questions answered" });
});

test("progress does not reveal internal stages, denominators or private tier names", () => {
  for(const count of [0,1,10,11,60,61,160,410]) {
    const progress=displayQuestionProgress(count);
    assert.equal(Object.hasOwn(progress,"tier"),false);
    assert.equal(Object.hasOwn(progress,"total"),false);
    assert.doesNotMatch(progress.label,/first|next|tier|\/|of 410/i);
  }
});

test("untrusted counts cannot yield negative or NaN progress",()=>{
  assert.equal(displayQuestionProgress(-9).answered,0);
  assert.equal(displayQuestionProgress(NaN).answered,0);
});

test("accept-own-answer suggestion never overwrites existing acceptable choices",()=>{
  assert.equal(acceptedAnswerSuggestion("option-0", []),"option-0");
  assert.equal(acceptedAnswerSuggestion("option-0", ["option-2"]),null);
  assert.equal(acceptedAnswerSuggestion("",[]),null);
  assert.equal(acceptedAnswerSuggestion("option-0",null),null);
});
