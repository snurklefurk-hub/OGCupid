// Unauthenticated production cutover verification; no tokens or user data.
const origin=(process.env.OGC_PRODUCTION_ORIGIN||"https://ogcupid.onrender.com").replace(/\/$/,"");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
    if(!next.includes('id="root"') || !next.includes("/assets/index-")||
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
}
for(const path of ["/account/","/account/persona.html","/quiz/",
  "/questions/","/profiles/","/ogtrends/","/privacy/","/terms/","/contact/"]){
  const content=await read(path);
  if(!content.includes("OG Cupid")&&!content.includes("OGCupid"))
    throw new Error(path+" returned unexpected content");
}
for(const path of ["/brand/ogcupid-logo-white.png","/favicon.png"]){
  const r=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});
  if(r.status!==200)throw new Error("Missing "+path+": "+r.status);
}
const admin=await fetch("https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech/admin",{
  headers:{Origin:origin},signal:AbortSignal.timeout(15000)
});
if(admin.status!==401)throw new Error("Unauthenticated admin endpoint returned "+admin.status);
console.log("React production root, compiled assets, legacy bridge, legal pages, and admin 401 confirmed at "+origin);
