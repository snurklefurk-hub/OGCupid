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
  assert.doesNotMatch(welcome,/>\s*Your homework\s*</i);
});

test("welcome is a dedicated centered canvas with navigation and supporting info at the edges", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("./classic.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("./main.js", import.meta.url), "utf8");
  const welcomeStart = html.indexOf('id="homework-dashboard"');
  const centerEnd = html.indexOf('id="member-columns"', welcomeStart);
  const sideStart = html.indexOf('id="welcome-side-panel"');
  const footerStart = html.indexOf('class="member-legal-footer"');
  assert.ok(welcomeStart >= 0 && centerEnd > welcomeStart);
  assert.ok(sideStart > centerEnd && footerStart > sideStart,
    "supporting progress sidebar lives outside the main welcome canvas");
  const center = html.slice(welcomeStart, centerEnd);
  assert.match(center, /class="welcome-page-tabs"/);
  assert.match(center, /class="welcome-center"/);
  assert.equal((center.match(/class="welcome-step" id="homework-/g)||[]).length, 4);
  assert.match(center, /class="welcome-step-icon welcome-step-icon-profile"/);
  assert.match(center, /class="welcome-step-icon welcome-step-icon-photos"/);
  assert.match(center, /class="welcome-step-icon welcome-step-icon-questions"/);
  assert.match(center, /class="welcome-step-icon welcome-step-icon-explore"/);
  assert.match(css, /\.is-welcome-flow \.shell\s*\{[^}]*grid-template-columns:/);
  assert.match(css, /\.is-welcome-flow #member-columns\s*\{display:none!important\}/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(js, /document\.body\.classList\.toggle\("is-welcome-flow", onWelcome\)/);
  assert.match(js, /document\.body\.classList\.remove\("is-welcome-flow"\)/);
});

test("welcome side labels reflect existing state rather than invented member activity", () => {
  const js = readFileSync(new URL("./main.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for(const id of [
    "welcome-side-profile-status",
    "welcome-side-photos-status",
    "welcome-side-questions-status",
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.ok(js.includes('$("' + id + '").textContent'), id + " is driven by saved account data");
  }
  assert.doesNotMatch(html.slice(html.indexOf('id="welcome-side-panel"'),html.indexOf('class="member-legal-footer"')),/match percentage|new messages waiting|visitors today/i);
});
