import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway,sanitizeQuickmatchDecisions,sanitizeQuickmatchState} from "./member-gateway.mjs";

const YOU="00000000-0000-4000-8000-000000000001";
const THEM="00000000-0000-4000-8000-000000000002";
const OTHER="00000000-0000-4000-8000-000000000003";
const activeState=Object.freeze({
  decisions:[{targetUserId:THEM,decision:"like"}],
  eligibleUserIds:[OTHER],
  outgoingLikes:[THEM],incomingLikes:[THEM],mutualUserIds:[THEM]
});
const authClient=user=>({getSession:async()=>({data:{
  user:user?{id:user}:null,session:{token:"header.payload.signature"}
},error:null})});
function gateway({user=YOU,ack=true,fail=false,state=activeState}={}){
  const calls=[];
  const api=createMemberGateway({
    authClient:authClient(user),
    authBaseUrl:"https://example.neonauth.dev/auth",
    memberApiBaseUrl:"https://example.neonapi.dev/profile",
    fetcher:async(url,opts)=>{
      calls.push({path:new URL(url).pathname,...opts});
      if(fail)return {ok:false,status:503};
      if(opts.method==="GET")return {ok:true,status:200,json:async()=>state};
      if(opts.method==="PUT")return {ok:true,status:200,json:async()=>({
        saved:ack,targetUserId:THEM,decision:"like"
      })};
      throw Error("Unexpected method "+opts.method);
    }
  });
  return {api,calls};
}
test("owner-only Quickmatch state loads with JWT, safely validating incoming and mutuals",async()=>{
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
test("malformed or contradictory pair state fails closed",()=>{
  assert.throws(()=>sanitizeQuickmatchState({decisions:null}),e=>e.code==="unavailable");
  assert.throws(()=>sanitizeQuickmatchState({...activeState,eligibleUserIds:["javascript:evil"]}));
  assert.throws(()=>sanitizeQuickmatchState({...activeState,mutualUserIds:[OTHER]}));
  assert.deepEqual([...sanitizeQuickmatchDecisions({decisions:[]})],[]);
});
test("Like and Dislike writes require actual positive server confirmation",async()=>{
  const {api,calls}=gateway();
  assert.equal((await api.saveQuickmatchDecision(THEM,"like")).saved,true);
  assert.equal(calls[0].method,"PUT");
  assert.deepEqual(JSON.parse(calls[0].body),{targetUserId:THEM,decision:"like"});
  assert.equal(calls[0].headers.Authorization,"Bearer header.payload.signature");
  const rejected=gateway({ack:false});
  await assert.rejects(rejected.api.saveQuickmatchDecision(THEM,"like"),e=>e.code==="unavailable");
  const outage=gateway({fail:true});
  await assert.rejects(outage.api.loadQuickmatchDecisions(),e=>e.code==="unavailable");
});
test("guest, self, invalid UUID and invalid vote never hit database",async()=>{
  const guest=gateway({user:null});
  await assert.rejects(guest.api.saveQuickmatchDecision(THEM,"like"),e=>e.code==="unauthorized");
  const {api,calls}=gateway();
  await assert.rejects(api.saveQuickmatchDecision(YOU,"like"),e=>e.code==="invalid");
  await assert.rejects(api.saveQuickmatchDecision("../profile","like"),e=>e.code==="invalid");
  await assert.rejects(api.saveQuickmatchDecision(THEM,"block"),e=>e.code==="invalid");
  assert.equal(calls.length,0);
  assert.equal(guest.calls.length,0);
});
test("Quickmatch UI preserves original hearts and restricts full-profile links to mutuals",()=>{
  const read=name=>readFileSync(new URL(name,import.meta.url),"utf8");
  const app=read("./App.jsx"),view=read("./QuickmatchView.jsx");
  const photos=read("./QuickmatchPhotos.jsx"),restricted=read("./QuickmatchRestrictedProfile.jsx");
  const provider=read("./MemberSessionProvider.jsx"),css=read("./styles.css");
  assert.match(app,/<MemberGate><QuickmatchView Photo=\{MemberPhoto\} \/><\/MemberGate>/);
  assert.match(provider,/loadQuickmatchDecisions, saveQuickmatchDecision/);
  assert.match(view,/HeartDecision kind="like"/);
  assert.match(view,/HeartDecision kind="dislike"/);
  assert.match(view,/queueOrder\.length>=5/);
  assert.match(view,/setQueueOrder\(current=>/);
  assert.match(view,/tab==="incoming"/);
  assert.match(view,/mutual\?/);
  assert.match(view,/<QuickmatchRestrictedProfile member=\{candidate\}>/);
  assert.match(view,/<HeartIcon kind="like"/);
  assert.match(restricted,/<QuickmatchPhotos memberId=\{member.userId\}/);
  assert.match(restricted,/getPublicProfile\(member.slug\)/);
  assert.match(restricted,/profile\.essays\.messageMeIf/);
  assert.match(restricted,/profile\.details\.orientation/);
  assert.match(photos,/getMemberGallery\(memberId\)/);
  assert.match(photos,/URL\.revokeObjectURL\(url\)/);
  assert.match(css,/object-fit:contain/);
  assert.match(css,/@container \(max-width:760px\)/);
  assert.doesNotMatch(view,/localStorage|sessionStorage|sendMessage|>Undo</);
});
