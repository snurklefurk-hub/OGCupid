// The archived Dating Persona Test now lives within the member experience.
// This is a front-end access gate appropriate for a static quiz; the quiz
// content itself is public source code and must not be treated as private data.
// All member-owned profile/question APIs enforce server-side authentication.
import { createAuthClient } from "@neon/auth";

const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const authBaseUrl = local
  ? "https://ep-blue-credit-bbfdwceu.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth"
  : (import.meta.env.VITE_OGC_AUTH_URL || "");

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
    // Reveal only after Neon Auth confirms a current signed-in member.
    document.documentElement.classList.remove("member-gated");
  } catch {
    returnToAccount();
  }
}

void checkMembership();
