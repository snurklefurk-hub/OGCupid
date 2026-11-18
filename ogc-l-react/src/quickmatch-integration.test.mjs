import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway,sanitizeQuickmatchDecisions} from "./member-gateway.mjs";

const YOU="00000000-0000-4000-8000-000000000001";
const THEM="00000000-0000-4000-8000-000000000002";
const authClient=user=>({getSession:async()=>({data:{
  user:user?{id:user}:null,session:{token:"header.payload.signature"}
},error:null})});
function gateway({user=YOU,ack=true,fail=false}={}){
  const calls=[];
  const api=createMemberGateway({
    authClient:authClient(user),
    authBaseUrl:"https://example.neonauth.dev/auth",
    memberApiBaseUrl:"https://example.neonapi.dev/profile",
    fetcher:async (url,opts)=>{
      calls.push({path:new URL(url).pathname,...opts});
      if(fail)return {ok:false,status:503};
      if(opts.method==="GET")return {ok:true,status:200,json:async()=>({
        decisions:[{targetUserId:THEM,decision:"dislike"}]
      })};
      return {ok:true,status:200,json:async()=>({
        saved:ack,targetUserId:THEM,decision:"like"
      })};
    }
  });
  return {api,calls};
}

test("existing owner decisions load from JWT-only /quickmatch, no browser storage",async()=>{
  const {api,calls}=gateway();
  const votes=await api.loadQuickmatchDecisions();
  assert.equal(votes.get(THEM),"dislike");
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,"/quickmatch");
  assert.equal(calls[0].method,"GET");
  assert.equal(calls[0].headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[0].credentials,"omit");
  assert.equal(calls[0].cache,"no-store");
});

test("likes move forward only on acknowledged private server write",async()=>{
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

test("guest, self, bad UUID or choice cannot write a vote",async()=>{
  const guest=gateway({user:null});
  await assert.rejects(guest.api.saveQuickmatchDecision(THEM,"like"),e=>e.code==="unauthorized");
  const {api,calls}=gateway();
  await assert.rejects(api.saveQuickmatchDecision(YOU,"like"),e=>e.code==="invalid");
  await assert.rejects(api.saveQuickmatchDecision("../profile","like"),e=>e.code==="invalid");
  await assert.rejects(api.saveQuickmatchDecision(THEM,"block"),e=>e.code==="invalid");
  assert.equal(calls.length,0);
  assert.equal(guest.calls.length,0);
});

test("malformed response never becomes an empty set of trustworthy decisions",()=>{
  assert.throws(()=>sanitizeQuickmatchDecisions({decisions:null}),e=>e.code==="unavailable");
  assert.throws(()=>sanitizeQuickmatchDecisions({decisions:[{targetUserId:THEM,decision:"maybe"}]}));
  assert.deepEqual([...sanitizeQuickmatchDecisions({decisions:[]})],[]);
});

test("QUICKMATCH route uses persistent component, never a fabricated preview vote",()=>{
  const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
  const view=readFileSync(new URL("./QuickmatchView.jsx",import.meta.url),"utf8");
  const provider=readFileSync(new URL("./MemberSessionProvider.jsx",import.meta.url),"utf8");
  assert.match(app, /<MemberGate><QuickmatchView Photo=\{MemberPhoto\} \/><\/MemberGate>/);
  assert.match(provider,/loadQuickmatchDecisions, saveQuickmatchDecision/);
  assert.match(view,/await saveQuickmatchDecision\(candidate\.userId,decision\)/);
  assert.match(view,/setDecisions\(previous=>new Map\(previous\)/);
  assert.match(view,/if\(!active\)return/);
  assert.doesNotMatch(view,/localStorage|sessionStorage|mutualMatch|sendMessage/);
});
