import React,{useEffect} from "react";
import {NavLink,useLocation} from "react-router-dom";
import PersonaQuiz from "./PersonaQuiz.jsx";
import {editorialContent} from "./EditorialContent.jsx";
import {useMemberSession} from "./MemberSessionProvider.jsx";
import "./editorial.css";

// Published HTML remains authoritative, indexed at its canonical URL.
// The React member shell hosts that existing content without duplicating it,
// losing legal wording, rewriting research, or replacing recovered Persona art.
export const EDITORIAL_PAGES=Object.freeze({
  ogtrends:{title:"OgTrends",path:"/ogtrends/",section:"Research and writing"},
  zero:{title:"OgTrends #0: The Big Idea",path:"/ogtrends/zero/",section:"OgTrends"},
  "perfect-profile":{title:"The Perfect Dating Profile",path:"/ogtrends/perfect-profile/",section:"OgTrends"},
  references:{title:"Dating References",path:"/ogtrends/references/",section:"OgTrends"},
  privacy:{title:"Privacy Policy",path:"/privacy/",section:"About OG Cupid"},
  terms:{title:"Terms & Conditions",path:"/terms/",section:"About OG Cupid"},
  contact:{title:"Contact",path:"/contact/",section:"About OG Cupid"},
  persona:{title:"The Dating Persona Test",path:"/account/persona.html",section:"Personality"}
});
const editorialRoutes=new Map([
  ["/ogtrends/","/ogtrends"],["/ogtrends/zero/","/ogtrends/zero"],
  ["/ogtrends/perfect-profile/","/ogtrends/perfect-profile"],
  ["/ogtrends/references/","/ogtrends/references"],
  ["/privacy/","/privacy"],["/terms/","/terms"],["/contact/","/contact"],
  ["/quiz/","/persona"],["/quiz","/persona"],
  ["/account/persona.html","/persona"]
]);
export function inSiteRoute(url){
  if(!(url instanceof URL)||url.origin!==window.location.origin)return null;
  const path=url.pathname.endsWith("/")?url.pathname:url.pathname+"/";
  if(editorialRoutes.has(path))return editorialRoutes.get(path);
  if(editorialRoutes.has(url.pathname))return editorialRoutes.get(url.pathname);
  if(path==="/questions/")return "/questions";
  if(path==="/account/"){
    const h=url.hash.toLowerCase();
    if(url.searchParams.get("join")==="1")return "/join";
    if(url.searchParams.has("recover"))return "/recover";
    if(h==="#welcome-title")return "/onboarding";
    if(h==="#photos-title")return "/photos";
    if(h==="#questions-title")return "/questions";
    return "/signin";
  }
  if(path==="/")return url.hash.startsWith("#/")?url.hash.slice(1):"/matches";
  if(/^\/profiles\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path))
    return "/profiles/"+path.split("/")[2];
  return null;
}

export function EmbeddedEditorial({pageKey}){
  const page=EDITORIAL_PAGES[pageKey];
  const {hash}=useLocation();
  useEffect(()=>{
    if(!hash)return;
    try{document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();}catch{}
  },[pageKey,hash]);
  return <section className="ogcl-view ogcl-editorial" aria-label={page.title}>
    <div className="ogcl-content-panel">{editorialContent[pageKey]}</div>
  </section>;
}


export function PersonaRoute(){
  const {kind,onboarding}=useMemberSession();
  if(kind==="checking")return <section className="ogcl-view"><p role="status">Checking your member account…</p></section>;
  if(kind==="guest")return <section className="ogcl-view ogcl-persona-gate">
    <header className="ogcl-view-head"><h1>The Dating Persona Test</h1><p>40 questions. 32 memorable results.</p></header>
    <div className="ogcl-content-panel"><p>This test is available to signed-in OG Cupid members.</p>
      <p><NavLink to="/signin">Sign in</NavLink> · <NavLink to="/join">Create an account</NavLink></p></div>
  </section>;
  if(kind==="onboarding"&&!onboarding?.photo)return <section className="ogcl-view ogcl-persona-gate">
    <header className="ogcl-view-head"><h1>The Dating Persona Test</h1></header>
    <div className="ogcl-content-panel"><p>Confirm your main profile photo first. Then you can take the Persona Test as your personality-question onboarding path.</p>
      <NavLink to="/onboarding">Continue onboarding</NavLink></div>
  </section>;
  if(kind!=="member"&&kind!=="onboarding")return <section className="ogcl-view"><p>Member status couldn't be confirmed. <NavLink to="/signin">Sign in again</NavLink>.</p></section>;
  return <PersonaQuiz onboarding={kind==="onboarding"}/>;
}
