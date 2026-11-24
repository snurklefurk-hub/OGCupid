import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { adultBirthDate, scorePersona, handleOnboarding } from './onboarding.js';
import { PERSONA_V2_RUBRIC } from './persona-v2-scoring.js';
import { readFileSync } from 'node:fs';

test('birthdate is a real date and member is at least 18 today', () => {
  const today=new Date('2026-11-13T12:00:00Z');
  assert.equal(adultBirthDate('2008-11-13',today),true);
  assert.equal(adultBirthDate('2008-11-14',today),false);
  assert.equal(adultBirthDate('2007-02-29',today),false);
  assert.equal(adultBirthDate('2000-02-29',today),true);
});

test('Persona requires every answer and derives code from all axes', () => {
  assert.equal(scorePersona(Array(27).fill(2)),null);
  assert.equal(scorePersona([...Array(27).fill(2),null]),null);
  assert.equal(scorePersona(Array(28).fill(0)),null);
  assert.equal(scorePersona(Array(28).fill(2)),'DGLD');
});

test('Persona V2 server rubric exactly matches all 40 live quiz option orders and weights', () => {
  const html = readFileSync(new URL('../member-app/persona.html', import.meta.url), 'utf8');
  const key = '  const questions = ';
  const start = html.indexOf(key);
  const end = html.indexOf('\n];', start);
  assert.ok(start >= 0 && end > start, 'live V2 question data exists');
  const quiz = JSON.parse(html.slice(start + key.length, end + 2).trim());
  assert.equal(quiz.length, 40);
  assert.deepEqual(PERSONA_V2_RUBRIC, quiz.map(q => ({
    id:q.id, axis:q.axis, scores:q.options.map(o=>o.score)
  })));
});

test('all 40 V2 answers determine the saved persona, including neutral and opposite traits', () => {
  const choose = sign => PERSONA_V2_RUBRIC.map(q =>
    q.axis===null ? 0 : q.scores.reduce((best, score, i) =>
      score*sign > q.scores[best]*sign ? i : best, 0));
  assert.equal(scorePersona(choose(1)), 'DGLD');
  assert.equal(scorePersona(choose(-1)), 'RBSM');
  const choices=choose(1);
  assert.equal(scorePersona(choices.slice(0,39)),null);
  assert.equal(scorePersona([...choices,0,0]),null);
  assert.equal(scorePersona([...choices.slice(0,1),-1,...choices.slice(2)]),null);
  assert.equal(scorePersona([...choices.slice(0,1),99,...choices.slice(2)]),null);
  assert.equal(scorePersona([...choices.slice(0,1),null,...choices.slice(2)]),null);
  assert.equal(scorePersona(Array(40).fill(4)),null);
  // All neutral history answers can vary without changing any trait.
  const change=choices.slice();
  PERSONA_V2_RUBRIC.forEach((q,i)=>{if(q.axis===null)change[i]=q.scores.length-1;});
  assert.equal(scorePersona(change),scorePersona(choices));
});

test('V2 persona completion is saved for the signed-in member and rejects forged codes', async () => {
  const answers = PERSONA_V2_RUBRIC.map(q =>
    q.axis === null ? 0 : q.scores.reduce((best, score, i) => score > q.scores[best] ? i : best, 0));
  const code = scorePersona(answers);
  let updated = null;
  const client = {
    async query(sql, params) {
      if(sql.startsWith('SELECT o.primary_self_photo_id'))
        return {rowCount:1,rows:[{primary_self_photo_id:'some-photo'}]};
      if(sql.startsWith('UPDATE app_private.member_onboarding SET persona_code')) {
        updated = params;
        return {rowCount:1};
      }
      throw Error('Unexpected SQL: '+sql);
    }
  };
  const withMember = (_id,action) => action(client);
  const respond = (_request,body,status=200) => new Response(JSON.stringify(body),{status});
  const memberId='11111111-1111-4111-8111-111111111111';
  const makeRequest = payload => new Request('https://example.test/onboarding', {
    method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)
  });
  const verifiedPlace = async()=>{throw Error('Not needed');};
  const good=await handleOnboarding(makeRequest({step:'persona',answers,code}),
    memberId,withMember,respond,verifiedPlace);
  assert.equal(good.status,200);
  assert.deepEqual(await good.json(),{saved:true});
  assert.equal(updated[0],memberId);
  assert.equal(updated[1],code);
  assert.deepEqual(updated[2],answers);
  updated=null;
  const bad=await handleOnboarding(makeRequest({step:'persona',answers,code:'RBSM'}),
    memberId,withMember,respond,verifiedPlace);
  assert.equal(bad.status,400);
  assert.match((await bad.json()).error,/did not match/);
  assert.equal(updated,null);
});

test('signup preferences are stored atomically on the authenticated onboarding row without marking any later steps complete',async()=>{
  let params=null,sql=null,calls=0;
  const memberId='11111111-1111-4111-8111-111111111111';
  const withMember=(id,work)=>{assert.equal(id,memberId);calls++;return work({query:async(q,p)=>{sql=q;params=p;return {rowCount:1};}});};
  const json=(_,body,status=200)=>new Response(JSON.stringify(body),{status});
  const req=body=>new Request('https://example.test/onboarding',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const input={step:'signup-preferences',gender:'Enby',orientation:'Ace',interestedIn:['Intersex','Enby'],intentions:['new friends','casual sex']};
  const result=await handleOnboarding(req(input),memberId,withMember,json);
  assert.equal(result.status,200);
  assert.deepEqual(params,[memberId,'Enby','Ace',['Intersex','Enby'],['new friends','casual sex']]);
  assert.match(sql,/WHERE app_private.member_onboarding.explored_at IS NULL/);
  assert.doesNotMatch(sql,/details_complete|adult_attested_at|birth_date/);
  for(const invalid of [{...input,intentions:['activity partners']},{...input,interestedIn:['Man','Man']},{...input,gender:'invalid'}]){
    assert.equal((await handleOnboarding(req(invalid),memberId,withMember,json)).status,400);
  }
  assert.equal(calls,1);
  const denied=await handleOnboarding(req(input),memberId,(_id,work)=>work({query:async()=>({rowCount:0})}),json);
  assert.equal(denied.status,400);
});
