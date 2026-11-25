import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {primaryNavigation} from "./navigation.mjs";
import {
  SITE_PROMOTIONS,PROFILE_REFINEMENTS,drawDistinct,
  promotionDestination,refinementDestination,recommendedPhotoMembers
} from "./classic-editorial.mjs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const app=read("./App.jsx"),floater=read("./ClassicSidebar.jsx"),css=read("./styles.css");
const quick=read("./QuickmatchView.jsx"),hearts=read("./QuickmatchHearts.jsx");
const member=read("./PublicMemberProfile.jsx");

test("desktop navigation keeps the five existing destinations with compact labels",()=>{
  assert.deepEqual(primaryNavigation.map(x=>x.label),
    ["Matches","Messages","Visitors","Quickmatch","Community"]);
  assert.match(app,/<nav className="ogcl-main-nav" aria-label="OG Cupid main">/);
  assert.match(css,/\.ogcl-main-nav \{display:grid;gap:3px;margin-bottom:3px;\}/);
  assert.match(css,/\.ogcl-nav-link \{[^}]*background:var\(--okc-navy\);[^}]*border-radius:5px;/);
  assert.doesNotMatch(app,/\bogcl-primary\b/);
  assert.match(app,/<TopMemberNav\/>/);
  assert.match(app,/ProfileFloater Photo=\{MemberPhoto\}/);
  assert.match(app,/<MemberGate allowOnboarding><CommunityChat \/><\/MemberGate>/);
});

test("real member photo, not a name or fake progress, occupies completed-state floater",()=>{
  assert.match(floater,/className="ogcl-profile-floater"/);
  assert.match(floater,/<Photo member=\{\{userId:user.id,avatarPhotoId:signupProfile\?\.avatarPhotoId\}\}/);
  assert.match(floater,/kind==="onboarding"&&signupProfile\?\.userId===user\?\.id/);
  assert.match(floater,/kind!=="member"/);
  assert.match(css,/\.ogcl-profile-floater \.ogcl-member-photo/);
  assert.doesNotMatch(floater,/localStorage|sessionStorage|demo photo|fake avatar/i);
});

test("20 approved promo concepts and 5 independent refinement tiles draw without duplicates",()=>{
  assert.equal(SITE_PROMOTIONS.length,20);
  assert.equal(PROFILE_REFINEMENTS.length,5);
  assert.equal(new Set(SITE_PROMOTIONS.map(x=>x.title)).size,20);
  const chosen=drawDistinct(SITE_PROMOTIONS,6,()=>0);
  assert.equal(chosen.length,6);
  assert.equal(new Set(chosen.map(x=>x.title)).size,6);
  assert.equal(promotionDestination("questions"),"/questions");
  assert.equal(promotionDestination("profile","viewer"),"/profiles/viewer");
  assert.equal(promotionDestination(undefined,"viewer"),null);
  assert.equal(refinementDestination("photos","viewer"),"/profiles/viewer?tab=photos");
  assert.match(floater,/PAGE_PROMOTIONS.slice\(index,index\+3\)/);
  assert.match(floater,/PAGE_REFINEMENT/);
});

test("sidebar suggestions cannot invent scores or distance",()=>{
  const members=[
    {userId:"1",slug:"one",matchPercent:91,distanceMiles:99},
    {userId:"2",slug:"two",matchPercent:89,distanceMiles:100},
    {userId:"3",slug:"three",matchPercent:74,distanceMiles:6},
    {userId:"4",slug:"four",matchPercent:99,distanceMiles:101},
    {userId:"5",slug:"five",matchPercent:95},
    {userId:"6",slug:"six",matchPercent:null,distanceMiles:20}
  ];
  assert.deepEqual(recommendedPhotoMembers(members,()=>0).map(m=>m.slug),["one","two"]);
  assert.deepEqual(recommendedPhotoMembers([],()=>0),[]);
  assert.match(app,/className="ogcl-suggested-thumbnails"/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("Quickmatch renders original two heart icons, not CRUD buttons",()=>{
  assert.match(quick,/HeartDecision kind="like"/);
  assert.match(quick,/HeartDecision kind="dislike"/);
  assert.match(hearts,/ogcl-heart-like/);
  assert.match(hearts,/ogcl-heart-dislike/);
  assert.match(css,/quickmatch-hearts\.webp/);
  assert.match(quick,/queueOrder\.length>=5/);
  assert.doesNotMatch(quick,/>See another<|>Revisit skipped members<|>Undo</);
  assert.match(quick,/await saveQuickmatchDecision\(targetUserId,decision\)/);
  assert.match(quick,/await vote\(candidate.userId,decision\)/);
});

test("member profile has owner-only green pencils and in-place four-tab layout",()=>{
  assert.match(member,/id:"about",label:"About"/);
  assert.match(member,/id:"photos",label:"Photos"/);
  assert.match(member,/id:"questions",label:"Questions"/);
  assert.match(member,/id:"personality",label:"Personality"/);
  assert.match(member,/className="ogcl-classic-profile-head"/);
  assert.match(member,/className="ogcl-public-columns"/);
  assert.match(member,/profile.isOwner&&<button/);
  assert.match(member,/await saveOwnEssay\(key,draft\)/);
  assert.match(member,/EditPencil to="\/settings"/);
  assert.match(css,/grid-template-columns:minmax\(0,3fr\) minmax\(0,2fr\)/);
});
