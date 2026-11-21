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

test("MATCHES server page uses one JWT-scoped query and validates response metadata",async()=>{
  const criteria={search:"",sort:"match",genders:[],intentions:[],
    ageMin:18,ageMax:99,radius:0,advanced:{},whoLike:[],activity:"",kidPlans:""};
  const {service,calls}=mockGateway({responseFor:async url=>{
    const parsed=new URL(url);
    assert.equal(parsed.pathname,"/discovery-search");
    assert.equal(JSON.parse(parsed.searchParams.get("criteria")).sort,"match");
    assert.equal(parsed.searchParams.get("page"),"1");
    return good({profiles:[fakeDiscovery.profiles[0]],page:1,total:1,
      totalPages:1,pageSize:20,truncated:false});
  }});
  const result=await service.searchMembers(criteria,1);
  assert.equal(result.total,1);
  assert.equal(result.profiles[0].userId,THEM);
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[0][1].cache,"no-store");
  assert.equal(calls[0][1].credentials,"omit");
  await assert.rejects(service.searchMembers({...criteria,sort:"unsafe"},1),
    e=>e.code==="invalid");
});
test("MATCHES search rejects malformed page metadata and unauthorized JWT",async()=>{
  const criteria={ageMin:18,ageMax:99,radius:0};
  const {service}=mockGateway({responseFor:async()=>good({
    profiles:[],page:1,total:25,totalPages:1,pageSize:20
  })});
  await assert.rejects(service.searchMembers(criteria,1),e=>e.code==="unavailable");
  const {service:guest,calls}=mockGateway({authSession:{user:null,session:null}});
  await assert.rejects(guest.searchMembers(criteria,1),e=>e.code==="unauthorized");
  assert.equal(calls.length,0);
});
test("missing or insecure URLs cannot silently connect the preview to any database",()=>{
  assert.equal(configuredMemberEndpoints("",apiUrl),null);
  assert.equal(configuredMemberEndpoints("http://127.0.0.1:4000/auth",apiUrl),null);
  assert.equal(configuredMemberEndpoints(authUrl,"http://localhost:1234"),null);
  assert.equal(createMemberGateway({authClient:{},authBaseUrl:"",memberApiBaseUrl:apiUrl}),null);
  assert.deepEqual(configuredMemberEndpoints(authUrl,apiUrl),
    {authBaseUrl:authUrl, memberApiBaseUrl:"https://example.neonapi.dev"});
});

