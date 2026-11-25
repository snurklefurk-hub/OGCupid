import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway} from "./member-gateway.mjs";
import {lookingForUpdate,validAgeRange,formatLookingFor,LOOKING_GENDERS,LOOKING_INTENTIONS,LOOKING_RADII} from "./member-looking-for.mjs";
import {sanitizeOwnProfileSettings,PROFILE_SETTINGS_FIELDS} from "./member-settings.mjs";
import {sanitizePublicProfile} from "./member-public-profile.mjs";

const ME="00000000-0000-4000-8000-000000000001";
const raw={...Object.fromEntries(PROFILE_SETTINGS_FIELDS.map(f=>[f.key,""])),
  userId:ME,slug:"first-member",displayName:"First Member",aboutMe:"Saved essay",age:104,
  interestedIn:"Everyone",relationshipGoal:"Long-term dating",
  preferredAgeMin:null,preferredAgeMax:null,searchRadiusMiles:25,hasValidatedLocality:true,
  work:"Writer",gender:"Woman"};
test("approved four group options, 18-99 age bounds and 50-mile label are exact",()=>{
  assert.deepEqual(LOOKING_GENDERS.map(x=>x.label),["Men","Women","Transmen","Transwomen","Intersex","Enbies","Something else"]);
  assert.deepEqual(LOOKING_INTENTIONS.map(x=>x.label),["long term dating","short term dating","friends","freaky stuff"]);
  assert.deepEqual(LOOKING_RADII.map(x=>x.value),[10,25,50,100,250,500,0]);
  assert.equal(LOOKING_RADII[0].label,"Near me");
  assert.equal(LOOKING_RADII.at(-1).label,"Anywhere");
  assert.equal(validAgeRange(18,99),true);
  assert.equal(validAgeRange(32,18),false);
  assert.equal(validAgeRange(17,30),false);
  assert.equal(validAgeRange(null,null),true);
  assert.equal(validAgeRange(null,35),false);
});
test("saving ages does not silently destroy existing legacy Everyone or uppercase intentions",()=>{
  const saved=sanitizeOwnProfileSettings({profile:raw},ME);
  const update=lookingForUpdate({...saved,...saved.lookingFor},{
    genders:[],intentions:[],gendersTouched:false,intentionsTouched:false,radiusTouched:false,
    preferredAgeMin:21,preferredAgeMax:39,searchRadiusMiles:25
  });
  assert.deepEqual(update,{aboutMe:"Saved essay",age:104,
    interestedIn:"Everyone",relationshipGoal:"Long-term dating",
    preferredAgeMin:21,preferredAgeMax:39,searchRadiusMiles:25});
  assert.equal(Object.hasOwn(update,"cityRegion"),false);
  assert.equal(Object.hasOwn(update,"work"),false);
});
test("explicit gender and intentions changes normalize storage and reject invalid bounds",()=>{
  const saved=sanitizeOwnProfileSettings({profile:raw},ME);
  const source={...saved,...saved.lookingFor};
  const draft={
    genders:["Woman","Man"],intentions:["new friends","long-term dating"],
    gendersTouched:true,intentionsTouched:true,radiusTouched:true,
    preferredAgeMin:18,preferredAgeMax:99,searchRadiusMiles:0
  };
  const update=lookingForUpdate(source,draft);
  assert.equal(update.interestedIn,"Man, Woman");
  assert.equal(update.relationshipGoal,"long-term dating, new friends");
  assert.equal(update.searchRadiusMiles,0);
  assert.throws(()=>lookingForUpdate(source,{...draft,preferredAgeMax:17}));
  assert.throws(()=>lookingForUpdate(source,{...draft,searchRadiusMiles:150}));
  assert.throws(()=>lookingForUpdate(source,{...draft,genders:["Moon"]}));
});
test("no validated saved location means no fake search distance save",()=>{
  const saved=sanitizeOwnProfileSettings({profile:{...raw,hasValidatedLocality:false,searchRadiusMiles:null}},ME);
  const update=lookingForUpdate({...saved,...saved.lookingFor},{
    genders:[],intentions:[],gendersTouched:false,intentionsTouched:false,
    radiusTouched:false,preferredAgeMin:23,preferredAgeMax:45,
    searchRadiusMiles:null});
  assert.equal(Object.hasOwn(update,"searchRadiusMiles"),false);
});
test("public About uses only member-visible age, distance and saved intentions",()=>{
  const r=sanitizePublicProfile({profile:{
    ...raw,displayName:"First Member",preferredAgeMin:21,preferredAgeMax:39,
    profileSearchRadiusMiles:10
  },publicAnswers:[],isOwner:false},"first-member");
  assert.deepEqual(formatLookingFor(r.lookingFor),["Everyone","Ages 21–39","Near me","For long term dating"]);
  const other={...r.lookingFor,profileSearchRadiusMiles:0};
  assert.deepEqual(formatLookingFor(other),["Everyone","Ages 21–39","Anywhere","For long term dating"]);
  assert.equal(JSON.stringify(r).includes("searchOriginLat"),false);
});
test("gateway owner-only PUT re-reads profile then saves all approved groups together",async()=>{
  let latest={...raw,age:35},sent=null;
  const service=createMemberGateway({
    authClient:{getSession:async()=>({data:{user:{id:ME},session:{token:"header.payload.signature"}}})},
    authBaseUrl:"https://auth.example.dev/auth",memberApiBaseUrl:"https://api.example.dev/",
    fetcher:async(url,opts)=>{
      assert.equal(new URL(url).pathname,"/profile");
      assert.equal(opts.headers.Authorization,"Bearer header.payload.signature");
      if(opts.method==="PUT"){
        sent=JSON.parse(opts.body);
        latest={...latest,...sent};
      }
      return {ok:true,status:200,json:async()=>({profile:latest})};
    }
  });
  const result=await service.saveOwnLookingFor({
    genders:["Woman"],intentions:["new friends"],gendersTouched:true,intentionsTouched:true,
    radiusTouched:true,preferredAgeMin:23,preferredAgeMax:48,searchRadiusMiles:500
  });
  assert.deepEqual(sent,{aboutMe:"Saved essay",age:35,
    interestedIn:"Woman",relationshipGoal:"new friends",
    preferredAgeMin:23,preferredAgeMax:48,searchRadiusMiles:500});
  assert.equal(result.lookingFor.preferredAgeMax,48);
});
test("API and schema bind age/radius to owner-only canonical stores",()=>{
 const api=readFileSync(new URL("../../api/member-profile.ts",import.meta.url),"utf8");
 const sql=readFileSync(new URL("../../db/migrations/024_member_looking_for_preferences.sql",import.meta.url),"utf8");
 const view=readFileSync(new URL("./ProfileSettings.jsx",import.meta.url),"utf8");
 const owner=readFileSync(new URL("./PublicMemberProfile.jsx",import.meta.url),"utf8");
 for(const token of ["preferred_age_min","preferred_age_max","visible_member_search_radius",
   "member_localities SET search_radius_miles","locality_id IS NOT NULL"]){
   assert.ok(api.includes(token)||sql.includes(token),token);
 }
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(view,/<LookingForSettings profile=\{saved\}/);
 assert.match(owner,/formatLookingFor\(profile.lookingFor\)/);
});
