import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleQuickmatch} from "./member-quickmatch.js";

const YOU="00000000-0000-4000-8000-000000000001";
const THEM="00000000-0000-4000-8000-000000000002";
const OTHER="00000000-0000-4000-8000-000000000003";
const api=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../db/migrations/022_quickmatch_pair_state.sql",import.meta.url),"utf8");
const json=(_req,body,status=200)=>new Response(JSON.stringify(body),{status});
const request=(method="GET",body,headers={})=>new Request("https://example.neon.tech/quickmatch",{
  method,headers:{"Content-Type":"application/json",...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
});

function backend({eligible=true,saved=true}={}){
  const calls=[];
  const withMember=async (subject,callback)=>callback({query:async(sql,args)=>{
    calls.push({sql,args,subject});
    if(sql.includes("AS eligible"))return {rows:[{eligible}]};
    if(sql.includes("FROM app_private.member_quickmatch_decisions") && sql.includes("decision IS NOT NULL"))
      return {rows:[{target_user_id:THEM,decision:"like"}]};
    if(sql.includes("quickmatch_can_show"))return {rows:[{user_id:OTHER}]};
    if(sql.includes("quickmatch_pair_permitted"))return {rows:[{target_user_id:THEM}]};
    if(sql.includes("quickmatch_incoming_likes"))return {rows:[
      {target_user_id:THEM,liked_at:"2026-11-18T12:00:00Z"}
    ]};
    if(sql.includes("quickmatch_decide"))return {rows:[{saved}]};
    throw Error("Unexpected query "+sql);
  }});
  return {calls,withMember};
}

test("member route validates JWT/liveness before invoking pair state helper",()=>{
  assert.match(api,/quickmatchPath = url\.pathname === "\/quickmatch"/);
  assert.match(api,/quickmatchPath \? \["GET", "PUT"\]\.includes\(request\.method\)/);
  assert.match(api,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(api,/current_member_is_active\(\)/);
  assert.match(api,/handleQuickmatch\(request,userId,withMember,json\)/);
});

test("pair state migration revokes direct writes and authenticates SECURITY DEFINER helpers",()=>{
  assert.match(migration,/REVOKE INSERT, UPDATE ON app_private\.member_quickmatch_decisions FROM ogcupid_member_api/);
  assert.match(migration,/quickmatch_owner_insert/);
  assert.match(migration,/quickmatch_owner_update/);
  assert.match(migration,/SECURITY DEFINER/g);
  assert.match(migration,/current_setting\('app\.current_user_id',true\)/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/first_at\+interval '30 days'/);
  assert.match(migration,/strikes>=2/);
  assert.match(migration,/UPDATE app_private\.member_quickmatch_decisions SET decision=NULL/);
  assert.match(migration,/match_penalty_points=5\*\(d\.dislike_count\+1\)/);
  assert.match(migration,/friend_penalty_points=CASE WHEN d\.dislike_count\+1>=2 THEN 5 ELSE 0 END/);
  assert.match(migration,/viewer::text=nullif\(current_setting\('app\.current_user_id',true\),''\)/);
  assert.match(migration,/FROM PUBLIC,ogcupid_delete_api/);
  assert.doesNotMatch(migration,/GRANT INSERT ON app_private\.member_quickmatch_decisions TO ogcupid_member_api/);
});

test("GET returns only safe eligible IDs and owner-authorized incoming/outgoing likes",async()=>{
  const b=backend();
  const response=await handleQuickmatch(request(),YOU,b.withMember,json);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body,{
    decisions:[{targetUserId:THEM,decision:"like"}],
    eligibleUserIds:[OTHER],
    outgoingLikes:[THEM],incomingLikes:[THEM],mutualUserIds:[THEM]
  });
  assert.equal(b.calls.length,5);
  assert.ok(b.calls.every(x=>x.subject===YOU));
  assert.ok(b.calls.every(x=>x.args[0]===YOU));
  assert.match(b.calls[1].sql,/WHERE user_id=\$1::uuid/);
  assert.match(b.calls[2].sql,/quickmatch_can_show/);
  assert.doesNotMatch(JSON.stringify(body),/email|birth_date|note|dislike_count/i);
});

test("unfinished own onboarding sees neither queue nor incoming likes",async()=>{
  const b=backend({eligible:false});
  const res=await handleQuickmatch(request(),YOU,b.withMember,json);
  assert.equal(res.status,403);
  assert.equal(b.calls.length,1);
});

test("PUT delegates to secure pair transition, not ad-hoc cross-owner INSERT",async()=>{
  const b=backend();
  const r=await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"like"}),YOU,b.withMember,json);
  assert.deepEqual(await r.json(),{saved:true,targetUserId:THEM,decision:"like"});
  assert.equal(b.calls.length,1);
  assert.match(b.calls[0].sql,/app_private\.quickmatch_decide\(\$1::uuid,\$2::uuid,\$3::text\)/);
  assert.deepEqual(b.calls[0].args,[YOU,THEM,"like"]);
});

test("second strike/cooldown/backend conflict cannot claim saved vote",async()=>{
  const b=backend({saved:false});
  const r=await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"dislike"}),YOU,b.withMember,json);
  assert.equal(r.status,409);
  assert.equal((await r.json()).saved,undefined);
});

test("invalid targets, self, unexpected fields and methods fail before SQL",async()=>{
  const b=backend();
  for(const body of [
    {targetUserId:YOU,decision:"like"},
    {targetUserId:"../test",decision:"like"},
    {targetUserId:THEM,decision:"neutral"},
    {targetUserId:THEM,decision:"dislike",userId:OTHER}
  ])assert.equal((await handleQuickmatch(request("PUT",body),YOU,b.withMember,json)).status,400);
  assert.equal((await handleQuickmatch(request("POST",{targetUserId:THEM,decision:"like"}),YOU,b.withMember,json)).status,405);
  assert.equal(b.calls.length,0);
});

test("bad content-type and oversized payload cannot reach database",async()=>{
  const b=backend();
  assert.equal((await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"like"},{"Content-Type":"text/plain"}),YOU,b.withMember,json)).status,415);
  assert.equal((await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"like",memo:"x".repeat(700)}),YOU,b.withMember,json)).status,413);
  assert.equal(b.calls.length,0);
});
