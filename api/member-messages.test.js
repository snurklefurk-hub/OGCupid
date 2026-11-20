import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleMessages} from "./member-messages.js";

const SELF="00000000-0000-4000-8000-000000000001";
const PEER="00000000-0000-4000-8000-000000000002";
const MID="00000000-0000-4000-8000-000000000003";
const now="2026-11-18T18:00:00.000Z";
const api=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../db/migrations/022_member_private_messages.sql",import.meta.url),"utf8");
const json=(_req,body,status=200)=>new Response(JSON.stringify(body),{status});
function req(path,method="GET",body,ctype="application/json"){
  return new Request("https://members.example"+path,{
    method,headers:{"Content-Type":ctype},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
}
const row={id:MID,sender_id:SELF,recipient_id:PEER,body:"Hello.",created_at:now};
function harness({allowed=true,tooSoon=false,daily=0,peerExists=true,evidence=true,ownBlock=false}={}){
  const calls=[];
  const withMember=async (user,callback)=>callback({query:async(sql,args=[])=>{
    calls.push({sql,args,user});
    if(sql.includes("AS ok"))return{rows:[{ok:true}]};
    if(sql.includes("pg_advisory_xact_lock"))return{rows:[]};
    if(sql.includes("AS allowed"))return{rows:[{allowed}]};
    if(sql.includes("SELECT app_private.member_pair_blocked"))return{rows:[{blocked:false}]};
    if(sql.includes("set_site_block"))return{rows:[{result:{blocked:args[1],permanent:false}}]};
    if(sql.includes("AS daily"))return{rows:[{daily,too_soon:tooSoon}]};
    if(sql.includes("INSERT INTO app_private.member_messages"))return{rows:[row]};
    if(sql.includes("INSERT INTO app_private.member_message_reports"))return{rows:[]};
    if(sql.includes("INSERT INTO app_private.member_message_blocks"))return{rows:[]};
    if(sql.includes("DELETE FROM app_private.member_message_blocks"))return{rows:[]};
    if(sql.includes("SELECT 1 FROM app_private.member_profile_routes"))return{rows:peerExists?[{ok:true}]:[]};
    if(sql.includes("SELECT 1 FROM app_private.member_messages"))return{rows:evidence?[{ok:true}]:[]};
    if(sql.includes("SELECT p.display_name,r.slug"))return{rows:peerExists?[{display_name:"Peer",slug:"peer"}]:[]};
    if(sql.includes("SELECT id,sender_id,recipient_id,body"))return{rows:[row]};
    if(sql.includes("SELECT 1 FROM app_private.member_message_blocks"))return{rows:ownBlock?[{ok:true}]:[]};
    if(sql.includes("WITH latest"))return{rows:[{peer_id:PEER,display_name:"Peer",slug:"peer",...row}]};
    throw Error("Unexpected query: "+sql);
  }});
  return{calls,withMember};
}
const execute=async(path,method,body,store=harness())=>{
  const request=req(path,method,body);
  const response=await handleMessages(request,SELF,new URL(request.url),store.withMember,json);
  return{status:response.status,body:await response.json(),calls:store.calls};
};

test("messages routes retain JWT, account-liveness and exact-origin authorization",()=>{
  assert.match(api,/messagePath = \/\^\\\/messages/);
  assert.match(api,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(api,/current_member_is_active\(\)/);
  assert.match(api,/handleMessages\(request,userId,url,withMember,json\)/);
  assert.match(api,/allowedOrigins\.has\(origin\)/);
});
test("migration enforces forced RLS, owner-only blocks, participant-only reads and reporting privacy",()=>{
  assert.match(migration,/FORCE ROW LEVEL SECURITY/g);
  assert.match(migration,/message_participants_read/);
  assert.match(migration,/message_sender_insert/);
  assert.match(migration,/app_private\.can_message_member\(recipient_id\)/);
  assert.match(migration,/message_block_owner_insert/);
  assert.match(migration,/message_block_owner_delete/);
  assert.match(migration,/GRANT INSERT ON app_private\.member_message_reports TO ogcupid_member_api/);
  assert.doesNotMatch(migration,/GRANT SELECT ON app_private\.member_message_reports/);
  assert.match(migration,/m\.recipient_id = reporter_id/);
  assert.match(migration,/ON DELETE CASCADE/g);
});
test("inbox lists only real member conversation records",async()=>{
  const r=await execute("/messages","GET");
  assert.equal(r.status,200);
  assert.equal(r.body.conversations.length,1);
  assert.equal(r.body.conversations[0].peerId,PEER);
  assert.equal(r.body.conversations[0].lastMessage.body,"Hello.");
  assert.deepEqual(r.calls.at(-1).args,[SELF]);
});
test("conversation reads only participant pair and returns private block state",async()=>{
  const r=await execute("/messages/"+PEER,"GET");
  assert.equal(r.status,200);
  assert.deepEqual(r.body.peer,{userId:PEER,displayName:"Peer",slug:"peer"});
  assert.equal(r.body.messages.length,1);
  assert.equal(r.body.canSend,true);
  const selects=r.calls.filter(c=>c.sql.includes("FROM app_private.member_messages"));
  assert.equal(selects[0].args[0],SELF);
  assert.equal(selects[0].args[1],PEER);
});
test("sending serializes by sender and enforces server-side capacity before INSERT",async()=>{
  const r=await execute("/messages/"+PEER,"POST",{body:"  Hello.  "});
  assert.equal(r.status,200);
  assert.equal(r.body.sent,true);
  assert.equal(r.body.message.body,"Hello.");
  assert.match(r.calls[0].sql,/pg_advisory_xact_lock/);
  assert.match(r.calls[1].sql,/can_message_member/);
  assert.match(r.calls[2].sql,/24 hours/);
  assert.deepEqual(r.calls.at(-1).args,[SELF,PEER,"Hello."]);
  const full=await execute("/messages/"+PEER,"POST",{body:"Hello"},harness({daily:60}));
  assert.equal(full.status,429);
  assert.ok(!full.calls.some(c=>c.sql.includes("INSERT INTO app_private.member_messages")));
  const burst=await execute("/messages/"+PEER,"POST",{body:"Hello"},harness({tooSoon:true}));
  assert.equal(burst.status,429);
});
test("blocked/unavailable recipient, invalid bodies and self messaging never persist",async()=>{
  const blocked=await execute("/messages/"+PEER,"POST",{body:"Hi"},harness({allowed:false}));
  assert.equal(blocked.status,409);
  assert.ok(!blocked.calls.some(c=>c.sql.includes("INSERT INTO app_private.member_messages")));
  for(const value of [{body:""},{body:"x".repeat(2001)},{message:"oops"}]){
    const r=await execute("/messages/"+PEER,"POST",value);
    assert.equal(r.status,400);
    assert.equal(r.calls.length,0);
  }
  assert.equal((await execute("/messages/"+SELF,"POST",{body:"Hi"})).status,400);
});
test("block and unblock affect only caller and peer, and reports require received message",async()=>{
  const block=await execute("/messages/"+PEER+"/block","PUT");
  assert.equal(block.body.blocked,true);
  assert.deepEqual(block.calls.at(-1).args,[PEER,true]);
  const unblock=await execute("/messages/"+PEER+"/block","DELETE");
  assert.equal(unblock.body.blocked,false);
  assert.deepEqual(unblock.calls.at(-1).args,[PEER,false]);
  const report=await execute("/messages/"+PEER+"/report","POST",{messageId:MID,reason:"spam"});
  assert.equal(report.body.reported,true);
  assert.deepEqual(report.calls[0].args,[MID,PEER,SELF]);
  const invalid=await execute("/messages/"+PEER+"/report","POST",{messageId:MID,reason:"spam"},harness({evidence:false}));
  assert.equal(invalid.status,404);
  assert.ok(!invalid.calls.some(c=>c.sql.includes("INSERT INTO app_private.member_message_reports")));
});
test("unsupported methods, report reasons and forged route do not write to database",async()=>{
  const invalid=await execute("/messages/"+PEER+"/report","POST",{messageId:MID,reason:"pwn"});
  assert.equal(invalid.status,400);
  assert.equal(invalid.calls.length,0);
  const wrong=await execute("/messages/"+PEER+"/block","POST");
  assert.equal(wrong.status,405);
  assert.equal(wrong.calls.length,0);
  const route=await execute("/messages/../profile","GET");
  assert.equal(route.status,404);
});
