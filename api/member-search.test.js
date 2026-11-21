import test from "node:test";
import assert from "node:assert/strict";
import {handleDiscovery} from "./member-discovery.js";
import {normalizeSearchCriteria,searchCacheKey,MAX_SERVER_SEARCH_CANDIDATES}
  from "../ogc-l-react/src/search-contract.mjs";
import {readFileSync} from "node:fs";
const VIEWER="00000000-0000-4000-8000-000000000001";
const criterion={search:"",sort:"newest",genders:[],intentions:[],whoLike:[],
  activity:"",kidPlans:"",ageMin:18,ageMax:99,radius:0,advanced:{}};
const profiles=Array.from({length:53},(_,i)=>({
  user_id:"00000000-0000-4000-8000-"+String(i+2).padStart(12,"0"),
  display_name:"Candidate "+String(i+1).padStart(3,"0"),
  slug:"candidate-"+(i+1),
  age:28,gender:i%2?"Woman":"Man",relationship_goal:"new friends",
  interested_in:"Man, Woman",created_at:new Date(Date.UTC(2026,10,21)-i*60000).toISOString(),
  distance_miles:i+1,last_seen_at:new Date(Date.UTC(2026,10,21)-i*60000).toISOString()
}));
function fakeDb(){
  const queries=[];
  const withMember=async(_actor,action)=>action({
    query:async(sql,args=[])=>{
      queries.push({sql,args});
      if(sql.includes("FROM app_private.member_profiles AS p"))
        return {rows:profiles.slice(0,args[1])};
      return {rows:[]};
    }
  });
  return {withMember,queries};
}
const json=(_request,body,status=200)=>({status,body});
function request(criteria=criterion,page=1){
  const params=new URLSearchParams({criteria:JSON.stringify(criteria),page:String(page)});
  return new Request("https://example.test/discovery-search?"+params,{method:"GET"});
}
test("search returns 20 verified member records per page with stable total",async()=>{
  const {withMember,queries}=fakeDb();
  const response=await handleDiscovery(request(criterion,2),VIEWER,withMember,json);
  assert.equal(response.status,200);
  assert.equal(response.body.total,53);
  assert.equal(response.body.totalPages,3);
  assert.equal(response.body.page,2);
  assert.equal(response.body.pageSize,20);
  assert.equal(response.body.profiles.length,20);
  assert.equal(response.body.profiles[0].displayName,"Candidate 021");
  assert.equal(queries[0].args[1],MAX_SERVER_SEARCH_CANDIDATES);
  assert.match(queries[0].sql,/app_private\.is_discoverable_member\(p\.user_id\)/);
  assert.match(queries[0].sql,/NOT app_private\.member_pair_blocked/);
  assert.ok(!JSON.stringify(response.body).includes("acceptable_options"));
});
test("server applies existing search filters before pagination",async()=>{
  const {withMember}=fakeDb();
  const response=await handleDiscovery(request({...criterion,genders:["Woman"],ageMin:25,ageMax:30},2),
    VIEWER,withMember,json);
  assert.equal(response.status,200);
  assert.equal(response.body.total,26);
  assert.equal(response.body.profiles.length,6);
  assert.ok(response.body.profiles.every(x=>x.gender==="Woman"));
});
test("malformed criteria and page are rejected before database work",async()=>{
  const {withMember,queries}=fakeDb();
  for(const url of [
    request({...criterion,sort:"arbitrary"}),
    request({...criterion,advanced:{notAFilter:"x"}}),
    new Request("https://example.test/discovery-search?page=0"),
    new Request("https://example.test/discovery-search?page=1&criteria=%7Bbroken")
  ]){
    const response=await handleDiscovery(url,VIEWER,withMember,json);
    assert.equal(response.status,400);
  }
  assert.equal(queries.length,0);
  assert.throws(()=>normalizeSearchCriteria({...criterion,ageMin:0}));
  assert.notEqual(searchCacheKey(VIEWER,criterion,1),searchCacheKey(VIEWER,criterion,2));
});
test("authenticated route and legacy discovery feed remain separate",()=>{
  const api=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
  assert.match(api,/const discoverySearchPath = url\.pathname === "\/discovery-search"/);
  assert.match(api,/discoveryPath \|\| discoverySearchPath/);
  assert.match(api,/current_member_is_active\(\)/);
  assert.match(api,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(readFileSync(new URL("./member-discovery.js",import.meta.url),"utf8"),
    /const MAX_CANDIDATES = 250/);
});
