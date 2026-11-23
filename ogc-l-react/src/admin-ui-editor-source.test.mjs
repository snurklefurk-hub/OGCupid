import test from "node:test";
import assert from "node:assert/strict";
import {blankEditorDraft,editorPreviewCss,sanitizeEditorDraft} from "./admin-ui-editor-model.mjs";
import {formatEditorCss,parseEditorCss,parseEditorJson} from "./admin-ui-editor-source.mjs";

const source = () => sanitizeEditorDraft({
  ...blankEditorDraft(),
  tokens:{"--okc-blue":"#123456"},
  areas:{
    "*":{leftRail:{color:"#abcdef",padding:10,paddingTop:15}},
    "/matches":{pageTitle:{fontSize:24,fontWeight:"700"}},
    "/messages":{mainContent:{padding:9.5}},
  },
  pages:{"/matches":[{id:"block-notice",type:"notice",text:"Welcome",style:{}}]},
  texts:{"/matches":{"page.heading":"Matches nearby"}},
});

test("visual styles round trip through the CSS editor for each scope",()=>{
  const initial = source();
  for(const scope of ["*","/matches","/messages"]){
    const css = formatEditorCss(initial,scope);
    assert.deepEqual(parseEditorCss(css,initial,scope),initial);
  }
  assert.match(formatEditorCss(initial,"*"),/padding: 10px;\n  padding-top: 15px/);
  assert.match(formatEditorCss(initial,"/matches"),/font-weight: 700;/);
});

