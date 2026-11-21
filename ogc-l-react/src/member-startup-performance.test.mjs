import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const session=read("./MemberSessionProvider.jsx"),matches=read("./MatchesView.jsx");
const quick=read("./QuickmatchView.jsx"),gateway=read("./member-gateway.mjs");

test("member shell becomes ready after server-verified identity without waiting for supplemental data",()=>{
  assert.match(session,/quiet \? await gateway\.revalidate\(\) : await gateway\.loadIdentity\(\)/);
  assert.match(session,/profileLoading:result\.kind==="member"/);
  assert.match(session,/discoveryLoading:result\.kind==="member"/);
  assert.match(session,/gateway\.loadSupplemental\(section\)/);
  assert.match(session,/for\(const section of \["profile","discovery"\]\)/);
  assert.match(session,/requestVersion!==version\.current/);
  assert.match(session,/previous\.user\?\.id!==viewerId/);
  assert.match(gateway,/readApi\("\/onboarding",jwt\)/);
});
test("unrelated Search data doesn't show an empty result while network is loading",()=>{
  assert.match(matches,/tab==="search"&&discoveryLoading&&<p role="status">Loading matches/);
  assert.match(matches,/!discoveryLoading&&!discoveryUnavailable/);
  assert.match(quick,/discoveryLoading&&<p role="status">Loading Quickmatch profiles/);
  assert.match(quick,/!loading&&quickState&&!discoveryLoading&&!discoveryUnavailable/);
});
test("cached avatar version is passed to protected gateway rather than discarded",()=>{
  assert.match(session,/getMemberAvatar\(id,knownPhotoId\)/);
  assert.doesNotMatch(session,/return gateway\.getMemberAvatar\(id\);/);
});
