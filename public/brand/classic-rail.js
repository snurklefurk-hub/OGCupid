/* One consistent classic-era rail across public OG Cupid pages.
 * Public links only; never pretend visitors have a logged-in session.
 * Member account has its own auth-aware rail. No member data is read here.
 */
(() => {
  "use strict";
  const page = document.querySelector(".site");
  if (!page || page.classList.contains("ogc-classic-with-rail")) return;
  page.classList.add("ogc-classic-with-rail");
  const path = location.pathname.replace(/\/$/, "") || "/";
  const links = [
    ["/", "⌂", "Home"],
    ["/account/", "♡", "Members"],
    ["/questions/", "◎", "Match questions"],
    ["/quiz/", "✦", "Dating persona"],
    ["/ogtrends/", "✎", "OgTrends"],
    ["/contact/", "✉", "Contact"],
  ];
  const aside = document.createElement("aside");
  aside.className = "ogc-classic-rail";
  aside.setAttribute("aria-label", "OG Cupid navigation");
  const home = document.createElement("a");
  home.className = "ogc-rail-logo";
  home.href = "/";
  home.setAttribute("aria-label", "OG Cupid home");
  const logo = document.createElement("img");
  logo.src = "/brand/og-cupid-arrow.svg";
  logo.alt = "OG Cupid";
  logo.width = 720;
  logo.height = 174;
  home.appendChild(logo);
  aside.appendChild(home);
  const intro = document.createElement("p");
  intro.className = "ogc-rail-intro";
  intro.textContent = "A little more you. A lot less swiping.";
  aside.appendChild(intro);
  const nav = document.createElement("nav");
  nav.className = "ogc-rail-nav";
  nav.setAttribute("aria-label", "Primary navigation");
  for (const [href, glyph, label] of links) {
    const a = document.createElement("a");
    a.href = href;
    const destination = href === "/" ? "/" : href.replace(/\/$/, "");
    const active = path === destination || (href === "/ogtrends/" && path.startsWith("/ogtrends/"));
    if (active) a.setAttribute("aria-current", "page");
    const icon = document.createElement("span");
    icon.className = "ogc-rail-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = glyph;
    a.appendChild(icon);
    a.appendChild(document.createTextNode(label));
    nav.appendChild(a);
  }
  aside.appendChild(nav);
  const heading = document.createElement("p");
  heading.className = "ogc-rail-section-heading";
  heading.textContent = "Your corner of the internet";
  aside.appendChild(heading);
  const note = document.createElement("p");
  note.className = "ogc-rail-section-note";
  note.textContent = "Good questions. Real people. Room for a little weird.";
  aside.appendChild(note);
  const end = document.createElement("p");
  end.className = "ogc-rail-tagline";
  end.innerHTML = "Less swiping.<br>More “wait, you too?”";
  aside.appendChild(end);
  page.prepend(aside);
})();