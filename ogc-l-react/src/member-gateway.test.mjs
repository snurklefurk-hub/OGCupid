import test from "node:test";
import assert from "node:assert/strict";
import {
  bounded, createMemberGateway, configuredMemberEndpoints,
  MemberAccessError, sanitizeOnboarding, sanitizeProfile,
  sanitizeDiscovery, selectRecommendedMembers
} from "./member-gateway.mjs";

const YOU="00000000-0000-4000-8000-000000000001";
const THEM="00000000-0000-4000-8000-000000000002";
const THIRD="00000000-0000-4000-8000-000000000003";
const authUrl="https://example.neonauth.dev/auth";
const apiUrl="https://example.neonapi.dev/profile";
const session={user:{id:YOU,name:"Test Person",email:"private@invalid.example"},
  session:{token:"header.payload.signature"}};
const good = body => ({ok:true,status:200,json:async()=>body});
const bad = status => ({ok:false,status,json:async()=>({error:"not available"})});
const fakeOnboarding={identity:true,locality:true,profile:true,photo:true,quiz:true,
  explored:true,answerCount:25,photoCount:1,state:{birth_date:"2000-01-01",zip_code:"12345"}};
const fakeProfile={profile:{userId:YOU,displayName:"Demo",slug:"demo",aboutMe:"private essay",
  email:"private@invalid.example"}};
const fakeDiscovery={profiles:[{userId:THEM,slug:"test-member",displayName:"Test Member",
  matchPercent:58,confidence:"low",commonQuestions:1,
  email:"hidden@invalid.example",acceptableOptions:["private"]}]};

function mockGateway({authSession=session, onboarding=fakeOnboarding,
  profile=fakeProfile, discovery=fakeDiscovery, responseFor}={}) {
  const calls=[];
  const authClient={
    getSession:async()=>({data:authSession,error:null}),
    signIn:{email:async input=>{calls.push(["signin",input.email]);return {error:null}}},
    signOut:async()=>{calls.push(["signout"]);return {error:null}}
  };
  const fetcher=async(url,opts)=>{
    calls.push([new URL(url).pathname, opts]);
    if (responseFor) return responseFor(url,opts);
    const path=new URL(url).pathname;
    if(path==="/onboarding")return good(onboarding);
    if(path==="/profile")return good(profile);
    if(path==="/discovery")return good(discovery);
    if(path==="/auth/token")return good({token:"header.payload.signature"});
    throw new Error("unexpected request "+path);
  };
  return {
    service:createMemberGateway({authClient,authBaseUrl:authUrl,memberApiBaseUrl:apiUrl,fetcher}),
    calls, authClient
  };
}

test("missing or insecure URLs cannot silently connect the preview to any database",()=>{
  assert.equal(configuredMemberEndpoints("",apiUrl),null);
  assert.equal(configuredMemberEndpoints("http://127.0.0.1:4000/auth",apiUrl),null);
  assert.equal(configuredMemberEndpoints(authUrl,"http://localhost:1234"),null);
  assert.equal(createMemberGateway({authClient:{},authBaseUrl:"",memberApiBaseUrl:apiUrl}),null);
  assert.deepEqual(configuredMemberEndpoints(authUrl,apiUrl),
    {authBaseUrl:authUrl, memberApiBaseUrl:"https://example.neonapi.dev"});
});

test("guest without Neon Auth user never reads private API",async()=>{
  const {service,calls}=mockGateway({authSession:{user:null,session:null}});
  assert.deepEqual(await service.load(),{kind:"guest"});
  assert.equal(calls.length,0);
});

test("valid signed-in member checks server onboarding FIRST and returns only whitelisted data",async()=>{
  const {service,calls}=mockGateway();
  const result=await service.load();
  assert.equal(result.kind,"member");
  assert.deepEqual(result.user,{id:YOU,name:"Test Person"});
  assert.equal(result.onboarding.explored,true);
  assert.deepEqual(result.profile,{userId:YOU,displayName:"Demo",slug:"demo"});
  assert.deepEqual(result.discovery,[{
    userId:THEM,slug:"test-member",displayName:"Test Member",matchPercent:58,
    confidence:"low",commonQuestions:1
  }]);
  assert.deepEqual(calls.map(([path])=>path),["/onboarding","/profile","/discovery"]);
  assert.equal(calls[0][1].headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[0][1].credentials,"omit");
  assert.equal(calls[0][1].cache,"no-store");
  assert.equal(JSON.stringify(result).includes("private@invalid.example"),false);
  assert.equal(JSON.stringify(result).includes("birth_date"),false);
  assert.equal(JSON.stringify(result).includes("acceptableOptions"),false);
});

