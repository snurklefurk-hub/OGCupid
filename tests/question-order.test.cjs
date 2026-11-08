'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const order=require('../public/questions/question-order.js');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/questions/question-bank.js'),'utf8'),sandbox);
const qs=Array.from(sandbox.window.OGCQuestionBank.questions);
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
const before=tier=>new Set(qs.filter(q=>q.tier<tier).map(q=>q.id));
test('only the 410 selected questions, with valid stable answer IDs and exact tier counts',()=>{
 assert.equal(qs.length,410);assert.equal(new Set(qs.map(q=>q.id)).size,410);
 for(const tier of order.TIERS)assert.equal(qs.filter(q=>q.tier===tier).length,tier);
 for(const q of qs){assert.ok(q.prompt.trim());assert.ok(q.options.length>=2);assert.equal(q.options.length,q.optionIds.length);assert.equal(new Set(q.optionIds).size,q.optionIds.length);assert.ok(q.options.every(x=>typeof x==='string'&&x.trim()))}
});
test('all ten essentials are mandatory, including when other questions are already answered',()=>{
 const answered=new Set(qs.filter(q=>q.tier!==10).map(q=>q.id));
 for(let i=0;i<10;i++){const p=order.pickNext(qs,answered,()=>0);assert.equal(p.stage,10);assert.equal(p.question.tier,10);assert.equal(p.detour,false);assert.ok(!answered.has(p.question.id));answered.add(p.question.id)}
 assert.equal(order.pickNext(qs,answered),null);
});
test('10 percent branch draws outside the 50 or 100 set, boundary 0.1 stays in set',()=>{
 for(const tier of [50,100]){
  for(const [roll,detour] of [[0,true],[0.099999,true],[0.1,false],[0.999,false]]){
   let calls=0;const p=order.pickNext(qs,before(tier),()=>calls++===0?roll:0.5);
   assert.equal(p.detour,detour);assert.equal(p.stage,tier);
   assert.ok(detour?p.question.tier>tier:p.question.tier===tier);
  }
 }
});
test('outside draws already answered are omitted when their own tier starts',()=>{
 const answered=before(50),p=order.pickNext(qs,answered,()=>0);answered.add(p.question.id);
 qs.filter(q=>q.tier===50).forEach(q=>answered.add(q.id));
 assert.equal(order.stage(qs,answered),100);
 for(let i=0;i<100;i++){const next=order.pickNext(qs,answered,()=>0.5);assert.notEqual(next.question.id,p.question.id);assert.equal(next.question.tier,100);answered.add(next.question.id)}
});
test('no outside draw when future sets are exhausted; final 250 is random with no modifier',()=>{
 const answered=new Set(qs.filter(q=>q.tier!==50).map(q=>q.id));
 assert.equal(order.pickNext(qs,answered,()=>0).question.tier,50);
 const first=order.pickNext(qs,before(250),()=>0),last=order.pickNext(qs,before(250),()=>0.999);
 assert.equal(first.stage,250);assert.equal(first.detour,false);assert.notEqual(first.question.id,last.question.id);
});
test('complete randomized runs answer all 410 once and respect active-stage eligibility',()=>{
 for(let seed=1;seed<=60;seed++){
  const random=rng(seed),answered=new Set;
  for(let i=0;i<410;i++){
   const stage=order.stage(qs,answered),p=order.pickNext(qs,answered,random);
   assert.ok(p);assert.equal(p.stage,stage);assert.ok(!answered.has(p.question.id));
   assert.ok(p.detour?p.question.tier>stage:p.question.tier===stage);
   if(i<10)assert.equal(p.question.tier,10);
   answered.add(p.question.id);
  }
  assert.equal(answered.size,410);assert.equal(order.pickNext(qs,answered,random),null);
 }
});
test('skip excludes the pending unanswered question when alternatives exist',()=>{
 const answered=before(50),pending=qs.find(q=>q.tier===50);
 assert.notEqual(order.pickNext(qs,answered,()=>0.5,pending.id).question.id,pending.id);
 assert.ok(!answered.has(pending.id));assert.equal(order.stage(qs,new Set),10);
});
test('first, 50, 100, and 250 sets all randomize, and the modifier measures about 10 percent',()=>{
 for(const tier of order.TIERS){
  const answered=before(tier),seen=new Set;const random=rng(400+tier);
  for(let i=0;i<2000;i++)seen.add(order.pickNext(qs,answered,random).question.id);
  assert.ok(seen.size>Math.min(tier,8));
 }
 const random=rng(42),answered=before(50);let count=0;
 for(let i=0;i<30000;i++)if(order.pickNext(qs,answered,random).detour)count++;
 assert.ok(count>2800&&count<3200,'outside draws: '+count);
});
