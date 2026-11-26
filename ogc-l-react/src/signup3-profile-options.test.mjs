import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PROFILE_GENDERS,PROFILE_ORIENTATIONS,PROFILE_LOOKING_GENDERS,PROFILE_INTENTIONS,signupLookingDefaults,validSignupPreferences,presentIntentions,storageIntentions} from "./profile-options.mjs";
import {normalizeSearchCriteria} from "./search-contract.mjs";
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("expanded choices and displayed labels are canonical across the member UI",()=>{
  assert.deepEqual(PROFILE_GENDERS,["Man","Woman","Transman","Transwoman","Intersex","Enby","Something else"]);
  assert.deepEqual(PROFILE_ORIENTATIONS,["Straight","Gay","Bi","Ace","Something else"]);
  assert.deepEqual(PROFILE_LOOKING_GENDERS.map(x=>x.label),["Men","Women","Transmen","Transwomen","Intersex","Enbies","Something else"]);
  assert.deepEqual(PROFILE_INTENTIONS.map(x=>x.label),["long term dating","short term dating","friends","freaky stuff"]);
  assert.equal(presentIntentions("new friends, activity partners, casual sex"),"friends, freaky stuff");
  assert.equal(storageIntentions("friends, freaky stuff"),"new friends, casual sex");
});
test("only the six explicit binary-gender/sexuality combinations infer looking-for defaults",()=>{
  const expected={"Man|Straight":["Woman"],"Woman|Straight":["Man"],
    "Man|Gay":["Man"],"Woman|Gay":["Woman"],"Man|Bi":["Man","Woman"],"Woman|Bi":["Man","Woman"]};
  for(const gender of PROFILE_GENDERS)for(const orientation of PROFILE_ORIENTATIONS){
    assert.deepEqual(signupLookingDefaults(gender,orientation),expected[gender+"|"+orientation]||[]);
  }
  assert.deepEqual(signupLookingDefaults("","Straight"),[]);
  assert.deepEqual(signupLookingDefaults("Woman",""),[]);
});
test("all gender options are valid multi-select preferences and MATCHES filters",()=>{
  const body={gender:"Enby",orientation:"Ace",interestedIn:[...PROFILE_GENDERS],intentions:[]};
  assert.ok(validSignupPreferences(body));
  assert.ok(validSignupPreferences({...body,interestedIn:[],intentions:[]}));
  assert.ok(!validSignupPreferences({...body,intentions:["activity partners"]}));
  assert.ok(!validSignupPreferences({...body,interestedIn:["Man","Man"]}));
  assert.equal(normalizeSearchCriteria({genders:[...PROFILE_GENDERS]}).genders.length,7);
  assert.throws(()=>normalizeSearchCriteria({intentions:["activity partners"]}));
});
test("signup3 uses the shared shell with a raised logo and stores choices only through onboarding",()=>{
  const app=read("./App.jsx"),shell=read("./SignupShell.jsx"),signup=read("./SignupLanding.jsx"),step=read("./SignupIdentity.jsx");
  assert.match(app,/<Route path="signup3" element=\{<SignupIdentity/);
  assert.match(app,/<Route path="signup1" element=\{<Navigate to="\/signup"/);
  assert.match(shell,/identityStep\?" ogcl-signup-content-top"/);
  assert.match(signup,/gender==="Something else"\|\|orientation==="Something else"/);
  assert.match(signup,/Don't worry, we've got more options inside\./);
  assert.match(step,/So who are you, really\?/);
  assert.match(step,/Pick whatever is closest\. We can't afford a 10k-parameter search engine\./);
  assert.match(step,/state\.gender\|\|selection\?\.gender/);
  assert.match(step,/state\.orientation\|\|selection\?\.orientation/);
  assert.match(step,/step:"signup-preferences"/);
  assert.match(step,/if\(!touched\.current\)next\.interestedIn=signupLookingDefaults/);
  assert.match(step,/onChange=\{items=>\{touched\.current=true/);
  assert.doesNotMatch(step,/localStorage|sessionStorage|indexedDB/);
  assert.ok(SITEMAP_PATHS.includes("/signup3"));
});

test("birthdate is above the identity controls and both preference dropdowns use full-width text toggles",()=>{
  const step=read("./SignupIdentity.jsx"),legacy=read("./Onboarding.jsx"),css=read("./signup-landing.css");
  assert.ok(step.indexOf('name="birthDate"')<step.indexOf('className="ogcl-signup3-grid"'));
  assert.match(step,/type="date" name="birthDate" required min=\{birthDateLimit\(120\)\} max=\{birthDateLimit\(18\)\}/);
  assert.match(step,/birthDate:String\(state\.birth_date/);
  assert.match(step,/aria-expanded=\{open&&!disabled\}/);
  assert.match(step,/type="button" className="ogcl-signup3-option" aria-pressed=\{selected\.includes\(value\)\}/);
  assert.match(step,/onClick=\{\(\)=>onChange\(selected\.includes\(value\)\?selected\.filter\(x=>x!==value\):\[\.\.\.selected,value\]\)\}/);
  assert.doesNotMatch(step,/type="(?:checkbox|radio)"/);
  assert.match(css,/\.ogcl-signup3-menu \.ogcl-signup3-option\{display:block;width:100%/);
  assert.match(css,/\.ogcl-signup3-option\[aria-pressed="true"\]\{background:/);
  assert.match(step,/hidden=\{!open\|\|disabled\}/);
  assert.match(step,/e\.key==="Escape"/);
  assert.match(css,/\.ogcl-signup3-menu\[hidden\]\{display:none\}/);
  assert.match(legacy,/\{!state\.birth_date&&<label>Birthdate/);
  assert.match(legacy,/birthDate:f\.elements\.birthDate\?\.value\|\|String\(state\.birth_date/);
});
