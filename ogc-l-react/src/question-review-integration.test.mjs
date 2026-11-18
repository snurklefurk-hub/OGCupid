import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkedSavedAnswers,buildAnswer,QUESTION_IMPORTANCE} from "./question-serving.mjs";

const source = file=>readFileSync(new URL(file,import.meta.url),"utf8");
const jsx=source("./MatchQuestions.jsx");
const profile=source("./PublicMemberProfile.jsx");
const about=source("./ProfileEditor.jsx");
const app=source("./App.jsx");

test("the canonical Questions route has ONE member-gated component, not competing editors",()=>{
  const routes=app.match(/path="questions"/g)||[];
  assert.equal(routes.length,1);
  assert.match(app, /<MemberGate><MatchQuestions \/><\/MemberGate>/);
  assert.doesNotMatch(app,/QuestionEditor/);
});

test("saved answers can be selected and revised using the same Neon owner-only API",()=>{
  assert.match(jsx,/reviewId/);
  assert.match(jsx,/setReviewId\(event\.target\.value\)/);
  assert.match(jsx,/answers\.get\(reviewId\)/);
  assert.match(jsx,/saveMatchAnswer\(response\)/);
  assert.match(jsx,/Update saved answer/);
  assert.match(jsx,/Saved changes to your answer/);
  assert.doesNotMatch(jsx,/localStorage|sessionStorage/i);
});

test("public member profile has no editor link for other members",()=>{
  assert.match(profile, /profile\.isOwner&&<p><NavLink to="\/questions"/);
  assert.match(about, /to="\/questions"/);
  assert.match(app, /path="questions" element=\{<MemberGate><MatchQuestions/);
});

test("member-facing Questions progress is one unsegmented pool",()=>{
  assert.doesNotMatch(jsx,/stageLabel|current\.detour|First 10|Next 50|Next 100|Next 250|A question from a later set/);
  assert.match(jsx,/question\{progress===1\?"":"s"\} answered/);
  assert.doesNotMatch(jsx, /\{progress\} \/ \{bank\.length\}/);
});

test("saved answer edit retains accepted choices, privacy, importance and note",()=>{
  const question={id:"vault-11",optionIds:["option-0","option-1"]};
  const previous={questionId:question.id,optionId:"option-1",
    acceptableOptions:["option-0","option-1"],importance:250,isPrivate:true,note:"No thanks"};
  const stored=checkedSavedAnswers({answers:[previous]},[question]).get(question.id);
  assert.deepEqual(buildAnswer({question,...stored}),previous);
  assert.equal(QUESTION_IMPORTANCE.at(-1).label,"Dealbreaker");
  assert.match(jsx,/Any of the above — irrelevant to compatibility/);
});
