import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createMemberGateway,MemberAccessError} from "./member-gateway.mjs";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const app=read("./App.jsx"),provider=read("./MemberSessionProvider.jsx");
const onboarding=read("./Onboarding.jsx"),forms=read("./AccountPages.jsx");
const photos=read("./PhotoManager.jsx"),gallery=read("./ProfileGallery.jsx");
const uid="00000000-0000-4000-8000-000000000001";
function fakeGateway(){
  const calls=[];
  const authClient={
    getSession:async()=>({data:{user:{id:uid,email:"member@example.invalid",name:"T & E"},session:{token:"aaa.bbb.ccc"}}}),
    signUp:{email:async input=>{calls.push(["signup",input]);return {data:{}};}},
    sendVerificationEmail:async input=>{calls.push(["verify",input]);return {data:{}};},
    forgetPassword:{emailOtp:async input=>{calls.push(["recover",input]);return {data:{}};}},
    emailOtp:{resetPassword:async input=>{calls.push(["reset",input]);return {data:{}};}},
    signOut:async()=>{calls.push(["signout"]);return {data:{}};}
  };
  const fetcher=async(url,options)=>{
    calls.push([new URL(url).pathname,options]);
    const route=new URL(url).pathname;
    if(route==="/account/delete")return new Response(JSON.stringify({deleted:true}),{status:200});
    if(route==="/photos")return new Response(JSON.stringify({photo:{id:uid}}),{status:201});
    return new Response(JSON.stringify({saved:true}),{status:200});
  };
  const gateway=createMemberGateway({authClient,
    authBaseUrl:"https://auth.example.invalid/neondb/auth",
    memberApiBaseUrl:"https://api.example.invalid/profile",fetcher
  });
  return {gateway,calls};
}
test("native account routes do not send ordinary members back to old /account",()=>{
  for(const view of ["join","recover","verify","onboarding","account","photos"]){
    assert.ok(app.includes('<Route path="'+view+'"'),view);
  }
  assert.doesNotMatch(app,/legacyHref\("\/account/);
  assert.match(app,/<MemberGate allowOnboarding><MatchQuestions/);
  assert.match(gallery,/to="\/photos"/);
  assert.match(provider,/accountRequest, signUp, requestRecovery, resetPassword, requestEmailVerification, deleteMyAccount/);
});
test("account verification and recovery use existing Neon client, without exposing passwords",async()=>{
  const {gateway,calls}=fakeGateway();
  await gateway.signUp("Test User","new@example.invalid","correct-horse-battery","https://ogcupid.onrender.com/#/onboarding");
  await gateway.requestEmailVerification("new@example.invalid","https://ogcupid.onrender.com/#/onboarding");
  await gateway.requestRecovery("new@example.invalid");
  await gateway.resetPassword("new@example.invalid","123456","correct-horse-battery");
  assert.deepEqual(calls.map(x=>x[0]),["signup","verify","recover","reset"]);
  assert.match(calls[0][1].callbackURL,/#\/onboarding/);
  assert.equal(calls[0][1].name,"Test User");
});
test("restricted member API never trusts a client-supplied user ID or arbitrary path",async()=>{
  const {gateway,calls}=fakeGateway();
  const data=await gateway.accountRequest("/onboarding","PUT",{step:"identity",gender:"Man",orientation:"Straight"});
  assert.equal(data.saved,true);
  assert.equal(calls[0][0],"/onboarding");
  assert.equal(calls[0][1].headers.Authorization,"Bearer aaa.bbb.ccc");
  assert.equal(calls[0][1].credentials,"omit");
  await assert.rejects(gateway.accountRequest("/admin/members","PUT",{}),MemberAccessError);
  await assert.rejects(gateway.accountRequest("/profiles/"+uid,"PUT",{userId:uid}),MemberAccessError);
  await assert.rejects(gateway.accountRequest("/photos/../../secrets","DELETE"),MemberAccessError);
});
test("account deletion sends exact confirmation and server verifies current account",async()=>{
  const {gateway,calls}=fakeGateway();
  await assert.rejects(gateway.deleteMyAccount("correct-horse-battery","YES"),MemberAccessError);
  assert.equal(await gateway.deleteMyAccount("correct-horse-battery","DELETE"),true);
  assert.equal(calls[0][0],"/account/delete");
  assert.deepEqual(JSON.parse(calls[0][1].body),{
    email:"member@example.invalid",password:"correct-horse-battery",confirm:"DELETE"
  });
  assert.deepEqual(calls[1],["signout"]);
});
test("onboarding keeps server-owned completion and verified locality/photo requirements",()=>{
  for(const step of ['step:"identity"','step:"locality"','step:"details"','step:"self-photo"','step:"explore"']){
    assert.ok((onboarding+photos).includes(step),step);
  }
  assert.match(onboarding,/\/locations\//);
  assert.match(onboarding,/api\.zippopotam\.us/);
  assert.match(onboarding,/accountRequest\("\/onboarding"\)/);
  assert.match(onboarding,/age:adultAge\(state\.birth_date\)/);
  assert.match(onboarding,/getUTCFullYear\(\)-18/);
  assert.match(photos,/preparePhoto/);
  assert.match(photos,/image\/jpeg/);
  assert.match(photos,/URL\.revokeObjectURL/);
});
test("native forms clear password input and require explicit destructive confirmation",()=>{
  assert.match(forms,/f\.elements\.password\.value=""/);
  assert.match(forms,/f\.elements\.confirm\.value=""/);
  assert.match(forms,/window\.confirm/);
  assert.match(forms,/permanently removes your member profile/i);
  assert.doesNotMatch(forms+provider,/localStorage|sessionStorage|indexedDB/);
});
