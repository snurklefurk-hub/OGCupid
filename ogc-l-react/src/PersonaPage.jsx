import React,{useEffect,useMemo,useRef,useState} from "react";
import {NavLink,useSearchParams} from "react-router-dom";
import {legacyHref} from "./legacy-links.mjs";
import "./editorial.css";

// Keep the actual owner-curated 40-question quiz engine, historical result
// writeups, 32 type catalog, artwork and original scoring unchanged. It runs
// in a same-origin frame stripped of duplicate navigation, within React's
// normal three-column site shell. Rewriting the scoring from scratch here
// would risk silent changes to members' results.
export default function PersonaPage(){
  const [params]=useSearchParams();
  const frame=useRef(null);
  const [loading,setLoading]=useState(true);
  const [height,setHeight]=useState(1150);
  const src=useMemo(()=>{
    const legacy=new URLSearchParams({embedded:"1"});
    for(const key of ["persona","style","onboarding"]){
      const value=params.get(key);
      if(value&&value.length<=70)legacy.set(key,value);
    }
    return legacyHref("/account/persona.html?"+legacy.toString());
  },[params.toString()]);
  useEffect(()=>{
    const oldTitle=document.title;document.title="The Dating Persona Test | OG Cupid";
    return()=>{document.title=oldTitle;};
  },[]);
  useEffect(()=>{
    const node=frame.current;
    if(!node)return;
    let observer=null,interval=null;
    const onLoad=()=>{
      setLoading(false);
      try{
        const doc=node.contentDocument;
        if(!doc||!doc.body)return;
        const resize=()=>{
          const content=doc.querySelector(".standalone-quiz")||doc.body;
          const next=Math.max(600,Math.ceil(content.getBoundingClientRect().height)+35);
          setHeight(Math.min(next,7500));
        };
        resize();
        observer=new ResizeObserver(resize);
        observer.observe(doc.body);
        const content=doc.querySelector(".standalone-quiz");
        if(content)observer.observe(content);
        interval=setInterval(resize,800);
      }catch{
        // Cross-origin preview fallbacks retain internal frame scrollbars.
        setHeight(1250);
      }
    };
    node.addEventListener("load",onLoad);
    if(node.contentDocument?.readyState==="complete")onLoad();
    return()=>{
      node.removeEventListener("load",onLoad);
      observer?.disconnect();
      if(interval)clearInterval(interval);
    };
  },[src]);
  return <section className="ogcl-view ogcl-editorial-page ogcl-persona-wrapper">
    <header className="ogcl-view-head">
      <h1>The Dating Persona Test</h1>
      <p>Forty questions. Four classic dimensions. Thirty-two gloriously opinionated dating types.</p>
    </header>
    <div className="ogcl-persona-intro">
      <NavLink to="/matches">Matches</NavLink> · <NavLink to="/questions">Match Questions</NavLink>
      {" · "}<NavLink to="/onboarding">Onboarding status</NavLink>
      <p>The test retains its original questions and result descriptions. All test controls are below.</p>
    </div>
    {loading&&<p className="ogcl-persona-intro" role="status">Loading the Dating Persona Test…</p>}
    <iframe ref={frame} className="ogcl-persona-frame"
      src={src} title="Dating Persona Test — questions, answers and results"
      referrerPolicy="no-referrer" allow="clipboard-write"
      scrolling="auto" style={{height:height+"px"}}/>
    <footer className="ogcl-editorial-footer">
      <p>Results are comic archetypes, not diagnoses or compatibility guarantees.</p>
      <nav><NavLink to="/questions">Answer Match Questions</NavLink>
        <NavLink to="/ogtrends">Read OgTrends</NavLink></nav>
    </footer>
  </section>;
}
