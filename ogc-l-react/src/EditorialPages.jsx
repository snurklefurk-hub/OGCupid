import React,{useCallback,useEffect,useRef,useState} from "react";
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
  const frame=useRef(null),observer=useRef(null);
  const navigate=useNavigate();
  const {refresh}=useMemberSession();
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  const [height,setHeight]=useState(720);
  const measure=useCallback(()=>{
    const doc=frame.current?.contentDocument;
    if(!doc)return;
    // The CSS removes viewport-height wrappers; this is one scrollable app,
    // not a nested 2-scrollbar iframe.
    const next=Math.ceil(Math.max(
      doc.body?.scrollHeight||0,doc.documentElement?.scrollHeight||0,
      doc.body?.offsetHeight||0,360
    ));
    if(Number.isFinite(next)&&next>0&&next<250000)
      setHeight(previous=>Math.abs(previous-next)>3?next:previous);
  },[]);
  const mounted=useCallback(()=>{
    const el=frame.current;
    const doc=el?.contentDocument;
    if(!doc){setError("This page couldn't be embedded safely. Open the original page instead.");return;}
    observer.current?.disconnect();
    const link=doc.createElement("link");
    link.rel="stylesheet";link.href="/ogcl-embedded.css";
    link.dataset.ogclEmbed="true";
    if(!doc.querySelector('[data-ogcl-embed="true"]'))doc.head.appendChild(link);
    doc.documentElement.classList.add("ogcl-embed");
    doc.body?.classList.add("ogcl-embed");
    const goLink=event=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
      const anchor=event.target?.closest?.("a[href]");
      if(!anchor||anchor.hasAttribute("download")||(anchor.target&&anchor.target!=="_self"))return;
      let target;
      try{target=new URL(anchor.href,el.contentWindow.location.href);}catch{return;}
      if(target.pathname===el.contentWindow.location.pathname && target.hash&&target.hash!=="#"){
        // Legal TOCs and research footnotes must scroll the ONE React page,
        // not an invisible scrollport inside a full-height iframe.
        let destination=null;
        try{destination=doc.getElementById(decodeURIComponent(target.hash.slice(1)));}catch{}
        if(destination){
          event.preventDefault();
          // Editorial pages still render in same-origin iframes during the
          // React migration. The viewport, not the center column, now scrolls.
          const top=window.scrollY+el.getBoundingClientRect().top+
            destination.getBoundingClientRect().top-12;
          window.scrollTo({top:Math.max(0,top),behavior:"smooth"});
        }
        return;
      }
      const route=inSiteRoute(target);
      if(route){event.preventDefault();navigate(route);}
    };
    doc.addEventListener("click",goLink,true);
    if(typeof ResizeObserver!=="undefined"){
      observer.current=new ResizeObserver(()=>measure());
      if(doc.body)observer.current.observe(doc.body);
      if(doc.querySelector(".main-column"))observer.current.observe(doc.querySelector(".main-column"));
    }
    link.addEventListener("load",measure,{once:true});
    el.contentWindow?.addEventListener("load",measure,{once:true});
    requestAnimationFrame(measure);
    setReady(true);setError("");
    return ()=>doc.removeEventListener("click",goLink,true);
  },[navigate,measure]);
  useEffect(()=>{
    const handler=event=>{
      if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;
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
  useEffect(()=>()=>{
    observer.current?.disconnect();
  },[pageKey]);
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
    <iframe ref={frame} title={page.title} className="ogcl-editorial-frame"
      src={page.path+(page.path.includes("?")?"&":"?")+"ogcl_embed=1"+(onboarding?"&onboarding=1":"")}
      loading="eager" onLoad={mounted} style={{height:height+"px"}}/>
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
