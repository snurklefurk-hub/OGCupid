import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reactPathForLegacy} from "./editorial-routes.mjs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const app=read("./App.jsx");
const page=read("./PublishedPage.jsx");
const personaWrapper=read("./PersonaPage.jsx");
const persona=read("../../public/account/persona.html");
const rawPages=[
  ["ogtrends","../../public/ogtrends/index.html","WE BROUGHT BACK THE"],
  ["ogtrends/zero","../../public/ogtrends/zero/index.html","Spite."],
  ["ogtrends/perfect-profile","../../public/ogtrends/perfect-profile/index.html","perfect first impression"],
  ["ogtrends/references","../../public/ogtrends/references/index.html","profile-showcase"],
  ["contact","../../public/contact/index.html","privacy@ogcupid.com"],
  ["privacy","../../public/privacy/index.html","Privacy"],
  ["terms","../../public/terms/index.html","Terms"]
];
test("all seven original articles/legal documents have React routes and nonempty original prose",()=>{
  for(const [route,file,marker]of rawPages){
    const source=read(file);
    assert.match(source,/<main class="main" id="main">/);
    assert.ok(source.includes(marker),route+" lost original text");
    assert.ok(page.includes(route),route+" missing from editorial config");
    assert.ok(app.includes('path="'+route+'"'),route+" missing React route");
    assert.ok(source.includes('location.replace("/#'+route+'"'),route+" old URL not unified");
    assert.match(source,/legacy/);
  }
});
test("full legal TOCs and reference citations remain in source for in-app scroll",()=>{
  const privacy=read("../../public/privacy/index.html");
  const terms=read("../../public/terms/index.html");
  const profile=read("../../public/ogtrends/perfect-profile/index.html");
  for(const anchor of ["scope","categories","purposes","retention","rights","contact"])
    assert.ok(privacy.includes('id="'+anchor+'"'));
  for(const anchor of ["eligibility","conduct","termination","liability","disputes"])
    assert.ok(terms.includes('id="'+anchor+'"'));
  assert.match(profile,/id="source-10"/);
  assert.match(page,/scrollIntoView/);
  assert.match(page,/DOMParser/);
  assert.match(page,/script,iframe,object,embed,form,style,link,meta/);
});
test("old canonical links map to native React and unsafe external paths do not",()=>{
  assert.equal(reactPathForLegacy("/ogtrends/zero/"),"/#/ogtrends/zero");
  assert.equal(reactPathForLegacy("/ogtrends/perfect-profile/#source-1"),
    "/#/ogtrends/perfect-profile?section=source-1");
  assert.equal(reactPathForLegacy("/quiz/"),"/#/persona");
  assert.equal(reactPathForLegacy("/account/persona.html?persona=RBSDm"),
    "/#/persona?persona=RBSDm");
  assert.equal(reactPathForLegacy("/account/?join=1"),"/#/join");
  assert.equal(reactPathForLegacy("/questions/"),"/#/questions");
  assert.equal(reactPathForLegacy("/privacy/"),"/#/privacy");
  assert.equal(reactPathForLegacy("/contact/"),"/#/contact");
  assert.equal(reactPathForLegacy("/profiles/persona-fan"),"/#/profiles/persona-fan");
  assert.equal(reactPathForLegacy("mailto:privacy@ogcupid.com"),null);
  assert.equal(reactPathForLegacy("#source-1"),null);
  assert.equal(reactPathForLegacy("javascript:alert(1)"),null);
  assert.equal(reactPathForLegacy("https://other.example/privacy"),null);
});
test("public OG Cupid navigation does not require a dating profile or another site",()=>{
  for(const route of ["persona","quiz","ogtrends","ogtrends/zero",
    "ogtrends/perfect-profile","ogtrends/references","contact","privacy","terms"])
    assert.ok(app.includes('path="'+route+'"'),route);
  assert.match(app,/PublicNavigation/);
  assert.match(app,/ogcl-public-links/);
  assert.match(app,/<PublishedPage page="terms"/);
  assert.match(app,/<MemberGate allowOnboarding><PersonaPage/);
  assert.doesNotMatch(app,/legacyHref/);
});
test("Persona original 40-question scoring, catalog and share links are retained in unified shell",()=>{
  assert.match(persona,/const questions = \[/);
  assert.match(persona,/const originalWriteups/);
  assert.match(persona,/persona-catalog-grid/);
  assert.match(persona,/ogcl-persona-embedded/);
  assert.match(persona,/shared.hash="\/persona\?persona="/);
  assert.match(personaWrapper,/iframe/);
  assert.match(personaWrapper,/ResizeObserver/);
  assert.match(personaWrapper,/embedded:"1"/);
  assert.match(personaWrapper,/allow="clipboard-write"/);
  const quiz=read("../../public/quiz/index.html");
  assert.match(quiz,/location.replace\("\/#\/persona"/);
});
test("original reference profile demonstration is retained as a safe custom element",()=>{
  const reference=read("../../public/ogtrends/references/index.html");
  assert.match(reference,/<og-profile-showcase><\/og-profile-showcase>/);
  assert.match(page,/profileShowcaseUrl/);
  assert.match(page,/customElements.get\("og-profile-showcase"\)/);
  assert.match(page,/script.dataset.ogclProfileShowcase/);
  const script=read("../../public/profile-showcase.js");
  assert.match(script,/customElements.define\("og-profile-showcase"/);
});
