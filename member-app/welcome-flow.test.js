import test from "node:test";
import assert from "node:assert/strict";
import { SIGNUP_WELCOME_HASH, memberSectionFromHash, welcomeQuestionStatus } from "./welcome-flow.js";

test("new accounts have a distinct welcome destination, not account settings", () => {
  assert.equal(SIGNUP_WELCOME_HASH, "#welcome-title");
  assert.equal(memberSectionFromHash(SIGNUP_WELCOME_HASH), "welcome");
  assert.notEqual(memberSectionFromHash(SIGNUP_WELCOME_HASH), "settings");
});

test("existing signed-in destinations remain accessible", () => {
  assert.equal(memberSectionFromHash("#member-title"), "home");
  assert.equal(memberSectionFromHash(""), "home");
  assert.equal(memberSectionFromHash("#profile-title"), "profile");
  assert.equal(memberSectionFromHash("#preview-title"), "profile");
  assert.equal(memberSectionFromHash("#photos-title"), "photos");
  assert.equal(memberSectionFromHash("#question-title"), "questions");
  assert.equal(memberSectionFromHash("#settings-title"), "settings");
});

test("match-question count is one cloud, not disclosed editorial question tiers", () => {
  assert.equal(welcomeQuestionStatus(0), "0 match questions answered");
  assert.equal(welcomeQuestionStatus(1), "1 match question answered");
  assert.equal(welcomeQuestionStatus(37), "37 match questions answered");
  assert.doesNotMatch(welcomeQuestionStatus(63), /first|next|tier|of 410/i);
});

test("bad counts do not invent progress", () => {
  assert.equal(welcomeQuestionStatus(-5), "0 match questions answered");
  assert.equal(welcomeQuestionStatus(NaN), "0 match questions answered");
});
