import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CLASSIC_ESSAYS} from "../../member-app/profile-essays.js";
import {LIVE_ESSAYS,safeEssayProfile,composeEssayUpdate} from "./member-essays.mjs";
import {PUBLIC_ESSAYS,sanitizePublicProfile} from "./member-public-profile.mjs";

const keys=[
  "aboutMe","lifeDirection","goodAt","firstThings","favorites","sixThings",
  "thinkingAbout","fridayNight","privateThing","messageMeIf"
];
const userId="00000000-0000-4000-8000-000000000001";
const saved=Object.fromEntries(keys.map(key=>[key,"Saved "+key]));

test("all editors and protected public About share the exact canonical ten-essay order",()=>{
  assert.deepEqual(CLASSIC_ESSAYS.map(e=>e.key),keys);
  assert.deepEqual(LIVE_ESSAYS.map(e=>e.key),keys);
  assert.deepEqual(PUBLIC_ESSAYS.map(e=>e.key),keys);
  assert.equal(new Set(keys).size,10);
  for(const key of keys){
    assert.equal(LIVE_ESSAYS.find(e=>e.key===key).max,
      CLASSIC_ESSAYS.find(e=>e.key===key).max);
  }
});
test("canonical tenth essay follows all nine existing prompts",()=>{
  assert.equal(keys.at(-1),"messageMeIf");
  assert.equal(PUBLIC_ESSAYS.at(-1).title,"You should message me if");
  assert.equal(keys[8],"privateThing");
});
test("authenticated owner updates each missing essay individually and keeps other data",()=>{
  const base={profile:{userId,displayName:"Essay Owner",slug:"essay-owner",age:34,...saved}};
  const own=safeEssayProfile(base,userId);
  for(const key of ["firstThings","thinkingAbout","privateThing","messageMeIf"]){
    const update=composeEssayUpdate(own,key,"Updated "+key);
    assert.deepEqual(Object.keys(update).sort(),["aboutMe","age",key].sort());
    assert.equal(update.aboutMe,saved.aboutMe);
    assert.equal(update.age,34);
    assert.equal(update[key],"Updated "+key);
  }
  const publicRow=sanitizePublicProfile({profile:{
    ...base.profile,cityRegion:"Somewhere",email:"never-expose@invalid.example"
  },publicAnswers:[],isOwner:false},"essay-owner");
  assert.deepEqual(publicRow.essays,saved);
  assert.equal(JSON.stringify(publicRow).includes("never-expose"),false);
});
test("server whitelist, SQL reads and migration persist new essays by canonical fields",()=>{
  const api=readFileSync(new URL("../../api/member-profile.ts",import.meta.url),"utf8");
  const migration=readFileSync(new URL("../../db/migrations/023_canonical_ten_profile_essays.sql",import.meta.url),"utf8");
  const legacy=readFileSync(new URL("../../member-app/main.js",import.meta.url),"utf8");
  const peer=readFileSync(new URL("./PublicMemberProfile.jsx",import.meta.url),"utf8");
  for(const [key,col] of [["firstThings","first_things"],["thinkingAbout","thinking_about"],["privateThing","private_thing"]]){
    assert.ok(api.includes('["'+key+'", "'+col+'", 1500]'),"Missing server column whitelist for "+key);
    assert.match(api,new RegExp("row\\."+col));
    assert.match(api,new RegExp("p\\."+col));
    assert.match(migration,new RegExp("ADD COLUMN IF NOT EXISTS "+col));
    assert.match(legacy,new RegExp('"' + key + '"'));
  }
  assert.match(api,/const fieldUpdates = profileTextFields/);
  assert.match(api,/filter\(\(\[key\]\) => Object\.prototype\.hasOwnProperty\.call\(fields, key\)\)/);
  assert.match(peer,/await saveOwnEssay\(key,draft\)/);
  assert.match(peer,/maxLength=\{essayDefinition\(key\)\?\.max\?\?1500\}/);
});
