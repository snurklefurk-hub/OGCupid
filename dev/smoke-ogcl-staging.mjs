// Dependency-free, credential-free live staging checks.
// Safe to run from CI: no account creation, no member mutations and no private data.
import assert from "node:assert/strict";

const STAGING = "https://ogcupid-l-staging.onrender.com";
const PRODUCTION = "https://ogcupid.onrender.com";
const MEMBER = "https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech";
const AUTH = "https://ep-hidden-breeze-bbdn5nsb.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
const timeout = 30000;
const required = (check, message) => { if (!check) throw new Error(message); };

async function get(url, options={}) {
  const res = await fetch(url, {...options, redirect:"follow", cache:"no-store", signal:AbortSignal.timeout(timeout)});
  return res;
}
async function check(description, action) {
  try {await action(); console.log("PASS:", description);}
  catch(e) {console.error("FAIL:", description, e.message);process.exitCode=1;}
}

await check("staging homepage serves a compiled root app", async () => {
  const res=await get(STAGING+"/");
  required(res.status===200,"staging HTTP "+res.status);
  const html=await res.text();
  required(html.includes("OG Cupid L") && html.includes('id="root"'),"missing React app entry");
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(x=>x[1]);
  required(assets.length>=2,"missing root-absolute JS/CSS assets: "+assets.length);
  required(!html.includes("/ogc-l/assets/"),"staging incorrectly points at /ogc-l");
  for(const path of assets){
    const asset=await get(STAGING+path);
    required(asset.status===200,"asset "+path+" HTTP "+asset.status);
    const type=asset.headers.get("content-type")||"";
    required(/javascript|css/.test(type),"wrong asset content-type: "+type);
  }
});

await check("staging ships the approved OGC logo",async()=>{
  const response=await get(STAGING+"/brand/ogcupid-logo-white.png");
  required(response.status===200,"logo HTTP "+response.status);
  required((response.headers.get("content-type")||"").includes("image/"),"logo not served as image");
});

await check("production homepage still works independently",async()=>{
  const response=await get(PRODUCTION+"/");
  required(response.status===200,"legacy site HTTP "+response.status);
});

await check("Neon member API CORS preflight accepts only exact staging origin",async()=>{
  const response=await get(MEMBER+"/onboarding",{
    method:"OPTIONS",
    headers:{
      Origin:STAGING,
      "Access-Control-Request-Method":"GET",
      "Access-Control-Request-Headers":"authorization"
    }
  });
  required(response.ok||response.status===204,"CORS preflight HTTP "+response.status);
  required(response.headers.get("access-control-allow-origin")===STAGING,
    "exact staging origin missing from member API CORS");
  required((response.headers.get("access-control-allow-headers")||"").toLowerCase().includes("authorization"),
    "Bearer Authorization header not allowed");
  const disallowed=await get(MEMBER+"/onboarding",{
    method:"OPTIONS",
    headers:{Origin:"https://untrusted.example","Access-Control-Request-Method":"GET",
      "Access-Control-Request-Headers":"authorization"}
  });
  required(disallowed.headers.get("access-control-allow-origin")===null,
    "member API must not allow an unknown origin");
});

await check("Neon member API rejects anonymous read and echoes staging origin",async()=>{
  const res=await get(MEMBER+"/onboarding",{headers:{Origin:STAGING,Accept:"application/json"}});
  required(res.status===401,"anonymous protected resource returned HTTP "+res.status);
  required(res.headers.get("access-control-allow-origin")===STAGING,
    "protected denial lacks staging CORS header");
  const body=await res.json();
  required(typeof body.error==="string","expected safe unauthorized response");
});

await check("Quickmatch API denies anonymous reads and writes while permitting exact-origin preflight",async()=>{
  const preflight=await get(MEMBER+"/quickmatch",{
    method:"OPTIONS",
    headers:{Origin:STAGING,"Access-Control-Request-Method":"PUT",
      "Access-Control-Request-Headers":"authorization,content-type"}
  });
  required(preflight.status===204,"Quickmatch preflight HTTP "+preflight.status);
  required(preflight.headers.get("access-control-allow-origin")===STAGING,
    "Quickmatch CORS must accept exact staging origin");
  const read=await get(MEMBER+"/quickmatch",{headers:{Origin:STAGING,Accept:"application/json"}});
  required(read.status===401,"Anonymous Quickmatch read HTTP "+read.status);
  required(read.headers.get("access-control-allow-origin")===STAGING,
    "Quickmatch unauthorized read missing exact CORS");
  const write=await get(MEMBER+"/quickmatch",{
    method:"PUT",headers:{Origin:STAGING,"Content-Type":"application/json"},
    body:JSON.stringify({targetUserId:"00000000-0000-4000-8000-000000000002",decision:"like"})
  });
  required(write.status===401,"Anonymous Quickmatch write HTTP "+write.status);
  required(write.headers.get("access-control-allow-origin")===STAGING,
    "Quickmatch unauthorized write missing exact CORS");
});

await check("Neon Auth allows the staging browser origin",async()=>{
  const res=await get(AUTH+"/get-session",{headers:{Origin:STAGING,Accept:"application/json"}});
  required(res.status===200||res.status===401,"Neon Auth session probe HTTP "+res.status);
  required(res.headers.get("access-control-allow-origin")===STAGING,
    "Neon Auth does not authorize exact staging origin");
});

if(process.exitCode)process.exit(process.exitCode);
