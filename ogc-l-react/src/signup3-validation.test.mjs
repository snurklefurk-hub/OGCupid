import test from "node:test";
import assert from "node:assert/strict";
import {canContinueSignup3} from "./signup3-validation.mjs";
const now=new Date("2026-11-25T12:00:00Z");
const complete={gender:"Woman",orientation:"Straight",interestedIn:["Man"],intentions:["long-term dating"],birthDate:"1990-01-01",ageMin:18,ageMax:99,distanceMiles:50};
test("signup3 requires a valid value for every field",()=>{
  assert.equal(canContinueSignup3(complete,now),true);
  for(const [key,value] of Object.entries({gender:"",orientation:"",interestedIn:[],intentions:[],birthDate:"",ageMin:undefined,ageMax:undefined,distanceMiles:undefined})){
    assert.equal(canContinueSignup3({...complete,[key]:value},now),false,key);
  }
  assert.equal(canContinueSignup3(null,now),false);
});
test("signup3 accepts Anywhere and inclusive age limits, rejects invalid dates and filters",()=>{
  for(const birthDate of ["2008-11-25","1906-11-25"])assert.equal(canContinueSignup3({...complete,birthDate,distanceMiles:0},now),true);
  for(const birthDate of ["2008-11-26","1906-11-24","2000-02-30","not a date"])assert.equal(canContinueSignup3({...complete,birthDate},now),false);
  assert.equal(canContinueSignup3({...complete,ageMin:40,ageMax:30},now),false);
  assert.equal(canContinueSignup3({...complete,distanceMiles:1},now),false);
  assert.equal(canContinueSignup3({...complete,interestedIn:["invalid"]},now),false);
});
