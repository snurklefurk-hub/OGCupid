import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTORY_PAGE_SIZE,filterAndSortMembers,pageMembers,shuffledMembers,
  savedSearchDefaults,isOnlineNow,SEARCH_SORTS,SEARCH_ADVANCED_GROUPS
} from "./member-directory.mjs";

const members=[
  {userId:"c",displayName:"Zoe",age:29,gender:"Woman",relationshipGoal:"new friends",
    matchPercent:null,distanceMiles:null,createdAt:null,lastSeenAt:null},
  {userId:"a",displayName:"Ari",age:35,gender:"Man",relationshipGoal:"long-term dating",
    bodyType:"Athletic",smoking:"Never",religion:"Agnostic",matchPercent:75,
    distanceMiles:25,createdAt:"2026-11-10T10:00:00Z",lastSeenAt:"2026-11-20T10:00:00Z"},
  {userId:"b",displayName:"ari B",age:29,gender:"Woman",relationshipGoal:"new friends, short-term dating",
    bodyType:"Average",smoking:"Often",matchPercent:90,
    distanceMiles:12,createdAt:"2026-11-19T10:00:00Z",lastSeenAt:"2026-11-21T10:00:00Z"},
  {userId:"d",displayName:"Ben",age:42,gender:"Man",relationshipGoal:"casual sex",
    matchPercent:75,distanceMiles:115,createdAt:"2026-11-11T10:00:00Z",lastSeenAt:null}
];