test("page header minimum height round trips through scoped CSS",()=>{
  const page="/matches";
  const selector=".ogcl-sheet .ogcl-view-head";
  const draft=parseEditorCss(selector+" { min-height: 90px; }",blankEditorDraft(),page);
  assert.deepEqual(draft.areas[page],{pageHeader:{minHeight:90}});
  assert.match(formatEditorCss(draft,page),/min-height: 90px;/);
  assert.match(editorPreviewCss(draft,page),/\.ogcl-view-head\{min-height:90px;/);
  assert.doesNotMatch(editorPreviewCss(draft,"/messages"),/min-height:/);
  assert.throws(()=>parseEditorCss(selector+" { min-height: 8193px; }",draft,page),/out of range/);
  assert.throws(()=>parseEditorCss(".ogcl-left { min-height: 90px; }",draft,"*"),/unavailable/);
});

test("main navigation style edits affect all five buttons while preserving labels and unrelated overrides",()=>{
  const draft=blankEditorDraft();
  const selector=".ogcl-left .ogcl-nav-link";
  const legacy='.ogcl-left .ogcl-nav-link[data-ogc-nav="messages"]';
  draft.areas["*"]={"shell.nav.messages":{borderRadius:3,color:"#123456"},"shell.nav.visitors":{borderTopLeftRadius:2}};
  draft.texts["*"]={"shell.nav.messages":"Inbox"};
  const css=formatEditorCss(draft,"*");
  assert.deepEqual(parseEditorCss(css,draft,"*"),draft);
  const corner=parseEditorCss(css.replace(selector+" {",selector+" { border-top-left-radius: 8px;"),draft,"*");
  assert.equal(corner.areas["*"]["shell.nav.messages"].borderTopLeftRadius,8);
  assert.equal(corner.areas["*"].mainNavLinks.borderTopLeftRadius,8);
  const updated=parseEditorCss(css.replace(selector+" {",selector+" {\n  border-radius: 9px;"),draft,"*");
  assert.deepEqual(updated.areas["*"],{mainNavLinks:{borderRadius:9},"shell.nav.messages":{color:"#123456"}});
  assert.deepEqual(updated.texts,draft.texts);
  assert.ok(editorPreviewCss(updated,"/matches").includes(selector+"{border-radius:9px;}"));
  const next=parseEditorCss(formatEditorCss(updated,"*").replace("#123456","#654321"),updated,"*");
  assert.deepEqual(next.areas["*"],{mainNavLinks:{borderRadius:9,color:"#654321"}});
  const raw=structuredClone(next);
  delete raw.areas["*"].mainNavLinks.borderRadius;
  assert.deepEqual(parseEditorJson(JSON.stringify(raw),next),raw);
  assert.throws(()=>parseEditorCss(selector+" { color: #aaaaaa; }\n"+legacy+" { color: #bbbbbb; }",draft,"*"),/Choose one color/);
});

test("CSS edits update the published model and can clear a scope",()=>{
  const initial = source();
  const text = "/* Header override */\n.ogcl-sheet .ogcl-view-head h1 {\n  color: #AA3344;\n  font-size: 27.5px\n}";
  const updated = parseEditorCss(text,initial,"/matches");
  assert.deepEqual(updated.areas["/matches"],{pageTitle:{color:"#aa3344",fontSize:27.5}});
  assert.deepEqual(updated.areas["*"],initial.areas["*"]);
  assert.deepEqual(updated.areas["/messages"],initial.areas["/messages"]);
  assert.deepEqual(updated.pages,initial.pages);
  assert.deepEqual(updated.texts,initial.texts);
  assert.match(editorPreviewCss(updated,"/matches"),/color:#aa3344;font-size:27.5px/);
  assert.equal(parseEditorCss("",updated,"/matches").areas["/matches"],undefined);
  assert.deepEqual(parseEditorCss(":root { --okc-blue: #987654; }",updated,"*").tokens,{"--okc-blue":"#987654"});
});

test("CSS input rejects unsupported values, layout changes and existing fields in the wrong scope",()=>{
  const current = source();
  for(const css of [
    ".ogcl-left { color: #123456; }",
    ".ogcl-sheet .ogcl-view-head h1 { position: absolute; }",
    ".ogcl-sheet .ogcl-view-head h1 { font-size: 300px; }",
    ".ogcl-sheet .ogcl-view-head h1 { color: #123456 !important; }",
    ".ogcl-sheet .ogcl-view-head h1 { color: red; }",
    ".ogcl-sheet .ogcl-view-head h1 { color: #123456; color: #654321; }",
    ".ogcl-sheet .ogcl-view-head h1 { padding: 0;",
  ]) assert.throws(()=>parseEditorCss(css,current,"/matches"),/^Error: Line 1\./);
  assert.throws(()=>parseEditorCss("/* first */\n.ogcl-left {\n margin: 10px;\n}",current,"*"),/Line 3\./);
  assert.throws(()=>parseEditorCss(":root { --unspecified: #000000; }",current,"*"),/Unsupported/);
  assert.deepEqual(current,source());
});

test("Design JSON can edit static copy and blocks and validates without silently discarding input",()=>{
  const initial = source();
  assert.deepEqual(parseEditorJson(JSON.stringify(initial)),initial);
  initial.pages["/matches"][0].text="A new notice";
  initial.texts["/matches"]["page.heading"]="People nearby";
  assert.equal(parseEditorJson(JSON.stringify(initial)).pages["/matches"][0].text,"A new notice");
  initial.areas["/matches"].leftRail={color:"#335577"};
  assert.throws(()=>parseEditorJson(JSON.stringify(initial)),/design\.areas\.\/matches\.leftRail/);
  assert.throws(()=>parseEditorJson('{"version":99}'),/schema version/);
  assert.throws(()=>parseEditorJson("{"),Error);
});

test("card dimensions, negative margins, gaps, fill and corner overrides round trip",()=>{
  const selector='.ogcl-right .ogcl-editorial-card[data-ogc-card="shell.promo.right.1"]';
  const css=selector+" { width: 72.5%; height: 60px; margin-top: -3px; border-radius: 7px; border-top-left-radius: 0; background-color: transparent; background-image: none; }";
  const draft=parseEditorCss(css,blankEditorDraft(),"*");
  assert.deepEqual(parseEditorCss(formatEditorCss(draft,"*"),draft,"*"),draft);
  assert.match(editorPreviewCss(draft,"/messages"),/width:72.5%;height:60px;margin-top:-3px;/);
  assert.deepEqual(draft.areas["*"]["shell.promo.right.1"].borderTopLeftRadius,0);
  for(const value of ["101%","-2%","url(x)","0%; color: red"]){
    assert.throws(()=>parseEditorCss(selector+" { width: "+value+"; }",draft,"*"));
  }
  assert.throws(()=>parseEditorCss(".ogcl-right { width: 60%; }",draft,"*"));
  const layout=parseEditorCss(".ogcl-left .ogcl-main-nav { row-gap: 9px; }",draft,"*");
  assert.equal(layout.areas["*"].navSpacing.rowGap,9);
  assert.throws(()=>parseEditorCss(".ogcl-left .ogcl-main-nav { background-color: #ffffff; }",draft,"*"));
});
