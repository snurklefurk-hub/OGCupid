/* Classic desktop member rails. No mock members, invented compatibility,
 * or unauthenticated profile reads. All data requests require a verified JWT.
 * Account onboarding remains the server's authority for completion. */
(() => {
  "use strict";
  if (window.matchMedia("(max-width:1023px)").matches) return;

  const account = document.body.classList.contains("ogc-member-theme");
  const root = account ? document.querySelector(".shell") : document.querySelector(".profile-site");
  if (!root) return;

  const left = root.querySelector(account ? ".masthead" : ".profile-rail");
  const nav = left?.querySelector("nav");
  const right = root.querySelector(".period-promo-rail");
  const main = root.querySelector(account ? "main#main" : ".profile-main");
  if (!left || !nav || !right || !main) return;

  const AUTH = "https://ep-hidden-breeze-bbdn5nsb.neonauth.c-15.us-east-1.aws.neon.tech/neondb/auth";
  const API = "https://br-plain-unit-bbcbxpqq-members.compute.c-15.us-east-1.aws.neon.tech";
  const itemInfo = [
    ["matches", "♥", "MATCHES"],
    ["messages", "✉", "MESSAGES"],
    ["visitors", "♙", "VISITORS"],
    ["quickmatch", "✦", "QUICKMATCH"]
  ];
  const state = {
    member: null, onboarding: null, recommendations: [], token: null,
    imageUrls: [], refreshSeq: 0, refreshing: false, lastRefresh: 0
  };
  const element = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content != null) node.textContent = String(content);
    return node;
  };
  const safeSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
  const randomize = items => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  // >75% group is sampled randomly; the shortfall is filled from the
  // highest-scored remaining profiles. Scores must come from the member API.
  const selectProfiles = profiles => {
    const scored = (Array.isArray(profiles) ? profiles : []).filter(item =>
      safeSlug(item.slug) && item.slug !== state.member?.slug &&
      typeof item.matchPercent === "number" && Number.isFinite(item.matchPercent) &&
      item.matchPercent >= 0 && item.matchPercent <= 100);
    const high = randomize(scored.filter(item => item.matchPercent > 75)).slice(0, 3);
    if (high.length === 3) return high;
    const rest = scored.filter(item => !high.includes(item))
      .sort((a, b) => b.matchPercent - a.matchPercent);
    return high.concat(rest.slice(0, 3 - high.length));
  };

  nav.replaceChildren();
  nav.setAttribute("aria-label", "Primary member navigation");
  for (const [view, icon, label] of itemInfo) {
    const link = element("a");
    link.href = "/account/#" + view;
    link.dataset.ogcNav = view;
    link.append(element("span", "ogc-desktop-nav-icon", icon),
      document.createTextNode(label));
    nav.append(link);
  }

  const recommendationsBox = element("section", "ogc-desktop-discovery");
  const recHeading = element("h2", "", "You might like");
  const recNote = element("p", "ogc-discovery-note", "Compatible members will appear here.");
  const recItems = element("div", "ogc-discovery-items");
  recommendationsBox.append(recHeading, recNote, recItems);
  left.append(recommendationsBox);

  const profileCard = element("section", "ogc-right-profile");
  profileCard.hidden = true;
  profileCard.setAttribute("aria-label", "Your profile");
  const profileLink = element("a", "ogc-right-link");
  profileLink.href = "/account/#profile-title";
  const avatar = element("span", "ogc-right-avatar", "♥");
  avatar.setAttribute("aria-hidden", "true");
  const summary = element("span");
  const cardTitle = element("span", "ogc-right-title");
  const cardSubtitle = element("span", "ogc-right-subtitle");
  summary.append(cardTitle, cardSubtitle);
  profileLink.append(avatar, summary);
  const bar = element("div", "ogc-progress-track");
  const fill = element("span", "ogc-progress-fill");
  fill.setAttribute("role", "progressbar");
  fill.setAttribute("aria-label", "Onboarding completion");
  fill.setAttribute("aria-valuemin", "0");
  fill.setAttribute("aria-valuemax", "100");
  bar.append(fill);
  const progressCopy = element("span", "ogc-progress-copy");
  profileCard.append(profileLink, bar, progressCopy);
  right.prepend(profileCard);
  const extra = element("div", "ogc-desktop-extra-links");
  const settings = element("a", "", "Account settings");
  settings.href = "/account/#settings-title";
  const legal = element("a", "", "Privacy & terms");
  legal.href = "/privacy/";
  extra.append(settings, document.createTextNode(" · "), legal);
  right.append(extra);

  let activeView = null;
  let screen = null;
  if (account) {
    screen = element("section", "ogc-desktop-view");
    screen.id = "ogc-desktop-view";
    screen.hidden = true;
    main.append(screen);
  }

  function activeNav() {
    const requested = location.hash.slice(1).toLowerCase();
    return itemInfo.some(([view]) => view === requested) ? requested : null;
  }

  function profileRow(profile, compact) {
    const card = element("a", "ogc-member-card");
    card.href = "/profiles/" + encodeURIComponent(profile.slug);
    const thumb = element("span", "ogc-card-thumb ogc-card-avatar", "♥");
    const body = element("span", "ogc-card-body");
    body.append(element("span", "ogc-card-name", String(profile.displayName || "Member").slice(0, 80)));
    body.append(element("span", "ogc-card-percent", Math.round(profile.matchPercent) + "% match"));
    card.append(thumb, body);
    if (compact) card.classList.add("ogc-compact-card");
    if (profile.thumbUrl) {
      const img = element("img", "ogc-card-thumb");
      img.src = profile.thumbUrl;
      img.alt = "";
      img.loading = "lazy";
      thumb.replaceWith(img);
    }
    return card;
  }

  function renderRecommendations() {
    recItems.replaceChildren();
    if (!state.member || !state.onboarding?.explored) {
      recNote.textContent = "Finish onboarding to explore members.";
      recommendationsBox.hidden = !state.member;
      return;
    }
    recommendationsBox.hidden = false;
    if (!state.recommendations.length) {
      recNote.textContent = "No scored matches are available yet.";
      return;
    }
    recNote.textContent = "A few members worth getting to know.";
    state.recommendations.forEach(item => recItems.append(profileRow(item, true)));
  }

  function renderScreen() {
    const view = account && document.body.classList.contains("is-authenticated") ? activeNav() : null;
    if (!account || !screen) return;
    document.body.classList.toggle("ogc-desktop-screen", Boolean(view));
    for (const link of nav.querySelectorAll("a[data-ogc-nav]")) {
      if (link.dataset.ogcNav === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    screen.hidden = !view;
    if (!view) return;
    screen.replaceChildren();
    const titles = {matches:"Matches", messages:"Messages", visitors:"Visitors", quickmatch:"Quickmatch"};
    screen.append(element("h1", "", titles[view]));
    if (view === "messages" || view === "visitors") {
      const card = element("div", "ogc-view-card");
      card.append(element("h2", "", view === "messages" ? "Conversations" : "Profile visitors"),
        element("p", "ogc-view-empty", view === "messages"
          ? "Messaging isn't available yet. No messages or unread counts are being invented."
          : "Visitor tracking isn't available yet. No visitor activity is being invented."));
      screen.append(card);
      return;
    }
    if (!state.onboarding?.explored) {
      const card = element("div", "ogc-view-card");
      const link = element("a", "", "Continue onboarding");
      link.href = "/account/#welcome-title";
      card.append(element("p", "", "Complete onboarding before exploring compatible members."),link);
      screen.append(card);
      return;
    }
    const profiles = view === "quickmatch"
      ? randomize(state.recommendations).slice(0, 1)
      : state.recommendations;
    if (!profiles.length) {
      screen.append(element("p", "ogc-view-empty", "There are no scored profiles to show you yet. Match percentages will appear only when the compatibility service provides them."));
      const links = element("p", "ogc-view-actions");
      const q = element("a", "", "Answer more match questions");
      q.href = "/account/#question-title";
      links.append(q);
      screen.append(links);
      return;
    }
    const caption = view === "quickmatch"
      ? "Here's one of your available matches. Refresh Quickmatch for another."
      : "Members with more than 75% match are randomized first; remaining slots use the highest available scores.";
    screen.append(element("p", "", caption));
    const cards = element("div", "ogc-view-card");
    profiles.forEach(profile => cards.append(profileRow(profile, false)));
    screen.append(cards);
    if (view === "quickmatch") {
      const button = element("button", "ogc-quickmatch-refresh", "Show another");
      button.type = "button";
      button.addEventListener("click", () => renderScreen());
      screen.append(button);
    }
  }

  function clearUrls() {
    state.imageUrls.forEach(url => URL.revokeObjectURL(url));
    state.imageUrls = [];
  }

  async function getToken() {
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return null;
    const response = await fetch(AUTH + "/token", {
      credentials:"include",cache:"no-store",headers:{Accept:"application/json"}
    });
    if (!response.ok) return null;
    const data = await response.json();
    const token = data?.token || data?.data?.token;
    return typeof token === "string" && token.split(".").length === 3 ? token : null;
  }

  async function request(path, kind = "json") {
    const response = await fetch(API + path, {
      method:"GET",credentials:"omit",cache:"no-store",
      headers:{Authorization:"Bearer " + state.token}
    });
    if (response.status === 401 || response.status === 403) throw new Error("Session expired");
    if (!response.ok) throw new Error("Not available");
    return kind === "blob" ? response.blob() : response.json();
  }

  async function thumbnailFor(userId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(userId || ""))) return null;
    try {
      const list = await request("/photos/member/" + encodeURIComponent(userId));
      const photos = Array.isArray(list.photos) ? list.photos : [];
      const selected = photos.find(p => p.isPrimary) || photos[0];
      if (!selected?.id) return null;
      const blob = await request("/photos/" + encodeURIComponent(selected.id) + "/bytes", "blob");
      if (!blob.type.startsWith("image/")) return null;
      const url = URL.createObjectURL(blob);
      state.imageUrls.push(url);
      return url;
    } catch { return null; }
  }

  function renderRightCard() {
    if (!state.member || !state.onboarding) {
      profileCard.hidden = true;
      return;
    }
    profileCard.hidden = false;
    const done = Boolean(state.onboarding.explored);
    const slug = state.member.slug;
    const href = done && safeSlug(slug)
      ? "/profiles/" + encodeURIComponent(slug)
      : "/account/#profile-title";
    profileLink.href = href;
    cardTitle.textContent = done ? "View your profile" : "Complete your profile";
    cardSubtitle.textContent = state.member.displayName || "Your OG Cupid page";
    const milestones = ["identity", "locality", "profile", "photo", "quiz", "explored"];
    const completed = milestones.filter(key => state.onboarding[key] === true).length;
    const percentage = done ? 100 : Math.round(completed / milestones.length * 100);
    bar.hidden = done;
    progressCopy.hidden = done;
    if (!done) {
      fill.style.width = percentage + "%";
      fill.setAttribute("aria-valuenow", String(percentage));
      progressCopy.textContent = percentage + "% complete";
    }
    if (state.member.thumbUrl) {
      const image = element("img", "ogc-right-avatar");
      image.src = state.member.thumbUrl;
      image.alt = "";
      avatar.replaceWith(image);
      state.member.avatarNode = image;
    }
  }

  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true;
    const seq = ++state.refreshSeq;
    try {
      // Never fetch private resources or show a profile shortcut merely
      // because a client-side CSS class says "authenticated".
      state.token = await getToken();
      if (!state.token) {
        state.member = null;
        state.onboarding = null;
        state.recommendations = [];
        clearUrls();
        renderRightCard();
        renderRecommendations();
        renderScreen();
        return;
      }
      const [statusResult, profileResult] = await Promise.all([
        request("/onboarding"), request("/profile")
      ]);
      if (seq !== state.refreshSeq) return;
      const profile = profileResult?.profile || {};
      state.onboarding = statusResult || {};
      state.member = {
        userId:profile.userId || profileResult.userId,
        slug:profile.slug,
        displayName:profile.displayName || "",
        thumbUrl:null
      };
      clearUrls();
      state.member.thumbUrl = await thumbnailFor(state.member.userId);
      if (seq !== state.refreshSeq) return;
      const display = avatar.parentNode ? avatar : profileCard.querySelector(".ogc-right-avatar");
      if (state.member.thumbUrl) {
        if (display?.tagName === "IMG") display.src = state.member.thumbUrl;
        else if (display) {
          const image = element("img", "ogc-right-avatar");
          image.src = state.member.thumbUrl;
          image.alt = "";
          display.replaceWith(image);
        }
      }
      state.recommendations = [];
      if (state.onboarding.explored) {
        try {
          const result = await request("/discovery");
          if (seq !== state.refreshSeq) return;
          state.recommendations = selectProfiles(result.profiles);
          await Promise.all(state.recommendations.map(async p => {
            p.thumbUrl = await thumbnailFor(p.userId);
          }));
        } catch {
          // No discovery endpoint or no real scores: show an honest empty state.
        }
      }
      renderRightCard();
      renderRecommendations();
      renderScreen();
    } catch {
      state.member = null;
      state.onboarding = null;
      state.recommendations = [];
      clearUrls();
      renderRightCard();
      renderRecommendations();
      renderScreen();
    } finally {
      state.refreshing = false;
      state.lastRefresh = Date.now();
    }
  }

  let refreshTimer = 0;
  function queueRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, 250);
  }
  window.addEventListener("hashchange", () => {
    // The account app updates its internal view on the same event. Render the
    // desktop route afterwards without changing onboarding or JWT state.
    window.setTimeout(renderScreen, 0);
    if (Date.now() - state.lastRefresh > 3000) queueRefresh();
  });
  window.addEventListener("ogc:member-state-changed", queueRefresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - state.lastRefresh > 30000) queueRefresh();
  });
  if (account) {
    const observer = new MutationObserver(() => queueRefresh());
    observer.observe(document.body, {attributes:true,attributeFilter:["class"]});
    const status = document.querySelector("#welcome-side-profile-status");
    const photos = document.querySelector("#welcome-side-photos-status");
    const questions = document.querySelector("#welcome-side-questions-status");
    for (const node of [status, photos, questions].filter(Boolean)) {
      observer.observe(node, {childList:true,characterData:true,subtree:true});
    }
  }
  renderScreen();
  queueRefresh();
  window.addEventListener("beforeunload", clearUrls);
})();
