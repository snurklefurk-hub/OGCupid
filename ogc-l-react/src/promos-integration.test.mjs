import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=name=>readFileSync(new URL(name,import.meta.url),"utf8");

test("Promos is a real admin section with create/update/delete and URL controls",()=>{
  const dash=read("./AdminDashboard.jsx"),editor=read("./AdminPromos.jsx");
  assert.match(dash,/"members","promos","audit"/);
  assert.match(dash,/tab==="promos"/);
  assert.match(dash,/<AdminPromos onUnsavedChange=\{setPromoDirty\}/);
  assert.match(editor,/adminRequest\("\/admin\/promos"\)/);
  assert.match(editor,/adminRequest\(path,method,\{card\}\)/);
  assert.match(editor,/adminRequest\("\/admin\/promos\/"\+selected,"DELETE"\)/);
  assert.match(editor,/URL \(optional\)/);
  assert.match(editor,/type="checkbox"/);
  assert.match(editor,/window\.confirm/);
  assert.doesNotMatch(editor,/dangerouslySetInnerHTML/);
});

test("live outer columns share server catalogue and preserve valid old defaults",()=>{
  const app=read("./App.jsx"),sidebar=read("./ClassicSidebar.jsx"),hook=read("./use-site-promos.mjs");
  assert.match(app,/const promoSelection=useSitePromos\(\)/);
  assert.match(app,/<SidebarPromos side="left" selection=\{promoSelection\}/);
  assert.match(app,/<SidebarPromos side="right" selection=\{promoSelection\}/);
  assert.match(app,/<ProfileRefinement selection=\{promoSelection\}/);
  assert.match(sidebar,/resolvePromoUrl/);
  assert.match(sidebar,/rel="noopener noreferrer"/);
  assert.match(sidebar,/editorKey=\{"shell\.promo\."\+side\+"\."\+n\}/);
  assert.match(hook,/fetch\(url,/);
  assert.match(hook,/ogc-promos-updated/);
  assert.match(hook,/choosePromoCards\(cards\)/);
  assert.doesNotMatch(sidebar,/dangerouslySetInnerHTML|innerHTML/);
});

test("existing visual editor cannot overwrite text controlled by Promos",()=>{
  const model=read("./admin-ui-editor-model.mjs");
  const published=read("./PublishedUiDesign.jsx");
  assert.doesNotMatch(model,/label:side\+" promotion "/);
  assert.doesNotMatch(model,/label:"Profile refinement title"/);
  assert.match(model,/EDITOR_PROMO_AREAS/);
  assert.match(published,/EDITOR_TEXT_TARGETS/);
});

test("client's admin allowlist includes promo writes without weakening identity validation",()=>{
  const api=read("./member-gateway.mjs");
  assert.match(api,/const promos=\/\^\\\/admin\\\/promos/);
  assert.match(api,/editing\.test\(pathname\)\|\|uiDesign\.test\(pathname\)\|\|promos\.test\(pathname\)/);
  assert.match(api,/checkedMember\(session\?\.data\?\.user\)/);
});
