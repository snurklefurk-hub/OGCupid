import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("retired feedback widget is absent from authored and compiled pages",()=>{
  for(const path of [
    "index.html","public/index.html","member-app/index.html",
    "member-app/persona.html","public/account/index.html",
    "public/account/persona.html","public/contact/index.html",
    "public/privacy/index.html","public/terms/index.html",
    "public/questions/index.html","public/quiz/index.html",
    "public/ogtrends/index.html","public/ogtrends/zero/index.html",
    "public/ogtrends/perfect-profile/index.html",
    "public/ogtrends/references/index.html"
  ])assert.doesNotMatch(read(path),/feedback-widget(?:\.js|\.css)/,path);
  for(const name of ["public/feedback-widget.js","public/feedback-widget.css",
    "member-app/feedback-widget.test.js","api/member-feedback.js",
    "api/member-feedback.test.js"])
    assert.equal(existsSync(new URL("../"+name,import.meta.url)),false,name);
});
test("new builds cannot reintroduce the drawer or retired endpoint",()=>{
  assert.doesNotMatch(read("scripts/publish-ogcl-production.mjs"),/feedback-widget/);
  assert.doesNotMatch(read("ogc-l-react/vite.config.js"),/feedback-widget/);
  assert.doesNotMatch(read("member-app/main.js"),/ogcSubmitFeedback|requestPrivate\("\/feedback"/);
  assert.doesNotMatch(read("member-app/persona-onboarding.js"),/ogcSubmitFeedback|pathname\s*=\s*"\/feedback"/);
  assert.doesNotMatch(read("api/member-profile.ts"),/feedbackPath|handleFeedback|member-feedback/);
  assert.doesNotMatch(read("member-app/package.json"),/feedback-widget.test.js/);
  assert.match(read("db/migrations/029_retire_feedback.sql"),/DROP FUNCTION IF EXISTS/);
});
test("Community remains active; historical privacy notice is accurate",()=>{
  assert.match(read("ogc-l-react/src/App.jsx"),/CommunityChat/);
  assert.match(read("api/member-profile.ts"),/handleCommunity/);
  assert.match(read("public/privacy/index.html"),/Previous beta feedback/);
  assert.match(read("public/contact/index.html"),/Community chatroom/);
});