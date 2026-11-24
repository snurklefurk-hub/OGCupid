import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,relative} from "node:path";
import {runInNewContext} from "node:vm";
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";
import {normalizeSiteRoute} from "./browser-location.mjs";

const source=readFileSync(new URL("./App.jsx",import.meta.url),"utf8");
const main=readFileSync(new URL("./main.jsx",import.meta.url),"utf8");
const editorials=readFileSync(new URL("./EditorialPages.jsx",import.meta.url),"utf8");
const entry=readFileSync(new URL("../../public/index.html",import.meta.url),"utf8");
const legacyRoot=fileURLToPath(new URL("../../public/",import.meta.url));
const read=path=>readFileSync(new URL("../../public/"+path,import.meta.url),"utf8");
const fixedLegacy=["account/persona.html","profiles/index.html","quiz/index.html"];
const generatedEntries=SITEMAP_PATHS.map(path=>path.slice(1)+"/index.html");
const canonical=[
  "home","signup","signin","join","recover","verify","onboarding","account","persona",
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
  runInNewContext(match[1],{location,URLSearchParams,URL});
  return redirect;
}

test("production has one React app and only known static/legacy entry points",()=>{
  const all=listHtml(legacyRoot).sort();
  const allowed=new Set(["404.html","index.html",...fixedLegacy,...generatedEntries]);
  assert.ok(all.every(file=>allowed.has(file)),
    "Unexpected standalone HTML: "+all.filter(file=>!allowed.has(file)).join(", "));
  assert.match(entry,/<div id="root"><\/div>/);
  assert.match(entry,/\/assets\/index-[\w-]+\.js/);
  assert.match(main,/import \{ BrowserRouter \}/);
  assert.match(main,/<BrowserRouter\b/);
  assert.doesNotMatch(main,/\bHashRouter\b/);
  for(const file of all.filter(file=>file!=="404.html"&&file!=="index.html")){
    const html=read(file);
    assert.ok(html.includes('id="root"')||html.includes("location.replace("),
      file+" should either boot React or redirect a historical alias");
    assert.doesNotMatch(html,/<main\b|<article\b|<form\b|<iframe\b/i,
      file+" unexpectedly has a second page implementation");
  }
  const publish=readFileSync(new URL("../../scripts/publish-ogcl-production.mjs",import.meta.url),"utf8");
  assert.match(publish,/SITEMAP_SECTIONS/);
  assert.match(publish,/writeFileSync\(output,routeHtml\)/);
  assert.match(publish,/noindex,follow/);
});

test("all canonical user-facing pages are React routes",()=>{
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

test("legacy Persona entry points redirect to clean, query-preserving routes",()=>{
  for(const page of ["quiz/index.html","account/persona.html"]){
    assert.equal(redirectFor(page,"/quiz/","?persona=RBSDm","#result"),
      "/persona?persona=RBSDm#result");
    assert.doesNotMatch(read(page),/\/#\/persona/);
  }
  // The old Questions bridge may exist before the first production build;
  // after publishing, /questions/index.html is a real React entry.
  const questions=read("questions/index.html");
  if(questions.includes('id="root"')){
    assert.match(questions,/\/assets\/index-[\w-]+\.js/);
  }else{
    assert.match(questions,/location\.replace\(/);
  }
});

test("static host fallback preserves dynamic deep links without resurrecting hashes",()=>{
  const cases=[
    ["/home","",""],["/signup","",""],["/admin","",""],["/sitemap","",""],["/matches","",""],
    ["/messages/00000000-0000-4000-8000-000000000007","",""],
    ["/profiles/river-riley","?tab=questions","#photos"],
    ["/profiles/river-riley","","#photos"],
    ["/not-a-route","",""]
  ];
  for(const [path,search,hash] of cases){
    const redirected=redirectFor("404.html",path,search,hash);
    const expected=path+search+hash;
    const parsed=new URL("https://ogcupid.com"+redirected);
    assert.equal(parsed.pathname,"/",path);
    assert.equal(parsed.searchParams.get("__ogc_route"),expected,path);
    if(path==="/profiles/river-riley"&&hash==="#photos"){
      const normalized=normalizeSiteRoute(expected,"https://ogcupid.com");
      assert.match(normalized,/^\/profiles\/river-riley\?tab=/);
    }
  }
  assert.doesNotMatch(read("404.html"),/\/#\//);
});

test("legacy generic /profiles directory goes to clean matches route",()=>{
  const html=read("profiles/index.html");
  assert.match(html,/location\.replace\(/);
  assert.doesNotMatch(html,/\/#\//);
});
