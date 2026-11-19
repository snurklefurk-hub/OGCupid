import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
const vite=readFileSync(new URL("../vite.config.js",import.meta.url),"utf8");
const sidebars=readFileSync(new URL("./ClassicSidebar.jsx",import.meta.url),"utf8");
const promotions=readFileSync(new URL("./classic-editorial.mjs",import.meta.url),"utf8");


test("Vite staging isolates the React root and copies published Persona/editorial assets",()=>{
  assert.match(vite,/process\.env\.OGCL_DEPLOY_BASE \|\| "\/ogc-l\/"/);
  assert.match(vite,/outDir: "\.\.\/public\/ogc-l"/);
  assert.match(vite,/emptyOutDir: true/);
  assert.match(vite,/ogcupid-logo-white\.png/);
  assert.match(vite,/copyFileSync\(source, destination\)/);
  assert.match(vite,/ogcl-embedded\.css/);
  assert.match(vite,/persona-assets/);
  assert.match(vite,/account\/persona\.html/);
});

test("native account and member navigation does not escape to the old member app",()=>{
  assert.match(app,/import \{EmbeddedEditorial,PersonaRoute\}/);
  assert.ok(app.includes('const profileHref = slug => "#/profiles/"'));
  for(const path of ['<Route path="join"','<Route path="onboarding"','<Route path="recover"',
    '<Route path="photos"','<Route path="account"']){
    assert.ok(app.includes(path),path);
  }
  assert.doesNotMatch(app,/legacyHref\("\/account/);
  assert.match(sidebars,/function reactRoute/);
  assert.doesNotMatch(sidebars,/legacyHref/);
  assert.match(promotions,/case "ogtrends":return/);
  assert.match(promotions,/case "persona":return/);
  assert.match(app,/<Route path="persona"/);
  assert.match(app,/<Route path="ogtrends\/zero"/);
  assert.doesNotMatch(app,/href="\/(?:account|ogtrends|profiles)\b/);
});
