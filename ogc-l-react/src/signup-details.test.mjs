import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HABIT_CHOICES,RELIGION_CHOICES,KIDS_CHOICES,SIGNUP_PET_CHOICES,SIGNUP_DETAIL_STEPS,validSignupDetailStep,nextSignupDetails,savedSignupDetails} from "./signup-detail-options.mjs";
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
  assert.ok(validSignupDetailStep(6,{...empty(6),religion:"Protestant",religionImportance:"and it's really important",weed:"Sometimes"}));
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
  for(const text of ["What do you do?","What do you like?","what are you bringing?","Drugs (the hard stuff)","Weed (any kind)","Do you want kids?"])assert.ok(screen.includes(text));
  assert.match(screen,/step:"signup-details",page,fields/);
  assert.match(screen,/aria-pressed=\{selected.includes\(option\)\}/);
  assert.match(onboarding,/\.\.\.savedSignupDetails\(state\)/);
  assert.doesNotMatch(screen,/localStorage|sessionStorage|indexedDB/);
});

test("religion follows the approved order while previously saved drafts remain intact",()=>{
  assert.deepEqual(RELIGION_CHOICES,["Agnostic","Protestant","Catholic","Orthodox","Islam","Judaism","Buddhist","Hindu","Sikh","Other"]);
  for(const religion of RELIGION_CHOICES)assert.ok(validSignupDetailStep(6,{...empty(6),religion}));
  const prior={...empty(6),religion:"Christianity",weed:"Rarely",religionImportance:"and it's really important"};
  assert.ok(!validSignupDetailStep(6,prior));
  assert.ok(validSignupDetailStep(6,prior,true));
  assert.equal(nextSignupDetails({signup5_details:empty(5),signup6_details:prior}),"/signup7");
  assert.equal(savedSignupDetails({signup6_details:prior}).religion,"Christianity");
});

test("signup7 places status, style and kids in order above a full-width pet grid",()=>{
  const screen=read("./SignupDetails.jsx"),css=read("./signup-landing.css");
  const step=screen.slice(screen.indexOf("{page===7&&"));
  const fields=['select("status"','select("relationshipType"','select("kids"','<Pets '].map(value=>step.indexOf(value));
  assert.ok(fields.every((index,i)=>index>=0&&(i===0||index>fields[i-1])));
  assert.match(css,/\.ogcl-signup7 \.ogcl-signup-detail-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.ogcl-signup-pets\{grid-column:1\/-1/);
  assert.match(css,/\.ogcl-signup-pets-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
