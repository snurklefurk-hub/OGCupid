import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=file=>readFileSync(new URL(file,import.meta.url),"utf8");

test("all three requested views share the same classic gradient tab system",()=>{
  const matches=source("./MatchesView.jsx");
  const quickmatch=source("./QuickmatchView.jsx");
  const admin=source("./AdminDashboard.jsx");
  const main=source("./main.jsx");
  assert.match(matches,/className="ogcl-matches-tabs ogcl-period-tabs" aria-label="Matches sections"/);
  assert.match(quickmatch,/className="ogcl-quickmatch-tabs ogcl-period-tabs" aria-label="Quickmatch lists"/);
  assert.match(admin,/<nav aria-label="Administration sections" className="ogcl-period-tabs">/);
  assert.match(main,/import "\.\/period-tabs\.css"/);
  for(const screen of [matches,quickmatch,admin])
    assert.match(screen,/aria-current=\{tab===/);
});

test("period tabs reproduce the supplied reference without rewriting any behavior",()=>{
  const css=source("./period-tabs.css");
  assert.match(css,/linear-gradient\(to bottom,var\(--ogc-tab-gradient-top\),var\(--ogc-tab-gradient-bottom\)\)/);
  assert.match(css,/\.ogcl-period-stage \{/);
  assert.match(css,/min-height:\s*145px/);
  assert.match(css,/min-height:\s*245px/);
  assert.match(css,/background:\s*transparent/);
  assert.match(css,/\.ogcl-period-stage \+ \.ogcl-profile-tab-content/);
  assert.match(css,/border-radius:\s*5px 5px 0 0/);
  assert.match(css,/button\[aria-current="page"\]/);
  assert.match(css,/border-bottom-color:\s*var\(--ogc-tab-paper\)/);
  assert.match(css,/nav\.ogcl-profile-tabs > a\.active/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/\.ogcl-admin \.ogcl-period-stage > \.ogcl-admin-toolbar/);
  assert.match(css,/\.ogcl-quickmatch-tabs\.ogcl-period-tabs/);
  assert.match(css,/z-index:\s*2/);
  assert.match(css,/margin:\s*0 0 -1px/);
  assert.doesNotMatch(css,/grid-template-columns|position:\s*fixed|!important|display:\s*none/);
  const shell=source("./styles.css");
  assert.match(shell,/grid-template-columns:184px minmax\(0,1fr\) 184px/);
});

test("tabs keep their original navigation and protections",()=>{
  const matches=source("./MatchesView.jsx");
  const quickmatch=source("./QuickmatchView.jsx");
  const admin=source("./AdminDashboard.jsx");
  assert.match(matches,/onClick=\{\(\)=>setTab\(id\)\}/);
  assert.match(quickmatch,/setSearchParams\(key==="matches"\?\{\}:\{tab:key\}\)/);
  assert.match(admin,/onClick=\{\(\)=>\{[^]*editorDirty[^]*setTab\(t\);setError\(""\);setNotice\(""\);/);
  assert.match(admin,/disabled=\{busy\|\|tab==="ui-editor"\}/);
  assert.match(admin,/if\(denied\)return/);
});


test("all tabsets sit inside one broad shaded stage, with paper content below",()=>{
  const matches=source("./MatchesView.jsx");
  const quickmatch=source("./QuickmatchView.jsx");
  const admin=source("./AdminDashboard.jsx");
  const profile=source("./PublicMemberProfile.jsx");
  assert.match(matches,/<div className="ogcl-period-stage">\s*<header className="ogcl-view-head ogcl-matches-head">/);
  assert.match(matches,/<\/nav>\s*<\/div>\s*<div className="ogcl-matches-body">/);
  assert.match(quickmatch,/<div className="ogcl-period-stage">\s*<header className="ogcl-view-head">/);
  assert.match(quickmatch,/<\/nav>\s*<\/div>\s*<div className="ogcl-content-panel">/);
  assert.match(admin,/<div className="ogcl-period-stage">\s*<header className="ogcl-view-head">/);
  assert.match(admin,/<\/div>\s*<\/div>\s*<div className="ogcl-content-panel">\s*\{error&&/);
  assert.match(profile,/<div className="ogcl-period-stage ogcl-profile-period-stage">\s*<header className="ogcl-classic-profile-head">/);
  assert.match(profile,/<\/nav>\s*<\/div>\s*<div className="ogcl-profile-tab-content">/);
});

test("a single uninterrupted gradient owns the stage, never an isolated tab bar",()=>{
  const css=source("./period-tabs.css");
  assert.match(css,/\.ogcl-view \.ogcl-period-stage\s*\{[^}]*background:\s*linear-gradient\(/);
  assert.match(css,/\.ogcl-view \.ogcl-period-stage > \.ogcl-view-head\s*\{[^}]*background:\s*transparent/);
  assert.match(css,/nav\.ogcl-period-tabs,[\s\S]*nav\.ogcl-profile-tabs\s*\{[^}]*background:\s*transparent/);
  assert.match(css,/border-bottom-color:\s*var\(--ogc-tab-paper\)/);
  assert.match(css,/\.ogcl-period-stage \+ \.ogcl-matches-body/);
  assert.match(css,/\.ogcl-period-stage \+ \.ogcl-content-panel/);
  assert.doesNotMatch(css,/margin:\s*-\d+px\s*-\d+px/);
});
