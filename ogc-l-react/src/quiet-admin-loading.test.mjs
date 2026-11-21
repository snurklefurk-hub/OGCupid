import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(new URL(file,import.meta.url),"utf8");
const provider=read("./MemberSessionProvider.jsx");
const gateway=read("./member-gateway.mjs");
const dashboard=read("./AdminDashboard.jsx");
const editor=read("./AdminMemberEditor.jsx");

test("focus/visibility uses quiet revalidation without clearing or reloading active member state",()=>{
  assert.match(provider,/refresh\(\{quiet:true\}\)/);
  assert.match(provider,/quiet \? await gateway\.revalidate\(\) : await gateway\.loadIdentity\(\)/);
  assert.match(provider,/if\(quiet\)quietCheckInFlight\.current=true/);
  assert.match(provider,/if\(result\.user\?\.id!==previous\.user\?\.id\)/);
  assert.match(provider,/kind:"guest", error:"Your previous session expired/);
  assert.match(provider,/else if\(!quiet\)/);
  assert.match(gateway,/async revalidate\(\)/);
  assert.match(gateway,/readApi\("\/onboarding",jwt\)/);
});

test("admin tabs defer member and report reads and only refresh their section",()=>{
  assert.match(dashboard,/if\(section==="members"\)/);
  assert.match(dashboard,/else if\(section==="reports"\)/);
  assert.match(dashboard,/loadedTabs\.current\.has\(tab\)/);
  assert.match(dashboard,/pendingTabs\.current\.has\(tab\)/);
  assert.match(dashboard,/await loadSection\(section,q\)/);
  assert.doesNotMatch(dashboard,/loadAll\(/);
  const initial=dashboard.slice(dashboard.indexOf("useEffect(()=>{"),dashboard.indexOf("  async function reload("));
  assert.match(initial,/adminRequest\("\/admin"\)/);
  assert.match(initial,/tab,summary,query,loadSection/);
});

test("admin editor saves local confirmed data without reloading photos or question bank",()=>{
  assert.match(editor,/if\(tab!=="questions"\|\|bank\.length\)return/);
  assert.match(editor,/if\(tab!=="photos"\|\|!content\)return/);
  assert.match(editor,/const result=await work\(\);/);
  assert.match(editor,/applyResult\(result\)/);
  assert.equal((editor.match(/setRevision\(/g)||[]).length,1);
  assert.match(editor,/updatePreview\(id,jpeg\)/);
  assert.match(editor,/removePreview\(photo\.id\)/);
  assert.match(editor,/URL\.revokeObjectURL/);
  assert.doesNotMatch(editor,/setRevision\(n=>n\+1\);\s*\}catch/);
});