test("unfinished onboarding stops before loading profile or discovery",async()=>{
  const {service,calls}=mockGateway({onboarding:{...fakeOnboarding,explored:false}});
  const status=await service.load();
  assert.equal(status.kind,"onboarding");
  assert.deepEqual(calls.map(([path])=>path),["/onboarding"]);
  assert.equal(status.profile,undefined);
});

test("opaque Auth cookie is exchanged for a short-lived JWT with credentials and no cache",async()=>{
  const {service,calls}=mockGateway({authSession:{...session,session:{token:"opaque-id"}}});
  assert.equal((await service.load()).kind,"member");
  assert.deepEqual(calls.map(([path])=>path),
    ["/auth/token","/onboarding","/profile","/discovery"]);
  assert.equal(calls[0][1].credentials,"include");
  assert.equal(calls[0][1].cache,"no-store");
});

test("401 from protected onboarding rejects cached Auth identities",async()=>{
  const {service,calls}=mockGateway({responseFor:async(url)=>{
    const path=new URL(url).pathname;
    return path==="/onboarding" ? bad(401) : good({});
  }});
  await assert.rejects(service.load(),error=>error.code==="unauthorized");
  assert.deepEqual(calls.map(([path])=>path),["/onboarding"]);
});

test("deleted/invalid Auth identity does not call Neon member Function",async()=>{
  const {service,calls}=mockGateway({authSession:{user:{id:"not-a-uuid"},session:session.session}});
  await assert.rejects(service.load(),error=>error.code==="unauthorized");
  assert.equal(calls.length,0);
});

test("non-auth failure during required onboarding check is fail closed",async()=>{
  const {service}=mockGateway({responseFor:async()=>bad(503)});
  await assert.rejects(service.load(),error=>error.code==="unavailable");
});

test("secondary discovery failure does not send completed members to onboarding",async()=>{
  const {service}=mockGateway({responseFor:async(url)=>{
    const path=new URL(url).pathname;
    return path==="/onboarding" ? good(fakeOnboarding)
      : path==="/profile" ? good(fakeProfile) : bad(503);
  }});
  const result=await service.load();
  assert.equal(result.kind,"member");
  assert.equal(result.discoveryUnavailable,true);
  assert.deepEqual(result.discovery,[]);
  assert.equal(result.profile.displayName,"Demo");
});

test("secondary 401 always invalidates protected member view",async()=>{
  const {service}=mockGateway({responseFor:async(url)=>{
    const path=new URL(url).pathname;
    return path==="/onboarding" ? good(fakeOnboarding) :
      path==="/profile" ? bad(401) : good(fakeDiscovery);
  }});
  await assert.rejects(service.load(),error=>error.code==="unauthorized");
});

test("profile ownership is verified and only safe fields are retained",()=>{
  assert.throws(()=>sanitizeProfile({profile:{userId:THIRD}},YOU),
    error=>error.code==="unavailable");
  assert.equal(sanitizeProfile({profile:null},YOU),null);
  assert.equal(sanitizeProfile(fakeProfile,YOU).slug,"demo");
});

test("unscored profiles remain eligible; malformed records and self are excluded",()=>{
  const result=sanitizeDiscovery({profiles:[
    {userId:THEM,slug:"ok",displayName:"Ok",matchPercent:null,confidence:"insufficient",commonQuestions:0},
    {userId:YOU,slug:"self",displayName:"Self",matchPercent:95},
    {userId:THIRD,slug:"javascript:danger",displayName:"Bad",matchPercent:92},
    {userId:THIRD,slug:"third",displayName:"Bad",matchPercent:Infinity}
  ]},YOU);
  assert.deepEqual(result.map(p=>p.slug),["ok"]);
  assert.equal(result[0].matchPercent,null);
});

test("recommendations sample real >75% members then scored/unscored fallback",()=>{
  const profiles=[
    {userId:"1",matchPercent:75},{userId:"2",matchPercent:90},
    {userId:"3",matchPercent:null},{userId:"4",matchPercent:60}
  ];
  assert.deepEqual(selectRecommendedMembers(profiles,()=>0.5).map(x=>x.userId),["2","1","4"]);
  assert.equal(selectRecommendedMembers(profiles.slice(2)).length,2);
  assert.equal(profiles.length,4);
});

test("onboarding status keeps only non-sensitive completion fields",()=>{
  const state=sanitizeOnboarding(fakeOnboarding);
  assert.equal(Object.hasOwn(state,"state"),false);
  assert.equal(state.answerCount,25);
  assert.equal(Object.isFrozen(state),true);
});

test("sign-in and sign-out use the existing Neon Auth methods",async()=>{
  const {service,calls}=mockGateway();
  await service.signIn(" test@invalid.example ","pw");
  await service.signOut();
  assert.deepEqual(calls,[["signin","test@invalid.example"],["signout"]]);
});

