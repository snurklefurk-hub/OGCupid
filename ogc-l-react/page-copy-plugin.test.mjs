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
