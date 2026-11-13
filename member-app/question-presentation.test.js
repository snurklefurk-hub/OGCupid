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

import { readFileSync } from "node:fs";

test("classic question screen is dense, scoped to signed-in users, and preserves form controls", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("./member-shell.css", import.meta.url), "utf8");
  const start = html.indexOf('id="questions-panel"');
  const end = html.indexOf('id="member-persona-panel"', start);
  const panel = html.slice(start, end);
  for (const id of ["question-view","question-progress","question-mode","answered-review","question-form",
    "question-headline","question-prompt","question-choices","acceptable-choices","acceptable-hint",
    "question-note","question-private","question-save-button","question-skip","question-answer-error"]) {
    assert.ok(panel.includes('id="' + id + '"'), "existing question interaction control: " + id);
  }
  assert.match(panel, /class="og-question-answer-grid"/);
  assert.match(panel, /name="importance" value="0"/);
  assert.match(panel, /name="importance" value="1"/);
  assert.match(panel, /name="importance" value="10"/);
  assert.match(panel, /name="importance" value="50"/);
  assert.match(panel, /name="importance" value="250"/);
  assert.match(panel, /aria-label="Your answer"/);
  assert.match(panel, /aria-label="Answers you will accept"/);
  assert.match(css, /body\.is-authenticated #questions-panel \.og-question-answer-grid/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(panel, /first10|next50|next100|next250|410 questions required/i);
});

test("new and saved answers get distinct UI labels without changing persistence or selection", () => {
  const js = readFileSync(new URL("./main.js", import.meta.url), "utf8");
  const render = js.slice(js.indexOf("function renderQuestion()"),js.indexOf("// OG Cupid's classic long-form profile"));
  assert.match(render, /question-mode/);
  assert.match(render, /Editing a saved answer/);
  assert.match(render, /Update saved answer/);
  assert.match(render, /question-headline/);
  assert.match(render, /question-prompt/);
  assert.match(render, /nextCompatibilityQuestion\(remaining, savedAnswers\.keys\(\)\)/);
  assert.match(render, /focusTier !== "first10"/);
  const saving = js.slice(js.indexOf('$("question-form").addEventListener("submit"'));
  assert.match(saving, /requestPrivate\("\/answers", "PUT", answer\)/);
  assert.match(saving, /savedAnswers\.set\(question\.id, answer\)/);
  assert.match(saving, /question-headline/);
});
