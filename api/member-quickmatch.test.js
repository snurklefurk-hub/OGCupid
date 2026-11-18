import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleQuickmatch} from "./member-quickmatch.js";

const YOU="00000000-0000-4000-8000-000000000001";
const THEM="00000000-0000-4000-8000-000000000002";
const api=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../db/migrations/021_member_quickmatch_decisions.sql",import.meta.url),"utf8");
const json=(_request,body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const request=(method="GET",body,headers={})=>new Request("https://example.neon.tech/quickmatch",{
  method,headers:{"Content-Type":"application/json",...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
});
function db(eligible=true) {
  const queries=[];
  const withMember=async (userId,operation)=>operation({query:async(sql,values)=>{
    queries.push({sql,values,userId});
    if(sql.includes("AS eligible"))return {rows:[{eligible}]};
    if(sql.includes("SELECT target_user_id,decision"))return {rows:[{target_user_id:THEM,decision:"like"}]};
    if(sql.includes("INSERT INTO"))return {rows:eligible?[{target_user_id:THEM,decision:values[2]}]:[]};
    throw Error("Unexpected query");
  }});
  return {queries,withMember};
}

test("Quickmatch is reachable only behind the existing JWT and member-liveness gate",()=>{
  assert.match(api,/quickmatchPath = url\.pathname === "\/quickmatch"/);
  assert.match(api,/quickmatchPath \? \["GET", "PUT"\]\.includes\(request\.method\)/);
  assert.match(api,/profilePath \|\| memberProfileMatch \|\| discoveryPath \|\| quickmatchPath/);
  assert.match(api,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(api,/current_member_is_active\(\)/);
  assert.match(api,/handleQuickmatch\(request,userId,withMember,json\)/);
  assert.match(api,/allowedOrigins\.has\(origin\)/);
});

test("migration gives only member API role and authenticated owner RLS",()=>{
  assert.match(migration,/REFERENCES neon_auth\."user"\(id\) ON DELETE CASCADE/g);
  assert.match(migration,/CHECK \(user_id <> target_user_id\)/);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/);
  assert.match(migration,/GRANT SELECT, INSERT, UPDATE .*ogcupid_member_api/);
  assert.match(migration,/REVOKE ALL .*PUBLIC, ogcupid_delete_api/);
  assert.match(migration,/current_setting\('app\.current_user_id', true\)/);
  assert.doesNotMatch(migration,/GRANT .* ON app_private\.member_quickmatch_decisions TO PUBLIC/);
});

test("GET returns only the requesting owner's decisions and no target account PII",async()=>{
  const store=db();
  const response=await handleQuickmatch(request(),YOU,store.withMember,json);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{decisions:[{targetUserId:THEM,decision:"like"}]});
  assert.equal(store.queries.length,2);
  assert.deepEqual(store.queries[1].values,[YOU]);
  assert.match(store.queries[1].sql,/WHERE user_id=\$1::uuid/);
  assert.doesNotMatch(JSON.stringify(await response.headers.get("X-Debug"))||"",/email/i);
});

test("unfinished member cannot load Quickmatch decisions",async()=>{
  const store=db(false);
  const r=await handleQuickmatch(request(),YOU,store.withMember,json);
  assert.equal(r.status,403);
  assert.equal(store.queries.length,1);
});

test("PUT upserts a Like for a verified discoverable target; repeat updates same row",async()=>{
  const store=db();
  const r=await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"like"}),YOU,store.withMember,json);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{saved:true,targetUserId:THEM,decision:"like"});
  assert.equal(store.queries.length,1);
  assert.deepEqual(store.queries[0].values,[YOU,THEM,"like"]);
  assert.match(store.queries[0].sql,/ON CONFLICT \(user_id,target_user_id\)/);
  assert.match(store.queries[0].sql,/app_private\.is_discoverable_member\(\$1::uuid\)/);
  assert.match(store.queries[0].sql,/app_private\.is_discoverable_member\(\$2::uuid\)/);
});

test("invalid target, self vote, unexpected fields and methods cannot write",async()=>{
  const store=db();
  for(const body of [
    {targetUserId:YOU,decision:"like"},
    {targetUserId:"javascript:alert(1)",decision:"like"},
    {targetUserId:THEM,decision:"unlike"},
    {targetUserId:THEM,decision:"like",userId:YOU}
  ]) {
    const r=await handleQuickmatch(request("PUT",body),YOU,store.withMember,json);
    assert.equal(r.status,400);
  }
  const unsupported=await handleQuickmatch(request("POST",{targetUserId:THEM,decision:"like"}),YOU,store.withMember,json);
  assert.equal(unsupported.status,405);
  assert.equal(store.queries.length,0);
});

test("non-discoverable target cannot be rated; no false save confirmation",async()=>{
  const store=db(false);
  const r=await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"dislike"}),YOU,store.withMember,json);
  assert.equal(r.status,409);
  assert.equal((await r.json()).saved,undefined);
});

test("untrusted content-type and oversized payload are rejected before database calls",async()=>{
  const store=db();
  const a=await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"like"},{"Content-Type":"text/plain"}),YOU,store.withMember,json);
  assert.equal(a.status,415);
  const large=await handleQuickmatch(request("PUT",{targetUserId:THEM,decision:"like",memo:"x".repeat(700)}),YOU,store.withMember,json);
  assert.equal(large.status,413);
  assert.equal(store.queries.length,0);
});
