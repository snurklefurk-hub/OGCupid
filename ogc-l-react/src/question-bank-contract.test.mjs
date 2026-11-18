import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkedQuestionBank,nextQuestion,QUESTION_IMPORTANCE} from "./question-serving.mjs";

const source=readFileSync(new URL("../../public/questions/question-bank.js",import.meta.url),"utf8");
const body=source.slice(source.indexOf("window.OGCQuestionBank = ")+
  "window.OGCQuestionBank = ".length).trim().replace(/;\s*$/,"");
const bank=checkedQuestionBank(JSON.parse(body).questions);
const vite=readFileSync(new URL("../vite.config.js",import.meta.url),"utf8");
const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
const gateway=readFileSync(new URL("./member-gateway.mjs",import.meta.url),"utf8");

test("the owner-curated published bank contains exactly 10+50+100+250 unique questions",()=>{
  assert.equal(bank.length,410);
  const counts=Object.fromEntries([10,50,100,250].map(t=>[t,bank.filter(q=>q.tier===t).length]));
  assert.deepEqual(counts,{"10":10,"50":50,"100":100,"250":250});
  assert.equal(new Set(bank.map(q=>q.id)).size,410);
});
test("first tier is mandatory, and 10 percent spillover only starts after ten",()=>{
  assert.equal(nextQuestion(bank,new Set(),()=>0).question.tier,10);
  const answered10=new Set(bank.filter(q=>q.tier===10).map(q=>q.id));
  const serve=nextQuestion(bank,answered10,()=>0);
  assert.equal(serve.stage,50);
  assert.equal(serve.detour,true);
  assert.ok([100,250].includes(serve.question.tier));
});
test("staging serves the authentic question bank and React PUT stores answers with auth",()=>{
  assert.match(vite,/question-bank\.js/);
  assert.match(app,/<MemberGate><MatchQuestions \/><\/MemberGate>/);
  assert.match(gateway,/method:"PUT",credentials:"omit",cache:"no-store"/);
  assert.match(gateway,/memberApiBaseUrl\+"\/answers"/);
  assert.match(gateway,/result\?\.saved!==true/);
  assert.equal(QUESTION_IMPORTANCE.length,5);
});
