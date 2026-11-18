import test from "node:test";
import assert from "node:assert/strict";
import {questionStage,nextQuestion,buildAnswer,checkedSavedAnswers,QUESTION_IMPORTANCE} from "./question-serving.mjs";
const qs=[
  {id:"vault-1",tier:10,optionIds:["option-0","option-1"]},
  {id:"vault-2",tier:10,optionIds:["option-0","option-1"]},
  {id:"vault-3",tier:50,optionIds:["option-0","option-1"]},
  {id:"vault-4",tier:100,optionIds:["option-0","option-1"]},
  {id:"vault-5",tier:250,optionIds:["option-0","option-1"]}
];
test("mandatory ten block later tiers even when 10% RNG favors detour",()=>{
  assert.equal(questionStage(qs,new Set()),10);
  assert.equal(nextQuestion(qs,new Set(),()=>0).question.tier,10);
  const a=new Set(["vault-1","vault-2"]);
  assert.equal(questionStage(qs,a),50);
  const served=nextQuestion(qs,a,()=>0);
  assert.equal(served.detour,true);
  assert.equal(served.question.tier,100);
  assert.equal(nextQuestion(qs,a,()=>0.9).question.tier,50);
});
test("Next100 also detours, Next250 never detours and exhaustion ends",()=>{
  const done=new Set(["vault-1","vault-2","vault-3"]);
  assert.equal(nextQuestion(qs,done,()=>0).question.tier,250);
  done.add("vault-4");
  const last=nextQuestion(qs,done,()=>0);
  assert.equal(last.question.tier,250);
  done.add("vault-5");
  assert.equal(nextQuestion(qs,done),null);
});
test("valid answer writes exact server shape, preserves only allowed options",()=>{
  const body=buildAnswer({question:qs[0],optionId:"option-1",
    acceptableOptions:["option-1","option-1"],importance:10,isPrivate:true,note:"Hello"});
  assert.deepEqual(body,{questionId:"vault-1",optionId:"option-1",
    acceptableOptions:["option-1"],importance:10,isPrivate:true,note:"Hello"});
  assert.equal(QUESTION_IMPORTANCE.length,5);
  assert.throws(()=>buildAnswer({question:qs[0],optionId:"bad",acceptableOptions:["bad"],importance:1,isPrivate:false,note:""}));
});
test("saved answer deserialization filters any malformed rows",()=>{
  const answers=checkedSavedAnswers({answers:[
    {questionId:"vault-1",optionId:"option-0",acceptableOptions:["option-0"],importance:1,isPrivate:false,note:"ok"},
    {questionId:"vault-2",optionId:"wrong",acceptableOptions:[],importance:1,isPrivate:false}
  ]},qs);
  assert.deepEqual([...answers.keys()],["vault-1"]);
});
