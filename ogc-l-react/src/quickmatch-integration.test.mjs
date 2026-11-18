import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway,sanitizeQuickmatchDecisions,sanitizeQuickmatchState} from "./member-gateway.mjs";

const YOU="00000000-0000-4000-8000-000000000001";
const THEM="00000000-0000-4000-8000-000000000002";
const OTHER="00000000-0000-4000-8000-000000000003";
const PHOTO1="00000000-0000-4000-8000-000000000011";
const PHOTO2="00000000-0000-4000-8000-000000000012";
const PHOTO3="00000000-0000-4000-8000-000000000013";
const PHOTO4="00000000-0000-4000-8000-000000000014";
const authClient=user=>({getSession:async()=>({data:{
  user:user?{id:user}:null,session:{token:"header.payload.signature"}
},error:null})});
const liveState={
  decisions:[{targetUserId:THEM,decision:"like"}],
  eligibleUserIds:[OTHER],
  outgoingLikes:[THEM],incomingLikes:[THEM],mutualUserIds:[THEM]
};
function gateway({user=YOU,ack=true,fail=false,state=liveState}={}){
  const calls=[];
  const api=createMemberGateway({
    authClient:authClient(user),
    authBaseUrl:"https://example.neonauth.dev/auth",
    memberApiBaseUrl:"https://example.neonapi.dev/profile",
    fetcher:async (url,opts)=>{
      const path=new URL(url).pathname;
      calls.push({path,...opts});
      if(fail)return {ok:false,status:503};
      if(path==="/photos/member/"+THEM)return {ok:true,status:200,json:async()=>({
        photos:[PHOTO1,PHOTO2,PHOTO3,PHOTO4].map(id=>({id,isPrimary:id===PHOTO1}))
      })};
      if([PHOTO1,PHOTO2,PHOTO3,PHOTO4].some(id=>path==="/photos/"+id+"/bytes"))
        return {ok:true,status:200,blob:async()=>new Blob(["photo"],{type:"image/jpeg"})};
      if(opts.method==="GET" && path==="/quickmatch")
        return {ok:true,status:200,json:async()=>state};
      if(opts.method==="PUT" && path==="/quickmatch")
        return {ok:true,status:200,json:async()=>({saved:ack,targetUserId:THEM,decision:"like"})};
      throw Error("Unexpected path "+path);
    }
  });
  return {api,calls};
}

test("owner-only Quickmatch state loads over JWT without exposing raw incoming dislikes",async()=>{
  const {api,calls}=gateway();
  const state=await api.loadQuickmatchDecisions();
  assert.equal(state.decisions.get(THEM),"like");
  assert.equal(state.eligibleUserIds.has(OTHER),true);
  assert.deepEqual(state.outgoingLikes,[THEM]);
  assert.deepEqual(state.incomingLikes,[THEM]);
  assert.equal(state.mutualUserIds.has(THEM),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,"/quickmatch");
  assert.equal(calls[0].method,"GET");
  assert.equal(calls[0].headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[0].credentials,"omit");
  assert.equal(calls[0].cache,"no-store");
});

test("server state validation fails closed on invalid eligibility or inconsistent mutuals",()=>{
  assert.throws(()=>sanitizeQuickmatchState({decisions:null}),e=>e.code==="unavailable");
  assert.throws(()=>sanitizeQuickmatchState({...liveState,eligibleUserIds:["javascript:evil"]}));
  assert.throws(()=>sanitizeQuickmatchState({...liveState,mutualUserIds:[OTHER]}));
  assert.deepEqual([...sanitizeQuickmatchDecisions({decisions:[]})],[]);
});

