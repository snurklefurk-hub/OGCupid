import {readFileSync} from "node:fs";
// Unauthenticated production cutover verification; no tokens or user data.
const origin=(process.env.OGC_PRODUCTION_ORIGIN||"https://ogcupid.onrender.com").replace(/\/$/,"");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const expectedHtml=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const expectedJs=/src="\/(assets\/index-[^"]+\.js)"/.exec(expectedHtml)?.[1];
const expectedCss=/href="\/(assets\/index-[^"]+\.css)"/.exec(expectedHtml)?.[1];
if(!expectedJs||!expectedCss)throw Error("Release commit has no compiled React assets.");
async function read(path,accept="text/html"){
  const response=await fetch(origin+path,{
    headers:{Accept:accept, "Cache-Control":"no-cache"},
    signal:AbortSignal.timeout(15000)
  });
  if(response.status!==200)throw new Error(path+" returned "+response.status);
  return await response.text();
}
let html=null,lastError;
for(let attempt=1;attempt<=24;attempt++){
  try{
    const next=await read("/");
    if(!next.includes('id="root"') || !next.includes("/"+expectedJs)|| !next.includes("/"+expectedCss)||
       next.includes("ogc-session-pending"))throw new Error("Old frontend still served");
    html=next;break;
  }catch(e){
    lastError=e;
    if(attempt<24)await pause(10000);
  }
}
if(!html)throw new Error("React root never became live: "+String(lastError));
const assets=[...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+)"/g)].map(match=>match[1]);
if(assets.length<2)throw new Error("Missing compiled React assets in root HTML");
for(const path of assets){
  const response=await fetch(origin+"/"+path,{signal:AbortSignal.timeout(15000)});
  if(response.status!==200)throw new Error(path+" returned "+response.status);
  if(path===expectedJs){
    const js=await response.text();
    for(const marker of ["Create your OG Cupid account","Recover your account","Welcome to OG Cupid","Permanently delete my account"]){
      if(!js.includes(marker))throw Error("Native React member workflow missing from release bundle: "+marker);
    }
  }
}
for(const path of ["/account/","/account/persona.html","/quiz/",
  "/questions/","/profiles/","/ogtrends/","/privacy/","/terms/","/contact/"]){
  const content=await read(path);
  if(!content.includes("OG Cupid")&&!content.includes("OGCupid"))
    throw new Error(path+" returned unexpected content");
}
const bridge=await read("/account/");
if(!bridge.includes('location.replace("/#"+destination)'))
  throw Error("Legacy account links still render a second member UI");
const profile=await read("/profiles/river-riley");
if(!profile.includes('location.replace("/#/profiles/"'))
  throw Error("Legacy profile deep links are not entering React");
const index=await read("/locations/sa.json","application/json");
if(!index.startsWith("["))throw Error("Verified city directory is missing");
for(const path of ["/brand/ogcupid-logo-white.png","/favicon.png"]){
  const r=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});
  if(r.status!==200)throw new Error("Missing "+path+": "+r.status);
}
const admin=await fetch("https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/admin",{
  headers:{Origin:origin},signal:AbortSignal.timeout(15000)
});
if(admin.status!==401)throw new Error("Unauthenticated admin endpoint returned "+admin.status);
console.log("React production root, compiled assets, legacy bridge, legal pages, and admin 401 confirmed at "+origin);
