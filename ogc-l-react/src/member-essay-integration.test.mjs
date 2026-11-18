import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read = name => readFileSync(new URL(name, import.meta.url),"utf8");
const gateway = read("./member-gateway.mjs");
const provider = read("./MemberSessionProvider.jsx");
const app = read("./App.jsx");
const editor = read("./ProfileEditor.jsx");

test("signed-in only native About route uses a verified member session",()=>{
  assert.match(app,/<Route path="profile" element=\{<MemberGate><ProfileEditor \/><\/MemberGate>\}/);
  assert.match(provider,/getMemberAvatar,\s*loadOwnEssays, saveOwnEssay/);
  assert.match(gateway,/checkedMember\(sessionResult\?\.data\?\.user\)/);
  assert.match(gateway,/safeEssayProfile\(await readApi\("\/profile",jwt\),user.id\)/);
});
test("one essay save re-reads authoritative values and uses PUT with JWT",()=>{
  assert.match(gateway,/const current = safeEssayProfile\(await readApi\("\/profile",jwt\),user.id\)/);
  assert.match(gateway,/const update = composeEssayUpdate\(current,key,draft\)/);
  assert.match(gateway,/method:"PUT", credentials:"omit", cache:"no-store"/);
  assert.match(gateway,/Authorization:"Bearer "\+jwt/);
  assert.match(gateway,/body:JSON.stringify\(update\)/);
  assert.doesNotMatch(provider,/localStorage|sessionStorage|indexedDB/);
});
test("editor has independent Save, Cancel, error feedback and controlled limits",()=>{
  assert.match(editor,/LIVE_ESSAYS\.map/);
  assert.match(editor,/await saveOwnEssay\(active,draft\)/);
  assert.match(editor,/maxLength=\{essay.max\}/);
  assert.match(editor,/Saving…/);
  assert.match(editor,/Cancel/);
  assert.match(editor,/your draft is still here/);
  assert.doesNotMatch(editor,/dangerouslySetInnerHTML/);
});