test("Like writes require positive server confirmation; guest and self votes fail locally",async()=>{
  const {api,calls}=gateway();
  assert.equal((await api.saveQuickmatchDecision(THEM,"like")).saved,true);
  assert.equal(calls[0].method,"PUT");
  assert.deepEqual(JSON.parse(calls[0].body),{targetUserId:THEM,decision:"like"});
  assert.equal(calls[0].headers.Authorization,"Bearer header.payload.signature");
  const rejected=gateway({ack:false});
  await assert.rejects(rejected.api.saveQuickmatchDecision(THEM,"like"),e=>e.code==="unavailable");
  const outage=gateway({fail:true});
  await assert.rejects(outage.api.loadQuickmatchDecisions(),e=>e.code==="unavailable");
  const guest=gateway({user:null});
  await assert.rejects(guest.api.saveQuickmatchDecision(THEM,"like"),e=>e.code==="unauthorized");
  assert.equal(guest.calls.length,0);
  await assert.rejects(api.saveQuickmatchDecision(YOU,"like"),e=>e.code==="invalid");
  await assert.rejects(api.saveQuickmatchDecision("../profile","like"),e=>e.code==="invalid");
  await assert.rejects(api.saveQuickmatchDecision(THEM,"block"),e=>e.code==="invalid");
  assert.equal(calls.length,1);
});

test("up to three genuine member JPEGs are loaded with JWT, respecting album order",async()=>{
  const {api,calls}=gateway();
  const photos=await api.getQuickmatchPhotos(THEM);
  assert.equal(photos.length,3);
  assert.equal(photos.every(p=>p instanceof Blob && p.type==="image/jpeg"),true);
  assert.deepEqual(calls.map(x=>x.path),[
    "/photos/member/"+THEM,
    "/photos/"+PHOTO1+"/bytes",
    "/photos/"+PHOTO2+"/bytes",
    "/photos/"+PHOTO3+"/bytes"
  ]);
  assert.ok(calls.every(x=>x.headers.Authorization==="Bearer header.payload.signature"));
  assert.ok(calls.every(x=>x.credentials==="omit"&&x.cache==="no-store"));
  const guest=gateway({user:null});
  await assert.rejects(guest.api.getQuickmatchPhotos(THEM),e=>e.code==="unauthorized");
  assert.equal(guest.calls.length,0);
  assert.equal((await api.getQuickmatchPhotos("bad-id")).length,0);
});

test("Quickmatch route is member-gated, old faux-vote state removed and only mutual thumbnails open full profiles",()=>{
  const read=name=>readFileSync(new URL(name,import.meta.url),"utf8");
  const app=read("./App.jsx"),view=read("./QuickmatchView.jsx");
  const photos=read("./QuickmatchPhotos.jsx"),restricted=read("./QuickmatchRestrictedProfile.jsx"),provider=read("./MemberSessionProvider.jsx");
  const css=read("./styles.css");
  assert.match(app, /<MemberGate><QuickmatchView Photo=\{MemberPhoto\} \/><\/MemberGate>/);
  assert.match(provider,/loadQuickmatchDecisions, saveQuickmatchDecision, getQuickmatchPhotos/);
  assert.match(view,/await saveQuickmatchDecision\(targetUserId,decision\)/);
  assert.match(view,/await loadQuickmatchDecisions\(\)/);
  assert.match(view,/setQuickState\(null\)/);
  assert.match(view,/remaining\.length>=5/);
  assert.match(view,/tab==="incoming" && !mutual/);
  assert.match(view,/mutual \?/);
  assert.match(view,/<QuickmatchRestrictedProfile member=\{candidate\}/);
  assert.match(restricted,/<QuickmatchPhotos memberId=\{member\.userId\}/);
  assert.match(restricted,/getPublicProfile\(member\.slug\)/);
  assert.match(restricted,/profile\.essays\.messageMeIf/);
  assert.match(restricted,/profile\.details\.orientation/);
  assert.match(photos,/getQuickmatchPhotos\(memberId\)/);
  assert.match(photos,/URL\.revokeObjectURL\(url\)/);
  assert.match(css, /object-fit:contain/);
  assert.match(css, /@container \(max-width:760px\)/);
  assert.doesNotMatch(view,/localStorage|sessionStorage|sendMessage/);
});
