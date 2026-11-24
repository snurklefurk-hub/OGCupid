import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleTestAccountPurge} from "./disposable-test-account.js";
const cutoff=Date.parse("2026-11-24T20:15:00Z");
const id="11111111-1111-4111-8111-111111111111";
const event={version:1,invocation_id:"scheduled-1",trigger:{type:"schedule",name:"ogc-disposable-test-account"},data:{scheduled_at:new Date(cutoff).toISOString()}};
const req=(body=event,header=true,method="POST")=>new Request("https://example.test/internal/disposable-test-purge",{method,headers:header?{"x-neon-trigger-invocation-id":"scheduled-1"}:{},...(method==="POST"?{body:JSON.stringify(body)}:{})});
const json=(_,body,status=200)=>new Response(JSON.stringify(body),{status});
test("only the named Neon schedule can invoke deletion, and no caller-provided target is accepted",async()=>{
  const forbidden=()=>{throw Error("must not run SQL");};
  for(const [r,status] of [[req(event,false),401],[req({...event,invocation_id:"spoof"}),400],[req({...event,trigger:{type:"schedule",name:"other"}}),400],[req({...event,data:{scheduled_at:"2026-11-24T20:16:00Z"}}),400],[req(event,true,"GET"),405]]){
    assert.equal((await handleTestAccountPurge(r,forbidden,forbidden,json,cutoff+1000)).status,status);
  }
});
test("scheduled cutoff, SQL-owned targets and private photo cleanup are used, not request identifiers",async()=>{
  const calls=[],photos=[];
  const db=(actor,action)=>{assert.equal(actor,"");return action({query:async(sql,params)=>{calls.push({sql,params});return {rows:[{user_id:id}]};}});};
  const r=await handleTestAccountPurge(req({...event,user_id:"arbitrary",email:"someone@example.invalid"}),db,async owner=>photos.push(owner),json,cutoff+1000);
  assert.equal(r.status,200);
  assert.deepEqual(calls[0].params,[new Date(cutoff).toISOString()]);
  assert.match(calls[0].sql,/purge_disposable_test_account/);
  assert.deepEqual(photos,[id]);
  assert.deepEqual(calls[1].params,[id]);
  assert.match(calls[1].sql,/finish_disposable_test_photo_cleanup/);
});
test("storage failure returns retry status and never acknowledges the pending cleanup",async()=>{
  let calls=0;
  const db=(_,action)=>action({query:async()=>{calls++;return {rows:[{user_id:id}]};}});
  const r=await handleTestAccountPurge(req(),db,async()=>{throw Error("storage unavailable");},json,cutoff+1000);
  assert.equal(r.status,503);assert.equal(calls,1);
});
test("migration is exact-email scoped, protects newer replacements and grants only deletion role",()=>{
  const sql=readFileSync(new URL("../db/migrations/038_disposable_test_account.sql",import.meta.url),"utf8");
  assert.match(sql,/WHERE lower\(email\)='test@test\.com' AND "createdAt"<=p_cutoff FOR UPDATE/);
  assert.match(sql,/DELETE FROM neon_auth\."user" WHERE id=test_id AND lower\(email\)='test@test\.com'/);
  assert.match(sql,/REVOKE ALL ON FUNCTION app_private\.purge_disposable_test_account\(timestamptz\) FROM PUBLIC,ogcupid_member_api/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION app_private\.purge_disposable_test_account\(timestamptz\) TO ogcupid_delete_api/);
  assert.match(sql,/DELETE FROM app_private\.previously_registered_emails WHERE lower\(email\)='test@test\.com'/);
  assert.match(sql,/NOT EXISTS\(SELECT 1 FROM neon_auth\."user" WHERE id=p_user\)/);
});
