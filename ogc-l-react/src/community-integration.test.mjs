import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const ui=read("./CommunityChat.jsx"),app=read("./App.jsx");
const gateway=read("./member-gateway.mjs");
const provider=read("./MemberSessionProvider.jsx");
const admin=read("./AdminDashboard.jsx"),reporter=read("./CommunityReportsAdmin.jsx");
test("Community is a single real chatroom and does not invent posts or presence",()=>{
  assert.match(app,/path="community" element=\{<MemberGate allowOnboarding><CommunityChat/);
  assert.match(ui,/communityRequest\("\/community"/);
  assert.match(ui,/role="log"/);
  assert.match(ui,/maxLength=\{500\}/);
  assert.match(ui,/type="text"/);
  assert.match(ui,/onSubmit=\{send\}/);
  assert.match(ui,/setInterval\(\(\)=>void load\(\),POLL_MS\)/);
  assert.match(ui,/document.visibilityState==="hidden"/);
  assert.doesNotMatch(ui,/dangerouslySetInnerHTML|localStorage|sessionStorage/);
  assert.doesNotMatch(ui,/faker|mocked messages/i);
});
test("Member requests use Neon JWT, never client-supplied identities or cookies",()=>{
  assert.match(gateway,/async function communityRequest/);
  assert.match(gateway,/checkedMember\(identity\?\.data\?\.user\)/);
  assert.match(gateway,/const jwt=await getJwt/);
  assert.match(gateway,/Authorization:"Bearer "\+jwt/);
  assert.match(gateway,/credentials:"omit",cache:"no-store"/);
  assert.match(provider,/communityRequest,\s*accountRequest/);
});
test("Chat reports enter the established administrator dashboard for explicit review",()=>{
  assert.match(ui,/communityRequest\("\/community\/"\+messageId\+"\/report"/);
  assert.match(admin,/<CommunityReportsAdmin\/>/);
  assert.match(reporter,/communityRequest\("\/community\/reports"\)/);
  assert.match(reporter,/action==="hide"&&!window.confirm/);
  assert.match(reporter,/action,reason:reason.trim\(\)/);
});
