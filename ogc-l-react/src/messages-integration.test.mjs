import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway,sanitizeConversations,sanitizeConversation} from "./member-gateway.mjs";

const SELF="00000000-0000-4000-8000-000000000001";
const PEER="00000000-0000-4000-8000-000000000002";
const MID="00000000-0000-4000-8000-000000000003";
const message={id:MID,senderId:SELF,recipientId:PEER,body:"Hello",createdAt:"2026-11-18T18:00:00Z"};
const thread={peer:{userId:PEER,displayName:"Peer",slug:"peer"},messages:[message],blocked:false,canSend:true};
const inbox={conversations:[{peerId:PEER,displayName:"Peer",slug:"peer",lastMessage:message}]};
function gateway({user=SELF,status=200,sendConfirmed=true}={}){
  const calls=[];
  const gateway=createMemberGateway({
    authClient:{getSession:async()=>({data:{user:user?{id:user}:null,
      session:{token:"header.payload.signature"}}})},
    authBaseUrl:"https://example.auth.test/auth",
    memberApiBaseUrl:"https://example.neon.test/",
    fetcher:async (url,options)=>{
      const path=new URL(url).pathname;
      calls.push({path,...options});
      if(status!==200)return {ok:false,status};
      const response=path==="/messages"?inbox:
        path==="/messages/"+PEER&&options.method==="GET"?thread:
        path==="/messages/"+PEER+"/block"?{blocked:options.method==="PUT"}:
        path==="/messages/"+PEER+"/report"?{reported:true}:
        {sent:sendConfirmed,message};
      return {ok:true,status:200,json:async()=>response};
    }
  });
  return {gateway,calls};
}
test("inbox and conversations use only JWT-protected Neon data and no storage",async()=>{
  const {gateway:api,calls}=gateway();
  const list=await api.loadInbox();
  const detail=await api.loadConversation(PEER);
  assert.equal(list[0].lastMessage.body,"Hello");
  assert.equal(detail.peer.userId,PEER);
  assert.deepEqual(calls.map(x=>x.path),["/messages","/messages/"+PEER]);
  assert.equal(calls[0].headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[0].credentials,"omit");
  assert.equal(calls[0].cache,"no-store");
});
test("sending messages only succeeds when server confirms the actual saved message",async()=>{
  const {gateway:api,calls}=gateway();
  const saved=await api.sendMessage(PEER," Hello ");
  assert.equal(saved.id,MID);
  assert.equal(calls[0].method,"POST");
  assert.deepEqual(JSON.parse(calls[0].body),{body:"Hello"});
  const failed=gateway({sendConfirmed:false});
  await assert.rejects(failed.gateway.sendMessage(PEER,"Hello"),e=>e.code==="unavailable");
  const throttled=gateway({status:429});
  await assert.rejects(throttled.gateway.sendMessage(PEER,"Hello"),e=>e.code==="rate_limited");
});
test("block/unblock/report endpoints are scoped to the signed-in account",async()=>{
  const {gateway:api,calls}=gateway();
  assert.equal(await api.setMessageBlock(PEER,true),true);
  assert.equal(await api.setMessageBlock(PEER,false),false);
  assert.equal(await api.reportMessage(PEER,MID,"harassment"),true);
  assert.deepEqual(calls.map(x=>x.method),["PUT","DELETE","POST"]);
  assert.deepEqual(JSON.parse(calls[2].body),{messageId:MID,reason:"harassment"});
  assert.ok(calls.every(x=>x.headers.Authorization==="Bearer header.payload.signature"));
});
test("guest, invalid target, self and invalid report fail before network calls",async()=>{
  const {gateway:api,calls}=gateway();
  await assert.rejects(api.sendMessage(SELF,"Hello"),e=>e.code==="invalid");
  await assert.rejects(api.sendMessage("../profile","Hello"),e=>e.code==="invalid");
  await assert.rejects(api.sendMessage(PEER,"    "),e=>e.code==="invalid");
  await assert.rejects(api.reportMessage(PEER,MID,"doxx"),e=>e.code==="invalid");
  assert.equal(calls.length,0);
  const guest=gateway({user:null});
  await assert.rejects(guest.gateway.loadInbox(),e=>e.code==="unauthorized");
  assert.equal(guest.calls.length,0);
});
test("malicious cross-member data and invalid payloads reject entire inbox or thread",()=>{
  assert.throws(()=>sanitizeConversations({conversations:[{...inbox.conversations[0],
    lastMessage:{...message,recipientId:SELF}}]},SELF),e=>e.code==="unavailable");
  assert.throws(()=>sanitizeConversation({...thread,peer:{...thread.peer,userId:SELF}},SELF,PEER));
  assert.throws(()=>sanitizeConversation({...thread,messages:[{...message,body:"x".repeat(2100)}]},SELF,PEER));
  assert.throws(()=>sanitizeConversations({conversations:null},SELF));
});
test("member-only MESSAGES routes use real view, no placeholder or local storage",()=>{
  const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
  const view=readFileSync(new URL("./MessagesView.jsx",import.meta.url),"utf8");
  const publicProfile=readFileSync(new URL("./PublicMemberProfile.jsx",import.meta.url),"utf8");
  assert.match(app,/<Route path="messages" element=\{<MemberGate><MessagesView \/><\/MemberGate>\}/);
  assert.match(app,/<Route path="messages\/:peerId" element=\{<MemberGate><MessagesView \/><\/MemberGate>\}/);
  assert.match(view,/await sendMessage\(peerId,body\)/);
  assert.doesNotMatch(view,/await setMessageBlock\(peerId,blocked\)/);
  assert.match(readFileSync(new URL("./ProfileSettings.jsx",import.meta.url),"utf8"),
    /await setSiteBlock\(userId,false\)/);
  assert.match(view,/await reportMessage\(peerId,messageId,reason\)/);
  assert.match(publicProfile,/to=\{"\/messages\/"\+profile\.userId\}/);
  assert.doesNotMatch(view,/localStorage|sessionStorage|placeholder conversation/i);
});
