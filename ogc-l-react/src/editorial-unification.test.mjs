import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=url=>readFileSync(new URL(url,import.meta.url),"utf8");
const app=read("./App.jsx"),editorial=read("./EditorialPages.jsx");
const contentCss=read("../../public/ogcl-embedded.css");
const staged=read("../vite.config.js");
const onboarding=read("./Onboarding.jsx");
const gate=read("../../member-app/persona-gate.js");
const saver=read("../../member-app/persona-onboarding.js");
const persona=read("../../member-app/persona.html");

test("all canonical editorial and legal pages route inside one React member shell",()=>{
  for(const slug of ["persona","ogtrends","ogtrends/zero","ogtrends/perfect-profile",
    "ogtrends/references","privacy","terms","contact"]){
    assert.ok(app.includes('<Route path="'+slug+'"'),slug);
  }
  assert.doesNotMatch(app, /ogcl-public-nav/);
  assert.match(app, /<footer className="ogcl-footer"/);
  assert.match(app, /<NavLink[^>]*to="\/privacy">Privacy/);
  assert.match(app, /<NavLink[^>]*to="\/terms">Terms/);
  assert.match(app, /<NavLink data-ogc-edit-text="shell\.footer\.persona" to="\/persona">Dating Persona/);
});

test("canonical legal, research, Contact and Persona source bodies are retained",()=>{
  const sources={
    ogtrends:"../../public/ogtrends/index.html",
    zero:"../../public/ogtrends/zero/index.html",
    "perfect-profile":"../../public/ogtrends/perfect-profile/index.html",
    references:"../../public/ogtrends/references/index.html",
    privacy:"../../public/privacy/index.html",
    terms:"../../public/terms/index.html",
    contact:"../../public/contact/index.html",
    persona:"../../public/account/persona.html"
  };
  for(const [key,path] of Object.entries(sources)){
    assert.ok(existsSync(new URL(path,import.meta.url)),path);
    assert.ok(editorial.includes(key+":{") || editorial.includes('"'+key+'":{'),key);
    const html=read(path);
    assert.match(html,/location\.replace\("\/#\//);
    assert.match(html,/<title>[^<]+<\/title>/i);
    assert.doesNotMatch(html,/<main\b|ogcl_embed/i);
  }
});
test("the original Persona scoring, results, author text and original artwork are not replaced",()=>{
  assert.match(persona,/const questions = \[/);
  assert.match(persona,/const archetypes/);
  assert.match(persona,/historicalArtwork/);
  assert.match(persona,/ogc:persona-finished/);
  assert.match(persona,/32 DATING PERSONAS/);
  assert.doesNotMatch(editorial,/dangerouslySetInnerHTML|eval\(|new Function/);
});
test("Persona routes require authenticated member and onboarding photo prerequisite",()=>{
  assert.match(editorial,/kind==="guest"/);
  assert.match(editorial,/kind==="onboarding"&&!onboarding\?\.photo/);
  assert.match(editorial,/kind!=="member"&&kind!=="onboarding"/);
  assert.match(onboarding,/to="\/persona"/);
  assert.match(editorial,/<PersonaQuiz onboarding=/);
  assert.match(gate,/ogc:persona-auth-required/);
  assert.match(saver,/ogc:persona-saved/);
  assert.match(read("./PersonaQuiz.jsx"),/accountRequest\("\/onboarding","PUT",\{step:"persona",answers,code\}\)/);
  assert.doesNotMatch(editorial,/<iframe|contentDocument/);
  assert.match(saver,/step:"persona"/);
});
test("editorial and Persona render without runtime HTML loading",()=>{
  assert.match(editorial,/editorialContent\[pageKey\]/);
  assert.doesNotMatch(editorial,/DOMParser|replaceChildren|fetch\(/);
  assert.doesNotMatch(editorial,/<iframe|contentDocument|ResizeObserver/);
  assert.match(contentCss,/html\.ogcl-embed/);
  for(const name of ["ogtrends","privacy","terms","contact","persona-assets","brand"])
    assert.ok(staged.includes('"'+name+'"'),name);
  assert.match(staged,/account\/persona\.html/);
  assert.match(staged,/ogcl-embedded\.css/);
});
test("historical /quiz and /questions links reach React routes",()=>{
  assert.match(read("../../public/quiz/index.html"),/content="0;url=\/#\/persona"/);
  assert.match(read("../../public/questions/index.html"),/content="0;url=\/#\/questions"/);
});
