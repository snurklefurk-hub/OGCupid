import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HABIT_CHOICES,RELIGION_CHOICES,SIGNUP_ETHNICITY_CHOICES,HEIGHT_CHOICES,BODY_TYPE_CHOICES,LANGUAGE_CHOICES,KIDS_CHOICES,SIGNUP_PET_CHOICES,SIGNUP_DETAIL_STEPS,validSignupDetailStep,nextSignupDetails,savedSignupDetails} from "./signup-detail-options.mjs";
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
  assert.equal(nextSignupDetails({...state,signup6_details:empty(6),signup7_details:empty(7)}),"/signup8");
  assert.equal(nextSignupDetails({...state,signup6_details:empty(6),signup7_details:empty(7),signup8_details:{...empty(8),orientation:"Straight"}}),"/onboarding");
  assert.equal(nextSignupDetails({},true),"/onboarding");
  assert.deepEqual(savedSignupDetails(state),state.signup5_details);
});
test("routes use the raised shell and private authenticated draft writes",()=>{
  const app=read("./App.jsx"),screen=read("./SignupDetails.jsx"),onboarding=read("./Onboarding.jsx"),shell=read("./SignupShell.jsx");
  for(const page of [5,6,7,8]){
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

test("personal options have exact order, 43 one-inch heights and validated multi-selects",()=>{
  assert.deepEqual(SIGNUP_ETHNICITY_CHOICES,["White","Black","Asian","Hispanic","Native","Indian","Middle Eastern","Other"]);
  assert.deepEqual(LANGUAGE_CHOICES,["English","Spanish","French","German","Russian","Italian","Polish","Ukrainian","Romanian","Dutch","Other"]);
  assert.equal(HEIGHT_CHOICES.length,43);
  assert.equal(HEIGHT_CHOICES[0],"4' 0\" (122 cm)");
  assert.equal(HEIGHT_CHOICES.at(-1),"7' 6\" (229 cm)");
  assert.equal(new Set(HEIGHT_CHOICES).size,43);
  assert.equal(BODY_TYPE_CHOICES.at(-1),"used up");
  const draft={orientation:"Bi",ethnicity:"White, Native",height:HEIGHT_CHOICES[20],bodyType:"used up",languages:LANGUAGE_CHOICES.join(", ")};
  assert.ok(validSignupDetailStep(8,draft));
  assert.ok(!validSignupDetailStep(8,{...draft,orientation:""}));
  assert.ok(!validSignupDetailStep(8,{...draft,ethnicity:"White, White"}));
  assert.ok(!validSignupDetailStep(8,{...draft,languages:"Klingon"}));
  assert.ok(!validSignupDetailStep(8,{...draft,height:"10 feet"}));
  const {orientation,...profile}=draft;
  assert.deepEqual(savedSignupDetails({signup8_details:draft}),profile);
  const screen=read("./SignupDetails.jsx");
  assert.match(screen,/if\(page===8\)initial.orientation=state.orientation/);
  assert.ok(screen.includes("Lets get personal"));
  assert.ok(screen.includes("We're almost done, i swear"));
  assert.match(screen,/<Choices label="Ethnicity"/);
  assert.match(screen,/<Choices label="Languages"/);
});
