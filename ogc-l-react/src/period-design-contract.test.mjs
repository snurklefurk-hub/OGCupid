import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const palette=read("../../public/okc-2011-tokens.css");
const legacy=read("../../public/okc-2011.css");
const desktop=read("../../public/desktop-2011-shell.css");
const react=read("./styles.css");
const app=read("./App.jsx");

test("the 2011 UI has one canonical set of exactly 29 color swatches",()=>{
  const keys=[...palette.matchAll(/--okc-[\w-]+\s*:\s*#[0-9a-f]{6}\s*;/g)];
  assert.equal(keys.length,29);
  assert.equal(new Set(keys.map(m=>m[0].match(/--okc-[\w-]+/)[0])).size,29);
  assert.match(palette,/--okc-blue:\s*#2963a4/);
  assert.match(palette,/--okc-pink:\s*#f83265/);
  assert.match(palette,/--okc-green:\s*#63a62f/);
  assert.match(legacy,/@import url\("\.\/okc-2011-tokens\.css"\)/);
  assert.match(react,/@import "\.\.\/\.\.\/public\/okc-2011-tokens\.css"/);
  assert.doesNotMatch(legacy,/--okc-blue\s*:\s*#2963a4/);
});

test("no full-height rail lock survives in React or legacy desktop CSS",()=>{
  assert.doesNotMatch(react,/height:100dvh|position:fixed;z-index:25/);
  assert.match(react,/\.ogcl-center \{height:auto;[^}]*overflow:visible/);
  assert.match(react,/\.ogcl-left, \.ogcl-right \{height:auto;overflow:visible/);
  assert.doesNotMatch(desktop,/(?<!min-)height:100vh|overflow-y:auto!important|overflow:hidden!important/);
  assert.match(desktop,/grid-template-rows:auto!important/);
  assert.match(desktop,/overflow-y:visible!important/);
});

test("the 2011 buttons, headings, active states and nav text are intentional",()=>{
  assert.match(react,/--ogcl-blue:var\(--okc-blue\)/);
  assert.match(react,/background:linear-gradient\(to bottom,var\(--okc-blue-light\),var\(--okc-blue\)\)/);
  assert.match(react,/min-height:30px/);
  assert.match(react,/\.ogcl-nav-link\.active \{[^}]*var\(--okc-green-pale\)/);
  assert.match(react,/\.ogcl-question-form h2 \{font:bold 15px\/21px/);
  assert.match(react,/\.ogcl-profile-name-line h1 \{font:normal 26px\/28px/);
  assert.doesNotMatch(app,/ogcl-nav-glyph/);
});
