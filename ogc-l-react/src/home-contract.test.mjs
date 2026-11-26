import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {homeProgress,EXPLORER_PAGES,explorerPath,AWARD_DEFINITIONS} from "./home-contract.mjs";
import {OGTRENDS_PUBLICATIONS} from "./ogtrends-catalog.mjs";
import {validSignupFilters} from "./profile-options.mjs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("all six tasks use the requested thresholds; persona is not a progress bar",()=>{
  const partial=homeProgress({questions:101,essayWords:500,quickmatchVotes:10,hasQuiver:true,communityVisited:true,communityMessages:7,searchClicks:4});
  assert.deepEqual(partial.map(x=>x.label),["The persona test","Match questions!","Fill out some essays!","Check out Quickmatch!","Check out the Community!","Search for Matches!"]);
  assert.equal(partial[0].percent,undefined);
  assert.deepEqual(partial.slice(1).map(x=>x.percent),[50,50,55,95,80]);
  const complete=homeProgress({persona:"DGLD",questions:400,essayWords:3000,quickmatchVotes:20,hasQuiver:true,communityVisited:true,communityMessages:8,searchClicks:6});
  assert.equal(complete[0].result,"DGLD");
  assert.deepEqual(complete.slice(1).map(x=>x.percent),[100,100,100,100,100]);
  assert.equal(homeProgress({quickmatchVotes:20})[3].percent,90);
  assert.equal(homeProgress({communityVisited:true})[4].percent,25);
  assert.deepEqual(Object.values(AWARD_DEFINITIONS).map(a=>a.label),["Feature Creature","explorer","yapper"]);
});
test("Explorer has one canonical permanent page set and excludes administration and one-time signup pages",()=>{
  assert.equal(EXPLORER_PAGES.length,23);
  assert.equal(new Set(EXPLORER_PAGES).size,23);
  assert.equal(explorerPath("/profiles/my-name","my-name"),"/profiles/me");
  assert.equal(explorerPath("/profiles/other-name","my-name"),null);
  assert.equal(explorerPath("/admin"),null);
  assert.equal(explorerPath("/signup9"),null);
  assert.equal(explorerPath("/messages/"),"/messages");
  const sql=read("../../db/migrations/042_member_home.sql");
  const pages=sql.match(/SELECT ARRAY\[(.*?)\]::text\[\]/)[1].match(/'[^']+'/g).map(x=>x.slice(1,-1));
  assert.deepEqual([...pages].sort(),[...EXPLORER_PAGES].sort());
  assert.match(sql,/persona IS NOT NULL AND question_count>=200 AND word_count>=1000 AND votes>=20 AND tracked.has_quiver/);
  assert.match(sql,/largest_essay>500 OR word_count>2000/);
  assert.match(sql,/tracked.visited_pages @> pages/);
  assert.match(sql,/ON CONFLICT DO NOTHING/);
});
test("the actual published article index and feed catalog remain aligned",()=>{
  const source=read("./EditorialContent.jsx"),index=source.slice(source.indexOf('<div className={"cards"}>'),source.indexOf('  </>,\n  zero:'));
  const links=[...index.matchAll(/href=\{"(\/ogtrends\/[^"]+\/)"\}/g)].map(m=>m[1].slice(0,-1));
  assert.deepEqual(OGTRENDS_PUBLICATIONS.map(a=>a.href),links);
  for(const article of OGTRENDS_PUBLICATIONS){assert.ok(index.includes(article.title));assert.ok(Number.isFinite(Date.parse(article.publishedAt)));}
});
test("signup filters use persisted settings and final signup navigates to Home",()=>{
  assert.ok(validSignupFilters({ageMin:18,ageMax:99,distanceMiles:0}));
  assert.ok(!validSignupFilters({ageMin:45,ageMax:20,distanceMiles:50}));
  assert.ok(!validSignupFilters({ageMin:18,ageMax:100,distanceMiles:50}));
  assert.ok(!validSignupFilters({ageMin:18,ageMax:99,distanceMiles:7}));
  const identity=read("./SignupIdentity.jsx"),finish=read("./SignupFinish.jsx"),shell=read("./SignupShell.jsx");
  assert.match(identity,/canContinueSignup3\(draft\)/);
  assert.match(read("./signup3-validation.mjs"),/validSignupFilters\(draft\)/);
  assert.match(identity,/disabled=\{busy\|\|!canContinue\}/);
  assert.match(finish,/searchRadiusMiles:state.signup_radius_miles\?\?/);
  assert.match(finish,/preferredAgeMin:Math.min\(state.match_age_min/);
  assert.match(finish,/if\(await refresh\(\)\)navigate\("\/home",\{replace:true\}\)/);
  assert.doesNotMatch(shell,/to="\/signup10"/);
  assert.match(read("./App.jsx"),/<MemberGate><HomeView Photo=\{MemberPhoto\}/);
  assert.match(read("./MatchesView.jsx"),/apply=\{\(\)=>\{[^}]*accountRequest\("\/home","POST",\{event:"search"\}/);
});

test("signup9 uses one green Upload control and no confirmation checkbox",()=>{
  const source=read("./SignupFinish.jsx");
  assert.match(source,/type="file" hidden/);
  assert.match(source,/className="ogcl-signup9-primary" aria-describedby="signup9-photo-note"[^\n]+>Upload<\/button>/);
  assert.match(source,/Upload one actual picture of yourself\. You can upload more later of anything you want\. Anime pfps, memes, your dogs, whatever\. You gotta have a real pfp though\./);
  assert.doesNotMatch(source,/setConfirmed|I confirm my main profile picture/);
  assert.match(source,/!primary\?\.id\|\|essay\.trim\(\)\.length<15/);
  assert.match(source,/step:"signup9-finish",confirmed:true/);
});
