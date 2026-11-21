import test from "node:test";
import assert from "node:assert/strict";
import {filterAndSortMembers,SEARCH_ADVANCED_GROUPS} from "./member-directory.mjs";

test("Pets offers fixed categories and matches explicit profile details",()=>{
  const field=SEARCH_ADVANCED_GROUPS.flatMap(g=>g.fields).find(f=>f.key==="pets");
  assert.deepEqual(field.options,["Doesn’t have pets","Has cats","Has dogs","Has exotics"]);
  const members=["No pets","Two cats and a dog named Beans","gecko","Beans","","I love dogs"].map((pets,i)=>({pets,age:30,displayName:String(i)}));
  for(const [i,expected] of [[0,"0"],[1,"1"],[2,"1"],[3,"2"]]){
    const result=filterAndSortMembers(members,{advanced:{pets:field.options[i]}});
    assert.deepEqual(result.map(m=>m.displayName),[expected]);
  }
});
