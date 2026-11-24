import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
const dash=readFileSync(new URL("./AdminDashboard.jsx",import.meta.url),"utf8");
const provider=readFileSync(new URL("./MemberSessionProvider.jsx",import.meta.url),"utf8");
const gateway=readFileSync(new URL("./member-gateway.mjs",import.meta.url),"utf8");
const css=readFileSync(new URL("./admin.css",import.meta.url),"utf8");
test("admin page is member-gated, and navigation appears after server confirmation",()=>{
  assert.match(app,/<AdminGate><AdminDashboard/);
  assert.match(app,/kind==="onboarding"\?children:<MemberGate>/);
  assert.match(app,/adminRequest\("\/admin"\)\.then/);
  assert.match(app,/return allowed\?<NavLink[^>]*to="\/admin">Admin/);
  assert.doesNotMatch(app,/snurklefurk@gmail\.com/);
});
test("admin gateway uses the live Neon JWT and no local authority claim",()=>{
  assert.match(gateway,/async adminRequest\(path,method="GET",payload=null\)/);
  assert.match(gateway,/const jwt=await getJwt/);
  assert.match(gateway,/Authorization:"Bearer "\+jwt/);
  assert.match(gateway,/response\.status===403/);
  assert.match(provider,/adminRequest=useCallback/);
  assert.doesNotMatch(dash,/localStorage|sessionStorage|adminPassword/);
});
test("moderation actions are explicit, require reason, and confirm punitive choices",()=>{
  for(const action of ["start_review","dismiss","warn","suspend_24h","suspend_7d","suspend_30d","ban"]){
    assert.ok(dash.includes('"'+action+'"'));
  }
  assert.match(dash,/window\.confirm/);
  assert.match(dash,/reason\.trim\(\)\.length<8/);
  assert.match(dash,/adminRequest\("\/admin\/reports\/"\+evidence\.id\+"\/action","POST"/);
  assert.match(dash,/Reporters are not disclosed to reported members/);
});
test("member table, real metrics, evidence and audit are integrated, without fake content",()=>{
  for(const label of ["Member accounts","Reported messages","Conversation evidence",
    "Recent moderation actions","Completed onboarding","Private messages","Search name or email"]){
    assert.ok(dash.includes(label),label);
  }
  assert.match(dash,/summary\.recentActions/);
  assert.match(dash,/evidence\.messages/);
  assert.match(css,/grid-template-columns/);
  assert.match(css,/@media\(max-width:600px\)/);
});

test("Admin → Members shows the recorded last activity under account status",()=>{
  assert.match(dash,/<th>Status<\/th>/);
  assert.match(dash,/<td><span>\{m\.banned\?/);
  assert.match(dash,/<small>Last activity: \{m\.lastActivityAt\?stamp\(m\.lastActivityAt\):"No activity recorded"\}<\/small>/);
  const migration=readFileSync(new URL("../../db/migrations/036_admin_member_last_activity.sql",import.meta.url),"utf8");
  assert.match(migration,/CREATE OR REPLACE FUNCTION app_private\.admin_members\(/);
  assert.match(migration,/app_private\.admin_is_authorized\(\)/);
  assert.match(migration,/'lastActivityAt',activity\.last_seen_at/);
  assert.match(migration,/LEFT JOIN app_private\.member_activity activity ON activity\.user_id=u\.id/);
  assert.match(migration,/LEFT JOIN app_private\.member_onboarding o ON o\.user_id=u\.id/);
  assert.doesNotMatch(migration,/GRANT .* TO PUBLIC|GRANT .* TO ogcupid_member_api|CREATE TABLE|INSERT INTO/);
});
