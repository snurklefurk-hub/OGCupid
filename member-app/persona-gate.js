// The archived Dating Persona Test now lives within the member experience.
// This is a front-end access gate appropriate for a static quiz; the quiz
// content itself is public source code and must not be treated as private data.
// All member-owned profile/question APIs enforce server-side authentication.
import { createAuthClient } from "@neon/auth";

const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const authBaseUrl = local
  ? (import.meta.env.VITE_OGC_AUTH_URL || "https://ep-blue-credit-bbfdwceu.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth")
  : (import.meta.env.VITE_OGC_AUTH_URL || "");
const memberApiUrl = local
  ? (import.meta.env.VITE_OGC_MEMBER_API_URL || "https://br-tiny-wave-bbnpjp0m-members.compute.c-15.us-east-1.aws.neon.tech/profile")
  : (import.meta.env.VITE_OGC_MEMBER_API_URL || "");

function returnToAccount() {
  const url = new URL("/account/", window.location.origin);
  url.searchParams.set("join", "persona");
  window.location.replace(url.toString());
}

async function checkMembership() {
  if (!authBaseUrl) { returnToAccount(); return; }
  const auth = createAuthClient(authBaseUrl);
  try {
    const { data, error } = await auth.getSession();
    if (error || !data?.user?.id) {
      returnToAccount();
      return;
    }
    // Keep the Persona Test behind the photo prerequisite during onboarding,
    // even if somebody directly opens its URL instead of the welcome tile.
    const bearer=data.session?.token;
    let token=typeof bearer==="string" && bearer.split(".").length===3?bearer:null;
    if(!token){
      const response=await fetch(authBaseUrl.replace(/\/$/,"")+"/token",{
        credentials:"include",cache:"no-store",headers:{Accept:"application/json"}
      });
      const jwt=await response.json().catch(()=>({}));
      token=response.ok?(jwt.token||jwt.data?.token):null;
    }
    if(!token || !memberApiUrl){returnToAccount();return;}
    const url=new URL(memberApiUrl);
    url.pathname="/onboarding";url.search="";
    const response=await fetch(url.toString(),{
      headers:{"Authorization":"Bearer "+token},
      cache:"no-store",credentials:"omit"
    });
    if(!response.ok){returnToAccount();return;}
    const status=await response.json();
    if(!status.photo && !status.explored){
      window.location.replace("/account/#welcome-title");return;
    }
    // Reveal only after Neon Auth and the member's server-backed photo stage.
    document.documentElement.classList.remove("member-gated");
  } catch {
    returnToAccount();
  }
}

void checkMembership();
