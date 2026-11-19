import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway} from "./member-gateway.mjs";

const ME="00000000-0000-4000-8000-000000000001";
const PEER="00000000-0000-4000-8000-000000000002";
const P1="00000000-0000-4000-8000-000000000011";
const P2="00000000-0000-4000-8000-000000000012";
const P3="00000000-0000-4000-8000-000000000013";
const photos=[
  {id:P2,sortOrder:1,isPrimary:false},
  {id:P1,sortOrder:2,isPrimary:true},
  {id:P3,sortOrder:3,isPrimary:false}
];
function mock({album=photos,contentType="image/jpeg",status=200,user=ME}={}){
  const calls=[],image=new Blob(["genuine jpeg sample"],{type:contentType});
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    calls.push({path,options});
    if(status!==200)return {ok:false,status};
    if(path==="/photos/member/"+PEER)return {ok:true,status:200,json:async()=>({photos:album})};
    if(photos.some(x=>path==="/photos/"+x.id+"/bytes"))
      return {ok:true,status:200,blob:async()=>image};
    throw Error("Unexpected request "+path);
  };
  const gateway=createMemberGateway({
    authClient:{getSession:async()=>({data:{
      user:user?{id:user}:null,session:{token:"header.payload.signature"}
    }})},
    authBaseUrl:"https://photos.neonauth.example/auth",
    memberApiBaseUrl:"https://photos.members.example/",
    fetcher
  });
  return {gateway,calls,image};
}

test("gallery reads only authenticated member album and up to five protected JPEGs",async()=>{
  const {gateway,calls,image}=mock();
  const gallery=await gateway.getMemberGallery(PEER);
  assert.equal(gallery.length,3);
  assert.deepEqual(gallery.map(x=>x.id),[P2,P1,P3]);
  assert.deepEqual(gallery.map(x=>x.isPrimary),[false,true,false]);
  assert.ok(gallery.every(x=>x.image===image));
  assert.deepEqual(calls.map(c=>c.path),[
    "/photos/member/"+PEER,"/photos/"+P2+"/bytes",
    "/photos/"+P1+"/bytes","/photos/"+P3+"/bytes"]);
  assert.ok(calls.every(c=>c.options.headers.Authorization==="Bearer header.payload.signature"));
  assert.ok(calls.every(c=>c.options.credentials==="omit"&&c.options.cache==="no-store"));
  assert.ok(Object.isFrozen(gallery));
});
test("unverified member and guest cannot load private gallery",async()=>{
  const {gateway,calls}=mock();
  assert.deepEqual(await gateway.getMemberGallery("../profiles/other"),[]);
  assert.equal(calls.length,0);
  const guest=mock({user:null});
  await assert.rejects(guest.gateway.getMemberGallery(PEER),e=>e.code==="unauthorized");
  assert.equal(guest.calls.length,0);
});
test("gallery rejects duplicated/malformed/oversized metadata and non-JPEG bytes",async()=>{
  const dup=mock({album:[photos[0],photos[0]]});
  await assert.rejects(dup.gateway.getMemberGallery(PEER),e=>e.code==="unavailable");
  assert.equal(dup.calls.length,1);
  const many=mock({album:Array(6).fill(photos[0])});
  await assert.rejects(many.gateway.getMemberGallery(PEER),e=>e.code==="unavailable");
  const missing=mock({album:[{id:"invalid",sortOrder:0,isPrimary:true}]});
  await assert.rejects(missing.gateway.getMemberGallery(PEER),e=>e.code==="unavailable");
  const untrusted=mock({contentType:"text/html"});
  await assert.rejects(untrusted.gateway.getMemberGallery(PEER),e=>e.code==="unavailable");
  const denied=mock({status:401});
  await assert.rejects(denied.gateway.getMemberGallery(PEER),e=>e.code==="unauthorized");
});
test("Photos tab keeps the official main photo, compact thumbnails and native larger-image dialog",()=>{
  const pane=readFileSync(new URL("./PublicMemberProfile.jsx",import.meta.url),"utf8");
  const gallery=readFileSync(new URL("./ProfileGallery.jsx",import.meta.url),"utf8");
  const provider=readFileSync(new URL("./MemberSessionProvider.jsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("./styles.css",import.meta.url),"utf8");
  assert.match(pane,/<ProfileGallery userId=\{profile.userId\} isOwner=\{profile.isOwner\}/);
  assert.match(gallery,/photos\?\.find\(p=>p.isPrimary\)/);
  assert.match(gallery,/className="ogcl-gallery-thumbs"/);
  assert.match(gallery,/URL\.revokeObjectURL\(url\)/);
  assert.match(gallery,/node\.showModal\(\)/);
  assert.match(gallery,/className="ogcl-profile-pencil"/);
  assert.match(gallery,/to="\/photos"/);
  assert.match(provider,/getMemberGallery/);
  assert.match(css,/\.ogcl-photo-lightbox::backdrop/);
  assert.doesNotMatch(gallery,/localStorage|sessionStorage|imgur|placehold|demo\.png/i);
});
