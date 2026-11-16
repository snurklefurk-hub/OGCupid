/* Redirect returning, signed-in visitors to the member area.
 * Uses the same public Neon Auth endpoint as the production member bundle.
 * No client-side "logged in" flags or readable session cookies are trusted.
 */
(() => {
  "use strict";

  const page = document.documentElement;
  page.classList.add("ogc-session-pending");

  // Keep in sync with VITE_OGC_AUTH_URL in the member publishing workflow.
  const authBaseURL =
    "https://ep-hidden-breeze-bbdn5nsb.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let redirecting = false;

  fetch(authBaseURL + "/get-session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: controller.signal
  })
    .then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      const session = result?.session ?? result?.data?.session;
      const user = result?.user ?? result?.data?.user;
      // This must be a server-confirmed session, not just an old client hint.
      if (session && user?.id) {
        redirecting = true;
        window.location.replace("/account/");
      }
    })
    .catch(() => {
      // Offline, blocked third-party cookies, or expired sessions are not
      // proof of membership. Leave the regular public homepage available.
    })
    .finally(() => {
      clearTimeout(timeout);
      if (!redirecting) page.classList.remove("ogc-session-pending");
    });
})();
