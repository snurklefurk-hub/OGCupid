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

import { readFileSync } from "node:fs";

test("the welcome page has the four approved activities in the requested order", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const steps = [
    "Fill out your profile basics",
    "Add photos",
    "Take the Dating Persona Quiz and answer match questions",
    "Explore, match, and have fun",
  ];
  const indexes = steps.map(step => html.indexOf(step));
  assert.ok(indexes.every(index => index >= 0), "all four approved steps are visible");
  assert.deepEqual([...indexes].sort((a,b) => a-b), indexes);
  assert.match(html, /id="welcome-title"/);
  assert.match(html, /href="\/account\/persona\.html"/);
  assert.match(html, /href="#question-title"/);
  assert.match(html, /href="#welcome-title"/);
});

test("signup and email verification deliberately route to welcome", () => {
  const js = readFileSync(new URL("./main.js", import.meta.url), "utf8");
  const signup = js.slice(js.indexOf('"signup-form").addEventListener'),js.indexOf('"verify-form").addEventListener'));
  const verification = js.slice(js.indexOf('"verify-form").addEventListener'),js.indexOf('"signout").addEventListener'));
  assert.match(signup, /window\.location\.hash\s*!==\s*SIGNUP_WELCOME_HASH/);
  assert.match(verification, /window\.location\.hash\s*!==\s*SIGNUP_WELCOME_HASH/);
  assert.doesNotMatch(signup + verification, /window\.location\.hash\s*=\s*["']#settings-title/);
});

test("no unverified persona completion marker or false match feeds on welcome",()=>{
  const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
  const start=html.indexOf('class="paper homework-dashboard welcome-checklist"');
  const end=html.indexOf('id="member-columns"',start);
  const welcome=html.slice(start,end);
  assert.doesNotMatch(welcome,/persona (quiz )?(complete|finished|done)/i);
  assert.match(welcome,/member browsing and compatibility matching are coming/i);
  assert.doesNotMatch(welcome,/\bhomework\b/i);
});
