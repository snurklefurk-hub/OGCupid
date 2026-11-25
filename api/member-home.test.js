import test from "node:test";
import assert from "node:assert/strict";
import {feedEligibility,compatiblePersona,latestFeed,handleHome,handleHomeAdmin} from "./member-home.js";
import {readFileSync} from "node:fs";
const actor="11111111-1111-4111-8111-111111111111",peer="22222222-2222-4222-8222-222222222222";
const viewer={genders:["Woman"],gender:"Man",ageMin:24,ageMax:45,radius:50,persona:"DGLD"};
const target={gender:"Woman",age:30,distance_miles:200,persona_code:"DGLM"};
const json=(_,body,status=200)=>new Response(JSON.stringify(body),{status});
test("per-event filters enforce gender, age, distance, strict score thresholds and real Persona guidance",()=>{
  assert.deepEqual(feedEligibility(target,viewer,81),{profile:true,dealbreaker:true,essay:true,match:true,persona:true,award:false});
  assert.equal(feedEligibility(target,viewer,80).match,false);
  assert.equal(feedEligibility(target,viewer,50).essay,false);
  assert.equal(feedEligibility({...target,age:50},viewer,99).profile,true);
  assert.equal(feedEligibility({...target,age:50},viewer,99).essay,false);
  assert.equal(feedEligibility({...target,distance_miles:201},viewer,99).profile,false);
  assert.equal(feedEligibility({...target,distance_miles:null},viewer,99).essay,false);
  assert.equal(feedEligibility({...target,distance_miles:50},viewer,99).award,true);
  assert.equal(feedEligibility({...target,gender:"Man"},viewer,99).match,false);
  assert.equal(compatiblePersona("DGLD","DBLM","Man"),false);
  assert.equal(compatiblePersona("DGLD","DGLM","Man"),true);
  assert.equal(compatiblePersona(null,"DGLM","Man"),false);
});
test("the newest twenty eligible events are returned in timestamp order",()=>{
  const items=Array.from({length:25},(_,i)=>({id:String(i),happenedAt:new Date(1000*i).toISOString()}));
  assert.deepEqual(latestFeed(items).map(x=>x.id),Array.from({length:20},(_,i)=>String(24-i)));
});
test("Home uses public reciprocal scoring and emits no private answer contents",async()=>{
  const date=new Date("2026-11-24T21:30:00Z");
  const answers=Array.from({length:25},(_,i)=>({question_id:"vault-"+i,option_id:"option-secret",acceptable_options:["option-secret"],importance:i===0?250:10,is_private:false,updated_at:date}));
  const rows=[...answers.map(x=>({...x,user_id:actor})),...answers.map(x=>({...x,user_id:peer})),
    {user_id:peer,question_id:"vault-private",option_id:"private-answer",acceptable_options:["private-answer"],importance:250,is_private:true,updated_at:date}];
  let inserted=false;
  const withMember=(id,work)=>{assert.equal(id,actor);return work({query:async(sql,params)=>{
    if(sql.includes("home_progress("))return {rows:[{data:{questions:25,awards:[]}}]};
    if(sql.includes("FROM app_private.member_profiles p")&&sql.includes("p.interested_in"))return {rows:[{gender:"Man",interested_in:"Woman",preferred_age_min:24,preferred_age_max:45,search_radius_miles:100,persona_code:"DGLD",eligible:true}]};
    if(sql.includes("FROM app_private.member_profiles p JOIN"))return {rows:[{...target,user_id:peer,slug:"actual-member",display_name:"Actual Member",distance_miles:40}]};
    if(sql.includes("FROM app_private.member_match_answers"))return {rows};
    if(sql.includes("match_penalty_points"))return {rows:[]};
    if(sql.startsWith("UPDATE app_private.member_home_match_state"))return {rows:[]};
    if(sql.includes("INSERT INTO app_private.member_home_match_state")){assert.deepEqual(params,[actor,[peer]]);inserted=true;return {rows:[]};}
    if(sql.includes("FROM app_private.home_events"))return {rows:[{id:1,subject_id:peer,kind:"profile",happened_at:date},{id:2,subject_id:peer,kind:"essay",happened_at:date},{id:3,kind:"admin",body:"Hello members",happened_at:date}]};
    if(sql.includes("SELECT target_id,reached_at"))return {rows:[{target_id:peer,reached_at:date}]};
    throw Error("Unexpected query "+sql);
  }});};
  const response=await handleHome(new Request("https://example.test/home"),actor,withMember,json);
  assert.equal(response.status,200);
  assert.equal(inserted,true);
  const data=await response.json(),body=JSON.stringify(data);
  for(const kind of ["profile","essay","admin","match","dealbreaker","article"])assert.ok(data.feed.some(x=>x.kind===kind),kind);
  assert.equal(data.feed.filter(x=>x.kind==="dealbreaker").length,1);
  assert.doesNotMatch(body,/option-secret|private-answer|vault-private|acceptable_options|importance/);
});
test("progress input is allowlisted and admin post authorization stays database enforced",async()=>{
  const req=(url,body)=>new Request("https://example.test"+url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  let calls=0;
  const withMember=(id,work)=>{assert.equal(id,actor);calls++;return work({query:async(sql,params)=>{assert.match(sql,/home_progress/);assert.deepEqual(params,["search",null]);return {rows:[{data:{searchClicks:1}}]};}});};
  assert.equal((await handleHome(req("/home",{event:"search"}),actor,withMember,json)).status,200);
  for(const data of [{event:"search",count:5},{event:"visit",path:"/admin"},{event:"visit",path:"/profiles/other"},{event:"award",code:"yapper"}])assert.equal((await handleHome(req("/home",data),actor,withMember,json)).status,400);
  assert.equal(calls,1);
  const forbidden=(_id,work)=>work({query:async()=>{throw Object.assign(Error("denied"),{code:"42501"});}});
  assert.equal((await handleHomeAdmin(req("/admin/home-posts",{body:"News"}),actor,forbidden,json)).status,403);
  const sql=readFileSync(new URL("../db/migrations/042_member_home.sql",import.meta.url),"utf8");
  assert.match(sql,/IF NOT app_private.admin_is_authorized\(\)/);
  assert.match(sql,/NOT app_private.member_pair_blocked/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/REFERENCES neon_auth."user"\(id\) ON DELETE CASCADE/);
});
