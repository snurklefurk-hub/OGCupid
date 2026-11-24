import test from "node:test";
import assert from "node:assert/strict";
import { primaryNavigation, defaultRoute, validRoutePaths } from "./navigation.mjs";

test("classic shell keeps exactly five primary destinations", () => {
  assert.deepEqual(primaryNavigation.map(item => item.label),
    ["Matches", "Messages", "Visitors", "Quickmatch", "Community"]);
});
test("primary destinations have unique route paths", () => {
  assert.equal(new Set(primaryNavigation.map(item => item.path)).size, 5);
  assert.ok(primaryNavigation.every(item => item.path.startsWith("/")));
  assert.equal(defaultRoute, "/matches");
});
test("question flow remains a secondary route rather than a primary tab", () => {
  assert.ok(validRoutePaths.includes("/questions"));
  assert.equal(primaryNavigation.some(item => item.path === "/questions"), false);
});

import {readFileSync} from "node:fs";
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";
test("shared site logo always navigates to the canonical home route without changing default login navigation",()=>{
  const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
  assert.match(app, /<NavLink className="ogcl-brand" to="\/home" aria-label="OG Cupid home">/);
  assert.equal([...app.matchAll(/className="ogcl-brand"/g)].length,1);
  assert.match(app, /<Route path="home" element=\{<section className="ogcl-view">/);
  assert.ok(SITEMAP_PATHS.includes("/home"));
  assert.equal(defaultRoute,"/matches");
  assert.equal(primaryNavigation.length,5);
});
