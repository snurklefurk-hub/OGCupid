import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleAdmin,isAdminPath,adminMethodAllowed} from "./member-admin.js";

const ME="00000000-0000-4000-8000-000000000001";
const REPORT="00000000-0000-4000-8000-000000000002";
const TARGET="00000000-0000-4000-8000-000000000003";
const api=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../db/migrations/027_admin_moderation.sql",import.meta.url),"utf8");
const json=(_req,body,status=200)=>new Response(JSON.stringify(body),{status});
const request=(path,method="GET",body,headers={})=>new Request("https://member.example"+path,{
  method,headers:{"Content-Type":"application/json",...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
});
function harness({error=null,result={accounts:13}}={}){
  const calls=[];
  return {calls,withMember:async(uid,callback)=>callback({query:async(sql,args=[])=>{
    calls.push({uid,sql,args});
    if(error)throw error;
    return {rows:[{data:result}]};
  }})};
}
async function send(path,method="GET",body,store=harness(),headers={}){
  const req=request(path,method,body,headers);
  const res=await handleAdmin(req,ME,new URL(req.url),store.withMember,json);
  return {status:res.status,body:await res.json(),calls:store.calls};
}

test("admin routes use the same signed JWT, liveness and origin gates as member endpoints",()=>{
  assert.match(api,/import \{ isAdminPath, adminMethodAllowed, handleAdmin \}/);
  assert.match(api,/const adminPath = isAdminPath\(url.pathname\)/);
  assert.match(api,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(api,/messagePath \|\| adminPath \|\| answersPath/);
  assert.match(api,/current_member_is_active\(\)/);
  assert.match(api,/allowedOrigins\.has\(origin\)/);
  assert.match(api,/return await handleAdmin\(request,userId,url,withMember,json\)/);
});
test("admin migration gates every RPC by current JWT identity, never a client-supplied flag",()=>{
  assert.match(migration,/u\.role = 'admin'/);
  assert.match(migration,/app\.current_user_id/);
  assert.match(migration,/SECURITY DEFINER/g);
  assert.match(migration,/admin_is_authorized\(\)/g);
  assert.match(migration,/REVOKE ALL ON app_private\.member_moderation_actions/g);
  assert.doesNotMatch(migration,/GRANT SELECT ON app_private\.member_moderation_actions TO ogcupid_member_api/);
  assert.match(migration,/current_member_is_active\(\)/);
  assert.match(migration,/u\."banExpires"<=now\(\)/);
  assert.match(migration,/moderator_id,action,reason,expires_at/);
});
test("read routes return only server-derived data with strict resource path parsing",async()=>{
  for(const path of ["/admin","/admin/members?q=alpha","/admin/reports","/admin/reports/"+REPORT]){
    assert.equal(isAdminPath(new URL("https://x"+path).pathname),true);
    const r=await send(path);
    assert.equal(r.status,200);
    assert.equal(r.calls.length,1);
    assert.equal(r.calls[0].uid,ME);
    assert.match(r.calls[0].sql,/app_private\.admin_/);
  }
  const q=await send("/admin/members?q=alpha");
  assert.deepEqual(q.calls[0].args,["alpha"]);
  assert.equal(isAdminPath("/admin/developer-secrets"),false);
  assert.equal(adminMethodAllowed("/admin","POST"),false);
  assert.equal(adminMethodAllowed("/admin/reports/"+REPORT+"/action","POST"),true);
});
test("admin report actions require exact keys, selected action and a meaningful reason",async()=>{
  const invalids=[
    {action:"delete_user",reason:"This is a valid explanation."},
    {action:"ban",reason:"short"},
    {action:"ban",reason:"This is a valid explanation.",asAdmin:true},
    {reason:"This is a valid explanation."}
  ];
  for(const payload of invalids){
    const r=await send("/admin/reports/"+REPORT+"/action","POST",payload);
    assert.equal(r.status,400);
    assert.equal(r.calls.length,0);
  }
  const valid=await send("/admin/reports/"+REPORT+"/action","POST",
    {action:"suspend_7d",reason:"Repeated harassment after review."});
  assert.equal(valid.status,200);
  assert.deepEqual(valid.calls[0].args,[REPORT,"suspend_7d","Repeated harassment after review."]);
  assert.match(valid.calls[0].sql,/admin_review_report/);
});
test("server denies ordinary members and does not expose query or DB exception text",async()=>{
  const forbidden=await send("/admin","GET",undefined,harness({error:{code:"42501",message:"private"}}));
  assert.equal(forbidden.status,403);
  assert.equal(forbidden.body.error,"Administrator access required");
  const conflict=await send("/admin/reports/"+REPORT+"/action","POST",
    {action:"warn",reason:"Harassment confirmed."},harness({error:{code:"22023"}}));
  assert.equal(conflict.status,409);
  const unavailable=await send("/admin","GET",undefined,harness({error:new Error("DATABASE_URL leaked")}));
  assert.equal(unavailable.status,503);
  assert.doesNotMatch(JSON.stringify(unavailable.body),/DATABASE_URL/);
});
test("reinstatement is explicit, audited and separated from report moderation",async()=>{
  const bad=await send("/admin/members/"+TARGET+"/reinstate","POST",{reason:"no"});
  assert.equal(bad.status,400);
  const good=await send("/admin/members/"+TARGET+"/reinstate","POST",{reason:"Appeal approved after review."});
  assert.equal(good.status,200);
  assert.match(good.calls[0].sql,/admin_reinstate_member/);
  assert.deepEqual(good.calls[0].args,[TARGET,"Appeal approved after review."]);
});