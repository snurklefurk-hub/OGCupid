import test from "node:test";
import assert from "node:assert/strict";
import { nextCompatibilityQuestion, QUESTION_TIERS } from "./question-flow.js";

const q = (id, tier, extra = {}) => ({ id, tier, ...extra });
const catalog = [
  q("ten-a", "first10"), q("ten-b", "first10"),
  q("fifty-a", "next50"), q("fifty-b", "next50"),
  q("hundred-a", "next100"), q("twofifty-a", "next250"),
  q("outside-a", "other"),
];
const run = (questions, answered = [], values = [0.5]) => {
  let next = 0;
  return nextCompatibilityQuestion(questions, answered, () => values[next++] ?? 0.5);
};

test("tiers appear in the agreed order", () => {
  assert.deepEqual(QUESTION_TIERS, ["first10", "next50", "next100", "next250", "other"]);
});

test("the first 10 are mandatory before even 10-percent spillovers", () => {
  const picked = run(catalog, [], [0.99]);
  assert.equal(picked.focusTier, "first10");
  assert.equal(picked.question.id, "ten-b");
  assert.equal(picked.servedFromOutsideTier, false);
});

test("next 50 follows mandatory first 10 with randomized order", () => {
  const picked = run(catalog, ["ten-a", "ten-b"], [0.8, 0.99]);
  assert.equal(picked.focusTier, "next50");
  assert.equal(picked.question.id, "fifty-b");
});

test("next 50 has 10-percent outside-tier discovery", () => {
  const picked = run(catalog, ["ten-a", "ten-b"], [0.09, 0]);
  assert.equal(picked.question.id, "hundred-a");
  assert.equal(picked.focusTier, "next50");
  assert.equal(picked.servedFromOutsideTier, true);
  const exactBoundary = run(catalog, ["ten-a", "ten-b"], [0.10, 0]);
  assert.equal(exactBoundary.question.id, "fifty-a");
  assert.equal(exactBoundary.servedFromOutsideTier, false);
});

test("next 100 also has 10-percent discovery but next 250 does not", () => {
  const answered = ["ten-a", "ten-b", "fifty-a", "fifty-b"];
  const hundred = run(catalog, answered, [0.01, 0]);
  assert.equal(hundred.focusTier, "next100");
  assert.equal(hundred.question.id, "twofifty-a");
  assert.equal(hundred.servedFromOutsideTier, true);
  const next250 = run(catalog, [...answered, "hundred-a"], [0]);
  assert.equal(next250.focusTier, "next250");
  assert.equal(next250.question.id, "twofifty-a");
  assert.equal(next250.servedFromOutsideTier, false);
});

test("answered spillover questions stay answered when their tier comes up", () => {
  const answered = ["ten-a", "ten-b", "fifty-a", "fifty-b", "hundred-a"];
  const selected = run(catalog, answered);
  assert.equal(selected.question.id, "twofifty-a");
});

test("after staged tiers are complete, uses any other eligible question", () => {
  const answered = catalog.filter(x => x.tier !== "other").map(x => x.id);
  assert.equal(run(catalog, answered).question.id, "outside-a");
  assert.equal(run(catalog, catalog.map(x => x.id)), null);
});

test("ignored question states never get served", () => {
  const picked = run([q(1, 10, { dogshit: true }), q(2, 10, { hidden: true }),
    q(3, 10, { dismissed: true }), q(4, 10)], [], [0]);
  assert.equal(picked.question.id, 4);
});

test("junk answers are omitted without changing the original question", () => {
  const original = q("x", "first10", { answers: [
    { id: 1, text: "valid" }, { id: 2, text: "junk", junk: true },
  ] });
  const result = run([original], [], [0]);
  assert.deepEqual(result.question.answers.map(x => x.id), [1]);
  assert.equal(original.answers.length, 2);
  assert.equal(run([q("all-junk", "first10", {
    answers: [{ id: 9, junk: true }],
  })]), null);
});

test("duplicate IDs and non-numeric random output cannot bias progression", () => {
  const result = run([q("one", 10), q("one", 100), q("two", 10)], [], [0.99]);
  assert.equal(result.question.id, "two");
  assert.throws(() => run([q("one", 10)], [], [1]), RangeError);
  assert.throws(() => run([q("one", 10)], [], [Number.NaN]), RangeError);
});