test("identity-only startup does not wait on profile or discovery",async()=>{
  const {service,calls}=mockGateway();
  const member=await service.loadIdentity();
  assert.deepEqual(member,{kind:"member",
    user:{id:YOU,name:"Test Person"},onboarding:sanitizeOnboarding(fakeOnboarding)});
  assert.deepEqual(calls.map(([path])=>path),["/onboarding"]);
  const profile=await service.loadSupplemental("profile");
  assert.equal(profile.displayName,"Demo");
  const directory=await service.loadSupplemental("discovery");
  assert.equal(directory[0].userId,THEM);
  assert.deepEqual(calls.map(([path])=>path),["/onboarding","/profile","/discovery"]);
  await assert.rejects(service.loadSupplemental("messages"),e=>e.code==="invalid");
});
test("separate supplemental failures do not prevent identity-only authorization",async()=>{
  const {service}=mockGateway({responseFor:async(url)=>{
    const path=new URL(url).pathname;
    return path==="/onboarding"?good(fakeOnboarding):
      path==="/profile"?bad(503):good(fakeDiscovery);
  }});
  assert.equal((await service.loadIdentity()).kind,"member");
  await assert.rejects(service.loadSupplemental("profile"),e=>e.code==="unavailable");
  assert.equal((await service.loadSupplemental("discovery"))[0].userId,THEM);
});
test("identity-only startup respects incomplete onboarding without reading member data",async()=>{
  const incomplete={...fakeOnboarding,explored:false};
  const {service,calls}=mockGateway({onboarding:incomplete});
  assert.equal((await service.loadIdentity()).kind,"onboarding");
  assert.deepEqual(calls.map(([path])=>path),["/onboarding"]);
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
  assert.equal(result.discovery.length,1);
  assert.equal(result.discovery[0].userId,THEM);
  assert.equal(result.discovery[0].slug,"test-member");
  assert.equal(result.discovery[0].matchPercent,58);
  assert.equal(result.discovery[0].createdAt,null);
  assert.equal(result.discovery[0].lastSeenAt,null);
  assert.equal(result.discovery[0].distanceMiles,null);
  assert.equal(result.discovery[0].commonQuestions,1);
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

test("quiet revalidation requests only liveness/onboarding, never profile or discovery",async()=>{
  const {service,calls}=mockGateway();
  const result=await service.revalidate();
  assert.equal(result.kind,"member");
  assert.equal(result.user.id,YOU);
  assert.deepEqual(calls.map(([path])=>path),["/onboarding"]);
  assert.equal(result.profile,undefined);
  assert.equal(result.discovery,undefined);
});

test("quiet revalidation denies expired sessions and JWT rejection",async()=>{
  const guest=mockGateway({authSession:{user:null,session:null}});
  await assert.rejects(guest.service.revalidate(),error=>error.code==="unauthorized");
  assert.equal(guest.calls.length,0);
  const revoked=mockGateway({responseFor:async url=>
    new URL(url).pathname==="/onboarding" ? bad(401) : good({})});
  await assert.rejects(revoked.service.revalidate(),error=>error.code==="unauthorized");
  assert.deepEqual(revoked.calls.map(([path])=>path),["/onboarding"]);
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

test("public Search data is sanitized; private fields cannot leak",()=>{
  const [member]=sanitizeDiscovery({profiles:[{
    userId:THEM,slug:"ok",displayName:"Ok",matchPercent:74,
    gender:"Woman",bodyType:"Athletic",relationshipGoal:"new friends",
    aboutMe:"Real summary",distanceMiles:18,
    createdAt:"2026-11-21T08:00:00Z",lastSeenAt:"2026-11-21T09:00:00Z",
    email:"nope@example.invalid",searchOriginLat:33.0,rawAnswers:["private"]
  }]},YOU);
  assert.equal(member.gender,"Woman");
  assert.equal(member.distanceMiles,18);
  assert.equal(member.lastSeenAt,"2026-11-21T09:00:00.000Z");
  assert.equal(member.aboutMe,"Real summary");
  assert.equal(JSON.stringify(member).includes("nope@example.invalid"),false);
  assert.equal(Object.hasOwn(member,"searchOriginLat"),false);
  assert.equal(Object.hasOwn(member,"rawAnswers"),false);
  const [bad]=sanitizeDiscovery({profiles:[{
    userId:THEM,slug:"ok",displayName:"Ok",matchPercent:null,
    distanceMiles:5.5,lastSeenAt:"not-a-date"
  }]},YOU);
  assert.equal(bad.distanceMiles,null);
  assert.equal(bad.lastSeenAt,null);
});

test("presence heartbeat uses authenticated PUT without user-controlled identity",async()=>{
  const {service,calls}=mockGateway({responseFor:async(url,opts)=>{
    assert.equal(new URL(url).pathname,"/presence");
    assert.equal(opts.method,"PUT");
    assert.equal(opts.headers.Authorization,"Bearer header.payload.signature");
    assert.equal(opts.body,undefined);
    return good({lastSeenAt:"2026-11-21T11:00:00Z"});
  }});
  assert.equal(await service.recordPresence(),"2026-11-21T11:00:00Z");
  assert.equal(calls.length,1);
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


test("member avatars use one authenticated JPEG request and never a public image URL",async()=>{
  const PHOTO="00000000-0000-4000-8000-000000000009";
  const image=new Blob(["jpeg-test"],{type:"image/jpeg"});
  const {service,calls}=mockGateway({responseFor:async(url)=>{
    const path=new URL(url).pathname;
    if(path==="/photos/member/"+THEM+"/avatar")return {
      ok:true,status:200,headers:{get:()=>PHOTO},blob:async()=>image
    };
    throw Error("Unexpected image request "+path);
  }});
  const blob=await service.getMemberAvatar(THEM);
  assert.equal(blob,image);
  assert.deepEqual(calls.map(([path])=>path),["/photos/member/"+THEM+"/avatar"]);
  assert.equal(calls[0][1].headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[0][1].credentials,"omit");
  assert.equal(calls[0][1].cache,"no-store");
});
test("discovery-known photo IDs skip album lookup and fetch bytes in one request",async()=>{
  const PHOTO="00000000-0000-4000-8000-000000000009";
  const image=new Blob(["jpeg-test"],{type:"image/jpeg"});
  const {service,calls}=mockGateway({responseFor:async url=>{
    if(new URL(url).pathname==="/photos/"+PHOTO+"/bytes")
      return {ok:true,status:200,blob:async()=>image};
    throw Error("Unexpected photo route");
  }});
  assert.equal(await service.getMemberAvatar(THEM,PHOTO),image);
  assert.deepEqual(calls.map(([path])=>path),["/photos/"+PHOTO+"/bytes"]);
});
test("avatars reject invalid identities, explicit no-photo and HTML media",async()=>{
  const {service,calls}=mockGateway();
  assert.equal(await service.getMemberAvatar("javascript:evil"),null);
  assert.equal(await service.getMemberAvatar(THEM,null),null);
  assert.equal(await service.getMemberAvatar(THEM,"invalid-photo-id"),null);
  assert.equal(calls.length,0);
  const {service:badPhoto}=mockGateway({responseFor:async url=>{
    if(new URL(url).pathname==="/photos/member/"+THEM+"/avatar")
      return {ok:true,status:200,headers:{get:()=>null},
        blob:async()=>new Blob(["not a jpeg"],{type:"text/html"})};
    throw Error("Unexpected route");
  }});
  assert.equal(await badPhoto.getMemberAvatar(THEM),null);
});
test("discovery passes through only valid photo IDs, including an explicit absent-photo marker",()=>{
  const PHOTO="00000000-0000-4000-8000-000000000009";
  const current=sanitizeDiscovery({profiles:[
    {...fakeDiscovery.profiles[0],avatarPhotoId:PHOTO},
    {...fakeDiscovery.profiles[0],userId:THIRD,slug:"other-person",avatarPhotoId:null}
  ]},YOU);
  assert.equal(current[0].avatarPhotoId,PHOTO);
  assert.equal(current[1].avatarPhotoId,null);
  assert.equal(Object.hasOwn(sanitizeDiscovery({profiles:[
    {...fakeDiscovery.profiles[0],avatarPhotoId:"unexpected"}
  ]},YOU)[0],"avatarPhotoId"),false);
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
