import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const entry = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const provider = readFileSync(new URL("./MemberSessionProvider.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("one persistent session provider wraps all routed member views",()=>{
  assert.match(entry, /<HashRouter>\s*<MemberSessionProvider>\s*<App\s*\/>/);
  assert.match(provider, /const version = useRef\(0\)/);
  assert.match(provider, /setSession\(blank\)/);
});

test("member routes and sidebar navigation are both gated on verified membership",()=>{
  assert.match(app, /kind === "member"/);
  assert.match(app, /<MemberGate><MemberDirectory/);
  assert.match(app, /<MemberGate><PreviewView/);
  assert.match(app, /ogcl-locked/);
});

test("onboarding, registration, recovery and account actions live inside React",()=>{
  assert.match(app, /<Route path="onboarding" element=\{<Onboarding/);
  assert.match(app, /<Route path="join" element=\{<JoinForm/);
  assert.match(app, /<Route path="recover" element=\{<RecoveryForm/);
  assert.match(app, /<Route path="account" element=\{<AccountManagement/);
  assert.match(app, /<MemberGate allowOnboarding><MatchQuestions/);
  assert.match(app, /type="password"/);
  assert.match(app, /form\.elements\.password\.value = ""/);
  assert.doesNotMatch(app, /legacyHref\("\/account/);
});

test("sign-out clears private state before backend confirmation",()=>{
  assert.match(provider, /const current = \+\+version\.current;\s*setSession\(blank\); \/\/ Conceal member information/);
  assert.match(provider, /Sign-out could not be confirmed/);
});

test("shell layout dimensions and scroll behavior are preserved",()=>{
  assert.match(css, /grid-template-columns:16% minmax\(0,1fr\) 16%/);
  assert.match(css, /\.ogcl-center\s*\{[^}]*overflow:auto/);
  assert.match(app, /<LeftRail\s*\/>\s*<main[^>]*>[^]*<Outlet\s*\/>[^]*<RightRail\s*\/>/);
});

test("React gateway does not persist bearer tokens or account data in browser storage",()=>{
  assert.doesNotMatch(provider, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(provider, /setItem\s*\(/);
  assert.match(provider, /createAuthClient\(/);
});
