import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  PROFILE_SETTINGS_FIELDS,ETHNICITY_CHOICES,sanitizeOwnProfileSettings,composeSettingUpdate
} from "./member-settings.mjs";
import {createMemberGateway} from "./member-gateway.mjs";

const ME="00000000-0000-4000-8000-000000000001";
const OTHER="00000000-0000-4000-8000-000000000002";
function profile(){
  return {userId:ME,slug:"member-profile",displayName:"Original Signup Name",
    age:29,aboutMe:"Keep my essay",
    ...Object.fromEntries(PROFILE_SETTINGS_FIELDS.map(f=>[f.key,""])),
    gender:"Woman",orientation:"Bi",interestedIn:"Woman, Man",
    relationshipGoal:"long-term dating",work:"Scientist",
    bodyType:"Average",drugs:"Never",ethnicity:"Black, White",
    email:"private@invalid.example",birthDate:"1997-04-02"};
}
function mock(){
  let saved=profile();
  const calls=[];
  const service=createMemberGateway({
    authClient:{getSession:async()=>({data:{user:{id:ME},
      session:{token:"header.payload.signature"}},error:null})},
    authBaseUrl:"https://auth.example.dev/auth",
    memberApiBaseUrl:"https://neon.example.dev/profile",
    fetcher:async(url,options)=>{
      const path=new URL(url).pathname;
      calls.push({path,options});
      if(path!=="/profile")throw Error("Unexpected path");
      if(options.method==="PUT"){
        const body=JSON.parse(options.body);
        for(const key of Object.keys(body)){
          if(key==="age"||key==="aboutMe"||PROFILE_SETTINGS_FIELDS.some(f=>f.key===key)){
            saved={...saved,[key]:body[key]};
          }else throw Error("Unexpected field "+key);
        }
      }
      return {ok:true,status:200,json:async()=>({profile:saved})};
    }
  });
  return {service,calls,read:()=>saved};
}
test("only server-stored profile details and preferences are editable",()=>{
  const names=new Set(PROFILE_SETTINGS_FIELDS.map(x=>x.key));
  assert.equal(names.size,PROFILE_SETTINGS_FIELDS.length);
  for(const forbidden of ["displayName","userId","slug","age","dateOfBirth","birthDate","sign",
    "aboutMe","searchRadiusMiles","locality","searchAgeMin","searchAgeMax","pronouns"]){
    assert.equal(names.has(forbidden),false,forbidden);
  }
});
test("saved settings whitelist drops PII and enforces authenticated ownership",()=>{
  const result=sanitizeOwnProfileSettings({profile:profile()},ME);
  assert.equal(result.displayName,"Original Signup Name");
  assert.equal(result.age,29);
  assert.equal(result.fields.work,"Scientist");
  assert.equal(result.fields.ethnicity,"Black, White");
  assert.equal(JSON.stringify(result).includes("private@invalid.example"),false);
  assert.equal(JSON.stringify(result).includes("birthDate"),false);
  assert.throws(()=>sanitizeOwnProfileSettings({profile:{...profile(),userId:OTHER}},ME));
  assert.throws(()=>sanitizeOwnProfileSettings({profile:{...profile(),work:7}},ME));
});
test("one field PUT never renames account or overwrites unrelated fields",()=>{
  const prior=sanitizeOwnProfileSettings({profile:profile()},ME);
  const request=composeSettingUpdate(prior,"work","Another job");
  assert.deepEqual(request,{aboutMe:"Keep my essay",age:29,work:"Another job"});
  assert.equal(Object.hasOwn(request,"displayName"),false);
  assert.equal(Object.hasOwn(request,"orientation"),false);
  assert.equal(Object.hasOwn(request,"interestedIn"),false);
});
test("controlled fields and multi-choices validate with old values preserved",()=>{
  const prior=sanitizeOwnProfileSettings({profile:profile()},ME);
  assert.throws(()=>composeSettingUpdate(prior,"bodyType","Superman"));
  assert.throws(()=>composeSettingUpdate(prior,"aboutMe","new essay"));
  assert.throws(()=>composeSettingUpdate(prior,"pronouns","they/them"));
  assert.throws(()=>composeSettingUpdate(prior,"work","a".repeat(161)));
  assert.equal(composeSettingUpdate(prior,"drugs","Just weed · Sometimes").drugs,
    "Just weed · Sometimes");
});
test("race/ethnicity restores the original multi-select choices without changing storage keys",()=>{
  assert.deepEqual(ETHNICITY_CHOICES,[
    "Asian","Black","Hispanic / Latin","Indigenous",
    "Middle Eastern","Pacific Islander","White","Other"
  ]);
  const field=PROFILE_SETTINGS_FIELDS.find(item=>item.key==="ethnicity");
  assert.equal(field.label,"Race / ethnicity");
  assert.deepEqual(field.multi,ETHNICITY_CHOICES);
  const current=sanitizeOwnProfileSettings({profile:profile()},ME);
  assert.deepEqual(composeSettingUpdate(current,"ethnicity","Black, White"),{
    aboutMe:"Keep my essay",age:29,ethnicity:"Black, White"
  });
  assert.deepEqual(composeSettingUpdate(current,"ethnicity","Asian, Indigenous"),{
    aboutMe:"Keep my essay",age:29,ethnicity:"Asian, Indigenous"
  });
  assert.throws(()=>composeSettingUpdate(current,"ethnicity","Invented category"));
});
test("gateway saves a race edit without changing other saved profile fields",async()=>{
  const {service,read,calls}=mock();
  const updated=await service.saveOwnSetting("ethnicity","Asian, Indigenous");
  assert.equal(updated.fields.ethnicity,"Asian, Indigenous");
  assert.equal(updated.fields.work,"Scientist");
  assert.equal(read().ethnicity,"Asian, Indigenous");
  assert.equal(read().orientation,"Bi");
  assert.deepEqual(calls.map(x=>x.options.method),["GET","PUT"]);
  assert.deepEqual(JSON.parse(calls[1].options.body),{
    aboutMe:"Keep my essay",age:29,ethnicity:"Asian, Indigenous"
  });
});
test("gateway reads latest server row and confirms one-field save with JWT",async()=>{
  const {service,calls,read}=mock();
  const initial=await service.loadOwnSettings();
  assert.equal(initial.fields.work,"Scientist");
  const updated=await service.saveOwnSetting("work","Driver");
  assert.equal(updated.fields.work,"Driver");
  assert.equal(updated.fields.orientation,"Bi");
  assert.equal(updated.lookingFor.interestedIn,"Woman, Man");
  assert.equal(read().displayName,"Original Signup Name");
  assert.equal(read().aboutMe,"Keep my essay");
  assert.deepEqual(calls.map(x=>x.options.method),["GET","GET","PUT"]);
  assert.equal(calls[2].options.headers.Authorization,"Bearer header.payload.signature");
  assert.equal(calls[2].options.credentials,"omit");
  assert.equal(calls[2].options.cache,"no-store");
  assert.deepEqual(JSON.parse(calls[2].options.body),{
    aboutMe:"Keep my essay",age:29,work:"Driver"});
});
test("profile settings stay inside verified member route and link from owner views",()=>{
  const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
  const owner=readFileSync(new URL("./PublicMemberProfile.jsx",import.meta.url),"utf8");
  const provider=readFileSync(new URL("./MemberSessionProvider.jsx",import.meta.url),"utf8");
  const view=readFileSync(new URL("./ProfileSettings.jsx",import.meta.url),"utf8");
  assert.match(app,/<MemberGate><ProfileSettings \/><\/MemberGate>/);
  assert.match(app,/to="\/settings">Settings/);
  assert.match(owner,/profile\.isOwner/);
  assert.match(owner,/EditPencil to="\/settings#looking-for"/);
  assert.match(provider,/loadOwnSettings, saveOwnSetting/);
  assert.doesNotMatch(view,/localStorage|sessionStorage|type="date"|zodiac|Date of birth/i);
  assert.match(view,/signup name and age cannot be edited/i);
});
