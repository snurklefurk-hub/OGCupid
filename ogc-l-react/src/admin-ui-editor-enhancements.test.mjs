import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  EDITOR_VIEWPORTS,EDITOR_PROPERTIES,EDITOR_TEXT_TARGETS,
  editorTextTarget,blankEditorDraft,sanitizeEditorDraft,editorPreviewCss
} from "./admin-ui-editor-model.mjs";
import {
  editorColorValue,inspectEditorProperty,computedEditorSnapshot
} from "./admin-ui-editor-inspector.mjs";
const read=name=>readFileSync(new URL(name,import.meta.url),"utf8");

test("desktop resolution presets provide real CSS viewport dimensions",()=>{
  const presets=Object.fromEntries(EDITOR_VIEWPORTS.map(p=>[p.id,[p.width,p.height]]));
  assert.deepEqual(presets["1920"],[1920,1080]);
  assert.deepEqual(presets["2560"],[2560,1440]);
  assert.deepEqual(presets["3840"],[3840,2160]);
  assert.deepEqual(presets.editor,[1150,850]);
  const view=read("./AdminUiEditor.jsx");
  assert.match(view,/aria-label="Preview resolution"/);
  assert.match(view,/width:viewport\.width,height:viewport\.height/);
  assert.match(view,/viewport\.width\*scale,height:viewport\.height\*scale/);
  assert.match(view,/stage\.current\.clientWidth-24\)\/viewport\.width/);
  assert.match(view,/Math\.round\(scale\*100\)/);
});

test("read actual computed colors, fonts, spacing and radius for property inputs",()=>{
  assert.equal(editorColorValue("rgb(41, 99, 164)"),"#2963a4");
  assert.equal(editorColorValue("rgba(255, 0, 80, 1)"),"#ff0050");
  assert.equal(editorColorValue("rgba(0, 0, 0, 0)"),null);
  assert.equal(editorColorValue("rgba(0, 0, 0, 0.5)"),null);
  assert.equal(editorColorValue("not-a-color"),null);
  const style={
    backgroundColor:"rgb(255, 255, 255)",
    color:"rgb(85, 85, 85)",
    borderColor:"rgb(204, 204, 204)",
    fontSize:"26px",fontFamily:"Verdana, Geneva, sans-serif",
    fontWeight:"700",lineHeight:"29.7px",textAlign:"left",
    paddingTop:"20px",paddingRight:"18px",paddingBottom:"16px",paddingLeft:"18px",
    marginTop:"0px",marginRight:"0px",marginBottom:"0px",marginLeft:"0px",
    borderTopLeftRadius:"3px",borderWidth:"1px",borderStyle:"solid"
  };
  const values=computedEditorSnapshot(style,EDITOR_PROPERTIES);
  assert.equal(values.backgroundColor.value,"#ffffff");
  assert.equal(values.color.value,"#555555");
  assert.equal(values.fontSize.value,26);
  assert.equal(values.fontFamily.value,"Verdana");
  assert.equal(values.fontWeight.value,"700");
  assert.equal(values.lineHeight.value,29.7);
  assert.equal(values.paddingTop.value,20);
  assert.equal(values.paddingRight.value,18);
  assert.equal(values.paddingBottom.value,16);
  assert.equal(values.borderRadius.value,3);
  assert.equal(values.borderWidth.value,1);
  assert.equal(values.borderStyle.value,"solid");
  const transparent=inspectEditorProperty({backgroundColor:"rgba(0, 0, 0, 0)"},
    EDITOR_PROPERTIES.find(p=>p.key==="backgroundColor"));
  assert.equal(transparent.value,"");
  assert.equal(transparent.raw,"rgba(0, 0, 0, 0)");
});

