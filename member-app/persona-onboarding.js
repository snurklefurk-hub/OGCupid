import { createAuthClient } from "@neon/auth";

const local = ["localhost","127.0.0.1"].includes(location.hostname);
const authBaseUrl = local
  ? (import.meta.env.VITE_OGC_AUTH_URL || "https://ep-blue-credit-bbfdwceu.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth")
  : (import.meta.env.VITE_OGC_AUTH_URL || "");
const apiBaseUrl = local
  ? (import.meta.env.VITE_OGC_MEMBER_API_URL || "https://br-empty-lab-bbjb0q1u-members.compute.c-15.us-east-1.aws.neon.tech/profile")
  : (import.meta.env.VITE_OGC_MEMBER_API_URL || "");
const auth = authBaseUrl && apiBaseUrl ? createAuthClient(authBaseUrl) : null;
let lastResult = null, saving = false;

async function tokenForSession() {
  const {data,error} = await auth.getSession();
  if(error || !data?.user) throw Error("Your session expired. Sign in again to save this result.");
  const sessionToken=data.session?.token;
  if(typeof sessionToken==="string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sessionToken))
    return sessionToken;
  const result=await fetch(authBaseUrl.replace(/\/$/,"")+"/token",{
    credentials:"include",cache:"no-store",headers:{Accept:"application/json"}
  });
  if(!result.ok) throw Error("Couldn't retrieve your member session.");
  const dataToken=await result.json();
  const token=dataToken.token||dataToken.data?.token;
  if(typeof token!=="string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw Error("Your session token is unavailable.");
  return token;
}

async function savePersona(result) {
  if(saving || !auth || !apiBaseUrl) return;
  if(!result || !Array.isArray(result.answers) || result.answers.length!==40 ||
    !result.answers.every(Number.isInteger) || !/^[DR][GB][LS][DM]$/.test(result.code)) return;
  saving=true;
  let notice=document.getElementById("ogc-persona-save-status");
  if(!notice){
    notice=document.createElement("p");
    notice.id="ogc-persona-save-status";notice.setAttribute("role","status");notice.setAttribute("aria-live","polite");
    (document.getElementById("persona-result") || document.body).appendChild(notice);
  }
  notice.textContent="Saving your Persona result to your account…";
  try {
    const jwt=await tokenForSession();
    const url=new URL(apiBaseUrl);url.pathname="/onboarding";url.search="";
    const res=await fetch(url.toString(),{
      method:"PUT",credentials:"omit",cache:"no-store",
      headers:{"Authorization":"Bearer "+jwt,"Content-Type":"application/json"},
      body:JSON.stringify({step:"persona",answers:result.answers,code:result.code})
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok||!body.saved)throw Error(body.error||"Could not save your Persona result.");
    notice.textContent="✓ Saved to your OG Cupid profile.";
    document.getElementById("ogc-persona-save-retry")?.remove();
    if(new URLSearchParams(location.search).get("onboarding")==="1") {
      location.replace("/account/#welcome-title");
    }
  } catch(e) {
    notice.textContent=e instanceof Error?e.message:"Could not save this result.";
    let retry=document.getElementById("ogc-persona-save-retry");
    if(!retry){
      retry=document.createElement("button");retry.id="ogc-persona-save-retry";retry.type="button";
      retry.textContent="Try saving again";
      retry.addEventListener("click",()=>{if(lastResult)void savePersona(lastResult);});
      notice.after(retry);
    }
  } finally { saving=false; }
}

window.addEventListener("ogc:persona-finished",event=>{
  const answers=event.detail?.answers, code=event.detail?.code;
  if(!Array.isArray(answers)||answers.length!==40||!answers.every(Number.isInteger)||
    typeof code!=="string"||!/^[DR][GB][LS][DM]$/.test(code))return;
  lastResult={answers:answers.slice(),code};
  void savePersona(lastResult);
});
