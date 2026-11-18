import test from "node:test";
import assert from "node:assert/strict";
import {createMemberGateway} from "./member-gateway.mjs";
import {readFileSync} from "node:fs";

const YOU="00000000-0000-4000-8000-000000000001";
const question={id:"vault-5",optionIds:["option-0","option-1"]};
const choice={optionId:"option-0",acceptableOptions:["option-0"],importance:50,isPrivate:true,note:"Fine."};
const token="header.payload.signature";

function setup({user=YOU,answerResponse,putResponse,answerStatus=200}={}){
  const calls=[];
  const authClient={
    getSession:async()=>({data:{user:user?{id:user}:null,session:{token}},error:null})
  };
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;
    calls.push({path,...options});
    if(path!=="/answers")throw new Error("Unexpected path "+path);
    if(options.method==="GET")return {ok:true,status:200,json:async()=>answerResponse||{answers:[]}};
    if(answerStatus!==200)return {ok:false,status:answerStatus,json:async()=>({error:"Rejected"})};
    return {ok:true,status:200,json:async()=>putResponse||{saved:true,updatedAt:"2026-11-18T10:00:00Z"}};
  };
  return {
    gateway:createMemberGateway({
      authClient,authBaseUrl:"https://example.neonauth.dev/auth",
      memberApiBaseUrl:"https://example.neonapi.dev/profile",fetcher
    }),calls
  };
}

test("private /answers read requires a verified user and uses JWT without cookies",async()=>{
  const {gateway,calls}=setup({answerResponse:{answers:[{questionId:"vault-5",isPrivate:true}]}});
  const data=await gateway.loadOwnAnswers();
  assert.equal(data.answers.length,1);
  assert.equal(calls[0].path,"/answers");
  assert.equal(calls[0].method,"GET");
  assert.equal(calls[0].headers.Authorization,"Bearer "+token);
  assert.equal(calls[0].credentials,"omit");
  assert.equal(calls[0].cache,"no-store");
});

test("guest and stale Auth identity cannot fetch or write answers",async()=>{
  const {gateway,calls}=setup({user:null});
  await assert.rejects(gateway.loadOwnAnswers(),e=>e.code==="unauthorized");
  await assert.rejects(gateway.saveOwnAnswer(question,choice),e=>e.code==="unauthorized");
  assert.equal(calls.length,0);
});

test("question updates write exact published answer schema to existing Neon endpoint",async()=>{
  const {gateway,calls}=setup();
  const saved=await gateway.saveOwnAnswer(question,choice);
  assert.equal(saved.questionId,"vault-5");
  assert.equal(saved.isPrivate,true);
  assert.equal(calls[0].method,"PUT");
  assert.equal(calls[0].path,"/answers");
  assert.equal(calls[0].headers.Authorization,"Bearer "+token);
  assert.equal(calls[0].headers["Content-Type"],"application/json");
  assert.deepEqual(JSON.parse(calls[0].body),{questionId:"vault-5",...choice});
  assert.equal(calls[0].credentials,"omit");
});

test("invalid question payload is rejected before contacting member service",async()=>{
  const {gateway,calls}=setup();
  await assert.rejects(gateway.saveOwnAnswer(question,{...choice,importance:5}));
  await assert.rejects(gateway.saveOwnAnswer(question,{...choice,acceptableOptions:[]}));
  assert.equal(calls.length,0);
});

test("backend 401 or nonconfirmation cannot claim a save succeeded",async()=>{
  const a=setup({answerStatus:401});
  await assert.rejects(a.gateway.saveOwnAnswer(question,choice),e=>e.code==="unauthorized");
  const b=setup({putResponse:{saved:false}});
  await assert.rejects(b.gateway.saveOwnAnswer(question,choice),e=>e.code==="unavailable");
});

test("questions route is membership-gated, and owner profile has edit link",()=>{
  const read = name=>readFileSync(new URL(name,import.meta.url),"utf8");
  const app=read("./App.jsx");
  const profile=read("./PublicMemberProfile.jsx");
  const editor=read("./QuestionEditor.jsx");
  assert.match(app, /<MemberGate><QuestionEditor \/><\/MemberGate>/);
  assert.match(profile, /profile\.isOwner[^\n]+to="\/questions"/);
  assert.doesNotMatch(editor,/localStorage|sessionStorage|fake[A-Z]|placeholder answer/i);
  assert.match(editor,/Keep my answer private/);
});
