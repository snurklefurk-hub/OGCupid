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
