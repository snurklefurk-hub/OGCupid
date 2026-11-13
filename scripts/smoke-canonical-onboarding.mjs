// Ephemeral end-to-end exercise. No real email, password, JWT, photo,
 // or other personal data is printed. Restrict to isolated Neon dev only.
import { randomBytes } from "node:crypto";
import sharp from "sharp";

const authRoot = "https://ep-wild-term-bbvgmd5y.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
const apiRoot = "https://br-tiny-wave-bbnpjp0m-members.compute.c-15.us-east-1.aws.neon.tech";
const origin = "https://ogcupid.onrender.com";
if (!authRoot.includes("ep-wild-term") || !apiRoot.includes("br-tiny-wave"))
  throw Error("Refusing to run against a non-staging target.");
const userEmail = "qa-canonical-" + Date.now() + "-" + randomBytes(3).toString("hex") + "@example.invalid";
const password = "Q!7n" + randomBytes(18).toString("hex");
const cookies = new Map();
let token = null, created = false, deleted = false;

function storeCookies(response) {
  const setCookies=response.headers.getSetCookie?.() || [];
  for(const item of setCookies){
    const pair=item.split(";")[0];const cut=pair.indexOf("=");
    if(cut>0)cookies.set(pair.slice(0,cut),pair.slice(cut+1));
  }
}
function cookieHeader(){return [...cookies].map(([key,value])=>key+"="+value).join("; ");}
async function authCall(path,method="GET",body){
  const response=await fetch(authRoot+path,{
    method,headers:{"Origin":origin, "Accept":"application/json",
      ...(body?{"Content-Type":"application/json"}:{}),
      ...(cookieHeader()?{"Cookie":cookieHeader()}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),redirect:"manual"
  });
  storeCookies(response);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error("Auth "+path+" failed HTTP "+response.status+" ("+String(data.code||data.error?.code||"unknown")+")");
  return data;
}
async function apiCall(path,method="GET",body,photo=false){
  const response=await fetch(apiRoot+path,{
    method,headers:{Authorization:"Bearer "+token,
      ...(body?{"Content-Type":photo?"image/jpeg":"application/json"}:{})},
    ...(body?{body:photo?body:JSON.stringify(body)}:{}),
    redirect:"manual",cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error("API "+method+" "+path+" failed HTTP "+response.status+" ("+String(data.error||"unknown").slice(0,150)+")");
  return data;
}
async function run(){
  console.log("Start: ephemeral signup on isolated Neon auth branch");
  await authCall("/sign-up/email","POST",{name:"Canonical QA",email:userEmail,password});
  created=true;
  const session=await authCall("/get-session");
  if(!session?.user?.id)throw Error("Signup did not establish an authenticated session");
  const tokenInfo=await authCall("/token");
  token=tokenInfo?.token||tokenInfo?.data?.token;
  if(typeof token!=="string"||token.split(".").length!==3)throw Error("Neon Auth did not provide JWT");
  console.log("PASS account created and signed in without verification");

  let state=await apiCall("/onboarding");
  if(state.identity!==false || state.verified!==false)throw Error("New user state is unexpectedly precompleted");
  await apiCall("/onboarding","PUT",{step:"identity",gender:"Man",orientation:"Bi"});
  state=await apiCall("/onboarding");
  if(!state.identity || state.locality)throw Error("Identity save did not unlock date/location");
  console.log("PASS identity save and server progression");

  await apiCall("/onboarding","PUT",{
    step:"locality",birthDate:"1990-01-02",countryCode:"US",zipCode:"30301",
    locality:{id:4180439,key:"at"}
  });
  state=await apiCall("/onboarding");
  if(!state.locality || state.profile)throw Error("Location stage not persisted");
  console.log("PASS age and canonical US locality");

  await apiCall("/profile","PUT",{
    age:36,aboutMe:"",gender:"Man",orientation:"Bi",interestedIn:"Woman",
    relationshipGoal:"long-term dating",cityRegion:"Atlanta, Georgia, United States",
    searchOrigin:{id:4180439,key:"at"},locality:{id:4180439,key:"at"},
    searchRadiusMiles:10,diet:"Other",relationshipType:"Monogamous",
    drugs:"Just weed · Sometimes",languages:"English (Fluently)"
  });
  await apiCall("/onboarding","PUT",{step:"details",matchAgeMin:24,matchAgeMax:48});
  state=await apiCall("/onboarding");
  if(state.profile)throw Error("Details alone incorrectly finish written profile");

  await apiCall("/profile","PUT",{aboutMe:"A short real-world introduction of a synthetic test member; more essays can come later.",age:36});
  state=await apiCall("/onboarding");
  if(!state.profile || state.photo)throw Error("Summary and stage completion did not persist");
  console.log("PASS questionnaire and one-essay completion");

  const jpeg=await sharp({create:{width:640,height:640,channels:3,background:"#4d86b3"}})
    .jpeg({quality:83,progressive:false}).toBuffer();
  await apiCall("/photos","POST",jpeg,true);
  await apiCall("/onboarding","PUT",{step:"self-photo",confirmed:true});
  state=await apiCall("/onboarding");
  if(!state.photo || state.quiz)throw Error("Primary-photo confirmation or quiz lock incorrect");
  console.log("PASS photo upload and primary-photo confirmation");

  if(process.argv.includes("--questions")) {
    const {readFileSync}=await import("node:fs");
    const contents=readFileSync(new URL("../public/questions/question-bank.js",import.meta.url),"utf8");
    const bank=JSON.parse(contents.slice(contents.indexOf("{"),contents.lastIndexOf(";")).trim());
    const first10=bank.questions.filter(q=>q.tier===10).slice(0,10);
    const next50=bank.questions.filter(q=>q.tier===50).slice(0,15);
    const selected=[...first10,...next50];
    if(first10.length!==10 || selected.length!==25)throw Error("Missing required question tiers");
    for(let i=0;i<selected.length;i++){
      const q=selected[i];
      await apiCall("/answers","PUT",{questionId:q.id,optionId:q.optionIds[0],
        acceptableOptions:[q.optionIds[0]],importance:1,isPrivate:false,note:""});
      if(i===23 && (await apiCall("/onboarding")).quiz)
        throw Error("Premature 24-answer unlock");
    }
    if((await apiCall("/answers")).answers.length!==25)throw Error("25 answers did not persist");
    console.log("PASS 25 distinct match questions and 24-answer lock");
  } else {
    await apiCall("/onboarding","PUT",{step:"persona",answers:Array(28).fill(2)});
  }
  state=await apiCall("/onboarding");
  if(!state.quiz || state.verified)throw Error("Persona completion or unverified status incorrect");
  console.log("PASS saved 28-question Persona completion; email remains unverified");

  await apiCall("/onboarding","PUT",{step:"explore"});
  state=await apiCall("/onboarding");
  if(!state.explored || state.verified)throw Error("Explore progression incorrect");
  console.log("PASS Explore unlocked with profile still unverified");

  const done=await apiCall("/account/delete","POST",{email:userEmail,password,confirm:"DELETE"});
  if(done.deleted!==true)throw Error("Account deletion not acknowledged");
  deleted=true;
  const response=await fetch(apiRoot+"/onboarding",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(response.status!==401)throw Error("Deleted session still reached private onboarding HTTP "+response.status);
  console.log("PASS complete account deletion and revoked private access");
}
try { await run(); }
catch(error){
  console.error("STAGING SMOKE FAILED: "+(error instanceof Error?error.message:"unknown"));
  process.exitCode=1;
}finally{
  if(created&&!deleted&&token){
    try {
      const response=await fetch(apiRoot+"/account/delete",{
        method:"POST",
        headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
        body:JSON.stringify({email:userEmail,password,confirm:"DELETE"})
      });
      console.log(response.ok?"Cleanup: synthetic account deletion accepted":"Cleanup: deletion failed, staging test user needs manual cleanup");
    } catch { console.log("Cleanup: unreachable; staging test user may remain"); }
  }
  password.replace(/./g,""); // No password or tokens are ever logged or saved.
}
