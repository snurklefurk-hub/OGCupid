import React,{useEffect,useMemo,useState} from "react";
import {useLocation} from "react-router-dom";
import "./published-ui-design.css";
import {
  EDITOR_PAGES,EDITOR_TEXT_TARGETS,editorStyleEntries,editorStyleValue,EDITOR_LINK_ROUTES,
  editorTextTarget,editorPreviewCss,sanitizeEditorDraft
} from "./admin-ui-editor-model.mjs";

// The public endpoint returns ONLY a released, schema-validated design.
// The UI never evaluates arbitrary CSS, HTML, scripts, selectors or links.
const apiOrigin=()=>{
  try{
    const value=import.meta.env.VITE_OGC_MEMBER_API_URL;
    return value?new URL(value).origin:null;
  }catch{return null;}
};
const allowedPages=new Set(EDITOR_PAGES.map(p=>p.path));
const validRelease=data=>data&&typeof data==="object"?
  {revision:data.revision,document:sanitizeEditorDraft(data.document)}:null;

function makeBlock(block){
  const tags={heading:"h2",paragraph:"p",notice:"div",divider:"hr",button:"button"};
  const linked=block.type==="button"&&EDITOR_LINK_ROUTES.some(route=>route.path===block.href);
  const el=document.createElement(linked?"a":tags[block.type]||"p");
  el.className="ogcl-editor-preview-block ogcl-editor-preview-"+block.type;
  if(block.type==="button"){
    if(linked)el.setAttribute("href","#"+block.href);
    else{
      // A draft cannot invent a URL or arbitrary JS handler.
      el.type="button";el.disabled=true;el.title="No action configured";
    }
  }
  if(block.type!=="divider")el.textContent=block.text;
  for(const [key,value] of editorStyleEntries(block.style))el.style[key]=editorStyleValue(value);
  return el;
}
function updatePublishedDom(design,page){
  const root=window.document.querySelector(".ogcl-app");
  if(!root)return;
  for(const target of EDITOR_TEXT_TARGETS){
    const textPage=target.route==="/messages"&&page.startsWith("/messages/")?"/messages":page;
    if(!editorTextTarget(target.id,textPage))continue;
    const scope=target.scope==="shell"?"*":textPage;
    for(const element of root.querySelectorAll(target.selector)){
    if(!element||element.children.length)continue;
    // Store the React source label once so removing a published override
    // restores the original without requiring a full reload.
    if(!element.hasAttribute("data-ogc-original-published-text"))
      element.setAttribute("data-ogc-original-published-text",(target.attribute?element.getAttribute(target.attribute):element.textContent)||"");
    const value=design.texts?.[scope]?.[target.id]??
      element.getAttribute("data-ogc-original-published-text");
    if(target.attribute){if(element.getAttribute(target.attribute)!==value)element.setAttribute(target.attribute,value);}
    else if(element.textContent!==value)element.textContent=value;
    }
    // Never innerHTML or member-owned content.
  }
  const view=allowedPages.has(page)?root.querySelector(".ogcl-sheet .ogcl-view"):null;
  if(!view)return;
  const blocks=(design.pages?.[page]||[]).filter(block=>!block.hidden);
  let region=view.querySelector("[data-ogc-published-blocks]");
  if(!blocks.length){region?.remove();return;}
  if(!region){
    region=window.document.createElement("section");
    region.className="ogcl-editor-preview-region ogcl-published-region";
    region.setAttribute("data-ogc-published-blocks",page);
    const head=view.querySelector(".ogcl-view-head");
    if(head)head.insertAdjacentElement("afterend",region);
    else view.prepend(region);
  }
  const signature=JSON.stringify(blocks);
  if(region.dataset.snapshot!==signature){
    region.replaceChildren(...blocks.map(makeBlock));
    region.dataset.snapshot=signature;
  }
}

export default function PublishedUiDesign(){
  const {pathname}=useLocation();
  const [release,setRelease]=useState(null);
  // Editor previews supply an explicit query marker so draft overlays do not
  // fight a MutationObserver on the public published design.
  const isEditorPreview=new URLSearchParams(window.location.search).has("ogc-ui-preview");
  useEffect(()=>{
    if(isEditorPreview)return;
    const origin=apiOrigin();
    if(!origin)return;
    let active=true;
    const load=async()=>{
      try{
        const response=await fetch(origin+"/ui-design",{method:"GET",cache:"no-store",
          credentials:"omit",headers:{Accept:"application/json"}});
        if(!response.ok)return;
        const body=await response.json();
        if(active&&body?.data)setRelease(validRelease(body.data));
      }catch{/* Network loss leaves built-in visual defaults intact. */}
    };
    void load();
    window.addEventListener("ogc-design-published",load);
    return()=>{active=false;window.removeEventListener("ogc-design-published",load);};
  },[isEditorPreview]);
  const page=pathname;
  const css=useMemo(()=>{
    if(!release)return "";
    const document=release.document;
    // The sitewide shell applies even on pages not present in the editor's
    // per-page allowlist; unknown routes receive NO page-level overrides.
    const scoped=allowedPages.has(page)?document:{
      ...document,areas:{"*":document.areas?.["*"]||{}}
    };
    return editorPreviewCss(scoped,allowedPages.has(page)?page:"/matches");
  },[release,page]);
  useEffect(()=>{
    if(!release||isEditorPreview)return;
    const root=document.querySelector(".ogcl-app");
    if(!root)return;
    let scheduled=0;
    const apply=()=>{scheduled=0;updatePublishedDom(release.document,page);};
    const observer=new MutationObserver(()=>{
      if(!scheduled)scheduled=window.requestAnimationFrame(apply);
    });
    observer.observe(root,{subtree:true,childList:true,characterData:true});
    apply();
    return()=>{observer.disconnect();if(scheduled)window.cancelAnimationFrame(scheduled);};
  },[release,page,isEditorPreview]);
  return css?<style id="ogcl-published-design">{css}</style>:null;
}
