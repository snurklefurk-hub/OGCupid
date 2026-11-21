import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway,sanitizeConnections} from "./member-gateway.mjs";
const ME="00000000-0000-4000-8000-000000000001";
const THEM="00000000-0000-4000-8000-000000000002";
const sample={favorites:[THEM],favoriteMembers:[{userId:THEM,slug:"them",displayName:"Them",age:33,cityRegion:"Savannah, GA"}],
  quiver:[{userId:THEM,slug:"them",displayName:"Them",age:33,cityRegion:"Savannah, GA"}],
  favoritedByCount:3,blockedByCount:2,blocks:[{userId:THEM,displayName:"Them",permanent:false}]};
const source=name=>readFileSync(new URL(name,import.meta.url),"utf8");
test("connection payload keeps anonymous incoming counts and distinct private lists",()=>{
  const saved=sanitizeConnections(sample);
  assert.equal(saved.favorites.has(THEM),true);
  assert.equal(saved.quiver[0].userId,THEM);
  assert.equal(saved.favoriteMembers[0].slug,"them");
  assert.equal(saved.favoritedByCount,3);
  assert.equal(saved.blockedByCount,2);
  assert.equal(saved.blocks[0].permanent,false);
  assert.deepEqual([...saved.favorites],[THEM]);
  assert.throws(()=>sanitizeConnections({...sample,blockedByCount:"7"}));
  assert.throws(()=>sanitizeConnections({...sample,quiver:[{...sample.quiver[0],slug:"../test"}]}));
});
test("signed-in connection CRUD never sends a user-supplied actor identity",async()=>{
  const calls=[];
  const api=createMemberGateway({
    authClient:{getSession:async()=>({data:{user:{id:ME},session:{token:"header.payload.signature"}}})},
    authBaseUrl:"https://sample.neonauth.test/auth",
    memberApiBaseUrl:"https://sample.neon.test/profile",
    fetcher:async(url,opts)=>{
      calls.push({path:new URL(url).pathname,...opts});
      const path=new URL(url).pathname;
      const data=path==="/connections"?sample:
        path.startsWith("/favorites/")?{favorite:opts.method==="PUT"}:
        path.startsWith("/blocks/")?{blocked:opts.method==="PUT",permanent:false}:
        {reported:true};
      return{ok:true,status:200,json:async()=>data};
    }
  });
  assert.equal((await api.loadConnections()).favoritedByCount,3);
  assert.equal(await api.setFavorite(THEM,true),true);
  assert.equal(await api.setFavorite(THEM,false),false);
  assert.equal((await api.setSiteBlock(THEM,true)).blocked,true);
  assert.equal(await api.reportProfile(THEM,"spam"),true);
  assert.deepEqual(calls.map(x=>x.method),["GET","PUT","DELETE","PUT","POST"]);
  assert.ok(calls.every(x=>x.headers.Authorization==="Bearer header.payload.signature"));
  assert.ok(calls.every(x=>x.credentials==="omit"&&x.cache==="no-store"));
  assert.ok(!calls.some(x=>JSON.stringify(x.body||"").includes(ME)));
  await assert.rejects(api.setFavorite(ME,true),e=>e.code==="invalid");
});
test("Matches Search renders before connections finish and Favorite actions require loaded state",()=>{
  const matches=source("./MatchesView.jsx");
  assert.match(matches,/const \[connectionsLoading,setConnectionsLoading\]=useState\(true\)/);
  assert.match(matches,/const \[connectionsError,setConnectionsError\]=useState\(""/);
  assert.match(matches,/tab==="search"\?!discoveryLoading&&!discoveryUnavailable:!connectionsLoading&&!connectionsError&&!!connections/);
  assert.match(matches,/disabled=\{busy\|\|!canFavorite\}/);
  assert.match(matches,/canFavorite=\{!!connections\}/);
  assert.match(matches,/tab!=="search"&&connectionsError/);
  assert.doesNotMatch(matches,/\{!loading&&!error&&/);
  assert.doesNotMatch(matches,/pageMembers\(results,page,24\)/);
});
test("Matches uses Search, Quiver and Favorites without special mutual overlays",()=>{
  const app=source("./App.jsx"),matches=source("./MatchesView.jsx");
  const quick=source("./QuickmatchView.jsx"),settings=source("./ProfileSettings.jsx");
  const profile=source("./PublicMemberProfile.jsx"),messages=source("./MessagesView.jsx");
  assert.match(app,/MatchesView Photo=\{MemberPhoto\}/);
  assert.match(matches,/\["search","Search"\]/);
  assert.match(matches,/\["quiver","Quiver"\]/);
  assert.match(matches,/\["favorites","Favorites"\]/);
  assert.match(matches,/You have been favorited by/);
  assert.match(settings,/You have been blocked by/);
  assert.match(settings,/await setSiteBlock\(userId,false\)/);
  assert.match(profile,/Save to Favorites/);
  assert.match(profile,/Block this member across OG Cupid/);
  assert.match(profile,/ogcl-profile-action-message/);
  assert.match(messages,/<blocked user>/);
  assert.doesNotMatch(quick,/ogcl-mutual-heart/);
  assert.doesNotMatch(matches,/mutual.*first/i);
});
