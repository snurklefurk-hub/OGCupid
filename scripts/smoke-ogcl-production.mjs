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
    for(const marker of ["Create your OG Cupid account","Recover your account","Welcome to OG Cupid","Permanently delete my account",
      "The Dating Persona Test","OgTrends #0: The Big Idea","Privacy Policy","Terms & Conditions","ogcl-embedded.css",
      "Community Chat","OG Cupid · The Lounge"]){
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
// Canonical public content remains indexable, complete, and reachable
// independently of the React session shell and from old bookmarks.
for(const [path,mark] of [
  ["/ogtrends/","WE BROUGHT BACK"],
  ["/ogtrends/zero/","OGTRENDS"],
  ["/ogtrends/perfect-profile/","The Perfect Dating Profile"],
  ["/ogtrends/references/","ENTERED THE CHAT"],
  ["/contact/","Contact"],
  ["/privacy/","Privacy Policy"],
  ["/terms/","Terms &amp; Conditions"],
  ["/account/persona.html","persona-form"]
]){
  const doc=await read(path);
  if(!doc.includes(mark))throw Error("Canonical page changed or missing: "+path);
}
const embedded=await read("/ogcl-embedded.css","text/css");
if(!embedded.includes("html.ogcl-embed"))throw Error("React editorial embedded styles absent");
for(const path of ["/persona-assets/DBLMf.gif","/profile-assets/porchlight.webp"]){
  const asset=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});
  if(asset.status!==200)throw Error("Missing original art/editorial asset: "+path);
}
for(const [path,destination] of [["/quiz/","/#/persona"],["/questions/","/#/questions"]]){
  const page=await read(path);
  if(!page.includes('content="0;url='+destination+'"'))
    throw Error("Historical path doesn't redirect to React: "+path);
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
const room=await fetch("https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/community",{
  headers:{Origin:origin},signal:AbortSignal.timeout(15000)
});
if(room.status!==401)throw new Error("Anonymous community endpoint returned "+room.status);
const admin=await fetch("https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/admin",{
  headers:{Origin:origin},signal:AbortSignal.timeout(15000)
});
if(admin.status!==401)throw new Error("Unauthenticated admin endpoint returned "+admin.status);
console.log("React production root, compiled assets, legacy bridge, legal pages, and admin 401 confirmed at "+origin);
