import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SIGNUP_ORIENTATIONS,SIGNUP_GENDERS,signupIdentity,homeDestination,signupDestination} from "./signup-landing.mjs";
import {defaultRoute,primaryNavigation} from "./navigation.mjs";
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";
import {normalizeSiteRoute} from "./browser-location.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const app=read("./App.jsx"),signup=read("./SignupLanding.jsx"),shell=read("./SignupShell.jsx"),credentials=read("./SignupCredentials.jsx"),css=read("./signup-landing.css");
test("default landing respects verified session state and existing onboarding",()=>{
  assert.equal(defaultRoute,"/home");
  assert.equal(homeDestination("guest"),"/signup");
  assert.equal(homeDestination("onboarding"),"/onboarding");
  for(const kind of ["member","checking","error","unconfigured"])assert.equal(homeDestination(kind),null);
  assert.equal(signupDestination("member"),"/home");
  assert.equal(signupDestination("onboarding"),"/onboarding");
  assert.equal(signupDestination("guest"),null);
  assert.equal(signupDestination("checking"),null);
  assert.equal(primaryNavigation.length,5);
  assert.match(app,/if\(pathname==="\/"\|\|pathname\.replace\([^\n]+kind!=="member"\)return <Outlet\/>/);
  assert.match(app,/<Route path="home" element=\{<HomeRoute\/>\}/);
  assert.match(app,/if\(kind==="member"\)return <Navigate to=\{defaultRoute\} replace\/>/);
});
test("signup is a standalone sibling route with only the requested features",()=>{
  assert.match(app,/<\/Route>\s*<Route element=\{<SignupShell\/>\}>\s*<Route path="signup" element=\{<SignupLanding onContinue=\{setSignupSelection\} selection=\{signupSelection\}\/>\} \/>/);
  assert.match(app,/<Route path="signup2" element=\{<SignupCredentials\/>\} \/>/);
  assert.match(app,/<PublishedUiDesign \/>\s*<Routes>/);
  assert.doesNotMatch(signup+shell+credentials,/ogcl-app|ogcl-left|ogcl-right|ogcl-sheet|SidebarPromos/);
  assert.match(shell,/to="\/home" className="ogcl-signup-logo"/);
  assert.match(shell,/<Outlet\/>/);
  assert.match(signup,/I am a/);
  assert.match(signup,/>CONTINUE<\/button>/);
  assert.deepEqual([...shell.matchAll(/<NavLink to="([^"]+)"/g)].map(m=>m[1]),["/ogtrends","/signin","/home","/contact","/privacy","/terms"]);
  assert.match(css,/background:transparent/);
  assert.match(css,/grid-template-rows:auto 1fr auto/);
});
test("signup choices are allowlisted, ephemeral and confirmed through existing onboarding",()=>{
  assert.deepEqual(SIGNUP_ORIENTATIONS,["Straight","Gay","Bi","Something else"]);
  assert.deepEqual(SIGNUP_GENDERS,["Man","Woman","Something else"]);
  assert.deepEqual(signupIdentity("Bi","Man"),{orientation:"Bi",gender:"Man"});
  assert.equal(signupIdentity("invalid","Woman"),null);
  assert.equal(signupIdentity("Gay","invalid"),null);
  assert.match(signup,/onContinue\(identity\);\s*navigate\("\/signup2"\)/);
  assert.doesNotMatch(signup+app+credentials,/localStorage|sessionStorage|indexedDB/);
  assert.match(app,/\["\/signup","\/signup1","\/signup2","\/signup3","\/signup4","\/signup5","\/signup6","\/signup7","\/join","\/onboarding"\]/);
  assert.match(app,/setSignupSelection\(null\)/);
  const onboarding=read("./Onboarding.jsx");
  assert.match(onboarding,/state\.gender\|\|signupSelection\?\.gender/);
  assert.match(onboarding,/state\.orientation\|\|signupSelection\?\.orientation/);
  assert.match(onboarding,/if\(!result\.saved\)throw Error\("Identity wasn't saved\."\);\s*onIdentitySaved\?\.\(\)/);
});
test("signup is a canonical static-publish and route recovery path",()=>{
  assert.ok(SITEMAP_PATHS.includes("/signup"));
  assert.ok(SITEMAP_PATHS.includes("/signup2"));
  assert.equal(normalizeSiteRoute("/signup2/","https://ogcupid.com"),"/signup2");
  assert.equal(normalizeSiteRoute("/signup/","https://ogcupid.com"),"/signup");
  assert.equal(normalizeSiteRoute("/home","https://ogcupid.com"),"/home");
});

test("signup step two uses existing credential validation and signup action",()=>{
  assert.match(credentials,/<label>Username<input name="username" type="text" required minLength=\{2\} maxLength=\{60\}/);
  assert.match(credentials,/<label>Email<input name="email" type="email" required maxLength=\{254\}/);
  assert.match(credentials,/<label>Password<input name="password" type="password" required minLength=\{12\}/);
  assert.match(credentials,/These are permanent\. Choose wisely/);
  assert.match(credentials,/form\.elements\.password\.value=""/);
  assert.match(credentials,/await signUp\(username,email,password\)/);
  assert.match(credentials,/navigate\("\/signup3",\{replace:true\}\)/);
  assert.match(credentials,/submitting\.current\|\|!form\.reportValidity\(\)/);
  assert.match(css,/\.ogcl-signup-tooltip\{position:absolute;top:26px;left:calc\(100% \+ 18px\)/);
});

test("signup shell blog invitation and step two note are plain and accessible",()=>{
  assert.match(shell,/Just here for the blog\? <NavLink to="\/ogtrends">click here to read OG Trends<\/NavLink>/);
  assert.match(credentials,/aria-describedby="signup-permanent"/);
  const note=css.match(/\.ogcl-signup-tooltip\{([^}]+)\}/)?.[1]||"";
  assert.match(note,/color:inherit/);
  assert.doesNotMatch(note,/background|box-shadow|border|padding/);
  assert.doesNotMatch(css,/\.ogcl-signup-tooltip::before/);
});
