import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";

const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
test("Blade publishes a direct entry and uses the same guarded Home route",()=>{
  assert.ok(SITEMAP_PATHS.includes("/blade"));
  for(const path of ["home","blade"])assert.ok(app.includes(`path="${path}" element={<HomeRoute/>}`));
  assert.ok(app.includes('blade={path==="/blade"}'));
});
test("every Blade CSS rule is scoped to the themed shell",()=>{
  const css=readFileSync(new URL("./blade.css",import.meta.url),"utf8").replace(/\/\*[\s\S]*?\*\//g,"");
  for(const [,selector] of css.matchAll(/([^{}]+)\{[^{}]*\}/g))assert.match(selector.trim(),/^(?:\.ogcl-app)?\[data-theme="blade"\]/);
});
