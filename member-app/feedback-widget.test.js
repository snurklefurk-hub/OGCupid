import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
test("sitewide beta feedback drawer is loaded on every authored site HTML page",()=>{
 const pages=[
  "index.html","member-app/index.html","member-app/persona.html",
  "public/contact/index.html","public/ogtrends/index.html",
  "public/ogtrends/perfect-profile/index.html","public/ogtrends/references/index.html",
  "public/ogtrends/zero/index.html","public/privacy/index.html",
  "public/questions/index.html","public/quiz/index.html","public/terms/index.html"
 ];
 for(const path of pages){
  const source=read(path);
  assert.match(source,/<script defer src="\/feedback-widget\.js"><\/script>/,path);
 }
});
test("feedback drawer stays private, preserves drafts, and doesn't leak auth tokens",()=>{
 const js=read("public/feedback-widget.js");
 const style=read("public/feedback-widget.css");
 const member=read("member-app/main.js");
 const persona=read("member-app/persona-onboarding.js");
 assert.match(js,/ogc-feedback-toggle/);
 assert.match(js,/ogc-feedback-panel/);
 assert.match(js,/sessionStorage/);
 assert.match(js,/pagePath:originatingPage/);
 assert.match(js,/Sign in to send/);
 assert.match(js,/\.pathname\s*=\s*"\/feedback"/);
 assert.match(js,/credentials:"omit"/);
 assert.match(member,/window\.ogcSubmitFeedback/);
 assert.match(persona,/window\.ogcSubmitFeedback/);
 assert.match(style,/position:fixed/);
 assert.match(js,/This isn't a live chat/);
});
