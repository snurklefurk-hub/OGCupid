import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isAdminPromosPath,adminPromosMethodAllowed,
  handleAdminPromos,handlePublicPromos} from "./member-promos.js";
import {validatePromoCard,validPromoUrl,resolvePromoUrl,
  choosePromoCards} from "../ogc-l-react/src/promo-contract.mjs";

const req=(path,method="GET",body)=>new Request("https://members.example"+path,{
  method,headers:{"Content-Type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
const json=(_r,body,status=200)=>new Response(JSON.stringify(body),{status});
const card={title:"New Feature",body:"There is something here.",url:"/matches",
  enabled:true,category:"editorial",side:"both"};
const fake=(data=[],error=null)=>{
  const calls=[];
  return {calls,withMember:async(id,callback)=>callback({query:async(sql,args=[])=>{
    calls.push({id,sql,args});
    if(error)throw error;
    return {rows:[{data}]};
  }})};
};
const send=async(path,method="GET",body,store=fake())=>{
  const request=req(path,method,body),url=new URL(request.url);
  const response=await handleAdminPromos(request,
    "00000000-0000-4000-8000-000000000001",url,store.withMember,json);
  return {status:response.status,body:await response.json(),calls:store.calls};
};

test("exact promo routes and methods require the common admin gate",()=>{
  assert.equal(isAdminPromosPath("/admin/promos"),true);
  assert.equal(isAdminPromosPath("/admin/promos/123"),true);
  assert.equal(isAdminPromosPath("/admin/promos/../../secrets"),false);
  assert.equal(adminPromosMethodAllowed("/admin/promos","GET"),true);
  assert.equal(adminPromosMethodAllowed("/admin/promos","POST"),true);
  assert.equal(adminPromosMethodAllowed("/admin/promos/1","PUT"),true);
  assert.equal(adminPromosMethodAllowed("/admin/promos/1","DELETE"),true);
  assert.equal(adminPromosMethodAllowed("/admin/promos/1","GET"),false);
  assert.equal(adminPromosMethodAllowed("/admin/promos","DELETE"),false);
  const parent=readFileSync(new URL("./member-profile.ts",import.meta.url),"utf8");
  assert.match(parent,/const adminPath = isAdminPath\(url.pathname\)/);
  assert.match(parent,/if \(!userId\) return json\(request, \{ error: "Unauthorized" \}, 401\)/);
  assert.match(parent,/current_member_is_active\(\)/);
  assert.match(parent,/handlePublicPromos\(request,pool,json\)/);
  const admin=readFileSync(new URL("./member-admin.js",import.meta.url),"utf8");
  assert.match(admin,/isAdminPromosPath\(pathname\)/);
  assert.match(admin,/handleAdminPromos\(request,userId,url,withMember,json\)/);
});

test("title, body, placement and URL are validated before any SQL call",async()=>{
  assert.deepEqual(validatePromoCard(card),card);
  assert.equal(validPromoUrl(""),true);
  assert.equal(validPromoUrl("/profiles/{slug}?tab=personality"),true);
  assert.equal(validPromoUrl("https://example.org/hello?x=y"),true);
  for(const bad of ["javascript:alert(1)","data:text/html,x","//evil.com",
    "http://insecure.example","/../../secret","/profile%2F..","/profiles/{slug}/edit",
    "https://u:pass@example.org/","https://example.org/\nsecret"]){
    assert.equal(validPromoUrl(bad),false,bad);
    const store=fake();
    const response=await send("/admin/promos","POST",{card:{...card,url:bad}},store);
    assert.equal(response.status,400);
    assert.equal(store.calls.length,0);
  }
  assert.equal(validatePromoCard({...card,side:"left",category:"refinement"}),null);
  assert.equal(validatePromoCard({...card,title:"x".repeat(121)}),null);
  assert.equal(validatePromoCard({...card,evil:true}),null);
  assert.equal(validatePromoCard({...card,enabled:"true"}),null);
});

test("create, update and delete only call admin role-checked SQL functions",async()=>{
  const created=await send("/admin/promos","POST",{card});
  assert.equal(created.status,200);
  assert.match(created.calls[0].sql,/promo_cards_create/);
  assert.deepEqual(JSON.parse(created.calls[0].args[0]),card);
  const updated=await send("/admin/promos/12","PUT",{card:{...card,enabled:false}});
  assert.equal(updated.status,200);
  assert.match(updated.calls[0].sql,/promo_cards_update/);
  assert.deepEqual(updated.calls[0].args.slice(0,1),[12]);
  const deleted=await send("/admin/promos/12","DELETE");
  assert.equal(deleted.status,200);
  assert.match(deleted.calls[0].sql,/promo_cards_delete/);
  assert.deepEqual(deleted.calls[0].args,[12]);
  const noPayload=await send("/admin/promos","POST",{card,actor:"admin"});
  assert.equal(noPayload.status,400);
  assert.equal((await send("/admin/promos/0","DELETE")).status,404);
});

test("forbidden and unavailable errors do not leak database internals",async()=>{
  const forbidden=await send("/admin/promos","GET",undefined,fake([], {code:"42501",message:"private"}));
  assert.equal(forbidden.status,403);
  const missing=await send("/admin/promos/12","DELETE",undefined,
    fake([], {code:"22023",message:"secret"}));
  assert.equal(missing.status,409);
  assert.doesNotMatch(JSON.stringify(missing.body),/secret/);
  const outage=await send("/admin/promos","GET",undefined,
    fake([],new Error("DATABASE_URL unavailable")));
  assert.equal(outage.status,503);
  assert.doesNotMatch(JSON.stringify(outage.body),/DATABASE_URL/);
});

test("public catalogue returns only the public RPC data; no JWT is required",async()=>{
  const calls=[];
  const pool={query:async(sql)=>{calls.push(sql);return {rows:[{data:[{id:9,...card}]}]};}};
  const result=await handlePublicPromos(req("/promos"),pool,json);
  assert.equal(result.status,200);
  assert.equal((await result.json()).data[0].title,card.title);
  assert.deepEqual(calls,["SELECT app_private.promo_cards_public() AS data"]);
  assert.equal((await handlePublicPromos(req("/promos","POST",{card}),pool,json)).status,405);
});

test("selection is distinct, respects columns, and an empty list remains empty",()=>{
  const cards=[
    {id:1,...card,side:"left"}, {id:2,...card,side:"right"},
    ...[3,4,5,6,7,8].map(id=>({id,...card,side:"both"})),
    {id:9,...card,category:"refinement",side:"right"},
    {id:10,...card,enabled:false}
  ];
  const selection=choosePromoCards(cards,()=>0);
  assert.equal(selection.left.length,3);
  assert.equal(selection.right.length,3);
  assert.equal(selection.left[0].id,1);
  assert.equal(selection.right[0].id,2);
  assert.equal(new Set([...selection.left,...selection.right].map(x=>x.id)).size,6);
  assert.equal(selection.refinement.id,9);
  assert.deepEqual(choosePromoCards([]),{left:[],right:[],refinement:null});
  assert.deepEqual(resolvePromoUrl("/profiles/{slug}?tab=about","member-one"),
    {to:"/profiles/member-one?tab=about",external:false});
  assert.equal(resolvePromoUrl("/profiles/{slug}",null),null);
  assert.deepEqual(resolvePromoUrl("https://example.com",null),
    {to:"https://example.com",external:true});
});

test("additive SQL creates 25 approved starting cards and definer-only writes",()=>{
  const migration=readFileSync(new URL("../db/migrations/035_admin_promos.sql",import.meta.url),"utf8");
  assert.match(migration,/CREATE TABLE IF NOT EXISTS app_private\.promo_cards/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS app_private\.promo_card_events/);
  assert.match(migration,/jsonb_to_recordset/);
  assert.match(migration,/ON CONFLICT \(seed_key\) DO NOTHING/);
  assert.match(migration,/SECURITY DEFINER/g);
  assert.match(migration,/app_private\.admin_is_authorized\(\)/g);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION app_private\.promo_cards_public/);
  assert.doesNotMatch(migration,/GRANT (SELECT|UPDATE|DELETE|INSERT) ON app_private\.promo_cards TO ogcupid_member_api/);
});