test("timeout is bounded and does not grant access",async()=>{
  await assert.rejects(bounded(new Promise(()=>{}),5),MemberAccessError);
});


test("member avatars are genuine protected JPEG bytes, never an unauthenticated image URL",async()=>{
  const PHOTO="00000000-0000-4000-8000-000000000009";
  const image = new Blob(["jpeg-test"],{type:"image/jpeg"});
  const {service,calls}=mockGateway({responseFor:async (url,options)=>{
    const path = new URL(url).pathname;
    if(path==="/photos/member/"+THEM) return good({photos:[
      {id:PHOTO,isPrimary:true}
    ]});
    if(path==="/photos/"+PHOTO+"/bytes") return {ok:true,status:200,blob:async()=>image};
    throw new Error("Unexpected path "+path);
  }});
  const blob=await service.getMemberAvatar(THEM);
  assert.equal(blob,image);
  assert.deepEqual(calls.map(([path])=>path),[
    "/photos/member/"+THEM, "/photos/"+PHOTO+"/bytes"
  ]);
  assert.equal(calls[0][1].headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[1][1].credentials,"omit");
  assert.equal(calls[1][1].cache,"no-store");
});
test("avatars reject invalid identities and unsupported media rather than using public image URLs",async()=>{
  const {service,calls}=mockGateway();
  assert.equal(await service.getMemberAvatar("javascript:evil"),null);
  assert.equal(calls.length,0);
  const PHOTO="00000000-0000-4000-8000-000000000009";
  const {service:badPhoto}=mockGateway({responseFor:async url=>{
    const path=new URL(url).pathname;
    if(path.startsWith("/photos/member/"))return good({photos:[{id:PHOTO,isPrimary:true}]});
    return {ok:true,status:200,blob:async()=>new Blob(["not a jpeg"],{type:"text/html"})};
  }});
  assert.equal(await badPhoto.getMemberAvatar(THEM),null);
});


test("native peer profile is a JWT-gated read of public fields only",async()=>{
  const {service,calls}=mockGateway({responseFor:async(url)=>{
    const path=new URL(url).pathname;
    if(path==="/profiles/peer-member")return good({
      profile:{
        userId:THEM,slug:"peer-member",displayName:"Peer Member",
        age:29,cityRegion:"Atlanta",aboutMe:"Hello world",messageMeIf:"Say hi",
        email:"secret@invalid.example"
      },
      publicAnswers:[{questionId:"vault-5",optionId:"option-1",note:"Public explanation"}],
      isOwner:false,personaCode:"DBSDf"
    });
    throw Error("Unexpected path "+path);
  }});
  const peer=await service.getPublicProfile("peer-member");
  assert.equal(peer.slug,"peer-member");
  assert.equal(peer.essays.messageMeIf,"Say hi");
  assert.equal(peer.publicAnswers[0].note,"Public explanation");
  assert.equal(JSON.stringify(peer).includes("secret@invalid.example"),false);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],"/profiles/peer-member");
  assert.equal(calls[0][1].headers.Authorization,"Bearer header.payload.signature");
});
test("invalid peer profile routes fail before private network requests",async()=>{
  const {service,calls}=mockGateway();
  await assert.rejects(service.getPublicProfile("../secret"),error=>error.code==="invalid");
  assert.equal(calls.length,0);
});


test("member question progress is loaded only with a verified JWT",async()=>{
  const {service,calls}=mockGateway({responseFor:async(url)=>{
    if(new URL(url).pathname==="/answers")return good({answers:[
      {questionId:"vault-5",optionId:"option-1",acceptableOptions:["option-1"],
        importance:10,isPrivate:false,note:""}
    ]});
    throw Error("Unexpected member path");
  }});
  const result=await service.loadMatchAnswers();
  assert.equal(result.answers.length,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],"/answers");
  assert.equal(calls[0][1].headers.Authorization,"Bearer header.payload.signature");
});
test("match answer saves require a positive server acknowledgment and never persist JWT in browser storage",async()=>{
  const answer={questionId:"vault-5",optionId:"option-1",acceptableOptions:["option-1"],
    importance:1,isPrivate:false,note:""};
  const {service,calls}=mockGateway({responseFor:async(url,options)=>{
    if(new URL(url).pathname==="/answers" && options.method==="PUT")return good({saved:true});
    throw Error("Unexpected request");
  }});
  const r=await service.saveMatchAnswer(answer);
  assert.equal(r.saved,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].method,"PUT");
  assert.equal(calls[0][1].headers.Authorization,"Bearer header.payload.signature");
  assert.deepEqual(JSON.parse(calls[0][1].body),answer);
  const {service:rejected}=mockGateway({responseFor:async()=>good({saved:false})});
  await assert.rejects(rejected.saveMatchAnswer(answer),e=>e.code==="unavailable");
});
