import test from "node:test";
import assert from "node:assert/strict";
import {DIRECTORY_PAGE_SIZE,filterAndSortMembers,pageMembers,shuffledMembers} from "./member-directory.mjs";

const members=[
  {userId:"c",displayName:"Zoe",matchPercent:null},
  {userId:"a",displayName:"Ari",matchPercent:75},
  {userId:"b",displayName:"ari B",matchPercent:90},
  {userId:"d",displayName:"Ben",matchPercent:75}
];

test("real percentages sort high-to-low; unknown percentages never turn into zero",()=>{
  const sorted=filterAndSortMembers(members);
  assert.deepEqual(sorted.map(m=>m.userId),["b","a","d","c"]);
  assert.equal(sorted[3].matchPercent,null);
  assert.deepEqual(members.map(m=>m.userId),["c","a","b","d"],"original discovery order unchanged");
});
test("display-name searching ignores case and leaves original records intact",()=>{
  assert.deepEqual(filterAndSortMembers(members,{search:"  ARI ",sort:"name"}).map(x=>x.userId),["a","b"]);
  assert.deepEqual(filterAndSortMembers(members,{search:"none"}),[]);
  assert.equal(filterAndSortMembers(members,{sort:"name"})[0].userId,"a");
});
test("24 real profiles per page, numbered pages clamp without inventing records",()=>{
  const all=Array.from({length:51},(_,i)=>({userId:String(i)}));
  assert.equal(DIRECTORY_PAGE_SIZE,24);
  assert.deepEqual(pageMembers(all,2),{page:2,totalPages:3,total:51,items:all.slice(24,48)});
  assert.deepEqual(pageMembers(all,99).items,all.slice(48,51));
  assert.deepEqual(pageMembers([],42),{page:1,totalPages:1,total:0,items:[]});
});
test("quickmatch shuffling never mutates backend results or invents candidates",()=>{
  const shuffled=shuffledMembers(members,()=>0);
  assert.equal(shuffled.length,members.length);
  assert.deepEqual(new Set(shuffled),new Set(members));
  assert.deepEqual(members.map(x=>x.userId),["c","a","b","d"]);
});
