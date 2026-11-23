import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,relative} from "node:path";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
const editorials=readFileSync(new URL("./EditorialPages.jsx",import.meta.url),"utf8");
const entry=readFileSync(new URL("../../public/index.html",import.meta.url),"utf8");
const legacyRoot=fileURLToPath(new URL("../../public/",import.meta.url));
const read=path=>readFileSync(new URL("../../public/"+path,import.meta.url),"utf8");
const expectedLegacy=[
  "account/index.html","account/persona.html","contact/index.html",
  "ogtrends/index.html","ogtrends/zero/index.html",
  "ogtrends/perfect-profile/index.html","ogtrends/references/index.html",
  "privacy/index.html","terms/index.html","profiles/index.html",
  "questions/index.html","quiz/index.html","sitemap/index.html"
];
const canonical=[
  "signin","join","recover","verify","onboarding","account","persona",
  "ogtrends","ogtrends/zero","ogtrends/perfect-profile",
  "ogtrends/references","privacy","terms","contact","sitemap",
  "photos","matches","profile","settings","profiles/:slug","questions",
  "quickmatch","messages","messages/:peerId","community","admin"
];
function listHtml(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(ent=>{
    const abs=join(dir,ent.name);
    return ent.isDirectory()?listHtml(abs):ent.name.endsWith(".html")
      ?[relative(legacyRoot,abs).replaceAll("\\","/")]:[];
  });
}
function redirectFor(page,pathname="/",search="",hash=""){
  const html=read(page);
  const match=html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match,"Redirect script missing for "+page);
  let redirect=null;
  const location={pathname,search,hash,replace:url=>{redirect=url;}};
  runInNewContext(match[1],{location,URLSearchParams});
  return redirect;
}

test("every published HTML document except React root and Render fallback is a compatibility redirect",()=>{
  const all=listHtml(legacyRoot).sort();
  assert.deepEqual(all,["404.html","index.html",...expectedLegacy].sort());
  assert.match(entry,/<div id="root"><\/div>/);
  assert.match(entry,/\/assets\/index-[\w-]+\.js/);
  for(const file of expectedLegacy){
    const html=read(file);
    assert.match(html,/location\.replace\(/,file);
    assert.doesNotMatch(html,/<main\b|<article\b|<form\b|<iframe\b/i,
      file+" unexpectedly has an independent page implementation");
  }
  assert.doesNotMatch(read("404.html"),/<main\b|<article\b|<form\b/i);
});

test("every canonical user-facing page is rendered by a React route",()=>{
  for(const path of canonical)
    assert.ok(source.includes('<Route path="'+path+'"'),"No React page: "+path);
  assert.match(source,/<Route path="\*"/);
  assert.match(source,/<Route path="admin" element=\{<AdminGate>/);
  assert.match(source,/<Route path="messages" element=\{<MemberGate>/);
  assert.match(source,/visitors: \["Visitors"/);
  for(const key of ["ogtrends","zero","perfect-profile","references",
    "privacy","terms","contact","persona"])
    assert.ok(editorials.includes(key+":{")||editorials.includes('"'+key+'":{'),
      "Editorial catalog missing "+key);
  assert.doesNotMatch(editorials,/<iframe|contentDocument/);
});

test("legacy /quiz and /questions go directly into React with query and fragment preserved",()=>{
  for(const [path,react] of [["quiz/index.html","persona"],
    ["questions/index.html","questions"]]){
    const html=read(path);
    assert.match(html,new RegExp('content="0;url=\\/#\\/'+react+'"'));
    assert.equal(redirectFor(path,"/"+path.split("/")[0]+"/","?x=1","#section"),
      "/#/"+react+"?x=1#section");
    assert.equal(redirectFor(path),"/#/"+react);
  }
  assert.equal(redirectFor("sitemap/index.html","/sitemap"),"/#/sitemap");
  assert.equal(redirectFor("quiz/index.html","/quiz/","?persona=RBSDm"),
    "/#/persona?persona=RBSDm");
});

test("Render 404 bridge forwards clean deep links to the correct React pages",()=>{
  const cases=[
    ["/admin","","","/#/admin"],
    ["/sitemap","","","/#/sitemap"],
    ["/messages","","","/#/messages"],
    ["/messages/00000000-0000-4000-8000-000000000007","","",
      "/#/messages/00000000-0000-4000-8000-000000000007"],
    ["/photos","","","/#/photos"],
    ["/questions/","","","/#/questions"],
    ["/profile","","","/#/profile"],
    ["/visitors","","","/#/visitors"],
    ["/ogtrends/references","","","/#/ogtrends/references"],
    ["/profiles/river-riley","","#photos","/#/profiles/river-riley?tab=photos"],
    ["/profiles/river-riley/","?tab=questions","#photos",
      "/#/profiles/river-riley?tab=questions"],
    ["/quiz","?persona=RBSDm","","/#/persona?persona=RBSDm"],
    ["/unknown-page","","","/#/not-found"],
    ["/profiles/invalid.name","","","/#/not-found"]
  ];
  for(const [path,search,hash,expectation] of cases)
    assert.equal(redirectFor("404.html",path,search,hash),expectation,path);
});

test("member app is retained only as rollback source, not a second published UI",()=>{
  assert.doesNotMatch(entry,/member-app|home-dashboard|onboarding-ui|profile-showcase\.js/);
  assert.doesNotMatch(source,/legacyHref\("/);
  assert.match(read("account/index.html"),/location\.replace\("\/#"/);
  assert.match(read("profiles/index.html"),/location\.replace\("\/#\/profiles\//);
});
