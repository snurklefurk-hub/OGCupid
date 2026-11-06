/*
 * OG Cupid minimal visitor counter.
 *
 * ONLY two event names leave the browser: "first-visit" and "return-visit".
 * No account ID, session ID, path, search, referrer, or page title is sent.
 * A first-party browser marker is used exclusively ON THAT BROWSER to tell
 * a first visit from a later visit. It is never sent to the analytics provider.
 *
 * Active endpoint: https://ogcupid.goatcounter.com/count
 * Only fixed, non-identifying event names are sent. We deliberately do NOT
 * load GoatCounter's default automatic page-view script.
 */
(function () {
  "use strict";

  const ENDPOINT = "https://ogcupid.goatcounter.com/count";
  const HOST = "ogcupid.onrender.com";
  const SEEN_KEY = "ogcupid:counted-once:v1";
  const LAST_KEY = "ogcupid:last-counted-at:v1";
  const RETURN_WINDOW_MS = 8 * 60 * 60 * 1000;

  if (!ENDPOINT || location.hostname !== HOST) return;
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true) return;

  let url;
  try {
    url = new URL(ENDPOINT);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".goatcounter.com") ||
        url.pathname !== "/count" || url.username || url.password ||
        url.search || url.hash) return;
  } catch (_) {
    return;
  }

  let firstVisit;
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_KEY)) || 0;
    if (last > 0 && now >= last && now - last < RETURN_WINDOW_MS) return;

    firstVisit = localStorage.getItem(SEEN_KEY) !== "1";
    localStorage.setItem(SEEN_KEY, "1");
    localStorage.setItem(LAST_KEY, String(now));
  } catch (_) {
    // No browser storage = no meaningful new/return distinction. Don't guess.
    return;
  }

  // Fixed event name only. Never include URL, title, referrer, or other metadata.
  url.searchParams.set("p", firstVisit ? "first-visit" : "return-visit");
  url.searchParams.set("e", "1");
  url.searchParams.set("t", "");
  url.searchParams.set("r", "");
  url.searchParams.set("rnd", String(Math.random()));

  fetch(url.toString(), {
    method: "GET",
    mode: "no-cors",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    keepalive: true,
  }).catch(function () {
    // Analytics must never affect browsing.
  });
})();
