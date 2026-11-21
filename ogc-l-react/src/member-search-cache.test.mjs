import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSearchCriteria,searchCacheKey,SEARCH_PAGE_SIZE}
  from "./search-contract.mjs";
import {readSearchCache,storeSearchCache,clearSearchCache,
  invalidateSearchCacheForMember} from "./member-search-cache.mjs";
import {readFileSync} from "node:fs";
const YOU="00000000-0000-4000-8000-000000000001";
const OTHER="00000000-0000-4000-8000-000000000002";
const criteria={search:"",sort:"match",genders:[],intentions:[],
  ageMin:18,ageMax:99,radius:0,advanced:{},whoLike:[],activity:"",kidPlans:""};
test("search cache is partitioned by authenticated account, normalized filters and page",()=>{
  clearSearchCache();
  const result={profiles:[{userId:OTHER}],page:1,total:1,totalPages:1};
  storeSearchCache(YOU,criteria,1,result,1000);
  assert.equal(readSearchCache(YOU,criteria,1,1050),result);
  assert.equal(readSearchCache(OTHER,criteria,1,1050),null);
  assert.equal(readSearchCache(YOU,{...criteria,genders:["Woman"]},1,1050),null);
  assert.equal(readSearchCache(YOU,criteria,2,1050),null);
  invalidateSearchCacheForMember(YOU);
  assert.equal(readSearchCache(YOU,criteria,1,1050),null);
});
test("cached data expires quickly and is never persisted across browser sessions",()=>{
  clearSearchCache();
  const result={profiles:[]};
  storeSearchCache(YOU,criteria,1,result,1000);
  assert.equal(readSearchCache(YOU,criteria,1,61_001),null);
  const source=readFileSync(new URL("./member-search-cache.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB/);
  assert.equal(SEARCH_PAGE_SIZE,20);
});
test("canonical filter order yields identical keys for equivalent filters",()=>{
  const a={...criteria,genders:["Woman","Man"]};
  const b={...criteria,genders:["Man","Woman"]};
  assert.equal(searchCacheKey(YOU,a,1),searchCacheKey(YOU,b,1));
  assert.deepEqual(normalizeSearchCriteria(a).genders,["Man","Woman"]);
  assert.throws(()=>searchCacheKey("invalid",criteria,1));
});
test("member session invalidates search on sign-out, block, changes to Quickmatch scoring",()=>{
  const source=readFileSync(new URL("./MemberSessionProvider.jsx",import.meta.url),"utf8");
  assert.match(source,/clearSearchCache\(\);setSession\(blank\)/);
  assert.match(source,/const result=await gateway\.setSiteBlock\(id,blocked\);\s*clearSearchCache\(\)/);
  assert.match(source,/const result=await gateway\.saveQuickmatchDecision\(targetUserId,decision\);\s*clearSearchCache\(\)/);
});
test("MATCHES uses server pages and a background refresh without changing Quiver paging",()=>{
  const source=readFileSync(new URL("./MatchesView.jsx",import.meta.url),"utf8");
  assert.match(source,/readSearchCache\(user\.id,applied,page\)/);
  assert.match(source,/void searchMembers\(applied,page\)\.then/);
  assert.match(source,/storeSearchCache\(user\.id,applied,page,result\)/);
  assert.match(source,/tab==="search"\?\{[^]*?\}:pageMembers\(results,page\)/);
  assert.match(source,/setPage\(i\+1\)/);
});
