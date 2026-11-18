import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {
  IMPORTANCE,publishedQuestions,savedAnswerMap,answerDraft,
  answerPayload,pickUnanswered
} from "./member-questions.mjs";

const context={window:{}};
runInNewContext(readFileSync(new URL("../../public/questions/question-bank.js",import.meta.url),"utf8"),context);
const QUESTIONS=publishedQuestions(context.window.OGCQuestionBank);
const example=QUESTIONS.find(q=>q.optionIds.length>=2);

test("React uses all 410 approved published questions, never a mock/demo bank",()=>{
  assert.equal(QUESTIONS.length,410);
  assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,410);
  assert.ok(QUESTIONS.every(q=>[10,50,100,250].includes(q.tier)));
});

test("first ten are mandatory; review modes do not leak editorial tiers",()=>{
  const answerMap=new Map();
  const first=pickUnanswered(QUESTIONS,answerMap,new Set(),()=>0.5);
  assert.equal(first.focusTier,"first10");
  assert.ok(QUESTIONS.filter(q=>q.tier===10).some(q=>q.id===first.question.id));
  assert.equal(IMPORTANCE.at(-1).label,"Dealbreaker");
  assert.equal(IMPORTANCE.some(item=>item.label==="Mandatory"),false);
});

test("same canonical tier logic preserves later-tier surprise questions",()=>{
  const firstTen=QUESTIONS.filter(q=>q.tier===10);
  assert.equal(firstTen.length,10);
  const saved=new Map(firstTen.map(q=>[q.id,{}]));
  const selection=pickUnanswered(QUESTIONS,saved,new Set(),()=>0.01);
  assert.equal(selection.focusTier,"next50");
  assert.equal(selection.servedFromOutsideTier,true);
  assert.ok([100,250].includes(selection.question.tier));
});

test("saved answers are scoped to published questions and have a safe edit draft",()=>{
  const answer={questionId:example.id,optionId:example.optionIds[0],
    acceptableOptions:[example.optionIds[0]],importance:50,isPrivate:true,
    note:"Still important."};
  const mapped=savedAnswerMap({answers:[answer,{...answer,questionId:"vault-999999999"}]},QUESTIONS);
  assert.equal(mapped.size,1);
  assert.deepEqual(answerDraft(example,mapped.get(example.id)),{
    optionId:answer.optionId,acceptableOptions:answer.acceptableOptions,
    importance:50,isPrivate:true,note:"Still important."
  });
  assert.throws(()=>savedAnswerMap({answers:null},QUESTIONS));
});

test("a persisted write requires one own choice, accepted choices, allowed weight and privacy flag",()=>{
  const draft={optionId:example.optionIds[0],acceptableOptions:[example.optionIds[0]],
    importance:250,isPrivate:false,note:"hello"};
  assert.deepEqual(answerPayload(example,draft),{questionId:example.id,...draft});
  assert.throws(()=>answerPayload(example,{...draft,acceptableOptions:[]}));
  assert.throws(()=>answerPayload(example,{...draft,importance:999}));
  assert.throws(()=>answerPayload(example,{...draft,optionId:"option-999"}));
  assert.throws(()=>answerPayload(example,{...draft,note:"x".repeat(401)}));
});

test("skipping cannot silently remove all remaining unanswered questions",()=>{
  const saved=new Map(QUESTIONS.slice(0,-1).map(q=>[q.id,{}]));
  const pick=pickUnanswered(QUESTIONS,saved,new Set([QUESTIONS.at(-1).id]),()=>0.5);
  assert.equal(pick.question.id,QUESTIONS.at(-1).id);
});
