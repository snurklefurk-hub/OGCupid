import test from "node:test";
import assert from "node:assert/strict";
import { memberHomeState } from "./home-dashboard.js";

test("new member sees homework instead of a pretend match dashboard",()=>{
 const state=memberHomeState();
 assert.equal(state.showRegularHome,false);
 assert.equal(state.completed,0);
 assert.equal(state.available,3);
});
test("written profile, one photo and ten saved answers trigger the regular home",()=>{
 assert.equal(memberHomeState({profileSaved:true,photoCount:1,answeredCount:10}).showRegularHome,true);
 assert.equal(memberHomeState({profileSaved:true,photoCount:1,answeredCount:9}).showRegularHome,false);
 assert.equal(memberHomeState({profileSaved:true,photoCount:0,answeredCount:410}).showRegularHome,false);
 assert.equal(memberHomeState({profileSaved:false,photoCount:5,answeredCount:410}).showRegularHome,false);
});
test("no 410-question completion requirement or minimum five photos",()=>{
 const state=memberHomeState({profileSaved:true,photoCount:1,answeredCount:10});
 assert.equal(state.completed,3);
 assert.equal(state.hasAnswers,true);
 assert.equal(state.hasPhoto,true);
});
test("member account state is clamped to safe real values",()=>{
 const state=memberHomeState({profileSaved:true,photoCount:987,answeredCount:37});
 assert.equal(state.photoCount,5);
 assert.equal(state.answeredCount,37);
 assert.equal(state.completed,3);
 assert.equal(memberHomeState({profileSaved:1,photoCount:-2,answeredCount:NaN}).completed,0);
});
