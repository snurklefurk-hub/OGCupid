import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./desktop-2011-shell.css", import.meta.url), "utf8");
const account = readFileSync(new URL("./account/index.html", import.meta.url), "utf8");
const profile = readFileSync(new URL("./profiles/index.html", import.meta.url), "utf8");
const memberJs = readFileSync(new URL("../member-app/main.js", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../member-app/vite.config.js", import.meta.url), "utf8");

function sharedRule(memberSelector, profileSelector) {
  // Keep both pages in the same CSS selector group, so their geometry
  // cannot silently diverge while a later stylesheet overrides one page.
  for (const rule of css.matchAll(/([^{}]+)\\{([^{}]+)\\}/g)) {
    if (rule[1].includes(memberSelector) && rule[1].includes(profileSelector)) return rule[2];
  }
  assert.fail("Shared account/profile selector group missing: " + memberSelector);
}

test("CSS contains real line breaks, not literal backslash-n escapes in selector groups", () => {
  assert.equal(css.includes(String.raw`\n`), false,
    "Literal backslash-n in a selector makes signed-in .shell rules fail to match");
});

test("member account and profile share edge-to-edge 16 / 68 / 16 viewport grid", () => {
  assert.match(css, /--ogc-desktop-left:16%;\s*--ogc-desktop-right:16%/);
  const block = sharedRule(
    "body.ogc-member-theme.is-authenticated .shell",
    "body:has(.profile-site) .profile-site"
  );
  assert.match(block, /max-width:none!important/);
  assert.match(block, /width:100%!important/);
  assert.match(block, /height:100vh!important/);
  assert.match(block, /margin:0!important/);
  assert.match(block, /padding:0!important/);
  assert.match(block, /grid-template-columns:var\(--ogc-desktop-left\) minmax\(0,1fr\) var\(--ogc-desktop-right\)!important/);
});

test("both pages use the same left/nav, center-scroll, and right rail grid positions", () => {
  const left = sharedRule(
    "body.ogc-member-theme.is-authenticated .masthead",
    ".profile-site .profile-rail"
  );
  assert.match(left, /grid-column:1!important;grid-row:1!important/);
  assert.match(left, /height:100vh!important/);
  const center = sharedRule(
    "body.ogc-member-theme.is-authenticated main#main",
    ".profile-site .profile-main"
  );
  assert.match(center, /grid-column:2!important;grid-row:1!important/);
  assert.match(center, /height:100vh!important/);
  assert.match(center, /overflow-y:auto!important/);
  const right = sharedRule(
    "body.ogc-member-theme.is-authenticated .period-promo-rail",
    ".profile-site .period-promo-rail"
  );
  assert.match(right, /grid-column:3!important;grid-row:1!important/);
  assert.match(right, /height:100vh!important/);
});

test("CSS is last in both published pages, and Vite rebuild preserves that order", () => {
  for (const html of [account,profile]) {
    assert.match(html, /desktop-2011-shell\.css\?v=1/);
    const desktop = html.indexOf("/desktop-2011-shell.css");
    assert.ok(desktop > html.indexOf("/okc-2011.css"));
    assert.ok(desktop > html.indexOf("/okc-period-site.css"));
  }
  assert.match(memberJs, /document\.body\.classList\.toggle\("is-authenticated", authenticated\)/);
  assert.match(viteConfig, /const desktop = '<link rel="stylesheet" href="\/desktop-2011-shell\.css\?v=1">';/);
});
