import test from "node:test";
import assert from "node:assert/strict";
import { scoreQuestionCompatibility, rankDiscoverableProfiles, SCORING_VERSION } from "./discovery-score.js";

const answer = (question_id, option_id, accepted, importance=1, is_private=false) => ({
  question_id, option_id, acceptable_options:accepted, importance, is_private
});

test("zero overlap never invents a match percentage",()=>{
  const result=scoreQuestionCompatibility([answer("q1","a",["a"])],[answer("q2","a",["a"])]);
  assert.equal(result.matchPercent,null);
  assert.equal(result.confidence,"insufficient");
  assert.equal(result.commonQuestions,0);
  assert.equal(result.scoringVersion,SCORING_VERSION);
});

test("one matching question is confidence-shrunk rather than 100%",()=>{
  const result=scoreQuestionCompatibility([answer("q1","a",["a"])],[answer("q1","a",["a"])]);
  assert.equal(result.matchPercent,58);
  assert.equal(result.commonQuestions,1);
  assert.equal(result.confidence,"low");
});

test("two-way perfect matches need sustained overlap to clear 75%",()=>{
  const make = n => Array.from({length:n},(_,i)=>answer("q"+i,"a",["a"],10));
  assert.equal(scoreQuestionCompatibility(make(5),make(5)).matchPercent,75);
  assert.ok(scoreQuestionCompatibility(make(10),make(10)).matchPercent > 75);
  assert.equal(scoreQuestionCompatibility(make(25),make(25)).confidence,"high");
});

test("a one-sided rejection prevents a perfect match",()=>{
  const a=[answer("q1","a",["b"],50)];
  const b=[answer("q1","a",["a"],1)];
  const result=scoreQuestionCompatibility(a,b);
  assert.equal(result.matchPercent,42);
});

test("importance weights are member-specific; dealbreaker dominates",()=>{
  const a=[answer("q1","a",["a"],1),answer("q2","a",["b"],250)];
  const b=[answer("q1","a",["a"],1),answer("q2","a",["a"],1)];
  const score=scoreQuestionCompatibility(a,b);
  const low=scoreQuestionCompatibility([a[0],{...a[1],importance:1}],b);
  assert.ok(score.matchPercent < low.matchPercent);
});

test("private answers are excluded even when both sides answered",()=>{
  const a=[answer("q1","a",["a"],1,true)];
  const b=[answer("q1","a",["a"])];
  const r=scoreQuestionCompatibility(a,b);
  assert.equal(r.matchPercent,null);
});

test("questions marked irrelevant on one side do not manufacture reciprocity",()=>{
  const a=[answer("q1","a",["a"],0)];
  const b=[answer("q1","a",["a"],1)];
  assert.equal(scoreQuestionCompatibility(a,b).matchPercent,null);
});

test("ranking includes unscored candidates and exposes only safe fields",()=>{
  const viewer=[answer("q1","a",["a"])];
  const yes=[answer("q1","a",["a"])];
  const none=[answer("q2","b",["b"])];
  const profiles=[
    {user_id:"p2",slug:"two",display_name:"Two",about_me:"hidden",email:"secret@example.invalid"},
    {user_id:"p1",slug:"one",display_name:"One",about_me:"hidden"}
  ];
  const byUser=new Map([["p1",yes],["p2",none]]);
  const ranked=rankDiscoverableProfiles(profiles,viewer,byUser);
  assert.deepEqual(ranked.map(x=>x.slug),["one","two"]);
  assert.equal(ranked[1].matchPercent,null);
  for(const p of ranked) {
    assert.deepEqual(Object.keys(p).sort(),[
      "commonQuestions","confidence","displayName","matchPercent","scoringVersion","slug","userId"
    ].sort());
  }
});

test("input arrays are never mutated by scoring",()=>{
  const a=Object.freeze([Object.freeze(answer("q1","a",["a"]))]);
  const b=Object.freeze([Object.freeze(answer("q1","a",["a"]))]);
  assert.equal(scoreQuestionCompatibility(a,b).matchPercent,58);
});
