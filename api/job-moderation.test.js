import test from "node:test";
import assert from "node:assert/strict";
import { isKrustyKrabCookJob } from "./job-moderation.js";

test("matches only explicit normalized Krusty Krab cook phrases", () => {
  assert.equal(isKrustyKrabCookJob("Cook at the Krusty Krab"), true);
  assert.equal(isKrustyKrabCookJob("cook-at KRUSTY krab!!!"), true);
  assert.equal(isKrustyKrabCookJob("Cook at Krusty Krab (nights)"), true);
  assert.equal(isKrustyKrabCookJob("Line cook at a seafood restaurant"), false);
  assert.equal(isKrustyKrabCookJob("Manager at Krusty Krab"), false);
  assert.equal(isKrustyKrabCookJob("cook at krabby patty place"), false);
});
