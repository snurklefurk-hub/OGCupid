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

test("signed-in profile navigation and preview use actual member views",()=>{
  const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("./main.js",import.meta.url),"utf8");
  const css=readFileSync(new URL("./member-shell.css",import.meta.url),"utf8");
  const nav=html.slice(html.indexOf('class="classic-rail-nav"'),html.indexOf('</nav>',html.indexOf('class="classic-rail-nav"')));
  assert.match(nav,/href="#preview-title"[^>]*data-classic-auth[^>]*>[^<]*<span[^>]*>[^<]*<\/span> My profile/);
  assert.match(nav,/href="#profile-title"[^>]*data-classic-auth[^>]*>[^<]*<span[^>]*>[^<]*<\/span> Edit profile/);
  const preview=html.slice(html.indexOf('id="profile-preview-panel"'),html.indexOf('<dialog id="profile-photo-viewer"'));
  assert.match(preview,/aria-label="Your profile sections"/);
  for(const href of ['#preview-title','#photos-title','#question-title','#profile-title']) assert.ok(preview.includes('href="'+href+'"'),href);
  assert.match(preview,/id="preview-looking-for"/);
  assert.match(preview,/id="preview-question-count"/);
  assert.match(js,/\$\("preview-looking-for"\)\.textContent\s*=/);
  assert.match(js,/\$\("preview-question-count"\)\.textContent\s*=/);
  assert.match(css,/body\.is-authenticated #profile-preview-panel/);
  assert.doesNotMatch(preview,/93% Match|90% Friend|Online now/);
});