test("draft text only accepts fixed static content target IDs in correct scope",()=>{
  assert.equal(editorTextTarget("shell.account.signout","/matches")?.scope,"shell");
  assert.equal(editorTextTarget("page.heading","/matches")?.scope,"page");
  assert.equal(editorTextTarget("page.heading","/profile"),null);
  assert.equal(editorTextTarget("member.private.message","/matches"),null);
  assert.equal(editorTextTarget("shell.public.ogtrends","/admin")?.scope,"shell");
  assert.equal(editorTextTarget("shell.footer.ogtrends","/admin")?.scope,"shell");
  const raw={
    version:2,
    tokens:{},areas:{},pages:{},
    texts:{
      "*":{
        "shell.nav.matches":"Find matches",
        "shell.account.signout":"Leave site",
        "page.heading":"Mis-scoped heading",
        "shell.footer.disclaimer":"Test <img src=x onerror=alert(1)>"
      },
      "/matches":{
        "page.heading":"Browse all members",
        "page.intro":"Publicly visible intro",
        "shell.nav.matches":"Mis-scoped navigation",
        "member.private.message":"Secret"
      },
      "/profile":{"page.heading":"Dynamic profile"},
      "/unknown":{"page.heading":"Unknown"}
    }
  };
  const clean=sanitizeEditorDraft(raw);
  assert.deepEqual(Object.keys(clean.texts["*"]).sort(),[
    "shell.account.signout","shell.footer.disclaimer","shell.nav.matches"
  ]);
  assert.deepEqual(clean.texts["/matches"],{
    "page.heading":"Browse all members",
    "page.intro":"Publicly visible intro"
  });
  assert.equal(clean.texts["/profile"],undefined);
  assert.equal(clean.texts["/unknown"],undefined);
  assert.equal(clean.texts["*"]["shell.footer.disclaimer"],"Test <img src=x onerror=alert(1)>");
  assert.deepEqual(sanitizeEditorDraft({version:2}),blankEditorDraft());
  const bad=sanitizeEditorDraft({version:2,texts:{
    "*":{"shell.nav.matches":"Hi\n<script>"},"/matches":{"page.heading":"a".repeat(1000)}
  }});
  assert.deepEqual(bad.texts,{});
});

test("editor renders draft text with textContent, never as HTML or changed URLs",()=>{
  const app=read("./App.jsx");
  const sidebar=read("./ClassicSidebar.jsx");
  const editor=read("./AdminUiEditor.jsx");
  assert.match(app,/data-ogc-edit-text=\{"shell\.nav\."\+path\.slice\(1\)\}/);
  assert.match(app,/data-ogc-edit-text="shell\.footer\.disclaimer"/);
  assert.match(app,/data-ogc-edit-text="shell\.account\.signout"/);
  assert.match(sidebar,/editorKey=\{"shell\.promo\."\+side\+"\."\+n\}/);
  assert.match(sidebar,/data-ogc-edit-text=\{editorKey\?editorKey\+"\.body":undefined\}/);
  assert.match(editor,/element\.textContent=text/);
  assert.match(editor,/data-ogc-editor-original-text/);
  assert.match(editor,/setSelected\(\{kind:"text",id:textTarget\.id\}\)/);
  assert.match(editor,/Edit text ·/);
  assert.match(editor,/Restore original text/);
  assert.match(editor,/Style this region/);
  assert.match(editor,/setAvailableText\(/);
  assert.match(editor,/readStored\(storageKey/);
  assert.doesNotMatch(editor,/dangerouslySetInnerHTML|innerHTML\s*=/);
  const selectors=EDITOR_TEXT_TARGETS.filter(t=>t.scope==="page");
  assert.ok(selectors.every(t=>t.selector.startsWith(".ogcl-sheet ")));
  assert.ok(EDITOR_TEXT_TARGETS.every(t=>t.max<=500));
});

test("new text and detailed numeric properties remain safe in saved drafts",()=>{
  const result=sanitizeEditorDraft({version:2,
    areas:{"*":{leftRail:{marginTop:20,paddingTop:9.5}},
      "/matches":{pageTitle:{paddingTop:20,paddingRight:18,
        paddingBottom:16,paddingLeft:18,fontWeight:"700",
        textAlign:"center",borderStyle:"dashed",borderWidth:2.5}}},
    texts:{"*":{"shell.nav.matches":"New label"}}
  });
  assert.deepEqual(result.areas["*"].leftRail,{paddingTop:9.5});
  assert.equal(result.areas["/matches"].pageTitle.paddingRight,18);
  assert.equal(result.areas["/matches"].pageTitle.fontWeight,"700");
  assert.equal(result.areas["/matches"].pageTitle.borderWidth,2.5);
  const css=editorPreviewCss(result,"/matches");
  assert.match(css,/padding-top:20px;padding-right:18px;padding-bottom:16px;padding-left:18px/);
  assert.match(css,/border-style:dashed;border-width:2.5px/);
  assert.doesNotMatch(css,/margin-top:20px/);
  assert.doesNotMatch(css,/New label/);
});
