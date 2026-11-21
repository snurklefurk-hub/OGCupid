import test from "node:test";
import assert from "node:assert/strict";
import {sanitizePublicProfile,PUBLIC_ESSAYS,PUBLIC_DETAILS} from "./member-public-profile.mjs";
const userId="00000000-0000-4000-8000-000000000002";
const p={profile:{userId,slug:"hello-member",displayName:"Hello Member",age:31,cityRegion:"Savannah, Georgia",
  aboutMe:"Test essay", messageMeIf:"Send me a book recommendation.",gender:"Woman",work:"Writer",
  ethnicity:"Black, White",
  email:"dont-show@invalid.test", birthDate:"1999-01-01",
  acceptableOptions:["private"]},publicAnswers:[{questionId:"vault-5",optionId:"option-1",note:"private"}],
  isOwner:false,personaCode:"DBSDf"};
test("public view only keeps explicit safe text and public answer identity",()=>{
  const result=sanitizePublicProfile(p,"hello-member");
  assert.equal(result.displayName,"Hello Member");
  assert.equal(result.essays.aboutMe,"Test essay");
  assert.equal(result.essays.messageMeIf,"Send me a book recommendation.");
  assert.equal(result.details.work,"Writer");
  assert.equal(result.details.ethnicity,"Black, White");
  assert.equal(PUBLIC_DETAILS.find(field=>field.key==="ethnicity")?.label,"Race / ethnicity");
  assert.equal(result.age,31);
  assert.deepEqual(result.publicAnswers,[{questionId:"vault-5",optionId:"option-1",note:"private",isPrivate:false}]);
  assert.equal(JSON.stringify(result).includes("dont-show"),false);
  assert.equal(JSON.stringify(result).includes("acceptableOptions"),false);
  assert.equal(JSON.stringify(result).includes("dont-show"),false);
  assert.equal(PUBLIC_ESSAYS.length,10);
  assert.ok(PUBLIC_DETAILS.length>=15);
});
test("legacy Hispanic / Latin and Indigenous values use approved visible labels without rewriting data",()=>{
  const legacy={...p,profile:{...p.profile,ethnicity:"Hispanic / Latin, Indian, Indigenous"}};
  assert.equal(sanitizePublicProfile(legacy,"hello-member").details.ethnicity,
    "Hispanic, Indian, Native American");
  assert.equal(legacy.profile.ethnicity,"Hispanic / Latin, Indian, Indigenous");
});
test("invalid slug, mismatched member identity or unverified answers cannot appear",()=>{
  assert.throws(()=>sanitizePublicProfile(p,"different-member"));
  assert.throws(()=>sanitizePublicProfile({...p,profile:{...p.profile,userId:"invalid"}},"hello-member"));
  const r=sanitizePublicProfile({...p,publicAnswers:[{questionId:"unknown",optionId:"ignored"}]},"hello-member");
  assert.deepEqual(r.publicAnswers,[]);
});
