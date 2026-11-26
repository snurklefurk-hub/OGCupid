import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const entry = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const provider = readFileSync(new URL("./MemberSessionProvider.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("one persistent session provider wraps all routed member views",()=>{
  assert.match(entry, /<BrowserRouter\b[^>]*>\s*<MemberSessionProvider>\s*<App\s*\/>/);
  assert.match(provider, /const version = useRef\(0\)/);
  assert.match(provider, /setSession\(blank\)/);
});

test("member routes and sidebar navigation are both gated on verified membership",()=>{
  assert.match(app, /kind === "member"/);
  assert.match(app, /<MemberGate><MatchesView Photo=\{MemberPhoto\}/);
  assert.match(app, /<MemberGate><PreviewView/);
  assert.match(app, /ogcl-locked/);
});

test("onboarding, registration, recovery and account actions live inside React",()=>{
  assert.match(app, /<Route path="onboarding" element=\{<Navigate to="\/home" replace\/>\}/);
  assert.match(app, /<Route path="join" element=\{<JoinForm/);
  assert.match(app, /<Route path="recover" element=\{<RecoveryForm/);
  assert.match(app, /<Route path="account" element=\{<AccountManagement/);
  assert.match(app, /<MemberGate allowOnboarding><MatchQuestions/);
  assert.match(app, /type="password"/);
  assert.match(app, /form\.elements\.password\.value = ""/);
  assert.doesNotMatch(app, /legacyHref\("\/account/);
});

test("sign-out clears private state before backend confirmation",()=>{
  assert.match(provider, /const current = \+\+version\.current;\s*clearSearchCache\(\);setSession\(blank\); \/\/ Conceal member information/);
  assert.match(provider, /Sign-out could not be confirmed/);
});

test("every route uses the same edge-locked three-column desktop shell and native scrolling",()=>{
  assert.match(css, /\.ogcl-app \{[^}]*grid-template-columns:184px minmax\(0,1fr\) 184px;\s*width:100%;\s*min-height:100vh;\s*margin:0;/);
  assert.doesNotMatch(css, /\.ogcl-app \{[^}]*width:1150px|\.ogcl-app \{[^}]*margin:0 auto/);
  assert.equal([...css.matchAll(/\.ogcl-app\b/g)].length,1);
  assert.match(css, /\.ogcl-left, \.ogcl-right \{height:auto;overflow:visible/);
  assert.match(css, /\.ogcl-center \{height:auto;[^}]*overflow:visible/);
  assert.doesNotMatch(css, /height:100dvh|\.ogcl-center \{[^}]*overflow:auto/);
  assert.match(app, /<LeftRail\s+promoSelection=\{promoSelection\}\s*\/>\s*<main[^>]*>[^]*<Suspense[^]*?<Outlet\s*\/><\/Suspense>[^]*?<\/main>\s*<RightRail\s+promoSelection=\{promoSelection\}\s*\/>\s*<\/div>/);
  assert.match(app, /const promoSelection=useSitePromos\(\)/);
  assert.equal([...app.matchAll(/<RightRail\b/g)].length,1);
  assert.match(app, /<Routes>\s*<Route element=\{<AppShell\s*\/>\}>/);
});

test("React gateway does not persist bearer tokens or account data in browser storage",()=>{
  assert.doesNotMatch(provider, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(provider, /setItem\s*\(/);
  assert.match(provider, /createAuthClient\(/);
});
