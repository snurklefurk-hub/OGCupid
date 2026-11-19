import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {handleCommunity,isCommunityPath,communityMethodAllowed} from "./member-community.js";
const code=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../db/migrations/028_community_chatroom.sql",import.meta.url),"utf8");
const uid="00000000-0000-4000-8000-000000000001";
const json=(_req,body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
function harness(method,path,body=null,answer=null){
  const calls=[];
  const request=new Request("https://members.example.invalid"+path,{
    method,headers:body?{"content-type":"application/json"}:{},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const withMember=async(member,fn)=>{
    assert.equal(member,uid);
    return fn({query:async(text,params=[])=>{
      calls.push({sql:text,params});
      return {rows:[answer||{messages:[],data:{sent:true,id:1},reports:[]}]};
    }});
  };
  return {calls,run:()=>handleCommunity(request,uid,new URL(request.url),withMember,json)};
}
test("only allowed chat, report, and admin action paths are matched",()=>{
  for(const path of ["/community","/community/","/community/1/report",
    "/community/reports","/community/reports/2/action"])assert.equal(isCommunityPath(path),true);
  for(const path of ["/community/admin","/community/../../admin",
    "/messages","/community/0/report"])assert.equal(isCommunityPath(path),false);
  assert.equal(communityMethodAllowed("/community","DELETE"),false);
  assert.equal(communityMethodAllowed("/community/reports","POST"),false);
  assert.match(code,/communityPath = isCommunityPath/);
  assert.match(code,/communityPath \? communityMethodAllowed/);
  assert.match(code,/\|\| communityPath \|\| answersPath/);
  assert.match(code,/handleCommunity\(request,userId,url,withMember,json\)/);
});
test("feed is member-only, cursor validated and SQL call uses bound parameter",async()=>{
  const h=harness("GET","/community?after=42",null,{messages:[]});
  const r=await h.run();assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{messages:[]});
  assert.equal(h.calls[0].params[0],42);
  assert.match(h.calls[0].sql,/community_feed\(\$1::bigint\)/);
  const malformed=harness("GET","/community?after=0%20OR%201%3D1");
  assert.equal((await malformed.run()).status,400);
  assert.equal(malformed.calls.length,0);
  assert.equal((await harness("GET","/community?limit=10000").run()).status,400);
});
test("enter-to-send has one line, 500 characters and no client-picked sender",async()=>{
  const h=harness("POST","/community",{body:"Hello world!"},{data:{sent:true,id:7}});
  const r=await h.run();assert.equal(r.status,201);
  assert.deepEqual(await r.json(),{sent:true,id:7});
  assert.deepEqual(h.calls[0].params,["Hello world!"]);
  assert.match(h.calls[0].sql,/community_send\(\$1::text\)/);
  for(const body of ["", "x".repeat(501),"hello\nworld"]){
    const bad=harness("POST","/community",{body});
    assert.equal((await bad.run()).status,400);
    assert.equal(bad.calls.length,0);
  }
  assert.equal((await harness("POST","/community",{body:"x",senderId:uid}).run()).status,400);
});
test("reports accept only known reasons and a nonzero message ID",async()=>{
  const h=harness("POST","/community/9/report",{reason:"spam"},{reported:true});
  assert.equal((await h.run()).status,200);
  assert.deepEqual(h.calls[0].params,[9,"spam"]);
  assert.equal((await harness("POST","/community/9/report",{reason:"ban_now"}).run()).status,400);
});
test("admin read/action are independent and only database role decides authorization",async()=>{
  const h=harness("GET","/community/reports",null,{reports:[]});
  assert.equal((await h.run()).status,200);
  assert.match(h.calls[0].sql,/admin_community_reports/);
  const a=harness("POST","/community/reports/3/action",{action:"hide",reason:"Obvious harassment"},{moderated:true});
  assert.equal((await a.run()).status,200);
  assert.deepEqual(a.calls[0].params,[3,"hide","Obvious harassment"]);
  assert.equal((await harness("POST","/community/reports/3/action",{action:"ban",reason:"Obvious harassment"}).run()).status,400);
  assert.equal((await harness("POST","/community/reports/3/action",{action:"dismiss",reason:"x"}).run()).status,400);
});
test("SQL refuses direct table reads, requires active JWT identity, and audits decisions",()=>{
  for(const table of ["community_messages","community_message_reports"]){
    assert.match(sql,new RegExp("REVOKE ALL ON app_private\\."+table));
    assert.match(sql,new RegExp("ALTER TABLE app_private\\."+table+" FORCE ROW LEVEL SECURITY"));
  }
  assert.match(sql,/current_member_is_active\(\)/);
  assert.match(sql,/admin_is_authorized\(\)/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/minute_count>=12 OR hour_count>=180/);
  assert.match(sql,/hidden_at=now\(\),hidden_by=actor,hidden_reason/);
  assert.match(sql,/author_role='admin'/);
  assert.match(sql,/ON DELETE CASCADE/);
});
