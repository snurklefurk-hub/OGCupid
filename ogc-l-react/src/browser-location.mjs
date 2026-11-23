// Convert the historical /#/route links and the static-host 404 fallback
// BEFORE BrowserRouter reads window.location. All navigation remains same-origin.
// The 404 fallback passes only an encoded pathname/query/fragment in this param.
import {SITEMAP_PATHS} from "./sitemap-pages.mjs";

export const ROUTE_RECOVERY_PARAM="__ogc_route";
const canonical=new Set([...SITEMAP_PATHS,"/","/not-found"]);
const profilePattern=/^\/profiles\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const threadPattern=/^\/messages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oldProfileTabs=new Set(["photos","questions","personality"]);
const accountAnchors=Object.freeze({
  "#welcome-title":"/onboarding","#member-title":"/matches",
  "#profile-title":"/profile","#photos-title":"/photos",
  "#question-title":"/questions","#questions-title":"/questions",
  "#settings-title":"/account","#preview-title":"/profile"
});

export function normalizeSiteRoute(raw,origin){
  if(typeof raw!=="string"||raw.length>4096||!raw.startsWith("/")||
     raw.startsWith("//")||raw.includes("\\")||/[\u0000-\u001f]/.test(raw))return null;
  const givenPath=raw.split(/[?#]/,1)[0];
  if(/%2f|%5c/i.test(givenPath)||/(^|\/)\.\.?(\/|$)/.test(givenPath))return null;
  let parsed;
  try{parsed=new URL(raw,origin);}catch{return null;}
  if(parsed.origin!==origin)return null;
  let pathname=parsed.pathname.replace(/\/+$/,"")||"/";
  if(pathname==="/quiz"||pathname==="/account/persona.html")pathname="/persona";
  if(pathname==="/profiles")pathname="/matches";
  if(!canonical.has(pathname)&&!profilePattern.test(pathname)&&!threadPattern.test(pathname))
    return null;
  const search=new URLSearchParams(parsed.search);
  if(pathname==="/account"){
    if(search.get("join")==="1")return "/join";
    if(search.has("recover"))return "/recover";
    if(accountAnchors[parsed.hash.toLowerCase()])
      return accountAnchors[parsed.hash.toLowerCase()];
  }
  // Old profile bookmark anchors named a tab rather than a document section.
  // Translate them to the existing ?tab= query, preserving all other params.
  let fragment=parsed.hash;
  if(profilePattern.test(pathname)&&oldProfileTabs.has(fragment.slice(1).toLowerCase())){
    if(!search.has("tab"))search.set("tab",fragment.slice(1).toLowerCase());
    fragment="";
  }
  const query=search.toString();
  return pathname+(query?"?"+query:"")+fragment;
}

export function migrateBrowserLocation(browser,basename="/"){
  const {location,history}=browser;
  const base=basename==="/"?"":
    "/"+String(basename).replace(/^\/+|\/+$/g,"");
  const localPath=base&&(location.pathname===base||
    location.pathname.startsWith(base+"/"))?
      location.pathname.slice(base.length)||"/":location.pathname;
  const params=new URLSearchParams(location.search);
  let target=null;
  if(params.has(ROUTE_RECOVERY_PARAM)){
    target=normalizeSiteRoute(params.get(ROUTE_RECOVERY_PARAM),location.origin)||"/not-found";
  }else if(location.hash.startsWith("#/")){
    target=normalizeSiteRoute(location.hash.slice(1),location.origin)||"/not-found";
  }else{
    const candidate=localPath+location.search+location.hash;
    // Preserve ordinary legal/document anchors such as #scope.
    const oldAccount=localPath.replace(/\/+$/,"")==="/account"&&
      (params.has("join")||params.has("recover")||
       Object.hasOwn(accountAnchors,location.hash.toLowerCase()));
    const oldProfile=profilePattern.test(localPath.replace(/\/+$/,""))&&
      oldProfileTabs.has(location.hash.slice(1).toLowerCase());
    if(oldAccount||oldProfile||localPath.length>1&&localPath.endsWith("/")){
      target=normalizeSiteRoute(candidate,location.origin);
    }
  }
  if(target!==null&&base)target=base+(target==="/"?"/":target);
  if(target!==null&&target!==location.pathname+location.search+location.hash)
    history.replaceState(history.state,"",target);
  return target;
}
