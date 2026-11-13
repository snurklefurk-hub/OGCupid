import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROFILE_EDITOR_STEPS, profileStepFromHash, profileDestination } from "./profile-editor-flow.js";

test("profile editor has just Basics, Details, and Essays in sequence",()=>{
  assert.deepEqual(Object.keys(PROFILE_EDITOR_STEPS),["basics","details","essays"]);
  assert.equal(PROFILE_EDITOR_STEPS.basics.next,"details");
  assert.equal(PROFILE_EDITOR_STEPS.details.next,"essays");
  assert.equal(PROFILE_EDITOR_STEPS.essays.next,null);
  for(const step of Object.keys(PROFILE_EDITOR_STEPS))assert.equal(profileStepFromHash(profileDestination(step)),step);
  assert.equal(profileStepFromHash("#preview-title"),"basics");
});
test("all saved profile fields stay in one form, even though only one stage displays",()=>{
  const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
  const form=html.slice(html.indexOf('<form id="profile-form"'),html.indexOf('</form>',html.indexOf('<form id="profile-form"')));
  assert.equal((form.match(/data-profile-section="basics"/g)||[]).length,2);
  assert.equal((form.match(/data-profile-section="details"/g)||[]).length,1);
  assert.equal((form.match(/data-profile-section="essays"/g)||[]).length,1);
  for(const field of ['name="age"','name="searchRadiusMiles"','name="ethnicity"','name="languageName1"','name="aboutMe"'])assert.ok(form.includes(field),field);
  assert.match(form,/id="profile-edit-step-nav"/);
  assert.match(form,/id="profile-save-button"/);
});
test("profile page hides ordinary dashboard hero and 11-tile navigation while editing",()=>{
  const css=readFileSync(new URL("./classic.css",import.meta.url),"utf8");
  const js=readFileSync(new URL("./main.js",import.meta.url),"utf8");
  assert.match(css,/\.is-profile-setup main>\.intro/);
  assert.match(css,/\.is-profile-setup main>\.classic-member-topbar/);
  assert.match(css,/\.is-profile-setup #profile-preview-panel/);
  assert.match(js,/document\.body\.classList\.toggle\("is-profile-setup",page === "profile"\)/);
  assert.match(js,/dataset\.profileStep/);
  assert.match(js,/event\.submitter/);
});
