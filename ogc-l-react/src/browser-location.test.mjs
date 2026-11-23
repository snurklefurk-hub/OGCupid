import test from "node:test";
import assert from "node:assert/strict";
import {migrateBrowserLocation,normalizeSiteRoute,ROUTE_RECOVERY_PARAM} from "./browser-location.mjs";

function migrated(url){
  let changed=null;
  const location=new URL(url);
  const browser={location,history:{state:{keep:"state"},replaceState(state,_title,target){
    changed={state,target};
  }}};
  const result=migrateBrowserLocation(browser);
  return {result,changed};
}

test("existing bookmarked hash routes become clean paths without a page reload",()=>{
  for(const [input,path] of [
    ["https://ogcupid.com/#/matches","/matches"],
    ["https://ogcupid.com/#/quickmatch","/quickmatch"],
    ["https://ogcupid.com/#/sitemap","/sitemap"],
    ["https://ogcupid.com/#/admin","/admin"],
    ["https://ogcupid.com/#/messages/00000000-0000-4000-8000-000000000007",
      "/messages/00000000-0000-4000-8000-000000000007"],
    ["https://ogcupid.com/#/profiles/river-riley?tab=photos","/profiles/river-riley?tab=photos"],
    ["https://ogcupid.com/#/privacy#scope","/privacy#scope"]
  ]){
    const {result,changed}=migrated(input);
    assert.equal(result,path,input);
    assert.equal(changed.target,path,input);
    assert.deepEqual(changed.state,{keep:"state"});
  }
});

test("host fallback restores dynamic profiles and threads into BrowserRouter",()=>{
  for(const path of ["/profiles/river-riley?tab=questions",
    "/messages/00000000-0000-4000-8000-000000000007"]){
    const url="https://ogcupid.com/?"+ROUTE_RECOVERY_PARAM+"="+encodeURIComponent(path);
    assert.equal(migrated(url).changed.target,path);
  }
  assert.equal(migrated("https://ogcupid.com/?__ogc_route="+
    encodeURIComponent("/profiles/river-riley#photos")).changed.target,
    "/profiles/river-riley?tab=photos");
});

test("old account links and old quiz aliases keep working",()=>{
  const base="https://ogcupid.com";
  assert.equal(normalizeSiteRoute("/quiz?persona=RBSDm#result",base),"/persona?persona=RBSDm#result");
  assert.equal(migrated(base+"/account/?join=1").changed.target,"/join");
  assert.equal(migrated(base+"/account?recover").changed.target,"/recover");
  assert.equal(migrated(base+"/account/#welcome-title").changed.target,"/onboarding");
  assert.equal(normalizeSiteRoute("/profiles/",base),"/matches");
});

test("direct clean routes and normal document anchors aren't rewritten",()=>{
  for(const url of ["https://ogcupid.com/matches","https://ogcupid.com/sitemap",
    "https://ogcupid.com/privacy#scope","https://ogcupid.com/account"]){
    assert.equal(migrated(url).result,null);
    assert.equal(migrated(url).changed,null);
  }
  assert.equal(migrated("https://ogcupid.com/ogtrends/zero/").changed.target,"/ogtrends/zero");
});

test("legacy migration cannot become an external redirect or invent profile paths",()=>{
  const origin="https://ogcupid.com";
  for(const route of ["//evil.com/path","https://evil.com","/..\\evil",
    "/profiles/../../admin","/profiles/%2fetc","/profiles/invalid.name",
    "/messages/not-a-uuid"]){
    assert.equal(normalizeSiteRoute(route,origin),null,route);
    const fallback=migrated(origin+"/?__ogc_route="+encodeURIComponent(route));
    assert.equal(fallback.changed.target,"/not-found");
  }
  assert.equal(normalizeSiteRoute("/admin",origin),"/admin");
});


test("staging preview keeps its /ogc-l/ base for direct and saved hash routes",()=>{
  const location=new URL("https://ogcupid.com/ogc-l/#/matches");
  let path=null;
  const browser={location,history:{state:null,replaceState(_s,_t,p){path=p;}}};
  migrateBrowserLocation(browser,"/ogc-l/");
  assert.equal(path,"/ogc-l/matches");
  const fallback=new URL("https://ogcupid.com/ogc-l/?__ogc_route="+
    encodeURIComponent("/profiles/river-riley"));
  const stage={location:fallback,history:{state:null,replaceState(_s,_t,p){path=p;}}};
  migrateBrowserLocation(stage,"/ogc-l/");
  assert.equal(path,"/ogc-l/profiles/river-riley");
});
