import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SITEMAP_PATHS,SITEMAP_SECTIONS} from "./sitemap-pages.mjs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const app=read("./App.jsx");
const page=read("./SitemapPage.jsx");

test("sitemap lists all canonical non-profile page routes, no arbitrary or private URLs",()=>{
  const routes=[...app.matchAll(/<Route path="([^"]+)"/g)]
    .map(x=>x[1]).filter(x=>x!=="*"&&!x.includes(":"))
    .map(path=>"/"+path);
  // Visitors is an existing placeholder route rendered from the views object.
  const previewBlock=app.match(/const views = \{([\s\S]*?)\n\};/)?.[1]||"";
  const previews=[...previewBlock.matchAll(/^\s+([a-z0-9-]+):\s*\[/gm)]
    .map(x=>"/"+x[1]);
  const expected=[...routes,...previews].sort();
  assert.deepEqual([...SITEMAP_PATHS].sort(),expected);
  assert.equal(SITEMAP_PATHS.length,new Set(SITEMAP_PATHS).size);
  assert.equal(SITEMAP_PATHS.length,37);
  assert.ok(SITEMAP_PATHS.includes("/home"));
  assert.ok(!SITEMAP_PATHS.some(path=>path.includes(":")||path.startsWith("/profiles/")));
  assert.ok(SITEMAP_PATHS.includes("/profile"),"profile editing is a tool, not a personal profile URL");
  assert.ok(SITEMAP_PATHS.includes("/admin"),"admin route must be indexed as restricted");
  assert.ok(SITEMAP_PATHS.includes("/sitemap"));
});

test("sitemap is public, uses the shared three-column shell and appropriate access notes",()=>{
  assert.match(app,/const SitemapPage=lazy\(\(\)=>import\("\.\/SitemapPage\.jsx"\)\)/);
  assert.match(app,/<Route path="sitemap" element=\{<SitemapPage\/>\} \/>/);
  assert.match(app,/<NavLink data-ogc-edit-text="shell\.footer\.sitemap" to="\/sitemap">Sitemap<\/NavLink>/);
  assert.match(page,/className="ogcl-view ogcl-sitemap"/);
  assert.match(page,/SITEMAP_SECTIONS\.map/);
  assert.match(page,/<NavLink to=\{page\.path\}>/);
  assert.match(page,/page\.access==="admin"/);
  assert.match(page,/individual member profiles and private message threads/);
  const shell=read("./styles.css");
  assert.match(shell,/grid-template-columns:184px minmax\(0,1fr\) 184px/);
  const css=read("./sitemap.css");
  assert.doesNotMatch(css,/\.ogcl-app\s*\{|position:\s*fixed/);
  assert.ok(SITEMAP_SECTIONS.every(group=>group.items.every(item=>
    item.path.startsWith("/")&&item.label&&item.note&&
    ["public","member","admin"].includes(item.access))));
});

test("clean /sitemap entry works on the static host and fallback forwards it",()=>{
  const bridge=read("../../public/404.html");
  const entry=read("../../public/sitemap/index.html");
  assert.match(bridge,/__ogc_route/);
  assert.match(bridge,/location\.replace\(base\+"\/\?__ogc_route="/);
  const publish=read("../../scripts/publish-ogcl-production.mjs");
  assert.match(publish,/writeFileSync\(output,routeHtml\)/);
  // The compiled app entry replaces the old compatibility bridge on publish.
  assert.ok(entry.includes('id="root"')||entry.includes('location.replace("/#/sitemap")'));
  assert.doesNotMatch(entry,/src="https?:|<form|<iframe/);
});

test("sitemap can be edited like other public pages without changing protected routes",()=>{
  const editor=read("./admin-ui-editor-model.mjs");
  assert.match(editor,/\{path:"\/sitemap",label:"Sitemap"\}/);
  assert.match(editor,/"\/sitemap","\/admin"/);
  assert.match(editor,/"terms","sitemap"/);
});
