/* OG Cupid classic desktop shell.
 * Controls only navigation and presentation. Never invents a match score:
 * suggestions must be supplied by an authenticated, approved scoring API.
 */
(() => {
  "use strict";
  const links = [
    ["MATCHES", "/account/#matches-title", "matches"],
    ["MESSAGES", "/account/#messages-title", "messages"],
    ["VISITORS", "/account/#visitors-title", "visitors"],
    ["QUICKMATCH", "/account/#quickmatch-title", "quickmatch"]
  ];
  const el = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  let nav = null, previews = null, previewStatus = null;
  let card = null, cardLink = null, cardTitle = null, photo = null;
  let progress = null, fill = null, percent = null, right = null;
  let authenticated = false;
  function syncActive() {
    if (!nav) return;
    const key = location.pathname.startsWith("/account") ? location.hash.replace(/^#/, "").replace(/-title$/, "") : "";
    nav.querySelectorAll("a[data-ogc-nav]").forEach(a => {
      if (a.dataset.ogcNav === key) a.setAttribute("aria-current","page");
      else a.removeAttribute("aria-current");
    });
  }
  function setup() {
    nav = document.querySelector(".masthead nav.classic-rail-nav, .profile-rail nav, .rail .okc-railnav, .rail .rail-nav");
    if (!nav || nav.dataset.ogcDesktopReady) return;
    nav.dataset.ogcDesktopReady = "true";
    nav.replaceChildren();
    for (const [label, href, key] of links) {
      const a = el("a", "ogc-four-nav", label);
      a.href = href;
      a.dataset.ogcNav = key;
      if (document.body.classList.contains("ogc-member-theme")) {
        a.dataset.classicAuth = "";
        a.hidden = !document.body.classList.contains("is-authenticated");
      }
      nav.append(a);
    }
    syncActive();
    const rail = nav.closest(".masthead,.profile-rail,.rail");
    if (rail) {
      previews = el("section","ogc-match-peeks");
      previews.setAttribute("aria-label","Suggested member profiles");
      previews.hidden = true;
      previews.append(el("h2",null,"People you might like"));
      previewStatus = el("p",null,"Match suggestions will appear when compatibility scoring is available.");
      previews.append(previewStatus);
      nav.insertAdjacentElement("afterend",previews);
    }
    right = document.querySelector(".shell>.period-promo-rail, .profile-site>.period-promo-rail, .page>.period-promo-rail, .page>.okc-rrail");
    if (!right && document.querySelector(".page.persona-page")) {
      right = el("aside","period-promo-rail");
      right.setAttribute("aria-label","Explore OG Cupid");
      right.innerHTML = '<div class="period-promo"><strong>Match questions</strong><p>Go beyond a picture.</p><a href="/account/#question-title">Answer questions</a></div><div class="period-promo"><strong>OgTrends</strong><p>Articles and original research.</p><a href="/ogtrends/">Read OgTrends</a></div>';
      document.querySelector(".page.persona-page").append(right);
    }
    if (right) {
      card = el("section","ogc-profile-rail-card");
      card.id = "ogc-right-profile";
      card.hidden = true;
      const top = el("div","ogc-profile-rail-top");
      photo = el("img","ogc-profile-rail-avatar");
      photo.alt = "Your main profile photo";
      photo.hidden = true;
      top.append(photo);
      const info = el("div");
      cardLink = el("a",null);
      cardLink.href = "/account/";
      cardTitle = el("strong",null,"Complete your profile");
      cardLink.append(cardTitle);
      info.append(cardLink);
      top.append(info);
      card.append(top);
      progress = el("div","ogc-profile-progress");
      progress.setAttribute("role","progressbar");
      progress.setAttribute("aria-label","Profile onboarding completion");
      progress.setAttribute("aria-valuemin","0");
      progress.setAttribute("aria-valuemax","100");
      fill = el("span");
      progress.append(fill);
      card.append(progress);
      percent = el("span","ogc-profile-percent","0% complete");
      card.append(percent);
      right.prepend(card);
    }
  }
  function update({authenticated: signedIn, onboardingComplete, progress: state, profileUrl, photoUrl, displayName} = {}) {
    if (!nav) setup();
    authenticated = signedIn === true;
    if (nav && document.body.classList.contains("ogc-member-theme")) {
      nav.querySelectorAll("[data-classic-auth]").forEach(a => { a.hidden = !authenticated; });
    }
    if (previews) previews.hidden = !authenticated;
    if (!card) return;
    card.hidden = !authenticated || typeof onboardingComplete !== "boolean";
    if (card.hidden) return;
    const complete = onboardingComplete === true;
    cardTitle.textContent = complete ? "View your profile" : "Complete your profile";
    cardLink.href = typeof profileUrl === "string" && /^\/profiles\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(profileUrl)
      ? profileUrl : "/account/" + (complete ? "#member-title" : "#welcome-title");
    cardLink.setAttribute("aria-label",complete ? "View and edit your OG Cupid profile" : "Continue your profile onboarding");
    cardLink.title = displayName ? String(displayName).slice(0,60) : cardTitle.textContent;
    progress.hidden = complete;
    percent.hidden = complete;
    if (!complete) {
      // Six verified server-backed milestones; no guessed partial field scores.
      const keys = ["identity","locality","profile","photo","quiz","explored"];
      const count = keys.filter(k => state?.[k] === true).length;
      const value = Math.round(100 * count / keys.length);
      fill.style.width = value + "%";
      percent.textContent = value + "% complete";
      progress.setAttribute("aria-valuenow",String(value));
    }
    if (typeof photoUrl === "string" && /^(blob:|https:\/\/)/.test(photoUrl)) {
      photo.src = photoUrl; photo.hidden = false;
    } else { photo.removeAttribute("src"); photo.hidden = true; }
  }
  function setSuggestions(input) {
    if (!previews || !previewStatus) setup();
    if (!previews) return;
    const valid = (Array.isArray(input) ? input : []).filter(item =>
      item && typeof item.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) &&
      typeof item.displayName === "string" && Number.isFinite(item.matchPercent) &&
      item.matchPercent >= 0 && item.matchPercent <= 100);
    const high = valid.filter(item => item.matchPercent > 75).sort(() => Math.random() - 0.5);
    const used = new Set(high.slice(0,3).map(item => item.slug));
    const fallback = valid.filter(item => !used.has(item.slug)).sort((a,b) => b.matchPercent - a.matchPercent);
    const chosen = high.slice(0,3).concat(fallback.slice(0,Math.max(0,3-high.length)));
    previews.replaceChildren(el("h2",null,"People you might like"));
    if (!chosen.length) {
      previewStatus = el("p",null,"Match suggestions will appear when compatibility scoring is available.");
      previews.append(previewStatus);
    }
    for (const item of chosen) {
      const a = el("a",null);
      a.href = "/profiles/" + encodeURIComponent(item.slug);
      if (typeof item.photoUrl === "string" && /^(blob:|https:\/\/)/.test(item.photoUrl)) {
        const img = el("img");
        img.src = item.photoUrl; img.alt = ""; a.append(img);
      }
      const box = el("span");
      box.append(el("strong",null,item.displayName.slice(0,60)));
      box.append(el("small",null,Math.round(item.matchPercent) + "% match"));
      a.append(box);
      previews.append(a);
    }
    previews.hidden = !authenticated;
  }
  document.addEventListener("DOMContentLoaded",setup,{once:true});
  if (document.readyState !== "loading") setup();
  window.addEventListener("hashchange",syncActive);
  window.addEventListener("ogc:desktop-member",event=>update(event.detail));
  window.addEventListener("ogc:desktop-suggestions",event=>setSuggestions(event.detail?.suggestions));
  window.OGCClassicDesktop = {update,setSuggestions};
})();
