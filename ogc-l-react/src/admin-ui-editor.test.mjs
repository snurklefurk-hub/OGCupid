import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  EDITOR_PAGES,EDITOR_AREAS,blankEditorDraft,sanitizeEditorDraft,
  editorPreviewCss,moveEditorBlock
} from "./admin-ui-editor-model.mjs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("visual editor is inside the existing administrator-gated dashboard",()=>{
  const dashboard=read("./AdminDashboard.jsx");
  assert.match(dashboard,/const AdminUiEditor=React\.lazy\(/);
  assert.match(dashboard,/"audit","ui-editor"/);
  assert.match(dashboard,/tab==="ui-editor"&&<React\.Suspense/);
  assert.match(dashboard,/if\(denied\)return/);
  assert.match(dashboard,/if\(!summary\)return/);
  assert.match(read("./App.jsx"),/<Route path="admin" element=\{<AdminGate><AdminDashboard \/><\/AdminGate>\}/);
});

test("draft only exposes supported routes, editable selectors and bounded block types",()=>{
  assert.equal(EDITOR_PAGES.every(page=>page.path.startsWith("/")),true);
  assert.equal(EDITOR_AREAS.some(area=>area.selector===".ogcl-left"),true);
  assert.equal(EDITOR_AREAS.some(area=>area.selector===".ogcl-right"),true);
  assert.equal(EDITOR_AREAS.some(area=>area.selector===".ogcl-sheet"),true);
  const input={
    version:1,
    tokens:{"--okc-blue":"#123456","--evil":"red"},
    areas:{"*":{pageTitle:{color:"#abcdef",padding:18,gridTemplateColumns:"none"}},
      "/matches":{matchCard:{backgroundColor:"#abcdef",fontSize:3000}}},
    pages:{"/matches":[
      {id:"block-safe",type:"heading",text:"Hello <script>alert(1)</script>"},
      {id:"block-bad",type:"iframe",text:"untrusted"},
      {id:"block-safe",type:"paragraph",text:"duplicate"}
    ],"/unknown":[{id:"block-illegal",type:"heading",text:"no"}]}
  };
  const clean=sanitizeEditorDraft(input);
  assert.deepEqual(clean.tokens,{"--okc-blue":"#123456"});
  assert.deepEqual(clean.areas["*"].pageTitle,{color:"#abcdef",padding:18});
  assert.deepEqual(clean.areas["/matches"].matchCard,{backgroundColor:"#abcdef"});
  assert.equal(clean.pages["/matches"].length,1);
  assert.equal(clean.pages["/unknown"],undefined);
  const css=editorPreviewCss(clean,"/matches");
  assert.match(css,/--okc-blue:#123456/);
  assert.match(css,/\.ogcl-view-head h1\{color:#abcdef;padding:18px;/);
  assert.doesNotMatch(css,/<script>|gridTemplateColumns|iframe|none|evil/);
  assert.equal(editorPreviewCss(clean,"/unknown"),"");
});

test("malformed styles and unknown draft versions are discarded",()=>{
  assert.deepEqual(sanitizeEditorDraft({version:2,areas:{}}),blankEditorDraft());
  const css=editorPreviewCss({version:1,areas:{"*":{centerSheet:{
    color:"red;body{display:none}",margin:-1,borderRadius:4
  }}}},"/matches");
  assert.equal(css,".ogcl-sheet{border-radius:4px;}\n");
  assert.ok(!css.includes("display:none"));
});

test("page-builder block ordering is stable, bounded and supports keyboard fallback",()=>{
  const list=[{id:"block-a"},{id:"block-b"},{id:"block-c"}];
  const moved=moveEditorBlock(list,0,2);
  assert.deepEqual(moved.map(x=>x.id),["block-b","block-c","block-a"]);
  assert.deepEqual(list.map(x=>x.id),["block-a","block-b","block-c"]);
  assert.equal(moveEditorBlock(list,-1,2),list);
  const component=read("./AdminUiEditor.jsx");
  assert.match(component,/draggable/);
  assert.match(component,/onDrop=\{event=>/);
  assert.match(component,/title="Move up"/);
  assert.match(component,/title="Move down"/);
  assert.match(component,/onClick=\{addBlock\}/);
  assert.match(component,/setSelected\(\{kind:"area"/);
});

test("visual editor remains a private browser draft and cannot silently publish",()=>{
  const component=read("./AdminUiEditor.jsx");
  assert.match(component,/window\.localStorage\.setItem/);
  assert.match(component,/Draft saved to this browser only/);
  assert.match(component,/Publishing to all visitors is not enabled yet/);
  assert.match(component,/event\.preventDefault\(\);event\.stopPropagation\(\)/);
  assert.doesNotMatch(component,/adminRequest|fetch\(|dangerouslySetInnerHTML/);
  assert.match(read("./styles.css"),/grid-template-columns:184px minmax\(0,1fr\) 184px/);
});