test("real percentages sort high-to-low; unknown percentages never become zero",()=>{
  const sorted=filterAndSortMembers(members);
  assert.deepEqual(sorted.map(m=>m.userId),["b","a","d","c"]);
  assert.equal(sorted[3].matchPercent,null);
  assert.deepEqual(members.map(m=>m.userId),["c","a","b","d"],"original data untouched");
});
test("username search ignores case; saved preferences and advanced filters combine",()=>{
  assert.deepEqual(filterAndSortMembers(members,{search:" ARI "}).map(x=>x.userId),["b","a"]);
  assert.deepEqual(filterAndSortMembers(members,{search:"none"}),[]);
  assert.deepEqual(filterAndSortMembers(members,{
    genders:["Woman"],intentions:["new friends"],ageMin:25,ageMax:40,radius:50
  }).map(x=>x.userId),["b"]);
  assert.deepEqual(filterAndSortMembers(members,{
    advanced:{bodyType:"Athletic",smoking:"Never",religion:"agnos"}
  }).map(x=>x.userId),["a"]);
  assert.equal(filterAndSortMembers(members,{advanced:{smoking:"Never"}}).length,1);
});
test("Race filter recognizes each saved category and never substring-matches another",()=>{
  const available=[
    {userId:"a",displayName:"A",age:29,ethnicity:"Black, White"},
    {userId:"b",displayName:"B",age:29,ethnicity:"Asian"},
    {userId:"c",displayName:"C",age:29,ethnicity:"Black"},
    {userId:"d",displayName:"D",age:29,ethnicity:""},
    {userId:"e",displayName:"E",age:29,ethnicity:"Blackish"},
    {userId:"f",displayName:"F",age:29,ethnicity:"Hispanic / Latin, Indian"},
    {userId:"g",displayName:"G",age:29,ethnicity:"Hispanic"},
    {userId:"h",displayName:"H",age:29,ethnicity:"Native American"},
    {userId:"i",displayName:"I",age:29,ethnicity:"Native American"}
  ];
  const race=SEARCH_ADVANCED_GROUPS.flatMap(group=>group.fields)
    .find(field=>field.key==="ethnicity");
  assert.equal(race.label,"Race");
  assert.ok(race.options.includes("Hispanic"));
  assert.ok(race.options.includes("Indian"));
  assert.ok(race.options.includes("Native American"));
  assert.ok(!race.options.includes("Indigenous"));
  assert.ok(!race.options.includes("Hispanic / Latin"));
  assert.deepEqual(filterAndSortMembers(available,{advanced:{ethnicity:"Black"}})
    .map(member=>member.userId),["a","c"]);
  assert.deepEqual(filterAndSortMembers(available,{advanced:{ethnicity:"White"}})
    .map(member=>member.userId),["a"]);
  assert.deepEqual(filterAndSortMembers(available,{advanced:{ethnicity:"Asian"}})
    .map(member=>member.userId),["b"]);
  assert.deepEqual(filterAndSortMembers(available,{advanced:{ethnicity:"Hispanic"}})
    .map(member=>member.userId),["f","g"]);
  assert.deepEqual(filterAndSortMembers(available,{advanced:{ethnicity:"Indian"}})
    .map(member=>member.userId),["f"]);
  assert.deepEqual(filterAndSortMembers(available,{advanced:{ethnicity:"Native American"}})
    .map(member=>member.userId),["h","i"]);
});
test("distance filters exclude unknown locations and unavailable ages; Anywhere is unlimited",()=>{
  assert.deepEqual(filterAndSortMembers(members,{radius:50}).map(x=>x.userId),["b","a"]);
  assert.equal(filterAndSortMembers(members,{radius:0}).length,4);
  assert.deepEqual(filterAndSortMembers(members,{ageMin:40,ageMax:50}).map(x=>x.userId),["d"]);
});
test("the four real-data sorts use unknown-last semantics",()=>{
  assert.deepEqual(SEARCH_SORTS.map(x=>x.value),["match","distance","lastOnline","newest"]);
  assert.deepEqual(filterAndSortMembers(members,{sort:"distance"}).map(x=>x.userId),["b","a","d","c"]);
  assert.deepEqual(filterAndSortMembers(members,{sort:"lastOnline"}).map(x=>x.userId),["b","a","d","c"]);
  assert.deepEqual(filterAndSortMembers(members,{sort:"newest"}).map(x=>x.userId),["b","d","a","c"]);
});
test("defaults come from saved Profile Settings, not edited back into them",()=>{
  const profile={lookingFor:{interestedIn:"Man, Woman",
    relationshipGoal:"new friends, long-term dating",preferredAgeMin:24,
    preferredAgeMax:55,hasValidatedLocality:true,searchRadiusMiles:250}};
  const original=JSON.stringify(profile);
  const filters=savedSearchDefaults(profile);
  assert.deepEqual(filters.genders,["Man","Woman"]);
  assert.deepEqual(filters.intentions,["new friends","long-term dating"]);
  assert.equal(filters.radius,250);
  assert.equal(filters.ageMin,24);
  assert.equal(filters.ageMax,55);
  assert.deepEqual(filters.advanced,{});
  filters.ageMin=30;
  assert.equal(JSON.stringify(profile),original);
  assert.equal(savedSearchDefaults({lookingFor:{searchRadiusMiles:100,
    hasValidatedLocality:false}}).radius,0);
  assert.equal(savedSearchDefaults({lookingFor:{interestedIn:"Everyone"}}).genders.length,0);
  assert.deepEqual(SEARCH_ADVANCED_GROUPS.map(x=>x.name),
    ["Appearance","Lifestyle","Background","Personal Life"]);
});
test("genuine heartbeat freshness determines online-now status",()=>{
  const time=Date.parse("2026-11-21T12:00:00Z");
  assert.equal(isOnlineNow("2026-11-21T11:58:00Z",time),true);
  assert.equal(isOnlineNow("2026-11-21T11:56:00Z",time),false);
  assert.equal(isOnlineNow("2026-11-21T12:01:00Z",time),false);
  assert.equal(isOnlineNow(null,time),false);
});
test("20 real profiles per page; numbered pages clamp without inventing records",()=>{
  const all=Array.from({length:51},(_,i)=>({userId:String(i)}));
  assert.equal(DIRECTORY_PAGE_SIZE,20);
  assert.deepEqual(pageMembers(all,2),{page:2,totalPages:3,total:51,items:all.slice(20,40)});
  assert.deepEqual(pageMembers(all,99).items,all.slice(40,51));
  assert.deepEqual(pageMembers([],42),{page:1,totalPages:1,total:0,items:[]});
});
test("quickmatch shuffling never mutates backend results or invents candidates",()=>{
  const shuffled=shuffledMembers(members,()=>0);
  assert.equal(shuffled.length,members.length);
  assert.deepEqual(new Set(shuffled),new Set(members));
  assert.deepEqual(members.map(x=>x.userId),["c","a","b","d"]);
});
