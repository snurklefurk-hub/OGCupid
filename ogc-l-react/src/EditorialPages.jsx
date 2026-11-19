import React,{useEffect,useRef,useState} from "react";
import {NavLink,useNavigate} from "react-router-dom";
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

export function EmbeddedEditorial({pageKey,onboarding=false}){
  const page=EDITORIAL_PAGES[pageKey];
  const host=useRef(null);
  const navigate=useNavigate();
  const {refresh}=useMemberSession();
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let disposed=false;
    const click=event=>{
      const anchor=event.target?.closest?.("a[href]");
      if(!anchor||event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey)return;
      try{const route=inSiteRoute(new URL(anchor.href,window.location.href));if(route){event.preventDefault();navigate(route);}}catch{}
    };
    const load=async()=>{
      try{
        const response=await fetch(page.path+(page.path.includes("?")?"&":"?")+"ogcl_embed=1"+(onboarding?"&onboarding=1":""),{credentials:"same-origin"});
        if(!response.ok)throw new Error();
        const parsed=new DOMParser().parseFromString(await response.text(),"text/html");
        if(disposed||!host.current)return;
        host.current.replaceChildren(...Array.from(parsed.body.childNodes).map(node=>document.importNode(node,true)));
        host.current.addEventListener("click",click);
        for(const source of parsed.querySelectorAll("script")){
          const script=document.createElement("script");
          if(source.src)script.src=source.src;else script.textContent=source.textContent;
          host.current.appendChild(script);
        }
        setReady(true);
      }catch{if(!disposed)setError("This page could not load.");}
    };
    void load();
    return()=>{disposed=true;host.current?.removeEventListener("click",click);};
  },[page.path,onboarding,navigate]);
  useEffect(()=>{
    const handler=event=>{
      if(event.origin!==window.location.origin)return;
      if(event.data?.type==="ogc:persona-saved"){
        void refresh().then(()=>navigate("/onboarding"));
      }
      if(event.data?.type==="ogc:persona-auth-required"){
        navigate(event.data.reason==="onboarding"?"/onboarding":"/signin");
      }
    };
    window.addEventListener("message",handler);
    return()=>window.removeEventListener("message",handler);
  },[navigate,refresh]);
  if(!page)return null;
  const breadcrumb=pageKey==="persona"?"/onboarding":pageKey==="zero"||pageKey==="perfect-profile"||pageKey==="references"?"/ogtrends":"/matches";
  return <section className="ogcl-view ogcl-editorial" aria-label={page.title}>
    <div className="ogcl-editorial-bar">
      <NavLink to={breadcrumb}>← {breadcrumb==="/ogtrends"?"Back to OgTrends":pageKey==="persona"?"Back to profile setup":"Back to OG Cupid"}</NavLink>
      <span>{page.section} · {page.title}</span>
      <a href={page.path} title="Open the canonical page outside the member shell">Open full page</a>
    </div>
    {error&&<p className="ogcl-error" role="alert">{error} <a href={page.path}>Open full page</a></p>}
    {!ready&&!error&&<p role="status" className="ogcl-editorial-status">Loading {page.title}…</p>}
    <div ref={host} className="ogcl-editorial-native" aria-label={page.title}/>
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
  return <EmbeddedEditorial pageKey="persona" onboarding={kind==="onboarding"}/>;
}
