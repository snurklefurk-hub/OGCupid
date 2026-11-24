import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {COMPONENT_FAMILIES,COMPONENT_STATES,componentAreaId,componentCss,
  setComponentProperty,resetComponentState,sanitizeComponentStyle} from "./shared-ui-components.mjs";
import {blankEditorDraft,sanitizeEditorDraft,editorPreviewCss} from "./admin-ui-editor-model.mjs";
import {formatEditorCss,parseEditorCss} from "./admin-ui-editor-source.mjs";
const id=(family,state="normal")=>componentAreaId(family,state);
test("empty shared component settings do not alter the existing appearance",()=>{
  assert.equal(componentCss({}),"");
  assert.equal(editorPreviewCss(blankEditorDraft(),"/matches"),"");
});
test("all registered families and states have unique stable IDs",()=>{
  const ids=COMPONENT_FAMILIES.flatMap(f=>COMPONENT_STATES.map(s=>id(f.id,s.id)));
  assert.equal(new Set(ids).size,ids.length);
});
test("shared style survives public rendering and sanitization across pages",()=>{
  const draft=setComponentProperty(blankEditorDraft(),"button","normal","borderRadius",8);
  assert.deepEqual(sanitizeEditorDraft(draft),draft);
  for(const page of ["/matches","/settings","/questions"]){
    const css=editorPreviewCss(draft,page);
    assert.match(css,/border-radius:8px !important/);
    assert.match(css,/\.ogcl-app \.ogcl-sheet/);
    assert.match(css,/\.ogcl-admin \*/);
  }
});
test("component CSS accepts only fixed global area IDs, safe properties, and safe values",()=>{
  const raw=blankEditorDraft();
  raw.areas["*"]={[id("button")]:{borderRadius:5,color:"#FF0000",boxShadow:"0px 2px 4px 0px #00000055",
    backgroundImage:"linear-gradient(180deg, #ffffff, #cccccc)",display:"none",position:"fixed",content:"hidden"},
    [id("invented")]:{color:"#ffffff"}};
  raw.areas["/matches"]={[id("button")]:{color:"#112233"}};
  const clean=sanitizeEditorDraft(raw);
  assert.deepEqual(clean.areas["*"][id("button")],{borderRadius:5,color:"#ff0000",
    boxShadow:"0px 2px 4px 0px #00000055",backgroundImage:"linear-gradient(180deg, #ffffff, #cccccc)"});
  assert.equal(clean.areas["*"][id("invented")],undefined);
  assert.equal(clean.areas["/matches"],undefined);
  assert.deepEqual(sanitizeComponentStyle({backgroundImage:"url(https://bad.invalid)",
    boxShadow:"0px 1px 2px 0px #123456;}",color:"red;}body{display:none",width:"1000%"}),{});
  assert.throws(()=>setComponentProperty(raw,"button","normal","backgroundImage","url(x)"),/Invalid/);
});
test("named variants and instances have deterministic precedence independent of JSON key order",()=>{
  const global={[id("matches.search")]:{color:"#333333"},[id("button.primary")]:{color:"#222222"},
    [id("button")]:{color:"#111111"},[id("button","hover")]:{color:"#444444"}};
  const css=componentCss(global);
  assert.ok(css.indexOf("#111111")<css.indexOf("#222222"));
  assert.ok(css.indexOf("#222222")<css.indexOf("#444444"));
  assert.ok(css.indexOf("#444444")<css.indexOf("#333333"));
  assert.equal(css,componentCss(Object.fromEntries(Object.entries(global).reverse())));
  assert.match(css,/:hover/);
  assert.match(componentCss(global,true),/ogcl-component-preview/);
  assert.doesNotMatch(componentCss(global,true),/ogcl-app/);
});
test("resetting one instance keeps the global style and unrelated shell/page/text data",()=>{
  let draft=blankEditorDraft();
  draft.areas["*"]={brand:{borderRadius:9}};
  draft.areas["/matches"]={tabBar:{borderRadius:3}};
  draft=setComponentProperty(draft,"button","normal","borderRadius",8);
  draft=setComponentProperty(draft,"matches.search","normal","borderRadius",2);
  const next=resetComponentState(draft,"matches.search","normal");
  assert.equal(next.areas["*"][id("matches.search")],undefined);
  assert.equal(next.areas["*"][id("button")].borderRadius,8);
  assert.deepEqual(next.areas["*"].brand,{borderRadius:9});
  assert.deepEqual(next.areas["/matches"],draft.areas["/matches"]);
  assert.equal(draft.areas["*"][id("matches.search")].borderRadius,2);
});
test("existing UI Editor shell CSS round trip does not erase UI Components",()=>{
  const draft=setComponentProperty(blankEditorDraft(),"filter","normal","borderRadius",11);
  const result=parseEditorCss(formatEditorCss(draft,"*"),draft,"*");
  assert.deepEqual(result.areas["*"][id("filter")],{borderRadius:11});
});
test("Admin tab is adjacent to UI Editor and explicit page overrides have registered source targets",()=>{
  const read=name=>readFileSync(new URL(name,import.meta.url),"utf8");
  assert.match(read("AdminDashboard.jsx"),/"ui-editor","ui-components"/);
  assert.match(read("AdminDashboard.jsx"),/<AdminComponentEditor onUnsavedChange=/);
  const sources=read("MatchesView.jsx")+read("ProfileSettings.jsx");
  for(const f of COMPONENT_FAMILIES.filter(f=>f.instance))assert.ok(sources.includes('data-ogc-control-id="'+f.id+'"'),f.id);
});
