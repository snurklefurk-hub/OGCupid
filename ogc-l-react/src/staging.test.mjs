import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {legacyHref} from "./legacy-links.mjs";

const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
const vite=readFileSync(new URL("../vite.config.js",import.meta.url),"utf8");
const sidebars=readFileSync(new URL("./ClassicSidebar.jsx",import.meta.url),"utf8");
const promotions=readFileSync(new URL("./classic-editorial.mjs",import.meta.url),"utf8");

test("legacy link destinations stay local when OGC-L is an in-site preview",()=>{
  assert.equal(legacyHref("/account/",""),"/account/");
  assert.equal(legacyHref("/profiles/river-riley",""),"/profiles/river-riley");
});

test("independent Render staging site routes incomplete features to original live URL",()=>{
  assert.equal(
    legacyHref("/account/#welcome-title","https://ogcupid.onrender.com"),
    "https://ogcupid.onrender.com/account/#welcome-title"
  );
  assert.equal(
    legacyHref("/profiles/river-riley","https://ogcupid.onrender.com"),
    "https://ogcupid.onrender.com/profiles/river-riley"
  );
});

test("malicious or malformed legacy origins cannot be injected into redirects",()=>{
  for(const value of ["http://example.test","https://username:pass@example.test",
    "https://example.test/path","https://example.test/?x=1","javascript:alert(1)"]){
    assert.throws(()=>legacyHref("/account/",value));
  }
  assert.throws(()=>legacyHref("//evil.example","https://ogcupid.onrender.com"));
  assert.throws(()=>legacyHref("javascript:evil","https://ogcupid.onrender.com"));
});

test("Vite has an explicit isolated Render root build path and copies only the logo",()=>{
  assert.match(vite,/process\.env\.OGCL_DEPLOY_BASE \|\| "\/ogc-l\/"/);
  assert.match(vite,/outDir: "\.\.\/public\/ogc-l"/);
  assert.match(vite,/emptyOutDir: true/);
  assert.match(vite,/ogcupid-logo-white\.png/);
  assert.match(vite,/copyFileSync\(source, destination\)/);
});

test("native account and member navigation does not escape to the old member app",()=>{
  assert.match(app,/import PublishedPage/);
  assert.match(app,/import PersonaPage/);
  assert.ok(app.includes('const profileHref = slug => "#/profiles/"'));
  for(const path of ['<Route path="join"','<Route path="onboarding"','<Route path="recover"',
    '<Route path="photos"','<Route path="account"']){
    assert.ok(app.includes(path),path);
  }
  assert.doesNotMatch(app,/legacyHref\("\/account/);
  assert.match(sidebars,/legacyHref\(destination\)/);
  assert.match(promotions,/case "ogtrends":return/);
  assert.match(promotions,/case "persona":return/);
  assert.doesNotMatch(app,/href="\/(?:account|ogtrends|profiles)\b/);
});
