import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isAdminPath,adminMethodAllowed,handleAdmin} from "./member-admin.js";
import {isAdminEditorPath,adminEditorMethodAllowed} from "./admin-member-editor.js";

const ADMIN="00000000-0000-4000-8000-000000000001";
const USER="00000000-0000-4000-8000-000000000002";
const PHOTO="00000000-0000-4000-8000-000000000003";
const BASE="/admin/members/"+USER;
const migration=readFileSync(new URL("../db/migrations/030_admin_member_content_editor.sql",import.meta.url),"utf8");
function harness(value=true,code=null){
  const calls=[];
  return {calls,withMember:async(actor,cb)=>cb({
    query:async(sql,args)=>{
      calls.push({actor,sql,args});
      if(code)throw {code};
      return {rows:[{data:value}]};
    }
  })};
}
async function run(path,method="GET",data,store=harness()){
  const request=new Request("https://test.invalid"+path,{
    method,
    headers:{"content-type":"application/json"},
    ...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  const response=await handleAdmin(request,ADMIN,new URL(request.url),store.withMember,
    (_req,value,status=200)=>Response.json(value,{status}));
  return {status:response.status,data:await response.json(),calls:store.calls};
}
test("only recognized member editing paths and methods are routable",()=>{
  const allowed=[
    [BASE+"/content","GET"],[BASE+"/field","PUT"],
    [BASE+"/age-range","PUT"],[BASE+"/answers","PUT"],
    [BASE+"/answers/vault-2","DELETE"],[BASE+"/photos","POST"],
    [BASE+"/photos/"+PHOTO+"/bytes","GET"],
    [BASE+"/photos/"+PHOTO+"/replace","PUT"],
    [BASE+"/photos/"+PHOTO+"/primary","POST"],
    [BASE+"/photos/"+PHOTO,"DELETE"]
  ];
  for(const [path,method] of allowed){
    assert.ok(isAdminEditorPath(path),path);
    assert.ok(isAdminPath(path),path);
    assert.ok(adminEditorMethodAllowed(path,method),method+" "+path);
    assert.ok(adminMethodAllowed(path,method),path);
  }
  for(const path of [BASE+"/secrets",BASE+"/password",BASE+"/roles",
    BASE+"/answers/vault-bad",BASE+"/photos/not-a-uuid/bytes"]){
    assert.equal(isAdminPath(path),false,path);
  }
  assert.equal(adminMethodAllowed(BASE+"/field","GET"),false);
  assert.equal(adminMethodAllowed(BASE+"/photos","DELETE"),false);
});
test("admins read protected member content through restricted RPCs",async()=>{
  const r=await run(BASE+"/content");
  assert.equal(r.status,200);
  assert.deepEqual(r.data,{data:true});
  assert.equal(r.calls.length,1);
  assert.equal(r.calls[0].actor,ADMIN);
  assert.match(r.calls[0].sql,/app_private.admin_member_content/);
  assert.deepEqual(r.calls[0].args,[USER]);
  const missing=await run(BASE+"/content","GET",undefined,harness(null));
  assert.equal(missing.status,404);
});
test("profile field edits reject arbitrary account fields and require a reason",async()=>{
  for(const payload of [
    {field:"role",value:"admin",reason:"Testing allowed edit"},
    {field:"about_me",value:"bio",reason:"short"},
    {field:"about_me",value:"bio",reason:"Testing allowed edit",userId:USER}
  ]){
    // Role is rejected by the SQL RPC rather than by trusting a UI allowlist.
    const r=await run(BASE+"/field","PUT",payload,
      harness(true,payload.field==="role"?"22023":null));
    if(payload.field==="role")assert.equal(r.status,409);
    else assert.equal(r.status,400);
  }
  const updated=await run(BASE+"/field","PUT",{
    field:"about_me",value:"new biography",reason:"Correcting the account biography."
  });
  assert.equal(updated.status,200);
  assert.match(updated.calls[0].sql,/admin_edit_member_field/);
  assert.deepEqual(updated.calls[0].args,
    [USER,"about_me","new biography","Correcting the account biography."]);
  assert.equal((await run(BASE+"/age-range","PUT",
    {min:18,max:99,reason:"Adjusting match preferences."})).status,200);
  assert.equal((await run(BASE+"/age-range","PUT",
    {min:99,max:18,reason:"Adjusting match preferences."})).status,400);
});
test("question answers use published IDs and preserve private preferences",async()=>{
  const payload={questionId:"vault-1",optionId:"option-1",
    acceptableOptions:["option-1","option-2"],importance:250,
    isPrivate:true,note:"Test explanation",reason:"Removing an incorrect question response."};
  const accepted=await run(BASE+"/answers","PUT",payload);
  assert.equal(accepted.status,200);
  assert.match(accepted.calls[0].sql,/admin_save_member_answer/);
  assert.equal(accepted.calls[0].args[0],USER);
  assert.equal(accepted.calls[0].args[5],true);
  for(const change of [
    {...payload,questionId:"../../secrets"},
    {...payload,importance:200},
    {...payload,acceptableOptions:["not-option"]},
    {...payload,note:"x".repeat(401)}
  ]){
    const result=await run(BASE+"/answers","PUT",change);
    assert.equal(result.status,400);
    assert.equal(result.calls.length,0);
  }
  const deleted=await run(BASE+"/answers/vault-1","DELETE",
    {reason:"Member requested correction to old answer."});
  assert.equal(deleted.status,200);
  assert.match(deleted.calls[0].sql,/admin_delete_member_answer/);
});
test("admin-only photo operations fail closed without touching storage",async()=>{
  const forbidden=await run(BASE+"/content","GET",undefined,harness(null,"42501"));
  assert.equal(forbidden.status,403);
  assert.match(forbidden.data.error,/Administrator/);
  const unavailable=await run(BASE+"/content","GET",undefined,harness(null,"08006"));
  assert.equal(unavailable.status,503);
  assert.doesNotMatch(JSON.stringify(unavailable.data),/08006/);
  const missing=await run(BASE+"/photos/"+PHOTO+"/bytes","GET",undefined,harness(null));
  assert.equal(missing.status,404);
  assert.match(missing.calls[0].sql,/admin_member_photo_key/);
  const wrong=await run(BASE+"/photos","POST",undefined,harness(false));
  assert.equal(wrong.status,409);
  assert.match(wrong.calls[0].sql,/admin_member_photo_preflight/);
  assert.equal((await run(BASE+"/photos/"+PHOTO+"/primary","POST",
    {reason:"Set the member's corrected picture as primary."})).status,200);
});
test("database uses definer RPCs with live admin role and write audit; member role has no table access",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS app_private\.member_admin_content_edits/);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/);
  assert.match(migration,/FROM PUBLIC,ogcupid_member_api,ogcupid_delete_api/);
  assert.match(migration,/admin_is_authorized\(\)/);
  assert.match(migration,/app\.current_user_id/);
  assert.match(migration,/admin_record_content_edit/);
  assert.match(migration,/app_private\.published_match_questions/);
  assert.doesNotMatch(migration,/GRANT (SELECT|UPDATE|INSERT|DELETE) ON app_private\.member_(profiles|photos|match_answers)/);
  assert.doesNotMatch(migration,/DROP TABLE|DROP SCHEMA/);
  assert.doesNotMatch(migration,/SET\s+ROLE/);
});
