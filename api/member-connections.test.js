import test from "node:test";
import assert from "node:assert/strict";
import {handleConnections,isConnectionPath,connectionMethodAllowed} from "./member-connections.js";
const ME="00000000-0000-4000-8000-000000000001";
const OTHER="00000000-0000-4000-8000-000000000002";
const json=(_req,data,status=200)=>new Response(JSON.stringify(data),{status});
const make=(path,method="GET",body)=>new Request("https://member.example"+path,{
  method,headers:{"Content-Type":"application/json"},
  ...(body?{body:JSON.stringify(body)}:{})
});
const state={favorites:[OTHER],favoriteMembers:[],quiver:[],favoritedByCount:2,blockedByCount:1,blocks:[]};
function mock({blocked=false,available=true}={}){
  const calls=[];
  const withMember=async(user,fn)=>fn({query:async(sql,args)=>{
    calls.push({user,sql,args});
    if(sql.includes("member_connections()"))return{rows:[{result:state}]};
    if(sql.includes("set_site_block"))return{rows:[{result:{blocked:args[1],permanent:blocked}}]};
    if(sql.includes("AS available"))return{rows:[{available,blocked}]};
    if(sql.includes("member_favorites"))return{rows:[]};
    if(sql.includes("report_member_profile"))return{rows:[{reported:true}]};
    throw Error("Unexpected SQL: "+sql);
  }});
  return {calls,withMember};
}
async function run(path,method,body,db=mock()){
  const req=make(path,method,body);
  const res=await handleConnections(req,ME,new URL(req.url),db.withMember,json);
  return {status:res.status,body:await res.json(),calls:db.calls};
}
test("exact routed paths and allowed methods only",()=>{
  assert.equal(isConnectionPath("/connections"),true);
  assert.equal(isConnectionPath("/favorites/"+OTHER),true);
  assert.equal(isConnectionPath("/favorites/../messages"),false);
  assert.equal(connectionMethodAllowed("/connections","POST"),false);
  assert.equal(connectionMethodAllowed("/blocks/"+OTHER,"POST"),false);
  assert.equal(connectionMethodAllowed("/profile-reports/"+OTHER,"DELETE"),false);
});
test("own connection summary includes only counts for inbound interest",async()=>{
  const res=await run("/connections","GET");
  assert.equal(res.status,200);
  assert.deepEqual(res.body,state);
  assert.deepEqual(res.calls.map(c=>c.user),[ME]);
});
test("favorites save/remove are JWT-owner-scoped and block-aware",async()=>{
  const saved=await run("/favorites/"+OTHER,"PUT");
  assert.equal(saved.body.favorite,true);
  assert.ok(saved.calls.every(c=>c.user===ME));
  const removed=await run("/favorites/"+OTHER,"DELETE");
  assert.equal(removed.body.favorite,false);
  const blocked=await run("/favorites/"+OTHER,"PUT",undefined,mock({blocked:true}));
  assert.equal(blocked.status,404);
  assert.ok(!blocked.calls.some(c=>c.sql.includes("INSERT INTO")));
});
test("blocks delegate one-time-unblock and permanent history to database",async()=>{
  const put=await run("/blocks/"+OTHER,"PUT",undefined,mock({blocked:true}));
  assert.deepEqual(put.body,{blocked:true,permanent:true});
  assert.deepEqual(put.calls[0].args,[OTHER,true]);
  const del=await run("/blocks/"+OTHER,"DELETE");
  assert.deepEqual(del.body,{blocked:false,permanent:false});
  assert.deepEqual(del.calls[0].args,[OTHER,false]);
});
test("profile reports require approved reason without target leaks",async()=>{
  const sent=await run("/profile-reports/"+OTHER,"POST",{reason:"harassment"});
  assert.equal(sent.body.reported,true);
  assert.deepEqual(sent.calls[0].args,[OTHER,"harassment"]);
  const invalid=await run("/profile-reports/"+OTHER,"POST",{reason:"not-valid"});
  assert.equal(invalid.status,400);
  assert.equal(invalid.calls.length,0);
  const self=await run("/blocks/"+ME,"PUT");
  assert.equal(self.status,400);
  assert.equal(self.calls.length,0);
});
