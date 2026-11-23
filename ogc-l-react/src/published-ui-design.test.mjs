import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=file=>readFileSync(new URL(file,import.meta.url),"utf8");

test("all visitors receive only a published design; frontend handles SPA pages",()=>{
  const app=source("./App.jsx");
  const loader=source("./PublishedUiDesign.jsx");
  const api=source("../../api/member-profile.ts");
  assert.match(app,/<PublishedUiDesign \/>/);
  assert.match(loader,/fetch\(origin\+"\/ui-design"/);
  assert.match(loader,/editorPreviewCss/);
  assert.match(loader,/MutationObserver/);
  assert.match(loader,/textContent=value/);
  assert.match(loader,/window\.document\.createElement\("section"\)/);
  assert.match(loader,/new URLSearchParams\(window\.location\.search\)/);
  assert.doesNotMatch(loader,/dangerouslySetInnerHTML|\.innerHTML\s*=/);
  assert.match(api,/handlePublicUiDesign\(request,pool,json\)/);
  assert.ok(api.indexOf('handlePublicUiDesign(request,pool,json)')<api.indexOf('const userId = await authenticatedUserId(request)'),
    "published style loads without member login");
});

test("editor's draft iframe cannot fight the live site's observer",()=>{
  const editor=source("./AdminUiEditor.jsx");
  const loader=source("./PublishedUiDesign.jsx");
  assert.match(editor,/search\.set\("ogc-ui-preview","1"\)/);
  assert.match(loader,/if\(isEditorPreview\)return/);
  assert.match(loader,/allowedPages\.has\(page\)/);
});

test("published blocks do not execute newly invented button actions",()=>{
  const loader=source("./PublishedUiDesign.jsx");
  assert.match(loader,/el\.disabled=true/);
  assert.match(loader,/el\.setAttribute\("href","#"\+block\.href\)/);
  assert.match(loader,/el\.textContent=block\.text/);
  assert.match(loader,/editorStyleEntries\(block\.style\)/);
  assert.match(loader,/document:sanitizeEditorDraft\(data\.document\)/);
});
