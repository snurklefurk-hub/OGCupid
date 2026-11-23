import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  isAdminUiDesignPath,adminUiDesignMethodAllowed,validatedDesign,
  handleAdminUiDesign,handlePublicUiDesign
} from "./member-ui-design.js";
const migration=readFileSync(new URL("../db/migrations/034_admin_ui_design_publishing.sql",import.meta.url),"utf8");
const blank={version:2,tokens:{},areas:{},pages:{},texts:{}};
const json=(_req,body,status=200)=>new Response(JSON.stringify(body),{status});
const request=(path,method="GET",body)=>new Request("https://members.example"+path,{
  method,headers:{"Content-Type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
});
const harness=(value={draft:blank,draftVersion:0,history:[],publishedRevision:null},error=null)=>{
  const calls=[];
  const withMember=async(userId,fn)=>fn({query:async(sql,args=[])=>{
    calls.push({userId,sql,args});
    if(error)throw error;
    return {rows:[{data:value}]};
  }});
  return {calls,withMember};
};
const send=async(path,method="GET",body,store=harness())=>{
  const req=request(path,method,body);
  const r=await handleAdminUiDesign(req,"00000000-0000-4000-8000-000000000001",
    new URL(req.url),store.withMember,json);
  return {status:r.status,body:await r.json(),calls:store.calls};
};

test("publishing has exact routes and methods",()=>{
  assert.equal(isAdminUiDesignPath("/admin/ui-design"),true);
  assert.equal(isAdminUiDesignPath("/admin/ui-design/publish"),true);
  assert.equal(isAdminUiDesignPath("/admin/ui-design/rollback"),true);
  assert.equal(isAdminUiDesignPath("/admin/ui-design/secrets"),false);
  assert.equal(adminUiDesignMethodAllowed("/admin/ui-design","PUT"),true);
  assert.equal(adminUiDesignMethodAllowed("/admin/ui-design","POST"),false);
  assert.equal(adminUiDesignMethodAllowed("/admin/ui-design/publish","POST"),true);
  assert.equal(adminUiDesignMethodAllowed("/admin/ui-design/publish","GET"),false);
  assert.equal(adminUiDesignMethodAllowed("/admin/ui-design/rollback","POST"),true);
});

test("draft validation rejects injected selectors, arbitrary CSS and invalid text targets",()=>{
  assert.deepEqual(validatedDesign(blank),blank);
  assert.equal(validatedDesign({...blank,version:99}),null);
  assert.equal(validatedDesign({...blank,tokens:{"--hijack":"red"}}),null);
  assert.equal(validatedDesign({...blank,areas:{"*":{leftRail:{gridTemplateColumns:"none"}}}}),null);
  assert.equal(validatedDesign({...blank,texts:{"*":{"account.password":"secret"}}}),null);
  assert.equal(validatedDesign({...blank,pages:{"/unknown":[{id:"block-abc",type:"heading",text:"unsafe"}]}}),null);
});

test("admin saves are bounded and use checked server-side version",async()=>{
  const result=await send("/admin/ui-design","PUT",
    {document:{...blank,tokens:{"--okc-blue":"#123456"}},expectedVersion:7});
  assert.equal(result.status,200);
  assert.match(result.calls[0].sql,/app_private\.ui_design_save_draft/);
  assert.equal(result.calls[0].args[1],7);
  assert.deepEqual(JSON.parse(result.calls[0].args[0]).tokens,{"--okc-blue":"#123456"});
  for(const payload of [
    {document:{...blank,tokens:{"--okc-blue":"red"}},expectedVersion:7},
    {document:blank,expectedVersion:-1},
    {document:blank,expectedVersion:7,admin:true}
  ]){
    const store=harness();
    const bad=await send("/admin/ui-design","PUT",payload,store);
    assert.equal(bad.status,400);
    assert.equal(store.calls.length,0);
  }
});

test("publish and rollback cannot trust caller-supplied content or actor ID",async()=>{
  const pub=await send("/admin/ui-design/publish","POST",{expectedVersion:3});
  assert.equal(pub.status,200);
  assert.match(pub.calls[0].sql,/ui_design_publish/);
  assert.deepEqual(pub.calls[0].args,[3]);
  const rollback=await send("/admin/ui-design/rollback","POST",{revision:2,expectedVersion:3});
  assert.equal(rollback.status,200);
  assert.match(rollback.calls[0].sql,/ui_design_rollback/);
  assert.deepEqual(rollback.calls[0].args,[2,3]);
  assert.equal((await send("/admin/ui-design/publish","POST",{expectedVersion:3,actor:"admin"})).status,400);
  assert.equal((await send("/admin/ui-design/rollback","POST",{revision:0,expectedVersion:3})).status,400);
});

test("role denial and stale versions never reveal database error text",async()=>{
  const denied=await send("/admin/ui-design","GET",undefined,harness({}, {code:"42501",message:"secret"}));
  assert.equal(denied.status,403);
  const stale=await send("/admin/ui-design/publish","POST",{expectedVersion:1},
    harness({}, {code:"22023",message:"database leak"}));
  assert.equal(stale.status,409);
  assert.doesNotMatch(JSON.stringify(stale.body),/database leak/);
});

test("public endpoint uses no user context and reads only the published function",async()=>{
  const calls=[];
  const pool={query:async(sql)=>{
    calls.push(sql);
    return {rows:[{data:{revision:8,document:{...blank,tokens:{"--okc-blue":"#123456"}}}}]};
  }};
  const r=await handlePublicUiDesign(request("/ui-design"),pool,json);
  assert.equal(r.status,200);
  const output=await r.json();
  assert.equal(output.data.revision,8);
  assert.equal(output.data.document.tokens["--okc-blue"],"#123456");
  assert.deepEqual(calls,["SELECT app_private.ui_design_public() AS data"]);
  assert.equal(JSON.stringify(output).includes("history"),false);
  assert.equal((await handlePublicUiDesign(request("/ui-design","PUT",blank),pool,json)).status,405);
});

test("migration is additive, uses immutable history and SQL role checks",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS app_private\.ui_design_releases/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS app_private\.ui_design_state/);
  assert.match(migration,/ON CONFLICT \(singleton\) DO NOTHING/);
  assert.match(migration,/app_private\.admin_is_authorized\(\)/g);
  assert.match(migration,/SECURITY DEFINER/g);
  assert.match(migration,/FOR UPDATE/g);
  assert.match(migration,/draft_version=p_expected_version/);
  assert.match(migration,/restored_from/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION app_private\.ui_design_public/);
  assert.doesNotMatch(migration,/GRANT (SELECT|INSERT|UPDATE|DELETE) ON app_private\.ui_design_(releases|state) TO ogcupid_member_api/);
});


test("only explicit internal routes are permitted for editor-created links",()=>{
  const valid={...blank,pages:{"/matches":[{
    id:"block-navigation",type:"button",text:"Find matches",hidden:false,
    href:"/matches",style:{}
  }]}};
  assert.deepEqual(validatedDesign(valid),valid);
  assert.equal(validatedDesign({...valid,pages:{"/matches":[
    {...valid.pages["/matches"][0],href:"javascript:alert(1)"}
  ]}}),null);
  assert.equal(validatedDesign({...valid,pages:{"/matches":[
    {...valid.pages["/matches"][0],href:"https://evil.example"}
  ]}}),null);
});
