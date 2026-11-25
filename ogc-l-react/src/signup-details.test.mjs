import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HABIT_CHOICES,KIDS_CHOICES,SIGNUP_PET_CHOICES,SIGNUP_DETAIL_STEPS,validSignupDetailStep,nextSignupDetails,savedSignupDetails} from "./signup-detail-options.mjs";
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const empty=page=>Object.fromEntries(SIGNUP_DETAIL_STEPS[page].map(key=>[key,""]));
test("new detail choices and kids display mapping are canonical",()=>{
  assert.deepEqual(HABIT_CHOICES,["Often","Sometimes","Rarely","Never","Trying to quit"]);
  assert.deepEqual(KIDS_CHOICES.map(x=>x.value),["Wants kids","Doesn't want kids","Has kids and wants more","Has kids and doesn't want more"]);
  assert.equal(SIGNUP_PET_CHOICES.length,6);
  assert.ok(validSignupDetailStep(7,{...empty(7),pets:SIGNUP_PET_CHOICES.join(", ")}));
  assert.ok(!validSignupDetailStep(7,{...empty(7),pets:"Has dogs, Has dogs"}));
  assert.ok(!validSignupDetailStep(6,{...empty(6),drugs:"Just weed"}));
  assert.ok(!validSignupDetailStep(6,{...empty(6),religionImportance:"and it's really important"}));
  assert.ok(validSignupDetailStep(6,{...empty(6),religion:"Christianity",religionImportance:"and it's really important",weed:"Sometimes"}));
  assert.ok(!validSignupDetailStep(5,{...empty(5),role:"admin"}));
});
test("steps resume in sequence, optional empty fields count as a saved page",()=>{
  const state={signup5_details:{...empty(5),work:"Engineer"}};
  assert.equal(nextSignupDetails({}),"/signup5");
  assert.equal(nextSignupDetails(state),"/signup6");
  assert.equal(nextSignupDetails({...state,signup6_details:empty(6)}),"/signup7");
  assert.equal(nextSignupDetails({...state,signup6_details:empty(6),signup7_details:empty(7)}),"/onboarding");
  assert.equal(nextSignupDetails({},true),"/onboarding");
  assert.deepEqual(savedSignupDetails(state),state.signup5_details);
});
test("routes use the raised shell and private authenticated draft writes",()=>{
  const app=read("./App.jsx"),screen=read("./SignupDetails.jsx"),onboarding=read("./Onboarding.jsx"),shell=read("./SignupShell.jsx");
  for(const page of [5,6,7]){
    assert.ok(app.includes('<Route path="signup'+page+'"'));
    assert.ok(SITEMAP_PATHS.includes("/signup"+page));
    assert.ok(shell.includes('"/signup'+page+'"'));
  }
  for(const text of ["What do you do?","What do you like?","what are you bringing?","the hard stuff","any kind","Do you want kids?"])assert.ok(screen.includes(text));
  assert.match(screen,/step:"signup-details",page,fields/);
  assert.match(screen,/aria-pressed=\{selected.includes\(option\)\}/);
  assert.match(onboarding,/\.\.\.savedSignupDetails\(state\)/);
  assert.doesNotMatch(screen,/localStorage|sessionStorage|indexedDB/);
});
