import test from "node:test";
import assert from "node:assert/strict";
import {filterAndSortMembers,SEARCH_ADVANCED_GROUPS} from "./member-directory.mjs";

test("Pets matches saved choices from My details only",()=>{
  const field=SEARCH_ADVANCED_GROUPS.flatMap(g=>g.fields).find(f=>f.key==="pets");
  assert.deepEqual(field.options,["Doesn’t have pets","Has cats","Has dogs","Has exotics","Likes dogs","Likes cats","Likes exotics"]);
  const members=["Doesn’t have pets","Has cats, Has dogs","Has exotics","Beans","","I love dogs","Doesn’t have pets, Has cats","Likes dogs, Likes cats","Likes exotics"].map((pets,i)=>({pets,age:30,displayName:String(i),aboutMe:"Has cats"}));
  for(const [i,expected] of [[0,"0"],[1,"1"],[2,"1"],[3,"2"],[4,"7"],[5,"7"],[6,"8"]]){
    const result=filterAndSortMembers(members,{advanced:{pets:field.options[i]}});
    assert.deepEqual(result.map(m=>m.displayName),[expected]);
  }
});
