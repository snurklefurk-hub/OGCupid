import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sanitizePublicProfile} from "./member-public-profile.mjs";
import {checkedQuestionBank} from "./question-serving.mjs";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const raw=source("../../public/questions/question-bank.js");
const body=raw.slice(raw.indexOf("window.OGCQuestionBank = ")+"window.OGCQuestionBank = ".length).trim().replace(/;\s*$/,"");
const bank=checkedQuestionBank(JSON.parse(body).questions);
const question=bank[0];
const memberId="00000000-0000-4000-8000-000000000001";
const base={userId:memberId,slug:"readable-member",displayName:"Readable Member",age:34,aboutMe:"Hi"};
const valid=q=>({questionId:q.id,optionId:q.optionIds[0],note:"An actual explanation",isPrivate:false});
function view(isOwner,answers){
 return sanitizePublicProfile({profile:base,isOwner,publicAnswers:answers},"readable-member");
}
test("peer profile receives public answer and explanation only",()=>{
 const publicAnswer=valid(question);
 const hidden={...publicAnswer,questionId:bank[1].id,note:"Owner-only thought",isPrivate:true};
 const data=view(false,[publicAnswer,hidden]);
 assert.equal(data.publicAnswers.length,1);
 assert.deepEqual(data.publicAnswers[0],publicAnswer);
 assert.equal(JSON.stringify(data).includes("Owner-only thought"),false);
});
test("owner profile includes owner-private answers, explicitly marked private",()=>{
 const hidden={...valid(bank[1]),isPrivate:true};
 const data=view(true,[valid(question),hidden]);
 assert.equal(data.publicAnswers.length,2);
 assert.equal(data.publicAnswers[1].isPrivate,true);
});
test("public sanitizer rejects invalid notes and never exposes accepted partner answers",()=>{
 const result=view(false,[{
   ...valid(question),note:"okay",acceptableOptions:["option-1"],importance:250
 },{...valid(bank[1]),note:"n".repeat(401)}]);
 assert.equal(result.publicAnswers.length,1);
 assert.equal(JSON.stringify(result).includes("acceptableOptions"),false);
 assert.equal(JSON.stringify(result).includes("importance"),false);
});
test("profile Questions renders real bank and only owner can inline-edit saved answers",()=>{
 const api=source("../../api/member-profile.ts");
 const migration=source("../../db/migrations/025_member_visible_question_answers.sql");
 const page=source("./ProfileQuestions.jsx");
 const shared=source("./published-question-bank.mjs");
 assert.match(api,/visible_member_public_answers/);
 assert.match(api,/isOwner\s*\?\s*`SELECT question_id,option_id,note,is_private/);
 assert.match(migration,/a\.is_private=false/);
 assert.match(migration,/SECURITY DEFINER/);
 assert.match(migration,/REVOKE ALL ON FUNCTION/);
 assert.match(migration,/is_discoverable_member/);
 assert.match(page,/loadPublishedBank\(\)/);
 assert.match(page,/loadMatchAnswers\(\)/);
 assert.match(page,/checkedSavedAnswers/);
 assert.match(page,/profile.isOwner&&myAnswer&&<button/);
 assert.match(page,/both answered/);
 assert.match(page,/myAnswer\.acceptableOptions\.includes\(answer.optionId\)/);
 assert.match(page,/buildAnswer/);
 assert.match(page,/keep.*private/i);
 assert.doesNotMatch(page,/localStorage|sessionStorage|setInterval|demo answer/);
 assert.match(shared,/checkedQuestionBank/);
});
