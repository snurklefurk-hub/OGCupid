import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compilePageCopy} from "./page-copy-plugin.mjs";

test("Quickmatch’s entire compatibility note has one stable editable ID",()=>{
  const file="QuickmatchView.jsx";
  const src=readFileSync(new URL("./src/"+file,import.meta.url),"utf8");
  const {entries,code}=compilePageCopy(src,file);
  const note="Match percentages are based on real saved question answers. Friend and Enemy percentages aren't calculated yet.";
  const target=entries.find(entry=>entry.source===note);
  assert.ok(target);assert.deepEqual(target.pages,["/quickmatch"]);
  assert.ok(code.includes('data-ogc-edit-text="'+target.id+'"'));
  assert.equal(compilePageCopy("\n"+src,file).entries.find(entry=>entry.source===note).id,target.id);
});
test("profile content and values rendered from members do not become page copy",()=>{
  assert.equal(compilePageCopy("","PublicMemberProfile.jsx"),null);
  const src="function Chat(){return <p>{message.body}<strong>Reply</strong></p>}";
  const result=compilePageCopy(src,"CommunityChat.jsx");
  assert.deepEqual(result.entries.map(e=>e.source),["Reply"]);
  assert.ok(result.code.includes("{message.body}"));
});

test("the saved Quickmatch replacement renders and Reset restores the original paragraph",async()=>{
  const {applySitePageCopy}=await import("./src/site-page-copy.mjs");
  const {blankEditorDraft,sanitizeEditorDraft}=await import("./src/admin-ui-editor-model.mjs");
  const src=readFileSync(new URL("./src/QuickmatchView.jsx",import.meta.url),"utf8");
  const entry=compilePageCopy(src,"QuickmatchView.jsx").entries.find(item=>item.source.startsWith("Match percentages are based"));
  const el={children:[],textContent:entry.source,getAttribute:()=>entry.id};
  const root={querySelectorAll:()=>[el]};
  const draft=blankEditorDraft();
  draft.texts["/quickmatch"]={[entry.id]:"Your answers determine your match score."};
  applySitePageCopy(root,sanitizeEditorDraft(JSON.parse(JSON.stringify(draft))),"/quickmatch");
  assert.equal(el.textContent,"Your answers determine your match score.");
  applySitePageCopy(root,blankEditorDraft(),"/quickmatch");
  assert.equal(el.textContent,entry.source);
});
