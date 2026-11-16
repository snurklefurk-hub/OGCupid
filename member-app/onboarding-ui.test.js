import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  birthAge, zodiac, nextRequired, unlockedStages
} from "./onboarding-ui.js";

test("birthdate-based age respects birthdays rather than stored self-reported age",()=>{
  const today=new Date("2026-11-13T00:00:00Z");
  assert.equal(birthAge("2000-11-13",today),26);
  assert.equal(birthAge("2000-11-14",today),25);
  assert.equal(birthAge("2000-01-01",today),26);
  assert.equal(birthAge("invalid",today),null);
});

test("all twelve zodiac ranges come from stored birthdate, not a user field",()=>{
  const cases=[
    ["2000-01-19","Capricorn"],["2000-01-20","Aquarius"],
    ["2000-02-19","Pisces"],["2000-03-21","Aries"],
    ["2000-04-20","Taurus"],["2000-05-21","Gemini"],
    ["2000-06-21","Cancer"],["2000-07-23","Leo"],
    ["2000-08-23","Virgo"],["2000-09-23","Libra"],
    ["2000-10-23","Scorpio"],["2000-11-22","Sagittarius"],
    ["2000-12-22","Capricorn"]
  ];
  for(const [birth,sign] of cases) assert.equal(zodiac(birth),sign,birth);
});

test("post-registration identity and locality precede hub",()=>{
  assert.equal(nextRequired(null),"identity");
  assert.equal(nextRequired({identity:true,locality:false}),"location");
  assert.equal(nextRequired({identity:true,locality:true}),"hub");
});

test("exact four quadrants progressively unlock from persisted server status",()=>{
  assert.deepEqual(unlockedStages({profile:false,photo:false,quiz:false}),[true,false,false,false]);
  assert.deepEqual(unlockedStages({profile:true,photo:false,quiz:false}),[true,true,false,false]);
  assert.deepEqual(unlockedStages({profile:true,photo:true,quiz:false}),[true,true,true,false]);
  assert.deepEqual(unlockedStages({profile:true,photo:true,quiz:true}),[true,true,true,true]);
  assert.deepEqual(unlockedStages({profile:false,photo:true,quiz:true}),[true,false,false,false]);
  assert.deepEqual(unlockedStages({profile:true,photo:false,quiz:true}),[true,true,false,false]);
});

test("onboarding copy and server routes follow owner's canonical plan",()=>{
  const js=readFileSync(new URL("./onboarding-ui.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
  for(const label of ["DONE!","getting ahead","25 match questions","Now would be a good time to verify","Just weed","Something else","Delete account","My Self Summary"]){
    assert.match(js,new RegExp(label,"i"),label);
  }
  assert.match(html,/FINISHED!/);
  assert.match(js,/request\("PUT",\s*"\/onboarding"/);
  assert.doesNotMatch(js,/emailOtp/);
});

test("onboarding completion and protected identity are server-derived",()=>{
  const api=readFileSync(new URL("../api/onboarding.js",import.meta.url),"utf8");
  assert.match(api,/result\.answers\s*>=\s*25/);
  assert.match(api,/s\?\.persona_code/);
  assert.match(api,/current_member_email_verified/);
  assert.match(api,/Finish your onboarding steps first/);
});

test("onboarding failure is fail-closed and offers retry rather than exposing normal member screens", () => {
  const app = readFileSync(new URL("./main.js", import.meta.url), "utf8");
  const ui = readFileSync(new URL("./onboarding-ui.js", import.meta.url), "utf8");
  const start = app.indexOf("async function refreshMember(");
  const end = app.indexOf("function isJwt(", start);
  const sessionLoad = app.slice(start, end);
  assert.match(sessionLoad, /onboarding\?\.showPending\(\)/);
  assert.match(sessionLoad, /await onboarding\?\.load\(\)/);
  assert.match(sessionLoad, /if \(currentUser\) onboarding\?\.showUnavailable\(\)/);
  // A completed member's onboarding status is checked BEFORE fetching
  // optional profile/answers/photos/email. No old splash can appear.
  assert.ok(sessionLoad.indexOf("await onboarding?.load()") < sessionLoad.indexOf("await loadProfile("));
  assert.doesNotMatch(sessionLoad, /showLoading/);
  assert.doesNotMatch(ui, /Loading your saved progress|checking where you left off|renderLoading|showLoading/);
  assert.match(ui, /function showPending\(\)/);
  assert.match(ui, /root\.hidden = true/);
  assert.match(ui, /classList\.add\("ogc-member-pending"\)/);
  assert.match(ui, /classList\.remove\("ogc-member-pending"\)/);
  assert.match(ui, /function renderUnavailable\(\)/);
  assert.match(ui, /Nothing has been lost/);
  assert.match(ui, /retrySession\(\)/);
  assert.match(ui, /stage\s*===\s*"unavailable"/);
  assert.match(app, /retrySession:\(\)=>refreshMember\(\{loadProfile:true\}\)/);
  assert.match(ui, /root\.hidden=false/);
});

test("completed accounts never show an interim onboarding progress page", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("./onboarding.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("./main.js", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("./onboarding-ui.js", import.meta.url), "utf8");
  assert.match(html, /<body class="ogc-member-theme ogc-member-pending">/);
  assert.match(css, /body\.ogc-member-pending > \.shell\s*\{[^}]*visibility:hidden/);
  assert.match(onboarding, /if \(status\.explored\) \{ hide\(\); leaveToHome\(\); return; \}/);
  assert.doesNotMatch(onboarding, /Loading your saved progress/);
  assert.match(js, /const hydrate = accountChanged \|\| options\.loadProfile \|\| !onboarding\?\.state/);
  assert.match(js, /renderAuthenticated\(member\)/);
});

test("silent account verification has a deadline and cannot expose an unverified dashboard", () => {
  const main = readFileSync(new URL("./main.js", import.meta.url), "utf8");
  const ui = readFileSync(new URL("./onboarding-ui.js", import.meta.url), "utf8");
  assert.match(main, /withSessionDeadline\(auth\.getSession\(\)\)/);
  assert.match(main, /withSessionDeadline\(promise, ms = 12000\)/);
  assert.match(main, /options\.signal \? \{ signal: options\.signal \}/);
  assert.match(main, /options\.signal\s*\? await withSessionDeadline\(getAccessToken\(\)\)/);
  assert.match(main, /request:\(method,path,body,options\)=>requestPrivate\(path,method,body,options\)/);
  assert.match(ui, /new AbortController\(\)/);
  assert.match(ui, /setTimeout\(\(\) => controller\.abort\(\), 12000\)/);
  assert.match(ui, /if \(controller\.signal\.aborted\) throw new Error\("Account verification timed out\."\)/);
  assert.match(ui, /clearTimeout\(timer\)/);
  assert.match(ui, /if \(status\.explored\) \{ hide\(\); leaveToHome\(\); return; \}/);
});
