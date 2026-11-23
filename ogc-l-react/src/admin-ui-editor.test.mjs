import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  EDITOR_PAGES,EDITOR_AREAS,EDITOR_SHELL_AREAS,EDITOR_PAGE_AREAS,
  EDITOR_SCHEMA,editorAreaScope,blankEditorDraft,sanitizeEditorDraft,
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
  assert.equal(EDITOR_AREAS.some(area=>area.selector===".ogcl-center .ogcl-sheet"),true);
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
  assert.deepEqual(clean.areas["/matches"].pageTitle,{color:"#abcdef",padding:18});
  assert.deepEqual(clean.areas["/matches"].matchCard,{backgroundColor:"#abcdef"});
  assert.equal(clean.pages["/matches"].length,1);
  assert.equal(clean.pages["/unknown"],undefined);
  const css=editorPreviewCss(clean,"/matches");
  assert.match(css,/--okc-blue:#123456/);
  assert.match(css,/\.ogcl-sheet \.ogcl-view-head h1\{color:#abcdef;padding:18px;/);
  assert.doesNotMatch(css,/<script>|gridTemplateColumns|iframe|none|evil/);
  assert.equal(editorPreviewCss(clean,"/unknown"),"");
});

test("malformed styles and unknown draft versions are discarded",()=>{
  assert.deepEqual(sanitizeEditorDraft({version:99,areas:{}}),blankEditorDraft());
  const css=editorPreviewCss({version:1,areas:{"*":{centerSheet:{
    color:"red;body{display:none}",margin:-1,borderRadius:4
  }}}},"/matches");
  assert.equal(css,".ogcl-center .ogcl-sheet{border-radius:4px;}\n");
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

test("visual editor saves private server drafts and explicitly publishes revisions",()=>{
  const component=read("./AdminUiEditor.jsx");
  assert.match(component,/adminRequest\("\/admin\/ui-design"\)/);
  assert.match(component,/adminRequest\("\/admin\/ui-design","PUT"/);
  assert.match(component,/adminRequest\("\/admin\/ui-design\/publish","POST"/);
  assert.match(component,/adminRequest\("\/admin\/ui-design\/rollback","POST"/);
  assert.match(component,/expectedVersion:serverVersion/);
  assert.match(component,/Publish to live site/);
  assert.match(component,/window\.confirm/);
  assert.match(component,/setServerVersion\(null\)/);
  assert.match(component,/event\.preventDefault\(\);event\.stopPropagation\(\)/);
  assert.doesNotMatch(component,/dangerouslySetInnerHTML/);
  assert.match(read("./styles.css"),/grid-template-columns:184px minmax\(0,1fr\) 184px/);
});

test("shared Site Shell and center Page Content have disjoint selector scopes",()=>{
  assert.equal(EDITOR_SCHEMA,2);
  assert.equal(EDITOR_SHELL_AREAS.length+EDITOR_PAGE_AREAS.length,EDITOR_AREAS.length);
  assert.equal(editorAreaScope("leftRail"),"shell");
  assert.equal(editorAreaScope("brand"),"shell");
  assert.equal(editorAreaScope("accountLinks"),"shell");
  assert.equal(editorAreaScope("legalFooter"),"shell");
  assert.equal(editorAreaScope("pageTitle"),"page");
  assert.equal(editorAreaScope("contentPanel"),"page");
  assert.equal(editorAreaScope("madeUp"),null);
  const ids=new Set();
  for(const area of EDITOR_AREAS){
    assert.ok(!ids.has(area.id),"duplicate area id");
    ids.add(area.id);
  }
  for(const area of EDITOR_PAGE_AREAS)
    assert.ok(area.selector.startsWith(".ogcl-sheet "),"page rules must live inside the center sheet");
  for(const area of EDITOR_SHELL_AREAS)
    assert.ok(!area.selector.startsWith(".ogcl-sheet "),"shell selectors must never be per-page");
  assert.ok(EDITOR_SHELL_AREAS.some(a=>a.selector===".ogcl-center .ogcl-top-links"));
  assert.ok(EDITOR_SHELL_AREAS.some(a=>a.selector===".ogcl-center .ogcl-footer"));
});

test("page-specific shell changes are discarded, and never leak to any other page",()=>{
  const v2={
    version:EDITOR_SCHEMA,tokens:{},
    areas:{
      "*":{leftRail:{color:"#123456"},accountLinks:{fontSize:14},
        pageTitle:{color:"#777777"}},
      "/matches":{pageTitle:{color:"#654321"},mainContent:{padding:10},
        leftRail:{backgroundColor:"#ffffff"},legalFooter:{margin:40}},
      "/messages":{pageTitle:{color:"#abcdef"},brand:{margin:20}}
    },
    pages:{}
  };
  const cleaned=sanitizeEditorDraft(v2);
  assert.deepEqual(cleaned.areas["*"],{
    leftRail:{color:"#123456"},accountLinks:{fontSize:14}
  });
  assert.deepEqual(cleaned.areas["/matches"],{
    pageTitle:{color:"#654321"},mainContent:{padding:10}
  });
  assert.deepEqual(cleaned.areas["/messages"],{pageTitle:{color:"#abcdef"}});
  const matches=editorPreviewCss(v2,"/matches");
  const messages=editorPreviewCss(v2,"/messages");
  assert.match(matches,/\.ogcl-left\{color:#123456;\}/);
  assert.match(messages,/\.ogcl-left\{color:#123456;\}/);
  assert.match(matches,/\.ogcl-center \.ogcl-top-links\{font-size:14px;\}/);
  assert.match(messages,/\.ogcl-center \.ogcl-top-links\{font-size:14px;\}/);
  assert.match(matches,/\.ogcl-sheet \.ogcl-view-head h1\{color:#654321;\}/);
  assert.match(messages,/\.ogcl-sheet \.ogcl-view-head h1\{color:#abcdef;\}/);
  assert.doesNotMatch(matches,/#abcdef|leftRail\{|legalFooter\{|#ffffff/);
  assert.doesNotMatch(messages,/#654321/);
});

test("older saved drafts migrate without expanding one-page outer-column edits sitewide",()=>{
  const older={
    version:1,tokens:{"--okc-blue":"#445566"},
    areas:{
      "*":{siteBackground:{backgroundColor:"#123456"},
        mainContent:{padding:6},brand:{padding:11}},
      "/matches":{mainContent:{padding:12},leftRail:{backgroundColor:"#beef00"}},
      "/quickmatch":{rightRail:{backgroundColor:"#ab1234"}}
    },pages:{"/matches":[{id:"block-original",type:"paragraph",text:"Keep me"}]}
  };
  const migrated=sanitizeEditorDraft(older);
  assert.equal(migrated.version,EDITOR_SCHEMA);
  assert.deepEqual(migrated.areas["*"],{
    siteBackground:{backgroundColor:"#123456"},brand:{padding:11}
  });
  assert.deepEqual(migrated.areas["/matches"],{mainContent:{padding:12}});
  assert.deepEqual(migrated.areas["/quickmatch"],{mainContent:{padding:6}});
  assert.equal(migrated.pages["/matches"][0].text,"Keep me");
  const css=editorPreviewCss(older,"/matches");
  assert.match(css,/\.ogcl-left \.ogcl-brand\{padding:11px;\}/);
  assert.doesNotMatch(css,/#beef00|#ab1234/);
});

test("editor switches workspaces on preview selection but saves shell and page separately",()=>{
  const component=read("./AdminUiEditor.jsx");
  assert.match(component,/useState\("shell"\)/);
  assert.match(component,/chooseWorkspace\("shell"\)/);
  assert.match(component,/chooseWorkspace\("page"\)/);
  assert.match(component,/Site Shell <small>Shared across every page/);
  assert.match(component,/Page Content <small>Center column only/);
  assert.match(component,/editorAreaScope\(selected\.id\)===workspace/);
  assert.match(component,/setWorkspace\(editorAreaScope\(area\.id\)\)/);
  assert.match(component,/next\.areas\[areaScope\]/);
  assert.match(component,/workspace==="shell"&&<><h3>Global palette/);
  assert.match(component,/:before-shell-split/);
  assert.doesNotMatch(component,/scope==="global"/);
});
