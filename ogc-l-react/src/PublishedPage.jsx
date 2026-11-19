import React,{useEffect,useMemo,useRef} from "react";
import {useLocation,useParams} from "react-router-dom";
import {reactPathForLegacy} from "./editorial-routes.mjs";
import trendsHtml from "../../public/ogtrends/index.html?raw";
import zeroHtml from "../../public/ogtrends/zero/index.html?raw";
import perfectHtml from "../../public/ogtrends/perfect-profile/index.html?raw";
import referencesHtml from "../../public/ogtrends/references/index.html?raw";
import contactHtml from "../../public/contact/index.html?raw";
import privacyHtml from "../../public/privacy/index.html?raw";
import termsHtml from "../../public/terms/index.html?raw";
import profileShowcaseUrl from "../../public/profile-showcase.js?url";
import "./editorial.css";

// The original owner-edited HTML is our single editorial and legal source.
// Only the content, not its separate legacy header/footer/scripts, is included.
// No author prose, quotations, bylines, links, legal wording or charts are
// paraphrased or independently recreated by this React renderer.
export const LEGACY_PUBLIC_PAGES=Object.freeze({
  ogtrends:Object.freeze({title:"OgTrends: Dating, dissected",html:trendsHtml,origin:"/ogtrends/",kind:"article"}),
  "ogtrends/zero":Object.freeze({title:"OgTrends #0: The Big Idea",html:zeroHtml,origin:"/ogtrends/zero/",kind:"article"}),
  "ogtrends/perfect-profile":Object.freeze({title:"The Perfect Dating Profile: Why Everything We Know Might Be Wrong",html:perfectHtml,origin:"/ogtrends/perfect-profile/",kind:"article"}),
  "ogtrends/references":Object.freeze({title:"Your Ex Has Entered the Chat: Can Dating References Make Profiles More Honest?",html:referencesHtml,origin:"/ogtrends/references/",kind:"article"}),
  contact:Object.freeze({title:"Contact",html:contactHtml,origin:"/contact/",kind:"legal"}),
  privacy:Object.freeze({title:"Privacy Policy",html:privacyHtml,origin:"/privacy/",kind:"legal"}),
  terms:Object.freeze({title:"Terms & Conditions",html:termsHtml,origin:"/terms/",kind:"legal"})
});


export function extractPublishedContent(source,origin){
  if(typeof DOMParser==="undefined")throw Error("This browser cannot display the original article.");
  const document=new DOMParser().parseFromString(source,"text/html");
  const main=document.querySelector("main#main");
  if(!main)throw Error("The original page has no published content.");
  const hero=document.querySelector(".main-column .panel > .mast, .main-column .panel > .hero");
  const container=document.createElement("div");
  if(hero)container.append(hero.cloneNode(true));
  container.append(main.cloneNode(true));
  // Article sources are committed repository HTML, never member-supplied text.
  // Restrict executable elements and attributes defensively before insertion.
  container.querySelectorAll("script,iframe,object,embed,form,style,link,meta").forEach(n=>n.remove());
  for(const node of container.querySelectorAll("*")){
    for(const attr of Array.from(node.attributes)){
      if(/^on/i.test(attr.name)||attr.name==="srcdoc")node.removeAttribute(attr.name);
      if(["href","src","xlink:href"].includes(attr.name)&&
          /^(?:javascript|data|vbscript):/i.test(attr.value.trim()))
        node.removeAttribute(attr.name);
    }
  }
  for(const link of container.querySelectorAll("a[href]")){
    const href=link.getAttribute("href");
    if(href.startsWith("#"))continue; // Handled by scoped in-page scroll.
    const target=reactPathForLegacy(href);
    if(target)link.setAttribute("href",target);
    else if(href.startsWith("http")){
      link.setAttribute("rel","noopener noreferrer");
    }
  }
  // Preserve source semantic sections, citations, figures and source notes.
  return container.innerHTML;
}

function usePublishedTitle(title){
  useEffect(()=>{
    const prior=document.title;
    document.title=title+" | OG Cupid";
    return()=>{document.title=prior;};
  },[title]);
}

export default function PublishedPage({page}){
  const meta=LEGACY_PUBLIC_PAGES[page];
  const root=useRef(null);
  const location=useLocation();
  if(!meta)return <section className="ogcl-view" role="alert">This page is not available.</section>;
  const html=useMemo(()=>extractPublishedContent(meta.html,meta.origin),[meta]);
  usePublishedTitle(meta.title);

  useEffect(()=>{
    const param=new URLSearchParams(location.search).get("section");
    if(param&&/^[A-Za-z0-9_-]{1,100}$/.test(param)){
      requestAnimationFrame(()=>root.current?.querySelector("[id='"+param+"']")?.scrollIntoView({block:"start"}));
    }
  },[page,location.search]);

  useEffect(()=>{
    if(page!=="ogtrends/references")return;
    if(typeof customElements==="undefined"||customElements.get("og-profile-showcase"))return;
    if(document.querySelector("script[data-ogcl-profile-showcase]"))return;
    const script=document.createElement("script");
    script.src=profileShowcaseUrl;script.async=true;script.dataset.ogclProfileShowcase="true";
    document.head.append(script);
  },[page]);

  function followLink(event){
    const anchor=event.target.closest?.("a[href]");
    if(!anchor||!root.current?.contains(anchor))return;
    const href=anchor.getAttribute("href")||"";
    if(!href.startsWith("#")||href.length<=1)return;
    const id=href.slice(1);
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return;
    const target=root.current.querySelector("[id='"+id+"']");
    if(!target)return;
    event.preventDefault();
    target.scrollIntoView({block:"start",behavior:"smooth"});
    target.setAttribute("tabindex","-1");
    target.focus({preventScroll:true});
  }
  return <section className={"ogcl-view ogcl-editorial-page ogcl-editorial-"+meta.kind}
      aria-label={meta.title}>
    <div className="ogcl-editorial-breadcrumb">
      <a href="/#/matches">OG Cupid</a><span aria-hidden="true"> › </span>
      {page.startsWith("ogtrends/")&&<><a href="/#/ogtrends">OgTrends</a><span aria-hidden="true"> › </span></>}
      <strong>{meta.title}</strong>
    </div>
    <div ref={root} className="ogcl-published-content"
      dangerouslySetInnerHTML={{__html:html}} onClick={followLink}/>
    <footer className="ogcl-editorial-footer">
      <span>Independent project. Not affiliated with OkCupid or Match Group.</span>
      <nav aria-label="Public information">
        <a href="/#/ogtrends">OgTrends</a>
        <a href="/#/contact">Contact</a>
        <a href="/#/privacy">Privacy</a>
        <a href="/#/terms">Terms</a>
      </nav>
    </footer>
  </section>;
}
