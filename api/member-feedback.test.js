import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {handleFeedback} from "./member-feedback.js";

const memberId="11111111-1111-4111-8111-111111111111";
const respond=(_request,body,status=200)=>new Response(JSON.stringify(body),{status});
function request(body,method="POST",type="application/json") {
  return new Request("https://example.test/feedback",{
    method,headers:{"content-type":type},body:method==="GET"?undefined:JSON.stringify(body),
  });
}
test("feedback accepts member text and origin path, and never returns anyone else's notes",async()=>{
  let call;
  const withMember=async (id,cb)=>{assert.equal(id,memberId);return cb({query:async(sql,params)=>{
    call={sql,params};return {rows:[{id:"48"}]};
  }});};
  const response=await handleFeedback(request({message:"Broken photo crop",pagePath:"/account/"}),memberId,withMember,respond);
  assert.equal(response.status,201);
  assert.deepEqual(await response.json(),{saved:true,id:48});
  assert.match(call.sql,/app_private\.submit_site_feedback/);
  assert.deepEqual(call.params,["Broken photo crop","/account/"]);
});
test("feedback rejects malformed, overlong, empty and leaked URL/query strings",async()=>{
  const never=async()=>{throw Error("Validation must reject before database access");};
  const invalid=[
    {message:" ",pagePath:"/account/"},
    {message:"x".repeat(1201),pagePath:"/account/"},
    {message:"great",pagePath:"/account/?email=private@example.com"},
    {message:"great",pagePath:"//malicious.example"},
    {message:"great",pagePath:"/x".repeat(130)},
    {message:"hi",pagePath:"/account/",userId:memberId},
    {message:12,pagePath:"/account/"},
  ];
  for(const item of invalid){
    const r=await handleFeedback(request(item),memberId,never,respond);
    assert.equal(r.status,400);
  }
  const unsupported=await handleFeedback(request({message:"ok",pagePath:"/"}, "POST","text/plain"),memberId,never,respond);
  assert.equal(unsupported.status,415);
  const noGet=await handleFeedback(request({}, "GET"),memberId,never,respond);
  assert.equal(noGet.status,405);
});
test("rate limit and missing authorization failures never leak raw database errors",async()=>{
  for(const [code,status] of [["P0001",429],["42501",401],["22023",400]]){
    const blocked=async(_id,cb)=>cb({query:async()=>{throw Object.assign(Error("internal details"),{code});}});
    const r=await handleFeedback(request({message:"A note",pagePath:"/"}),memberId,blocked,respond);
    assert.equal(r.status,status);
    assert.doesNotMatch(JSON.stringify(await r.json()),/internal details/);
  }
});
test("migration is write-only, preserves feedback and limits submissions",()=>{
  const sql=readFileSync(new URL("../db/migrations/017_site_feedback.sql",import.meta.url),"utf8");
  const server=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
  assert.match(sql,/ON DELETE SET NULL/);
  assert.match(sql,/REVOKE ALL ON app_private\.site_feedback FROM PUBLIC, ogcupid_member_api, ogcupid_delete_api/);
  assert.match(sql,/REVOKE ALL ON FUNCTION app_private\.submit_site_feedback\(text, text\) FROM PUBLIC/);
  assert.match(sql,/2 OR[\s\S]*interval '1 day'\) >= 30/);
  assert.match(server,/if \(feedbackPath\) \{\s*return await handleFeedback/);
  assert.match(server,/photoPath \|\| onboardingPath \|\| feedbackPath/);
  assert.match(server,/const methodAllowed = feedbackPath \? request\.method === "POST"/);
});
