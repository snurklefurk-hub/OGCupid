import test from "node:test";
import assert from "node:assert/strict";
import {LIVE_ESSAYS,safeEssayProfile,composeEssayUpdate} from "./member-essays.mjs";
const ME="00000000-0000-4000-8000-000000000001";
const essayData=Object.fromEntries(LIVE_ESSAYS.map(e=>[e.key,"original "+e.key]));
const row={profile:{userId:ME,displayName:"Test",age:26,slug:"test",...essayData,
    email:"private@example.invalid",locality:{id:999}}};
test("only existing server-backed essays are editable; no fake fields or private data",()=>{
  const p=safeEssayProfile(row,ME);
  assert.equal(LIVE_ESSAYS.length,10);
  assert.equal(Object.keys(p.fields).length,10);
  assert.equal(JSON.stringify(p).includes("private@example.invalid"),false);
  assert.equal(JSON.stringify(p).includes("locality"),false);
  assert.equal(p.fields.messageMeIf,"original messageMeIf");
});
test("a single essay save preserves the existing bio and age without resetting preferences",()=>{
  const p=safeEssayProfile(row,ME);
  assert.deepEqual(composeEssayUpdate(p,"goodAt","Edited skills"),{
    aboutMe:"original aboutMe",age:26,goodAt:"Edited skills"
  });
  assert.deepEqual(composeEssayUpdate(p,"aboutMe","New bio"),{aboutMe:"New bio",age:26});
});
test("strict ownership and length checks fail closed",()=>{
  assert.throws(()=>safeEssayProfile(row,"00000000-0000-4000-8000-000000000099"));
  assert.deepEqual(composeEssayUpdate(safeEssayProfile(row,ME),"firstThings","My laugh"), {
    aboutMe:"original aboutMe",age:26,firstThings:"My laugh"
  });
  assert.throws(()=>composeEssayUpdate(safeEssayProfile(row,ME),"notAnEssay","Not stored"));
  assert.throws(()=>composeEssayUpdate(safeEssayProfile(row,ME),"aboutMe","x".repeat(5001)));
});
